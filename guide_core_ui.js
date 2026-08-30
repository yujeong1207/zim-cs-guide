/* ===== guide_core_ui.js : original lines 16723-17084 ===== */
/* =========================================================================
   🔔 공유 데이터 새 소식 알림 (화면 오른쪽 아래 배너)
   - 팀원이 AN 연락처나 AN 주소채우기 매핑을 새로 추가/수정했을 때, 굳이 말 안 해도
     화면에 떠서 알 수 있게 해주는 용도예요. contacts_script.js / an_email_tool.js에서
     pushSharedUpdateNotice(key, message, onClick)를 호출해서 띄워요.
   ========================================================================= */
let sharedUpdateNotices = {};

function pushSharedUpdateNotice(key, message, onClick) {
  sharedUpdateNotices[key] = { message, onClick };
  renderSharedUpdateBanner();
}
function dismissSharedUpdateNotice(key) {
  delete sharedUpdateNotices[key];
  renderSharedUpdateBanner();
}
function renderSharedUpdateBanner() {
  let el = document.getElementById("sharedUpdatesBanner");
  const keys = Object.keys(sharedUpdateNotices);
  if (!keys.length) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "sharedUpdatesBanner";
    el.className = "shared-updates-banner";
    document.body.appendChild(el);
  }
  el.innerHTML = keys.map((k) => `
    <div class="shared-update-item" data-key="${escapeHtml(k)}">
      <span class="shared-update-dot"></span>
      <span class="shared-update-text">${sharedUpdateNotices[k].message}</span>
      <button class="shared-update-close" title="닫기">✕</button>
    </div>`).join("");
  el.querySelectorAll(".shared-update-item").forEach((itemEl) => {
    const key = itemEl.dataset.key;
    itemEl.querySelector(".shared-update-text").addEventListener("click", () => {
      const notice = sharedUpdateNotices[key];
      if (notice && notice.onClick) notice.onClick();
      dismissSharedUpdateNotice(key);
    });
    itemEl.querySelector(".shared-update-close").addEventListener("click", (e) => {
      e.stopPropagation();
      dismissSharedUpdateNotice(key);
    });
  });
}

/* =========================================================================
   이미지 삽입 공통 헬퍼 (업무 절차 단계 / FAQ 답변 등에서 공용으로 사용)
   ========================================================================= */

/* 오늘 날짜 (YYYY-MM-DD) */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day; // getFullYear/getMonth/getDate는 브라우저의 로컬 시간대 기준
}

/* 절차/자료 단계 안에 "바로가기" 버튼(외부 사이트 링크)을 넣기 위한 데이터 형식 판별
   형식: { type: "link", label: "터미널명 등 버튼에 보일 문구", url: "https://..." } */
function isLinkValue(s) {
  return s && typeof s === "object" && s.type === "link";
}

function buildStepLinkEl(l) {
  const a = document.createElement("a");
  a.className = "step-link-btn";
  a.href = l.url || "#";
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "🔗 " + (l.label || l.url || "바로가기");
  return a;
}

function isImageValue(s) {
  return typeof s === "string" && s.indexOf("data:image") === 0;
}

/* 절차 단계 안에 참고용 표(table)를 넣기 위한 데이터 형식 판별
   형식: { type: "table", caption: "표 제목(선택)", headers: ["열1","열2",...], rows: [["값1","값2",...], ...] } */
function isTableValue(s) {
  return s && typeof s === "object" && s.type === "table" && Array.isArray(s.rows);
}

function buildStepTableEl(t) {
  const wrap = document.createElement("div");
  wrap.className = "step-table-wrap";
  const table = document.createElement("table");
  table.className = "step-table";
  if (t.caption) {
    const cap = document.createElement("caption");
    cap.textContent = t.caption;
    table.appendChild(cap);
  }
  if (Array.isArray(t.headers) && t.headers.length) {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    t.headers.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
  }
  const tbody = document.createElement("tbody");
  t.rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/* 이미지를 캔버스로 리사이즈/압축해서 localStorage 용량을 아낀다 */
function compressImageFile(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("이미지를 불러올 수 없어요"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없어요"));
    reader.readAsDataURL(file);
  });
}

