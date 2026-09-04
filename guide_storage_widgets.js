/* ===== guide_storage_widgets.js : original lines 15166-16722 ===== */
/* =========================================================================
   저장 / 불러오기 (모든 콘텐츠를 하나의 스토리지에 통합 관리)
   ========================================================================= */

let DATA = loadData();
let TEMPLATES = DATA.templates;
let NTF_TEMPLATES = DATA.ntfTemplates;
let PROCEDURES = normalizeProcedures(DATA.procedures);
let FAQS = DATA.faqs;
let RESOURCES = DATA.resources;
let VACATIONS = DATA.vacations;
let FAQ_TOPICS = DATA.faqTopics;
let VACATION_MEMBERS = DATA.vacationMembers;
let VACATION_NOTICE = DATA.vacationNotice;
let TEAM_EVENTS = DATA.teamEvents;
let NOTICE_BANNER = DATA.noticeBanner;
let LT_MAIL_SETTINGS = DATA.ltMailSettings;
let NTF_LETTERHEAD = DATA.ntfLetterhead;
let CONTACTS = DATA.contacts;
let FEEDBACK_LIST = DATA.feedbackList;
let FAVORITE_TEMPLATE_IDS = DATA.favoriteTemplateIds;
let FAVORITE_PROC_IDS = DATA.favoriteProcIds;
let FAVORITE_FAQ_IDS = DATA.favoriteFaqIds;
let VESSEL_MONTHS = DATA.vesselMonths;
let VESSELS = DATA.vessels;
let QUOTES = DATA.quotes;
let POA_LIST = DATA.poaList;
let HOLIDAYS = DATA.holidays;
let EXCHANGE_RATES = DATA.exchangeRates;
let TT_LINES = DATA.ttLines;

if (!DATA.faqProcedureMigrated) {
  migrateFaqProcedureToTopics();
  DATA.faqProcedureMigrated = true;
  saveData();
}

if (!DATA.templateGroupsMigrated) {
  migrateDefaultTemplateGroups();
  DATA.templateGroupsMigrated = true;
  saveData();
}

if (!DATA.ntfSeedsMigratedV2) {
  migrateNtfSeedsV2();
  DATA.ntfSeedsMigratedV2 = true;
  saveData();
}

if (!DATA.ntfSeedsMigratedV3) {
  migrateNtfSeedsV3();
  DATA.ntfSeedsMigratedV3 = true;
  saveData();
}

if (!DATA.workManualImportedV1) {
  migrateWorkManualProcedures();
  DATA.workManualImportedV1 = true;
  saveData();
}

if (!DATA.workManualImportedV3) {
  migrateWorkManualProceduresV3();
  DATA.workManualImportedV3 = true;
  saveData();
}

if (!DATA.workManualImportedV4) {
  migrateWorkManualProceduresV4();
  DATA.workManualImportedV4 = true;
  saveData();
}

/* v4: 표가 절차 중간에 끼어 있던 카드들(수입 세관신고/운임·D-O/DEM-DET/위험물규정/ERS)을
   "절차를 다 나열한 뒤 표는 맨 끝" 순서로 재정렬한 최신본으로 강제 교체 */
function migrateWorkManualProceduresV4() {
  const refreshIds = ["wm_imp_customs", "wm_imp_freight", "wm_imp_demdet", "wm_imp_rule", "wm_csrole"];
  refreshIds.forEach((id) => {
    const fresh = DEFAULT_PROCEDURES.find((p) => p.id === id);
    if (!fresh) return;
    const idx = PROCEDURES.findIndex((p) => p.id === id);
    const copy = JSON.parse(JSON.stringify(fresh));
    if (idx !== -1) PROCEDURES[idx] = copy;
    else PROCEDURES.push(copy);
  });
}

if (!DATA.faqPhoneTopicV1) {
  migrateFaqPhoneTopic();
  DATA.faqPhoneTopicV1 = true;
  saveData();
}

/* 전화 문의 응대 FAQ 11건을 D/O·인보이스/비용·B/L·검색기·운송·기타 아이콘 그룹으로
   정리한 FAQ_TOPICS 카드를 추가하고, 예전에 낱개 FAQ로 저장되어 있던 동일 항목(f_imp_*)은
   중복 표시되지 않도록 제거한다. (localStorage에 남아있던 예전 구조 사용자도 자동 반영) */
function migrateFaqPhoneTopic() {
  const dupIds = ["f_imp_klnet", "f_imp_do", "f_imp_agent_poa", "f_imp_poa2", "f_imp_carriercode",
    "f_imp_mailfax", "f_imp_invoice", "f_imp_demurrage", "f_imp_obl", "f_imp_xray", "f_imp_selftransport"];
  FAQS = FAQS.filter((f) => !dupIds.includes(f.id));

  if (!FAQ_TOPICS.some((t) => t.id === "ft_imp_phone")) {
    const fresh = DEFAULT_FAQ_TOPICS.find((t) => t.id === "ft_imp_phone");
    if (fresh) FAQ_TOPICS.push(JSON.parse(JSON.stringify(fresh)));
  }
}

/* CS Work Manual 내용을 업무 절차에 추가 (이미 같은 id가 있으면 건너뜀 - 중복 삽입 방지) */
function migrateWorkManualProcedures() {
  const manualIds = ["wm_pod", "wm_claim", "wm_platform", "wm_csrole"];
  manualIds.forEach((id) => {
    if (!PROCEDURES.some((p) => p.id === id)) {
      const fresh = DEFAULT_PROCEDURES.find((p) => p.id === id);
      if (fresh) PROCEDURES.push(JSON.parse(JSON.stringify(fresh)));
    }
  });
}

/* v3: 수입 업무 매뉴얼(세관신고/운임·D-O/DEM-DET/고객응대/세관규정) 5개 카드를 신규 추가하고,
   수출 매뉴얼 4개(POD/클레임/플랫폼/CS고유업무)는 아이콘·표가 추가된 최신 버전으로 통째로 갱신한다.
   (관리자가 그 사이 직접 손으로 수정했을 가능성은 낮다고 보고 최신 원본으로 덮어씀) */
function migrateWorkManualProceduresV3() {
  const newIds = ["wm_imp_customs", "wm_imp_freight", "wm_imp_demdet", "wm_imp_cs", "wm_imp_rule"];
  newIds.forEach((id) => {
    if (!PROCEDURES.some((p) => p.id === id)) {
      const fresh = DEFAULT_PROCEDURES.find((p) => p.id === id);
      if (fresh) PROCEDURES.push(JSON.parse(JSON.stringify(fresh)));
    }
  });
  const refreshIds = ["wm_pod", "wm_claim", "wm_platform", "wm_csrole"];
  refreshIds.forEach((id) => {
    const fresh = DEFAULT_PROCEDURES.find((p) => p.id === id);
    if (!fresh) return;
    const idx = PROCEDURES.findIndex((p) => p.id === id);
    const copy = JSON.parse(JSON.stringify(fresh));
    if (idx !== -1) PROCEDURES[idx] = copy;
    else PROCEDURES.push(copy);
  });
}

/* 예전 버전에서 만든 공문 예시(PORT OMIT 필드/문구 개편 전)를 최신 예시로 갱신하고,
   삭제 요청된 "장기 스케줄 변경 통지" 예시는 제거한다. 관리자가 직접 새로 추가한
   다른 공문 유형들은 그대로 둔다. */
function migrateNtfSeedsV2() {
  NTF_TEMPLATES = NTF_TEMPLATES.filter((t) => t.id !== "ntf_schedule_change");
  const freshOmission = DEFAULT_NTF_TEMPLATES.find((t) => t.id === "ntf_omission");
  if (freshOmission) {
    const idx = NTF_TEMPLATES.findIndex((t) => t.id === "ntf_omission");
    const copy = JSON.parse(JSON.stringify(freshOmission));
    if (idx !== -1) NTF_TEMPLATES[idx] = copy;
    else NTF_TEMPLATES.push(copy);
  }
}

/* v3: localStorage에 저장된 공문 유형 목록에는 없지만 코드 기본값(DEFAULT_NTF_TEMPLATES)에는
   있는 유형을 자동으로 채워 넣는다. (예: 관리자가 코드 기본값에 새 공문 유형을 추가해서
   배포했는데, 팀원 브라우저에는 예전 목록이 이미 저장되어 있어서 새 유형이 안 보이던 문제 해결)
   이미 브라우저에 있는 유형(관리자가 직접 만든 것 포함)은 절대 건드리지 않고, id 기준으로
   "없는 것만" 뒤에 추가한다. */
function migrateNtfSeedsV3() {
  DEFAULT_NTF_TEMPLATES.forEach((def) => {
    if (!NTF_TEMPLATES.some((t) => t.id === def.id)) {
      NTF_TEMPLATES.push(JSON.parse(JSON.stringify(def)));
    }
  });
}

/* 예전에 저장된 기본 메일 템플릿들(스케줄 확인 이스탄불 / ETA 확인 OMIT·PHASE OUT / ERS 요청 안내)에
   그룹이 아직 없다면 최초 1회 자동으로 묶어준다 */
function migrateDefaultTemplateGroups() {
  const groupById = {
    istanbul: "스케줄 확인 요청",
    omit: "스케줄 확인 요청",
    phaseout: "스케줄 확인 요청",
    ers: "현지 문의"
  };
  let changed = false;
  TEMPLATES.forEach((t) => {
    if (!t.group && groupById[t.id]) {
      t.group = groupById[t.id];
      changed = true;
    }
  });
  return changed;
}

