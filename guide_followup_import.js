/* =========================================================================
   📌 팔로우업 보드 (수입 CS) - 수출 팔로우업 보드(guide_followup.js)와 완전히 같은 구조,
   완전히 별도의 컬렉션(followup_board_import)을 써서 수출/수입 건이 안 섞여요.
   업무유형은 수입에 맞게 COD 대신 "세관정정"이 들어가요.
   ========================================================================= */
const FOLLOWUP_IMPORT_COLLECTION = "followup_board_import"; // Firestore 컬렉션 이름

let FOLLOWUP_IMPORT_LIST = [];
let followupImportUnsubscribe = null;
let followupImportMonthFilter = "__all"; // "__all" | "YYYY-MM" | "__current" - 기본은 전체보기 (월 넘어가는 진행중 건이 안 숨겨지게)
let followupImportDraft = null; // 지금 편집중인 항목 (없으면 새 항목)
let followupImportQuickAddOpen = false;
let followupImportQuickDraft = {}; // 빠른등록 줄에 입력 중이던 값 - 실시간 갱신으로 표가 다시 그려져도 안 날아가게 여기 저장해뒀다가 복원함
let followupImportCompletedExpanded = false; // 완료 건 묶음을 펼쳐서 보고 있는지 - 기본은 접어둠 (진행중 건 위주로 보이게)

const FOLLOWUP_IMPORT_WORK_TYPES = ["스케줄", "세관정정", "정산/비용", "클레임", "기타"];
const FOLLOWUP_IMPORT_URGENCIES = ["당일필수", "익일가능", "오늘확인"];
const FOLLOWUP_IMPORT_STATUSES = ["대기", "진행중", "완료"];
const FOLLOWUP_IMPORT_DECISIONS = ["확인후회신", "익일리뷰", "팀장판단"];

/* Firestore에서 팔로우업 전체 목록을 가져온다 (최초 1회, onSnapshot 실패시 폴백용) */
async function fetchFollowupImportListFromServer() {
  try {
    await window.fbReady;
    const snapshot = await window.fbDb.collection(FOLLOWUP_IMPORT_COLLECTION).get();
    return snapshot.docs.map((doc) => followupImportDocToEntry(doc));
  } catch (err) {
    console.error("팔로우업보드 서버 목록 불러오기 실패:", err);
    return null;
  }
}

function followupImportDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    registeredDate: d.registeredDate || "",
    customer: d.customer || "",
    workType: d.workType || "기타",
    title: d.title || "",
    urgency: d.urgency || "익일가능",
    status: d.status || "대기",
    nextAction: d.nextAction || "",
    followUpDate: d.followUpDate || "",
    owner: d.owner || "",
    decision: d.decision || "",
    memo: d.memo || "",
    completedDate: d.completedDate || "",
    pinned: d.pinned === true, // 급한 건 표 맨 위에 고정해서 보기
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAtIso || ""),
    updatedAt: d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : (d.updatedAtIso || ""),
  };
}

