/* =========================================================================
   🗣 오늘의 표현 - 물류/비즈니스 영어 + 일상 영어 표현을 하루에 하나씩,
   퀴즈 형태로 재미있게 보여주는 기능이에요.

   - 날짜 기준으로 팀원 전체가 "오늘의 표현"을 똑같이 보게 돼요 (날짜 계산만
     하고 별도 서버 호출 없어서, 뉴스 기능과 달리 매일 AI를 부르지 않아요 -
     그래서 안 깨져요).
   - "🔀 다른 표현 보기"로 심심할 때 계속 넘겨보면서 연습할 수 있어요.
   - "🔊 듣기"는 브라우저 자체 음성 합성(Web Speech API)을 써서 실제 영어
     발음을 들려줘요 - 별도 API 키나 비용 없이 무료로 작동해요.
   - 처음엔 100개(비즈니스/물류 50 + 일상 50)로 시작하고, Firestore에 저장
     해뒀으니 "⚙️ 관리"에서 팀원이 계속 추가할 수 있어요 (100개가 끝이 아님).
   ========================================================================= */
const DAILY_EXPR_COLLECTION = "daily_expressions"; // Firestore 컬렉션 이름

let DAILY_EXPR_LIST = [];
let dailyExprUnsubscribe = null;
let dailyExprCurrentId = null; // 지금 화면에 보여주고 있는 표현 id (오늘의 표현 또는 "다른 표현 보기"로 바뀐 것)
let dailyExprQuizAnswered = false; // 지금 표현에 대해 퀴즈를 이미 풀었는지
let dailyExprRecentIds = []; // "다른 표현 보기" 눌렀을 때 최근에 본 것 다시 안 나오게 기억 (짧은 큐)

