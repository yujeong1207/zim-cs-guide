/* =========================================================================
   📚 케이스 공유 (수입 CS) - 수출 케이스 공유(guide_case_share.js)와 완전히 같은 구조,
   완전히 별도의 컬렉션(case_share_import)을 써서 수출/수입 사례가 안 섞여요.
   유형에 "세관정정"이 들어가는 것만 수출 버전과 달라요.
   ========================================================================= */
const CASE_SHARE_IMPORT_COLLECTION = "case_share_import"; // Firestore 컬렉션 이름

let CASE_SHARE_IMPORT_LIST = [];
let caseShareImportUnsubscribe = null;
let caseShareImportDraft = null; // 지금 편집중인 케이스 (없으면 새 케이스)
let caseShareImportExpanded = new Set(); // 본문을 펼쳐서 보고 있는 카드 id 모음

const CASE_SHARE_IMPORT_CATEGORIES = ["스케줄", "세관정정", "정산/비용", "클레임", "통관/서류", "기타"];

/* Firestore에서 케이스 전체 목록을 가져온다 (최초 1회, onSnapshot 실패시 폴백용) */
async function fetchCaseShareImportListFromServer() {
  try {
    await window.fbReady;
    const snapshot = await window.fbDb.collection(CASE_SHARE_IMPORT_COLLECTION).get();
    return snapshot.docs.map((doc) => caseShareImportDocToEntry(doc));
  } catch (err) {
    console.error("케이스 공유 서버 목록 불러오기 실패:", err);
    return null;
  }
}

function caseShareImportDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    caseDate: d.caseDate || "",
    title: d.title || "",
    category: d.category || "기타",
    body: d.body || "",
    author: d.author || "",
    pinned: d.pinned === true,
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAtIso || ""),
    updatedAt: d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : (d.updatedAtIso || ""),
  };
}

