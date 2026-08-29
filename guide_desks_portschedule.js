/* ===== guide_desks_portschedule.js : original lines 17085-18493 ===== */
/* =========================================================================
   🚢 B/L 데스크 - 선박 출항일 + 입금현황(BL번호 조회)을 한 화면에서
   ========================================================================= */
/* =========================================================================
   🗓️ 노션 입항 스케줄 - BCT·PNIT·HPNT·ZIM 등에서 뽑은 raw 데이터를 한곳에 모음
   ========================================================================= */
const PORT_SCHEDULE_COLLECTION = "port_schedule";
let PORT_SCHEDULE_LIST = [];
let portScheduleUnsubscribe = null;
let portScheduleUploadBusy = false;

/* 선박코드+항차로 고정된 문서 ID를 만들어서, 같은 배/항차를 다시 올리면
   자동으로 "새로 추가"가 아니라 "기존 걸 최신 정보로 덮어쓰기"가 되게 함 */
function portScheduleDocId(vesselCode, voyage, terminal) {
  const safeCode = String(vesselCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "_") || "CODE";
  const safeVoyage = String(voyage || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "_") || "VOY";
  // ⚠️ 터미널도 꼭 ID에 넣어야 해요 - 같은 배·같은 항차가 두 터미널에 나눠서 기항하는 경우(예: BPT 다음 HJNT)가
  // 있는데, 터미널을 안 넣으면 두 줄이 같은 ID를 갖게 돼서 나중 줄이 먼저 줄을 덮어써버려요 (실제로 있었던 버그).
  const safeTerminal = String(terminal || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "_") || "TERM";
  return safeCode + "__" + safeVoyage + "__" + safeTerminal;
}

/* 엑셀 셀 값(Date 객체든 문자열이든)을 항상 "YYYY-MM-DD"로 통일 */
function parsePortScheduleDate(cell) {
  if (cell === null || cell === undefined || cell === "") return "";

  if (cell instanceof Date) {
    if (isNaN(cell.getTime())) return "";
    // SheetJS가 날짜를 UTC 기준으로 만들어주기 때문에, 한국 시간(UTC+9)으로 읽으면
    // 날짜가 하루 밀릴 수 있어요. 그래서 반드시 UTC 기준으로 읽어야 정확해요.
    return cell.getUTCFullYear() + "-" + String(cell.getUTCMonth() + 1).padStart(2, "0") + "-" + String(cell.getUTCDate()).padStart(2, "0");
  }

  // 엑셀에서 "날짜 서식"이 아니라 그냥 숫자로 저장된 날짜 칸(엑셀 내부 날짜 일련번호)인 경우
  if (typeof cell === "number") {
    if (cell <= 0) return ""; // 0 이하는 진짜 날짜가 아니라 빈 칸으로 취급 (여기서 1899-12-XX 같은 쓰레기 값이 나오던 걸 막음)
    const utcMs = Math.round((cell - 25569) * 86400 * 1000); // 25569 = 1970-01-01에 해당하는 엑셀 일련번호
    const d = new Date(utcMs);
    if (isNaN(d.getTime())) return "";
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }

  const str = String(cell).trim();
  if (!str) return "";

  // 구분자 없는 순수 숫자 문자열(예: "46056")은 날짜로 취급하지 않음
  // (new Date("46056")가 "46056년"으로 잘못 해석되는 걸 막기 위함 - 이게 원래 버그의 원인이었어요)
  if (/^\d+$/.test(str)) return "";

  const m = str.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.getFullYear() + "-" + String(parsed.getMonth() + 1).padStart(2, "0") + "-" + String(parsed.getDate()).padStart(2, "0");
  }
  return ""; // 못 알아보는 형식이면 이상한 값 남기지 않고 그냥 빈 값으로
}

/* "오후 3:00" 형태로 시간을 뽑아냄. 엑셀에서 시간 전용 칸은 SheetJS가
   1899-12-30 같은 가짜 날짜 + 시간이 합쳐진 Date 객체로 넘겨주기 때문에,
   그 객체를 그냥 String()으로 바꾸면 "Sat Dec 30 1899 17:00:00 GMT+..." 같은
   쓰레기 값이 나와요 (이게 원래 버그였어요) - 그래서 시간(시:분)만 정확히 뽑아냄 */
function parsePortScheduleTime(cell) {
  if (cell === null || cell === undefined || cell === "") return "";

  const toKoreanTime = (hours, minutes) => {
    const period = hours < 12 ? "오전" : "오후";
    let h12 = hours % 12;
    if (h12 === 0) h12 = 12;
    return period + " " + h12 + ":" + String(minutes).padStart(2, "0");
  };

  if (cell instanceof Date) {
    if (isNaN(cell.getTime())) return "";
    return toKoreanTime(cell.getUTCHours(), cell.getUTCMinutes());
  }

  if (typeof cell === "number") {
    // 엑셀 시간 값은 "하루를 1로 보는 소수"예요 (예: 0.5 = 낮 12시)
    const totalMinutes = Math.round((cell % 1) * 24 * 60);
    return toKoreanTime(Math.floor(totalMinutes / 60), totalMinutes % 60);
  }

  return String(cell).trim(); // 이미 "오후 3:00" 같은 문자열이면 그대로 씀
}

/* 날짜에서 이틀 전 날짜 계산 (AN 발송 예정일 자동 계산용) */
function subtractDaysFromDateStr(dateStr, days) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() - days);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

let portScheduleSubTab = "raw"; // "raw" | "calendar"

function switchPortScheduleSubTab(tab) {
  portScheduleSubTab = tab;
  renderPortScheduleSubTabButtons();
  document.getElementById("portScheduleRawSection").style.display = tab === "raw" ? "block" : "none";
  document.getElementById("portScheduleCalendarSection").style.display = tab === "calendar" ? "block" : "none";
  if (tab === "calendar") renderPortScheduleCalendar();
}

function renderPortScheduleSubTabButtons() {
  const wrap = document.getElementById("portScheduleSubTabButtons");
  if (!wrap) return;
  wrap.innerHTML = `
    <button type="button" class="sub-tab-btn ${portScheduleSubTab === "raw" ? "active" : ""}" onclick="switchPortScheduleSubTab('raw')">📄 raw 데이터</button>
    <button type="button" class="sub-tab-btn ${portScheduleSubTab === "calendar" ? "active" : ""}" onclick="switchPortScheduleSubTab('calendar')">📅 입항 캘린더 (노션용)</button>
  `;
}

let portScheduleAutoUpdateLoaded = false; // 탭 열릴 때마다 다시 안 읽어오게(Firestore 읽기 비용 절약), 딱 한 번만

/* 매일 아침 자동화(fetch_terminals.py + push_to_firestore.py)가 실행되고 나면,
   port_schedule_updates/latest 문서에 "오늘 뭐가 바뀌었는지" 기록을 남겨줘요.
   이 함수는 그 문서를 읽어서 화면 위에 배너로 보여줘요. */
async function loadPortScheduleAutoUpdateBanner() {
  if (portScheduleAutoUpdateLoaded) return; // 이미 한 번 불러왔으면 다시 안 읽음
  portScheduleAutoUpdateLoaded = true;
  try {
    await window.fbReady;
    const doc = await window.fbDb.collection("port_schedule_updates").doc("latest").get();
    if (!doc.exists) return; // 자동화가 아직 한 번도 안 돌았으면 배너 자체를 안 보여줌
    renderPortScheduleAutoUpdateBanner(doc.data());
  } catch (err) {
    console.error("자동 갱신 내역 불러오기 실패:", err);
  }
}