/* 숨겨진 파일 입력창을 띄우고, 압축된 이미지 data URL을 콜백으로 전달 */
function triggerImageUpload(callback) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, 900, 0.75);
      callback(dataUrl);
    } catch (err) {
      alert("이미지를 불러오지 못했어요. 다른 이미지로 시도해주세요.");
    }
  };
  input.click();
}

/* =========================================================================
   메인 탭 전환
   ========================================================================= */

let mainTab = "procedures";
let procFilter = "all";
let faqFilter = "all";
let resFilter = "all";
let expandedVesselMonths = new Set();

/* =========================================================================
   ⚙️ 실시간 공유 탭(위임장/오비엘/모선일정) 자동 새로고침
   그 탭을 계속 띄워놓고 보고 있으면, 15분마다 조용히 서버에서 최신 목록을
   다시 받아와요. 화면을 안 보고 있을 때(다른 탭/창으로 이동)는 건너뛰어서
   불필요한 요청을 줄여요. 주기를 바꾸고 싶으면 아래 숫자만 고치면 돼요.
   ========================================================================= */

/* =========================================================================
   실시간 리스너 (onSnapshot) - 예전엔 15분마다 전체를 통째로 다시 읽어왔는데,
   이제는 Firestore의 실시간 구독 기능을 써서 "진짜 바뀐 부분"만 자동으로
   받아와요. 팀원이 등록/수정하면 다른 사람 화면에 몇 초 안에 반영되면서도,
   불필요하게 반복해서 전체를 다시 읽지 않아서 읽기 비용도 훨씬 적게 들어요.
   ========================================================================= */
let liveTabUnsubscribers = {}; // { poa: fn, obl: fn, vessels: fn, vacations: fn } - 각 컬렉션 구독 해제 함수 보관용 (수동 새로고침에만 씀)
let liveSubscribed = {}; // { poa: true, obl: true, ... } - 이미 한 번 구독한 컬렉션은 탭을 오가도 다시 안 읽음 (Firestore 읽기 비용 절약)

function stopLiveTabRefresh() {
  // ⚠️ 예전엔 탭을 벗어날 때마다 모든 구독을 끊고, 탭에 다시 들어갈 때마다 통째로 다시 읽어왔는데,
  //    이러면 탭을 자주 오갈수록 Firestore 읽기 건수가 계속 쌓여서 하루 무료 한도를 금방 넘겨요.
  //    이제는 한 번 구독한 컬렉션은 페이지를 새로고침하기 전까지 계속 살려두고,
  //    탭 전환은 그냥 메모리에 있는 최신 데이터를 다시 그리기만 해요 (읽기 비용 0).
}

let vacationsUnsubscribe = null;
async function loadVacationTab(forceRefresh) {
  if (!CORE_SHEET_API_URL) { renderVacationTab(); return; }
  if (liveSubscribed.vacations && !forceRefresh) { renderVacationTab(); return; }
  if (forceRefresh && vacationsUnsubscribe) { vacationsUnsubscribe(); vacationsUnsubscribe = null; liveSubscribed.vacations = false; }
  await window.fbReady;
  vacationsUnsubscribe = window.fbDb.collection("vacations").onSnapshot(
    (snapshot) => {
      VACATIONS = snapshot.docs
        .filter((doc) => doc.data().isDeleted !== true)
        .map((doc) => {
          const d = doc.data();
          return { id: doc.id, name: d.name || "", startDate: d.startDate || "", endDate: d.endDate || "", note: d.note || "", unit: d.unit || "full" };
        });
      renderVacationTab();
    },
    (err) => console.error("확정휴가 실시간 구독 실패:", err)
  );
  liveSubscribed.vacations = true;
  liveTabUnsubscribers.vacations = () => { if (vacationsUnsubscribe) { vacationsUnsubscribe(); vacationsUnsubscribe = null; liveSubscribed.vacations = false; } };
}

async function loadTeamCalendarTab() {
  await Promise.all([loadTentativeVacations(), syncVacationsFromServer(), syncHolidaysFromServer(), syncTeamEventsFromServer()]);
  renderTeamCalendar();
}