/* Firestore에 새 팔로우업 건을 등록한다 */
async function submitFollowupImportToServer(entry) {
  try {
    await window.fbReady;
    const nowIso = new Date().toISOString();
    const docRef = await window.fbDb.collection(FOLLOWUP_IMPORT_COLLECTION).add({
      registeredDate: entry.registeredDate || "",
      customer: entry.customer || "",
      workType: entry.workType || "기타",
      title: entry.title || "",
      urgency: entry.urgency || "익일가능",
      status: entry.status || "대기",
      nextAction: entry.nextAction || "",
      followUpDate: entry.followUpDate || "",
      owner: entry.owner || "",
      decision: entry.decision || "",
      memo: entry.memo || "",
      completedDate: entry.completedDate || "",
      pinned: entry.pinned === true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error("팔로우업보드 서버 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 기존 팔로우업 건 수정 (id로 찾아서 덮어씀) */
async function updateFollowupImportOnServer(entry) {
  try {
    await window.fbReady;
    await window.fbDb.collection(FOLLOWUP_IMPORT_COLLECTION).doc(entry.id).update({
      registeredDate: entry.registeredDate || "",
      customer: entry.customer || "",
      workType: entry.workType || "기타",
      title: entry.title || "",
      urgency: entry.urgency || "익일가능",
      status: entry.status || "대기",
      nextAction: entry.nextAction || "",
      followUpDate: entry.followUpDate || "",
      owner: entry.owner || "",
      decision: entry.decision || "",
      memo: entry.memo || "",
      completedDate: entry.completedDate || "",
      pinned: entry.pinned === true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    console.error("팔로우업보드 서버 수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteFollowupImportFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(FOLLOWUP_IMPORT_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("팔로우업보드 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 표에서 "처리완료"/"되돌리기" 버튼 한 번 누르면 바로 바뀌게 - 전체 폼 열 필요 없음.
   완료로 바꿀 땐 완료일도 오늘 날짜로 같이 채워주고, 되돌릴 땐 "진행중"으로 돌려놓음. */
async function toggleFollowupImportDone(id) {
  const item = FOLLOWUP_IMPORT_LIST.find((f) => f.id === id);
  if (!item) return;
  const nowDone = item.status !== "완료";
  try {
    await window.fbReady;
    await window.fbDb.collection(FOLLOWUP_IMPORT_COLLECTION).doc(id).update({
      status: nowDone ? "완료" : "진행중",
      completedDate: nowDone ? new Date().toISOString().slice(0, 10) : "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });
  } catch (err) {
    alert("상태 변경에 실패했어요: " + err);
  }
}

/* 급한 건 표 맨 위에 고정 - 다시 누르면 고정 해제 */
async function toggleFollowupImportPinned(id) {
  const item = FOLLOWUP_IMPORT_LIST.find((f) => f.id === id);
  if (!item) return;
  try {
    await window.fbReady;
    await window.fbDb.collection(FOLLOWUP_IMPORT_COLLECTION).doc(id).update({ pinned: !item.pinned });
  } catch (err) {
    alert("고정 상태 변경에 실패했어요: " + err);
  }
}

/* "✅ 완료" 묶음 헤더를 누르면 접혔다 펼쳐졌다 함 */
function toggleFollowupImportCompletedSection() {
  followupImportCompletedExpanded = !followupImportCompletedExpanded;
  renderFollowupImportList();
}

/* 진행 상황/메모처럼 긴 텍스트 칸을 2줄로 접어뒀다가, "더보기" 누르면 전체를 펼침 */
function toggleFollowupImportClamp(btn) {
  const target = btn.previousElementSibling;
  const expanded = target.dataset.expanded === "1";
  target.style.webkitLineClamp = expanded ? "2" : "unset";
  target.dataset.expanded = expanded ? "0" : "1";
  btn.textContent = expanded ? "더보기" : "접기";
}

function followupImportClampCell(text) {
  if (!text) return "-";
  const escaped = escapeHtml(text).replace(/\n/g, "<br>");
  return `<div class="followup-clamp-text" data-expanded="0" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;">${escaped}</div>`
    + `<button type="button" class="no-strike" style="background:none;border:none;padding:0;margin-top:2px;font-size:11px;color:var(--text-accent,#185fa5);cursor:pointer;" onclick="event.stopPropagation();toggleFollowupImportClamp(this)">더보기</button>`;
}

/* 팔로우업보드 탭을 열 때 호출 - 처음 한 번만 실시간 구독을 시작해서, 팀원 누가 등록/수정/삭제하면 자동으로 화면 반영.
   forceRefresh=true(새로고침 버튼)일 때만 구독을 끊고 다시 읽어옴 - 탭을 그냥 오갈 땐 재구독 안 해서 Firestore 읽기 비용이 안 쌓여요. */
async function loadFollowupImportTab(forceRefresh) {
  const wrap = document.getElementById("followupImportListWrap");
  if (liveSubscribed.followupImport && !forceRefresh) { renderFollowupImportBoard(); return; }
  if (forceRefresh && followupImportUnsubscribe) { followupImportUnsubscribe(); followupImportUnsubscribe = null; liveSubscribed.followupImport = false; }
  if (wrap && !FOLLOWUP_IMPORT_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 팔로우업 보드를 불러오는 중이에요...</div>';
  await window.fbReady;
  followupImportUnsubscribe = window.fbDb.collection(FOLLOWUP_IMPORT_COLLECTION).onSnapshot(
    (snapshot) => {
      FOLLOWUP_IMPORT_LIST = snapshot.docs.map((doc) => followupImportDocToEntry(doc));
      populateFollowupImportMonthFilter();
      renderFollowupImportBoard();
    },
    (err) => {
      console.error("팔로우업보드 실시간 구독 실패:", err);
      if (wrap && !FOLLOWUP_IMPORT_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadFollowupImportTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.followupImport = true;
  liveTabUnsubscribers.followupImport = () => { if (followupImportUnsubscribe) { followupImportUnsubscribe(); followupImportUnsubscribe = null; liveSubscribed.followupImport = false; } };
}

function currentYearMonthImport() {
  const t = new Date();
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0");
}

/* 월 선택 드롭다운 채우기 - 등록된 건들의 연-월을 모아서 최신순으로, 맨 앞엔 "전체"와 이번 달 */
function populateFollowupImportMonthFilter() {
  const sel = document.getElementById("followupImportMonthSelect");
  if (!sel) return;
  const cur = currentYearMonthImport();
  const months = new Set([cur]);
  FOLLOWUP_IMPORT_LIST.forEach((f) => { if (f.registeredDate) months.add(f.registeredDate.slice(0, 7)); });
  const sortedMonths = Array.from(months).sort().reverse();

  const prevValue = sel.value || followupImportMonthFilter;
  sel.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "__all";
  allOpt.textContent = "전체 보기";
  sel.appendChild(allOpt);
  sortedMonths.forEach((ym) => {
    const opt = document.createElement("option");
    opt.value = ym;
    const [y, m] = ym.split("-");
    opt.textContent = `${y}년 ${Number(m)}월` + (ym === cur ? " (이번 달)" : "");
    sel.appendChild(opt);
  });

  const keep = prevValue === "__current" ? cur : prevValue;
  if (Array.from(sel.options).some((o) => o.value === keep)) {
    sel.value = keep;
    followupImportMonthFilter = keep;
  } else {
    sel.value = cur;
    followupImportMonthFilter = cur;
  }
}

function onFollowupImportMonthChange() {
  const sel = document.getElementById("followupImportMonthSelect");
  followupImportMonthFilter = sel ? sel.value : "__all";
  renderFollowupImportBoard();
}

function followupImportFilteredList() {
  let list = FOLLOWUP_IMPORT_LIST.slice();
  if (followupImportMonthFilter && followupImportMonthFilter !== "__all") {
    list = list.filter((f) => (f.registeredDate || "").slice(0, 7) === followupImportMonthFilter);
  }
  return list;
}

function renderFollowupImportBoard() {
  renderFollowupImportSummary();
  renderFollowupImportList();
}

function renderFollowupImportSummary() {
  const wrap = document.getElementById("followupImportSummaryRow");
  if (!wrap) return;
  const list = followupImportFilteredList();
  const today = new Date();
  const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const curMonth = currentYearMonthImport();

  const incomplete = list.filter((f) => f.status !== "완료");
  const urgentToday = incomplete.filter((f) => f.urgency === "당일필수");
  const followUpToday = incomplete.filter((f) => (f.followUpDate || "").slice(0, 10) === todayStr);
  const carryOver = incomplete.filter((f) => f.registeredDate && f.registeredDate.slice(0, 7) < curMonth);

  const stats = [
    { label: "미완료 건수", count: incomplete.length, cls: "" },
    { label: "당일필수 건수", count: urgentToday.length, cls: "low" },
    { label: "오늘 후속조치", count: followUpToday.length, cls: "low" },
    { label: "이월 건수", count: carryOver.length, cls: "" },
  ];

  wrap.innerHTML = stats.map((s) =>
    `<div class="followup-stat-box"><div class="followup-stat-num${s.cls ? " " + s.cls : ""}">${s.count}</div><div class="followup-stat-label">${escapeHtml(s.label)}</div></div>`
  ).join("");
}

function followupImportUrgencyBadgeClass(urgency) {
  if (urgency === "당일필수") return "followup-badge urgent";
  if (urgency === "오늘확인") return "followup-badge today";
  return "followup-badge normal";
}

function followupImportStatusBadgeClass(status) {
  if (status === "완료") return "followup-badge done";
  if (status === "진행중") return "followup-badge progress";
  return "followup-badge waiting";
}

function renderFollowupImportList() {
  const wrap = document.getElementById("followupImportListWrap");
  if (!wrap) return;

  const qEl = document.getElementById("followupImportFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();
  const statusEl = document.getElementById("followupImportStatusFilter");
  const statusFilter = statusEl ? statusEl.value : "__all";

  let list = followupImportFilteredList();
  if (statusFilter && statusFilter !== "__all") list = list.filter((f) => f.status === statusFilter);
  if (q) {
    list = list.filter((f) => [f.customer, f.title, f.memo, f.owner, f.workType].filter(Boolean).join(" ").toLowerCase().includes(q));
  }

  // 고정된 건 항상 맨 위, 그다음 등록일 최신순 (같은 날이면 최근 수정 순)
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ad = a.registeredDate || "", bd = b.registeredDate || "";
    if (ad !== bd) return bd.localeCompare(ad);
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });

  if (FOLLOWUP_IMPORT_LIST.length === 0 && !followupImportQuickAddOpen) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 건이 없어요. 위 "➕ 새 건 등록하기" 버튼으로 첫 건을 등록해보세요.</div>';
    return;
  }
  if (list.length === 0 && !followupImportQuickAddOpen) {
    wrap.innerHTML = '<div class="empty-state">조건에 맞는 건이 없어요.</div>';
    return;
  }

  const table = document.createElement("table");
  table.className = "contacts-table followup-table sticky-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th></th><th>등록일</th><th>고객/거래처</th><th>업무유형</th><th>건명 / BL No.</th><th>긴급도</th><th>상태</th><th>진행 상황</th><th>메모 / 히스토리</th><th>후속조치일</th><th>담당</th><th></th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  if (followupImportQuickAddOpen) tbody.appendChild(buildFollowupImportQuickAddRow());

  // "전체 보기" 상태일 때만 진행중/완료를 분리해요. 상태 필터로 "완료"만 콕 집어 보고 있으면 굳이 또 나눌 필요 없어서 그냥 다 보여줘요.
  const splitByStatus = statusFilter === "__all";
  const activeList = splitByStatus ? list.filter((f) => f.status !== "완료") : list;
  const doneList = splitByStatus ? list.filter((f) => f.status === "완료") : [];

  activeList.forEach((f) => tbody.appendChild(buildFollowupImportRow(f)));

  if (splitByStatus && doneList.length > 0) {
    const headerTr = document.createElement("tr");
    headerTr.innerHTML = `<td colspan="12" class="no-strike" style="cursor:pointer;padding:9px 14px;background:var(--surface-1,#f4f4f2);">`
      + `<span style="display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text-secondary,#5f5e5a);">`
      + `<span>${followupImportCompletedExpanded ? "▾" : "▸"}</span>✅ 완료 ${doneList.length}건${followupImportCompletedExpanded ? "" : " (눌러서 펼치기)"}`
      + `</span></td>`;
    headerTr.onclick = () => toggleFollowupImportCompletedSection();
    tbody.appendChild(headerTr);
    if (followupImportCompletedExpanded) {
      doneList.forEach((f) => tbody.appendChild(buildFollowupImportRow(f)));
    }
  }

  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);

  const countInfo = document.createElement("div");
  countInfo.className = "hint";
  countInfo.style.marginTop = "8px";
  countInfo.textContent = "✅ " + list.length + "건 표시됨";
  wrap.appendChild(countInfo);

  const firstInput = document.getElementById("followupImportQuickCustomer");
  if (firstInput) firstInput.focus();
}

function buildFollowupImportRow(f) {
  const isDone = f.status === "완료";
  const isPinned = f.pinned === true;
  const tr = document.createElement("tr");
  tr.className = [isDone ? "row-done" : "", isPinned ? "row-pinned" : ""].filter(Boolean).join(" ");
  tr.dataset.followupId = f.id;
  tr.innerHTML = `<td class="no-strike" style="text-align:center;"><button class="pin-btn ${isPinned ? "pinned" : ""}" title="${isPinned ? "고정 해제" : "표 맨 위에 고정"}" onclick="event.stopPropagation();toggleFollowupImportPinned('${f.id}')">📌</button></td>`
    + `<td>${escapeHtml(f.registeredDate || "-")}</td>`
    + `<td>${escapeHtml(f.customer || "-")}</td>`
    + `<td>${escapeHtml(f.workType || "-")}</td>`
    + `<td class="followup-title-cell">${escapeHtml(f.title || "-")}</td>`
    + `<td class="no-strike"><span class="${followupImportUrgencyBadgeClass(f.urgency)}">${escapeHtml(f.urgency || "-")}</span></td>`
    + `<td class="no-strike"><span class="${followupImportStatusBadgeClass(f.status)}">${escapeHtml(f.status || "-")}</span></td>`
    + `<td>${followupImportClampCell(f.nextAction)}</td>`
    + `<td class="followup-memo-cell">${followupImportClampCell(f.memo)}</td>`
    + `<td>${escapeHtml(f.followUpDate || "-")}</td>`
    + `<td>${escapeHtml(f.owner || "-")}</td>`
    + `<td class="no-strike" style="white-space:nowrap;">`
    + `<button class="btn ${isDone ? "secondary-btn" : "generate-btn"}" style="padding:4px 10px;font-size:12px;margin-right:4px;" onclick="event.stopPropagation();toggleFollowupImportDone('${f.id}')">${isDone ? "↩️ 되돌리기" : "✅ 처리완료"}</button>`
    + `<button class="btn secondary-btn" style="padding:4px 10px;font-size:12px;" onclick="event.stopPropagation();openFollowupImportEditor('${f.id}')">✏️ 수정</button>`
    + `</td>`;
  tr.style.cursor = "pointer";
  tr.onclick = (e) => { if (e.target.tagName !== "BUTTON") openFollowupImportEditor(f.id); };
  return tr;
}

/* ---- 엑셀처럼 표 맨 위에 빈 줄 하나 열어서 바로 입력하는 빠른등록 ---- */
function toggleFollowupImportQuickAdd() {
  followupImportQuickAddOpen = !followupImportQuickAddOpen;
  renderFollowupImportList();
}

function buildFollowupImportQuickAddRow() {
  const tr = document.createElement("tr");
  tr.className = "quick-add-row";

  const pinTd = document.createElement("td");
  tr.appendChild(pinTd);

  const onEnterOrEsc = (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveFollowupImportQuickAdd(); }
    if (e.key === "Escape") { toggleFollowupImportQuickAdd(); }
  };

  const dateTd = document.createElement("td");
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.id = "followupImportQuickDate";
  dateInput.className = "quick-add-input";
  dateInput.value = followupImportQuickDraft.registeredDate || new Date().toISOString().slice(0, 10);
  dateInput.addEventListener("input", () => { followupImportQuickDraft.registeredDate = dateInput.value; });
  dateInput.addEventListener("keydown", onEnterOrEsc);
  dateTd.appendChild(dateInput);
  tr.appendChild(dateTd);

  const customerTd = document.createElement("td");
  const customerInput = document.createElement("input");
  customerInput.id = "followupImportQuickCustomer";
  customerInput.placeholder = "고객/거래처";
  customerInput.className = "quick-add-input";
  if (followupImportQuickDraft.customer) customerInput.value = followupImportQuickDraft.customer;
  customerInput.addEventListener("input", () => { followupImportQuickDraft.customer = customerInput.value; });
  customerInput.addEventListener("keydown", onEnterOrEsc);
  customerTd.appendChild(customerInput);
  tr.appendChild(customerTd);

  const workTypeTd = document.createElement("td");
  const workTypeSel = makeFollowupImportSelect(FOLLOWUP_IMPORT_WORK_TYPES, followupImportQuickDraft.workType || "스케줄");
  workTypeSel.id = "followupImportQuickWorkType";
  workTypeSel.className = "quick-add-input";
  workTypeSel.addEventListener("change", () => { followupImportQuickDraft.workType = workTypeSel.value; });
  workTypeTd.appendChild(workTypeSel);
  tr.appendChild(workTypeTd);

  const titleTd = document.createElement("td");
  const titleInput = document.createElement("input");
  titleInput.id = "followupImportQuickTitle";
  titleInput.placeholder = "건명 / BL No.";
  titleInput.className = "quick-add-input";
  if (followupImportQuickDraft.title) titleInput.value = followupImportQuickDraft.title;
  titleInput.addEventListener("input", () => { followupImportQuickDraft.title = titleInput.value; });
  titleInput.addEventListener("keydown", onEnterOrEsc);
  titleTd.appendChild(titleInput);
  tr.appendChild(titleTd);

  const urgencyTd = document.createElement("td");
  const urgencySel = makeFollowupImportSelect(FOLLOWUP_IMPORT_URGENCIES, followupImportQuickDraft.urgency || "익일가능");
  urgencySel.id = "followupImportQuickUrgency";
  urgencySel.className = "quick-add-input";
  urgencySel.addEventListener("change", () => { followupImportQuickDraft.urgency = urgencySel.value; });
  urgencyTd.appendChild(urgencySel);
  tr.appendChild(urgencyTd);

  const statusTd = document.createElement("td");
  const statusSel = makeFollowupImportSelect(FOLLOWUP_IMPORT_STATUSES, followupImportQuickDraft.status || "대기");
  statusSel.id = "followupImportQuickStatus";
  statusSel.className = "quick-add-input";
  statusSel.addEventListener("change", () => { followupImportQuickDraft.status = statusSel.value; });
  statusTd.appendChild(statusSel);
  tr.appendChild(statusTd);

  const nextActionTd = document.createElement("td");
  const nextActionInput = document.createElement("input");
  nextActionInput.id = "followupImportQuickNextAction";
  nextActionInput.placeholder = "진행 상황";
  nextActionInput.className = "quick-add-input";
  if (followupImportQuickDraft.nextAction) nextActionInput.value = followupImportQuickDraft.nextAction;
  nextActionInput.addEventListener("input", () => { followupImportQuickDraft.nextAction = nextActionInput.value; });
  nextActionInput.addEventListener("keydown", onEnterOrEsc);
  nextActionTd.appendChild(nextActionInput);
  tr.appendChild(nextActionTd);

  const followDateTd = document.createElement("td");
  const followDateInput = document.createElement("input");
  followDateInput.type = "date";
  followDateInput.id = "followupImportQuickFollowDate";
  followDateInput.className = "quick-add-input";
  if (followupImportQuickDraft.followUpDate) followDateInput.value = followupImportQuickDraft.followUpDate;
  followDateInput.addEventListener("input", () => { followupImportQuickDraft.followUpDate = followDateInput.value; });
  followDateInput.addEventListener("keydown", onEnterOrEsc);
  followDateTd.appendChild(followDateInput);
  tr.appendChild(followDateTd);

  const ownerTd = document.createElement("td");
  const ownerSel = makeFollowupImportSelect(["", ...OBL_TEAM_MEMBERS], followupImportQuickDraft.owner || "");
  ownerSel.id = "followupImportQuickOwner";
  ownerSel.className = "quick-add-input";
  ownerSel.addEventListener("change", () => { followupImportQuickDraft.owner = ownerSel.value; });
  ownerTd.appendChild(ownerSel);
  tr.appendChild(ownerTd);

  const actionTd = document.createElement("td");
  actionTd.style.whiteSpace = "nowrap";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.style.cssText = "padding:4px 10px;font-size:12px;margin-right:4px;";
  saveBtn.textContent = "✓ 저장";
  saveBtn.onclick = () => saveFollowupImportQuickAdd();
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn secondary-btn";
  closeBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  closeBtn.textContent = "✕";
  closeBtn.onclick = () => { followupImportQuickDraft = {}; toggleFollowupImportQuickAdd(); }; // ✕는 진짜로 닫는 거니까 기억해둔 값도 같이 지움
  actionTd.appendChild(saveBtn);
  actionTd.appendChild(closeBtn);
  tr.appendChild(actionTd);

  return tr;
}

async function saveFollowupImportQuickAdd() {
  const title = (document.getElementById("followupImportQuickTitle").value || "").trim();
  const registeredDate = document.getElementById("followupImportQuickDate").value;
  if (!registeredDate) { alert("등록일을 선택해주세요."); return; }
  if (!title) { alert("건명 / BL No.를 입력해주세요."); document.getElementById("followupImportQuickTitle").focus(); return; }

  const entry = {
    registeredDate,
    customer: (document.getElementById("followupImportQuickCustomer").value || "").trim(),
    workType: document.getElementById("followupImportQuickWorkType").value,
    title,
    urgency: document.getElementById("followupImportQuickUrgency").value,
    status: document.getElementById("followupImportQuickStatus").value,
    nextAction: (document.getElementById("followupImportQuickNextAction").value || "").trim(),
    followUpDate: document.getElementById("followupImportQuickFollowDate").value,
    owner: document.getElementById("followupImportQuickOwner").value,
    decision: "", memo: "", completedDate: "",
  };
  const result = await submitFollowupImportToServer(entry);
  if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류") + " - 입력하신 내용은 그대로 남아있으니 다시 저장을 눌러주세요."); return; }
  // 저장되면 실시간 구독이 목록을 바로 갱신해주지만, 다음 줄 입력을 위해 필요한 칸만 비워둠 (날짜/업무유형/긴급도/상태/담당은 이어서 쓰기 편하게 유지)
  followupImportQuickDraft = {}; // 저장 성공했으니 기억해둔 값도 비움
  ["followupImportQuickCustomer", "followupImportQuickTitle", "followupImportQuickNextAction", "followupImportQuickFollowDate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const first = document.getElementById("followupImportQuickCustomer");
  if (first) first.focus();
}

/* ---- 등록/수정 모달 ---- */
function openFollowupImportEditor(existingId) {
  followupImportDraft = existingId ? Object.assign({}, FOLLOWUP_IMPORT_LIST.find((f) => f.id === existingId)) : {
    id: null,
    registeredDate: new Date().toISOString().slice(0, 10),
    customer: "", workType: "스케줄", title: "", urgency: "익일가능", status: "대기",
    nextAction: "", followUpDate: "", owner: "", decision: "", memo: "", completedDate: "", pinned: false,
  };
  document.getElementById("followupImportEditTitle").textContent = existingId ? "✏️ 팔로우업 건 수정" : "➕ 팔로우업 건 등록";
  document.getElementById("followupImportEditOverlay").style.display = "flex";
  renderFollowupImportEditorBody();
}

function closeFollowupImportEditor() {
  document.getElementById("followupImportEditOverlay").style.display = "none";
  followupImportDraft = null;
}

function makeFollowupImportField(labelText, inputEl) {
  const wrap = document.createElement("div");
  wrap.appendChild(makeLabel(labelText));
  wrap.appendChild(inputEl);
  return wrap;
}

function makeFollowupImportSelect(options, value) {
  const sel = document.createElement("select");
  options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  });
  return sel;
}

function renderFollowupImportEditorBody() {
  const body = document.getElementById("followupImportEditBody");
  body.innerHTML = "";
  const d = followupImportDraft;

  const row1 = document.createElement("div");
  row1.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "poa-date-input";
  dateInput.value = d.registeredDate || "";
  row1.appendChild(makeFollowupImportField("등록일", dateInput));

  const ownerSel = makeFollowupImportSelect(["", ...OBL_TEAM_MEMBERS], d.owner);
  row1.appendChild(makeFollowupImportField("담당", ownerSel));
  body.appendChild(row1);

  const customerInput = document.createElement("input");
  customerInput.placeholder = "예: 효성, EGL, 태웅(한국타이어)";
  customerInput.value = d.customer || "";
  body.appendChild(makeFollowupImportField("고객/거래처", customerInput));

  const titleInput = document.createElement("textarea");
  titleInput.rows = 2;
  titleInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  titleInput.placeholder = "예: ZIMUSEL71223456 COD 관련";
  titleInput.value = d.title || "";
  body.appendChild(makeFollowupImportField("건명 / BL No.", titleInput));

  const row2 = document.createElement("div");
  row2.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
  const workTypeSel = makeFollowupImportSelect(FOLLOWUP_IMPORT_WORK_TYPES, d.workType);
  row2.appendChild(makeFollowupImportField("업무유형", workTypeSel));
  const urgencySel = makeFollowupImportSelect(FOLLOWUP_IMPORT_URGENCIES, d.urgency);
  row2.appendChild(makeFollowupImportField("긴급도", urgencySel));
  const statusSel = makeFollowupImportSelect(FOLLOWUP_IMPORT_STATUSES, d.status);
  row2.appendChild(makeFollowupImportField("상태", statusSel));
  body.appendChild(row2);

  const nextActionInput = document.createElement("textarea");
  nextActionInput.rows = 4;
  nextActionInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  nextActionInput.placeholder = "예: 서렌더 처리 완료 -> 반출일정 확인중 -> 08/21 리마인더 발송";
  nextActionInput.value = d.nextAction || "";
  body.appendChild(makeFollowupImportField("진행 상황", nextActionInput));

  const row3 = document.createElement("div");
  row3.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
  const followDateInput = document.createElement("input");
  followDateInput.type = "date";
  followDateInput.className = "poa-date-input";
  followDateInput.value = d.followUpDate || "";
  row3.appendChild(makeFollowupImportField("후속조치일", followDateInput));
  const decisionSel = makeFollowupImportSelect(["", ...FOLLOWUP_IMPORT_DECISIONS], d.decision);
  row3.appendChild(makeFollowupImportField("판단구분", decisionSel));
  body.appendChild(row3);

  const memoInput = document.createElement("textarea");
  memoInput.rows = 4;
  memoInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  memoInput.placeholder = "진행 히스토리를 이어서 기록해주세요";
  memoInput.value = d.memo || "";
  body.appendChild(makeFollowupImportField("메모 / 히스토리", memoInput));

  const completedInput = document.createElement("input");
  completedInput.type = "date";
  completedInput.className = "poa-date-input";
  completedInput.value = d.completedDate || "";
  body.appendChild(makeFollowupImportField("완료일 (완료 상태일 때만)", completedInput));

  const pinnedLabel = document.createElement("label");
  pinnedLabel.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13.5px;cursor:pointer;";
  const pinnedCheckbox = document.createElement("input");
  pinnedCheckbox.type = "checkbox";
  pinnedCheckbox.checked = d.pinned === true;
  pinnedLabel.appendChild(pinnedCheckbox);
  pinnedLabel.appendChild(document.createTextNode("📌 표 맨 위에 고정"));
  body.appendChild(pinnedLabel);

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = async () => {
    const entry = {
      id: d.id,
      registeredDate: dateInput.value,
      customer: customerInput.value.trim(),
      workType: workTypeSel.value,
      title: titleInput.value.trim(),
      urgency: urgencySel.value,
      status: statusSel.value,
      nextAction: nextActionInput.value.trim(),
      followUpDate: followDateInput.value,
      owner: ownerSel.value,
      decision: decisionSel.value,
      memo: memoInput.value.trim(),
      completedDate: completedInput.value,
      pinned: pinnedCheckbox.checked,
    };
    if (!entry.registeredDate) { alert("등록일을 선택해주세요."); return; }
    if (!entry.title) { alert("건명 / BL No.를 입력해주세요."); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = entry.id ? await updateFollowupImportOnServer(entry) : await submitFollowupImportToServer(entry);
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장하기";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeFollowupImportEditor();
  };
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn danger-btn";
  deleteBtn.textContent = "🗑️ 삭제";
  deleteBtn.style.display = d.id ? "" : "none";
  deleteBtn.onclick = async () => {
    if (!confirm("이 팔로우업 건을 삭제할까요?")) return;
    const result = await deleteFollowupImportFromServer(d.id);
    if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeFollowupImportEditor();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeFollowupImportEditor();
  actions.appendChild(saveBtn);
  if (d.id) actions.appendChild(deleteBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}