function renderPortScheduleAutoUpdateBanner(data) {
  const wrap = document.getElementById("portScheduleAutoUpdateBanner");
  if (!wrap) return;

  const changes = data.changes || [];
  const ranAtIso = data.ranAtIso || "";
  let ranAtLabel = "";
  if (ranAtIso) {
    const d = new Date(ranAtIso);
    if (!isNaN(d.getTime())) {
      ranAtLabel = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  }

  // 오늘 실행된 게 아니면(예: 어제 마지막으로 돈 채로 며칠 지남) "오늘"이라고 하면 헷갈리니 날짜를 같이 보여줌
  if (changes.length === 0) {
    wrap.innerHTML = `
      <div class="port-schedule-update-banner none">
        ℹ️ 마지막 자동 갱신(${escapeHtml(ranAtLabel)}) 때는 raw에 등록된 배 중 날짜가 바뀐 게 없었어요.
      </div>`;
    return;
  }

  const rows = changes.map((c) => {
    const arrivalChanged = c.oldArrivalDate !== c.newArrivalDate;
    const departureChanged = c.oldDepartureDate !== c.newDepartureDate;
    return `
      <tr>
        <td>${escapeHtml(c.vesselName || "-")}</td>
        <td>${escapeHtml(c.terminal || "-")}</td>
        <td>${arrivalChanged ? `<span class="port-schedule-update-old">${escapeHtml(c.oldArrivalDate || "-")}</span> → <b>${escapeHtml(c.newArrivalDate || "-")}</b>` : escapeHtml(c.newArrivalDate || "-")}</td>
        <td>${departureChanged ? `<span class="port-schedule-update-old">${escapeHtml(c.oldDepartureDate || "-")}</span> → <b>${escapeHtml(c.newDepartureDate || "-")}</b>` : escapeHtml(c.newDepartureDate || "-")}</td>
      </tr>`;
  }).join("");

  wrap.innerHTML = `
    <div class="port-schedule-update-banner">
      <div class="port-schedule-update-header" onclick="togglePortScheduleUpdateDetail()">
        🔄 자동 갱신(${escapeHtml(ranAtLabel)}) — <b>${changes.length}건</b> 일정 변경됨 <span id="portScheduleUpdateCaret">▾ 펼쳐보기</span>
      </div>
      <div id="portScheduleUpdateDetail" style="display:none;">
        <table class="contacts-table" style="margin-top:8px;">
          <tr><th>선명</th><th>터미널</th><th>입항일</th><th>출항일</th></tr>
          ${rows}
        </table>
      </div>
    </div>`;
}

function togglePortScheduleUpdateDetail() {
  const detail = document.getElementById("portScheduleUpdateDetail");
  const caret = document.getElementById("portScheduleUpdateCaret");
  if (!detail) return;
  const isOpen = detail.style.display !== "none";
  detail.style.display = isOpen ? "none" : "block";
  if (caret) caret.textContent = isOpen ? "▾ 펼쳐보기" : "▴ 접기";
}

function loadPortScheduleTab() {
  const wrap = document.getElementById("portScheduleWrap");
  if (!wrap) return;

  loadPortScheduleAutoUpdateBanner(); // 탭 처음 열릴 때든 재방문이든, 아직 안 읽어왔으면 항상 시도

  // ⚠️ 예전엔 이 탭에 들어올 때마다 화면(wrap.innerHTML)을 통째로 새로 그렸는데, 정작 데이터 구독은
  //    "처음 한 번만" 하도록 되어있어서 - 두 번째 방문부터는 화면만 텅 비워지고 아무도 다시 채워주질
  //    않았어요 (그래서 강제 새로고침을 눌러야만 다시 보였던 거예요). 이제는 화면을 만드는 것도
  //    딱 처음 한 번만 하고, 그다음부턴 이미 갖고 있는 데이터로 표·캘린더만 다시 그려요.
  if (liveSubscribed.portSchedule) {
    renderPortScheduleTable();
    renderPortScheduleCalendar();
    return;
  }

  wrap.innerHTML = `
    <div id="portScheduleSubTabButtons" class="sub-tab-buttons"></div>

    <div id="portScheduleAutoUpdateBanner"></div>

    <div id="portScheduleRawSection">
      <div class="desk-search-row">
        <label class="excel-upload-box" id="portScheduleUploadBox" style="padding:18px 14px;">
          <input type="file" id="portScheduleFileInput" accept=".xlsx,.xls" onchange="handlePortScheduleFile(event)">
          <div class="excel-upload-icon">📄</div>
          <div class="excel-upload-label">raw 전체 파일 올리기</div>
          <div class="excel-upload-sub">Vessel Name·Code·Voyage·Arrival·Terminal 등 raw 탭 그대로인 파일</div>
        </label>
        <div style="flex:1; min-width:260px;">
          <select id="portScheduleTerminalSelect" style="width:100%; padding:8px; margin-bottom:8px; border:1px solid #e5e7eb; border-radius:8px;">
            <option value="">↓ 먼저 어느 터미널 파일인지 선택하세요</option>
            <option value="BCT">BCT</option>
            <option value="PNIT">PNIT</option>
            <option value="HPNT">HPNT</option>
            <option value="BPT">BPT (신선대/감만)</option>
            <option value="HJIT">한진인천 (HJIT)</option>
          </select>
          <label class="excel-upload-box" id="portScheduleTerminalUploadBox" style="padding:18px 14px; display:block;">
            <input type="file" id="portScheduleTerminalFileInput" accept=".xlsx,.xls" onchange="handlePortScheduleTerminalFile(event)">
            <div class="excel-upload-icon">🚢</div>
            <div class="excel-upload-label">터미널 갱신용 엑셀 올리기</div>
            <div class="excel-upload-sub">선명으로 매칭해서 입항일·출항일·터미널만 갱신해요 (마감자 등은 안 건드림)</div>
          </label>
        </div>
      </div>
      <div id="portScheduleUploadResult"></div>
      <button class="btn generate-btn" style="margin:12px 0;" onclick="openPortScheduleEditForm(null)">＋ 직접 한 건 등록</button>
      <div id="portScheduleEditFormWrap"></div>
      <div id="portScheduleTableWrap"></div>
    </div>

    <div id="portScheduleCalendarSection" style="display:none;">
      <div class="hint" style="margin-bottom:10px;">시작일(보통 일요일)을 고르면 그날부터 2주치를 달력 형태로 보여줘요. 매주 월요일에 그 주 일요일 날짜로 바꿔주세요.</div>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:14px;">
        <input type="date" id="portScheduleCalStartInput" onchange="renderPortScheduleCalendar()">
        <span class="hint" style="margin:0;">※ 되도록 일요일로 골라주세요</span>
        <button type="button" id="portScheduleHideFeedbackBtn" class="btn secondary-btn" onclick="togglePortScheduleFeedbackFab()" style="margin-left:auto;">📷 캡처할 때 "의견 남기기" 버튼 숨기기</button>
      </div>
      <div id="portScheduleCalendarWrap"></div>
    </div>
  `;

  renderPortScheduleSubTabButtons();

  // 캘린더 시작일 기본값: 오늘이 속한 주의 일요일
  const calInput = document.getElementById("portScheduleCalStartInput");
  if (calInput && !calInput.value) {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    calInput.value = sunday.getFullYear() + "-" + String(sunday.getMonth() + 1).padStart(2, "0") + "-" + String(sunday.getDate()).padStart(2, "0");
  }
  renderPortScheduleCalendar();

  window.fbReady.then(() => {
    portScheduleUnsubscribe = window.fbDb.collection(PORT_SCHEDULE_COLLECTION).onSnapshot(
      (snapshot) => {
        PORT_SCHEDULE_LIST = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            vesselName: d.vesselName || "",
            vesselCode: d.vesselCode || "",
            voyage: d.voyage || "",
            arrivalDate: d.arrivalDate || "",
            departureDate: d.departureDate || "",
            terminal: d.terminal || "",
            line: d.line || "",
            manager: d.manager || "",
            cargoDeadlineDate: d.cargoDeadlineDate || "",
            cargoDeadlineTime: d.cargoDeadlineTime || "",
            anSendDate: d.anSendDate || "",
          };
        });
        renderPortScheduleTable();
        renderPortScheduleCalendar();
      },
      (err) => console.error("노션 입항 스케줄 실시간 구독 실패:", err)
    );
  });
  liveSubscribed.portSchedule = true;
  liveTabUnsubscribers.portSchedule = () => { if (portScheduleUnsubscribe) { portScheduleUnsubscribe(); portScheduleUnsubscribe = null; liveSubscribed.portSchedule = false; } };
}

/* 새로고침 버튼용 - 기존 구독을 끊고 강제로 다시 읽어옴 */
function forceRefreshPortScheduleTab() {
  if (portScheduleUnsubscribe) { portScheduleUnsubscribe(); portScheduleUnsubscribe = null; }
  liveSubscribed.portSchedule = false;
  loadPortScheduleTab();
}

/* 노션용 캘린더 - 예전 엑셀 파일의 수식(IFERROR+TEXTJOIN+FILTER)이랑 똑같은 로직이에요:
   그날 입항하는 배들을 "LINE) 선명 코드 항차 (터미널)" 형태로 나열하고,
   적하목록 제출일/시간이 있으면 그 아래 한 줄, AN발송예정일 있으면 또 한 줄 추가함 */
function formatMMDD(dateStr) {
  const m = String(dateStr || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? m[1] + "/" + m[2] : "";
}

/* 배 한 척당 하나의 블록으로 만듦 - 첫 줄(선명)은 볼드, 블록 사이엔 간격을 둬서 한눈에 잘 들어오게 함 */
function buildPortScheduleCellHtml(items) {
  return items.map((p, i) => {
    const linePrefix = p.line ? escapeHtml(p.line) + ") " : "";
    const vesselPart = escapeHtml([p.vesselName, p.vesselCode, p.voyage].filter(Boolean).join(" "));
    const terminalPart = p.terminal ? ` (${escapeHtml(p.terminal)})` : "";
    let extra = "";
    if (p.anSendDate) {
      extra += `<div class="port-cal-line">AN 발송 예정: ${formatMMDD(p.anSendDate)}</div>`;
    }
    if (p.cargoDeadlineDate) {
      const timePart = p.cargoDeadlineTime ? " " + escapeHtml(p.cargoDeadlineTime) : " (시간 미정)";
      extra += `<div class="port-cal-line">적하목록 제출: ${formatMMDD(p.cargoDeadlineDate)}${timePart}</div>`;
    }
    const divider = i > 0 ? '<div class="port-cal-divider"></div>' : "";
    return `${divider}<div class="port-cal-vessel"><div class="port-cal-vessel-name">${linePrefix}${vesselPart}${terminalPart}</div>${extra}</div>`;
  }).join("");
}

/* 캘린더 캡처할 때 화면 오른쪽 아래 "의견 남기기" 버튼이 같이 찍히지 않게, 잠깐 숨겼다가 다시 보이게 함 */
function togglePortScheduleFeedbackFab() {
  const fab = document.querySelector(".feedback-fab");
  const btn = document.getElementById("portScheduleHideFeedbackBtn");
  if (!fab || !btn) return;
  const hidden = fab.style.display === "none";
  fab.style.display = hidden ? "" : "none";
  btn.textContent = hidden ? '📷 캡처할 때 "의견 남기기" 버튼 숨기기' : '👁️ "의견 남기기" 버튼 다시 보이기';
}

function renderPortScheduleCalendar() {
  const wrap = document.getElementById("portScheduleCalendarWrap");
  const startInput = document.getElementById("portScheduleCalStartInput");
  if (!wrap || !startInput || !startInput.value) return;

  const startDate = new Date(startInput.value + "T00:00:00");
  const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

  // 데이 date별로 미리 묶어둠 (같은 날짜에 여러 배가 있을 수 있어서)
  const byDate = {};
  PORT_SCHEDULE_LIST.forEach((p) => {
    if (!p.arrivalDate) return;
    if (!byDate[p.arrivalDate]) byDate[p.arrivalDate] = [];
    byDate[p.arrivalDate].push(p);
  });

  let html = `<div style="font-weight:700; margin-bottom:10px; color:#1155cc; font-size:14px;">${startDate.getMonth() + 1}월 수입 입항 캘린더 (2주)</div>`;
  html += `<div style="overflow-x:auto;"><table class="port-schedule-calendar">`;
  // 일요일·토요일은 주말이라 배경색을 다르게 줌 (원본 엑셀 색감이랑 맞춤)
  html += `<tr>${weekdayLabels.map((w, i) => `<th class="${i === 0 || i === 6 ? "port-cal-weekend-th" : ""}">${w}</th>`).join("")}</tr>`;

  for (let week = 0; week < 2; week++) {
    html += "<tr>";
    for (let day = 0; day < 7; day++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + week * 7 + day);
      const dateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const items = byDate[dateStr] || [];
      const cellHtml = buildPortScheduleCellHtml(items);
      html += `<td><div class="port-cal-date">${d.getMonth() + 1}월 ${d.getDate()}일</div><div class="port-cal-body">${cellHtml}</div></td>`;
    }
    html += "</tr>";
  }
  html += "</table></div>";
  html += `<div class="port-cal-footnote">
    입항 스케줄은 운항사정에 따라 변동될 수 있습니다.<br>
    자세한 입항 일정 및 시간은 각 터미널 사이트에서 확인 부탁드립니다.
  </div>`;
  wrap.innerHTML = html;
}

let portScheduleQuery = "";
let portScheduleHideEmpty = false;
let portScheduleMonthFilter = ""; // "" = 전체, "2026-08" 같은 형식이면 그 달만
let portScheduleLineFilter = ""; // "" = 전체
let portScheduleManagerFilter = ""; // "" = 전체
let portScheduleSearchDebounceTimer = null;

/* 검색창에 칠 때마다 바로바로 636건씩 다시 걸러내면 타이핑이 버벅일 수 있어서,
   짧게(120ms) 기다렸다가 입력이 멈추면 그때 한 번만 다시 그려요. */
function onPortScheduleSearchInput(value) {
  portScheduleQuery = value;
  if (portScheduleSearchDebounceTimer) clearTimeout(portScheduleSearchDebounceTimer);
  portScheduleSearchDebounceTimer = setTimeout(renderPortScheduleRows, 120);
}