function switchMainTab(tab) {
  closeAllTabGroups(); // 드롭다운 메뉴에서 항목을 눌러 이동한 경우, 열려있던 드롭다운을 닫아줌
  const searchInput = document.getElementById("globalSearch");
  if (searchInput.value.trim()) searchInput.value = "";
  // 캘린더 캡처용으로 "의견 남기기" 버튼을 숨겨둔 채로 다른 탭에 갔으면, 깜빡한 걸 수 있으니 자동으로 복구
  if (mainTab === "portSchedule" && tab !== "portSchedule") {
    const fab = document.querySelector(".feedback-fab");
    if (fab) fab.style.display = "";
  }
  mainTab = tab;
  showPage(tab);
  stopLiveTabRefresh();
  if (tab === "procedures") renderProcList();
  if (tab === "faqs") { renderFaqTopics(); renderFaqList(); }
  if (tab === "resources") renderResList();
  if (tab === "vessels") loadVesselTab();
  if (tab === "panamaTransit") loadPanamaTransitTab();
  if (tab === "news") loadNewsTab();
  if (tab === "ttlines") renderTTLinesTab();
  if (tab === "contacts") renderContactsTable();
  if (tab === "poa") loadPoaTab();
  if (tab === "obl") loadOblTab();
  if (tab === "followup") loadFollowupTab();
  if (tab === "cod") loadCodTab();
  if (tab === "triangle") loadTriangleTab();
  if (tab === "doDesk") loadDoDeskTab();
  if (tab === "blDesk") loadBlDeskTab();
  if (tab === "portSchedule") loadPortScheduleTab();
  if (tab === "vacations") loadVacationTab();
  if (tab === "teamEvents") { loadTeamCalendarTab(); renderTeamCalendar(); }
  if (tab === "calc") renderCalcTool();
  if (tab === "memo") renderMemoTab();
  if (tab === "templates" && !currentType) initTypeSelect();
  if (tab === "ntf" && !currentNtfType) initNtfTypeSelect();
  if (tab === "excelTool") renderExcelTool();
  if (tab === "anemail" && typeof initContactsTab === "function") initContactsTab(true);

  const MAIN_TAB_RECENT_LABELS = { calc: "🧮 계산기", memo: "📝 메모", excelTool: "📦 엑셀 정리" };
  if (MAIN_TAB_RECENT_LABELS[tab]) recordRecentItem("mainTab", tab, MAIN_TAB_RECENT_LABELS[tab]);
}

/* =========================================================================
   📦 D/O 데스크 - 선박 입항일 + 위임장 확인 + DO 계산기를 한 화면에서
   ========================================================================= */
function searchVesselsByName(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return VESSELS.filter((v) =>
    (v.name || "").toLowerCase().includes(q) ||
    (v.code || "").toLowerCase().includes(q) ||
    (v.voyage || "").toLowerCase().includes(q)
  ).sort((a, b) => (b.arrivalDate || "").localeCompare(a.arrivalDate || ""));
}

function searchPoaByCompany(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return POA_LIST.filter((p) =>
    (p.applicant || "").toLowerCase().includes(q) ||
    (p.shipper || "").toLowerCase().includes(q)
  );
}

/* D/O·B/L 데스크의 "📝 메모" 박스 - 팀 공유 아니고 이 브라우저에만 저장(개인 스크래치용).
   입력할 때마다 바로 저장되고, 탭 다시 들어오면 그대로 남아있어요. */
function saveDeskMemo(textareaId) {
  const el = document.getElementById(textareaId);
  if (!el) return;
  try { localStorage.setItem("desk_memo_" + textareaId, el.value); } catch (e) { /* 저장 실패해도 이번 세션 입력은 그대로 남아있으니 무시 */ }
}
function loadDeskMemo(textareaId) {
  const el = document.getElementById(textareaId);
  if (!el) return;
  try {
    const saved = localStorage.getItem("desk_memo_" + textareaId);
    if (saved !== null) el.value = saved;
  } catch (e) { /* 무시 */ }
}

/* ============================================================
   💳 D/O 데스크 - 입금현황(재무팀 BLCONFIRM.xlsx "수입" 시트) 등록/수정
   Power Automate 플로우 2개(추가/수정)를 호출해서 실제 파일에 바로 씀.
   "최근 추가한 항목" 목록은 이 브라우저에만 저장되는 개인 기록이고,
   수정은 그 목록에 있는(=자기가 방금 넣은) 항목만 가능하게 해서
   BL NO가 중복될 때 엉뚱한 행을 덮어쓰는 걸 방지함.
   ============================================================ */