/* 이전 버전(title+steps 평면 구조)으로 저장된 절차 데이터를
   title+subItems(하위 항목 배열) 구조로 자동 변환 */
/* subItems 트리(중첩된 카테고리 포함)를 검색용 텍스트로 펼침 */
function flattenProcNodeText(node) {
  if (node.subItems && node.subItems.length) {
    return node.subItems.map((si) => si.name + " " + flattenProcNodeText(si)).join(" ");
  }
  return (node.steps || []).map((s) => {
    if (isTableValue(s)) {
      return (s.caption || "") + " " + (s.headers || []).join(" ") + " " + (s.rows || []).map((r) => r.join(" ")).join(" ");
    }
    if (isLinkValue(s)) {
      return s.label || "";
    }
    return typeof s === "string" ? s : "";
  }).join(" ");
}

/* 검색어가 subItems 트리 중 정확히 어느 하위 탭(가장 안쪽 leaf까지)에 있는지 경로(id 배열)를 찾는다.
   예: [상위탭id, 하위탭id, ...] - 바로가기 눌렀을 때 이 경로대로 탭을 자동으로 눌러서
   정확한 항목까지 들어가지도록 하는 데 씀 */
function findProcMatchPath(subItems, qLower) {
  if (!subItems || !subItems.length) return null;
  for (const child of subItems) {
    if (child.subItems && child.subItems.length) {
      const subPath = findProcMatchPath(child.subItems, qLower);
      if (subPath) return [child.id, ...subPath];
      if ((child.name || "").toLowerCase().includes(qLower)) return [child.id];
    } else {
      const leafText = (child.name || "") + " " + flattenProcNodeText(child);
      if (leafText.toLowerCase().includes(qLower)) return [child.id];
    }
  }
  return null;
}

/* subItems 트리(중첩된 카테고리 포함)의 최하위 단계/답변 총 개수 */
function countProcNodeSteps(items) {
  return items.reduce((sum, si) => {
    if (si.subItems && si.subItems.length) return sum + countProcNodeSteps(si.subItems);
    return sum + (si.steps ? si.steps.length : 0);
  }, 0);
}

function normalizeProcedures(list) {
  return (list || []).map((p) => {
    if (p.subItems) return p;
    const steps = p.steps || [];
    const subItems = [];
    let current = null;
    steps.forEach((s) => {
      const trimmed = s.trim();
      if (trimmed.startsWith("◦")) {
        current = { id: genId("si"), name: trimmed.replace(/^◦\s*/, ""), steps: [] };
        subItems.push(current);
      } else {
        if (!current) {
          current = { id: genId("si"), name: "전체 내용", steps: [] };
          subItems.push(current);
        }
        current.steps.push(s);
      }
    });
    if (subItems.length === 0) subItems.push({ id: genId("si"), name: "전체 내용", steps: [] });
    const { steps: _drop, ...rest } = p;
    return { ...rest, subItems };
  });
}

/* 질문 내용을 보고 D/O · 인보이스/비용 · B/L · 검색기 · 운송 중 하나로 추정 분류 (자동 이전용) */
function classifyFaqQuestion(q) {
  const text = q || "";
  if (/D\/O|디오|위임장|위수임|이체증/i.test(text)) return { icon: "🍊", name: "D/O" };
  if (/인보이스|디텐션|디머리지/i.test(text)) return { icon: "📄", name: "인보이스/비용" };
  if (/오비엘|OBL|선사\s*코드/i.test(text)) return { icon: "📋", name: "B/L" };
  if (/엑스레이|검색기|X-RAY/i.test(text)) return { icon: "🔍", name: "검색기" };
  if (/운송/i.test(text)) return { icon: "🚚", name: "운송" };
  return { icon: "❓", name: "기타" };
}

/* 업무 절차 안에 "전화 응대 FAQ"라는 이름으로 만들어둔 카드가 있으면
   FAQ 탭의 그룹형 FAQ(FAQ_TOPICS)로 최초 1회 자동으로 옮기고, 아직 카테고리로
   나뉘어 있지 않은 질문들은 질문 내용을 보고 알아서 분류해준다 */
function migrateFaqProcedureToTopics() {
  const idx = PROCEDURES.findIndex((p) => (p.title || "").trim() === "전화 응대 FAQ");
  if (idx === -1) return false;
  const proc = PROCEDURES[idx];

  const groupsByName = {};
  const groupOrder = [];

  function addToGroup(icon, name, item) {
    if (!groupsByName[name]) {
      groupsByName[name] = { id: genId("g"), icon, name, items: [] };
      groupOrder.push(name);
    }
    groupsByName[name].items.push(item);
  }

  proc.subItems.forEach((node) => {
    if (node.subItems && node.subItems.length) {
      // 이미 카테고리로 나뉜 경우, 그 카테고리 이름을 그대로 사용
      node.subItems.forEach((leaf) => {
        addToGroup(node.icon || "📦", node.name, {
          id: leaf.id, question: leaf.name, answer: (leaf.steps || []).join("\n"), image: ""
        });
      });
    } else {
      // 카테고리 없이 flat하게 있던 질문 - 내용을 보고 자동 분류
      const guess = classifyFaqQuestion(node.name);
      addToGroup(guess.icon, guess.name, {
        id: node.id, question: node.name, answer: (node.steps || []).join("\n"), image: ""
      });
    }
  });

  const groups = groupOrder.map((name) => groupsByName[name]);
  if (groups.length === 0) return false;

  PROCEDURES.splice(idx, 1);
  FAQ_TOPICS.push({ id: proc.id, category: proc.category, icon: "📞", title: proc.title, groups });
  return true;
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        templates: parsed.templates || JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)),
        ntfTemplates: parsed.ntfTemplates || JSON.parse(JSON.stringify(DEFAULT_NTF_TEMPLATES)),
        procedures: parsed.procedures || JSON.parse(JSON.stringify(DEFAULT_PROCEDURES)),
        faqs: parsed.faqs || JSON.parse(JSON.stringify(DEFAULT_FAQS)),
        resources: parsed.resources || JSON.parse(JSON.stringify(DEFAULT_RESOURCES)),
        vacations: parsed.vacations || JSON.parse(JSON.stringify(DEFAULT_VACATIONS)),
        faqTopics: parsed.faqTopics || JSON.parse(JSON.stringify(DEFAULT_FAQ_TOPICS)),
        faqProcedureMigrated: parsed.faqProcedureMigrated || false,
        templateGroupsMigrated: parsed.templateGroupsMigrated || false,
        ntfSeedsMigratedV2: parsed.ntfSeedsMigratedV2 || false,
        workManualImportedV1: parsed.workManualImportedV1 || false,
        workManualImportedV3: parsed.workManualImportedV3 || false,
        workManualImportedV4: parsed.workManualImportedV4 || false,
        faqPhoneTopicV1: parsed.faqPhoneTopicV1 || false,
        vacationMembers: parsed.vacationMembers || JSON.parse(JSON.stringify(DEFAULT_VACATION_MEMBERS)),
        vacationNotice: parsed.vacationNotice !== undefined ? parsed.vacationNotice : DEFAULT_VACATION_NOTICE,
        teamEvents: parsed.teamEvents || JSON.parse(JSON.stringify(DEFAULT_TEAM_EVENTS)),
        noticeBanner: parsed.noticeBanner || JSON.parse(JSON.stringify(DEFAULT_NOTICE_BANNER)),
        ltMailSettings: parsed.ltMailSettings || JSON.parse(JSON.stringify(DEFAULT_LT_MAIL_SETTINGS)),
        ntfLetterhead: parsed.ntfLetterhead || JSON.parse(JSON.stringify(DEFAULT_NTF_LETTERHEAD)),
        contacts: parsed.contacts || JSON.parse(JSON.stringify(DEFAULT_CONTACTS)),
        feedbackList: parsed.feedbackList || JSON.parse(JSON.stringify(DEFAULT_FEEDBACK_LIST)),
        favoriteTemplateIds: parsed.favoriteTemplateIds || JSON.parse(JSON.stringify(DEFAULT_FAVORITE_TEMPLATE_IDS)),
        favoriteProcIds: parsed.favoriteProcIds || JSON.parse(JSON.stringify(DEFAULT_FAVORITE_PROC_IDS)),
        favoriteFaqIds: parsed.favoriteFaqIds || JSON.parse(JSON.stringify(DEFAULT_FAVORITE_FAQ_IDS)),
        vesselMonths: parsed.vesselMonths || JSON.parse(JSON.stringify(DEFAULT_VESSEL_MONTHS)),
        vessels: parsed.vessels || JSON.parse(JSON.stringify(DEFAULT_VESSELS)),
        quotes: parsed.quotes || JSON.parse(JSON.stringify(DEFAULT_QUOTES)),
        poaList: parsed.poaList || JSON.parse(JSON.stringify(DEFAULT_POA_LIST)),
        holidays: parsed.holidays || JSON.parse(JSON.stringify(DEFAULT_HOLIDAYS)),
        exchangeRates: parsed.exchangeRates || JSON.parse(JSON.stringify(DEFAULT_EXCHANGE_RATES)),
        ttLines: parsed.ttLines || JSON.parse(JSON.stringify(DEFAULT_TT_LINES))
      };
    }
  } catch (e) {}
  return {
    templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)),
    ntfTemplates: JSON.parse(JSON.stringify(DEFAULT_NTF_TEMPLATES)),
    procedures: JSON.parse(JSON.stringify(DEFAULT_PROCEDURES)),
    faqs: JSON.parse(JSON.stringify(DEFAULT_FAQS)),
    resources: JSON.parse(JSON.stringify(DEFAULT_RESOURCES)),
    vacations: JSON.parse(JSON.stringify(DEFAULT_VACATIONS)),
    faqTopics: JSON.parse(JSON.stringify(DEFAULT_FAQ_TOPICS)),
    faqProcedureMigrated: false,
    templateGroupsMigrated: false,
    ntfSeedsMigratedV2: false,
    workManualImportedV1: false,
    workManualImportedV3: false,
    workManualImportedV4: false,
    faqPhoneTopicV1: false,
    vacationMembers: JSON.parse(JSON.stringify(DEFAULT_VACATION_MEMBERS)),
    vacationNotice: DEFAULT_VACATION_NOTICE,
    teamEvents: JSON.parse(JSON.stringify(DEFAULT_TEAM_EVENTS)),
    noticeBanner: JSON.parse(JSON.stringify(DEFAULT_NOTICE_BANNER)),
    ltMailSettings: JSON.parse(JSON.stringify(DEFAULT_LT_MAIL_SETTINGS)),
    ntfLetterhead: JSON.parse(JSON.stringify(DEFAULT_NTF_LETTERHEAD)),
    contacts: JSON.parse(JSON.stringify(DEFAULT_CONTACTS)),
    feedbackList: JSON.parse(JSON.stringify(DEFAULT_FEEDBACK_LIST)),
    favoriteTemplateIds: JSON.parse(JSON.stringify(DEFAULT_FAVORITE_TEMPLATE_IDS)),
    favoriteProcIds: JSON.parse(JSON.stringify(DEFAULT_FAVORITE_PROC_IDS)),
    favoriteFaqIds: JSON.parse(JSON.stringify(DEFAULT_FAVORITE_FAQ_IDS)),
    vesselMonths: JSON.parse(JSON.stringify(DEFAULT_VESSEL_MONTHS)),
    vessels: JSON.parse(JSON.stringify(DEFAULT_VESSELS)),
    quotes: JSON.parse(JSON.stringify(DEFAULT_QUOTES)),
    poaList: JSON.parse(JSON.stringify(DEFAULT_POA_LIST)),
    holidays: JSON.parse(JSON.stringify(DEFAULT_HOLIDAYS)),
    exchangeRates: JSON.parse(JSON.stringify(DEFAULT_EXCHANGE_RATES)),
    ttLines: JSON.parse(JSON.stringify(DEFAULT_TT_LINES))
  };
}

