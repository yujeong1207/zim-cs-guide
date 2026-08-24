/* ===== guide_realtime_config.js : original lines 1-1102 ===== */

const STORAGE_KEY = "cs_guide_data_v3";
const CATEGORY_LABELS = { import: "수입", export: "수출", common: "공통" };
const CATEGORY_ORDER = ["import", "export", "common"];

/* =========================================================================
   ⚙️ 위임장 실시간 공유 설정
   구글 시트 + Apps Script 웹앱을 배포한 뒤, 그 주소를 아래에 붙여넣으면
   팀원들이 각자 브라우저가 아니라 하나의 공유 목록을 보고 입력하게 돼요.
   비워두면(기본값) 예전처럼 각자 브라우저 저장 방식으로 동작해요.
   ========================================================================= */
const POA_SHEET_API_URL = true; // 🔥 Firebase로 이전 완료 (이 값은 이제 "위임장 실시간 공유 켜짐" 표시 용도로만 쓰임)
const POA_COLLECTION = "poa_list"; // Firestore 컬렉션 이름

let poaServerList = null;   // 서버에서 불러온 최신 목록 (성공 시에만 채워짐)
let poaLoadFailed = false;  // 서버 연동은 켜져 있는데 마지막 시도가 실패했는지
let poaAdminQuery = "";     // 관리 패널 안에서 위임장 검색할 때 쓰는 검색어

/* Firestore에서 위임장 전체 목록을 가져온다 (기존 Apps Script 버전을 Firebase로 교체) */
async function fetchPoaListFromServer() {
  try {
    await window.fbReady; // 익명 인증이 끝날 때까지 대기 (팀원 눈에는 아무것도 안 보임)
    const snapshot = await window.fbDb.collection(POA_COLLECTION).get();
    poaLoadFailed = false;
    return snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        applicant: d.applicant || "",
        shipper: d.shipper || "",
        submittedDate: d.submittedDate || "",
      };
    });
  } catch (err) {
    console.error("위임장 서버 목록 불러오기 실패:", err);
    poaLoadFailed = true;
    return null;
  }
}