const DO_DESK_PAYMENT_ADD_URL = "https://defaultc3debccf0f644fc98686edeedbe9f5.13.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/22/workflows/244b7cf038514e9485e01f7871c3d42c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=L3iB11PYxyeHxcJq7_V55ncbMCWQ7AYxu-1BQnb2YVs";
const DO_DESK_PAYMENT_UPDATE_URL = "https://defaultc3debccf0f644fc98686edeedbe9f5.13.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/05/workflows/e8179eb32e734ab789e6ccbf2848a8bc/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=mTs3NcguQ4uJBCjuC1CUrJgQ4l7rXXQc3b1lQFbGMu8";
const DO_DESK_PAYMENT_MERGE_URL = "https://defaultc3debccf0f644fc98686edeedbe9f5.13.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/05/workflows/a1f91acff2184f9898a9f48bffe8b9a7/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=lKXS0ah9whsEpFBCO3eNXGGZztRNsaoC92JBwGOZKo0";
const DO_DESK_PAYMENT_EMBED_BASE_URL = "https://zim365-my.sharepoint.com/personal/park_minyoung_corp_zim_com/_layouts/15/Doc.aspx?sourcedoc={9fab18fd-0595-49b0-9aeb-ae700bf66d76}&action=embedview&wdAllowInteractivity=True&wdHideGridlines=True&wdHideHeaders=True&wdDownloadButton=True&wdInConfigurator=True";
const DO_DESK_PAYMENT_LAST_ROW_KEY = "do_desk_payment_last_known_row";

/* 이 브라우저에서 마지막으로 확인한(추가/병합한) 행 번호를 기억해뒀다가,
   새로고침할 때 그 근처 셀을 열어달라고 요청함 - 완벽하게 "맨 아래로 스크롤"은 아니지만
   매번 맨 위부터 다시 스크롤하는 것보단 나음. 다른 사람이 넣은 행은 알 수 없어서 근사치임. */
function getDoDeskPaymentLastKnownRow() {
  try {
    const v = localStorage.getItem(DO_DESK_PAYMENT_LAST_ROW_KEY);
    return v ? Number(v) : null;
  } catch (e) { return null; }
}

function setDoDeskPaymentLastKnownRow(rowNumber) {
  if (!rowNumber) return;
  try {
    const current = getDoDeskPaymentLastKnownRow();
    if (!current || rowNumber > current) {
      localStorage.setItem(DO_DESK_PAYMENT_LAST_ROW_KEY, String(rowNumber));
    }
  } catch (e) { /* 무시 */ }
}
const DO_DESK_PAYMENT_RECENT_KEY = "do_desk_recent_payments";
let doDeskPaymentEditingRow = null; // null이면 추가 모드, 숫자면 그 행 번호를 수정 중