function saveData() {
  try {
    const payload = {
      templates: TEMPLATES, ntfTemplates: NTF_TEMPLATES, procedures: PROCEDURES, faqs: FAQS, resources: RESOURCES,
      vacations: VACATIONS, faqTopics: FAQ_TOPICS, faqProcedureMigrated: DATA.faqProcedureMigrated,
      templateGroupsMigrated: DATA.templateGroupsMigrated, ntfSeedsMigratedV2: DATA.ntfSeedsMigratedV2, workManualImportedV1: DATA.workManualImportedV1,
      workManualImportedV3: DATA.workManualImportedV3,
      workManualImportedV4: DATA.workManualImportedV4,
      faqPhoneTopicV1: DATA.faqPhoneTopicV1,
      vacationMembers: VACATION_MEMBERS, vacationNotice: VACATION_NOTICE, teamEvents: TEAM_EVENTS,
      noticeBanner: NOTICE_BANNER, ltMailSettings: LT_MAIL_SETTINGS, ntfLetterhead: NTF_LETTERHEAD, contacts: CONTACTS, feedbackList: FEEDBACK_LIST,
      favoriteTemplateIds: FAVORITE_TEMPLATE_IDS,
      favoriteProcIds: FAVORITE_PROC_IDS, favoriteFaqIds: FAVORITE_FAQ_IDS,
      vesselMonths: VESSEL_MONTHS, vessels: VESSELS, quotes: QUOTES, poaList: POA_LIST, holidays: HOLIDAYS,
      exchangeRates: EXCHANGE_RATES, ttLines: TT_LINES
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

function genId(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* =========================================================================
   💬 오늘의 한마디 (하루에 한 번, 처음 켰을 때만 보여줌)
   ========================================================================= */
const DAILY_QUOTE_SEEN_KEY = "cs_guide_daily_quote_seen";

/* 날짜(연/월/일)를 기준으로 문구 목록을 순서대로 하나씩 골라줌 - 같은 날엔 모두에게 같은 문구,
   다음날엔 자동으로 다음 문구로 넘어감 */
/* 영화 대사(텍스트에 "영화 <..>"가 포함된 문구)와 나머지(응원 문구)를 비율에 맞게 고르게 섞어서
   순서대로 하루 하나씩 보여줌 -> 응원 문구가 훨씬 많아도(60:36 정도) 영화 대사가 며칠 걸러 한 번씩
   꾸준히 나오도록 함. 완전 무작위는 아니고, 정해진 섞인 순서를 날짜 순번대로 따라가는 방식. */
function buildInterleavedQuoteOrder(quotes) {
  const isMovie = (q) => /영화\s*</.test(q.text || "");
  const movie = quotes.filter(isMovie);
  const other = quotes.filter((q) => !isMovie(q));
  const result = [];
  let mi = 0, oi = 0;
  while (mi < movie.length || oi < other.length) {
    // 지금까지 소진한 비율이 더 낮은 쪽(영화 vs 응원)을 우선 넣어서 고르게 섞음
    const movieRatio = movie.length ? mi / movie.length : Infinity;
    const otherRatio = other.length ? oi / other.length : Infinity;
    if (mi < movie.length && movieRatio <= otherRatio) {
      result.push(movie[mi++]);
    } else if (oi < other.length) {
      result.push(other[oi++]);
    } else {
      result.push(movie[mi++]);
    }
  }
  return result;
}

function pickDailyQuote() {
  if (!QUOTES || QUOTES.length === 0) return "";
  const ordered = buildInterleavedQuoteOrder(QUOTES);
  if (!ordered.length) return "";
  const d = new Date();
  // 로컬(브라우저) 자정 기준으로 "1970-01-01부터 며칠째인지" 계산 (UTC 기준으로 하면 한국 시간 자정~오전9시 사이에
  // 날짜가 하루 밀려서 계산되는 문제가 있어서, 연/월/일을 로컬 기준으로 뽑아 UTC 타임스탬프로 변환)
  const dayIndex = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  const idx = dayIndex % ordered.length;
  return (ordered[idx] || {}).text || "";
}

function checkAndShowDailyQuote() {
  let lastSeen = "";
  try { lastSeen = localStorage.getItem(DAILY_QUOTE_SEEN_KEY) || ""; } catch (e) {}
  const today = todayStr();
  if (lastSeen === today) { checkAndShowDailyNewsPopup(); return; } // 오늘 이미 봤으면 다시 안 보여줌 (대신 뉴스 팝업은 체크)
  const quote = pickDailyQuote();
  if (!quote) { checkAndShowDailyNewsPopup(); return; }

  const dateEl = document.getElementById("dailyQuoteDate");
  const textEl = document.getElementById("dailyQuoteText");
  if (dateEl) {
    const d = new Date();
    dateEl.textContent = (d.getMonth() + 1) + "월 " + d.getDate() + "일의 한마디";
  }
  if (textEl) textEl.textContent = quote;
  const overlay = document.getElementById("dailyQuoteOverlay");
  if (overlay) overlay.style.display = "flex";

  try { localStorage.setItem(DAILY_QUOTE_SEEN_KEY, today); } catch (e) {}
}

function closeDailyQuote() {
  const overlay = document.getElementById("dailyQuoteOverlay");
  if (overlay) overlay.style.display = "none";
  checkAndShowDailyNewsPopup();
}

/* =========================================================================
   📰 오늘의 물류뉴스 팝업 (한마디 팝업 닫으면 이어서, 하루에 한 번만 보여줌)
   ========================================================================= */
const DAILY_NEWS_SEEN_KEY = "cs_guide_daily_news_seen";

async function checkAndShowDailyNewsPopup() {
  if (!LOGISTICS_NEWS_API_URL) return;
  let lastSeen = "";
  try { lastSeen = localStorage.getItem(DAILY_NEWS_SEEN_KEY) || ""; } catch (e) {}
  const today = todayStr();
  if (lastSeen === today) return; // 오늘 이미 봤으면 다시 안 보여줌

  const items = await fetchNewsListFromServer();
  if (!items || items.length === 0) return; // 못 불러왔거나 아직 하나도 없으면 조용히 스킵 (에러 팝업 X)

  const todayItems = items.filter((it) => it.date === today);
  if (todayItems.length === 0) return; // 오늘자 뉴스가 아직 안 올라왔으면 스킵

  const wrap = document.getElementById("dailyNewsItemsWrap");
  const titleEl = document.getElementById("dailyNewsTitle");
  if (titleEl) {
    const d = new Date();
    titleEl.textContent = (d.getMonth() + 1) + "월 " + d.getDate() + "일의 물류뉴스";
  }
  if (wrap) {
    wrap.innerHTML = todayItems.map((item) => {
      const meta = newsCategoryMeta(item.category);
      const bullets = splitNewsSummaryToBullets(item.summary);
      return `
        <div class="daily-news-item">
          <div class="daily-news-meta">${meta.icon} ${escapeHtml((item.category || "").split(" (")[0])} · 출처: ${escapeHtml(item.source)}</div>
          <div class="daily-news-item-title">${escapeHtml(item.title)}</div>
          <div class="daily-news-item-summary"><ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul></div>
          ${item.url ? `<a class="daily-news-item-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">🔗 원문 보기</a>` : ""}
        </div>
      `;
    }).join("");
  }

  const overlay = document.getElementById("dailyNewsOverlay");
  if (overlay) overlay.style.display = "flex";

  try { localStorage.setItem(DAILY_NEWS_SEEN_KEY, today); } catch (e) {}
}

function closeDailyNewsPopup() {
  const overlay = document.getElementById("dailyNewsOverlay");
  if (overlay) overlay.style.display = "none";
}

/* =========================================================================
   🌤 날씨 위젯 (Open-Meteo - 무료 공개 API, 키/백엔드 불필요)
   서울·부산 두 곳을 항상 같이 보여줌 (도시 전환 아님)
   ========================================================================= */
const WEATHER_CITIES = {
  seoul: { label: "서울", lat: 37.5665, lon: 126.9780 },
  busan: { label: "부산", lat: 35.1796, lon: 129.0756 }
};
let weatherWidgetData = {}; // { seoul: {wx,aq}, busan: {wx,aq}, extra: {wx,aq} }
let extraWeatherCity = null; // { label, lat, lon } - 검색해서 추가한 도시 (서울/부산 외 추가로 하나)
const EXTRA_WEATHER_CITY_KEY = "weather_extra_city_v1";
try {
  const saved = localStorage.getItem(EXTRA_WEATHER_CITY_KEY);
  if (saved) extraWeatherCity = JSON.parse(saved);
} catch (e) {}

/* WMO 날씨 코드 -> 한국어 설명 + 이모지 (https://open-meteo.com/en/docs 코드표 기준) */
function wmoWeatherInfo(code) {
  const table = {
    0: ["맑음", "☀️"], 1: ["대체로 맑음", "🌤"], 2: ["구름 조금", "⛅"], 3: ["흐림", "☁️"],
    45: ["안개", "🌫"], 48: ["안개", "🌫"],
    51: ["약한 이슬비", "🌦"], 53: ["이슬비", "🌦"], 55: ["강한 이슬비", "🌧"],
    61: ["약한 비", "🌦"], 63: ["비", "🌧"], 65: ["강한 비", "🌧"],
    71: ["약한 눈", "🌨"], 73: ["눈", "🌨"], 75: ["강한 눈", "❄️"],
    80: ["소나기", "🌦"], 81: ["소나기", "🌧"], 82: ["강한 소나기", "⛈"],
    95: ["뇌우", "⛈"], 96: ["뇌우(우박)", "⛈"], 99: ["강한 뇌우(우박)", "⛈"]
  };
  return table[code] || ["-", "🌡"];
}

/* 국내 대기환경기준(간이) 기준 등급 */
function aqiGrade(pm10, pm25) {
  const gradeOf = (v, breaks) => {
    if (v == null) return 0;
    if (v <= breaks[0]) return 0; // 좋음
    if (v <= breaks[1]) return 1; // 보통
    if (v <= breaks[2]) return 2; // 나쁨
    return 3; // 매우나쁨
  };
  const g10 = gradeOf(pm10, [30, 80, 150]);
  const g25 = gradeOf(pm25, [15, 35, 75]);
  const g = Math.max(g10, g25);
  return [
    { label: "좋음", cls: "aqi-good" },
    { label: "보통", cls: "aqi-normal" },
    { label: "나쁨", cls: "aqi-bad" },
    { label: "매우나쁨", cls: "aqi-verybad" }
  ][g];
}

async function fetchCityWeather(city) {
  const [wxRes, aqRes] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}&current=pm10,pm2_5&timezone=auto`)
  ]);
  const wx = await wxRes.json();
  const aq = await aqRes.json().catch(() => null);
  if (!wx || !wx.current) throw new Error("날씨 데이터를 못 받아왔어요.");
  return { wx, aq };
}

async function loadWeatherWidget() {
  const contentEl = document.getElementById("weatherWidgetContent");

  try {
    const fetches = [
      fetchCityWeather(WEATHER_CITIES.seoul),
      fetchCityWeather(WEATHER_CITIES.busan)
    ];
    if (extraWeatherCity) fetches.push(fetchCityWeather(extraWeatherCity));

    const results = await Promise.all(fetches);
    weatherWidgetData = { seoul: results[0], busan: results[1] };
    if (extraWeatherCity) weatherWidgetData.extra = results[2];

    const seoulTemp = Math.round(results[0].wx.current.temperature_2m);
    const busanTemp = Math.round(results[1].wx.current.temperature_2m);
    const seoulEmoji = wmoWeatherInfo(results[0].wx.current.weather_code)[1];
    const busanEmoji = wmoWeatherInfo(results[1].wx.current.weather_code)[1];

    let text = `${seoulEmoji} 서울 ${seoulTemp}° · ${busanEmoji} 부산 ${busanTemp}°`;
    if (extraWeatherCity && weatherWidgetData.extra) {
      const t = Math.round(weatherWidgetData.extra.wx.current.temperature_2m);
      const e = wmoWeatherInfo(weatherWidgetData.extra.wx.current.weather_code)[1];
      text += ` · ${e} ${extraWeatherCity.label} ${t}°`;
    }
    if (contentEl) contentEl.textContent = text;

    renderWeatherDetailPanel();
  } catch (err) {
    console.error("날씨 위젯 불러오기 실패:", err);
    if (contentEl) contentEl.textContent = "🌡 날씨 불러오기 실패";
  }
}

function formatKoreanHour(hourNum) {
  const h = hourNum % 24;
  const period = h < 5 ? "새벽" : h < 12 ? "오전" : h < 18 ? "오후" : h < 21 ? "저녁" : "밤";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${period} ${h12}시`;
}

/* 시간대별 강수확률(hourly.precipitation_probability) 중, 지금 이후로 처음 임계값(기본 50%)을
   넘는 시각을 찾아서 "오후 3시경부터 비 소식이 있어요 (65%)" 같은 문구를 만듦.
   넘는 시간이 없으면 null 반환(호출부에서 오늘 최고 강수확률로 대체 표시함) */
function findRainForecastMessage(wx, threshold) {
  threshold = threshold || 50;
  if (!wx.hourly || !wx.hourly.time || !wx.hourly.precipitation_probability) return null;
  if (!wx.current || !wx.current.time) return null;

  const nowKey = wx.current.time.slice(0, 13); // "2026-08-17T15" 형태로 자르기 - hourly.time과 시간 단위까지만 비교
  const times = wx.hourly.time;
  const probs = wx.hourly.precipitation_probability;

  for (let i = 0; i < times.length; i++) {
    if (times[i].slice(0, 13) < nowKey) continue; // 이미 지난 시각은 건너뜀
    if (probs[i] >= threshold) {
      const hour = parseInt(times[i].slice(11, 13), 10);
      return { label: formatKoreanHour(hour) + "경부터 비 소식", prob: probs[i] };
    }
  }
  return null;
}

function buildWeatherCityBlockHtml(cityKey) {
  const city = cityKey === "extra" ? extraWeatherCity : WEATHER_CITIES[cityKey];
  const data = weatherWidgetData[cityKey];
  if (!data || !city) return "";
  const { wx, aq } = data;
  const [desc, emoji] = wmoWeatherInfo(wx.current.weather_code);
  const temp = Math.round(wx.current.temperature_2m);
  const tMax = wx.daily ? Math.round(wx.daily.temperature_2m_max[0]) : null;
  const tMin = wx.daily ? Math.round(wx.daily.temperature_2m_min[0]) : null;
  const rainForecast = findRainForecastMessage(wx, 50);
  const dailyMaxPop = wx.daily ? wx.daily.precipitation_probability_max[0] : null;
  const pm10 = aq && aq.current ? aq.current.pm10 : null;
  const pm25 = aq && aq.current ? aq.current.pm2_5 : null;
  const grade = aqiGrade(pm10, pm25);

  let rainRowHtml = "";
  if (rainForecast) {
    rainRowHtml = `<div class="weather-detail-row"><span>☔ ${escapeHtml(rainForecast.label)}</span><b>${rainForecast.prob}%</b></div>`;
  } else if (dailyMaxPop !== null) {
    rainRowHtml = `<div class="weather-detail-row"><span>오늘 최고 강수확률</span><b>${dailyMaxPop}%</b></div>`;
  }

  return `
    <div class="weather-city-block">
      <div class="weather-detail-city">${escapeHtml(city.label)}${cityKey === "extra" ? ` <button class="weather-remove-city-btn" onclick="event.stopPropagation(); removeExtraWeatherCity()">✕</button>` : ""}</div>
      <div class="weather-detail-main">
        <span class="weather-detail-emoji">${emoji}</span>
        <div>
          <div class="weather-detail-temp">${temp}°C</div>
          <div class="weather-detail-desc">${escapeHtml(desc)}</div>
        </div>
      </div>
      ${tMax !== null ? `<div class="weather-detail-row"><span>최고/최저</span><b>${tMax}° / ${tMin}°</b></div>` : ""}
      ${rainRowHtml}
      ${(pm10 !== null || pm25 !== null) ? `<div class="weather-detail-row"><span>미세먼지</span><b><span class="aqi-badge ${grade.cls}">${grade.label}</span></b></div>` : ""}
    </div>
  `;
}

function renderWeatherDetailPanel() {
  const panel = document.getElementById("weatherDetailPanel");
  if (!panel) return;
  panel.innerHTML = `
    <div class="weather-detail-cities">
      ${buildWeatherCityBlockHtml("seoul")}
      ${buildWeatherCityBlockHtml("busan")}
      ${extraWeatherCity ? buildWeatherCityBlockHtml("extra") : ""}
    </div>
    ${!extraWeatherCity ? `
      <div class="weather-add-city-row">
        <input type="text" id="weatherCitySearchInput" placeholder="다른 도시 검색 (예: 뉴욕, 상하이)" onkeydown="if(event.key==='Enter') searchAndAddWeatherCity()">
        <button onclick="searchAndAddWeatherCity()">추가</button>
      </div>
      <div id="weatherCitySearchStatus" class="weather-add-city-status"></div>
    ` : ""}
  `;
}

async function searchAndAddWeatherCity() {
  const input = document.getElementById("weatherCitySearchInput");
  const statusEl = document.getElementById("weatherCitySearchStatus");
  const q = input ? input.value.trim() : "";
  if (!q) return;

  if (statusEl) statusEl.textContent = "검색 중...";
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ko&format=json`);
    const data = await res.json();
    const result = data && data.results && data.results[0];
    if (!result) {
      if (statusEl) statusEl.textContent = `"${q}"를 못 찾았어요. 영문 도시명으로도 시도해보세요.`;
      return;
    }
    const label = result.name + (result.admin1 && result.admin1 !== result.name ? `, ${result.admin1}` : "") + (result.country ? ` (${result.country})` : "");
    extraWeatherCity = { label, lat: result.latitude, lon: result.longitude };
    try { localStorage.setItem(EXTRA_WEATHER_CITY_KEY, JSON.stringify(extraWeatherCity)); } catch (e) {}
    if (statusEl) statusEl.textContent = "";
    await loadWeatherWidget();
    const panel = document.getElementById("weatherDetailPanel");
    if (panel) panel.style.display = "block"; // 검색 후에도 패널 열려있게 유지
  } catch (err) {
    if (statusEl) statusEl.textContent = "검색에 실패했어요. 다시 시도해주세요.";
  }
}

function removeExtraWeatherCity() {
  extraWeatherCity = null;
  try { localStorage.removeItem(EXTRA_WEATHER_CITY_KEY); } catch (e) {}
  delete weatherWidgetData.extra;
  loadWeatherWidget();
  const panel = document.getElementById("weatherDetailPanel");
  if (panel) panel.style.display = "block";
}

function toggleWeatherDetail() {
  const panel = document.getElementById("weatherDetailPanel");
  if (!panel) return;
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

document.addEventListener("click", (e) => {
  const widget = document.getElementById("weatherWidget");
  const panel = document.getElementById("weatherDetailPanel");
  if (widget && panel && !widget.contains(e.target)) panel.style.display = "none";
});

document.addEventListener("DOMContentLoaded", () => {
  loadWeatherWidget();
  setInterval(loadWeatherWidget, 30 * 60 * 1000); // 30분마다 자동 갱신
});

/* =========================================================================
   🕐 세계시간 위젯 (Open-Meteo 지오코딩 API로 전세계 아무 도시나 실시간 검색 -
   날씨 도시 검색과 같은 방식. 결과에 timezone이 같이 오기 때문에 이것만으로 충분함)
   ========================================================================= */
const WORLD_CLOCK_PINNED_KEY = "world_clock_pinned_v2";
let worldClockPinned = []; // [{ label, tz }, ...]
try {
  const saved = localStorage.getItem(WORLD_CLOCK_PINNED_KEY);
  if (saved) worldClockPinned = JSON.parse(saved);
} catch (e) {}

function formatWorldClockTime(tz) {
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat("ko-KR", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false
  }).format(now);
  const dateStr = new Intl.DateTimeFormat("ko-KR", {
    timeZone: tz, month: "2-digit", day: "2-digit", weekday: "short"
  }).format(now);
  // 서울과 시차 계산 (offset 비교 방식)
  const seoulOffset = getTzOffsetMinutes("Asia/Seoul", now);
  const tzOffset = getTzOffsetMinutes(tz, now);
  const diffH = (tzOffset - seoulOffset) / 60;
  const diffLabel = diffH === 0 ? "서울과 동일" : `서울보다 ${diffH > 0 ? "+" : ""}${diffH}시간`;
  return { timeStr, dateStr, diffLabel };
}

function getTzOffsetMinutes(tz, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === "24" ? 0 : parts.hour, parts.minute, parts.second);
  return (asUTC - date.getTime()) / 60000;
}

function renderWorldClockPanel() {
  const panel = document.getElementById("worldClockPanel");
  if (!panel) return;

  const pinnedHtml = worldClockPinned.map(({ label, tz }) => {
    const { timeStr, dateStr, diffLabel } = formatWorldClockTime(tz);
    return `
      <div class="world-clock-row">
        <div>
          <div class="world-clock-city">${escapeHtml(label)}</div>
          <div class="world-clock-diff">${escapeHtml(dateStr)} · ${escapeHtml(diffLabel)}</div>
        </div>
        <div class="world-clock-time-wrap">
          <div class="world-clock-time">${escapeHtml(timeStr)}</div>
          <button class="weather-remove-city-btn" onclick="event.stopPropagation(); removeWorldClockCity('${escapeHtml(tz)}')">✕</button>
        </div>
      </div>
    `;
  }).join("");

  panel.innerHTML = `
    ${pinnedHtml || '<div class="world-clock-empty">아래에서 도시를 검색해서 추가해보세요</div>'}
    <div class="weather-add-city-row">
      <input type="text" id="worldClockSearchInput" placeholder="도시 검색 (예: 워싱턴, 뉴욕)" oninput="handleWorldClockSearchInput(this.value)" onkeydown="if(event.key==='Enter') addFirstWorldClockSuggestion()">
    </div>
    <div id="worldClockSuggestions" class="world-clock-suggestions"></div>
  `;
}

let worldClockSearchDebounce = null;
function handleWorldClockSearchInput(query) {
  clearTimeout(worldClockSearchDebounce);
  const wrap = document.getElementById("worldClockSuggestions");
  const q = query.trim();
  if (!q) { if (wrap) wrap.innerHTML = ""; return; }
  if (wrap) wrap.innerHTML = '<div class="world-clock-no-match">검색 중...</div>';
  worldClockSearchDebounce = setTimeout(() => searchWorldClockCities(q), 350);
}

async function searchWorldClockCities(q) {
  const wrap = document.getElementById("worldClockSuggestions");
  if (!wrap) return;
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=ko&format=json`);
    const data = await res.json();
    const results = (data && data.results) || [];
    if (results.length === 0) {
      wrap.innerHTML = '<div class="world-clock-no-match">일치하는 도시가 없어요. 영문 도시명으로도 시도해보세요.</div>';
      return;
    }
    wrap.innerHTML = results.map((r) => {
      const label = r.name + (r.admin1 && r.admin1 !== r.name ? `, ${r.admin1}` : "") + (r.country ? ` (${r.country})` : "");
      return `<div class="world-clock-suggestion" onclick="addWorldClockCity('${escapeHtml(label).replace(/'/g, "\\'")}', '${r.timezone}')">${escapeHtml(label)}</div>`;
    }).join("");
  } catch (err) {
    wrap.innerHTML = '<div class="world-clock-no-match">검색에 실패했어요. 다시 시도해주세요.</div>';
  }
}

function addFirstWorldClockSuggestion() {
  const wrap = document.getElementById("worldClockSuggestions");
  const first = wrap && wrap.querySelector(".world-clock-suggestion");
  if (first) first.click();
}

function addWorldClockCity(label, tz) {
  if (!worldClockPinned.some((c) => c.tz === tz)) worldClockPinned.push({ label, tz });
  try { localStorage.setItem(WORLD_CLOCK_PINNED_KEY, JSON.stringify(worldClockPinned)); } catch (e) {}
  renderWorldClockPanel();
  const input = document.getElementById("worldClockSearchInput");
  if (input) input.focus();
}

function removeWorldClockCity(tz) {
  worldClockPinned = worldClockPinned.filter((c) => c.tz !== tz);
  try { localStorage.setItem(WORLD_CLOCK_PINNED_KEY, JSON.stringify(worldClockPinned)); } catch (e) {}
  renderWorldClockPanel();
}

function toggleWorldClockDetail() {
  const panel = document.getElementById("worldClockPanel");
  if (!panel) return;
  const willOpen = panel.style.display === "none";
  panel.style.display = willOpen ? "block" : "none";
  if (willOpen) renderWorldClockPanel();
}

document.addEventListener("click", (e) => {
  const widget = document.getElementById("worldClockWidget");
  const panel = document.getElementById("worldClockPanel");
  if (widget && panel && !widget.contains(e.target)) panel.style.display = "none";
});

setInterval(() => {
  const panel = document.getElementById("worldClockPanel");
  if (panel && panel.style.display !== "none") renderWorldClockPanel();
}, 30000); // 패널이 열려있으면 30초마다 시각 갱신

/* =========================================================================
   🕘 최근 사용한 메뉴 (이 브라우저에만 저장되는 개인 기록, 내보내기/가져오기에 포함 안 됨)
   ========================================================================= */
const RECENT_ITEMS_KEY = "cs_guide_recent_items";
const RECENT_ITEMS_MAX = 5;

function loadRecentItems() {
  try {
    const saved = localStorage.getItem(RECENT_ITEMS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}

let RECENT_ITEMS = loadRecentItems();

function recordRecentItem(kind, id, label) {
  RECENT_ITEMS = RECENT_ITEMS.filter((it) => !(it.kind === kind && it.id === id));
  RECENT_ITEMS.unshift({ kind: kind, id: id, label: label });
  RECENT_ITEMS = RECENT_ITEMS.slice(0, RECENT_ITEMS_MAX);
  try { localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(RECENT_ITEMS)); } catch (e) {}
  renderRecentItemsRow();
}

function renderRecentItemsRow() {
  const wrap = document.getElementById("recentItemsRow");
  if (!wrap) return;
  if (RECENT_ITEMS.length === 0) { wrap.style.display = "none"; wrap.innerHTML = ""; return; }
  wrap.style.display = "flex";
  wrap.innerHTML = "";
  const label = document.createElement("span");
  label.className = "recent-items-label";
  label.textContent = "🕘 최근 이용한 메뉴";
  wrap.appendChild(label);
  RECENT_ITEMS.forEach((it) => {
    const pill = document.createElement("button");
    pill.className = "recent-pill";
    pill.textContent = it.label;
    pill.onclick = () => jumpToResult(it.kind, it.id);
    wrap.appendChild(pill);
  });
}

/* =========================================================================
   📝 개인 포스트잇 메모 (이 브라우저에만 저장됨, 다른 팀원에게 안 보이고 내보내기/가져오기에도 포함 안 됨)
   ========================================================================= */
const MEMO_NOTES_KEY = "cs_guide_memo_notes";
const MEMO_LEGACY_KEY = "cs_guide_personal_memo"; // 예전 버전(포스트잇 되기 전)의 단일 메모 - 있으면 첫 포스트잇으로 옮겨줌
const MEMO_COLORS = ["memo-yellow", "memo-pink", "memo-mint", "memo-blue", "memo-lavender", "memo-peach"];
let memoSaveTimers = {};

function loadMemoNotes() {
  try {
    const saved = localStorage.getItem(MEMO_NOTES_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  // 마이그레이션: 예전 단일 메모가 남아있으면 첫 포스트잇으로 살려줌
  try {
    const legacy = localStorage.getItem(MEMO_LEGACY_KEY);
    if (legacy && legacy.trim()) {
      return [{ id: genId("memo"), text: legacy, color: "memo-yellow", pinned: false, ts: Date.now() }];
    }
  } catch (e) {}
  return [];
}

function saveMemoNotes(notes) {
  try { localStorage.setItem(MEMO_NOTES_KEY, JSON.stringify(notes)); return true; } catch (e) { return false; }
}

/* 아이디를 기반으로 -3 ~ 3도 사이 살짝 삐뚤어진 회전각을 항상 같은 값으로 뽑아줌 (진짜 포스트잇 붙인 느낌) */
function memoRotationFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h += id.charCodeAt(i);
  return (h % 7) - 3;
}

/* 입력한 내용(HTML)에 맞춰 메모 카드의 가로/세로 크기를 함께 늘려줌 */
function autoGrowMemoBox(el) {
  const card = el.closest(".memo-note");
  if (!card) return;
  // 임시로 너비를 넉넉하게 풀어서 자연스러운 콘텐츠 크기부터 재본 뒤, 상한선 안에서 확정
  card.style.width = "520px";
  const contentWidth = Math.min(520, Math.max(260, el.scrollWidth + 40));
  card.style.width = contentWidth + "px";
  const contentHeight = Math.max(220, el.scrollHeight + 100);
  card.style.height = contentHeight + "px";
}

/* 지금 마우스로 드래그해서 선택된 범위가, 메모박스(contenteditable) 안에 있는지 확인 */
function getActiveMemoSelectionBox() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType === 3) node = node.parentNode;
  const box = node.closest && node.closest(".memo-note-text");
  return box || null;
}

/* 드래그로 텍스트를 선택하면, 그 근처에 작은 서식 툴바(B / 형광펜)를 띄워줌 */
function handleMemoSelection(e) {
  const toolbar = document.getElementById("memoFormatToolbar");
  if (!toolbar) return;
  const box = getActiveMemoSelectionBox();
  if (!box) { toolbar.style.display = "none"; return; }

  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) { toolbar.style.display = "none"; return; }

  toolbar.style.display = "flex";
  toolbar.style.top = (window.scrollY + rect.top - 42) + "px";
  toolbar.style.left = (window.scrollX + rect.left + rect.width / 2 - 70) + "px";
  toolbar.dataset.targetBoxId = box.dataset.noteId;
}