const DAILY_EXPR_SEED_DATA = [
  { id: 1, category: "biz", english: "Please be advised that the vessel's ETA has been delayed by two days.", korean: "선박 도착 예정일이 이틀 지연되었음을 알려드립니다.", pron: "플리즈 비 어드바이즈드 댓 더 베슬스 이티에이 해즈 빈 딜레이드 바이 투 데이즈", example: "Please be advised that the vessel's ETA has been delayed by two days due to bad weather.", exampleKr: "기상 악화로 선박 도착 예정일이 이틀 지연되었음을 알려드립니다." },
  { id: 2, category: "biz", english: "Kindly arrange the payment at your earliest convenience.", korean: "가능한 빨리 결제를 진행해 주시기 바랍니다.", pron: "카인들리 어레인지 더 페이먼트 앳 유어 얼리스트 컨비니언스", example: "Kindly arrange the payment at your earliest convenience to avoid demurrage charges.", exampleKr: "체선료 발생을 막기 위해 가능한 빨리 결제를 진행해 주시기 바랍니다." },
  { id: 3, category: "biz", english: "We would appreciate it if you could expedite the shipment.", korean: "선적을 서둘러 주시면 감사하겠습니다.", pron: "위 우드 어프리시에잇 잇 이프 유 쿠드 익스피다이트 더 쉽먼트", example: "We would appreciate it if you could expedite the shipment as the customer needs it urgently.", exampleKr: "고객이 급하게 필요로 하니 선적을 서둘러 주시면 감사하겠습니다." },
  { id: 4, category: "biz", english: "Please find attached the Bill of Lading for your reference.", korean: "참고하실 수 있도록 선하증권을 첨부합니다.", pron: "플리즈 파인드 어태치드 더 빌 오브 레이딩 포 유어 레퍼런스", example: "Please find attached the Bill of Lading for your reference and customs clearance.", exampleKr: "참고 및 통관을 위해 선하증권을 첨부합니다." },
  { id: 5, category: "biz", english: "We regret to inform you that the vessel has been rescheduled.", korean: "선박 일정이 변경되었음을 유감스럽게 알려드립니다.", pron: "위 리그렛 투 인폼 유 댓 더 베슬 해즈 빈 리스케줄드", example: "We regret to inform you that the vessel has been rescheduled to next Monday.", exampleKr: "선박 일정이 다음 주 월요일로 변경되었음을 유감스럽게 알려드립니다." },
  { id: 6, category: "biz", english: "This shipment is subject to an additional documentation fee.", korean: "이번 선적 건은 추가 서류 수수료가 부과됩니다.", pron: "디스 쉽먼트 이즈 서브젝트 투 언 어디셔널 다큐멘테이션 피", example: "This shipment is subject to an additional documentation fee due to the late amendment.", exampleKr: "늦은 정정으로 인해 이번 선적 건은 추가 서류 수수료가 부과됩니다." },
  { id: 7, category: "biz", english: "Could you please confirm receipt of this email?", korean: "이 이메일을 받으셨는지 확인해 주시겠어요?", pron: "쿠드 유 플리즈 컨펌 리시트 오브 디스 이메일", example: "Could you please confirm receipt of this email at your earliest convenience?", exampleKr: "가능한 빨리 이 이메일을 받으셨는지 확인해 주시겠어요?" },
  { id: 8, category: "biz", english: "We kindly request an extension on the free time.", korean: "무료 보관 기간 연장을 요청드립니다.", pron: "위 카인들리 리퀘스트 언 익스텐션 온 더 프리 타임", example: "We kindly request an extension on the free time due to customs delay.", exampleKr: "통관 지연으로 무료 보관 기간 연장을 요청드립니다." },
  { id: 9, category: "biz", english: "Please note that the free time will expire on Friday.", korean: "무료 보관 기간이 금요일에 만료됨을 알려드립니다.", pron: "플리즈 노트 댓 더 프리 타임 윌 익스파이어 온 프라이데이", example: "Please note that the free time will expire on Friday, and demurrage will apply after that.", exampleKr: "무료 보관 기간이 금요일에 만료되며, 이후에는 체선료가 부과됩니다." },
  { id: 10, category: "biz", english: "The container is currently undergoing customs inspection.", korean: "해당 컨테이너는 현재 세관 검사 중입니다.", pron: "더 컨테이너 이즈 커런틀리 언더고잉 커스텀즈 인스펙션", example: "The container is currently undergoing customs inspection and may be delayed by a day.", exampleKr: "해당 컨테이너는 현재 세관 검사 중이며 하루 정도 지연될 수 있습니다." },
  { id: 11, category: "biz", english: "We apologize for any inconvenience this may cause.", korean: "이로 인한 불편에 대해 사과드립니다.", pron: "위 어팔러자이즈 포 애니 인컨비니언스 디스 메이 코즈", example: "We apologize for any inconvenience this may cause and appreciate your understanding.", exampleKr: "이로 인한 불편에 대해 사과드리며 양해 부탁드립니다." },
  { id: 12, category: "biz", english: "Please let us know if you require any further assistance.", korean: "추가로 도움이 필요하시면 말씀해 주세요.", pron: "플리즈 렛 어스 노우 이프 유 리콰이어 애니 퍼더 어시스턴스", example: "Please let us know if you require any further assistance with the booking.", exampleKr: "예약 관련해서 추가로 도움이 필요하시면 말씀해 주세요." },
  { id: 13, category: "biz", english: "The vessel is scheduled to depart on the 15th.", korean: "선박은 15일에 출항할 예정입니다.", pron: "더 베슬 이즈 스케줄드 투 디파트 온 더 피프틴스", example: "The vessel is scheduled to depart on the 15th, weather permitting.", exampleKr: "날씨가 괜찮다면 선박은 15일에 출항할 예정입니다." },
  { id: 14, category: "biz", english: "We would like to request a rate quotation for this route.", korean: "이 항로에 대한 운임 견적을 요청드립니다.", pron: "위 우드 라이크 투 리퀘스트 어 레이트 쿼테이션 포 디스 라우트", example: "We would like to request a rate quotation for this route for the next quarter.", exampleKr: "다음 분기를 위해 이 항로에 대한 운임 견적을 요청드립니다." },
  { id: 15, category: "biz", english: "Please be informed that demurrage charges will apply.", korean: "체선료가 부과될 예정임을 알려드립니다.", pron: "플리즈 비 인폼드 댓 디머리지 차지스 윌 어플라이", example: "Please be informed that demurrage charges will apply if the container is not returned in time.", exampleKr: "컨테이너가 제때 반납되지 않으면 체선료가 부과될 예정임을 알려드립니다." },
  { id: 16, category: "biz", english: "We look forward to your prompt reply.", korean: "빠른 답변 기다리겠습니다.", pron: "위 룩 포워드 투 유어 프롬트 리플라이", example: "We look forward to your prompt reply so we can proceed accordingly.", exampleKr: "이에 따라 진행할 수 있도록 빠른 답변 기다리겠습니다." },
  { id: 17, category: "biz", english: "Thank you for your patience regarding this matter.", korean: "이 건에 대해 기다려 주셔서 감사합니다.", pron: "땡큐 포 유어 페이션스 리가딩 디스 매터", example: "Thank you for your patience regarding this matter; we will update you shortly.", exampleKr: "이 건에 대해 기다려 주셔서 감사하며, 곧 다시 안내드리겠습니다." },
  { id: 18, category: "biz", english: "Could you please double-check the consignee information?", korean: "수하인 정보를 다시 한 번 확인해 주시겠어요?", pron: "쿠드 유 플리즈 더블체크 더 컨사이니 인포메이션", example: "Could you please double-check the consignee information before we issue the B/L?", exampleKr: "선하증권 발행 전에 수하인 정보를 다시 한 번 확인해 주시겠어요?" },
  { id: 19, category: "biz", english: "The cargo has been released from customs.", korean: "화물이 세관에서 반출되었습니다.", pron: "더 카고 해즈 빈 릴리스드 프롬 커스텀즈", example: "The cargo has been released from customs and is ready for pickup.", exampleKr: "화물이 세관에서 반출되어 수령 가능합니다." },
  { id: 20, category: "biz", english: "Please provide the correct HS code for this item.", korean: "이 품목의 정확한 HS코드를 알려주세요.", pron: "플리즈 프로바이드 더 커렉트 에이치에스 코드 포 디스 아이템", example: "Please provide the correct HS code for this item to avoid customs delay.", exampleKr: "통관 지연을 막기 위해 이 품목의 정확한 HS코드를 알려주세요." },
  { id: 21, category: "biz", english: "We sincerely apologize for the delay in our response.", korean: "답변이 늦어진 점 진심으로 사과드립니다.", pron: "위 신시얼리 어팔러자이즈 포 더 딜레이 인 아워 리스폰스", example: "We sincerely apologize for the delay in our response due to the holiday.", exampleKr: "휴일로 인해 답변이 늦어진 점 진심으로 사과드립니다." },
  { id: 22, category: "biz", english: "Please advise if this schedule works for you.", korean: "이 일정이 괜찮으신지 알려주세요.", pron: "플리즈 어드바이즈 이프 디스 스케줄 웍스 포 유", example: "Please advise if this schedule works for you, otherwise we can adjust it.", exampleKr: "이 일정이 괜찮으신지 알려주시면, 안 되면 조정하겠습니다." },
  { id: 23, category: "biz", english: "We have attached the invoice for your records.", korean: "귀사 기록용으로 인보이스를 첨부합니다.", pron: "위 해브 어태치드 디 인보이스 포 유어 레코즈", example: "We have attached the invoice for your records; please let us know if anything is missing.", exampleKr: "귀사 기록용으로 인보이스를 첨부하며, 누락된 부분 있으면 알려주세요." },
  { id: 24, category: "biz", english: "Please make sure the documents are submitted before the deadline.", korean: "서류가 마감일 전에 제출되도록 해주세요.", pron: "플리즈 메이크 슈어 더 다큐먼츠 아 서브미티드 비포 더 데드라인", example: "Please make sure the documents are submitted before the deadline to avoid penalties.", exampleKr: "벌금을 피하려면 서류가 마감일 전에 제출되도록 해주세요." },
  { id: 25, category: "biz", english: "The booking has been confirmed on our end.", korean: "저희 쪽에서 예약이 확정되었습니다.", pron: "더 부킹 해즈 빈 컨펌드 온 아워 엔드", example: "The booking has been confirmed on our end; the vessel departs next Tuesday.", exampleKr: "저희 쪽에서 예약이 확정되었으며 선박은 다음 주 화요일 출항합니다." },
  { id: 26, category: "biz", english: "We are currently following up with the terminal.", korean: "현재 터미널 쪽에 확인 중입니다.", pron: "위 아 커런틀리 팔로잉 업 위드 더 터미널", example: "We are currently following up with the terminal and will update you as soon as we hear back.", exampleKr: "현재 터미널 쪽에 확인 중이며, 답변 오는 대로 안내드리겠습니다." },
  { id: 27, category: "biz", english: "Please let us know your preferred payment method.", korean: "선호하시는 결제 방법을 알려주세요.", pron: "플리즈 렛 어스 노우 유어 프리퍼드 페이먼트 메소드", example: "Please let us know your preferred payment method so we can proceed with the invoice.", exampleKr: "인보이스 진행을 위해 선호하시는 결제 방법을 알려주세요." },
  { id: 28, category: "biz", english: "We will keep you posted on any updates.", korean: "새로운 소식 있으면 계속 알려드리겠습니다.", pron: "위 윌 킵 유 포스티드 온 애니 업데이츠", example: "We will keep you posted on any updates regarding the customs clearance.", exampleKr: "통관 관련 새로운 소식 있으면 계속 알려드리겠습니다." },
  { id: 29, category: "biz", english: "This is a gentle reminder about the outstanding payment.", korean: "미결제 대금에 대해 다시 한 번 안내드립니다.", pron: "디스 이즈 어 젠틀 리마인더 어바웃 디 아웃스탠딩 페이먼트", example: "This is a gentle reminder about the outstanding payment due last week.", exampleKr: "지난주 마감된 미결제 대금에 대해 다시 한 번 안내드립니다." },
  { id: 30, category: "biz", english: "Please note that this rate is valid until the end of the month.", korean: "이 운임은 이번 달 말까지 유효함을 알려드립니다.", pron: "플리즈 노트 댓 디스 레이트 이즈 밸리드 언틸 디 엔드 오브 더 먼스", example: "Please note that this rate is valid until the end of the month only.", exampleKr: "이 운임은 이번 달 말까지만 유효함을 알려드립니다." },
  { id: 31, category: "biz", english: "We would like to confirm the final delivery address.", korean: "최종 배송지 주소를 확인하고 싶습니다.", pron: "위 우드 라이크 투 컨펌 더 파이널 딜리버리 어드레스", example: "We would like to confirm the final delivery address before dispatching the cargo.", exampleKr: "화물 발송 전에 최종 배송지 주소를 확인하고 싶습니다." },
  { id: 32, category: "biz", english: "The shipment was delayed due to a customs hold.", korean: "세관 보류로 인해 선적이 지연되었습니다.", pron: "더 쉽먼트 워즈 딜레이드 듀 투 어 커스텀즈 홀드", example: "The shipment was delayed due to a customs hold and should clear by tomorrow.", exampleKr: "세관 보류로 인해 선적이 지연되었으며 내일까지는 해결될 예정입니다." },
  { id: 33, category: "biz", english: "We kindly ask for your cooperation on this matter.", korean: "이 건에 대해 협조 부탁드립니다.", pron: "위 카인들리 애스크 포 유어 코오퍼레이션 온 디스 매터", example: "We kindly ask for your cooperation on this matter as it is time-sensitive.", exampleKr: "시간이 촉박한 건이라 이 건에 대해 협조 부탁드립니다." },
  { id: 34, category: "biz", english: "Please allow 24 hours for the system to update.", korean: "시스템 업데이트에는 24시간 정도 걸립니다.", pron: "플리즈 얼라우 트웬티포 아워즈 포 더 시스템 투 업데이트", example: "Please allow 24 hours for the system to update before checking the status again.", exampleKr: "다시 상태를 확인하시기 전에 시스템 업데이트에는 24시간 정도 걸리니 참고 바랍니다." },
  { id: 35, category: "biz", english: "The original documents will be couriered to you shortly.", korean: "원본 서류는 곧 택배로 발송해 드리겠습니다.", pron: "디 오리지널 다큐먼츠 윌 비 커리어드 투 유 숏틀리", example: "The original documents will be couriered to you shortly once payment is confirmed.", exampleKr: "결제 확인 즉시 원본 서류는 곧 택배로 발송해 드리겠습니다." },
  { id: 36, category: "biz", english: "We would like to escalate this issue internally.", korean: "이 문제를 내부적으로 상급자에게 보고하고자 합니다.", pron: "위 우드 라이크 투 에스컬레이트 디스 이슈 인터널리", example: "We would like to escalate this issue internally to resolve it faster.", exampleKr: "더 빠른 해결을 위해 이 문제를 내부적으로 상급자에게 보고하고자 합니다." },
  { id: 37, category: "biz", english: "Please note this is a system-generated email.", korean: "이 메일은 시스템에서 자동으로 발송된 것입니다.", pron: "플리즈 노트 디스 이즈 어 시스템 제너레이티드 이메일", example: "Please note this is a system-generated email; please do not reply directly.", exampleKr: "이 메일은 시스템에서 자동으로 발송된 것이니 직접 답장하지 말아주세요." },
  { id: 38, category: "biz", english: "We are pleased to confirm your booking has been accepted.", korean: "예약이 승인되었음을 알려드립니다.", pron: "위 아 플리즈드 투 컨펌 유어 부킹 해즈 빈 억셉티드", example: "We are pleased to confirm your booking has been accepted for next week's sailing.", exampleKr: "다음 주 출항 편으로 예약이 승인되었음을 알려드립니다." },
  { id: 39, category: "biz", english: "Please be aware that this port is currently congested.", korean: "현재 이 항구는 혼잡한 상태임을 참고해 주세요.", pron: "플리즈 비 어웨어 댓 디스 포트 이즈 커런틀리 컨제스티드", example: "Please be aware that this port is currently congested, causing longer waiting times.", exampleKr: "현재 이 항구는 혼잡한 상태라 대기 시간이 길어지고 있음을 참고해 주세요." },
  { id: 40, category: "biz", english: "We hope this finds you well.", korean: "잘 지내고 계시길 바랍니다. (이메일 서두 인사말)", pron: "위 호프 디스 파인즈 유 웰", example: "We hope this finds you well and look forward to working together again.", exampleKr: "잘 지내고 계시길 바라며, 다시 함께 일할 수 있기를 기대합니다." },
  { id: 41, category: "biz", english: "Thank you for bringing this to our attention.", korean: "이 사실을 알려주셔서 감사합니다.", pron: "땡큐 포 브링잉 디스 투 아워 어텐션", example: "Thank you for bringing this to our attention; we will look into it right away.", exampleKr: "이 사실을 알려주셔서 감사하며, 바로 확인해 보겠습니다." },
  { id: 42, category: "biz", english: "Please review the attached quotation and confirm.", korean: "첨부된 견적서를 검토하시고 확인 부탁드립니다.", pron: "플리즈 리뷰 디 어태치드 쿼테이션 앤 컨펌", example: "Please review the attached quotation and confirm your acceptance by Friday.", exampleKr: "금요일까지 첨부된 견적서를 검토하시고 확인 부탁드립니다." },
  { id: 43, category: "biz", english: "We will process your request as soon as possible.", korean: "요청하신 건은 최대한 빨리 처리하겠습니다.", pron: "위 윌 프로세스 유어 리퀘스트 애즈 순 애즈 파서블", example: "We will process your request as soon as possible and notify you once completed.", exampleKr: "요청하신 건은 최대한 빨리 처리하고 완료되면 알려드리겠습니다." },
  { id: 44, category: "biz", english: "Please disregard the previous email; this is the updated version.", korean: "이전 이메일은 무시해 주세요, 이게 수정된 버전입니다.", pron: "플리즈 디스리가드 더 프리비어스 이메일 디스 이즈 디 업데이티드 버전", example: "Please disregard the previous email; this is the updated version with correct figures.", exampleKr: "이전 이메일은 무시해 주세요, 이게 숫자가 수정된 버전입니다." },
  { id: 45, category: "biz", english: "We would like to negotiate better terms for this contract.", korean: "이 계약에 대해 더 나은 조건으로 협상하고 싶습니다.", pron: "위 우드 라이크 투 네고시에이트 베터 텀즈 포 디스 컨트랙트", example: "We would like to negotiate better terms for this contract given the volume increase.", exampleKr: "물량 증가를 감안하여 이 계약에 대해 더 나은 조건으로 협상하고 싶습니다." },
  { id: 46, category: "biz", english: "This is to confirm that the cargo was loaded successfully.", korean: "화물이 성공적으로 적재되었음을 확인드립니다.", pron: "디스 이즈 투 컨펌 댓 더 카고 워즈 로디드 석세스풀리", example: "This is to confirm that the cargo was loaded successfully without any issues.", exampleKr: "화물이 문제 없이 성공적으로 적재되었음을 확인드립니다." },
  { id: 47, category: "biz", english: "We appreciate your continued support and partnership.", korean: "지속적인 지원과 협력에 감사드립니다.", pron: "위 어프리시에잇 유어 컨티뉴드 서포트 앤 파트너십", example: "We appreciate your continued support and partnership over the years.", exampleKr: "그동안 지속적인 지원과 협력에 감사드립니다." },
  { id: 48, category: "biz", english: "Please let us know your thoughts at your convenience.", korean: "편하신 때에 의견을 알려주세요.", pron: "플리즈 렛 어스 노우 유어 쏘츠 앳 유어 컨비니언스", example: "Please let us know your thoughts at your convenience; there is no rush.", exampleKr: "급하지 않으니 편하신 때에 의견을 알려주세요." },
  { id: 49, category: "biz", english: "The invoice has been issued and sent to your email.", korean: "인보이스가 발행되어 이메일로 발송되었습니다.", pron: "디 인보이스 해즈 빈 이슈드 앤 센트 투 유어 이메일", example: "The invoice has been issued and sent to your email; kindly check your inbox.", exampleKr: "인보이스가 발행되어 이메일로 발송되었으니 받은편지함을 확인해 주세요." },
  { id: 50, category: "biz", english: "We look forward to a long-term business relationship.", korean: "장기적인 비즈니스 관계를 기대합니다.", pron: "위 룩 포워드 투 어 롱텀 비즈니스 릴레이션십", example: "We look forward to a long-term business relationship with your company.", exampleKr: "귀사와의 장기적인 비즈니스 관계를 기대합니다." },
  { id: 51, category: "biz", english: "Please confirm once the wire transfer has been completed.", korean: "전신 송금이 완료되면 확인해 주세요.", pron: "플리즈 컨펌 원스 더 와이어 트랜스퍼 해즈 빈 컴플리티드", example: "Please confirm once the wire transfer has been completed so we can release the cargo.", exampleKr: "화물 반출을 위해 전신 송금이 완료되면 확인해 주세요." },
  { id: 52, category: "daily", english: "I'm running a bit behind schedule.", korean: "제가 일정보다 조금 늦어지고 있어요.", pron: "아임 러닝 어 빗 비하인드 스케줄", example: "I'm running a bit behind schedule, so I might be 10 minutes late.", exampleKr: "일정보다 조금 늦어지고 있어서 10분 정도 늦을 것 같아요." },
  { id: 53, category: "daily", english: "Let's touch base later this week.", korean: "이번 주 중에 다시 한 번 연락하고 얘기하죠.", pron: "렛츠 터치 베이스 레이터 디스 위크", example: "Let's touch base later this week once you have more information.", exampleKr: "정보가 좀 더 모이면 이번 주 중에 다시 연락해서 얘기하죠." },
  { id: 54, category: "daily", english: "It's not a big deal.", korean: "별일 아니에요. / 큰일 아니에요.", pron: "잇츠 낫 어 빅 딜", example: "Don't worry about it, it's not a big deal.", exampleKr: "걱정하지 마세요, 별일 아니에요." },
  { id: 55, category: "daily", english: "I really appreciate it.", korean: "정말 감사해요.", pron: "아이 리얼리 어프리시에잇 잇", example: "Thanks for helping me out, I really appreciate it.", exampleKr: "도와줘서 정말 감사해요." },
  { id: 56, category: "daily", english: "Can you bear with me for a second?", korean: "잠깐만 기다려 주실 수 있나요?", pron: "캔 유 베어 위드 미 포 어 세컨드", example: "Can you bear with me for a second while I check the file?", exampleKr: "파일 확인하는 동안 잠깐만 기다려 주실 수 있나요?" },
  { id: 57, category: "daily", english: "I'll get back to you on that.", korean: "그 부분은 다시 답변 드릴게요.", pron: "아윌 겟 백 투 유 온 댓", example: "I don't know the answer right now, I'll get back to you on that.", exampleKr: "지금 당장은 답을 모르겠어요, 그 부분은 다시 답변 드릴게요." },
  { id: 58, category: "daily", english: "That makes sense.", korean: "그거 말 되네요. / 이해가 되네요.", pron: "댓 메이크스 센스", example: "Oh, that makes sense now that you explain it.", exampleKr: "그렇게 설명해 주시니 이제 이해가 되네요." },
  { id: 59, category: "daily", english: "I couldn't agree more.", korean: "완전 동감이에요.", pron: "아이 쿠든트 어그리 모어", example: "I couldn't agree more with what you just said.", exampleKr: "방금 하신 말씀에 완전 동감이에요." },
  { id: 60, category: "daily", english: "Let me sleep on it.", korean: "하룻밤 자면서 생각해 볼게요. (결정을 미룰 때)", pron: "렛 미 슬립 온 잇", example: "That's a big decision, let me sleep on it.", exampleKr: "큰 결정이라 하룻밤 자면서 생각해 볼게요." },
  { id: 61, category: "daily", english: "I'm not really in the mood right now.", korean: "지금은 별로 그럴 기분이 아니에요.", pron: "아임 낫 리얼리 인 더 무드 라잇 나우", example: "Can we talk later? I'm not really in the mood right now.", exampleKr: "나중에 얘기해도 될까요? 지금은 별로 그럴 기분이 아니에요." },
  { id: 62, category: "daily", english: "It slipped my mind.", korean: "깜빡했어요.", pron: "잇 슬립트 마이 마인드", example: "Sorry, it completely slipped my mind.", exampleKr: "죄송해요, 완전히 깜빡했어요." },
  { id: 63, category: "daily", english: "I'm all ears.", korean: "잘 듣고 있어요. (경청하겠다는 뜻)", pron: "아임 올 이어즈", example: "Go ahead, I'm all ears.", exampleKr: "계속 말씀하세요, 잘 듣고 있어요." },
  { id: 64, category: "daily", english: "Let's play it by ear.", korean: "상황 봐가면서 정하죠.", pron: "렛츠 플레이 잇 바이 이어", example: "We don't have a fixed plan yet, let's just play it by ear.", exampleKr: "아직 정해진 계획이 없으니 상황 봐가면서 정하죠." },
  { id: 65, category: "daily", english: "I'm swamped with work today.", korean: "오늘 일이 산더미예요.", pron: "아임 스웜프트 위드 워크 투데이", example: "Sorry, I can't chat right now, I'm swamped with work today.", exampleKr: "죄송해요, 지금 얘기 못해요, 오늘 일이 산더미예요." },
  { id: 66, category: "daily", english: "Take your time.", korean: "천천히 하세요.", pron: "테이크 유어 타임", example: "There's no rush, take your time.", exampleKr: "급하지 않으니 천천히 하세요." },
  { id: 67, category: "daily", english: "I owe you one.", korean: "신세 졌네요. (나중에 갚을게요)", pron: "아이 오우 유 원", example: "Thanks for covering my shift, I owe you one.", exampleKr: "제 근무 대신해 줘서 고마워요, 신세 졌네요." },
  { id: 68, category: "daily", english: "Let's call it a day.", korean: "오늘은 여기까지 하죠.", pron: "렛츠 콜 잇 어 데이", example: "It's getting late, let's call it a day.", exampleKr: "시간이 늦었으니 오늘은 여기까지 하죠." },
  { id: 69, category: "daily", english: "I'm on the fence about it.", korean: "아직 결정을 못 내리고 고민 중이에요.", pron: "아임 온 더 펜스 어바웃 잇", example: "I'm on the fence about whether to accept the offer.", exampleKr: "그 제안을 받아들일지 말지 아직 고민 중이에요." },
  { id: 70, category: "daily", english: "Long time no see!", korean: "오랜만이에요!", pron: "롱 타임 노 씨", example: "Long time no see! How have you been?", exampleKr: "오랜만이에요! 어떻게 지냈어요?" },
  { id: 71, category: "daily", english: "I'll keep that in mind.", korean: "명심할게요. / 참고할게요.", pron: "아윌 킵 댓 인 마인드", example: "Thanks for the tip, I'll keep that in mind.", exampleKr: "팁 감사해요, 명심할게요." },
  { id: 72, category: "daily", english: "Let's cut to the chase.", korean: "본론만 말할게요. / 바로 핵심으로 들어가죠.", pron: "렛츠 컷 투 더 체이스", example: "We don't have much time, so let's cut to the chase.", exampleKr: "시간이 많지 않으니 본론만 말할게요." },
  { id: 73, category: "daily", english: "I'm looking forward to it.", korean: "기대하고 있어요.", pron: "아임 루킹 포워드 투 잇", example: "I'm looking forward to the weekend trip.", exampleKr: "주말 여행이 기대돼요." },
  { id: 74, category: "daily", english: "It's a piece of cake.", korean: "식은 죽 먹기예요. (아주 쉬운 일)", pron: "잇츠 어 피스 오브 케이크", example: "Don't worry, this test is a piece of cake.", exampleKr: "걱정 마세요, 이 시험은 식은 죽 먹기예요." },
  { id: 75, category: "daily", english: "I'm feeling a bit under the weather.", korean: "몸이 좀 안 좋아요.", pron: "아임 필링 어 빗 언더 더 웨더", example: "I might leave early today, I'm feeling a bit under the weather.", exampleKr: "오늘 좀 일찍 갈 수도 있어요, 몸이 좀 안 좋아서요." },
  { id: 76, category: "daily", english: "Let's grab a coffee sometime.", korean: "언제 커피 한 잔 해요.", pron: "렛츠 그랩 어 커피 섬타임", example: "It was great catching up, let's grab a coffee sometime again.", exampleKr: "이야기 나눠서 좋았어요, 언제 커피 한 잔 또 해요." },
  { id: 77, category: "daily", english: "I'm just winging it.", korean: "그냥 즉흥적으로 하는 거예요. (준비 없이)", pron: "아임 저스트 윙잉 잇", example: "I didn't prepare a speech, I'm just winging it.", exampleKr: "연설 준비 안 했어요, 그냥 즉흥적으로 하는 거예요." },
  { id: 78, category: "daily", english: "That rings a bell.", korean: "왠지 익숙하네요. / 들어본 것 같아요.", pron: "댓 링즈 어 벨", example: "That name rings a bell, have we met before?", exampleKr: "그 이름 어디서 들어본 것 같아요, 우리 만난 적 있나요?" },
  { id: 79, category: "daily", english: "I'll take a rain check.", korean: "다음 기회로 미룰게요.", pron: "아윌 테이크 어 레인 체크", example: "I can't make it tonight, can I take a rain check?", exampleKr: "오늘 저녁은 못 갈 것 같아요, 다음 기회로 미뤄도 될까요?" },
  { id: 80, category: "daily", english: "Let's break the ice.", korean: "서먹한 분위기를 풀어볼까요.", pron: "렛츠 브레이크 디 아이스", example: "Let's break the ice with a quick introduction round.", exampleKr: "짧은 자기소개로 서먹한 분위기를 풀어볼까요." },
  { id: 81, category: "daily", english: "I'm a bit rusty at this.", korean: "이거 좀 감이 없어요/서툴러요.", pron: "아임 어 빗 러스티 앳 디스", example: "I haven't done this in years, I'm a bit rusty at this.", exampleKr: "몇 년 동안 안 해봐서 이거 좀 감이 없어요." },
  { id: 82, category: "daily", english: "It's up in the air.", korean: "아직 미정이에요.", pron: "잇츠 업 인 디 에어", example: "Our travel plans are still up in the air.", exampleKr: "저희 여행 계획은 아직 미정이에요." },
  { id: 83, category: "daily", english: "I'm dying to try that new restaurant.", korean: "그 새로 생긴 식당 진짜 가보고 싶어요.", pron: "아임 다잉 투 트라이 댓 뉴 레스토랑", example: "I'm dying to try that new restaurant everyone's talking about.", exampleKr: "다들 얘기하는 그 새로 생긴 식당 진짜 가보고 싶어요." },
  { id: 84, category: "daily", english: "Let's agree to disagree.", korean: "서로 의견 차이는 그냥 인정하죠.", pron: "렛츠 어그리 투 디스어그리", example: "We're not going to convince each other, let's just agree to disagree.", exampleKr: "서로 설득이 안 될 것 같으니 그냥 의견 차이는 인정하죠." },
  { id: 85, category: "daily", english: "I'm out of the loop.", korean: "저만 소식을 못 들었어요/모르고 있었어요.", pron: "아임 아웃 오브 더 룹", example: "What happened? I'm totally out of the loop.", exampleKr: "무슨 일이에요? 저만 완전히 모르고 있었어요." },
  { id: 86, category: "daily", english: "It's on the tip of my tongue.", korean: "말이 혀끝에서 맴도는데 기억이 안 나요.", pron: "잇츠 온 더 팁 오브 마이 텅", example: "I know his name, it's on the tip of my tongue.", exampleKr: "그 사람 이름 아는데, 혀끝에서 맴도는데 기억이 안 나요." },
  { id: 87, category: "daily", english: "Let's not jump to conclusions.", korean: "성급하게 결론 내리지는 말죠.", pron: "렛츠 낫 점프 투 컨클루전스", example: "We don't have all the facts yet, let's not jump to conclusions.", exampleKr: "아직 다 파악이 안 됐으니 성급하게 결론 내리지는 말죠." },
  { id: 88, category: "daily", english: "I'm still on the fence.", korean: "여전히 결정을 못 하고 있어요.", pron: "아임 스틸 온 더 펜스", example: "I'm still on the fence about switching jobs.", exampleKr: "이직할지 말지 여전히 결정을 못 하고 있어요." },
  { id: 89, category: "daily", english: "That's a bit of a stretch.", korean: "그건 좀 억지스러운 것 같아요/과장이에요.", pron: "댓츠 어 빗 오브 어 스트레치", example: "Saying it's the best in the world seems like a bit of a stretch.", exampleKr: "세계 최고라고 하는 건 좀 과장인 것 같아요." },
  { id: 90, category: "daily", english: "Let's keep our fingers crossed.", korean: "잘 되길 바라요. (행운을 빌며)", pron: "렛츠 킵 아워 핑거스 크로스드", example: "We'll find out the results tomorrow, let's keep our fingers crossed.", exampleKr: "결과는 내일 나올 거예요, 잘 되길 바라요." },
  { id: 91, category: "daily", english: "I'm at a loss for words.", korean: "할 말을 잃었어요.", pron: "아임 앳 어 로스 포 워즈", example: "That was so kind of you, I'm at a loss for words.", exampleKr: "정말 친절하셔서, 할 말을 잃었어요." },
  { id: 92, category: "daily", english: "Let's touch on that later.", korean: "그 부분은 나중에 다시 얘기하죠.", pron: "렛츠 터치 온 댓 레이터", example: "We're short on time, let's touch on that later.", exampleKr: "시간이 부족하니 그 부분은 나중에 다시 얘기하죠." },
  { id: 93, category: "daily", english: "I'm just going with the flow.", korean: "그냥 흘러가는 대로 하고 있어요.", pron: "아임 저스트 고잉 위드 더 플로우", example: "I don't have a strict plan today, I'm just going with the flow.", exampleKr: "오늘은 정해진 계획 없이 그냥 흘러가는 대로 하고 있어요." },
  { id: 94, category: "daily", english: "It's easier said than done.", korean: "말은 쉽지만 실제로 하는 건 어려워요.", pron: "잇츠 이지어 세드 댄 던", example: "Losing weight sounds easy, but it's easier said than done.", exampleKr: "살 빼는 게 쉬워 보이지만 말은 쉽지 실제로는 어려워요." },
  { id: 95, category: "daily", english: "I'm counting on you.", korean: "당신만 믿을게요.", pron: "아임 카운팅 온 유", example: "This project is important, I'm counting on you.", exampleKr: "이 프로젝트 중요하니까 당신만 믿을게요." },
  { id: 96, category: "daily", english: "Let's see how it goes.", korean: "어떻게 되는지 한번 지켜보죠.", pron: "렛츠 씨 하우 잇 고우즈", example: "We're not sure it'll work, but let's see how it goes.", exampleKr: "될지 안 될지 확실하진 않지만 어떻게 되는지 한번 지켜보죠." },
  { id: 97, category: "daily", english: "That's the last straw.", korean: "더는 못 참겠어요. (인내의 한계)", pron: "댓츠 더 라스트 스트로", example: "He was late again, that's the last straw for me.", exampleKr: "그가 또 늦었어요, 이제 더는 못 참겠어요." },
  { id: 98, category: "daily", english: "I'm cutting it close.", korean: "시간이 아슬아슬해요.", pron: "아임 커팅 잇 클로스", example: "I'm cutting it close, the meeting starts in five minutes.", exampleKr: "시간이 아슬아슬해요, 5분 후에 회의가 시작돼요." },
  { id: 99, category: "daily", english: "Let's give it a shot.", korean: "한번 시도해 보죠.", pron: "렛츠 기브 잇 어 샷", example: "It might not work, but let's give it a shot anyway.", exampleKr: "안 될 수도 있지만 그래도 한번 시도해 보죠." },
  { id: 100, category: "daily", english: "I'm drawing a blank.", korean: "머릿속이 하얘요/생각이 안 나요.", pron: "아임 드로잉 어 블랭크", example: "I'm drawing a blank on his name right now.", exampleKr: "지금 그 사람 이름이 하나도 생각이 안 나요." },
];
/* Firestore에서 전체 표현 목록을 가져온다 (최초 1회, onSnapshot 실패시 폴백용) */
async function fetchDailyExprListFromServer() {
  try {
    await window.fbReady;
    const snapshot = await window.fbDb.collection(DAILY_EXPR_COLLECTION).get();
    return snapshot.docs.map((doc) => dailyExprDocToEntry(doc));
  } catch (err) {
    console.error("오늘의 표현 서버 목록 불러오기 실패:", err);
    return null;
  }
}

function dailyExprDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    seedOrder: typeof d.seedOrder === "number" ? d.seedOrder : 9999,
    category: d.category === "daily" ? "daily" : "biz",
    english: d.english || "",
    korean: d.korean || "",
    pron: d.pron || "",
    example: d.example || "",
    exampleKr: d.exampleKr || "",
  };
}

/* 새 표현 등록 (⚙️ 관리에서 팀원이 계속 추가할 때 씀) */
async function submitDailyExprToServer(entry) {
  try {
    await window.fbReady;
    const docRef = await window.fbDb.collection(DAILY_EXPR_COLLECTION).add({
      seedOrder: DAILY_EXPR_LIST.length + 1,
      category: entry.category === "daily" ? "daily" : "biz",
      english: entry.english || "",
      korean: entry.korean || "",
      pron: entry.pron || "",
      example: entry.example || "",
      exampleKr: entry.exampleKr || "",
    });
    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error("오늘의 표현 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteDailyExprFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(DAILY_EXPR_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("오늘의 표현 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

let dailyExprSeedBusy = false;

/* "초기 데이터 등록" 버튼 - 처음 준비한 100개를 한 번에 Firestore로 올림.
   목록이 비어있을 때만 버튼이 보여서 실수로 중복 등록되는 걸 방지해요. */
async function seedInitialDailyExprData() {
  if (dailyExprSeedBusy) return;
  if (!confirm("처음 준비한 표현 100개를 한 번에 등록할까요?")) return;
  dailyExprSeedBusy = true;
  const btn = document.getElementById("dailyExprSeedBtn");
  if (btn) { btn.disabled = true; btn.textContent = "등록 중... (0/" + DAILY_EXPR_SEED_DATA.length + ")"; }

  let successCount = 0;
  for (let i = 0; i < DAILY_EXPR_SEED_DATA.length; i++) {
    const seed = DAILY_EXPR_SEED_DATA[i];
    try {
      await window.fbReady;
      await window.fbDb.collection(DAILY_EXPR_COLLECTION).add({
        seedOrder: seed.id,
        category: seed.category,
        english: seed.english,
        korean: seed.korean,
        pron: seed.pron,
        example: seed.example,
        exampleKr: seed.exampleKr,
      });
      successCount++;
    } catch (err) {
      console.error("초기 등록 실패 (" + i + "번째):", err);
    }
    if (btn) btn.textContent = "등록 중... (" + (i + 1) + "/" + DAILY_EXPR_SEED_DATA.length + ")";
  }

  dailyExprSeedBusy = false;
  if (successCount < DAILY_EXPR_SEED_DATA.length) {
    alert(successCount + "/" + DAILY_EXPR_SEED_DATA.length + "건만 등록됐어요. 나머지는 네트워크 문제일 수 있어요 - 다시 눌러서 이어서 등록해주세요.");
  } else {
    alert("✅ 100개 모두 등록됐어요!");
  }
  await loadDailyExprTab(true);
}

/* 탭을 열 때 호출 - 처음 한 번만 실시간 구독 시작 */
async function loadDailyExprTab(forceRefresh) {
  const wrap = document.getElementById("dailyExprWrap");
  if (liveSubscribed.dailyExpr && !forceRefresh) { renderDailyExprTab(); return; }
  if (forceRefresh && dailyExprUnsubscribe) { dailyExprUnsubscribe(); dailyExprUnsubscribe = null; liveSubscribed.dailyExpr = false; }
  if (wrap && !DAILY_EXPR_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 오늘의 표현을 불러오는 중이에요...</div>';
  await window.fbReady;
  dailyExprUnsubscribe = window.fbDb.collection(DAILY_EXPR_COLLECTION).onSnapshot(
    (snapshot) => {
      DAILY_EXPR_LIST = snapshot.docs.map((doc) => dailyExprDocToEntry(doc)).sort((a, b) => a.seedOrder - b.seedOrder);
      renderDailyExprTab();
    },
    (err) => {
      console.error("오늘의 표현 실시간 구독 실패:", err);
      if (wrap && !DAILY_EXPR_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadDailyExprTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.dailyExpr = true;
  liveTabUnsubscribers.dailyExpr = () => { if (dailyExprUnsubscribe) { dailyExprUnsubscribe(); dailyExprUnsubscribe = null; liveSubscribed.dailyExpr = false; } };
}

/* 연중 몇 번째 날인지 계산 (1~366) - 이 숫자로 표현 목록을 나눠서 "오늘의 표현"을 정함.
   서버 없이 날짜 계산만 하기 때문에, 같은 날엔 팀원 전체가 똑같은 표현을 보게 돼요. */
function dayOfYear_() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  return Math.floor(diff / 86400000);
}

function pickTodaysExpression_() {
  if (DAILY_EXPR_LIST.length === 0) return null;
  const idx = dayOfYear_() % DAILY_EXPR_LIST.length;
  return DAILY_EXPR_LIST[idx];
}

function renderDailyExprTab() {
  const wrap = document.getElementById("dailyExprWrap");
  if (!wrap) return;

  if (DAILY_EXPR_LIST.length === 0) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 표현이 없어요.'
      + ' <button class="btn generate-btn" id="dailyExprSeedBtn" style="margin-top:10px;" onclick="seedInitialDailyExprData()">📥 처음 준비한 100개 한 번에 등록하기</button></div>';
    return;
  }

  if (!dailyExprCurrentId || !DAILY_EXPR_LIST.some((e) => e.id === dailyExprCurrentId)) {
    const todays = pickTodaysExpression_();
    dailyExprCurrentId = todays ? todays.id : DAILY_EXPR_LIST[0].id;
    dailyExprQuizAnswered = false;
  }

  renderDailyExprCard();
}

function currentDailyExprItem_() {
  return DAILY_EXPR_LIST.find((e) => e.id === dailyExprCurrentId) || DAILY_EXPR_LIST[0];
}

/* 오늘의 표현인지, 아니면 "다른 표현 보기"로 넘어온 연습용인지 구분해서 라벨을 보여줌 */
function isShowingTodaysExpression_() {
  const todays = pickTodaysExpression_();
  return todays && todays.id === dailyExprCurrentId;
}

function renderDailyExprCard() {
  const wrap = document.getElementById("dailyExprWrap");
  if (!wrap) return;
  const item = currentDailyExprItem_();
  if (!item) return;

  const catLabel = item.category === "daily" ? "🗨 일상 표현" : "💼 비즈니스/물류 표현";
  const catBadgeStyle = item.category === "daily" ? "background:#dcfce7;color:#166534;" : "background:#dbeafe;color:#1e40af;";
  const isTodays = isShowingTodaysExpression_();

  wrap.innerHTML = `
    <div class="content-card daily-expr-card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <span style="font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:6px;${catBadgeStyle}">${catLabel}</span>
        <span class="hint" style="margin:0;">${isTodays ? "📅 오늘의 표현" : "🔀 연습용"}</span>
      </div>

      <div id="dailyExprQuizArea"></div>

      <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn secondary-btn" onclick="showNextDailyExpr()">🔀 다른 표현 보기</button>
        <button type="button" class="btn secondary-btn" onclick="jumpToTodaysExpr()">📅 오늘의 표현으로</button>
      </div>
    </div>
  `;

  renderDailyExprQuiz();
}

/* 정답 후보 3개를 다른 항목에서 무작위로 뽑음 (같은 카테고리 우선, 부족하면 아무 카테고리에서나) */
function buildQuizChoices_(correctItem) {
  const sameCategory = DAILY_EXPR_LIST.filter((e) => e.id !== correctItem.id && e.category === correctItem.category);
  const others = DAILY_EXPR_LIST.filter((e) => e.id !== correctItem.id && e.category !== correctItem.category);
  const pool = sameCategory.length >= 3 ? sameCategory : sameCategory.concat(others);

  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  const distractors = shuffled.slice(0, Math.min(3, shuffled.length));
  const choices = distractors.concat([correctItem]).sort(() => Math.random() - 0.5);
  return choices;
}

let dailyExprQuizChoices = [];

function renderDailyExprQuiz() {
  const area = document.getElementById("dailyExprQuizArea");
  if (!area) return;
  const item = currentDailyExprItem_();
  if (!item) return;

  if (!dailyExprQuizAnswered) {
    dailyExprQuizChoices = buildQuizChoices_(item);
    area.innerHTML = `
      <div class="label" style="font-size:15px;">💭 다음 뜻에 맞는 영어 표현은?</div>
      <div style="font-size:16px;font-weight:600;margin:8px 0 16px;line-height:1.6;">${escapeHtml(item.korean)}</div>
      <div id="dailyExprChoicesWrap" style="display:flex;flex-direction:column;gap:8px;"></div>
    `;
    const choicesWrap = document.getElementById("dailyExprChoicesWrap");
    dailyExprQuizChoices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary-btn";
      btn.style.cssText = "text-align:left;white-space:normal;line-height:1.5;padding:10px 14px;";
      btn.textContent = choice.english;
      btn.onclick = () => answerDailyExprQuiz(choice.id === item.id);
      choicesWrap.appendChild(btn);
    });
    return;
  }

  // 이미 정답을 고른 상태 - 정답/발음/예문 공개
  area.innerHTML = `
    <div class="label" style="font-size:15px;">✅ 정답</div>
    <div id="dailyExprAnswerLine" style="font-size:17px;font-weight:700;margin:8px 0 6px;line-height:1.6;">${escapeHtml(item.english)}</div>
    <div class="hint" style="margin-bottom:10px;">발음: ${escapeHtml(item.pron)}</div>
    <div style="font-size:14px;color:#374151;margin-bottom:4px;">${escapeHtml(item.korean)}</div>

    <div class="label" style="margin-top:14px;">📝 예문</div>
    <div id="dailyExprExampleLine" style="font-size:14px;line-height:1.7;margin-top:4px;">${escapeHtml(item.example)}</div>
    <div class="hint" style="margin-top:4px;">${escapeHtml(item.exampleKr)}</div>
  `;

  // ⚠️ 버튼은 innerHTML 문자열(onclick="...")로 안 만들고 DOM으로 직접 붙여요.
  //    Firestore 문서 id처럼 예측 불가능한 문자열을 onclick 속성 문자열 안에 그대로
  //    끼워넣으면, 따옴표가 겹쳐서 HTML 자체가 깨지는 문제가 있었어요 (그래서 버튼이
  //    안 눌리고 "Unexpected end of input" 에러가 났던 거예요). DOM으로 만들면 이런
  //    충돌이 애초에 날 수가 없어요.
  const answerListenBtn = document.createElement("button");
  answerListenBtn.type = "button";
  answerListenBtn.className = "btn secondary-btn";
  answerListenBtn.style.cssText = "padding:2px 10px;font-size:12px;margin-left:6px;vertical-align:middle;";
  answerListenBtn.textContent = "🔊 듣기";
  answerListenBtn.onclick = () => speakDailyExpr(item.id, "english", answerListenBtn);
  document.getElementById("dailyExprAnswerLine").appendChild(answerListenBtn);

  const exampleListenBtn = document.createElement("button");
  exampleListenBtn.type = "button";
  exampleListenBtn.className = "btn secondary-btn";
  exampleListenBtn.style.cssText = "padding:2px 10px;font-size:12px;margin-left:6px;";
  exampleListenBtn.textContent = "🔊";
  exampleListenBtn.onclick = () => speakDailyExpr(item.id, "example", exampleListenBtn);
  document.getElementById("dailyExprExampleLine").appendChild(exampleListenBtn);
}

function answerDailyExprQuiz(isCorrect) {
  dailyExprQuizAnswered = true;
  renderDailyExprQuiz();
  const area = document.getElementById("dailyExprQuizArea");
  if (!area) return;
  const banner = document.createElement("div");
  banner.className = "hint";
  banner.style.cssText = "margin-bottom:10px;font-weight:600;" + (isCorrect ? "color:#166534;" : "color:#991b1b;");
  banner.textContent = isCorrect ? "🎉 정답이에요!" : "아쉬워요, 정답은 아래예요.";
  area.insertBefore(banner, area.firstChild);
}

/* "다른 표현 보기" - 최근에 본 것과 안 겹치게 무작위로 하나 골라서 보여줌 */
function showNextDailyExpr() {
  if (DAILY_EXPR_LIST.length === 0) return;
  dailyExprRecentIds.push(dailyExprCurrentId);
  if (dailyExprRecentIds.length > 10) dailyExprRecentIds.shift();

  const candidates = DAILY_EXPR_LIST.filter((e) => dailyExprRecentIds.indexOf(e.id) === -1);
  const pool = candidates.length > 0 ? candidates : DAILY_EXPR_LIST;
  const next = pool[Math.floor(Math.random() * pool.length)];

  dailyExprCurrentId = next.id;
  dailyExprQuizAnswered = false;
  renderDailyExprCard();
}

function jumpToTodaysExpr() {
  const todays = pickTodaysExpression_();
  if (!todays) return;
  dailyExprCurrentId = todays.id;
  dailyExprQuizAnswered = false;
  renderDailyExprCard();
}

/* 🔊 발음 듣기 - 두 단계로 동작해요:
   1) 처음 준비한 100개(seedOrder 1~100)는 미리 만들어둔 mp3 파일이 레포 안에 있어서,
      네트워크 요청 없이 바로 재생돼요 (제일 빠르고 확실해요, 프리즈마든 뭐든 무조건 재생됨).
   2) 나중에 팀원이 "➕ 새 표현 추가"로 새로 넣은 표현은 미리 만든 파일이 없으니, 그때만
      자동으로 Apps Script(구글 번역 음성합성 프록시)를 통해 즉석에서 만들어서 재생해요. */
let dailyExprAudioCache = {}; // Apps Script로 새로 만든 음성은 이 탭을 켜놓은 동안 메모리에 캐시
let dailyExprCurrentAudioEl = null;

function localAudioPath_(item, field) {
  // 처음 준비한 100개만 미리 만든 파일이 있어요 (seedOrder 1~100)
  if (item.seedOrder >= 1 && item.seedOrder <= 100) {
    return "audio/daily-expr/" + item.seedOrder + "_" + (field === "example" ? "ex" : "en") + ".mp3";
  }
  return null;
}

async function speakDailyExpr(itemId, field, btnEl) {
  const item = DAILY_EXPR_LIST.find((e) => e.id === itemId);
  if (!item) return;
  const text = field === "example" ? item.example : item.english;

  if (dailyExprCurrentAudioEl) {
    dailyExprCurrentAudioEl.pause();
    dailyExprCurrentAudioEl = null;
  }

  const originalLabel = btnEl ? btnEl.textContent : "";
  const localPath = localAudioPath_(item, field);

  if (localPath) {
    // 미리 만들어둔 파일이 있는 경우 - 바로 재생 (제일 빠르고 안정적)
    const audio = new Audio(localPath);
    dailyExprCurrentAudioEl = audio;
    if (btnEl) btnEl.textContent = "🔊 재생 중...";
    audio.onended = () => { if (btnEl) btnEl.textContent = originalLabel; };
    audio.onerror = () => {
      // 혹시 파일이 없거나 깨졌으면, 조용히 온라인 방식으로 대체
      if (btnEl) btnEl.textContent = originalLabel;
      speakDailyExprOnline_(text, btnEl, originalLabel);
    };
    try { await audio.play(); } catch (e) { speakDailyExprOnline_(text, btnEl, originalLabel); }
    return;
  }

  // 미리 만든 파일이 없는(새로 추가된) 표현은 온라인 방식으로
  await speakDailyExprOnline_(text, btnEl, originalLabel);
}

async function speakDailyExprOnline_(text, btnEl, originalLabel) {
  if (!LOGISTICS_NEWS_API_URL) {
    alert("이 표현은 아직 준비된 음성 파일이 없어요.");
    return;
  }
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = "⏳ 불러오는 중..."; }

  try {
    let audioBase64 = dailyExprAudioCache[text];
    if (!audioBase64) {
      const res = await fetch(LOGISTICS_NEWS_API_URL + "?action=tts&text=" + encodeURIComponent(text));
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "알 수 없는 오류");
      audioBase64 = data.audioBase64;
      dailyExprAudioCache[text] = audioBase64;
    }

    const audio = new Audio("data:audio/mpeg;base64," + audioBase64);
    dailyExprCurrentAudioEl = audio;
    if (btnEl) btnEl.textContent = "🔊 재생 중...";
    audio.onended = () => { if (btnEl) btnEl.textContent = originalLabel; };
    audio.onerror = () => { if (btnEl) btnEl.textContent = originalLabel; };
    await audio.play();
  } catch (err) {
    console.error("발음 재생 실패:", err);
    alert("발음을 불러오지 못했어요. 네트워크 문제일 수 있어요 - 잠시 후 다시 시도해주세요.\n\n(" + err.message + ")");
  } finally {
    if (btnEl) { btnEl.disabled = false; if (btnEl.textContent === "⏳ 불러오는 중...") btnEl.textContent = originalLabel; }
  }
}

/* ---- 새 표현 추가 모달 (⚙️ 관리 없이도 탭 안에서 바로 추가 가능) ---- */
function openDailyExprAddEditor() {
  document.getElementById("dailyExprAddOverlay").style.display = "flex";
  renderDailyExprAddBody();
}

function closeDailyExprAddEditor() {
  document.getElementById("dailyExprAddOverlay").style.display = "none";
}

function renderDailyExprAddBody() {
  const body = document.getElementById("dailyExprAddBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("유형"));
  const catSel = document.createElement("select");
  ["biz", "daily"].forEach((v) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v === "biz" ? "💼 비즈니스/물류 표현" : "🗨 일상 표현";
    catSel.appendChild(o);
  });
  body.appendChild(catSel);

  body.appendChild(makeLabel("영어 표현"));
  const engInput = document.createElement("textarea");
  engInput.rows = 2;
  engInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  engInput.placeholder = "예: We look forward to your prompt reply.";
  body.appendChild(engInput);

  body.appendChild(makeLabel("뜻 (한국어)"));
  const korInput = document.createElement("textarea");
  korInput.rows = 2;
  korInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  korInput.placeholder = "예: 빠른 답변 기다리겠습니다.";
  body.appendChild(korInput);

  body.appendChild(makeLabel("한글 발음 (참고용)"));
  const pronInput = document.createElement("input");
  pronInput.placeholder = "예: 위 룩 포워드 투 유어 프롬트 리플라이";
  body.appendChild(pronInput);

  body.appendChild(makeLabel("예문 (영어)"));
  const exInput = document.createElement("textarea");
  exInput.rows = 2;
  exInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  body.appendChild(exInput);

  body.appendChild(makeLabel("예문 뜻 (한국어)"));
  const exKrInput = document.createElement("textarea");
  exKrInput.rows = 2;
  exKrInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  body.appendChild(exKrInput);

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = async () => {
    const entry = {
      category: catSel.value,
      english: engInput.value.trim(),
      korean: korInput.value.trim(),
      pron: pronInput.value.trim(),
      example: exInput.value.trim(),
      exampleKr: exKrInput.value.trim(),
    };
    if (!entry.english || !entry.korean) { alert("영어 표현과 뜻은 꼭 입력해주세요."); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = await submitDailyExprToServer(entry);
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장하기";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeDailyExprAddEditor();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeDailyExprAddEditor();
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}
