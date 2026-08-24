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

    <div class="label" style="margin:20px 0 8px;">📝 메모</div>
    <div class="hint" style="margin:0 0 8px;">시스템 코드, 처리 순서 등 자유롭게 적어두세요. 이 브라우저에만 저장돼요(다른 팀원한텐 안 보여요).</div>
    <textarea id="doDeskMemo" rows="6" placeholder="예: TDO101 - Freight Note 확인 - PLISM 발급 순서로" style="width:100%; box-sizing:border-box;" oninput="saveDeskMemo('doDeskMemo')"></textarea>
  `;
  renderDoCalculator("doDeskCalcBody");
  loadDeskMemo("doDeskMemo");

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