/* 볼드 버튼을 눌렀을 때 */
function applyMemoBold() {
  applyMemoFormatCommon(() => document.execCommand("bold", false, null));
}

/* 형광펜 버튼을 눌렀을 때 - 선택 영역을 <mark> 태그로 직접 감싸줌 (브라우저 호환성 문제 없이 안정적으로 작동) */
function applyMemoHighlight(hlClass) {
  applyMemoFormatCommon(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const mark = document.createElement("mark");
    if (hlClass) mark.className = hlClass;
    try {
      range.surroundContents(mark);
    } catch (e) {
      // 선택 범위가 여러 태그에 걸쳐 있어 surroundContents가 실패하는 경우의 대체 처리
      const content = range.extractContents();
      mark.appendChild(content);
      range.insertNode(mark);
    }
    sel.removeAllRanges();
  });
}

/* 서식(볼드/하이라이트) 지우기 */
function applyMemoClearFormat() {
  applyMemoFormatCommon(() => document.execCommand("removeFormat", false, null));
}

function applyMemoFormatCommon(action) {
  const toolbar = document.getElementById("memoFormatToolbar");
  const noteId = toolbar ? toolbar.dataset.targetBoxId : null;
  action();
  if (toolbar) toolbar.style.display = "none";
  if (noteId) {
    const box = document.querySelector(`.memo-note-text[data-note-id="${noteId}"]`);
    if (box) {
      box.focus();
      onMemoNoteInput(noteId, box.innerHTML);
      autoGrowMemoBox(box);
    }
  }
}