function loadDoDeskPaymentRecent() {
  try {
    const raw = localStorage.getItem(DO_DESK_PAYMENT_RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveDoDeskPaymentRecent(list) {
  try { localStorage.setItem(DO_DESK_PAYMENT_RECENT_KEY, JSON.stringify(list)); } catch (e) { /* 저장 실패해도 이번 세션은 그대로 유지되니 무시 */ }
}

function renderDoDeskPaymentRecentList() {
  const box = document.getElementById("doDeskPaymentRecentList");
  if (!box) return;
  const list = loadDoDeskPaymentRecent();
  if (list.length === 0) {
    box.innerHTML = '<div class="hint">아직 이 브라우저에서 추가한 항목이 없어요.</div>';
  } else {
    box.innerHTML = list.slice().reverse().map((item) => `
      <div class="desk-result-row">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" class="do-desk-payment-merge-check" value="${item.rowNumber}" data-cucc="${escapeHtml(item.cucc || "")}" onchange="updateDoDeskPaymentMergeUI()">
          <b>${escapeHtml(item.blNo || "-")}</b>
        </label>
        <div>CUCC: ${escapeHtml(item.cucc || "-")} / 비고: ${escapeHtml(item.note || "-")} / 행: ${item.rowNumber}</div>
        <div style="margin-top:6px;">
          <button type="button" class="btn secondary-btn" style="padding:4px 10px; font-size:12px;" onclick="startEditDoDeskPayment(${item.rowNumber})">✏️ 수정</button>
        </div>
      </div>
    `).join("");
  }
  updateDoDeskPaymentMergeUI();
}

function updateDoDeskPaymentMergeUI() {
  const box = document.getElementById("doDeskPaymentMergeBox");
  if (!box) return;
  const checks = document.querySelectorAll(".do-desk-payment-merge-check:checked");
  if (checks.length >= 2) {
    box.style.display = "";
    const cuccInput = document.getElementById("doDeskPaymentMergeCucc");
    if (cuccInput && !cuccInput.value) {
      cuccInput.value = checks[0].dataset.cucc || "";
    }
  } else {
    box.style.display = "none";
  }
}

function mergeDoDeskSelectedPayments() {
  const checks = document.querySelectorAll(".do-desk-payment-merge-check:checked");
  const rowNumbers = Array.from(checks).map((el) => Number(el.value));
  const cuccInput = document.getElementById("doDeskPaymentMergeCucc");
  const cucc = cuccInput ? cuccInput.value.trim() : "";
  const statusEl = document.getElementById("doDeskPaymentMergeStatus");

  if (rowNumbers.length < 2) return;
  if (!cucc) {
    if (statusEl) { statusEl.textContent = "공통 CUCC를 입력해주세요."; statusEl.style.color = "#dc2626"; }
    return;
  }

  const sorted = rowNumbers.slice().sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      if (statusEl) { statusEl.textContent = "선택한 행이 서로 연속되어 있지 않아요. 표에서 붙어있는 행만 병합할 수 있어요."; statusEl.style.color = "#dc2626"; }
      return;
    }
  }

  if (statusEl) { statusEl.textContent = "병합 중..."; statusEl.style.color = "#6b7280"; }

  fetch(DO_DESK_PAYMENT_MERGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rowNumbers: sorted, cucc }),
  })
    .then((res) => res.json())
    .then(() => {
      // 병합된 행들은 더 이상 개별 수정 대상이 아니므로 "최근 추가한 항목" 목록에서 제거
      let list = loadDoDeskPaymentRecent();
      list = list.filter((item) => sorted.indexOf(item.rowNumber) === -1);
      saveDoDeskPaymentRecent(list);
      renderDoDeskPaymentRecentList();
      setDoDeskPaymentLastKnownRow(sorted[sorted.length - 1]);
      if (statusEl) { statusEl.textContent = "병합 완료했어요."; statusEl.style.color = "#6b7280"; }
    })
    .catch((err) => {
      console.error(err);
      if (statusEl) { statusEl.textContent = "병합 실패했어요. 다시 시도해주세요."; statusEl.style.color = "#dc2626"; }
    });
}

function setDoDeskPaymentStatus(msg, isError) {
  const el = document.getElementById("doDeskPaymentStatus");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#dc2626" : "#6b7280";
}

function submitDoDeskPayment() {
  const blNoEl = document.getElementById("doDeskPaymentBlNo");
  const cuccEl = document.getElementById("doDeskPaymentCucc");
  const noteEl = document.getElementById("doDeskPaymentNote");
  if (!blNoEl || !cuccEl || !noteEl) return;

  const blNo = blNoEl.value.trim();
  const cucc = cuccEl.value.trim();
  const note = noteEl.value.trim();

  if (!blNo) {
    setDoDeskPaymentStatus("BL NO는 꼭 입력해주세요.", true);
    return;
  }

  const submitBtn = document.getElementById("doDeskPaymentSubmitBtn");
  if (submitBtn) submitBtn.disabled = true;
  setDoDeskPaymentStatus(doDeskPaymentEditingRow ? "수정 중..." : "추가 중...");

  const isEditing = doDeskPaymentEditingRow !== null;
  const url = isEditing ? DO_DESK_PAYMENT_UPDATE_URL : DO_DESK_PAYMENT_ADD_URL;
  const body = isEditing
    ? { rowNumber: doDeskPaymentEditingRow, blNo, cucc, note }
    : { blNo, cucc, note };

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((res) => res.json())
    .then((data) => {
      const list = loadDoDeskPaymentRecent();
      const editedRow = doDeskPaymentEditingRow;
      if (editedRow !== null) {
        const idx = list.findIndex((item) => item.rowNumber === editedRow);
        if (idx !== -1) list[idx] = { rowNumber: editedRow, blNo, cucc, note };
        saveDoDeskPaymentRecent(list);
        renderDoDeskPaymentRecentList();
        cancelEditDoDeskPayment();
        setDoDeskPaymentStatus(`${editedRow}행을 수정했어요.`);
      } else {
        const rowNumber = data && data.rowNumber;
        list.push({ rowNumber, blNo, cucc, note });
        saveDoDeskPaymentRecent(list);
        renderDoDeskPaymentRecentList();
        cancelEditDoDeskPayment();
        setDoDeskPaymentLastKnownRow(rowNumber);
        setDoDeskPaymentStatus(rowNumber ? `${rowNumber}행에 추가했어요.` : "추가했어요.");
      }
    })
    .catch((err) => {
      console.error(err);
      setDoDeskPaymentStatus("실패했어요. 네트워크 상태 확인 후 다시 시도해주세요.", true);
    })
    .finally(() => {
      if (submitBtn) submitBtn.disabled = false;
    });
}

