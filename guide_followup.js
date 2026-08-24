/* =========================================================================
   📌 팔로우업 보드 (수출 CS) - 미완료 건 포함 계속 업데이트하는 실시간 공유 보드
   위임장/오비엘/모선일정과 완전히 같은 방식(Firestore)이에요. 팀원 누구나
   등록·수정·삭제 가능하고, 등록 시각과 상관없이 목록은 항상 최신순이에요.
   ========================================================================= */
const FOLLOWUP_COLLECTION = "followup_board"; // Firestore 컬렉션 이름

let FOLLOWUP_LIST = [];
let followupUnsubscribe = null;
let followupMonthFilter = "__current"; // "__all" | "YYYY-MM" | "__current"
let followupDraft = null; // 지금 편집중인 항목 (없으면 새 항목)
let followupQuickAddOpen = false;

const FOLLOWUP_WORK_TYPES = ["스케줄", "COD", "정산/비용", "클레임", "기타"];
const FOLLOWUP_URGENCIES = ["당일필수", "익일가능", "오늘확인"];
const FOLLOWUP_STATUSES = ["대기", "진행중", "완료"];
const FOLLOWUP_DECISIONS = ["확인후회신", "익일리뷰", "팀장판단"];

/* Firestore에서 팔로우업 전체 목록을 가져온다 (최초 1회, onSnapshot 실패시 폴백용) */
async function fetchFollowupListFromServer() {
  try {
    await window.fbReady;
    const snapshot = await window.fbDb.collection(FOLLOWUP_COLLECTION).get();
    return snapshot.docs.map((doc) => followupDocToEntry(doc));
  } catch (err) {
    console.error("팔로우업보드 서버 목록 불러오기 실패:", err);
    return null;
  }
}

function followupDocToEntry(doc) {
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
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAtIso || ""),
    updatedAt: d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : (d.updatedAtIso || ""),
  };
}