/* 툴바 버튼을 클릭하는 순간에도 방금 드래그해서 선택한 텍스트 범위가 풀리지 않도록,
   버튼의 mousedown 시점에 기본 동작(포커스 이동)을 막아줌 */
document.addEventListener("DOMContentLoaded", () => {
  const toolbar = document.getElementById("memoFormatToolbar");
  if (toolbar) {
    toolbar.addEventListener("mousedown", (e) => e.preventDefault());
  }
  document.addEventListener("mousedown", (e) => {
    if (toolbar && toolbar.style.display !== "none" && !toolbar.contains(e.target) && !e.target.closest(".memo-note-text")) {
      toolbar.style.display = "none";
    }
  });
});

function renderMemoTab() {
  const board = document.getElementById("memoBoard");
  if (!board) return;
  const notes = loadMemoNotes();
  board.innerHTML = "";

  if (notes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 포스트잇이 없어요. 위 버튼으로 첫 메모를 붙여보세요 🐳";
    board.appendChild(empty);
    return;
  }

  const sorted = notes.slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (b.ts || 0) - (a.ts || 0);
  });

  sorted.forEach((note) => {
    const card = document.createElement("div");
    card.className = "memo-note " + (note.color || "memo-yellow") + (note.pinned ? " memo-pinned" : "");
    card.style.transform = "rotate(" + memoRotationFor(note.id) + "deg)";

    const pinBtn = document.createElement("button");
    pinBtn.className = "memo-pin-btn";
    pinBtn.title = note.pinned ? "고정 해제" : "위에 고정";
    pinBtn.textContent = note.pinned ? "📌" : "📍";
    pinBtn.onclick = () => toggleMemoPin(note.id);
    card.appendChild(pinBtn);

    // textarea 대신 contenteditable div를 써서 볼드/형광펜 같은 서식을 지원함.
    // note.html이 있으면 그걸 쓰고, 옛날 데이터(순수 텍스트 note.text)만 있으면 그대로 옮겨줌(자동 마이그레이션).
    const box = document.createElement("div");
    box.className = "memo-note-text";
    box.contentEditable = "true";
    box.dataset.noteId = note.id;
    box.innerHTML = (note.html != null ? note.html : escapeHtml(note.text || "")) || "";
    if (!box.innerHTML) box.dataset.empty = "true";

    box.addEventListener("input", () => {
      box.dataset.empty = box.innerText.trim() ? "false" : "true";
      onMemoNoteInput(note.id, box.innerHTML);
      autoGrowMemoBox(box);
    });
    box.addEventListener("mouseup", () => setTimeout(handleMemoSelection, 0));
    box.addEventListener("keyup", (e) => {
      if (e.shiftKey) setTimeout(handleMemoSelection, 0);
    });
    card.appendChild(box);
    requestAnimationFrame(() => autoGrowMemoBox(box));

    const footer = document.createElement("div");
    footer.className = "memo-note-footer";

    const copyBtn = document.createElement("button");
    copyBtn.className = "memo-note-btn";
    copyBtn.textContent = "📋 복사";
    copyBtn.onclick = () => copyMemoNote(note.id);
    footer.appendChild(copyBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "memo-note-btn";
    delBtn.textContent = "🗑 삭제";
    delBtn.onclick = () => deleteMemoNote(note.id);
    footer.appendChild(delBtn);

    card.appendChild(footer);
    board.appendChild(card);
  });
}