function renderPortScheduleTable() {
  const wrap = document.getElementById("portScheduleTableWrap");
  if (!wrap) return;

  if (PORT_SCHEDULE_LIST.length === 0) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 스케줄이 없어요. 위에서 엑셀을 올려주세요.</div>';
    return;
  }

  // 검색창·드롭다운(컨트롤)은 데이터가 바뀌었을 때만 새로 만들고, 검색어 입력처럼 자주 일어나는 일은
  // 아래 renderPortScheduleRows()가 표 부분만 다시 그려요. 컨트롤 영역까지 매번 통째로 새로 그리면
  // 그 안의 검색창(<input>)도 매번 새로 만들어지는 셈이라, 한 글자 칠 때마다 포커스가 빠져서
  // "한 글자씩만 입력되는" 것처럼 느껴지는 문제가 있었어요.
  if (!document.getElementById("portScheduleControlsWrap")) {
    wrap.innerHTML = `
      <div id="portScheduleControlsWrap"></div>
      <div id="portScheduleRowsWrap"></div>
    `;
  }
  renderPortScheduleControls();
  renderPortScheduleRows();
}

/* 검색창·필터 드롭다운 - 데이터가 바뀌었을 때(실시간 갱신, 필터 선택 등)만 다시 그림 */
function renderPortScheduleControls() {
  const controlsWrap = document.getElementById("portScheduleControlsWrap");
  if (!controlsWrap) return;

  // 공통 조건(입항일 없는 항목 숨기기)만 우선 적용
  const baseList = portScheduleHideEmpty
    ? PORT_SCHEDULE_LIST.filter((r) => !!r.arrivalDate)
    : PORT_SCHEDULE_LIST;

  // 드롭다운 하나하나는 "자기 자신 빼고 나머지 필터가 이미 적용된" 목록 기준으로 옵션을 만들어요.
  // (엑셀 자동필터처럼 서로 연동되게 - 8월로 걸면 LINE·마감자엔 8월에 실제로 있는 값만 나와요)
  const matchesExcept = (r, exceptKey) => {
    if (exceptKey !== "month" && portScheduleMonthFilter && (r.arrivalDate || "").slice(0, 7) !== portScheduleMonthFilter) return false;
    if (exceptKey !== "line" && portScheduleLineFilter && (r.line || "").trim() !== portScheduleLineFilter) return false;
    if (exceptKey !== "manager" && portScheduleManagerFilter && (r.manager || "").trim() !== portScheduleManagerFilter) return false;
    return true;
  };

  const months = Array.from(new Set(
    baseList.filter((r) => matchesExcept(r, "month")).map((r) => (r.arrivalDate || "").slice(0, 7)).filter(Boolean)
  )).sort((a, b) => b.localeCompare(a));

  const lines = Array.from(new Set(
    baseList.filter((r) => matchesExcept(r, "line")).map((r) => (r.line || "").trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const managers = Array.from(new Set(
    baseList.filter((r) => matchesExcept(r, "manager")).map((r) => (r.manager || "").trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  // 지금 골라둔 값이 새 옵션 목록에 더는 없으면(예: 8월로 바꿨는데 이전에 고른 LINE이 8월엔 없음) 자동으로 "전체"로 풀어줌
  if (portScheduleLineFilter && !lines.includes(portScheduleLineFilter)) portScheduleLineFilter = "";
  if (portScheduleManagerFilter && !managers.includes(portScheduleManagerFilter)) portScheduleManagerFilter = "";

  controlsWrap.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:10px 0;">
      <input type="text" id="portScheduleSearchInput" placeholder="선명·코드·항차·터미널·LINE·마감자로 검색..."
        value="${escapeHtml(portScheduleQuery)}" style="flex:1; min-width:220px; padding:8px;"
        oninput="onPortScheduleSearchInput(this.value)" />
      <select style="padding:8px;" onchange="portScheduleMonthFilter=this.value; renderPortScheduleTable();">
        <option value="">입항월: 전체</option>
        ${months.map((m) => `<option value="${m}" ${portScheduleMonthFilter === m ? "selected" : ""}>${m.replace("-", "년 ")}월</option>`).join("")}
      </select>
      <select style="padding:8px;" onchange="portScheduleLineFilter=this.value; renderPortScheduleTable();">
        <option value="">LINE: 전체</option>
        ${lines.map((l) => `<option value="${escapeHtml(l)}" ${portScheduleLineFilter === l ? "selected" : ""}>${escapeHtml(l)}</option>`).join("")}
      </select>
      <select style="padding:8px;" onchange="portScheduleManagerFilter=this.value; renderPortScheduleTable();">
        <option value="">마감자: 전체</option>
        ${managers.map((m) => `<option value="${escapeHtml(m)}" ${portScheduleManagerFilter === m ? "selected" : ""}>${escapeHtml(m)}</option>`).join("")}
      </select>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; white-space:nowrap;">
        <input type="checkbox" ${portScheduleHideEmpty ? "checked" : ""}
          onchange="portScheduleHideEmpty=this.checked; renderPortScheduleTable();" />
        입항일 없는 항목 숨기기
      </label>
      <span class="hint" id="portScheduleCountLabel" style="margin:0;"></span>
    </div>
  `;
}

/* 표(행)만 다시 그림 - 검색어 입력, 필터 조합 계산 등 자주 일어나는 일은 여기서만 처리해서
   검색창·드롭다운 DOM은 안 건드림 (포커스 유지 + 매번 컨트롤 다시 계산 안 해도 되니 더 빠름) */
function renderPortScheduleRows() {
  const rowsWrap = document.getElementById("portScheduleRowsWrap");
  if (!rowsWrap) return;

  const q = portScheduleQuery.trim().toUpperCase();
  let filtered = PORT_SCHEDULE_LIST.filter((r) => {
    if (portScheduleHideEmpty && !r.arrivalDate) return false;
    if (portScheduleMonthFilter && (r.arrivalDate || "").slice(0, 7) !== portScheduleMonthFilter) return false;
    if (portScheduleLineFilter && (r.line || "").trim() !== portScheduleLineFilter) return false;
    if (portScheduleManagerFilter && (r.manager || "").trim() !== portScheduleManagerFilter) return false;
    if (!q) return true;
    return [r.vesselName, r.vesselCode, r.voyage, r.terminal, r.line, r.manager]
      .some((v) => String(v || "").toUpperCase().includes(q));
  });

  const sorted = filtered.slice().sort((a, b) => (a.arrivalDate || "").localeCompare(b.arrivalDate || ""));

  const rows = sorted.map((r) => `
    <tr data-id="${escapeHtml(r.id)}">
      <td>${escapeHtml(r.vesselName)}</td>
      <td>${escapeHtml(r.vesselCode)}</td>
      <td>${escapeHtml(r.voyage)}</td>
      <td>${escapeHtml(r.arrivalDate)}</td>
      <td>${escapeHtml(r.departureDate)}</td>
      <td>${escapeHtml(r.terminal)}</td>
      <td>${escapeHtml(r.line)}</td>
      <td>${escapeHtml(r.manager)}</td>
      <td>${escapeHtml(r.cargoDeadlineDate)} ${escapeHtml(r.cargoDeadlineTime)}</td>
      <td>${escapeHtml(r.anSendDate)}</td>
      <td class="poa-row-actions">
        <button type="button" class="poa-edit-btn" title="수정" onclick="openPortScheduleEditForm('${escapeHtml(r.id)}')">✏️</button>
        <button type="button" class="poa-delete-btn" title="삭제" onclick="deletePortScheduleRow('${escapeHtml(r.id)}')">🗑️</button>
      </td>
    </tr>
  `).join("");

  rowsWrap.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="port-schedule-table">
        <tr>
          <th>선명</th><th>코드</th><th>항차</th><th>입항일</th><th>출항일</th>
          <th>터미널</th><th>LINE</th><th>마감자</th><th>적하목록 제출</th><th>AN발송예정</th><th>관리</th>
        </tr>
        ${rows || '<tr><td colspan="11" style="text-align:center; padding:20px;">검색 결과가 없어요.</td></tr>'}
      </table>
    </div>
  `;

  const countLabel = document.getElementById("portScheduleCountLabel");
  if (countLabel) countLabel.textContent = `${sorted.length.toLocaleString()} / ${PORT_SCHEDULE_LIST.length.toLocaleString()}건`;
}

async function deletePortScheduleRow(id) {
  if (!confirm("이 항목을 삭제할까요?")) return;
  try {
    await window.fbReady;
    await window.fbDb.collection(PORT_SCHEDULE_COLLECTION).doc(id).delete();
  } catch (err) {
    alert("삭제 실패: " + err);
  }
}

/* ---------- 직접 등록/수정 폼 (마감자·적하목록 제출일 등 팀원이 손으로 입력하는 항목용) ---------- */
function openPortScheduleEditForm(id) {
  const item = id ? PORT_SCHEDULE_LIST.find((r) => r.id === id) : null;
  const formWrap = document.getElementById("portScheduleEditFormWrap");
  if (!formWrap) return;

  const v = (field) => escapeHtml(item ? item[field] || "" : "");
  formWrap.innerHTML = `
    <div class="anemail-form" style="display:block;">
      <div class="anemail-form-title">${item ? "항목 수정" : "새 항목 직접 등록"}</div>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
        <input id="psf-vesselName" type="text" placeholder="선명" value="${v("vesselName")}" />
        <input id="psf-vesselCode" type="text" placeholder="선박코드" value="${v("vesselCode")}" />
        <input id="psf-voyage" type="text" placeholder="항차" value="${v("voyage")}" />
        <input id="psf-arrivalDate" type="date" value="${v("arrivalDate")}" onchange="syncPortScheduleAnSendDate()" />
        <input id="psf-departureDate" type="date" value="${v("departureDate")}" />
        <input id="psf-terminal" type="text" placeholder="터미널" value="${v("terminal")}" />
        <input id="psf-line" type="text" placeholder="LINE" value="${v("line")}" />
        <input id="psf-manager" type="text" placeholder="마감자" value="${v("manager")}" />
        <input id="psf-cargoDeadlineDate" type="date" value="${v("cargoDeadlineDate")}" />
        <input id="psf-cargoDeadlineTime" type="text" placeholder="적하목록 제출 시간 (예: 오후 3:00)" value="${v("cargoDeadlineTime")}" />
        <input id="psf-anSendDate" type="date" value="${v("anSendDate")}" />
      </div>
      <div class="hint" style="margin:6px 0 0;">💡 입항일을 바꾸면 AN발송예정일(입항일 -2일)이 자동으로 같이 바뀌어요. 직접 다른 날짜로 고치고 싶으면 그 칸을 따로 수정하시면 돼요.</div>
      <div class="anemail-form-actions">
        <button id="psf-save" type="button" onclick="savePortScheduleForm('${item ? item.id : ""}')">${item ? "수정 저장" : "등록"}</button>
        <button type="button" onclick="document.getElementById('portScheduleEditFormWrap').innerHTML=''">취소</button>
      </div>
      <div id="psf-status"></div>
    </div>
  `;

  // 수정 버튼을 눌렀을 때, 스크롤이 아무리 내려가 있어도 폼이 있는 위치로 자동으로 올라가게
  formWrap.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* 입항일이 바뀌면 AN발송예정일(입항일 - 2일)도 자동으로 같이 채워줌 */
function syncPortScheduleAnSendDate() {
  const arrivalInput = document.getElementById("psf-arrivalDate");
  const anSendInput = document.getElementById("psf-anSendDate");
  if (!arrivalInput || !anSendInput || !arrivalInput.value) return;
  anSendInput.value = subtractDaysFromDateStr(arrivalInput.value, 2);
}

async function savePortScheduleForm(id) {
  const val = (fieldId) => document.getElementById(fieldId).value.trim();
  const vesselName = val("psf-vesselName");
  const vesselCode = val("psf-vesselCode");
  const voyage = val("psf-voyage");
  const arrivalDate = val("psf-arrivalDate");

  if (!vesselName) { alert("선명은 필수예요."); return; }

  const entry = {
    vesselName, vesselCode, voyage, arrivalDate,
    departureDate: val("psf-departureDate"),
    terminal: val("psf-terminal"),
    line: val("psf-line"),
    manager: val("psf-manager"),
    cargoDeadlineDate: val("psf-cargoDeadlineDate"),
    cargoDeadlineTime: val("psf-cargoDeadlineTime"),
    anSendDate: val("psf-anSendDate") || (arrivalDate ? subtractDaysFromDateStr(arrivalDate, 2) : ""),
  };

  const statusEl = document.getElementById("psf-status");
  if (statusEl) statusEl.textContent = "저장 중...";

  try {
    await window.fbReady;
    // 새로 등록하는 거면 선박코드+항차+터미널로 고정 ID를 씀(중복 방지), 기존 걸 고치는 거면 그 문서 ID 그대로 유지
    const docId = id || portScheduleDocId(vesselCode, voyage, entry.terminal);
    await window.fbDb.collection(PORT_SCHEDULE_COLLECTION).doc(docId).set(
      Object.assign({}, entry, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }),
      { merge: true }
    );
    document.getElementById("portScheduleEditFormWrap").innerHTML = "";
  } catch (err) {
    if (statusEl) statusEl.textContent = "저장 실패: " + err;
  }
}

/* ---------- BCT·PNIT·HPNT 갱신용 엑셀 (선명으로 매칭해서 입항일/출항일/터미널만 갱신) ---------- */
/* 별칭은 "더 구체적인 것부터" 순서대로 적어두고, 그 순서대로 찾아서 씀.
   (BCT 파일은 "입항"·"출항" 컬럼에 날짜가 아니라 항차번호가 들어있고, 진짜 날짜는
   "접안예정시간(ETB)"·"출항예정시간(ETD)"에 있어서, 이 순서가 중요해요) */
const TERMINAL_UPDATE_HEADER_ALIASES = {
  vesselName: ["모선명", "선박명", "선명"],
  arrival: ["접안예정시간(etb)", "접안(예정)일시", "etb", "입항예정일시", "입항일시", "입항"],
  departure: ["출항예정시간(etd)", "출항(예정)일시", "etd", "출항예정일시", "출항일시", "출항"],
};

/* 별칭 목록을 "순서대로" 검사해서, 제일 먼저 매칭되는 컬럼을 씀 (우선순위 보장) */
function findFirstMatchingColumn(cellsLower, aliases) {
  for (const alias of aliases) {
    const idx = cellsLower.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function findTerminalUpdateHeaderRow(aoa) {
  for (let r = 0; r < Math.min(aoa.length, 5); r++) {
    const row = aoa[r] || [];
    const cellsLower = row.map((c) => String(c || "").trim().toLowerCase());
    const vesselCol = findFirstMatchingColumn(cellsLower, TERMINAL_UPDATE_HEADER_ALIASES.vesselName);
    const arrivalCol = findFirstMatchingColumn(cellsLower, TERMINAL_UPDATE_HEADER_ALIASES.arrival);
    if (vesselCol >= 0 && arrivalCol >= 0) {
      const colMap = {
        vesselName: vesselCol,
        arrival: arrivalCol,
        departure: findFirstMatchingColumn(cellsLower, TERMINAL_UPDATE_HEADER_ALIASES.departure),
      };
      return { headerRowIdx: r, colMap };
    }
  }
  return null;
}

/* BCT는 진짜 .xlsx 바이너리지만, PNIT·HPNT·BPT·한진인천은 "HTML 표를 xls로
   이름만 바꾼 파일"이에요. 그래서 파일 내용을 먼저 살짝 들여다봐서 HTML인지
   진짜 엑셀인지 구분한 다음, 각각 다른 방식으로 읽어요. */
function parseTerminalFileToAOA(arrayBuffer) {
  const peekText = new TextDecoder("utf-8", { fatal: false }).decode(arrayBuffer.slice(0, 4000)).toLowerCase();
  if (peekText.includes("<table") || peekText.includes("<html")) {
    let fullText = new TextDecoder("utf-8", { fatal: false }).decode(arrayBuffer);
    if (/\ufffd/.test(fullText.slice(0, 3000))) {
      // UTF-8로 읽었더니 한글이 다 깨져 보이면(BPT처럼 EUC-KR로 저장된 경우), EUC-KR로 다시 읽음
      fullText = new TextDecoder("euc-kr", { fatal: false }).decode(arrayBuffer);
    }
    return parseHtmlTableToAOA(fullText);
  }
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
}

/* HTML 안에서 "행이 제일 많은(=진짜 데이터인) 표"를 찾아서 2차원 배열로 변환 */
function parseHtmlTableToAOA(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  let bestTable = null, bestRowCount = 0;
  tables.forEach((t) => {
    const rc = t.querySelectorAll("tr").length;
    if (rc > bestRowCount) { bestRowCount = rc; bestTable = t; }
  });
  if (!bestTable) return [];
  return Array.from(bestTable.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.querySelectorAll("th,td")).map((c) => c.textContent.replace(/\s+/g, " ").trim())
  );
}

function handlePortScheduleTerminalFile(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length) return;

  const terminalSelect = document.getElementById("portScheduleTerminalSelect");
  const terminalName = terminalSelect ? terminalSelect.value : "";
  if (!terminalName) {
    alert("먼저 어느 터미널 파일인지 위에서 선택해주세요.");
    return;
  }
  processPortScheduleTerminalFile(files[0], terminalName);
}

function findHanjinIncheonHeaderRow(aoa) {
  for (let r = 0; r < Math.min(aoa.length, 6); r++) {
    const row = aoa[r] || [];
    const cells = row.map((c) => String(c || "").trim());

    // ✅ 새 형식("선석배정현황" 등 - 한진인천이 요즘 주는 진짜 xlsx, 헤더가 한 줄로 깔끔함):
    //    "모선명(Route)"처럼 괄호가 붙어있어도 "모선명"이 포함되면 찾고, 접안/출항 예정일시도
    //    같은 줄에서 바로 찾아지면 그 위치를 그대로 씀 (터미널이 컬럼 순서를 바꿔도 안전함)
    const vesselIdx = cells.findIndex((c) => c.includes("모선명"));
    const arrivalIdx = cells.findIndex((c) => c.replace(/[()]/g, "").includes("접안") && c.includes("일시"));
    const departureIdx = cells.findIndex((c) => c.replace(/[()]/g, "").includes("출항") && c.includes("일시"));
    if (vesselIdx >= 0 && arrivalIdx >= 0 && departureIdx >= 0) {
      return { headerRowIdx: r, colMap: { vesselName: vesselIdx, arrival: arrivalIdx, departure: departureIdx } };
    }

    // 옛날 형식(한진인천 홈페이지를 그대로 xls로 내려받은 것 - 헤더가 2줄로 나뉘어 있어서(rowspan/colspan)
    //    이 줄에는 "모선명"이라는 셀만 정확히 있고 접안/출항 컬럼명은 안 보여요): 예전에 직접 확인해둔
    //    고정 컬럼 순서를 그대로 씀 -
    //    0:항차 1:모선명 2:선사 3:입항(항차번호, 날짜 아님!) 4:출항(항차번호, 날짜 아님!)
    //    5:CCT 6:ETB/ATB(진짜 입항일시) 7:ETD/ATD(진짜 출항일시) 8:양하 9:적하 10:이적 11:선석 12:노선명
    if (cells.some((c) => c === "모선명")) {
      return { headerRowIdx: r, colMap: { vesselName: 1, arrival: 6, departure: 7 } };
    }
  }
  return null;
}

function processPortScheduleTerminalFile(file, terminalName) {
  if (portScheduleUploadBusy) {
    alert("아직 이전 파일을 처리하고 있어요. 잠시만 기다려주세요.");
    return;
  }
  portScheduleUploadBusy = true;
  const resultEl = document.getElementById("portScheduleUploadResult");
  if (resultEl) resultEl.innerHTML = '<div class="anemail-loading">파일 읽고 매칭하는 중...</div>';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const aoa = parseTerminalFileToAOA(e.target.result);

      // 한진인천만 헤더가 2줄로 꼬여있어서 전용 로직을 씀, 나머지는 일반 방식
      const headerInfo = terminalName === "HJIT" ? findHanjinIncheonHeaderRow(aoa) : findTerminalUpdateHeaderRow(aoa);
      if (!headerInfo) {
        throw new Error('선명("모선명"/"선박명"/"선명")과 입항 관련 컬럼을 못 찾았어요. 파일 형식을 확인해주세요.');
      }
      const { headerRowIdx, colMap } = headerInfo;

      const updated = [];
      const notFound = [];
      const ambiguous = [];
      const terminalMismatch = []; // 이미 다른 터미널로 등록되어 있는 배 - 자동으로 안 덮어쓰고 따로 알려줌

      for (let r = headerRowIdx + 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!row) continue;
        const get = (key) => (colMap[key] >= 0 ? row[colMap[key]] : null);
        // "모선명(Route)" 컬럼처럼 선명 뒤에 항로/서비스 코드가 괄호로 붙어있는 경우가 있어서
        // (예: "DONGJIN CONTINENTAL(IHP)"), 끝에 붙은 괄호 하나는 매칭 전에 떼어냄
        const vesselName = String(get("vesselName") || "").trim().replace(/\s*\([^()]*\)\s*$/, "").trim();
        if (!vesselName) continue;

        const arrivalDate = parsePortScheduleDate(get("arrival"));
        const departureDate = parsePortScheduleDate(get("departure"));

        // 같은 배 이름이어도, "같은 배가 매달 반복 입항"하는 경우가 많아서
        // 이름만으로 좁히면 1년치 데이터 중에 계속 여러 건이 걸려요.
        // 그래서 터미널 파일의 입항월과 같은 달인 것만 후보로 좁혀요.
        const targetMonth = arrivalDate ? arrivalDate.slice(0, 7) : "";
        let matches = PORT_SCHEDULE_LIST.filter((p) => {
          if (p.vesselName.trim().toUpperCase() !== vesselName.toUpperCase()) return false;
          if (!targetMonth) return true; // 터미널 파일에 입항일 자체가 없으면 달로 못 좁히니 이름만으로 판단
          return (p.arrivalDate || "").slice(0, 7) === targetMonth;
        });

        // ⚠️ 같은 달에 같은 배가 여러 번(예: 8/9, 8/28) 있으면, 예전엔 "애매함" 처리해서 매번 직접
        //    골라주셔야 했어요. 이제는 오늘 날짜 기준으로 "아직 지나지 않은 일정 중 가장 가까운 것"을
        //    자동으로 골라요 - 이미 지나간(예정일이 오늘보다 과거인) 일정은 어차피 갱신 대상이 아닐
        //    가능성이 높고, 다가올 일정 중 제일 가까운 게 지금 갱신하려는 그 항차일 확률이 높거든요.
        if (matches.length > 1) {
          const todayStr = new Date().toISOString().slice(0, 10);
          const upcoming = matches
            .filter((p) => (p.arrivalDate || "") >= todayStr)
            .sort((a, b) => (a.arrivalDate || "").localeCompare(b.arrivalDate || ""));
          if (upcoming.length > 0) {
            matches = [upcoming[0]];
          }
          // upcoming이 0건이면(전부 이미 지난 일정) 그대로 두어서 아래 "여러 건" 분기로 빠지게 함 -
          // 이 경우엔 자동으로 판단하기 애매하니 예전처럼 직접 확인해달라고 알려드려요.
        }

        if (matches.length === 0) {
          notFound.push(vesselName);
        } else if (matches.length > 1) {
          ambiguous.push(vesselName);
        } else {
          const existing = matches[0];
          // ⚠️ 이미 다른 터미널로 등록되어 있으면(예: 광양서부인데 BPT 파일에 이름이 겹침) 자동으로
          //    덮어쓰지 않아요. 터미널이 다르면 배정 자체가 바뀐 게 아니라 다른 배일 가능성이 높거든요.
          if (existing.terminal && existing.terminal !== terminalName) {
            terminalMismatch.push({ vesselName, existingTerminal: existing.terminal });
          } else {
            updated.push({ id: existing.id, vesselName, arrivalDate, departureDate });
          }
        }
      }

      if (updated.length > 0) {
        await window.fbReady;
        let batch = window.fbDb.batch();
        updated.forEach((u) => {
          const docRef = window.fbDb.collection(PORT_SCHEDULE_COLLECTION).doc(u.id);
          const fields = { terminal: terminalName, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
          if (u.arrivalDate) fields.arrivalDate = u.arrivalDate;
          if (u.departureDate) fields.departureDate = u.departureDate;
          batch.update(docRef, fields);
        });
        await batch.commit();
      }

      let html = `<div style="display:flex; justify-content:flex-end;"><button type="button" class="port-result-close-btn" onclick="document.getElementById('portScheduleUploadResult').innerHTML=''">✕ 닫기</button></div>`;
      html += `<div class="excel-question-box">✅ [${escapeHtml(terminalName)}] ${updated.length}건 갱신 완료</div>`;
      if (ambiguous.length) {
        html += `<div class="excel-warning-box" style="margin-top:8px;">
          <div class="excel-warning-title">⚠️ 이름이 같은 배가 여러 건이라 자동 갱신 안 한 것 ${ambiguous.length}건 (직접 확인해서 수정 버튼으로 고쳐주세요)</div>
          <ul style="margin:8px 0 0 18px;">${ambiguous.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
        </div>`;
      }
      if (terminalMismatch.length) {
        html += `<div class="excel-warning-box" style="margin-top:8px;">
          <div class="excel-warning-title">⚠️ 이미 다른 터미널로 등록되어 있어서 자동 갱신 안 한 것 ${terminalMismatch.length}건 (배정이 실제로 바뀐 거면 직접 수정 버튼으로 고쳐주세요)</div>
          <ul style="margin:8px 0 0 18px;">${terminalMismatch.map((m) => `<li>${escapeHtml(m.vesselName)} — 현재 ${escapeHtml(m.existingTerminal)} → [${escapeHtml(terminalName)}] 파일에 있음</li>`).join("")}</ul>
        </div>`;
      }
      if (notFound.length) {
        html += `<div class="excel-warning-box" style="margin-top:8px;">
          <div class="excel-warning-title">⚠️ raw 목록에 없어서 못 찾은 배 ${notFound.length}건 (아직 등록 안 됐을 수 있어요)</div>
          <ul style="margin:8px 0 0 18px;">${notFound.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
        </div>`;
      }
      if (resultEl) resultEl.innerHTML = html;
    } catch (err) {
      if (resultEl) resultEl.innerHTML = `<div class="anemail-empty">❌ 처리 실패: ${escapeHtml(String(err.message || err))}</div>`;
    } finally {
      portScheduleUploadBusy = false;
    }
  };
  reader.onerror = () => {
    if (resultEl) resultEl.innerHTML = '<div class="anemail-empty">❌ 파일을 읽을 수 없어요.</div>';
    portScheduleUploadBusy = false;
  };
  reader.readAsArrayBuffer(file);
}

/* ---------- raw 전체 엑셀 업로드 → 파싱 → 일괄 반영 ---------- */

const PORT_SCHEDULE_HEADER_ALIASES = {
  vesselName: ["vessel name", "선명"],
  vesselCode: ["vessel code", "선박코드", "코드"],
  voyage: ["voyage", "항차"],
  // "Vessel" 한 컬럼에 "JADE I (ZJ3) 9E"처럼 이름+코드+항차가 다 같이 들어있는 형식(ZIM/GSL Integrated Schedule 등)도 지원
  vesselCombined: ["vessel"],
  arrival: ["arrival", "입항", "입항일"],
  departure: ["departure", "출항", "출항일"],
  terminal: ["terminal", "터미널"],
  line: ["line", "선사"],
  manager: ["마감자"],
  cargoDeadlineDate: ["적하목록 제출일"],
  cargoDeadlineTime: ["적하목록 제출 시간"],
  anSendDate: ["an 발송 예정일", "an발송예정일"],
};

/* "JADE I (ZJ3) 9E" 처럼 한 셀에 이름+코드+항차가 다 같이 들어있는 걸 세 개로 쪼갬.
   패턴에 안 맞으면 null (그럼 그냥 vesselName 칸에 원본 그대로 들어감) */
function splitCombinedVesselCell(raw) {
  const str = String(raw || "").trim();
  if (!str) return null;
  const m = str.match(/^(.*?)\s*\(([^()]+)\)\s*(\S+)\s*$/);
  if (!m) return null;
  return { name: m[1].trim(), code: m[2].trim(), voyage: m[3].trim() };
}

function findPortScheduleHeaderRow(aoa) {
  for (let r = 0; r < Math.min(aoa.length, 5); r++) {
    const row = aoa[r] || [];
    const cellsLower = row.map((c) => String(c || "").trim().toLowerCase());
    const hasVesselName = cellsLower.some((c) => c === "vessel name" || c === "선명" || c === "vessel");
    const hasArrival = cellsLower.some((c) => c.includes("arrival") || c === "입항" || c === "입항일");
    if (hasVesselName && hasArrival) {
      const colMap = {};
      Object.keys(PORT_SCHEDULE_HEADER_ALIASES).forEach((key) => {
        const aliases = PORT_SCHEDULE_HEADER_ALIASES[key];
        const idx = cellsLower.findIndex((c) => aliases.includes(c));
        colMap[key] = idx; // 못 찾으면 -1
      });
      return { headerRowIdx: r, colMap };
    }
  }
  return null;
}

function handlePortScheduleFile(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (files.length) processPortScheduleFile(files[0]);
}

function processPortScheduleFile(file) {
  if (portScheduleUploadBusy) {
    alert("아직 이전 파일을 처리하고 있어요. 잠시만 기다려주세요.");
    return;
  }
  portScheduleUploadBusy = true;
  const resultEl = document.getElementById("portScheduleUploadResult");
  if (resultEl) resultEl.innerHTML = '<div class="anemail-loading">파일 읽는 중...</div>';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

      const headerInfo = findPortScheduleHeaderRow(aoa);
      if (!headerInfo) {
        throw new Error('"Vessel Name" 또는 "Vessel"·"Arrival" 컬럼(또는 "선명"·"입항")을 못 찾았어요. 헤더 행을 확인해주세요.');
      }
      const { headerRowIdx, colMap } = headerInfo;

      const entries = [];
      for (let r = headerRowIdx + 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!row) continue;
        const get = (key) => (colMap[key] >= 0 ? row[colMap[key]] : null);
        let vesselName = String(get("vesselName") || "").trim();
        let vesselCode = String(get("vesselCode") || "").trim();
        let voyage = String(get("voyage") || "").trim();

        // "Vessel" 한 컬럼에 이름+코드+항차가 다 같이 들어있는 형식이면(예: "JADE I (ZJ3) 9E") 쪼개서 채움.
        // 이름/코드/항차가 각각 따로 있는 파일이면 그쪽을 우선 쓰고, 통합 컬럼은 비어있을 때만 보충함.
        if (colMap.vesselCombined >= 0) {
          const split = splitCombinedVesselCell(get("vesselCombined"));
          if (split) {
            if (!vesselName) vesselName = split.name;
            if (!vesselCode) vesselCode = split.code;
            if (!voyage) voyage = split.voyage;
          } else if (!vesselName) {
            vesselName = String(get("vesselCombined") || "").trim(); // 패턴이 안 맞으면 원본 그대로라도 이름 칸에 넣음
          }
        }
        if (!vesselName && !vesselCode) continue; // 빈 줄은 건너뜀

        const arrivalDate = parsePortScheduleDate(get("arrival"));
        const anSendRaw = get("anSendDate");
        const anSendDate = anSendRaw ? parsePortScheduleDate(anSendRaw) : (arrivalDate ? subtractDaysFromDateStr(arrivalDate, 2) : "");

        entries.push({
          vesselName,
          vesselCode,
          voyage,
          arrivalDate,
          departureDate: parsePortScheduleDate(get("departure")),
          terminal: String(get("terminal") || "").trim(),
          line: String(get("line") || "").trim(),
          manager: String(get("manager") || "").trim(),
          cargoDeadlineDate: parsePortScheduleDate(get("cargoDeadlineDate")),
          cargoDeadlineTime: parsePortScheduleTime(get("cargoDeadlineTime")),
          anSendDate,
        });
      }

      if (entries.length === 0) throw new Error("반영할 데이터가 없어요 (빈 파일이거나 형식이 안 맞을 수 있어요).");

      await window.fbReady;
      let batch = window.fbDb.batch();
      let count = 0;
      for (const entry of entries) {
        const docRef = window.fbDb.collection(PORT_SCHEDULE_COLLECTION).doc(portScheduleDocId(entry.vesselCode, entry.voyage, entry.terminal));
        batch.set(docRef, Object.assign({}, entry, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
        count++;
        if (count % 400 === 0) { await batch.commit(); batch = window.fbDb.batch(); }
      }
      await batch.commit();

      if (resultEl) resultEl.innerHTML = `<div style="display:flex; justify-content:flex-end;"><button type="button" class="port-result-close-btn" onclick="document.getElementById('portScheduleUploadResult').innerHTML=''">✕ 닫기</button></div><div class="excel-question-box">✅ ${count}건 반영 완료 (같은 선박+항차는 최신 정보로 덮어써졌어요)</div>`;
    } catch (err) {
      if (resultEl) resultEl.innerHTML = `<div class="anemail-empty">❌ 처리 실패: ${escapeHtml(String(err.message || err))}</div>`;
    } finally {
      portScheduleUploadBusy = false;
    }
  };
  reader.onerror = () => {
    if (resultEl) resultEl.innerHTML = '<div class="anemail-empty">❌ 파일을 읽을 수 없어요.</div>';
    portScheduleUploadBusy = false;
  };
  reader.readAsArrayBuffer(file);
}

const CREDIT_COMPANIES = [
  { name: "DOW CHEMICAL COMPANY (MI)", cucc: "KRSELDOWCE" },
  { name: "ECU-LINE NV", cucc: "KRSELECKKE" },
  { name: "TOLL GLOBAL FORWARDING", cucc: "KRSETOLLGL" },
  { name: "SAMSUNG ELECTRONICS CO. LTD.", cucc: "KRSAMSUNGY" },
  { name: "General Motors", cucc: "KRS1GMDA" },
  { name: "Sejung Shipping Co., Ltd.", cucc: "KRSJSFF" },
  { name: "LOTTE GLOBAL LOGISTICS CO LTD", cucc: "KRS1HDLO" },
  { name: "KOLON PLASTICS INC", cucc: "KRKLNPLSTC" },
  { name: "KOLON INDUSTRY", cucc: "KRSELKOLOI" },
  { name: "KOLON INDUSTRIES INC", cucc: "KRS1KOLO" },
  { name: "KOLON LIFE SCIENCE INC", cucc: "KRSELKOLLI" },
  { name: "KOLON ADVANCED FIBER, INC", cucc: "KRPUSKOLOA" },
  { name: "BENISON INTERNATIONAL CO., LTD", cucc: "KRSELNISON" },
  { name: "FLEXPORT INTERNATIONAL LLC", cucc: "KRSEOFLEXP" },
  { name: "SCHENKER INTERNATIONAL DEUTSCHLAND", cucc: "KRSKRL01" },
  { name: "CKX CO., LTD.", cucc: "KRSECKXCOD" },
  { name: "MCI GLOBAL LOGISTICS CO., LTD", cucc: "KRMCIGLB" },
  { name: "EUKOR CAR CARRIERS CORP.", cucc: "KRSEEUKCAR" },
  { name: "SEBANG EXPRESS CO.,LTD (Seoul)", cucc: "KRSEBAE1" },
  { name: "TAEWOONG LOGISTICS CO., LTD", cucc: "KRTALOG1" },
  { name: "CNC Global", cucc: "KRSELCNCGL" },
  { name: "J&B LINERS", cucc: "KRSELJBLIN" },
  { name: "Samyang Logistics", cucc: "KRSELSAGUM" },
  { name: "EURO LINE GLOBAL CO", cucc: "KREULIN1" },
  { name: "TRI-X INTERNATIONAL", cucc: "KRTEIFF" },
  { name: "SAMSUNG SDS CO.,LTD.", cucc: "KRSELSAMSN" },
  { name: "KG MOBILITY", cucc: "KRSSANYO" },
  { name: "CASCADIA MARITIME LOGISTICS", cucc: "AEDUBCASCA" },
  { name: "C.H. ROBINSON INTL  (MN)", cucc: "KRCHROBINS" },
  { name: "PANTOS LOGISTICS CO.,LTD", cucc: "KRPANTOS" },
  { name: "DSV AIR & SEA LTD.", cucc: "KRDFDFF" },
  { name: "HELLMANN WORLDWIDE LOGISTICS", cucc: "KRHELLM1" },
  { name: "OEC FREIGHT (NY) INC ORIENT EXPRESS", cucc: "KRSELOECWO" },
  { name: "OEC FREIGHT (NY) INC ORIENT EXPRESS", cucc: "KRSWHOECGL" },
  { name: "CEVA FREIGHT ITALY SRL", cucc: "KRCEVALO" },
  { name: "DHL GLOBAL FORWARDING", cucc: "KRDHLGL1" },
  { name: "EXPEDITORS (SEATTLE WA) CORP OFFC", cucc: "KREXPSEL" },
  { name: "KUEHNE & NAGEL CO LTD", cucc: "KRS1KHNG" },
  { name: "WOOSUNG SHIPPING CO., LTD.", cucc: "KRSELWOS" },
  { name: "DY ULC CO., LTD.", cucc: "KRSELDULYK" },
  { name: "DAELIM CO.,LTD.", cucc: "KRSELDAELM" },
  { name: "KUMHO TIRE CO., INC.", cucc: "KRS1KHTC" },
  { name: "HYUNDAI GLOVIS CO., LTD.", cucc: "KRS1GLCO" },
  { name: "HYOSUNG Corporation", cucc: "KRS1HYOS" },
  { name: "PNS NETWORKS", cucc: "KRPNSNET" },
  { name: "HAN EXPRESS CO.LTD.", cucc: "KRS1HANX" },
  { name: "EUSU LOGISTICS", cucc: "KRSELEUSUL" },
  { name: "RENAULT KOREA MOTORS CO LTD", cucc: "KRSELRENAU" },
  { name: "CJ LOGISTICS CORPORATION", cucc: "KRTKOREA" },
  { name: "HANKOOK TIRE CO LTD.", cucc: "KRS1HTCL" },
  { name: "TRAWELL LOGISTICS CO.,LTD.", cucc: "KRSELTRAEL" },

];

function loadBlDeskTab() {
  const wrap = document.getElementById("blDeskWrap");
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="desk-search-row">
      <div class="desk-search-col">
        <label class="label">🚩 선박명 검색 (출항일 확인)</label>
        <input type="text" id="blDeskVesselInput" placeholder="예: ZIM SCORPIO" oninput="renderBlDeskVesselResult()">
        <div id="blDeskVesselResult" class="desk-result-box"></div>
      </div>
      <div class="desk-search-col">
        <label class="label">💰 BL번호 조회 (입금현황)</label>
        <textarea id="blDeskBlInput" rows="2" placeholder="예시&#10;MSCU1234567&#10;ZIMU7654321, ABCD9999999"></textarea>
        <div style="display:flex; gap:8px; margin-top:6px; align-items:center; flex-wrap:wrap;">
          <button type="button" class="btn generate-btn" onclick="checkPaymentStatusForBlDesk()">🔍 조회</button>
          <button type="button" class="btn secondary-btn" onclick="refreshPaymentData()">🔄 데이터 갱신</button>
          <span id="paymentRefreshStatus" class="hint" style="margin-top:0;"></span>
        </div>
        <div id="blDeskPaymentResult" class="desk-result-box"></div>
      </div>
      <div class="desk-search-col">
        <label class="label">🏦 신용업체 조회 (CUCC / 업체명)</label>
        <div class="hint" style="margin:0 0 8px;">입금현황에 O 표시가 없어도, 여기서 나오면 신용거래 업체라 그냥 BL 발행하면 돼요.</div>
        <input type="text" id="blDeskCreditInput" placeholder="예: KRSELDOWCE 또는 삼성전자" oninput="renderBlDeskCreditResult()">
        <div id="blDeskCreditResult" class="desk-result-box"></div>
      </div>
      <div class="desk-search-col">
        <label class="label">📝 메모</label>
        <div class="hint" style="margin:0 0 8px;">시스템 코드, 처리 순서 등 자유롭게 적어두세요. 이 브라우저에만 저장돼요(다른 팀원한텐 안 보여요).</div>
        <textarea id="blDeskMemo" rows="6" placeholder="예: TDO101 - Freight Note 확인 - PLISM 발급 순서로" style="width:100%; box-sizing:border-box;" oninput="saveDeskMemo('blDeskMemo')"></textarea>
      </div>
    </div>

    <hr style="margin:20px 0; border:none; border-top:1px solid #e5e7eb;">

    <div class="hint" style="margin-bottom:10px;">위 조회로 안 되거나 직접 원본을 보고 싶을 땐 아래 화면에서 확인하세요. 화면을 한 번 클릭한 다음 <b>Ctrl+F</b>로 검색할 수 있어요. 원본 파일이 바뀌면 이 화면도 그대로 반영돼요.</div>
    <div class="hint" style="margin-bottom:10px;">⚠️ 화면이 안 뜨거나 "액세스 권한이 없습니다"라고 나오면, 회사 마이크로소프트 계정으로 로그인이 안 되어 있거나 공유 대상에 포함되지 않은 경우예요. 그럴 땐 재무팀에 공유 대상 추가를 요청해주세요.</div>
    <div class="payment-embed-wrap">
      <iframe
        src="https://zim365-my.sharepoint.com/personal/park_minyoung_corp_zim_com/_layouts/15/Doc.aspx?sourcedoc={9fab18fd-0595-49b0-9aeb-ae700bf66d76}&action=embedview&wdAllowInteractivity=True&wdHideGridlines=True&wdHideHeaders=True&wdDownloadButton=True&wdInConfigurator=True"
        width="100%" height="800" frameborder="0" scrolling="yes"
        title="입금현황 (BLCONFIRM.xlsx)">
      </iframe>
    </div>
  `;

  loadDeskMemo("blDeskMemo");

  // 모선 일정 탭을 따로 안 열어봐도 데스크에서 바로 검색되게, 여기서도 실시간 구독을 시작함
  loadVesselTab();
}

function renderBlDeskVesselResult() {
  const inputEl = document.getElementById("blDeskVesselInput");
  const box = document.getElementById("blDeskVesselResult");
  if (!inputEl || !box) return;
  if (!inputEl.value.trim()) { box.innerHTML = ""; return; }
  const matches = searchVesselsByName(inputEl.value).slice(0, 8);
  if (matches.length === 0) { box.innerHTML = '<div class="hint">검색 결과가 없어요.</div>'; return; }
  box.innerHTML = matches.map((v) => `
    <div class="desk-result-row">
      <b>${escapeHtml(v.name || "-")}</b>${v.code ? ` <span class="desk-vessel-code">${escapeHtml(v.code)}</span>` : ""}${v.voyage ? ` <span class="desk-vessel-voyage">${escapeHtml(v.voyage)}</span>` : ""}
      <div>🚩 출항 ${formatVesselDateTime(v.departureDate, v.departureTimeConfirmed)}</div>
    </div>
  `).join("");
}

/* 입금현황 탭이랑 같은 캐시(paymentDataCache)를 그대로 읽어서 조회만 따로 함 (데이터는 공유) */
function checkPaymentStatusForBlDesk() {
  const inputEl = document.getElementById("blDeskBlInput");
  const resultEl = document.getElementById("blDeskPaymentResult");
  if (!inputEl || !resultEl) return;

  if (!paymentDataCache) {
    resultEl.innerHTML = `<div class="hint">⚠️ 먼저 "🔄 데이터 갱신" 버튼을 눌러 최신 데이터를 가져와주세요.</div>`;
    return;
  }

  const blNumbers = inputEl.value
    .split(/[\n,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (blNumbers.length === 0) {
    resultEl.innerHTML = `<div class="hint">비엘번호를 입력해주세요.</div>`;
    return;
  }

  resultEl.innerHTML = blNumbers
    .map((bl) => {
      const data = paymentDataCache[bl];
      if (!data) {
        return `<div class="payment-row not-found">⚠️ ${bl} — 목록에 없음 (번호 확인 필요, 혹은 신용거래 업체일 수 있으니 옆 칸에서 CUCC/업체명으로 확인해보세요)</div>`;
      }
      const ready = data.issued.toUpperCase() === "O";
      const statusText = ready ? "✅ BL 발행 가능" : "❌ BL 발행 불가";
      const statusClass = ready ? "ready" : "not-ready";
      return `<div class="payment-row ${statusClass}">${bl} — ${statusText}</div>`;
    })
    .join("");
}

/* 🏦 신용업체(CUCC) 조회 - CUCC 코드나 업체명 일부만 입력해도 찾아줌 */
function renderBlDeskCreditResult() {
  const inputEl = document.getElementById("blDeskCreditInput");
  const box = document.getElementById("blDeskCreditResult");
  if (!inputEl || !box) return;
  const q = inputEl.value.trim().toLowerCase();
  if (!q) { box.innerHTML = ""; return; }

  const matches = CREDIT_COMPANIES.filter((c) =>
    c.cucc.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  ).slice(0, 15);

  if (matches.length === 0) {
    box.innerHTML = `<div class="payment-row not-found">❌ 신용업체 목록에 없어요 - 신용거래가 아닐 가능성이 높아요 (그래도 확실하지 않으면 팀장님께 확인해주세요)</div>`;
    return;
  }
  box.innerHTML = matches.map((c) =>
    `<div class="payment-row ready">✅ ${escapeHtml(c.name)} <span class="desk-vessel-code">${escapeHtml(c.cucc)}</span> — 신용거래 업체 (BL 발행 가능)</div>`
  ).join("");
}

const TAB_GROUPS = {
  work: ["procedures", "faqs", "templates", "ntf"],
  csboard: ["followup", "cod", "triangle"],
  reference: ["resources", "vessels", "contacts", "news"],
  schedule: ["vacations", "teamEvents"],
  tools: ["calc", "memo", "excelTool"],
};

function showPage(tab) {
  document.querySelectorAll(".main-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-page").forEach((p) => p.classList.toggle("active", p.id === "page-" + tab));

  document.querySelectorAll(".tab-group-btn").forEach((btn) => {
    const group = btn.closest(".tab-group").dataset.group;
    btn.classList.toggle("active", (TAB_GROUPS[group] || []).includes(tab));
  });
  closeAllTabGroups();
}

function toggleTabGroup(group) {
  const dropdown = document.getElementById("tabGroupDropdown-" + group);
  if (!dropdown) return;
  const willOpen = !dropdown.classList.contains("open");
  closeAllTabGroups();
  if (willOpen) {
    dropdown.classList.add("open");
    positionTabGroupDropdownForMobile(dropdown);
  }
}

/* 모바일 화면에서는 탭 메뉴 줄 자체가 가로 스크롤 컨테이너라, 그 안에서 절대위치(position:absolute)로
   드롭다운을 띄우면 스크롤 영역에 갇혀서 이상하게 잘리거나 늘어나 보여요 (실제로 그런 문제가 있었어요).
   그래서 768px 이하일 때만, 드롭다운을 화면 기준 고정 위치(position:fixed)로 바꾸고 버튼 바로 아래에
   정확히 오도록 좌표를 직접 계산해서 배치해요. 데스크톱에서는 원래 방식(absolute) 그대로예요. */
function positionTabGroupDropdownForMobile(dropdown) {
  if (window.innerWidth > 768) {
    dropdown.style.position = "";
    dropdown.style.top = "";
    dropdown.style.left = "";
    dropdown.style.right = "";
    dropdown.style.width = "";
    return;
  }
  const btn = dropdown.parentElement ? dropdown.parentElement.querySelector(".tab-group-btn") : null;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  dropdown.style.position = "fixed";
  dropdown.style.top = (rect.bottom + 4) + "px";
  dropdown.style.left = "12px";
  dropdown.style.right = "12px";
  dropdown.style.width = "auto";
}

window.addEventListener("resize", () => {
  const open = document.querySelector(".tab-group-dropdown.open");
  if (open) positionTabGroupDropdownForMobile(open);
});

function closeAllTabGroups() {
  document.querySelectorAll(".tab-group-dropdown").forEach((d) => {
    d.classList.remove("open");
    d.style.position = "";
    d.style.top = "";
    d.style.left = "";
    d.style.right = "";
    d.style.width = "";
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".tab-group")) closeAllTabGroups();
});

function onSearchInput() {
  const q = document.getElementById("globalSearch").value;
  if (q.trim()) {
    renderSearchResults(q.trim());
    showPage("search");
  } else {
    showPage(mainTab);
  }
}

function snippetHtml(fullText, query) {
  const idx = fullText.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(fullText.slice(0, 80));
  const start = Math.max(0, idx - 30);
  const end = Math.min(fullText.length, idx + query.length + 50);
  return (start > 0 ? "…" : "") + escapeHtml(fullText.slice(start, end)) + (end < fullText.length ? "…" : "");
}

function renderSearchResults(query) {
  const q = query.toLowerCase();
  const list = document.getElementById("searchResultsList");
  list.innerHTML = "";

  const results = [];

  PROCEDURES.forEach((p) => {
    const full = p.title + " " + flattenProcNodeText({ subItems: p.subItems });
    if (full.toLowerCase().includes(q)) {
      const matchPath = findProcMatchPath(p.subItems, q);
      results.push({ kind: "procedure", label: "📋 업무 절차", title: p.title, snippet: snippetHtml(full, query), category: p.category, id: p.id, path: matchPath });
    }
  });
  FAQS.forEach((f) => {
    const full = f.question + " " + f.answer;
    if (full.toLowerCase().includes(q)) results.push({ kind: "faq", label: "❓ FAQ", title: f.question, snippet: snippetHtml(f.answer, query), category: f.category, id: f.id });
  });
  FAQ_TOPICS.forEach((t) => {
    const full = t.title + " " + (t.groups || []).map((g) => g.name + " " + (g.items || []).map((it) => it.question + " " + it.answer).join(" ")).join(" ");
    if (full.toLowerCase().includes(q)) results.push({ kind: "faqTopic", label: "🗂 FAQ 그룹", title: t.title, snippet: snippetHtml(full, query), category: t.category, id: t.id });
  });
  RESOURCES.forEach((r) => {
    const subText = r.subItems && r.subItems.length ? flattenProcNodeText({ subItems: r.subItems }) : "";
    const full = r.title + " " + (r.description || "") + " " + subText;
    if (full.toLowerCase().includes(q)) {
      let snippet = r.description ? escapeHtml(r.description) : "";
      const matchPath = r.subItems && r.subItems.length ? findProcMatchPath(r.subItems, q) : null;
      if (!snippet && subText && subText.toLowerCase().includes(q)) snippet = snippetHtml(subText, query);
      results.push({ kind: "resource", label: "🔗 자료 모음", title: r.title, snippet, category: r.category, id: r.id, path: matchPath });
    }
  });
  VESSELS.forEach((v) => {
    const full = [v.name, v.code, v.voyage].filter(Boolean).join(" ");
    if (full.toLowerCase().includes(q)) {
      results.push({
        kind: "vessel", label: "🚢 모선 일정",
        title: v.name + (v.code ? " (" + v.code + ")" : "") + (v.voyage ? " · " + v.voyage : ""),
        snippet: [v.arrivalDate ? "입항 " + formatVesselDateTime(v.arrivalDate, v.arrivalTimeConfirmed) : "", v.departureDate ? "출항 " + formatVesselDateTime(v.departureDate, v.departureTimeConfirmed) : ""].filter(Boolean).join(" · "),
        category: null, id: v.id
      });
    }
  });
  POA_LIST.forEach((p) => {
    const full = [p.applicant, p.shipper].filter(Boolean).join(" ");
    if (full.toLowerCase().includes(q)) {
      results.push({
        kind: "poa", label: "🖋️ 위임장 현황",
        title: (p.applicant || "") + " — " + (p.shipper || ""), snippet: p.submittedDate ? "제출일자 " + p.submittedDate : "",
        category: null, id: p.id
      });
    }
  });
  CONTACTS.forEach((c) => {
    if (c.isHeader) {
      if ((c.label || "").toLowerCase().includes(q)) {
        results.push({ kind: "contact", label: "📞 연락처", title: c.label, snippet: "", category: null, id: c.id });
      }
      return;
    }
    const full = [c.country, c.category, c.contact, c.email, c.email2].filter(Boolean).join(" ");
    if (full.toLowerCase().includes(q)) {
      results.push({
        kind: "contact", label: "📞 연락처",
        title: (c.country || "국가 미지정") + (c.category ? " · " + c.category : ""),
        snippet: snippetHtml((c.contact || "") + " · " + (c.email || ""), query),
        category: null, id: c.id
      });
    }
  });
  TEMPLATES.forEach((t) => {
    const full = t.label + " " + (t.guide || "");
    if (full.toLowerCase().includes(q)) results.push({ kind: "template", label: "✉️ 메일 템플릿", title: t.label, snippet: t.guide ? snippetHtml(t.guide, query) : "", category: null, id: t.id });
  });
  NTF_TEMPLATES.forEach((t) => {
    const full = t.label + " " + (t.guide || "");
    if (full.toLowerCase().includes(q)) results.push({ kind: "ntf", label: "📨 공문 발송", title: t.label, snippet: t.guide ? snippetHtml(t.guide, query) : "", category: null, id: t.id });
  });
  (typeof FOLLOWUP_LIST !== "undefined" ? FOLLOWUP_LIST : []).forEach((f) => {
    const full = [f.customer, f.title, f.workType, f.nextAction, f.memo, f.owner].filter(Boolean).join(" ");
    if (full.toLowerCase().includes(q)) {
      results.push({
        kind: "followup", label: "📌 팔로우업 보드",
        title: (f.customer || "고객 미지정") + (f.title ? " — " + f.title : ""),
        snippet: snippetHtml(f.nextAction || f.memo || "", query),
        category: null, id: f.id,
      });
    }
  });
  (typeof COD_LIST !== "undefined" ? COD_LIST : []).forEach((c) => {
    const full = [c.shpr, c.blNumber, c.vsl, c.codBefore, c.codAfter, c.status].filter(Boolean).join(" ");
    if (full.toLowerCase().includes(q)) {
      results.push({
        kind: "cod", label: "💱 COD 현황",
        title: (c.shpr || "SHPR 미지정") + " — " + (c.blNumber || ""),
        snippet: snippetHtml(c.status || "", query),
        category: null, id: c.id,
      });
    }
  });
  (typeof TRIANGLE_LIST !== "undefined" ? TRIANGLE_LIST : []).forEach((t) => {
    const full = [t.blNumber, t.remark, t.remittance, t.popCharge, t.mfstClose, t.invoiceRequest, t.polPodInform].filter(Boolean).join(" ");
    if (full.toLowerCase().includes(q)) {
      results.push({
        kind: "triangle", label: "🌏 삼국간",
        title: t.blNumber || "BL번호 미지정",
        snippet: snippetHtml(t.remark || "", query),
        category: null, id: t.id,
      });
    }
  });

  if (results.length === 0) {
    list.innerHTML = '<div class="empty-state">"' + escapeHtml(query) + '" 에 대한 검색 결과가 없어요.</div>';
    return;
  }

  const countLabel = document.createElement("div");
  countLabel.className = "search-result-count";
  countLabel.textContent = "🔍 " + results.length + "건의 결과를 찾았어요";
  list.appendChild(countLabel);

  // 종류(label)별로 묶어서 순서대로 보여줌 - 절차가 잔뜩 나온 다음 맨 아래 연락처가
  // 섞여있는 게 아니라, 종류마다 구분 제목이 붙어서 한눈에 훑어볼 수 있게.
  // 한 종류 안에서 6건을 넘으면(24인치 모니터 기준 스크롤 없이 보이는 한계), 접어두고
  // 눌러야 펼쳐지게 해서 결과가 많은 검색어(예: "미국")에서도 안 어지럽게 함
  const groups = [];
  const groupIndex = {};
  results.forEach((r) => {
    if (!(r.label in groupIndex)) {
      groupIndex[r.label] = groups.length;
      groups.push({ label: r.label, items: [] });
    }
    groups[groupIndex[r.label]].items.push(r);
  });

  // 개수와 상관없이 모든 카테고리를 일단 접어두고 헤더만 쭉 보여줘서,
  // "어떤 종류에 몇 건씩 있는지"를 한눈에 훑어본 다음 원하는 걸 펼쳐보게 함.
  // 단, 1건뿐인 카테고리는 접었다 펼 이유가 없어서 그냥 바로 보여줌
  groups.forEach((group, gi) => {
    const groupId = "searchGroup_" + gi;
    const singleItem = group.items.length === 1;

    const headerRow = document.createElement("div");
    headerRow.className = "search-result-group-header-row" + (singleItem ? "" : " collapsible");
    const headerText = document.createElement("div");
    headerText.className = "search-result-group-header";
    headerText.textContent = group.label + " · " + group.items.length + "건";
    headerRow.appendChild(headerText);

    const itemsWrap = document.createElement("div");
    itemsWrap.id = groupId;
    itemsWrap.style.display = singleItem ? "block" : "none";

    if (!singleItem) {
      const toggleHint = document.createElement("div");
      toggleHint.className = "search-result-group-toggle-hint";
      toggleHint.textContent = "펼쳐보기 ▾";
      headerRow.appendChild(toggleHint);
      headerRow.onclick = () => {
        const isOpen = itemsWrap.style.display !== "none";
        itemsWrap.style.display = isOpen ? "none" : "block";
        toggleHint.textContent = isOpen ? "펼쳐보기 ▾" : "접기 ▴";
      };
    }

    list.appendChild(headerRow);

    group.items.forEach((r) => {
      const card = document.createElement("div");
      card.className = "content-card";
      card.style.cursor = "default";

      const row = document.createElement("div");
      row.className = "resource-row";

      const left = document.createElement("div");
      left.innerHTML = '<span class="search-result-type">' + r.label + '</span>'
        + (r.category ? badgeHtml(r.category) : "")
        + '<span class="content-card-title">' + escapeHtml(r.title) + '</span>'
        + (r.snippet ? '<div class="search-result-snippet">' + r.snippet + '</div>' : "");
      row.appendChild(left);

      const jumpBtn = document.createElement("button");
      jumpBtn.className = "search-jump-btn";
      jumpBtn.textContent = "바로가기 →";
      jumpBtn.onclick = () => jumpToResult(r.kind, r.id, r.path, query);
      row.appendChild(jumpBtn);

      card.appendChild(row);
      itemsWrap.appendChild(card);
    });

    list.appendChild(itemsWrap);
  });
}

/* 검색 바로가기로 들어왔을 때, 찾은 경로(id 배열)를 순서대로 따라가며
   알약 버튼을 자동으로 클릭해서 정확한 하위 탭까지 열어준다 */
function clickProcPillPath(rootEl, path, i) {
  if (i >= path.length) return;
  const pillEl = rootEl.querySelector('[data-subitem-id="' + path[i] + '"]');
  if (pillEl) {
    pillEl.click();
    clickProcPillPath(rootEl, path, i + 1);
  }
}

/* 자료/절차 페이지 안의 표(step-table)에서 검색어와 일치하는 행을 찾아 노란색으로
   하이라이트하고 그 행이 화면 중앙에 오도록 스크롤한다. (예: "BELIZE" 검색 → 국가별 규정
   표에서 BELIZE 행을 바로 찾아줌 - 첫 번째 칸이 정확히 일치하는 행을 우선으로 찾음) */
function highlightTableRowByQuery(containerEl, qLower) {
  if (!containerEl || !qLower) return;
  const rows = Array.from(containerEl.querySelectorAll(".step-table tbody tr"));
  if (!rows.length) return;
  let target = rows.find((tr) => {
    const firstCell = tr.querySelector("td");
    return firstCell && firstCell.textContent.trim().toLowerCase() === qLower;
  });
  if (!target) {
    target = rows.find((tr) => tr.textContent.toLowerCase().includes(qLower));
  }
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("step-table-row-highlight");
    setTimeout(() => target.classList.remove("step-table-row-highlight"), 2500);
  }
}

function jumpToResult(kind, id, path, query) {
  const qLower = query ? query.toLowerCase().trim() : "";
  if (kind === "procedure") {
    switchMainTab("procedures");
    setTimeout(() => {
      const el = document.querySelector('[data-proc-id="' + id + '"]');
      if (el) {
        const folder = el.closest(".proc-category-folder");
        if (folder && folder.dataset.procCategory) {
          expandedProcCategories.add(folder.dataset.procCategory);
          const folderBody = folder.querySelector(".content-card-body");
          if (folderBody) folderBody.classList.add("open");
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.querySelector(".content-card-body").classList.add("open");
        if (path && path.length) {
          setTimeout(() => {
            clickProcPillPath(el, path, 0);
            setTimeout(() => highlightTableRowByQuery(el, qLower), 150);
          }, 80);
        } else {
          setTimeout(() => highlightTableRowByQuery(el, qLower), 150);
        }
      }
    }, 50);
  } else if (kind === "faq") {
    switchMainTab("faqs");
    setTimeout(() => {
      const el = document.querySelector('[data-faq-id="' + id + '"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.querySelector(".content-card-body").classList.add("open");
      }
    }, 50);
  } else if (kind === "faqTopic") {
    switchMainTab("faqs");
    setTimeout(() => {
      const el = document.querySelector('[data-faq-topic-id="' + id + '"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.querySelector(".content-card-body").classList.add("open");
      }
    }, 50);
  } else if (kind === "resource") {
    switchMainTab("resources");
    setTimeout(() => {
      const el = document.querySelector('[data-res-id="' + id + '"]');
      if (el) {
        const groupBody = el.closest(".content-card-body");
        if (groupBody) groupBody.classList.add("open");
        const ownBody = el.querySelector(".content-card-body");
        if (ownBody) {
          ownBody.classList.add("open");
          if (path && path.length) {
            setTimeout(() => {
              clickProcPillPath(ownBody, path, 0);
              setTimeout(() => highlightTableRowByQuery(ownBody, qLower), 150);
            }, 80);
          } else {
            setTimeout(() => highlightTableRowByQuery(ownBody, qLower), 150);
          }
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  } else if (kind === "contact") {
    switchMainTab("contacts");
    setTimeout(() => {
      const filterEl = document.getElementById("contactsFilter");
      if (filterEl) filterEl.value = "";
      renderContactsTable();
      const el = document.querySelector('[data-contact-id="' + id + '"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("contact-row-highlight");
        setTimeout(() => el.classList.remove("contact-row-highlight"), 2000);
      }
    }, 50);
  } else if (kind === "template") {
    switchMainTab("templates");
    setTimeout(() => {
      const select = document.getElementById("type");
      select.value = id;
      onTypeChange();
    }, 50);
  } else if (kind === "ntf") {
    switchMainTab("ntf");
    setTimeout(() => {
      const select = document.getElementById("ntfType");
      select.value = id;
      onNtfTypeChange();
    }, 50);
  } else if (kind === "vessel") {
    switchMainTab("vessels");
    setTimeout(() => {
      const el = document.querySelector('[data-vessel-id="' + id + '"]');
      if (el) {
        const monthCard = el.closest(".vessel-month-card");
        if (monthCard && monthCard.dataset.vesselMonth) expandedVesselMonths.add(monthCard.dataset.vesselMonth);
        const bodyEl = el.closest(".content-card-body");
        if (bodyEl) bodyEl.classList.add("open");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("contact-row-highlight");
        setTimeout(() => el.classList.remove("contact-row-highlight"), 2000);
      }
    }, 50);
  } else if (kind === "poa") {
    switchMainTab("poa");
    setTimeout(() => {
      const filterEl = document.getElementById("poaFilter");
      const item = POA_LIST.find((p) => p.id === id);
      if (filterEl && item) { filterEl.value = item.applicant || item.shipper || ""; renderPoaTable(); }
      const el = document.querySelector('[data-poa-id="' + id + '"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("contact-row-highlight");
        setTimeout(() => el.classList.remove("contact-row-highlight"), 2000);
      }
    }, 50);
  } else if (kind === "followup") {
    switchMainTab("followup");
    setTimeout(() => {
      followupMonthFilter = "__all"; // 그 건이 등록된 달이 지금 골라둔 월 필터에 없을 수 있으니 전체보기로 풀어줌
      const monthSelect = document.getElementById("followupMonthSelect");
      if (monthSelect) monthSelect.value = "__all";
      const statusEl = document.getElementById("followupStatusFilter");
      if (statusEl) statusEl.value = "__all";
      const filterEl = document.getElementById("followupFilter");
      if (filterEl) filterEl.value = "";
      renderFollowupList();
      const el = document.querySelector('[data-followup-id="' + id + '"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("contact-row-highlight");
        setTimeout(() => el.classList.remove("contact-row-highlight"), 2000);
      }
    }, 50);
  } else if (kind === "cod") {
    switchMainTab("cod");
    setTimeout(() => {
      codMonthFilter = "__all";
      const monthSelect = document.getElementById("codMonthSelect");
      if (monthSelect) monthSelect.value = "__all";
      const filterEl = document.getElementById("codFilter");
      if (filterEl) filterEl.value = "";
      renderCodList();
      const el = document.querySelector('[data-cod-id="' + id + '"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("contact-row-highlight");
        setTimeout(() => el.classList.remove("contact-row-highlight"), 2000);
      }
    }, 50);
  } else if (kind === "triangle") {
    switchMainTab("triangle");
    setTimeout(() => {
      const filterEl = document.getElementById("triangleFilter");
      if (filterEl) filterEl.value = "";
      renderTriangleList();
      const el = document.querySelector('[data-triangle-id="' + id + '"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("contact-row-highlight");
        setTimeout(() => el.classList.remove("contact-row-highlight"), 2000);
      }
    }, 50);
  } else if (kind === "mainTab") {
    switchMainTab(id);
  }
}