/* Firestore에 새 케이스를 등록한다 */
async function submitCaseShareImportToServer(entry) {
  try {
    await window.fbReady;
    const nowIso = new Date().toISOString();
    const docRef = await window.fbDb.collection(CASE_SHARE_IMPORT_COLLECTION).add({
      caseDate: entry.caseDate || "",
      title: entry.title || "",
      category: entry.category || "기타",
      body: entry.body || "",
      author: entry.author || "",
      pinned: entry.pinned === true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error("케이스 공유 서버 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 기존 케이스 수정 (id로 찾아서 덮어씀) */
async function updateCaseShareImportOnServer(entry) {
  try {
    await window.fbReady;
    await window.fbDb.collection(CASE_SHARE_IMPORT_COLLECTION).doc(entry.id).update({
      caseDate: entry.caseDate || "",
      title: entry.title || "",
      category: entry.category || "기타",
      body: entry.body || "",
      author: entry.author || "",
      pinned: entry.pinned === true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtIso: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    console.error("케이스 공유 서버 수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteCaseShareImportFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(CASE_SHARE_IMPORT_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("케이스 공유 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 중요한 케이스는 맨 위에 고정 - 다시 누르면 고정 해제 */
async function toggleCaseShareImportPinned(id) {
  const item = CASE_SHARE_IMPORT_LIST.find((c) => c.id === id);
  if (!item) return;
  try {
    await window.fbReady;
    await window.fbDb.collection(CASE_SHARE_IMPORT_COLLECTION).doc(id).update({ pinned: !item.pinned });
  } catch (err) {
    alert("고정 상태 변경에 실패했어요: " + err);
  }
}

/* 탭을 열 때 호출 - 처음 한 번만 실시간 구독 시작, 팀원 누가 작성/수정/삭제하면 자동 반영.
   forceRefresh=true(새로고침 버튼)일 때만 구독을 끊고 다시 읽어옴. */
async function loadCaseShareImportTab(forceRefresh) {
  const wrap = document.getElementById("caseShareImportListWrap");
  if (liveSubscribed.caseShareImport && !forceRefresh) { renderCaseShareImportList(); return; }
  if (forceRefresh && caseShareImportUnsubscribe) { caseShareImportUnsubscribe(); caseShareImportUnsubscribe = null; liveSubscribed.caseShareImport = false; }
  if (wrap && !CASE_SHARE_IMPORT_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 케이스 목록을 불러오는 중이에요...</div>';
  await window.fbReady;
  caseShareImportUnsubscribe = window.fbDb.collection(CASE_SHARE_IMPORT_COLLECTION).onSnapshot(
    (snapshot) => {
      CASE_SHARE_IMPORT_LIST = snapshot.docs.map((doc) => caseShareImportDocToEntry(doc));
      renderCaseShareImportList();
    },
    (err) => {
      console.error("케이스 공유 실시간 구독 실패:", err);
      if (wrap && !CASE_SHARE_IMPORT_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadCaseShareImportTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.caseShareImport = true;
  liveTabUnsubscribers.caseShareImport = () => { if (caseShareImportUnsubscribe) { caseShareImportUnsubscribe(); caseShareImportUnsubscribe = null; liveSubscribed.caseShareImport = false; } };
}

function caseShareImportFilteredList() {
  const qEl = document.getElementById("caseShareImportFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();
  const catEl = document.getElementById("caseShareImportCategoryFilter");
  const catFilter = catEl ? catEl.value : "__all";

  let list = CASE_SHARE_IMPORT_LIST.slice();
  if (catFilter && catFilter !== "__all") list = list.filter((c) => c.category === catFilter);
  if (q) {
    list = list.filter((c) => [c.title, c.body, c.author, c.category].filter(Boolean).join(" ").toLowerCase().includes(q));
  }
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ad = a.caseDate || "", bd = b.caseDate || "";
    if (ad !== bd) return bd.localeCompare(ad);
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
  return list;
}

function caseShareImportCategoryBadgeStyle(category) {
  const map = {
    "스케줄": "background:#dbeafe;color:#1e40af;",
    "COD": "background:#dcfce7;color:#166534;",
    "정산/비용": "background:#fef3c7;color:#92400e;",
    "클레임": "background:#fee2e2;color:#991b1b;",
    "통관/서류": "background:#e0e7ff;color:#3730a3;",
    "기타": "background:#f3f4f6;color:#374151;",
  };
  return map[category] || map["기타"];
}

function renderCaseShareImportList() {
  const wrap = document.getElementById("caseShareImportListWrap");
  if (!wrap) return;

  const list = caseShareImportFilteredList();

  if (CASE_SHARE_IMPORT_LIST.length === 0) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 케이스가 없어요. 위 "➕ 케이스 작성하기" 버튼으로 첫 사례를 남겨보세요.</div>';
    return;
  }
  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state">조건에 맞는 케이스가 없어요.</div>';
    return;
  }

  wrap.innerHTML = "";
  const countInfo = document.createElement("div");
  countInfo.className = "hint";
  countInfo.style.marginBottom = "10px";
  countInfo.textContent = "✅ " + list.length + "건 표시됨";
  wrap.appendChild(countInfo);

  list.forEach((c) => wrap.appendChild(buildCaseShareImportCard(c)));
}

function buildCaseShareImportCard(c) {
  const isExpanded = caseShareImportExpanded.has(c.id);
  const card = document.createElement("div");
  card.className = "content-card case-share-card";
  card.dataset.caseShareId = c.id;

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;";

  const titleWrap = document.createElement("div");
  titleWrap.style.cssText = "flex:1;min-width:220px;";
  const titleLine = document.createElement("div");
  titleLine.style.cssText = "font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
  if (c.pinned) {
    const pin = document.createElement("span");
    pin.textContent = "📌";
    titleLine.appendChild(pin);
  }
  const titleText = document.createElement("span");
  titleText.textContent = c.title || "(제목 없음)";
  titleLine.appendChild(titleText);
  const catBadge = document.createElement("span");
  catBadge.className = "no-strike";
  catBadge.style.cssText = "font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:6px;" + caseShareImportCategoryBadgeStyle(c.category);
  catBadge.textContent = c.category || "기타";
  titleLine.appendChild(catBadge);
  titleWrap.appendChild(titleLine);

  const metaLine = document.createElement("div");
  metaLine.className = "hint";
  metaLine.style.marginTop = "4px";
  metaLine.textContent = [c.caseDate, c.author ? "작성: " + c.author : ""].filter(Boolean).join(" · ");
  titleWrap.appendChild(metaLine);

  head.appendChild(titleWrap);

  const actions = document.createElement("div");
  actions.className = "no-strike";
  actions.style.cssText = "display:flex;gap:4px;flex-shrink:0;";
  const pinBtn = document.createElement("button");
  pinBtn.className = "pin-btn" + (c.pinned ? " pinned" : "");
  pinBtn.title = c.pinned ? "고정 해제" : "맨 위에 고정";
  pinBtn.textContent = "📌";
  pinBtn.onclick = (e) => { e.stopPropagation(); toggleCaseShareImportPinned(c.id); };
  const editBtn = document.createElement("button");
  editBtn.className = "btn secondary-btn";
  editBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  editBtn.textContent = "✏️ 수정";
  editBtn.onclick = (e) => { e.stopPropagation(); openCaseShareImportEditor(c.id); };
  actions.appendChild(pinBtn);
  actions.appendChild(editBtn);
  head.appendChild(actions);

  card.appendChild(head);

  const bodyEl = document.createElement("div");
  bodyEl.style.cssText = "margin-top:10px;white-space:pre-wrap;line-height:1.7;font-size:13.5px;color:#374151;"
    + (isExpanded ? "" : "display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;");
  bodyEl.textContent = c.body || "";
  card.appendChild(bodyEl);

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "no-strike";
  toggleBtn.style.cssText = "background:none;border:none;padding:0;margin-top:6px;font-size:12px;color:var(--text-accent,#185fa5);cursor:pointer;";
  toggleBtn.textContent = isExpanded ? "▴ 접기" : "▾ 전체 내용 펼쳐보기";
  toggleBtn.onclick = (e) => {
    e.stopPropagation();
    if (isExpanded) caseShareImportExpanded.delete(c.id); else caseShareImportExpanded.add(c.id);
    renderCaseShareImportList();
  };
  card.appendChild(toggleBtn);

  return card;
}

/* ---- 등록/수정 모달 ---- */
function openCaseShareImportEditor(existingId) {
  caseShareImportDraft = existingId ? Object.assign({}, CASE_SHARE_IMPORT_LIST.find((c) => c.id === existingId)) : {
    id: null,
    caseDate: new Date().toISOString().slice(0, 10),
    title: "", category: "기타", body: "", author: "", pinned: false,
  };
  document.getElementById("caseShareImportEditTitle").textContent = existingId ? "✏️ 케이스 수정" : "📚 케이스 작성하기";
  document.getElementById("caseShareImportEditOverlay").style.display = "flex";
  renderCaseShareImportEditorBody();
}

function closeCaseShareImportEditor() {
  document.getElementById("caseShareImportEditOverlay").style.display = "none";
  caseShareImportDraft = null;
}

function renderCaseShareImportEditorBody() {
  const body = document.getElementById("caseShareImportEditBody");
  body.innerHTML = "";
  const d = caseShareImportDraft;

  const row1 = document.createElement("div");
  row1.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "poa-date-input";
  dateInput.value = d.caseDate || "";
  row1.appendChild(makeFollowupField("날짜", dateInput));

  const authorSel = makeFollowupSelect(["", ...OBL_TEAM_MEMBERS], d.author);
  row1.appendChild(makeFollowupField("작성자", authorSel));

  const categorySel = makeFollowupSelect(CASE_SHARE_IMPORT_CATEGORIES, d.category);
  row1.appendChild(makeFollowupField("유형", categorySel));
  body.appendChild(row1);

  const titleInput = document.createElement("input");
  titleInput.placeholder = "예: 부산항 현장 컨테이너 파손 클레임 대응 사례";
  titleInput.value = d.title || "";
  body.appendChild(makeFollowupField("제목", titleInput));

  const bodyInput = document.createElement("textarea");
  bodyInput.rows = 14;
  bodyInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;line-height:1.6;";
  bodyInput.placeholder = "상황, 대응 과정, 결과, 다음에 비슷한 일이 생기면 참고할 점 등을 자유롭게 길게 적어주세요. 나중에 검색해서 다시 찾아볼 수 있어요.";
  bodyInput.value = d.body || "";
  body.appendChild(makeFollowupField("내용", bodyInput));

  const pinnedLabel = document.createElement("label");
  pinnedLabel.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13.5px;cursor:pointer;";
  const pinnedCheckbox = document.createElement("input");
  pinnedCheckbox.type = "checkbox";
  pinnedCheckbox.checked = d.pinned === true;
  pinnedLabel.appendChild(pinnedCheckbox);
  pinnedLabel.appendChild(document.createTextNode("📌 목록 맨 위에 고정"));
  body.appendChild(pinnedLabel);

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = async () => {
    const entry = {
      id: d.id,
      caseDate: dateInput.value,
      title: titleInput.value.trim(),
      category: categorySel.value,
      body: bodyInput.value.trim(),
      author: authorSel.value,
      pinned: pinnedCheckbox.checked,
    };
    if (!entry.title) { alert("제목을 입력해주세요."); return; }
    if (!entry.body) { alert("내용을 입력해주세요."); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = entry.id ? await updateCaseShareImportOnServer(entry) : await submitCaseShareImportToServer(entry);
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장하기";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeCaseShareImportEditor();
  };
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn danger-btn";
  deleteBtn.textContent = "🗑️ 삭제";
  deleteBtn.style.display = d.id ? "" : "none";
  deleteBtn.onclick = async () => {
    if (!confirm("이 케이스를 삭제할까요? 삭제하면 되돌릴 수 없어요.")) return;
    const result = await deleteCaseShareImportFromServer(d.id);
    if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeCaseShareImportEditor();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeCaseShareImportEditor();
  actions.appendChild(saveBtn);
  if (d.id) actions.appendChild(deleteBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}