function addMemoNote() {
  const notes = loadMemoNotes();
  const color = MEMO_COLORS[Math.floor(Math.random() * MEMO_COLORS.length)];
  const newNote = { id: genId("memo"), text: "", html: "", color: color, pinned: false, ts: Date.now() };
  notes.unshift(newNote);
  saveMemoNotes(notes);
  renderMemoTab();
  setTimeout(() => {
    const el = document.querySelector('.memo-note .memo-note-text');
    if (el) el.focus();
  }, 50);
}

/* value는 contenteditable div의 innerHTML. 저장은 html로 하고,
   복사/검색 등에서 쓰기 편하도록 순수 텍스트(text)도 같이 뽑아서 저장해둠. */
function onMemoNoteInput(id, htmlValue) {
  clearTimeout(memoSaveTimers[id]);
  memoSaveTimers[id] = setTimeout(() => {
    const notes = loadMemoNotes();
    const note = notes.find((n) => n.id === id);
    if (note) {
      note.html = htmlValue;
      const tmp = document.createElement("div");
      tmp.innerHTML = htmlValue;
      note.text = tmp.innerText || tmp.textContent || "";
      saveMemoNotes(notes);
    }
  }, 400);
}

function toggleMemoPin(id) {
  const notes = loadMemoNotes();
  const note = notes.find((n) => n.id === id);
  if (!note) return;
  note.pinned = !note.pinned;
  saveMemoNotes(notes);
  renderMemoTab();
}

