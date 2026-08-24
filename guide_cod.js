/* =========================================================================
   💱 COD 현황 (수출 CS) - SHPR / BL# / VSL / COD 전 / COD 후 / 진행상황
   팔로우업보드와 별도 목록으로 관리해요. 위임장/오비엘과 같은 방식(Firestore)이고,
   팀원 누구나 등록·수정·삭제 가능해요.
   ========================================================================= */
const COD_COLLECTION = "cod_list"; // Firestore 컬렉션 이름

let COD_LIST = [];
let codUnsubscribe = null;
let codDraft = null;
let codQuickAddOpen = false;

function codDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    shpr: d.shpr || "",
    blNumber: d.blNumber || "",
    vsl: d.vsl || "",
    codBefore: d.codBefore || "",
    codAfter: d.codAfter || "",
    status: d.status || "",
    doneStatus: d.doneStatus || "progress", // "progress" | "done" - 처리완료 여부 (표에서 회색·취소선으로 표시)
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAtIso || ""),
  };
}

async function submitCodToServer(entry) {
  try {
    await window.fbReady;
    const docRef = await window.fbDb.collection(COD_COLLECTION).add({
      shpr: entry.shpr || "",
      blNumber: entry.blNumber || "",
      vsl: entry.vsl || "",
      codBefore: entry.codBefore || "",
      codAfter: entry.codAfter || "",
      status: entry.status || "",
      doneStatus: entry.doneStatus || "progress",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });
    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error("COD 서버 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function updateCodOnServer(entry) {
  try {
    await window.fbReady;
    await window.fbDb.collection(COD_COLLECTION).doc(entry.id).update({
      shpr: entry.shpr || "",
      blNumber: entry.blNumber || "",
      vsl: entry.vsl || "",
      codBefore: entry.codBefore || "",
      codAfter: entry.codAfter || "",
      status: entry.status || "",
      doneStatus: entry.doneStatus || "progress",
    });
    return { ok: true };
  } catch (err) {
    console.error("COD 서버 수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteCodFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(COD_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("COD 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 표에서 "처리완료"/"진행중" 버튼 한 번 누르면 바로 바뀌게 - 전체 폼 열 필요 없음 */
async function toggleCodDoneStatus(id) {
  const item = COD_LIST.find((c) => c.id === id);
  if (!item) return;
  const nextStatus = item.doneStatus === "done" ? "progress" : "done";
  try {
    await window.fbReady;
    await window.fbDb.collection(COD_COLLECTION).doc(id).update({ doneStatus: nextStatus });
  } catch (err) {
    alert("상태 변경에 실패했어요: " + err);
  }
}

async function loadCodTab(forceRefresh) {
  const wrap = document.getElementById("codListWrap");
  if (liveSubscribed.cod && !forceRefresh) { renderCodList(); return; }
  if (forceRefresh && codUnsubscribe) { codUnsubscribe(); codUnsubscribe = null; liveSubscribed.cod = false; }
  if (wrap && !COD_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 COD 현황을 불러오는 중이에요...</div>';
  await window.fbReady;
  codUnsubscribe = window.fbDb.collection(COD_COLLECTION).onSnapshot(
    (snapshot) => {
      COD_LIST = snapshot.docs.map((doc) => codDocToEntry(doc));
      renderCodList();
    },
    (err) => {
      console.error("COD 실시간 구독 실패:", err);
      if (wrap && !COD_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadCodTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.cod = true;
  liveTabUnsubscribers.cod = () => { if (codUnsubscribe) { codUnsubscribe(); codUnsubscribe = null; liveSubscribed.cod = false; } };
}

function renderCodList() {
  const wrap = document.getElementById("codListWrap");
  if (!wrap) return;
  const qEl = document.getElementById("codFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();

  if (COD_LIST.length === 0 && !codQuickAddOpen) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 COD 건이 없어요. 위 "➕ COD 건 등록하기" 버튼으로 첫 건을 등록해보세요.</div>';
    return;
  }

  let list = COD_LIST.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (q) {
    list = list.filter((c) => [c.shpr, c.blNumber, c.vsl, c.codBefore, c.codAfter, c.status].filter(Boolean).join(" ").toLowerCase().includes(q));
  }

  if (q && list.length === 0 && !codQuickAddOpen) {
    wrap.innerHTML = '<div class="empty-state">❌ "' + escapeHtml(qEl.value) + '"는 목록에 없어요.</div>';
    return;
  }

  const table = document.createElement("table");
  table.className = "contacts-table cod-table sticky-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>SHPR</th><th>BL#</th><th>VSL</th><th>COD 전</th><th>COD 후</th><th>진행 상황</th><th>처리</th><th></th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  if (codQuickAddOpen) tbody.appendChild(buildCodQuickAddRow());
  list.forEach((c) => {
    const isDone = c.doneStatus === "done";
    const tr = document.createElement("tr");
    if (isDone) tr.className = "row-done";
    tr.innerHTML = `<td>${escapeHtml(c.shpr || "-")}</td>`
      + `<td>${escapeHtml(c.blNumber || "-")}</td>`
      + `<td>${escapeHtml(c.vsl || "-")}</td>`
      + `<td>${escapeHtml(c.codBefore || "-")}</td>`
      + `<td>${escapeHtml(c.codAfter || "-")}</td>`
      + `<td>${escapeHtml(c.status || "-")}</td>`
      + `<td class="no-strike"><span class="${isDone ? "done-badge done" : "done-badge progress"}">${isDone ? "✅ 완료" : "🔄 진행중"}</span></td>`
      + `<td class="no-strike" style="white-space:nowrap;">`
      + `<button class="btn ${isDone ? "secondary-btn" : "generate-btn"}" style="padding:4px 10px;font-size:12px;margin-right:4px;" onclick="event.stopPropagation();toggleCodDoneStatus('${c.id}')">${isDone ? "↩️ 되돌리기" : "✅ 처리완료"}</button>`
      + `<button class="btn secondary-btn" style="padding:4px 10px;font-size:12px;" onclick="event.stopPropagation();openCodEditor('${c.id}')">✏️ 수정</button>`
      + `</td>`;
    tr.style.cursor = "pointer";
    tr.onclick = (e) => { if (e.target.tagName !== "BUTTON") openCodEditor(c.id); };
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);

  const countInfo = document.createElement("div");
  countInfo.className = "hint";
  countInfo.style.marginTop = "8px";
  countInfo.textContent = "✅ " + list.length + "건 표시됨";
  wrap.appendChild(countInfo);

  const firstInput = document.getElementById("codQuickShpr");
  if (firstInput) firstInput.focus();
}

/* ---- 엑셀처럼 표 맨 위에 빈 줄 하나 열어서 바로 입력하는 빠른등록 ---- */
function toggleCodQuickAdd() {
  codQuickAddOpen = !codQuickAddOpen;
  renderCodList();
}

function buildCodQuickAddRow() {
  const tr = document.createElement("tr");
  tr.className = "quick-add-row";

  const mk = (id, placeholder) => {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.id = id;
    input.placeholder = placeholder;
    input.className = "quick-add-input";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); saveCodQuickAdd(); }
      if (e.key === "Escape") { toggleCodQuickAdd(); }
    });
    td.appendChild(input);
    return td;
  };

  tr.appendChild(mk("codQuickShpr", "SHPR"));
  tr.appendChild(mk("codQuickBl", "BL#"));
  tr.appendChild(mk("codQuickVsl", "VSL"));
  tr.appendChild(mk("codQuickBefore", "USSAV"));
  tr.appendChild(mk("codQuickAfter", "USCHS"));
  tr.appendChild(mk("codQuickStatus", "진행 상황"));

  const actionTd = document.createElement("td");
  actionTd.colSpan = 2;
  actionTd.style.whiteSpace = "nowrap";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.style.cssText = "padding:4px 10px;font-size:12px;margin-right:4px;";
  saveBtn.textContent = "✓ 저장";
  saveBtn.onclick = () => saveCodQuickAdd();
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn secondary-btn";
  closeBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  closeBtn.textContent = "✕";
  closeBtn.onclick = () => toggleCodQuickAdd();
  actionTd.appendChild(saveBtn);
  actionTd.appendChild(closeBtn);
  tr.appendChild(actionTd);

  return tr;
}

async function saveCodQuickAdd() {
  const shpr = (document.getElementById("codQuickShpr").value || "").trim();
  const blNumber = (document.getElementById("codQuickBl").value || "").trim();
  if (!shpr) { alert("SHPR을 입력해주세요."); document.getElementById("codQuickShpr").focus(); return; }
  if (!blNumber) { alert("BL#을 입력해주세요."); document.getElementById("codQuickBl").focus(); return; }

  const entry = {
    shpr, blNumber,
    vsl: (document.getElementById("codQuickVsl").value || "").trim(),
    codBefore: (document.getElementById("codQuickBefore").value || "").trim(),
    codAfter: (document.getElementById("codQuickAfter").value || "").trim(),
    status: (document.getElementById("codQuickStatus").value || "").trim(),
  };
  const result = await submitCodToServer(entry);
  if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
  // 저장되면 실시간 구독이 목록을 바로 갱신해주지만, 입력칸은 즉시 비워서 바로 다음 줄 입력 가능하게
  ["codQuickShpr", "codQuickBl", "codQuickVsl", "codQuickBefore", "codQuickAfter", "codQuickStatus"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const first = document.getElementById("codQuickShpr");
  if (first) first.focus();
}

function openCodEditor(existingId) {
  codDraft = existingId ? Object.assign({}, COD_LIST.find((c) => c.id === existingId)) : {
    id: null, shpr: "", blNumber: "", vsl: "", codBefore: "", codAfter: "", status: "", doneStatus: "progress",
  };
  document.getElementById("codEditTitle").textContent = existingId ? "✏️ COD 건 수정" : "➕ COD 건 등록";
  document.getElementById("codEditOverlay").style.display = "flex";
  renderCodEditorBody();
}

function closeCodEditor() {
  document.getElementById("codEditOverlay").style.display = "none";
  codDraft = null;
}

function renderCodEditorBody() {
  const body = document.getElementById("codEditBody");
  body.innerHTML = "";
  const d = codDraft;

  const shprInput = document.createElement("input");
  shprInput.placeholder = "예: UNICO";
  shprInput.value = d.shpr || "";
  body.appendChild(makeFollowupField("SHPR", shprInput));

  const blInput = document.createElement("input");
  blInput.placeholder = "예: ZIMUSEL71223456";
  blInput.value = d.blNumber || "";
  body.appendChild(makeFollowupField("BL#", blInput));

  const vslInput = document.createElement("input");
  vslInput.placeholder = "예: ZS9 10E";
  vslInput.value = d.vsl || "";
  body.appendChild(makeFollowupField("VSL", vslInput));

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
  const beforeInput = document.createElement("input");
  beforeInput.placeholder = "예: USSAV";
  beforeInput.value = d.codBefore || "";
  row.appendChild(makeFollowupField("COD 전 (원래 POD)", beforeInput));
  const afterInput = document.createElement("input");
  afterInput.placeholder = "예: USCHS";
  afterInput.value = d.codAfter || "";
  row.appendChild(makeFollowupField("COD 후 (변경 POD)", afterInput));
  body.appendChild(row);

  const statusInput = document.createElement("textarea");
  statusInput.rows = 3;
  statusInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  statusInput.placeholder = "예: COD 가능여부 및 운임 안내 완료, 화주 회신 대기중";
  statusInput.value = d.status || "";
  body.appendChild(makeFollowupField("진행 상황", statusInput));

  const doneSel = makeFollowupSelect(["progress", "done"], d.doneStatus || "progress");
  Array.from(doneSel.options).forEach((o) => { o.textContent = o.value === "done" ? "✅ 처리완료" : "🔄 진행중"; });
  body.appendChild(makeFollowupField("처리 상태", doneSel));

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = async () => {
    const entry = {
      id: d.id,
      shpr: shprInput.value.trim(),
      blNumber: blInput.value.trim(),
      vsl: vslInput.value.trim(),
      codBefore: beforeInput.value.trim(),
      codAfter: afterInput.value.trim(),
      status: statusInput.value.trim(),
      doneStatus: doneSel.value,
    };
    if (!entry.shpr) { alert("SHPR을 입력해주세요."); return; }
    if (!entry.blNumber) { alert("BL#을 입력해주세요."); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = entry.id ? await updateCodOnServer(entry) : await submitCodToServer(entry);
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장하기";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeCodEditor();
  };
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn danger-btn";
  deleteBtn.textContent = "🗑️ 삭제";
  deleteBtn.style.display = d.id ? "" : "none";
  deleteBtn.onclick = async () => {
    if (!confirm("이 COD 건을 삭제할까요?")) return;
    const result = await deleteCodFromServer(d.id);
    if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeCodEditor();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeCodEditor();
  actions.appendChild(saveBtn);
  if (d.id) actions.appendChild(deleteBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}
