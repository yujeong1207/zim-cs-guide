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
let triangleQuickDraft = {}; // 빠른등록 줄에 입력 중이던 값 - 실시간 갱신으로 표가 다시 그려져도 안 날아가게 여기 저장해뒀다가 복원함
let triangleExpandedGroups = new Set(); // 같은 배(VSL)·화주 그룹 중 지금 펼쳐서 보고 있는 그룹의 key 모음 (기본은 전부 접힘)

function triangleGroupKey(vessel, shipper) {
  return (vessel || "").trim() + "‖" + (shipper || "").trim();
}

function triangleDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    blNumber: d.blNumber || "",
    vessel: d.vessel || "",
    shipper: d.shipper || "",
    popCharge: d.popCharge || "",
    mfstClose: d.mfstClose || "",
    invoiceRequest: d.invoiceRequest || "",
    remittance: d.remittance || "",
    polPodInform: d.polPodInform || "",
    remark: d.remark || "",
    doneStatus: d.doneStatus || "progress", // "progress" | "done" - 처리완료 여부 (표에서 회색·취소선으로 표시)
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAtIso || ""),
  };
}

async function submitTriangleToServer(entry) {
  try {
    await window.fbReady;
    const docRef = await window.fbDb.collection(TRIANGLE_COLLECTION).add({
      blNumber: entry.blNumber || "",
      vessel: entry.vessel || "",
      shipper: entry.shipper || "",
      popCharge: entry.popCharge || "",
      mfstClose: entry.mfstClose || "",
      invoiceRequest: entry.invoiceRequest || "",
      remittance: entry.remittance || "",
      polPodInform: entry.polPodInform || "",
      remark: entry.remark || "",
      doneStatus: entry.doneStatus || "progress",
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
      vessel: entry.vessel || "",
      shipper: entry.shipper || "",
      popCharge: entry.popCharge || "",
      mfstClose: entry.mfstClose || "",
      invoiceRequest: entry.invoiceRequest || "",
      remittance: entry.remittance || "",
      polPodInform: entry.polPodInform || "",
      remark: entry.remark || "",
      doneStatus: entry.doneStatus || "progress",
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

/* 표에서 "처리완료"/"진행중" 버튼 한 번 누르면 바로 바뀌게 - 전체 폼 열 필요 없음 */
async function toggleTriangleDoneStatus(id) {
  const item = TRIANGLE_LIST.find((t) => t.id === id);
  if (!item) return;
  const nextStatus = item.doneStatus === "done" ? "progress" : "done";
  try {
    await window.fbReady;
    await window.fbDb.collection(TRIANGLE_COLLECTION).doc(id).update({ doneStatus: nextStatus });
  } catch (err) {
    alert("상태 변경에 실패했어요: " + err);
  }
}

/* 같은 배(VSL)·화주 그룹 헤더를 누르면 접혔다 펼쳐졌다 함 - 여러 그룹을 동시에 펼쳐둘 수 있음 */
function toggleTriangleGroup(key) {
  if (triangleExpandedGroups.has(key)) triangleExpandedGroups.delete(key);
  else triangleExpandedGroups.add(key);
  renderTriangleList();
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

function buildTriangleRow(t, grouped) {
  const isDone = t.doneStatus === "done";
  const tr = document.createElement("tr");
  tr.className = isDone ? "row-done" : "";
  tr.dataset.triangleId = t.id;
  tr.innerHTML = `<td${grouped ? ' style="padding-left:28px;"' : ""}><b>${escapeHtml(t.blNumber || "-")}</b></td>`
    + `<td>${escapeHtml(t.vessel || "-")}</td>`
    + `<td>${escapeHtml(t.shipper || "-")}</td>`
    + `<td><span class="${triangleCellClass(t.popCharge)}">${escapeHtml(t.popCharge || "-")}</span></td>`
    + `<td><span class="${triangleCellClass(t.mfstClose)}">${escapeHtml(t.mfstClose || "-")}</span></td>`
    + `<td><span class="${triangleCellClass(t.invoiceRequest)}">${escapeHtml(t.invoiceRequest || "-")}</span></td>`
    + `<td><span class="${triangleCellClass(t.remittance)}">${escapeHtml(t.remittance || "-")}</span></td>`
    + `<td><span class="${triangleCellClass(t.polPodInform)}">${escapeHtml(t.polPodInform || "-")}</span></td>`
    + `<td>${escapeHtml(t.remark || "-")}</td>`
    + `<td class="no-strike"><span class="${isDone ? "done-badge done" : "done-badge progress"}">${isDone ? "✅ 완료" : "🔄 진행중"}</span></td>`
    + `<td class="no-strike" style="white-space:nowrap;">`
    + `<button class="btn ${isDone ? "secondary-btn" : "generate-btn"}" style="padding:4px 10px;font-size:12px;margin-right:4px;" onclick="event.stopPropagation();toggleTriangleDoneStatus('${t.id}')">${isDone ? "↩️ 되돌리기" : "✅ 처리완료"}</button>`
    + `<button class="btn secondary-btn" style="padding:4px 10px;font-size:12px;" onclick="event.stopPropagation();openTriangleEditor('${t.id}')">✏️ 수정</button>`
    + `</td>`;
  tr.style.cursor = "pointer";
  tr.onclick = (e) => { if (e.target.tagName !== "BUTTON") openTriangleEditor(t.id); };
  return tr;
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
    list = list.filter((t) => [t.blNumber, t.vessel, t.shipper, t.remark, t.remittance].filter(Boolean).join(" ").toLowerCase().includes(q));
  }

  if (q && list.length === 0 && !triangleQuickAddOpen) {
    wrap.innerHTML = '<div class="empty-state">❌ "' + escapeHtml(qEl.value) + '"는 목록에 없어요.</div>';
    return;
  }

  // 같은 배(VSL)+화주 조합이 2건 이상이면 그룹으로 묶어요. 배 이름이 비어있거나 1건뿐이면 그냥 평범한 행으로 보여요.
  const groupCounts = {};
  list.forEach((t) => {
    const vessel = (t.vessel || "").trim();
    if (!vessel) return;
    const key = triangleGroupKey(t.vessel, t.shipper);
    groupCounts[key] = (groupCounts[key] || 0) + 1;
  });

  const table = document.createElement("table");
  table.className = "contacts-table triangle-table sticky-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>BL번호</th><th>VSL</th><th>화주</th><th>POP CHARGE</th><th>MFST CLOSE</th><th>인보이스 발송요청</th><th>송금 완료</th><th>POL/POD 인폼</th><th>REMARK</th><th>처리</th><th></th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  if (triangleQuickAddOpen) tbody.appendChild(buildTriangleQuickAddRow());

  const renderedGroupKeys = new Set();
  list.forEach((t) => {
    const vessel = (t.vessel || "").trim();
    const key = vessel ? triangleGroupKey(t.vessel, t.shipper) : null;
    const groupSize = key ? (groupCounts[key] || 0) : 0;

    if (key && groupSize > 1) {
      if (!renderedGroupKeys.has(key)) {
        renderedGroupKeys.add(key);
        const groupEntries = list.filter((x) => (x.vessel || "").trim() && triangleGroupKey(x.vessel, x.shipper) === key);
        const doneCount = groupEntries.filter((x) => x.doneStatus === "done").length;
        const progressCount = groupEntries.length - doneCount;
        const isExpanded = triangleExpandedGroups.has(key);
        const shipper = (t.shipper || "").trim();
        const headerTr = document.createElement("tr");
        headerTr.innerHTML = `<td colspan="11" class="no-strike" style="cursor:pointer;padding:9px 14px;${progressCount > 0 ? "background:var(--bg-accent,#e6f1fb);" : "background:var(--surface-1,#f4f4f2);"}">`
          + `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">`
          + `<span style="display:flex;align-items:center;gap:8px;font-weight:700;${progressCount > 0 ? "color:var(--text-accent,#0c447c);" : "color:var(--text-secondary,#5f5e5a);"}">`
          + `<span>${isExpanded ? "▾" : "▸"}</span>🚢 ${escapeHtml(vessel)}${shipper ? " · " + escapeHtml(shipper) : ""}`
          + `</span>`
          + `<span style="display:flex;gap:6px;">`
          + (progressCount > 0 ? `<span class="done-badge progress">진행중 ${progressCount}</span>` : "")
          + (doneCount > 0 ? `<span class="done-badge done">완료 ${doneCount}</span>` : "")
          + `</span></div></td>`;
        headerTr.onclick = () => toggleTriangleGroup(key);
        tbody.appendChild(headerTr);
      }
      if (!triangleExpandedGroups.has(key)) return; // 접혀있으면 상세 행은 건너뜀
    }

    tbody.appendChild(buildTriangleRow(t, !!key));
  });
  table.appendChild(tbody);
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

  const mk = (id, placeholder, bold, draftKey) => {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.id = id;
    input.placeholder = placeholder;
    input.className = "quick-add-input";
    if (bold) input.style.fontWeight = "700";
    if (triangleQuickDraft[draftKey]) input.value = triangleQuickDraft[draftKey]; // 실시간 갱신으로 다시 그려져도 입력하던 값 복원
    input.addEventListener("input", () => { triangleQuickDraft[draftKey] = input.value; });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); saveTriangleQuickAdd(); }
      if (e.key === "Escape") { toggleTriangleQuickAdd(); }
    });
    td.appendChild(input);
    return td;
  };

  tr.appendChild(mk("triangleQuickBl", "BL번호", true, "blNumber"));
  tr.appendChild(mk("triangleQuickVessel", "예: MSC ARIA", false, "vessel"));
  tr.appendChild(mk("triangleQuickShipper", "예: 코오롱", false, "shipper"));
  tr.appendChild(mk("triangleQuickPop", "예: O", false, "popCharge"));
  tr.appendChild(mk("triangleQuickMfst", "예: O", false, "mfstClose"));
  tr.appendChild(mk("triangleQuickInvoice", "예: O", false, "invoiceRequest"));
  tr.appendChild(mk("triangleQuickRemit", "예: O, 신용거래", false, "remittance"));
  tr.appendChild(mk("triangleQuickInform", "예: O", false, "polPodInform"));
  tr.appendChild(mk("triangleQuickRemark", "REMARK", false, "remark"));

  const actionTd = document.createElement("td");
  actionTd.colSpan = 2;
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
  closeBtn.onclick = () => { triangleQuickDraft = {}; toggleTriangleQuickAdd(); }; // ✕는 진짜로 닫는 거니까 기억해둔 값도 같이 지움
  actionTd.appendChild(saveBtn);
  actionTd.appendChild(closeBtn);
  tr.appendChild(actionTd);

  return tr;
}