function deleteMemoNote(id) {
  if (!confirm("이 포스트잇을 지울까요? 되돌릴 수 없어요.")) return;
  const notes = loadMemoNotes().filter((n) => n.id !== id);
  saveMemoNotes(notes);
  renderMemoTab();
}

function copyMemoNote(id) {
  const notes = loadMemoNotes();
  const note = notes.find((n) => n.id === id);
  if (!note || !note.text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(note.text).then(() => alert("복사 완료 💖")).catch(() => legacyCopy(note.text));
  } else { legacyCopy(note.text); }
}

/* =========================================================================
   🧮 계산기 탭 (LAP 연체료 계산기 / D·O 환율 계산기)
   ========================================================================= */
let currentCalcTool = "lap";

/* Late Payment 요율: 출항일 다음날부터 셈한 연체일수 기준, 7일 단위 구간마다 USD 50씩 증가.
   1~7일: 무료, 8~14일: 50, 15~21일: 100 ... */
function lapChargeForDays(days) {
  if (days <= 7) return 0;
  return Math.ceil((days - 7) / 7) * 50;
}

function switchCalcTool(tool) {
  currentCalcTool = tool;
  document.querySelectorAll(".calc-sub-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.calc === tool);
  });
  renderCalcTool();
}

function renderCalcTool() {
  document.querySelectorAll(".calc-sub-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.calc === currentCalcTool);
  });
  if (currentCalcTool === "lap") renderLapCalculator();
  else renderDoCalculator();
}

/* ---- 💸 LAP(연체료) 계산기 ---- */
function renderLapCalculator() {
  const body = document.getElementById("calcToolBody");
  body.innerHTML = "";

  const card = document.createElement("div");
  card.className = "calc-card";

  card.innerHTML = `
    <div class="hint" style="margin-bottom:14px;">모선 출항일 다음날부터 연체일수를 세요. 7일 구간마다 USD 50씩 늘어나요 (1~7일은 무료).</div>
    <div class="calc-field"><label>🚩 모선 출항일</label><input type="date" id="lapDeparture"></div>
    <div class="calc-field"><label>💰 송금일(입금일)</label><input type="date" id="lapPayment"></div>
    <div id="lapResultBox"></div>
  `;
  body.appendChild(card);

  const recalc = () => renderLapResult();
  document.getElementById("lapDeparture").oninput = recalc;
  document.getElementById("lapPayment").oninput = recalc;
  renderLapResult();
}

function renderLapResult() {
  const box = document.getElementById("lapResultBox");
  if (!box) return;
  const dep = document.getElementById("lapDeparture").value;
  const pay = document.getElementById("lapPayment").value;
  if (!dep || !pay) { box.innerHTML = ""; return; }

  const depDate = new Date(dep + "T00:00:00");
  const payDate = new Date(pay + "T00:00:00");
  const days = Math.round((payDate - depDate) / 86400000);

  if (days < 0) {
    box.innerHTML = '<div class="calc-result-box"><div class="calc-result-row"><span>송금일이 출항일보다 빨라요. 날짜를 다시 확인해주세요.</span></div></div>';
    return;
  }

  const charge = lapChargeForDays(days);
  let html = '<div class="calc-result-box">'
    + '<div class="calc-result-row"><span>연체일수</span><span>' + days + '일</span></div>'
    + '<div class="calc-result-row total"><span>청구 금액</span><span>' + (charge === 0 ? "무료 (No Charge)" : "USD " + charge.toLocaleString()) + '</span></div>'
    + '</div>';

  if (days > 56) {
    html += '<div class="calc-warning-box">⚠️ 이 금액은 표에 직접 적혀있는 금액이 아니에요. 56일까지만 표에 나와 있고, 그 이후는 "And So On" 규칙(7일마다 USD 50씩 증가)대로 추정 계산한 값이에요. 실제 청구 전에 꼭 한번 확인해주세요.</div>';
  }

  html += '<table class="calc-table"><thead><tr><th>구간</th><th>Charge (USD)</th></tr></thead><tbody>';
  const brackets = [
    [1, 7, 0], [8, 14, 50], [15, 21, 100], [22, 28, 150], [29, 35, 200],
    [36, 42, 250], [43, 49, 300], [50, 56, 350]
  ];
  brackets.forEach(([from, to, fee]) => {
    const isCurrent = days >= from && days <= to;
    html += '<tr class="' + (isCurrent ? "current-bracket" : "") + '"><td>' + from + (to === from ? "" : "th - " + to) + 'th</td><td>' + (fee === 0 ? "No Charge" : fee) + '</td></tr>';
  });
  const lastBracketEnd = 56;
  if (days > lastBracketEnd) {
    /* 표에 나온 구간(56일)을 넘어가면, "And so on" 규칙(7일마다 $50씩 증가)대로
       이어지는 구간들을 실제 날짜까지 전부 펼쳐서 보여줌 - 어디서 얼마가 나왔는지 투명하게 확인 가능 */
    let from = lastBracketEnd + 1;
    while (from <= days) {
      const to = from + 6;
      const fee = lapChargeForDays(from);
      const isCurrent = days >= from && days <= to;
      html += '<tr class="' + (isCurrent ? "current-bracket" : "") + ' calc-extrapolated-row"><td>' + from + "th - " + to + 'th <span class="calc-est-tag">추정</span></td><td>' + fee + '</td></tr>';
      from += 7;
    }
    html += '<tr><td>And so on</td><td>-</td></tr>';
  } else {
    html += '<tr><td>And so on</td><td>-</td></tr>';
  }
  html += '</tbody></table>';

  box.innerHTML = html;
}

/* ---- 💱 D/O 비용(환율) 계산기 - 항목을 자유롭게 추가/삭제하며 합산하는 진짜 계산기 ---- */
let DO_CALC_ITEMS = [
  { id: "d1", type: "foreign", amount: "" },
  { id: "d2", type: "krw", amount: "" },
];

/* 씨티은행 환율 워커에서 "오늘 환율"을 가져와 숫자만 뽑아온다.
   워커는 카카오 챗봇 응답 형식(JSON 안에 문구 텍스트)으로 내려주므로 정규식으로 숫자를 추출한다.
   실패하면(네트워크 문제, CORS 등) null을 반환하고, 호출 쪽에서 수동 입력으로 안내한다. */
async function fetchCitiFxRate() {
  const res = await fetch(CITI_FX_PROXY_URL, { method: "GET" });
  if (!res.ok) throw new Error("응답 실패: " + res.status);
  const data = await res.json();
  const text = data && data.template && data.template.outputs && data.template.outputs[0]
    && data.template.outputs[0].simpleText && data.template.outputs[0].simpleText.text;
  if (!text) throw new Error("응답 형식이 예상과 달라요");
  const rateMatch = text.match(/([\d,]+\.?\d*)\s*원/);
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (!rateMatch) throw new Error("환율 숫자를 찾을 수 없어요");
  const rate = parseFloat(rateMatch[1].replace(/,/g, ""));
  const date = dateMatch ? dateMatch[1] : todayStr();
  return { rate, date };
}

