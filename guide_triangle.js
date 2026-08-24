/* =========================================================================
   🌏 삼국간 (수출 CS) - BL번호별 POP CHARGE / MFST CLOSE / 인보이스 발송요청 /
   송금완료 / POL·POD 인폼 / REMARK 체크리스트
   팔로우업보드/COD와 같은 방식(Firestore)이고, 팀원 누구나 등록·수정·삭제 가능해요.
   ========================================================================= */
const TRIANGLE_COLLECTION = "triangle_trade"; // Firestore 컬렉션 이름

let TRIANGLE_LIST = [];
let triangleUnsubscribe = null;
let triangleDraft = null;
let triangleQuickAddOpen = false;

function triangleDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    blNumber: d.blNumber || "",
    popCharge: d.popCharge || "",
    mfstClose: d.mfstClose || "",
    invoiceRequest: d.invoiceRequest || "",
    remittance: d.remittance || "",
    polPodInform: d.polPodInform || "",
    remark: d.remark || "",
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAtIso || ""),
  };
}

async function submitTriangleToServer(entry) {
  try {
    await window.fbReady;
    const docRef = await window.fbDb.collection(TRIANGLE_COLLECTION).add({
      blNumber: entry.blNumber || "",
      popCharge: entry.popCharge || "",
      mfstClose: entry.mfstClose || "",
      invoiceRequest: entry.invoiceRequest || "",
      remittance: entry.remittance || "",
      polPodInform: entry.polPodInform || "",
      remark: entry.remark || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtIso: new Date().toISOString(),
    });
    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error("삼국간 서버 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function updateTriangleOnServer(entry) {
  try {
    await window.fbReady;
    await window.fbDb.collection(TRIANGLE_COLLECTION).doc(entry.id).update({
      blNumber: entry.blNumber || "",
      popCharge: entry.popCharge || "",
      mfstClose: entry.mfstClose || "",
      invoiceRequest: entry.invoiceRequest || "",
      remittance: entry.remittance || "",
      polPodInform: entry.polPodInform || "",
      remark: entry.remark || "",
    });
    return { ok: true };
  } catch (err) {
    console.error("삼국간 서버 수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteTriangleFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(TRIANGLE_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("삼국간 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function loadTriangleTab(forceRefresh) {
  const wrap = document.getElementById("triangleListWrap");
  if (liveSubscribed.triangle && !forceRefresh) { renderTriangleList(); return; }
  if (forceRefresh && triangleUnsubscribe) { triangleUnsubscribe(); triangleUnsubscribe = null; liveSubscribed.triangle = false; }
  if (wrap && !TRIANGLE_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 삼국간 목록을 불러오는 중이에요...</div>';
  await window.fbReady;
  triangleUnsubscribe = window.fbDb.collection(TRIANGLE_COLLECTION).onSnapshot(
    (snapshot) => {
      TRIANGLE_LIST = snapshot.docs.map((doc) => triangleDocToEntry(doc));
      renderTriangleList();
    },
    (err) => {
      console.error("삼국간 실시간 구독 실패:", err);
      if (wrap && !TRIANGLE_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadTriangleTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.triangle = true;
  liveTabUnsubscribers.triangle = () => { if (triangleUnsubscribe) { triangleUnsubscribe(); triangleUnsubscribe = null; liveSubscribed.triangle = false; } };
}

function triangleCellClass(value) {
  const v = (value || "").trim();
  if (v === "O" || v === "o") return "triangle-cell-badge ok";
  if (!v) return "triangle-cell-badge empty";
  return "triangle-cell-badge note";
}

function renderTriangleList() {
  const wrap = document.getElementById("triangleListWrap");
  if (!wrap) return;
  const qEl = document.getElementById("triangleFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();

  if (TRIANGLE_LIST.length === 0 && !triangleQuickAddOpen) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 삼국간 건이 없어요. 위 "➕ 삼국간 건 등록하기" 버튼으로 첫 건을 등록해보세요.</div>';
    return;
  }

  let list = TRIANGLE_LIST.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (q) {
    list = list.filter((t) => [t.blNumber, t.remark, t.remittance].filter(Boolean).join(" ").toLowerCase().includes(q));
  }

  if (q && list.length === 0 && !triangleQuickAddOpen) {
    wrap.innerHTML = '<div class="empty-state">❌ "' + escapeHtml(qEl.value) + '"는 목록에 없어요.</div>';
    return;
  }

  const table = document.createElement("table");
  table.className = "contacts-table";
  table.innerHTML = "<tr><th>BL번호</th><th>POP CHARGE</th><th>MFST CLOSE</th><th>인보이스 발송요청</th><th>송금 완료</th><th>POL/POD 인폼</th><th>REMARK</th><th></th></tr>";
  if (triangleQuickAddOpen) table.appendChild(buildTriangleQuickAddRow());
  list.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><b>${escapeHtml(t.blNumber || "-")}</b></td>`
      + `<td><span class="${triangleCellClass(t.popCharge)}">${escapeHtml(t.popCharge || "-")}</span></td>`
      + `<td><span class="${triangleCellClass(t.mfstClose)}">${escapeHtml(t.mfstClose || "-")}</span></td>`
      + `<td><span class="${triangleCellClass(t.invoiceRequest)}">${escapeHtml(t.invoiceRequest || "-")}</span></td>`
      + `<td><span class="${triangleCellClass(t.remittance)}">${escapeHtml(t.remittance || "-")}</span></td>`
      + `<td><span class="${triangleCellClass(t.polPodInform)}">${escapeHtml(t.polPodInform || "-")}</span></td>`
      + `<td>${escapeHtml(t.remark || "-")}</td>`
      + `<td><button class="btn secondary-btn" style="padding:4px 10px;font-size:12px;" onclick="openTriangleEditor('${t.id}')">✏️ 수정</button></td>`;
    tr.style.cursor = "pointer";
    tr.onclick = (e) => { if (e.target.tagName !== "BUTTON") openTriangleEditor(t.id); };
    table.appendChild(tr);
  });
  wrap.innerHTML = "";
  wrap.appendChild(table);

  const countInfo = document.createElement("div");
  countInfo.className = "hint";
  countInfo.style.marginTop = "8px";
  countInfo.textContent = "✅ " + list.length + "건 표시됨";
  wrap.appendChild(countInfo);

  const firstInput = document.getElementById("triangleQuickBl");
  if (firstInput) firstInput.focus();
}

/* ---- 엑셀처럼 표 맨 위에 빈 줄 하나 열어서 바로 입력하는 빠른등록 ---- */
function toggleTriangleQuickAdd() {
  triangleQuickAddOpen = !triangleQuickAddOpen;
  renderTriangleList();
}

function buildTriangleQuickAddRow() {
  const tr = document.createElement("tr");
  tr.className = "quick-add-row";

  const mk = (id, placeholder, bold) => {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.id = id;
    input.placeholder = placeholder;
    input.className = "quick-add-input";
    if (bold) input.style.fontWeight = "700";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); saveTriangleQuickAdd(); }
      if (e.key === "Escape") { toggleTriangleQuickAdd(); }
    });
    td.appendChild(input);
    return td;
  };

  tr.appendChild(mk("triangleQuickBl", "BL번호", true));
  tr.appendChild(mk("triangleQuickPop", "예: O"));
  tr.appendChild(mk("triangleQuickMfst", "예: O"));
  tr.appendChild(mk("triangleQuickInvoice", "예: O"));
  tr.appendChild(mk("triangleQuickRemit", "예: O, 신용거래"));
  tr.appendChild(mk("triangleQuickInform", "예: O"));
  tr.appendChild(mk("triangleQuickRemark", "REMARK"));

  const actionTd = document.createElement("td");
  actionTd.style.whiteSpace = "nowrap";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.style.cssText = "padding:4px 10px;font-size:12px;margin-right:4px;";
  saveBtn.textContent = "✓ 저장";
  saveBtn.onclick = () => saveTriangleQuickAdd();
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn secondary-btn";
  closeBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  closeBtn.textContent = "✕";
  closeBtn.onclick = () => toggleTriangleQuickAdd();
  actionTd.appendChild(saveBtn);
  actionTd.appendChild(closeBtn);
  tr.appendChild(actionTd);

  return tr;
}

async function saveTriangleQuickAdd() {
  const blNumber = (document.getElementById("triangleQuickBl").value || "").trim();
  if (!blNumber) { alert("BL번호를 입력해주세요."); document.getElementById("triangleQuickBl").focus(); return; }

  const entry = {
    blNumber,
    popCharge: (document.getElementById("triangleQuickPop").value || "").trim(),
    mfstClose: (document.getElementById("triangleQuickMfst").value || "").trim(),
    invoiceRequest: (document.getElementById("triangleQuickInvoice").value || "").trim(),
    remittance: (document.getElementById("triangleQuickRemit").value || "").trim(),
    polPodInform: (document.getElementById("triangleQuickInform").value || "").trim(),
    remark: (document.getElementById("triangleQuickRemark").value || "").trim(),
  };
  const result = await submitTriangleToServer(entry);
  if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
  ["triangleQuickBl", "triangleQuickPop", "triangleQuickMfst", "triangleQuickInvoice", "triangleQuickRemit", "triangleQuickInform", "triangleQuickRemark"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const first = document.getElementById("triangleQuickBl");
  if (first) first.focus();
}

function openTriangleEditor(existingId) {
  triangleDraft = existingId ? Object.assign({}, TRIANGLE_LIST.find((t) => t.id === existingId)) : {
    id: null, blNumber: "", popCharge: "", mfstClose: "", invoiceRequest: "", remittance: "", polPodInform: "", remark: "",
  };
  document.getElementById("triangleEditTitle").textContent = existingId ? "✏️ 삼국간 건 수정" : "➕ 삼국간 건 등록";
  document.getElementById("triangleEditOverlay").style.display = "flex";
  renderTriangleEditorBody();
}

function closeTriangleEditor() {
  document.getElementById("triangleEditOverlay").style.display = "none";
  triangleDraft = null;
}

/* O / X / 빈칸 셋 중 빠르게 고르고, 그 외 값(신용거래 등)은 직접 입력할 수 있게 텍스트 인풋 + 빠른버튼 조합 */
function makeTriangleStatusField(labelText, value) {
  const wrap = document.createElement("div");
  wrap.appendChild(makeLabel(labelText));
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px;align-items:center;";
  const input = document.createElement("input");
  input.value = value || "";
  input.placeholder = "예: O, 신용거래";
  input.style.flex = "1";
  const oBtn = document.createElement("button");
  oBtn.type = "button";
  oBtn.className = "btn secondary-btn";
  oBtn.style.cssText = "padding:6px 12px;";
  oBtn.textContent = "O";
  oBtn.onclick = () => { input.value = "O"; };
  row.appendChild(input);
  row.appendChild(oBtn);
  wrap.appendChild(row);
  wrap._input = input;
  return wrap;
}

function renderTriangleEditorBody() {
  const body = document.getElementById("triangleEditBody");
  body.innerHTML = "";
  const d = triangleDraft;

  const blInput = document.createElement("input");
  blInput.placeholder = "예: ZIMUPKH003136318";
  blInput.value = d.blNumber || "";
  body.appendChild(makeFollowupField("BL번호", blInput));

  const popField = makeTriangleStatusField("POP CHARGE", d.popCharge);
  body.appendChild(popField);
  const mfstField = makeTriangleStatusField("MFST CLOSE", d.mfstClose);
  body.appendChild(mfstField);
  const invoiceField = makeTriangleStatusField("인보이스 발송요청", d.invoiceRequest);
  body.appendChild(invoiceField);
  const remitField = makeTriangleStatusField("송금 완료", d.remittance);
  body.appendChild(remitField);
  const informField = makeTriangleStatusField("POL/POD 인폼", d.polPodInform);
  body.appendChild(informField);

  const remarkInput = document.createElement("textarea");
  remarkInput.rows = 3;
  remarkInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  remarkInput.placeholder = "참고사항";
  remarkInput.value = d.remark || "";
  body.appendChild(makeFollowupField("REMARK", remarkInput));

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = async () => {
    const entry = {
      id: d.id,
      blNumber: blInput.value.trim(),
      popCharge: popField._input.value.trim(),
      mfstClose: mfstField._input.value.trim(),
      invoiceRequest: invoiceField._input.value.trim(),
      remittance: remitField._input.value.trim(),
      polPodInform: informField._input.value.trim(),
      remark: remarkInput.value.trim(),
    };
    if (!entry.blNumber) { alert("BL번호를 입력해주세요."); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = entry.id ? await updateTriangleOnServer(entry) : await submitTriangleToServer(entry);
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장하기";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeTriangleEditor();
  };
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn danger-btn";
  deleteBtn.textContent = "🗑️ 삭제";
  deleteBtn.style.display = d.id ? "" : "none";
  deleteBtn.onclick = async () => {
    if (!confirm("이 삼국간 건을 삭제할까요?")) return;
    const result = await deleteTriangleFromServer(d.id);
    if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeTriangleEditor();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeTriangleEditor();
  actions.appendChild(saveBtn);
  if (d.id) actions.appendChild(deleteBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}