/* Firestore에 위임장을 저장한다. entry.id가 있으면 수정, 없으면 새로 등록 */
async function submitPoaToServer(entry) {
  try {
    await window.fbReady;
    const payload = {
      applicant: entry.applicant || "",
      shipper: entry.shipper || "",
      submittedDate: entry.submittedDate || "",
    };
    if (entry.id) {
      await window.fbDb.collection(POA_COLLECTION).doc(entry.id).update(payload);
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await window.fbDb.collection(POA_COLLECTION).add(payload);
    }
    return { ok: true };
  } catch (err) {
    console.error("위임장 서버 등록/수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* Firestore에서 위임장 한 건을 삭제한다 */
async function deletePoaFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(POA_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("위임장 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 날짜 값에 시간/타임존이 섞여 들어와도 항상 YYYY-MM-DD만 뽑아서 보여준다 */
function formatPoaDate(value) {
  if (!value) return "";
  const str = String(value).trim();
  const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const mo = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return str;
}

/* =========================================================================
   ⚙️ 휴가 찜하기(가승인 전 임시 휴가) 실시간 공유 설정
   위임장/오비엘과 완전히 같은 방식이에요. 새 구글 시트 + 새 Apps Script 웹앱을
   따로 배포한 뒤, 그 주소를 아래에 붙여넣으면 활성화돼요.
   ========================================================================= */
const TENTATIVE_VACATION_API_URL = "https://script.google.com/macros/s/AKfycbzc8lZWSPZoxyQr7I_mBEX63fXuD8KTR0ZlJgbDKRbHZtiWX3uIDe__wsZ4UrsOvXIF/exec";

let TENTATIVE_VACATIONS = [];
let tvLoadFailed = false;

async function fetchTentativeVacationsFromServer() {
  if (!TENTATIVE_VACATION_API_URL) return null;
  try {
    const res = await fetch(TENTATIVE_VACATION_API_URL, { method: "GET" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "목록을 불러오지 못했어요.");
    tvLoadFailed = false;
    return data.list.map((row) => ({ id: row.id, name: row.name || "", date: row.date || "", type: row.type || "연차" }));
  } catch (err) {
    console.error("휴가찜 서버 목록 불러오기 실패:", err);
    tvLoadFailed = true;
    return null;
  }
}

async function submitTentativeVacationToServer(entry) {
  if (!TENTATIVE_VACATION_API_URL) return { ok: false, error: "연동 주소가 설정되지 않았어요." };
  try {
    const res = await fetch(TENTATIVE_VACATION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "add" }, entry)),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "등록에 실패했어요.");
    return { ok: true };
  } catch (err) {
    console.error("휴가찜 서버 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteTentativeVacationFromServer(id) {
  if (!TENTATIVE_VACATION_API_URL) return { ok: false, error: "연동 주소가 설정되지 않았어요." };
  try {
    const res = await fetch(TENTATIVE_VACATION_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "delete", id: id }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "삭제에 실패했어요.");
    return { ok: true };
  } catch (err) {
    console.error("휴가찜 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function loadTentativeVacations() {
  if (!TENTATIVE_VACATION_API_URL) return;
  const list = await fetchTentativeVacationsFromServer();
  if (list) TENTATIVE_VACATIONS = list;
}

/* 위임장 탭을 열 때 호출 - 처음 한 번만 실시간 구독을 시작해서, 팀원 누가 등록/수정/삭제하면 자동으로 화면에 반영됨.
   forceRefresh=true(새로고침 버튼)일 때만 구독을 끊고 다시 읽어옴 - 탭을 그냥 오갈 땐 재구독 안 해서 읽기 비용이 안 쌓여요. */
let poaUnsubscribe = null;
async function loadPoaTab(forceRefresh) {
  const wrap = document.getElementById("poaTableWrap");
  if (!POA_SHEET_API_URL) {
    renderPoaTable(); // 연동 꺼져있으면 예전 방식 그대로
    return;
  }
  if (liveSubscribed.poa && !forceRefresh) { renderPoaTable(); return; }
  if (forceRefresh && poaUnsubscribe) { poaUnsubscribe(); poaUnsubscribe = null; liveSubscribed.poa = false; }
  if (wrap && !poaServerList) wrap.innerHTML = '<div class="empty-state">⏳ 최신 목록을 불러오는 중이에요...</div>';
  await window.fbReady;
  poaUnsubscribe = window.fbDb.collection(POA_COLLECTION).onSnapshot(
    (snapshot) => {
      poaLoadFailed = false;
      const list = snapshot.docs.map((doc) => {
        const d = doc.data();
        return { id: doc.id, applicant: d.applicant || "", shipper: d.shipper || "", submittedDate: d.submittedDate || "" };
      });
      poaServerList = list;
      POA_LIST = list;
      renderPoaTable();
    },
    (err) => {
      console.error("위임장 실시간 구독 실패:", err);
      poaLoadFailed = true;
      if (wrap && !poaServerList) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class=\"btn secondary-btn\" style=\"padding:2px 10px;font-size:12px;margin-left:6px;\" onclick=\"loadPoaTab(true)\">다시 시도</button></div>';
    }
  );
  liveSubscribed.poa = true;
  liveTabUnsubscribers.poa = () => { if (poaUnsubscribe) { poaUnsubscribe(); poaUnsubscribe = null; liveSubscribed.poa = false; } };
}

/* =========================================================================
   ⚙️ 오비엘 접수 실시간 공유 설정
   위임장과 완전히 같은 방식이에요. 새 구글 시트 + 새 Apps Script 웹앱을
   따로 배포한 뒤, 그 주소를 아래에 붙여넣으면 활성화돼요.
   ========================================================================= */
const OBL_SHEET_API_URL = true; // 🔥 Firebase로 이전 완료 (이 값은 이제 "오비엘 실시간 공유 켜짐" 표시 용도로만 쓰임)
const OBL_COLLECTION = "obl_list"; // Firestore 컬렉션 이름
const OBL_TEAM_MEMBERS = ["유정", "민희", "선길", "소현", "성현", "유근"];

let OBL_LIST = [];
let oblLoadFailed = false;
let oblAdminQuery = "";

/* BL번호에서 뒷 7자리만 뽑아낸다 (엑셀의 RIGHT(cell,7)과 같은 동작) */
function extractNotionCode(blNumber) {
  const clean = (blNumber || "").trim().replace(/\s+/g, "");
  return clean.slice(-7);
}

/* Firestore에서 오비엘 접수 전체 목록을 가져온다 */
async function fetchOblListFromServer() {
  try {
    await window.fbReady;
    const snapshot = await window.fbDb.collection(OBL_COLLECTION).get();
    oblLoadFailed = false;
    return snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        date: d.date || "",
        name: d.name || "",
        blNumber: d.blNumber || "",
        createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : "",
      };
    });
  } catch (err) {
    console.error("오비엘 서버 목록 불러오기 실패:", err);
    oblLoadFailed = true;
    return null;
  }
}

/* Firestore에 새 오비엘 접수 한 건을 등록한다 */
async function submitOblToServer(entry) {
  try {
    await window.fbReady;
    await window.fbDb.collection(OBL_COLLECTION).add({
      date: entry.date || "",
      name: entry.name || "",
      blNumber: entry.blNumber || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // 노션 전송은 "되면 좋고, 안 돼도 오비엘 등록 자체는 성공"으로 처리 (조용히 시도만)
    let notionOk = false;
    let notionError = "";
    try {
      await syncOblToNotion(entry.date, entry.blNumber);
      notionOk = true;
    } catch (err) {
      notionError = String(err);
      console.error("노션 동기화 실패(오비엘 등록 자체는 성공):", notionError);
    }

    return { ok: true, notionOk: notionOk, notionError: notionError };
  } catch (err) {
    console.error("오비엘 서버 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 오비엘 → 노션 자동 전송. URL은 Firestore(secrets/notionSync)에서 조용히 자동으로 가져옴 */
let notionSyncUrlCache = null;
async function getNotionSyncUrl() {
  if (notionSyncUrlCache) return notionSyncUrlCache;
  try {
    await window.fbReady;
    const doc = await window.fbDb.collection("secrets").doc("notionSync").get();
    if (!doc.exists) return null;
    const url = doc.data().url;
    if (!url) return null;
    notionSyncUrlCache = url;
    return url;
  } catch (err) {
    console.error("노션 연동 주소 불러오기 실패:", err);
    return null;
  }
}

async function syncOblToNotion(date, blNumber) {
  const url = await getNotionSyncUrl();
  if (!url) throw new Error("노션 연동 주소가 아직 설정 안 됐어요.");
  const res = await fetch(url, {
    method: "POST",
    body: JSON.stringify({ date: date, blNumber: blNumber }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "노션 전송 실패");
}

/* Firestore에서 오비엘 접수 한 건을 삭제한다 */
async function deleteOblFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(OBL_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("오비엘 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* =========================================================================
   ⚙️ 확정휴가 · 공휴일 · 팀일정 · 공지배너 통합 실시간 공유 설정
   4개를 각각 Apps Script로 안 만들고, 이 URL 하나로 다 처리해요 (entity
   파라미터로 서버에서 구분). 확정휴가·공휴일·팀일정·공지배너 저장(추가·
   수정·삭제)은 관리자 키가 맞아야만 되고, 보기는 누구나 가능해요.
   ========================================================================= */
const CORE_SHEET_API_URL = true; // 🔥 Firebase로 이전 완료 (이 값은 이제 "확정휴가·공휴일·팀일정·배너 실시간 공유 켜짐" 표시 용도로만 쓰임)

/* ---- 관리자 키 처리: Firestore 규칙 안에서만 검증돼요 (실제 키 값은 이 코드 어디에도 없어요) ----
   동작 방식: 관리자가 키를 입력하면, 그 키로 "adminSessions" 컬렉션에 세션 문서를 하나 만들려고
   시도해요. 이 시도는 Firestore 규칙이 키 값을 직접 비교해서 맞을 때만 성공시켜줘요 (규칙은
   GitHub 같은 공개 저장소에 올라가는 게 아니라 Firebase 프로젝트 안에만 있어서, 외부에서 볼 수
   없어요). 세션 생성에 성공하면 그 세션ID를 이 브라우저에 기억해두고, 그 뒤로는 실제 데이터를
   쓸 때마다 "이 세션ID로 만든 세션이 존재하니?"만 확인해요 (세션 문서 자체는 아무도 못 읽게
   막아놔서, 다른 사람이 세션ID를 알아내도 키 값을 역으로 알아낼 방법이 없어요). */
const ADMIN_SESSION_STORAGE = "csGuideAdminSessionId";

function getCachedAdminSessionId() {
  return localStorage.getItem(ADMIN_SESSION_STORAGE) || "";
}
function setCachedAdminSessionId(id) {
  localStorage.setItem(ADMIN_SESSION_STORAGE, id);
}
function clearCachedAdminSessionId() {
  localStorage.removeItem(ADMIN_SESSION_STORAGE);
}

/* 캐시된 세션이 있으면 그대로 쓰고, 없으면 키를 물어봐서 새 세션을 만든다 */
async function ensureAdminSession(forceNew) {
  if (!forceNew) {
    const cached = getCachedAdminSessionId();
    if (cached) return cached;
  }
  const key = prompt("관리자 키를 입력해주세요 (확정휴가·공휴일·팀일정·공지배너 편집 권한)");
  if (!key) return "";
  const sessionId = "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  try {
    await window.fbReady;
    await window.fbDb.collection("adminSessions").doc(sessionId).set({ key: key });
    setCachedAdminSessionId(sessionId);
    return sessionId;
  } catch (err) {
    alert("관리자 키가 올바르지 않아요.");
    return "";
  }
}

/* entity별 Firestore 컬렉션 이름 매핑 */
const CORE_ENTITY_COLLECTIONS = { vacations: "vacations", holidays: "holidays", teamEvents: "teamEvents" };

/* ---- entity 기반 공통 GET 헬퍼 (읽기는 인증만 되면 누구나 가능, 관리자 키 필요 없음) ---- */
async function coreFetchEntity(entity) {
  try {
    await window.fbReady;
    if (entity === "banner") {
      const doc = await window.fbDb.collection("settings").doc("banner").get();
      const d = doc.exists ? doc.data() : {};
      return { ok: true, enabled: d.enabled === true, text: d.text || "", updatedAt: d.updatedAt || "" };
    }
    const collName = CORE_ENTITY_COLLECTIONS[entity];
    if (!collName) return null;
    const snapshot = await window.fbDb.collection(collName).get();
    const list = snapshot.docs
      .filter((doc) => doc.data().isDeleted !== true) // 삭제 표시된 건 목록에서 제외
      .map((doc) => Object.assign({ id: doc.id }, doc.data()));
    return { ok: true, list: list };
  } catch (err) {
    console.error(entity + " 서버 불러오기 실패:", err);
    return null;
  }
}

/* ---- entity 기반 공통 쓰기 헬퍼 (관리자 세션이 있어야만 성공, Firestore 규칙이 최종 검증) ----
   실제 삭제 대신 isDeleted:true로 표시만 해요 (Firestore 규칙 구조상 이렇게 하는 게
   가장 간단하고 안전해요 - 나중에 실수로 지운 것도 복구하기 쉬운 부가 효과도 있어요). */
async function corePostEntity(entity, payload) {
  let sessionId = await ensureAdminSession(false);
  if (!sessionId) return { ok: false, error: "관리자 키를 입력해야 저장할 수 있어요." };

  const attempt = async (sid) => {
    if (entity === "banner") {
      if (payload.action !== "save") throw new Error("알 수 없는 action이에요.");
      await window.fbDb.collection("settings").doc("banner").set({
        enabled: payload.enabled === true, text: payload.text || "", updatedAt: payload.updatedAt || "",
        sessionId: sid,
      });
      return { ok: true };
    }
    const collName = CORE_ENTITY_COLLECTIONS[entity];
    if (!collName) throw new Error("알 수 없는 entity예요.");

    if (payload.action === "add") {
      const fields = Object.assign({}, payload);
      delete fields.action;
      const docRef = await window.fbDb.collection(collName).add(Object.assign({}, fields, { sessionId: sid, isDeleted: false }));
      return { ok: true, id: docRef.id };
    }
    if (payload.action === "update") {
      const fields = Object.assign({}, payload);
      delete fields.action; delete fields.id;
      await window.fbDb.collection(collName).doc(payload.id).update(Object.assign({}, fields, { sessionId: sid }));
      return { ok: true };
    }
    if (payload.action === "delete") {
      await window.fbDb.collection(collName).doc(payload.id).update({ isDeleted: true, sessionId: sid });
      return { ok: true };
    }
    throw new Error("알 수 없는 action이에요.");
  };

  try {
    return await attempt(sessionId);
  } catch (err) {
    // 세션이 무효(예: 다른 브라우저에서 캐시만 옮겨온 경우 등)면 한 번 더 키를 물어보고 재시도
    console.error(entity + " 서버 저장 실패, 세션 재발급 후 재시도:", err);
    clearCachedAdminSessionId();
    sessionId = await ensureAdminSession(true);
    if (!sessionId) return { ok: false, error: "관리자 키가 필요해요." };
    try {
      return await attempt(sessionId);
    } catch (err2) {
      return { ok: false, error: String(err2) };
    }
  }
}

/* ===================== 확정휴가 ===================== */
async function fetchVacationListFromServer() {
  const data = await coreFetchEntity("vacations");
  if (!data) return null;
  return data.list.map((row) => ({
    id: row.id, name: row.name || "", startDate: row.startDate || "",
    endDate: row.endDate || "", note: row.note || "", unit: row.unit || "full"
  }));
}
async function submitVacationToServer(entry) {
  const result = await corePostEntity("vacations", Object.assign({ action: "add" }, entry));
  return result;
}
async function updateVacationOnServer(entry) {
  return corePostEntity("vacations", Object.assign({ action: "update" }, entry));
}
async function deleteVacationFromServer(id) {
  return corePostEntity("vacations", { action: "delete", id: id });
}
/* 확정휴가 탭·팀일정 캘린더 탭 둘 다 VACATIONS를 쓰기 때문에, 둘 중 어디로
   들어오든 이 함수로 먼저 최신화한 뒤 화면을 그린다 */
async function syncVacationsFromServer() {
  if (!CORE_SHEET_API_URL) return;
  const list = await fetchVacationListFromServer();
  if (list) VACATIONS = list;
}

/* ===================== 공휴일 ===================== */
async function fetchHolidayListFromServer() {
  const data = await coreFetchEntity("holidays");
  if (!data) return null;
  return data.list.map((row) => ({ id: row.id, date: row.date || "", name: row.name || "" }));
}
async function submitHolidayToServer(entry) {
  return corePostEntity("holidays", Object.assign({ action: "add" }, entry));
}
async function updateHolidayOnServer(entry) {
  return corePostEntity("holidays", Object.assign({ action: "update" }, entry));
}
async function deleteHolidayFromServer(id) {
  return corePostEntity("holidays", { action: "delete", id: id });
}
async function syncHolidaysFromServer() {
  if (!CORE_SHEET_API_URL) return;
  const list = await fetchHolidayListFromServer();
  if (list) HOLIDAYS = list;
}

/* ===================== 팀 일정(회사 일정) ===================== */
async function fetchTeamEventListFromServer() {
  const data = await coreFetchEntity("teamEvents");
  if (!data) return null;
  return data.list.map((row) => ({
    id: row.id, date: row.date || "", text: row.text || "",
    highlight: row.highlight === true || row.highlight === "TRUE" || row.highlight === "true"
  }));
}
async function submitTeamEventToServer(entry) {
  return corePostEntity("teamEvents", Object.assign({ action: "add" }, entry));
}
async function updateTeamEventOnServer(entry) {
  return corePostEntity("teamEvents", Object.assign({ action: "update" }, entry));
}
async function deleteTeamEventFromServer(id) {
  return corePostEntity("teamEvents", { action: "delete", id: id });
}
async function syncTeamEventsFromServer() {
  if (!CORE_SHEET_API_URL) return;
  const list = await fetchTeamEventListFromServer();
  if (list) TEAM_EVENTS = list;
}

/* ===================== 공지 배너 ===================== */
async function fetchNoticeBannerFromServer() {
  const data = await coreFetchEntity("banner");
  if (!data) return null;
  return { enabled: data.enabled === true, text: data.text || "", updatedAt: data.updatedAt || "" };
}
async function saveNoticeBannerToServer(banner) {
  return corePostEntity("banner", Object.assign({ action: "save" }, banner));
}
async function syncNoticeBannerFromServer() {
  if (!CORE_SHEET_API_URL) return;
  const banner = await fetchNoticeBannerFromServer();
  if (banner) NOTICE_BANNER = banner;
}


let oblUnsubscribe = null;
async function loadOblTab(forceRefresh) {
  const wrap = document.getElementById("oblTableWrap");
  if (!OBL_SHEET_API_URL) {
    if (wrap) wrap.innerHTML = '<div class="empty-state">⚠️ 아직 오비엘 접수 연동 주소가 설정되지 않았어요.</div>';
    return;
  }
  if (liveSubscribed.obl && !forceRefresh) { renderOblTable(); return; }
  if (forceRefresh && oblUnsubscribe) { oblUnsubscribe(); oblUnsubscribe = null; liveSubscribed.obl = false; }
  if (wrap && !OBL_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 목록을 불러오는 중이에요...</div>';
  await window.fbReady;
  oblUnsubscribe = window.fbDb.collection(OBL_COLLECTION).onSnapshot(
    (snapshot) => {
      OBL_LIST = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          date: d.date || "",
          name: d.name || "",
          blNumber: d.blNumber || "",
          createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : "",
        };
      });
      renderOblTable();
    },
    (err) => {
      console.error("오비엘 실시간 구독 실패:", err);
      if (wrap && !OBL_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class=\"btn secondary-btn\" style=\"padding:2px 10px;font-size:12px;margin-left:6px;\" onclick=\"loadOblTab(true)\">다시 시도</button></div>';
    }
  );
  liveSubscribed.obl = true;
  liveTabUnsubscribers.obl = () => { if (oblUnsubscribe) { oblUnsubscribe(); oblUnsubscribe = null; liveSubscribed.obl = false; } };
}

/* =========================================================================
   ⚙️ 모선 입출항 일정 실시간 공유 설정
   위임장/오비엘과 완전히 같은 방식이에요. 새 구글 시트 + 새 Apps Script 웹앱을
   따로 배포한 뒤, 그 주소를 아래에 붙여넣으면 활성화돼요. 팀원 한 명이 배를
   등록/수정/삭제하면 다른 팀원 화면에도 그대로 반영돼요.
   ========================================================================= */
const VESSEL_SHEET_API_URL = true; // 🔥 Firebase로 이전 완료 (이 값은 이제 "모선 일정 실시간 공유 켜짐" 표시 용도로만 쓰임)

/* =========================================================================
   📰 오늘의 물류뉴스 - 실시간 연동 설정
   매일 아침 Apps Script(logistics_news_apps_script.gs)가 신뢰 출처 안에서
   뉴스를 골라 요약해서 구글시트에 쌓아두고, 여기서는 그걸 조회만 해요.
   ========================================================================= */
const LOGISTICS_NEWS_API_URL = "https://script.google.com/macros/s/AKfycbxukpS3jZK7h6KPvlehTqW2GLvYCTFr8I55Z6YwlC1_Zg6U9JjHQyNtEv65BLUZbIkSLw/exec";

const NEWS_CATEGORY_META = {
  "항로/통항 이슈 (파나마운하, 수에즈/홍해, 주요 항만 정체 등)": { icon: "🚢", cls: "cat-route" },
  "지정학/규제 (관세, 제재, 항만 파업, 환경 규제 등)": { icon: "⚖️", cls: "cat-regulation" },
  "선사/얼라이언스 동향 (합병, 신규 항로 개설/축소 등)": { icon: "🤝", cls: "cat-carrier" },
  "국내 물류 이슈 (부산항 등 국내 항만, 관세청 정책 등)": { icon: "🇰🇷", cls: "cat-domestic" }
};
function newsCategoryMeta(category) {
  return NEWS_CATEGORY_META[category] || { icon: "📰", cls: "" };
}

/* 요약 텍스트를 문장 단위로 쪼개서 불릿 리스트용 배열로 만듦.
   AI가 이미 줄바꿈(개행)해서 줬으면 그걸 우선 쓰고, 한 문단으로 죽 이어붙여 왔으면
   "-함." "-됨." "-중." 같은 개조식 문장 끝 + 마침표 뒤에서 끊어줌. */
function splitNewsSummaryToBullets(summary) {
  if (!summary) return [];
  const byLine = summary.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  return summary
    .split(/\.\s+/) // "~함. ~됨. ~중." 처럼 마침표+공백 기준으로 문장 단위 분리
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/[.!?]$/.test(s) ? s : s + "."));
}

let newsLoadFailed = false;

async function fetchNewsListFromServer(limit) {
  if (!LOGISTICS_NEWS_API_URL) return null;
  try {
    const res = await fetch(LOGISTICS_NEWS_API_URL + "?limit=" + (limit || 14), { method: "GET" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "목록을 불러오지 못했어요.");
    newsLoadFailed = false;
    return data.items || [];
  } catch (err) {
    console.error("물류뉴스 불러오기 실패:", err);
    newsLoadFailed = true;
    return null;
  }
}

let newsSelectedDate = null; // 지금 선택된 날짜 탭 (null이면 제일 최신 날짜)
let newsExpanded = false;    // "지난 뉴스 더 보기" 눌렀는지 (누르기 전엔 이번 주만 보여줌)
let newsFetchLimit = 14;
const NEWS_LOAD_MORE_STEP = 20; // "더 보기" 한 번 누를 때마다 이만큼 더 불러옴

async function loadNewsTab() {
  const wrap = document.getElementById("newsListWrap");
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-state">불러오는 중...</div>';

  if (!LOGISTICS_NEWS_API_URL) {
    wrap.innerHTML = '<div class="empty-state">연동 주소가 아직 설정되지 않았어요.</div>';
    return;
  }

  newsExpanded = false;
  newsFetchLimit = 14;
  newsSelectedDate = null;

  const items = await fetchNewsListFromServer(newsFetchLimit);
  if (items === null) {
    wrap.innerHTML = '<div class="empty-state">⚠️ 불러오기에 실패했어요. 새로고침을 눌러 다시 시도해주세요.</div>';
    return;
  }
  if (items.length === 0) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 뉴스가 없어요. 내일 아침에 첫 소식이 올라올 거예요.</div>';
    return;
  }

  window.newsItemsCache = items; // 탭 전환할 때 다시 안 불러오고 여기서 바로 씀
  renderNewsTabbed(items);
}

/* "지난 뉴스 더 보기" - 더 많이 불러와서 이전 주(들)까지 펼쳐 보여줌 */
async function loadMoreNews() {
  newsExpanded = true;
  newsFetchLimit += NEWS_LOAD_MORE_STEP;
  const items = await fetchNewsListFromServer(newsFetchLimit);
  if (items) {
    window.newsItemsCache = items;
    renderNewsTabbed(items);
  }
}

/* 평일(월~금)인지 확인 - 주말 뉴스는 탭 자체를 안 만듦 */
/* 오늘 기준 "이번 주" 월요일~일요일 날짜 범위 (문자열 YYYY-MM-DD로 비교) */
function getThisWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return { start: fmt(monday), end: fmt(sunday) };
}

/* 날짜별로 묶어서 탭으로 보여줌 (선박 일정 탭이랑 같은 느낌) - 기본은 이번 주(월~일) 전체 */
function renderNewsTabbed(items) {
  const wrap = document.getElementById("newsListWrap");
  if (!wrap) return;

  let visibleItems = items;

  if (!newsExpanded) {
    const range = getThisWeekRange();
    visibleItems = visibleItems.filter((it) => it.date >= range.start && it.date <= range.end);
  }

  const dateSet = new Set(visibleItems.map((it) => it.date));
  const dates = Array.from(dateSet).sort((a, b) => (a < b ? 1 : -1)); // 최신 날짜가 맨 앞

  // 이전 주까지 더 불러올 게 남아있는지: 요청한 개수만큼 꽉 채워서 왔으면 더 있을 가능성이 높음
  const hasMore = items.length >= newsFetchLimit;
  const moreBtnHtml = hasMore
    ? `<button type="button" class="btn" style="margin-top:14px;" onclick="loadMoreNews()">📅 지난 뉴스 더 보기</button>`
    : "";

  if (dates.length === 0) {
    wrap.innerHTML = '<div class="empty-state">이번 주 뉴스가 아직 없어요.</div>' + moreBtnHtml;
    return;
  }

  if (!newsSelectedDate || !dates.includes(newsSelectedDate)) {
    newsSelectedDate = dates[0];
  }

  const tabsHtml = dates.map((d) => {
    const count = visibleItems.filter((it) => it.date === d).length;
    const active = d === newsSelectedDate ? " active" : "";
    return `<button type="button" class="news-date-tab${active}" onclick="switchNewsDate('${d}')">${escapeHtml(formatNewsDateLabel(d))} <span class="news-date-tab-count">${count}</span></button>`;
  }).join("");

  const dayItems = visibleItems.filter((it) => it.date === newsSelectedDate);
  const cardsHtml = dayItems.map((item) => {
    const meta = newsCategoryMeta(item.category);
    const bullets = splitNewsSummaryToBullets(item.summary);
    return `
      <div class="news-card ${meta.cls}">
        <div class="news-card-meta">
          <span class="news-card-badge ${meta.cls}">${meta.icon} ${escapeHtml((item.category || "").split(" (")[0])}</span>
          <span class="news-card-source">🏷 ${escapeHtml(item.source)}</span>
        </div>
        <div class="news-card-title">${escapeHtml(item.title)}</div>
        <ul class="news-card-summary">${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="news-card-link">🔗 원문 보기</a>` : ""}
      </div>
    `;
  }).join("");

  wrap.innerHTML = `<div class="news-date-tabs">${tabsHtml}</div><div class="news-date-panel">${cardsHtml}</div>${moreBtnHtml}`;
}

function switchNewsDate(date) {
  newsSelectedDate = date;
  if (window.newsItemsCache) renderNewsTabbed(window.newsItemsCache);
}

/* "2026-08-20" → "8/20 (목)" 처럼 짧고 읽기 쉬운 라벨로 */
function formatNewsDateLabel(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${Number(m[2])}/${Number(m[3])} (${weekday})`;
}

/* =========================================================================
   🚢 서비스라인 T/T 탭
   ========================================================================= */
function renderTTLinesTab() {
  const wrap = document.getElementById("ttLinesWrap");
  if (!wrap) return;

  if (!TT_LINES || TT_LINES.length === 0) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 라인이 없어요.</div>';
    return;
  }

  wrap.innerHTML = TT_LINES.map((line) => {
    const rowsHtml = (line.ports || []).map((port, idx) => {
      const prevTt = idx > 0 ? line.ports[idx - 1].tt : null;
      const diff = prevTt !== null && typeof port.tt === "number" && typeof prevTt === "number" ? port.tt - prevTt : null;
      const diffHtml = diff !== null ? `<span class="tt-diff">+${diff}</span>` : "";
      const codeHtml = port.url
        ? `<a href="${escapeHtml(port.url)}" target="_blank" rel="noopener" class="tt-port-link">${escapeHtml(port.code)}</a>`
        : `<span>${escapeHtml(port.code)}</span>`;
      return `
        <tr>
          <td class="tt-code-cell">${codeHtml}</td>
          <td>${escapeHtml(port.name)}</td>
          <td class="tt-days-cell">${port.tt}일 ${diffHtml}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="tt-line-card">
        <div class="tt-line-title">${escapeHtml(line.label)}</div>
        <table class="tt-line-table">
          <thead><tr><th>Port Code</th><th>To Port</th><th>Planned T/T</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }).join("");
}

let vesselLoadFailed = false;
const VESSEL_COLLECTION = "vessels"; // Firestore 컬렉션 이름

async function fetchVesselListFromServer() {
  try {
    await window.fbReady;
    const snapshot = await window.fbDb.collection(VESSEL_COLLECTION).get();
    vesselLoadFailed = false;
    return snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        month: d.month || "",
        name: d.name || "",
        code: d.code || "",
        voyage: d.voyage || "",
        arrivalDate: d.arrivalDate || "",
        departureDate: d.departureDate || "",
        arrivalTimeConfirmed: d.arrivalTimeConfirmed === true,
        departureTimeConfirmed: d.departureTimeConfirmed === true,
      };
    });
  } catch (err) {
    console.error("모선 일정 서버 목록 불러오기 실패:", err);
    vesselLoadFailed = true;
    return null;
  }
}

/* 새 배 한 척 등록. Firestore가 새로 발급한 id를 돌려줌 */
async function submitVesselToServer(entry) {
  try {
    await window.fbReady;
    const docRef = await window.fbDb.collection(VESSEL_COLLECTION).add({
      month: entry.month || "",
      name: entry.name || "",
      code: entry.code || "",
      voyage: entry.voyage || "",
      arrivalDate: entry.arrivalDate || "",
      departureDate: entry.departureDate || "",
      arrivalTimeConfirmed: entry.arrivalTimeConfirmed === true,
      departureTimeConfirmed: entry.departureTimeConfirmed === true,
    });
    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error("모선 일정 서버 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 기존 배 정보 수정 (id로 찾아서 덮어씀) */
async function updateVesselOnServer(entry) {
  try {
    await window.fbReady;
    await window.fbDb.collection(VESSEL_COLLECTION).doc(entry.id).update({
      month: entry.month || "",
      name: entry.name || "",
      code: entry.code || "",
      voyage: entry.voyage || "",
      arrivalDate: entry.arrivalDate || "",
      departureDate: entry.departureDate || "",
      arrivalTimeConfirmed: entry.arrivalTimeConfirmed === true,
      departureTimeConfirmed: entry.departureTimeConfirmed === true,
    });
    return { ok: true };
  } catch (err) {
    console.error("모선 일정 서버 수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteVesselFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(VESSEL_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("모선 일정 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 모선 일정 탭을 열 때 호출 - 실시간 구독을 시작해서, 팀원 누가 등록/수정/삭제하면 자동으로 화면에 반영됨 */
let vesselsUnsubscribe = null;
async function loadVesselTab(forceRefresh) {
  const wrap = document.getElementById("vesselMonthsWrap");
  if (!VESSEL_SHEET_API_URL) {
    renderVesselTab(); // 연동 꺼져있으면 예전 방식(브라우저 저장) 그대로
    return;
  }
  if (liveSubscribed.vessels && !forceRefresh) { renderVesselTab(); return; }
  if (forceRefresh && vesselsUnsubscribe) { vesselsUnsubscribe(); vesselsUnsubscribe = null; liveSubscribed.vessels = false; }
  if (wrap && !VESSELS.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 모선 일정을 불러오는 중이에요...</div>';
  await window.fbReady;
  vesselsUnsubscribe = window.fbDb.collection(VESSEL_COLLECTION).onSnapshot(
    (snapshot) => {
      VESSELS = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          month: d.month || "",
          name: d.name || "",
          code: d.code || "",
          voyage: d.voyage || "",
          arrivalDate: d.arrivalDate || "",
          departureDate: d.departureDate || "",
          arrivalTimeConfirmed: d.arrivalTimeConfirmed === true,
          departureTimeConfirmed: d.departureTimeConfirmed === true,
        };
      });
      renderVesselTab();
    },
    (err) => {
      console.error("모선 일정 실시간 구독 실패:", err);
      if (wrap && !VESSELS.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class=\"btn secondary-btn\" style=\"padding:2px 10px;font-size:12px;margin-left:6px;\" onclick=\"loadVesselTab(true)\">다시 시도</button></div>';
    }
  );
  liveSubscribed.vessels = true;
  liveTabUnsubscribers.vessels = () => { if (vesselsUnsubscribe) { vesselsUnsubscribe(); vesselsUnsubscribe = null; liveSubscribed.vessels = false; } };
}

let oblStatsOpen = false;
let oblStatsMonth = null; // "YYYY-MM", 처음 열 때 이번 달로 초기화

function toggleOblStats() {
  oblStatsOpen = !oblStatsOpen;
  if (oblStatsOpen && !oblStatsMonth) {
    const today = new Date();
    oblStatsMonth = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
  }
  renderOblTable();
}

function changeOblStatsMonth(delta) {
  const [y, m] = oblStatsMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  oblStatsMonth = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  renderOblTable();
}

function buildOblStatsHtml() {
  const monthEntries = OBL_LIST.filter((o) => (o.date || "").slice(0, 7) === oblStatsMonth);
  const countByName = {};
  monthEntries.forEach((o) => {
    const n = o.name || "(이름 없음)";
    countByName[n] = (countByName[n] || 0) + 1;
  });
  const sortedNames = Object.keys(countByName).sort((a, b) => countByName[b] - countByName[a]);

  const [y, m] = oblStatsMonth.split("-");
  let html = `<div class="excel-question-box" style="margin-bottom:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-weight:800;">📊 담당자별 접수 현황</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn secondary-btn" style="padding:2px 10px;font-size:13px;" onclick="changeOblStatsMonth(-1)">◀</button>
        <span style="font-weight:700;">${y}년 ${Number(m)}월</span>
        <button class="btn secondary-btn" style="padding:2px 10px;font-size:13px;" onclick="changeOblStatsMonth(1)">▶</button>
      </div>
    </div>`;

  if (sortedNames.length === 0) {
    html += `<div class="hint">이 달에는 접수된 건이 없어요.</div>`;
  } else {
    html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">`;
    sortedNames.forEach((n) => {
      html += `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 12px;font-size:13px;">
        <b>${escapeHtml(n)}</b> · ${countByName[n]}건
      </div>`;
    });
    html += `</div><div class="hint" style="margin:0;">이번 달 전체 ${monthEntries.length}건</div>`;
  }
  html += `</div>`;
  return html;
}

function toggleAllOblChecks() {
  const boxes = document.querySelectorAll(".obl-notion-check");
  if (boxes.length === 0) return;
  const anyUnchecked = Array.from(boxes).some((b) => !b.checked);
  boxes.forEach((b) => { b.checked = anyUnchecked; });
}

async function copySelectedNotionCodes() {
  const statusEl = document.getElementById("oblCopyStatus");
  const checked = Array.from(document.querySelectorAll(".obl-notion-check:checked"));

  if (checked.length === 0) {
    if (statusEl) statusEl.textContent = "⚠️ 선택된 항목이 없어요.";
    return;
  }

  // 노션에 그대로 붙여넣기 좋게, 줄바꿈으로 구분된 텍스트로 만듦
  const text = checked.map((b) => b.dataset.code).join("\n");

  try {
    await navigator.clipboard.writeText(text);
    if (statusEl) statusEl.textContent = `✅ ${checked.length}건 복사됨 — 노션에 붙여넣기(Ctrl+V) 하세요.`;
  } catch (err) {
    if (statusEl) statusEl.textContent = "❌ 복사 실패 (브라우저 권한 문제일 수 있어요): " + err.message;
    console.error("노션코드 복사 오류:", err);
  }
}

function renderOblTable() {
  const wrap = document.getElementById("oblTableWrap");
  if (!wrap) return;
  const qEl = document.getElementById("oblFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();

  if (OBL_LIST.length === 0) {
    wrap.innerHTML = '<div class="empty-state">아직 접수된 건이 없어요. 위 "➕ 오비엘 접수 등록하기" 버튼으로 첫 건을 등록해보세요.</div>';
    return;
  }

  // 최근 "등록한" 순서대로 위에 오도록 정렬. createdAt(실제 등록시각)이 있으면
  // 그걸 우선 쓰고, 옛날 데이터처럼 createdAt이 없는 경우엔 date(선적/접수 날짜)로 대체.
  const sorted = OBL_LIST.slice().sort((a, b) => {
    const av = a.createdAt || a.date || "";
    const bv = b.createdAt || b.date || "";
    return bv.localeCompare(av);
  });
  const matched = q
    ? sorted.filter((o) => [o.name, o.blNumber].filter(Boolean).join(" ").toLowerCase().includes(q))
    : sorted;

  let prefixHtml = `<button class="btn secondary-btn" style="margin-bottom:14px;" onclick="toggleOblStats()">${oblStatsOpen ? "📊 담당자별 현황 접기" : "📊 담당자별 접수 현황 보기"}</button>`;
  if (oblStatsOpen) prefixHtml += buildOblStatsHtml();
  prefixHtml += `<div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
      <button class="btn secondary-btn" style="padding:6px 12px; font-size:13px;" onclick="toggleAllOblChecks()">전체 선택/해제</button>
      <button class="btn generate-btn" style="padding:6px 12px; font-size:13px;" onclick="copySelectedNotionCodes()">📋 선택한 노션코드 복사</button>
      <span id="oblCopyStatus" class="hint" style="margin-top:0;"></span>
    </div>`;

  if (q && matched.length === 0) {
    wrap.innerHTML = prefixHtml + '<div class="empty-state">❌ "' + escapeHtml(qEl.value) + '"는 목록에 없어요.</div>';
    return;
  }

  const table = document.createElement("table");
  table.className = "contacts-table";
  table.innerHTML = "<tr><th style='width:34px;'></th><th>날짜</th><th>이름</th><th>BL번호</th><th>노션(뒷 7자리)</th><th></th></tr>";
  matched.forEach((o) => {
    const tr = document.createElement("tr");
    const notionCode = extractNotionCode(o.blNumber);
    tr.innerHTML = `<td><input type="checkbox" class="obl-notion-check" data-code="${escapeHtml(notionCode)}" checked></td>`
      + `<td>${formatPoaDate(o.date) || "-"}</td>`
      + `<td>${escapeHtml(o.name || "")}</td>`
      + `<td>${q ? snippetHtml(o.blNumber || "", q) : escapeHtml(o.blNumber || "")}</td>`
      + `<td><b>${escapeHtml(notionCode)}</b></td>`
      + `<td><button class="btn danger-btn" style="padding:4px 10px;font-size:12px;" onclick="deleteOblItemFlow('${o.id}')">삭제</button></td>`;
    table.appendChild(tr);
  });
  wrap.innerHTML = prefixHtml;
  wrap.appendChild(table);
  if (q) {
    const countInfo = document.createElement("div");
    countInfo.className = "hint";
    countInfo.style.marginTop = "8px";
    countInfo.textContent = "✅ " + matched.length + "건 검색됨";
    wrap.appendChild(countInfo);
  }
}

function toggleOblInlineForm() {
  const wrap = document.getElementById("oblInlineFormWrap");
  if (!wrap) return;
  const isOpen = wrap.style.display !== "none";
  wrap.style.display = isOpen ? "none" : "block";
  if (!isOpen) {
    const dateEl = document.getElementById("oblInlineDate");
    if (dateEl && !dateEl.value) {
      const today = new Date();
      dateEl.value = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    }
    const blEl = document.getElementById("oblInlineBl");
    if (blEl) blEl.focus();
  }
}

function updateOblNotionPreview() {
  const blEl = document.getElementById("oblInlineBl");
  const previewEl = document.getElementById("oblNotionPreview");
  if (!blEl || !previewEl) return;
  const code = extractNotionCode(blEl.value);
  previewEl.textContent = code ? ("노션 코드: " + code) : "";
}

async function submitOblInlineForm() {
  const dateEl = document.getElementById("oblInlineDate");
  const nameEl = document.getElementById("oblInlineName");
  const blEl = document.getElementById("oblInlineBl");
  const btn = document.getElementById("oblInlineSubmitBtn");

  const date = dateEl.value || "";
  const name = nameEl.value || "";
  const blNumber = (blEl.value || "").trim();

  if (!name) { alert("담당자 이름을 선택해주세요."); return; }
  if (!blNumber) { alert("BL번호를 입력해주세요."); blEl.focus(); return; }

  btn.disabled = true;
  btn.textContent = "등록 중...";
  const result = await submitOblToServer({ date, name, blNumber, createdAt: new Date().toISOString() });
  btn.disabled = false;
  btn.textContent = "✅ 등록하기";

  if (!result.ok) {
    alert("등록에 실패했어요. 잠시 후 다시 시도해주세요.\n(" + result.error + ")");
    return;
  }

  blEl.value = "";
  updateOblNotionPreview();
  toggleOblInlineForm();
  await loadOblTab();
  alert("등록됐어요 ✅");
}

async function deleteOblItemFlow(id) {
  if (!confirm("이 오비엘 접수 건을 삭제할까요?")) return;
  const result = await deleteOblFromServer(id);
  if (!result.ok) {
    alert("삭제에 실패했어요. 잠시 후 다시 시도해주세요.\n(" + result.error + ")");
    return;
  }
  await loadOblTab();
}