function renderDoCalculator(containerId) {
  const body = document.getElementById(containerId || "calcToolBody");
  body.innerHTML = "";

  if (!window.__doSelectedDate) window.__doSelectedDate = todayStr();

  const card = document.createElement("div");
  card.className = "calc-card";
  card.innerHTML = `
    <div class="hint" style="margin-bottom:14px;">날짜를 선택하면 그 날 환율이 자동으로 채워져요(오늘은 씨티은행에서 자동 조회, 이전 날짜는 저장해둔 값). 아래에서 외화·원화 항목을 자유롭게 추가해가며 계산기처럼 더해보세요.</div>
    <div class="calc-field"><label>📅 적용할 환율 날짜</label><input type="date" id="doDate" value="${window.__doSelectedDate}"></div>
    <div class="calc-field"><label>💱 해당 날짜 환율 (1 USD 당 원화)</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="number" id="doRate" placeholder="예: 1380" style="flex:1;">
        <button type="button" class="btn secondary-btn" id="doSaveRateBtn" title="이 날짜 환율을 저장해두면 다음에 팀원이 같은 날짜 선택 시 자동으로 불러와요">💾 이 날짜 환율 저장</button>
      </div>
      <div id="doRateStatus" class="hint" style="margin-top:6px;"></div>
    </div>
    <div class="label" style="margin-top:14px;">🧮 항목</div>
    <div id="doItemsWrap"></div>
    <div class="calc-item-add-row">
      <button type="button" class="btn secondary-btn" id="doAddForeignBtn">＋ 외화(USD) 항목 추가</button>
      <button type="button" class="btn secondary-btn" id="doAddKrwBtn">＋ 원화 항목 추가</button>
    </div>
    <div id="doResultBox"></div>
    <div id="doRateHistoryBox" style="margin-top:18px;"></div>
  `;
  body.appendChild(card);

  document.getElementById("doRate").oninput = renderDoResult;
  document.getElementById("doDate").onchange = (e) => {
    window.__doSelectedDate = e.target.value || todayStr();
    applyDoRateForSelectedDate();
  };
  document.getElementById("doSaveRateBtn").onclick = saveDoRateForSelectedDate;
  document.getElementById("doAddForeignBtn").onclick = () => {
    DO_CALC_ITEMS.push({ id: genId("d"), type: "foreign", amount: "" });
    renderDoItemsList();
  };
  document.getElementById("doAddKrwBtn").onclick = () => {
    DO_CALC_ITEMS.push({ id: genId("d"), type: "krw", amount: "" });
    renderDoItemsList();
  };

  renderDoItemsList();
  renderDoRateHistory();
  applyDoRateForSelectedDate();
}

/* 선택된 날짜에 맞는 환율을 자동으로 입력칸에 채워준다.
   오늘 날짜면 씨티은행 워커에서 실시간 조회 시도 → 실패 시 저장된 값(있으면) → 그것도 없으면 직접 입력 안내.
   오늘이 아니면 저장된 값이 있으면 채우고, 없으면 직접 입력 후 "저장" 버튼으로 등록하도록 안내. */
async function applyDoRateForSelectedDate() {
  const dateInput = document.getElementById("doDate");
  const rateInput = document.getElementById("doRate");
  const status = document.getElementById("doRateStatus");
  if (!dateInput || !rateInput || !status) return;
  const date = dateInput.value || todayStr();
  const isToday = date === todayStr();

  if (isToday) {
    status.textContent = "🔄 씨티은행 오늘 환율 조회 중...";
    try {
      const result = await fetchCitiFxRate();
      rateInput.value = result.rate;
      status.textContent = "✅ 씨티은행 오늘(" + result.date + ") 환율 자동 조회됨 — 필요하면 직접 수정할 수 있어요.";
      renderDoResult();
      return;
    } catch (e) {
      // 자동 조회 실패 시 저장된 값이라도 있으면 사용
      if (EXCHANGE_RATES[date] !== undefined) {
        rateInput.value = EXCHANGE_RATES[date];
        status.textContent = "⚠️ 자동 조회에 실패해서 저장해둔 값을 대신 불러왔어요. 최신 환율인지 확인해주세요.";
      } else {
        rateInput.value = "";
        status.textContent = "⚠️ 자동 조회에 실패했어요(네트워크 문제일 수 있어요). 환율을 직접 입력해주세요.";
      }
      renderDoResult();
      return;
    }
  }

  if (EXCHANGE_RATES[date] !== undefined) {
    rateInput.value = EXCHANGE_RATES[date];
    status.textContent = "📌 저장해둔 " + date + " 환율을 불러왔어요.";
  } else {
    rateInput.value = "";
    status.textContent = "ℹ️ 이 날짜에 저장된 환율이 없어요. 직접 입력한 뒤 \"💾 이 날짜 환율 저장\"을 누르면 다음부터 팀원들도 날짜 선택만으로 불러올 수 있어요.";
  }
  renderDoResult();
}

function saveDoRateForSelectedDate() {
  const dateInput = document.getElementById("doDate");
  const rateInput = document.getElementById("doRate");
  const status = document.getElementById("doRateStatus");
  const date = dateInput.value || todayStr();
  const rate = parseFloat(rateInput.value);
  if (!rate) { alert("저장할 환율 값을 먼저 입력해주세요."); return; }
  EXCHANGE_RATES[date] = rate;
  saveData();
  if (status) status.textContent = "✅ " + date + " 환율 " + rate.toLocaleString() + "원으로 저장했어요.";
  renderDoRateHistory();
}

function deleteDoRateForDate(date) {
  if (!confirm(date + " 저장된 환율을 삭제할까요?")) return;
  delete EXCHANGE_RATES[date];
  saveData();
  renderDoRateHistory();
  applyDoRateForSelectedDate();
}

function renderDoRateHistory() {
  const box = document.getElementById("doRateHistoryBox");
  if (!box) return;
  const dates = Object.keys(EXCHANGE_RATES).sort().reverse();
  if (dates.length === 0) { box.innerHTML = ""; return; }

  const isOpen = !!window.__doRateHistoryOpen;
  let html = '<div class="calc-rate-history-toggle' + (isOpen ? ' open' : '') + '" onclick="toggleDoRateHistory()">'
    + '<span>📅 저장된 지난 환율 <span class="calc-rate-history-count">' + dates.length + '건</span></span>'
    + '<span class="calc-rate-history-arrow">▾</span>'
    + '</div>';
  if (isOpen) {
    html += '<div class="calc-rate-history-list">';
    dates.forEach((date) => {
      html += '<div class="calc-rate-history-row">'
        + '<span class="calc-rate-history-date">' + escapeHtml(date) + '</span>'
        + '<span class="calc-rate-history-value">' + Number(EXCHANGE_RATES[date]).toLocaleString() + '원</span>'
        + '<button type="button" class="calc-item-del" onclick="deleteDoRateForDate(\'' + date + '\')" title="삭제">✕</button>'
        + '</div>';
    });
    html += '</div>';
  }
  box.innerHTML = html;
}

function toggleDoRateHistory() {
  window.__doRateHistoryOpen = !window.__doRateHistoryOpen;
  renderDoRateHistory();
}

function renderDoItemsList() {
  const wrap = document.getElementById("doItemsWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  DO_CALC_ITEMS.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "calc-item-row";

    const badge = document.createElement("span");
    badge.className = "calc-item-badge " + (item.type === "foreign" ? "calc-item-badge-usd" : "calc-item-badge-krw");
    badge.textContent = item.type === "foreign" ? "USD" : "원화";
    row.appendChild(badge);

    const input = document.createElement("input");
    input.type = "number";
    input.value = item.amount;
    input.placeholder = item.type === "foreign" ? "예: 250" : "예: 5000";
    input.oninput = (e) => { item.amount = e.target.value; renderDoResult(); };
    row.appendChild(input);

    if (item.type === "foreign") {
      const eq = document.createElement("span");
      eq.className = "calc-item-eq";
      eq.id = "doItemEq_" + item.id;
      row.appendChild(eq);
    }

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "calc-item-del";
    delBtn.textContent = "✕";
    delBtn.title = "이 항목 삭제";
    delBtn.onclick = () => {
      DO_CALC_ITEMS = DO_CALC_ITEMS.filter((it) => it.id !== item.id);
      renderDoItemsList();
    };
    row.appendChild(delBtn);

    wrap.appendChild(row);
  });

  renderDoResult();
}

function renderDoResult() {
  const box = document.getElementById("doResultBox");
  const rateInput = document.getElementById("doRate");
  if (!box || !rateInput) return;
  const rate = parseFloat(rateInput.value) || 0;

  let total = 0;
  let hasAny = false;
  const lines = [];

  DO_CALC_ITEMS.forEach((item) => {
    const amount = parseFloat(item.amount);
    if (!amount) {
      const eqEl = document.getElementById("doItemEq_" + item.id);
      if (eqEl) eqEl.textContent = "";
      return;
    }
    hasAny = true;
    if (item.type === "foreign") {
      const converted = Math.round(amount * rate);
      total += converted;
      lines.push("USD " + amount.toLocaleString() + " × " + rate.toLocaleString() + "원 = " + converted.toLocaleString() + "원");
      const eqEl = document.getElementById("doItemEq_" + item.id);
      if (eqEl) eqEl.textContent = rate ? ("= " + converted.toLocaleString() + "원") : "환율을 입력해주세요";
    } else {
      total += amount;
      lines.push(amount.toLocaleString() + "원");
    }
  });

  if (!hasAny) { box.innerHTML = ""; return; }

  let html = '<div class="calc-result-box">';
  lines.forEach((l) => { html += '<div class="calc-result-row"><span>' + escapeHtml(l) + "</span></div>"; });
  html += '<div class="calc-result-row total"><span>총 합계</span><span>' + Math.round(total).toLocaleString() + '원</span></div>';
  html += '</div>';
  box.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

function badgeHtml(category) {
  return '<span class="badge badge-' + category + '">' + (CATEGORY_LABELS[category] || category) + '</span>';
}