async function saveTriangleQuickAdd() {
  const blNumber = (document.getElementById("triangleQuickBl").value || "").trim();
  if (!blNumber) { alert("BL번호를 입력해주세요."); document.getElementById("triangleQuickBl").focus(); return; }

  const vessel = (document.getElementById("triangleQuickVessel").value || "").trim();
  const shipper = (document.getElementById("triangleQuickShipper").value || "").trim();
  const entry = {
    blNumber,
    vessel,
    shipper,
    popCharge: (document.getElementById("triangleQuickPop").value || "").trim(),
    mfstClose: (document.getElementById("triangleQuickMfst").value || "").trim(),
    invoiceRequest: (document.getElementById("triangleQuickInvoice").value || "").trim(),
    remittance: (document.getElementById("triangleQuickRemit").value || "").trim(),
    polPodInform: (document.getElementById("triangleQuickInform").value || "").trim(),
    remark: (document.getElementById("triangleQuickRemark").value || "").trim(),
  };
  const result = await submitTriangleToServer(entry);
  if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류") + " - 입력하신 내용은 그대로 남아있으니 다시 저장을 눌러주세요."); return; }
  // 같은 배·화주로 여러 건 이어서 등록하는 경우가 많아서, VSL/화주는 지우지 않고 남겨둬요 (BL번호부터 나머지만 비움)
  triangleQuickDraft = { vessel, shipper };
  if (vessel) triangleExpandedGroups.add(triangleGroupKey(vessel, shipper)); // 방금 등록한 그룹은 바로 확인할 수 있게 펼쳐둠
  ["triangleQuickBl", "triangleQuickPop", "triangleQuickMfst", "triangleQuickInvoice", "triangleQuickRemit", "triangleQuickInform", "triangleQuickRemark"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const first = document.getElementById("triangleQuickBl");
  if (first) first.focus();
}

function openTriangleEditor(existingId) {
  triangleDraft = existingId ? Object.assign({}, TRIANGLE_LIST.find((t) => t.id === existingId)) : {
    id: null, blNumber: "", vessel: "", shipper: "", popCharge: "", mfstClose: "", invoiceRequest: "", remittance: "", polPodInform: "", remark: "", doneStatus: "progress",
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

  const row0 = document.createElement("div");
  row0.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
  const vesselInput = document.createElement("input");
  vesselInput.placeholder = "예: MSC ARIA";
  vesselInput.value = d.vessel || "";
  row0.appendChild(makeFollowupField("VSL(배 이름)", vesselInput));
  const shipperInput = document.createElement("input");
  shipperInput.placeholder = "예: 코오롱";
  shipperInput.value = d.shipper || "";
  row0.appendChild(makeFollowupField("화주", shipperInput));
  body.appendChild(row0);

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
      blNumber: blInput.value.trim(),
      vessel: vesselInput.value.trim(),
      shipper: shipperInput.value.trim(),
      popCharge: popField._input.value.trim(),
      mfstClose: mfstField._input.value.trim(),
      invoiceRequest: invoiceField._input.value.trim(),
      remittance: remitField._input.value.trim(),
      polPodInform: informField._input.value.trim(),
      remark: remarkInput.value.trim(),
      doneStatus: doneSel.value,
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