function startEditDoDeskPayment(rowNumber) {
  const list = loadDoDeskPaymentRecent();
  const item = list.find((it) => it.rowNumber === rowNumber);
  if (!item) return;

  doDeskPaymentEditingRow = rowNumber;
  document.getElementById("doDeskPaymentBlNo").value = item.blNo || "";
  document.getElementById("doDeskPaymentCucc").value = item.cucc || "";
  document.getElementById("doDeskPaymentNote").value = item.note || "";

  const submitBtn = document.getElementById("doDeskPaymentSubmitBtn");
  const cancelBtn = document.getElementById("doDeskPaymentCancelBtn");
  if (submitBtn) submitBtn.textContent = "✏️ 수정 저장";
  if (cancelBtn) cancelBtn.style.display = "";
  setDoDeskPaymentStatus(`${rowNumber}행 수정 중이에요.`);
}

function cancelEditDoDeskPayment() {
  doDeskPaymentEditingRow = null;
  const blNoEl = document.getElementById("doDeskPaymentBlNo");
  const cuccEl = document.getElementById("doDeskPaymentCucc");
  const noteEl = document.getElementById("doDeskPaymentNote");
  if (blNoEl) blNoEl.value = "";
  if (cuccEl) cuccEl.value = "";
  if (noteEl) noteEl.value = "";

  const submitBtn = document.getElementById("doDeskPaymentSubmitBtn");
  const cancelBtn = document.getElementById("doDeskPaymentCancelBtn");
  if (submitBtn) submitBtn.textContent = "➕ 추가";
  if (cancelBtn) cancelBtn.style.display = "none";
}

function refreshDoDeskPaymentEmbed() {
  const iframe = document.getElementById("doDeskPaymentEmbed");
  if (!iframe) return;
  const lastRow = getDoDeskPaymentLastKnownRow();
  const targetCell = lastRow ? ("C" + lastRow) : "A1";
  iframe.src = DO_DESK_PAYMENT_EMBED_BASE_URL + "&_r=" + Date.now() + "#수입!" + targetCell;
}

let doDeskPaymentAutoRefreshInterval = null;

function startDoDeskPaymentAutoRefresh() {
  stopDoDeskPaymentAutoRefresh();
  doDeskPaymentAutoRefreshInterval = setInterval(() => {
    // D/O 데스크 탭을 벗어났으면(다른 탭 보는 중) 자동으로 멈춤 - 안 보이는 화면을 계속 새로고침할 필요 없으니까
    const page = document.getElementById("page-doDesk");
    if (!page || !page.classList.contains("active")) {
      stopDoDeskPaymentAutoRefresh();
      return;
    }
    refreshDoDeskPaymentEmbed();
  }, 60000);
}

function stopDoDeskPaymentAutoRefresh() {
  if (doDeskPaymentAutoRefreshInterval) {
    clearInterval(doDeskPaymentAutoRefreshInterval);
    doDeskPaymentAutoRefreshInterval = null;
  }
}

function toggleDoDeskPaymentAutoRefresh() {
  const cb = document.getElementById("doDeskPaymentAutoRefreshToggle");
  if (cb && cb.checked) {
    startDoDeskPaymentAutoRefresh();
  } else {
    stopDoDeskPaymentAutoRefresh();
  }
}