/* Firestore에 새 팔로우업 건을 등록한다 */
async function submitFollowupToServer(entry) {
  try {
    await window.fbReady;
    const nowIso = new Date().toISOString();
    const docRef = await window.fbDb.collection(FOLLOWUP_COLLECTION).add({
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
async function updateFollowupOnServer(entry) {
  try {
    await window.fbReady;
    await window.fbDb.collection(FOLLOWUP_COLLECTION).doc(entry.id).update({
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
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    console.error("팔로우업보드 서버 수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteFollowupFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(FOLLOWUP_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("팔로우업보드 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 팔로우업보드 탭을 열 때 호출 - 처음 한 번만 실시간 구독을 시작해서, 팀원 누가 등록/수정/삭제하면 자동으로 화면 반영.
   forceRefresh=true(새로고침 버튼)일 때만 구독을 끊고 다시 읽어옴 - 탭을 그냥 오갈 땐 재구독 안 해서 Firestore 읽기 비용이 안 쌓여요. */
async function loadFollowupTab(forceRefresh) {
  const wrap = document.getElementById("followupListWrap");
  if (liveSubscribed.followup && !forceRefresh) { renderFollowupBoard(); return; }
  if (forceRefresh && followupUnsubscribe) { followupUnsubscribe(); followupUnsubscribe = null; liveSubscribed.followup = false; }
  if (wrap && !FOLLOWUP_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 팔로우업 보드를 불러오는 중이에요...</div>';
  await window.fbReady;
  followupUnsubscribe = window.fbDb.collection(FOLLOWUP_COLLECTION).onSnapshot(
    (snapshot) => {
      FOLLOWUP_LIST = snapshot.docs.map((doc) => followupDocToEntry(doc));
      populateFollowupMonthFilter();
      renderFollowupBoard();
    },
    (err) => {
      console.error("팔로우업보드 실시간 구독 실패:", err);
      if (wrap && !FOLLOWUP_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadFollowupTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.followup = true;
  liveTabUnsubscribers.followup = () => { if (followupUnsubscribe) { followupUnsubscribe(); followupUnsubscribe = null; liveSubscribed.followup = false; } };
}

function currentYearMonth() {
  const t = new Date();
  return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0");
}

/* 월 선택 드롭다운 채우기 - 등록된 건들의 연-월을 모아서 최신순으로, 맨 앞엔 "전체"와 이번 달 */
function populateFollowupMonthFilter() {
  const sel = document.getElementById("followupMonthSelect");
  if (!sel) return;
  const cur = currentYearMonth();
  const months = new Set([cur]);
  FOLLOWUP_LIST.forEach((f) => { if (f.registeredDate) months.add(f.registeredDate.slice(0, 7)); });
  const sortedMonths = Array.from(months).sort().reverse();

  const prevValue = sel.value || followupMonthFilter;
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
    followupMonthFilter = keep;
  } else {
    sel.value = cur;
    followupMonthFilter = cur;
  }
}

function onFollowupMonthChange() {
  const sel = document.getElementById("followupMonthSelect");
  followupMonthFilter = sel ? sel.value : "__all";
  renderFollowupBoard();
}

function followupFilteredList() {
  let list = FOLLOWUP_LIST.slice();
  if (followupMonthFilter && followupMonthFilter !== "__all") {
    list = list.filter((f) => (f.registeredDate || "").slice(0, 7) === followupMonthFilter);
  }
  return list;
}

function renderFollowupBoard() {
  renderFollowupSummary();
  renderFollowupList();
}

function renderFollowupSummary() {
  const wrap = document.getElementById("followupSummaryRow");
  if (!wrap) return;
  const list = followupFilteredList();
  const today = new Date();
  const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const curMonth = currentYearMonth();

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

function followupUrgencyBadgeClass(urgency) {
  if (urgency === "당일필수") return "followup-badge urgent";
  if (urgency === "오늘확인") return "followup-badge today";
  return "followup-badge normal";
}

function followupStatusBadgeClass(status) {
  if (status === "완료") return "followup-badge done";
  if (status === "진행중") return "followup-badge progress";
  return "followup-badge waiting";
}

function renderFollowupList() {
  const wrap = document.getElementById("followupListWrap");
  if (!wrap) return;

  const qEl = document.getElementById("followupFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();
  const statusEl = document.getElementById("followupStatusFilter");
  const statusFilter = statusEl ? statusEl.value : "__all";

  let list = followupFilteredList();
  if (statusFilter && statusFilter !== "__all") list = list.filter((f) => f.status === statusFilter);
  if (q) {
    list = list.filter((f) => [f.customer, f.title, f.memo, f.owner, f.workType].filter(Boolean).join(" ").toLowerCase().includes(q));
  }

  // 등록일 최신순 (같은 날이면 최근 수정 순)
  list.sort((a, b) => {
    const ad = a.registeredDate || "", bd = b.registeredDate || "";
    if (ad !== bd) return bd.localeCompare(ad);
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });

  if (FOLLOWUP_LIST.length === 0 && !followupQuickAddOpen) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 건이 없어요. 위 "➕ 새 건 등록하기" 버튼으로 첫 건을 등록해보세요.</div>';
    return;
  }
  if (list.length === 0 && !followupQuickAddOpen) {
    wrap.innerHTML = '<div class="empty-state">조건에 맞는 건이 없어요.</div>';
    return;
  }

  const table = document.createElement("table");
  table.className = "contacts-table followup-table";
  table.innerHTML = "<tr><th>등록일</th><th>고객/거래처</th><th>업무유형</th><th>건명 / BL No.</th><th>긴급도</th><th>상태</th><th>다음 액션</th><th>후속조치일</th><th>담당</th><th></th></tr>";
  if (followupQuickAddOpen) table.appendChild(buildFollowupQuickAddRow());
  list.forEach((f) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(f.registeredDate || "-")}</td>`
      + `<td>${escapeHtml(f.customer || "-")}</td>`
      + `<td>${escapeHtml(f.workType || "-")}</td>`
      + `<td class="followup-title-cell">${escapeHtml(f.title || "-")}${f.memo ? `<div class="followup-memo-preview">${escapeHtml(f.memo)}</div>` : ""}</td>`
      + `<td><span class="${followupUrgencyBadgeClass(f.urgency)}">${escapeHtml(f.urgency || "-")}</span></td>`
      + `<td><span class="${followupStatusBadgeClass(f.status)}">${escapeHtml(f.status || "-")}</span></td>`
      + `<td>${escapeHtml(f.nextAction || "-")}</td>`
      + `<td>${escapeHtml(f.followUpDate || "-")}</td>`
      + `<td>${escapeHtml(f.owner || "-")}</td>`
      + `<td><button class="btn secondary-btn" style="padding:4px 10px;font-size:12px;" onclick="openFollowupEditor('${f.id}')">✏️ 수정</button></td>`;
    tr.style.cursor = "pointer";
    tr.onclick = (e) => { if (e.target.tagName !== "BUTTON") openFollowupEditor(f.id); };
    table.appendChild(tr);
  });
  wrap.innerHTML = "";
  wrap.appendChild(table);

  const countInfo = document.createElement("div");
  countInfo.className = "hint";
  countInfo.style.marginTop = "8px";
  countInfo.textContent = "✅ " + list.length + "건 표시됨";
  wrap.appendChild(countInfo);

  const firstInput = document.getElementById("followupQuickCustomer");
  if (firstInput) firstInput.focus();
}

/* ---- 엑셀처럼 표 맨 위에 빈 줄 하나 열어서 바로 입력하는 빠른등록 ---- */
function toggleFollowupQuickAdd() {
  followupQuickAddOpen = !followupQuickAddOpen;
  renderFollowupList();
}

function buildFollowupQuickAddRow() {
  const tr = document.createElement("tr");
  tr.className = "quick-add-row";

  const onEnterOrEsc = (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveFollowupQuickAdd(); }
    if (e.key === "Escape") { toggleFollowupQuickAdd(); }
  };

  const dateTd = document.createElement("td");
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.id = "followupQuickDate";
  dateInput.className = "quick-add-input";
  dateInput.value = new Date().toISOString().slice(0, 10);
  dateInput.addEventListener("keydown", onEnterOrEsc);
  dateTd.appendChild(dateInput);
  tr.appendChild(dateTd);

  const customerTd = document.createElement("td");
  const customerInput = document.createElement("input");
  customerInput.id = "followupQuickCustomer";
  customerInput.placeholder = "고객/거래처";
  customerInput.className = "quick-add-input";
  customerInput.addEventListener("keydown", onEnterOrEsc);
  customerTd.appendChild(customerInput);
  tr.appendChild(customerTd);

  const workTypeTd = document.createElement("td");
  const workTypeSel = makeFollowupSelect(FOLLOWUP_WORK_TYPES, "스케줄");
  workTypeSel.id = "followupQuickWorkType";
  workTypeSel.className = "quick-add-input";
  workTypeTd.appendChild(workTypeSel);
  tr.appendChild(workTypeTd);

  const titleTd = document.createElement("td");
  const titleInput = document.createElement("input");
  titleInput.id = "followupQuickTitle";
  titleInput.placeholder = "건명 / BL No.";
  titleInput.className = "quick-add-input";
  titleInput.addEventListener("keydown", onEnterOrEsc);
  titleTd.appendChild(titleInput);
  tr.appendChild(titleTd);

  const urgencyTd = document.createElement("td");
  const urgencySel = makeFollowupSelect(FOLLOWUP_URGENCIES, "익일가능");
  urgencySel.id = "followupQuickUrgency";
  urgencySel.className = "quick-add-input";
  urgencyTd.appendChild(urgencySel);
  tr.appendChild(urgencyTd);

  const statusTd = document.createElement("td");
  const statusSel = makeFollowupSelect(FOLLOWUP_STATUSES, "대기");
  statusSel.id = "followupQuickStatus";
  statusSel.className = "quick-add-input";
  statusTd.appendChild(statusSel);
  tr.appendChild(statusTd);

  const nextActionTd = document.createElement("td");
  const nextActionInput = document.createElement("input");
  nextActionInput.id = "followupQuickNextAction";
  nextActionInput.placeholder = "다음 액션";
  nextActionInput.className = "quick-add-input";
  nextActionInput.addEventListener("keydown", onEnterOrEsc);
  nextActionTd.appendChild(nextActionInput);
  tr.appendChild(nextActionTd);

  const followDateTd = document.createElement("td");
  const followDateInput = document.createElement("input");
  followDateInput.type = "date";
  followDateInput.id = "followupQuickFollowDate";
  followDateInput.className = "quick-add-input";
  followDateInput.addEventListener("keydown", onEnterOrEsc);
  followDateTd.appendChild(followDateInput);
  tr.appendChild(followDateTd);

  const ownerTd = document.createElement("td");
  const ownerSel = makeFollowupSelect(["", ...OBL_TEAM_MEMBERS], "");
  ownerSel.id = "followupQuickOwner";
  ownerSel.className = "quick-add-input";
  ownerTd.appendChild(ownerSel);
  tr.appendChild(ownerTd);

  const actionTd = document.createElement("td");
  actionTd.style.whiteSpace = "nowrap";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.style.cssText = "padding:4px 10px;font-size:12px;margin-right:4px;";
  saveBtn.textContent = "✓ 저장";
  saveBtn.onclick = () => saveFollowupQuickAdd();
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn secondary-btn";
  closeBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  closeBtn.textContent = "✕";
  closeBtn.onclick = () => toggleFollowupQuickAdd();
  actionTd.appendChild(saveBtn);
  actionTd.appendChild(closeBtn);
  tr.appendChild(actionTd);

  return tr;
}

async function saveFollowupQuickAdd() {
  const title = (document.getElementById("followupQuickTitle").value || "").trim();
  const registeredDate = document.getElementById("followupQuickDate").value;
  if (!registeredDate) { alert("등록일을 선택해주세요."); return; }
  if (!title) { alert("건명 / BL No.를 입력해주세요."); document.getElementById("followupQuickTitle").focus(); return; }

  const entry = {
    registeredDate,
    customer: (document.getElementById("followupQuickCustomer").value || "").trim(),
    workType: document.getElementById("followupQuickWorkType").value,
    title,
    urgency: document.getElementById("followupQuickUrgency").value,
    status: document.getElementById("followupQuickStatus").value,
    nextAction: (document.getElementById("followupQuickNextAction").value || "").trim(),
    followUpDate: document.getElementById("followupQuickFollowDate").value,
    owner: document.getElementById("followupQuickOwner").value,
    decision: "", memo: "", completedDate: "",
  };
  const result = await submitFollowupToServer(entry);
  if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
  // 저장되면 실시간 구독이 목록을 바로 갱신해주지만, 다음 줄 입력을 위해 필요한 칸만 비워둠 (날짜/업무유형/긴급도/상태/담당은 이어서 쓰기 편하게 유지)
  ["followupQuickCustomer", "followupQuickTitle", "followupQuickNextAction", "followupQuickFollowDate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const first = document.getElementById("followupQuickCustomer");
  if (first) first.focus();
}

/* ---- 등록/수정 모달 ---- */
function openFollowupEditor(existingId) {
  followupDraft = existingId ? Object.assign({}, FOLLOWUP_LIST.find((f) => f.id === existingId)) : {
    id: null,
    registeredDate: new Date().toISOString().slice(0, 10),
    customer: "", workType: "스케줄", title: "", urgency: "익일가능", status: "대기",
    nextAction: "", followUpDate: "", owner: "", decision: "", memo: "", completedDate: "",
  };
  document.getElementById("followupEditTitle").textContent = existingId ? "✏️ 팔로우업 건 수정" : "➕ 팔로우업 건 등록";
  document.getElementById("followupEditOverlay").style.display = "flex";
  renderFollowupEditorBody();
}

function closeFollowupEditor() {
  document.getElementById("followupEditOverlay").style.display = "none";
  followupDraft = null;
}

function makeFollowupField(labelText, inputEl) {
  const wrap = document.createElement("div");
  wrap.appendChild(makeLabel(labelText));
  wrap.appendChild(inputEl);
  return wrap;
}

function makeFollowupSelect(options, value) {
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

function renderFollowupEditorBody() {
  const body = document.getElementById("followupEditBody");
  body.innerHTML = "";
  const d = followupDraft;

  const row1 = document.createElement("div");
  row1.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "poa-date-input";
  dateInput.value = d.registeredDate || "";
  row1.appendChild(makeFollowupField("등록일", dateInput));

  const ownerSel = makeFollowupSelect(["", ...OBL_TEAM_MEMBERS], d.owner);
  row1.appendChild(makeFollowupField("담당", ownerSel));
  body.appendChild(row1);

  const customerInput = document.createElement("input");
  customerInput.placeholder = "예: 효성, EGL, 태웅(한국타이어)";
  customerInput.value = d.customer || "";
  body.appendChild(makeFollowupField("고객/거래처", customerInput));

  const titleInput = document.createElement("textarea");
  titleInput.rows = 2;
  titleInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  titleInput.placeholder = "예: ZIMUSEL71223456 COD 관련";
  titleInput.value = d.title || "";
  body.appendChild(makeFollowupField("건명 / BL No.", titleInput));

  const row2 = document.createElement("div");
  row2.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
  const workTypeSel = makeFollowupSelect(FOLLOWUP_WORK_TYPES, d.workType);
  row2.appendChild(makeFollowupField("업무유형", workTypeSel));
  const urgencySel = makeFollowupSelect(FOLLOWUP_URGENCIES, d.urgency);
  row2.appendChild(makeFollowupField("긴급도", urgencySel));
  const statusSel = makeFollowupSelect(FOLLOWUP_STATUSES, d.status);
  row2.appendChild(makeFollowupField("상태", statusSel));
  body.appendChild(row2);

  const nextActionInput = document.createElement("textarea");
  nextActionInput.rows = 2;
  nextActionInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  nextActionInput.placeholder = "예: 선사 회신 확인 후 고객 안내";
  nextActionInput.value = d.nextAction || "";
  body.appendChild(makeFollowupField("다음 액션", nextActionInput));

  const row3 = document.createElement("div");
  row3.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
  const followDateInput = document.createElement("input");
  followDateInput.type = "date";
  followDateInput.className = "poa-date-input";
  followDateInput.value = d.followUpDate || "";
  row3.appendChild(makeFollowupField("후속조치일", followDateInput));
  const decisionSel = makeFollowupSelect(["", ...FOLLOWUP_DECISIONS], d.decision);
  row3.appendChild(makeFollowupField("판단구분", decisionSel));
  body.appendChild(row3);

  const memoInput = document.createElement("textarea");
  memoInput.rows = 4;
  memoInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  memoInput.placeholder = "진행 히스토리를 이어서 기록해주세요";
  memoInput.value = d.memo || "";
  body.appendChild(makeFollowupField("메모 / 히스토리", memoInput));

  const completedInput = document.createElement("input");
  completedInput.type = "date";
  completedInput.className = "poa-date-input";
  completedInput.value = d.completedDate || "";
  body.appendChild(makeFollowupField("완료일 (완료 상태일 때만)", completedInput));

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
    };
    if (!entry.registeredDate) { alert("등록일을 선택해주세요."); return; }
    if (!entry.title) { alert("건명 / BL No.를 입력해주세요."); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = entry.id ? await updateFollowupOnServer(entry) : await submitFollowupToServer(entry);
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장하기";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeFollowupEditor();
  };
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn danger-btn";
  deleteBtn.textContent = "🗑️ 삭제";
  deleteBtn.style.display = d.id ? "" : "none";
  deleteBtn.onclick = async () => {
    if (!confirm("이 팔로우업 건을 삭제할까요?")) return;
    const result = await deleteFollowupFromServer(d.id);
    if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeFollowupEditor();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeFollowupEditor();
  actions.appendChild(saveBtn);
  if (d.id) actions.appendChild(deleteBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}