function loadDoDeskTab() {
  const wrap = document.getElementById("doDeskWrap");
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="desk-search-row">
      <div class="desk-search-col">
        <label class="label">⚓ 선박명 검색 (입항일 확인)</label>
        <input type="text" id="doDeskVesselInput" placeholder="예: AS CASPRIA" oninput="renderDoDeskVesselResult()">
        <div id="doDeskVesselResult" class="desk-result-box"></div>
      </div>
      <div class="desk-search-col">
        <label class="label">🖋️ 업체명 검색 (위임장 확인)</label>
        <input type="text" id="doDeskPoaInput" placeholder="예: 대흥기업" oninput="renderDoDeskPoaResult()">
        <div id="doDeskPoaResult" class="desk-result-box"></div>
      </div>
    </div>
    <div class="label" style="margin:20px 0 8px;">🧮 DO 비용 계산기</div>
    <div id="doDeskCalcBody"></div>

    <div class="label" style="margin:20px 0 8px;">💳 입금현황 등록 (재무팀 "수입" 탭)</div>
    <div class="hint" style="margin:0 0 8px;">BL NO / CUCC / 비고를 입력하면 재무팀 입금현황 엑셀 맨 아래 빈 줄에 자동으로 들어가요. 나머지 항목(입금일·금액 등)은 재무팀이 채워요.</div>
    <div class="desk-search-row" style="grid-template-columns: 1fr 1fr 1fr;">
      <div class="desk-search-col">
        <label class="label">BL NO</label>
        <input type="text" id="doDeskPaymentBlNo" placeholder="예: ZIMU1234567">
      </div>
      <div class="desk-search-col">
        <label class="label">CUCC</label>
        <input type="text" id="doDeskPaymentCucc" placeholder="예: KRSELDOWCE">
      </div>
      <div class="desk-search-col">
        <label class="label">비고</label>
        <input type="text" id="doDeskPaymentNote" placeholder="예: 합송금">
      </div>
    </div>
    <div class="io-row">
      <button type="button" class="btn generate-btn" id="doDeskPaymentSubmitBtn" onclick="submitDoDeskPayment()">➕ 추가</button>
      <button type="button" class="btn secondary-btn" id="doDeskPaymentCancelBtn" onclick="cancelEditDoDeskPayment()" style="display:none;">취소</button>
    </div>
    <div id="doDeskPaymentStatus" class="hint" style="margin-top:6px;"></div>

    <div class="label" style="margin:16px 0 8px;">🕓 최근 추가한 항목 (이 브라우저 기준)</div>
    <div class="hint" style="margin:0 0 8px;">여기 목록에 있는 것만 수정할 수 있어요. 합송금 처리할 건들은 체크박스로 2개 이상 선택하면 병합 버튼이 나타나요.</div>
    <div id="doDeskPaymentRecentList" class="desk-result-box"></div>

    <div id="doDeskPaymentMergeBox" style="display:none; margin-top:10px; padding:12px; border:1px dashed #d1d5db; border-radius:10px;">
      <div class="label" style="margin:0 0 8px;">🔗 선택한 항목 합송금으로 병합</div>
      <div class="hint" style="margin:0 0 8px;">체크한 행들은 표에서 서로 붙어있는(연속된) 행이어야 해요. CUCC 칸엔 아래 입력한 공통 CUCC가, 비고 칸엔 자동으로 "합송금"이 들어가요.</div>
      <label class="label">공통 CUCC</label>
      <input type="text" id="doDeskPaymentMergeCucc" placeholder="예: KRSELDOWCE">
      <div class="io-row">
        <button type="button" class="btn generate-btn" onclick="mergeDoDeskSelectedPayments()">🔗 합송금으로 병합</button>
      </div>
      <div id="doDeskPaymentMergeStatus" class="hint" style="margin-top:6px;"></div>
    </div>

    <hr style="margin:20px 0; border:none; border-top:1px solid #e5e7eb;">
    <div class="hint" style="margin-bottom:10px;">방금 등록한 내용이 아래 화면에 바로 안 보이면 "🔄 새로고침"을 눌러주세요. 화면을 한 번 클릭한 다음 <b>Ctrl+F</b>로 검색할 수 있어요.</div>
    <div class="hint" style="margin-bottom:10px;">⚠️ 화면이 안 뜨거나 "액세스 권한이 없습니다"라고 나오면, 회사 마이크로소프트 계정으로 로그인이 안 되어 있거나 공유 대상에 포함되지 않은 경우예요. 그럴 땐 재무팀에 공유 대상 추가를 요청해주세요.</div>
    <div class="hint" style="margin-bottom:10px; display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
      <button type="button" class="btn secondary-btn" onclick="refreshDoDeskPaymentEmbed()">🔄 지금 새로고침</button>
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" id="doDeskPaymentAutoRefreshToggle" checked onchange="toggleDoDeskPaymentAutoRefresh()">
        ⏱ 1분마다 자동 새로고침
      </label>
    </div>
    <div class="payment-embed-wrap">
      <iframe
        id="doDeskPaymentEmbed"
        src="${DO_DESK_PAYMENT_EMBED_BASE_URL}#수입!A1"
        width="100%" height="800" frameborder="0" scrolling="yes"
        title="입금현황 - 수입 (BLCONFIRM.xlsx)">
      </iframe>
    </div>

    <div class="label" style="margin:20px 0 8px;">📝 메모</div>
    <div class="hint" style="margin:0 0 8px;">시스템 코드, 처리 순서 등 자유롭게 적어두세요. 이 브라우저에만 저장돼요(다른 팀원한텐 안 보여요).</div>
    <textarea id="doDeskMemo" rows="6" placeholder="예: TDO101 - Freight Note 확인 - PLISM 발급 순서로" style="width:100%; box-sizing:border-box;" oninput="saveDeskMemo('doDeskMemo')"></textarea>
  `;
  renderDoCalculator("doDeskCalcBody");
  loadDeskMemo("doDeskMemo");
  renderDoDeskPaymentRecentList();
  startDoDeskPaymentAutoRefresh();

  // 모선 일정/위임장 탭을 따로 안 열어봐도 데스크에서 바로 검색되게, 여기서도 실시간 구독을 시작함
  loadVesselTab();
  loadPoaTab();
}

function renderDoDeskVesselResult() {
  const inputEl = document.getElementById("doDeskVesselInput");
  const box = document.getElementById("doDeskVesselResult");
  if (!inputEl || !box) return;
  if (!inputEl.value.trim()) { box.innerHTML = ""; return; }
  const matches = searchVesselsByName(inputEl.value).slice(0, 8);
  if (matches.length === 0) { box.innerHTML = '<div class="hint">검색 결과가 없어요.</div>'; return; }
  box.innerHTML = matches.map((v) => `
    <div class="desk-result-row">
      <b>${escapeHtml(v.name || "-")}</b>${v.code ? ` <span class="desk-vessel-code">${escapeHtml(v.code)}</span>` : ""}${v.voyage ? ` <span class="desk-vessel-voyage">${escapeHtml(v.voyage)}</span>` : ""}
      <div>⚓ 입항 ${formatVesselDateTime(v.arrivalDate, v.arrivalTimeConfirmed)}</div>
    </div>
  `).join("");
}

function renderDoDeskPoaResult() {
  const inputEl = document.getElementById("doDeskPoaInput");
  const box = document.getElementById("doDeskPoaResult");
  if (!inputEl || !box) return;
  if (!inputEl.value.trim()) { box.innerHTML = ""; return; }
  const matches = searchPoaByCompany(inputEl.value).slice(0, 8);
  if (matches.length === 0) { box.innerHTML = '<div class="hint">검색 결과가 없어요 - 위임장 미제출일 수 있어요.</div>'; return; }
  box.innerHTML = matches.map((p) => {
    const warning = getPoaExpiryWarning(p.submittedDate);
    return `
      <div class="desk-result-row ${warning ? "warn" : "ok"}">
        <b>${escapeHtml(p.applicant || "-")}</b> → ${escapeHtml(p.shipper || "-")}
        <div>제출일 ${formatPoaDate(p.submittedDate) || "-"} · ${warning ? "⚠️ " + escapeHtml(warning) : "✅ 정상"}</div>
      </div>
    `;
  }).join("");
}

