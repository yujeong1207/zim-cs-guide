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
let triangleExpandedGroups = new Set(); // 직접 펼친 그룹의 key 모음
let triangleCollapsedGroups = new Set(); // 직접 접은 그룹의 key 모음 (직접 누르기 전에는 "진행중인 건이 있는 그룹은 펼침, 전부 완료된 그룹은 접힘")
let triangleChipFilter = null; // 위 요약 칩으로 거는 필터: "check"(확인중) | "remit"(송금 대기) | "novsl"(배 미입력) | null
let triangleHideDone = false; // "완료 건 숨기기"
let triangleSelectedIds = new Set(); // 체크박스로 선택한 건들의 id - "BL번호 복사" 등에 씀

/* BL번호 안의 숫자를 뽑아 오름차순 정렬할 때 씀 (같은 그룹 안에서 번호 작은 게 위로 오게) */
function triangleBlSortNum(bl) {
  const m = /\d+/.exec(String(bl || ""));
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}
function triangleCompareByBl(a, b) {
  const na = triangleBlSortNum(a.blNumber), nb = triangleBlSortNum(b.blNumber);
  if (na !== nb) return na - nb;
  return String(a.blNumber || "").localeCompare(String(b.blNumber || ""));
}

/* 그룹 안에서: 2ND VSL이 있는 건을 먼저 모아서 보여주고(나중에 따로 운임지불 메시지를 보내야 하니까), 그 안에서는 BL번호 오름차순 */
function triangleCompareGrouped(a, b) {
  const ha = (a.secondVessel || "").trim() ? 0 : 1;
  const hb = (b.secondVessel || "").trim() ? 0 : 1;
  if (ha !== hb) return ha - hb;
  return triangleCompareByBl(a, b);
}

function triangleGroupKey(vessel, shipper) {
  // "wu xiang 76"과 "WU XIANG 76"처럼 대소문자·띄어쓰기만 다른 건 같은 배로 취급
  const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toUpperCase();
  return norm(vessel) + "‖" + norm(shipper);
}

/* 이 건이 속할 그룹 key (배·화주가 둘 다 비어있으면 묶을 수 없으니 null) - 배가 비어있으면 같은 화주끼리 묶임 */
function triangleEntryGroupKey(t) {
  if (!(t.vessel || "").trim() && !(t.shipper || "").trim()) return null;
  return triangleGroupKey(t.vessel, t.shipper);
}

/* =========================================================================
   단계 상태 판정
   O = 완료 / X = 해당 없음 / 빈칸 = 아직 안 함(대기) / CHECKING·"발생되어야함" 등 = 확인중
   송금 완료 칸의 "신용"(신용거래)은 송금 체크가 필요 없으니 X와 같은 "해당 없음"
   ========================================================================= */
const TRIANGLE_STEPS = [
  { key: "popCharge", name: "POP CHARGE", short: "POP" },
  { key: "mfstClose", name: "MFST CLOSE", short: "MFST" },
  { key: "invoiceRequest", name: "인보이스 발송요청", short: "인보이스" },
  { key: "remittance", name: "송금 완료", short: "송금", creditIsNa: true },
  { key: "polPodInform", name: "POL/POD 인폼", short: "POL/POD" },
];
const TRIANGLE_REMIT_IDX = 3;

function triangleStepState(step, value) {
  const raw = (value || "").trim();
  const v = raw.toUpperCase();
  if (!raw) return { kind: "wait", label: "대기", raw };
  if (v === "O") return { kind: "done", label: "완료", raw };
  if (v === "X") return { kind: "na", label: "—", raw };
  if (step.creditIsNa && raw.indexOf("신용") !== -1) return { kind: "na", label: "신용", raw };
  if (v === "CHECKING" || raw.indexOf("확인") !== -1 || raw.indexOf("발생") !== -1) return { kind: "check", label: "확인중", raw };
  // 그 외에 직접 적은 글자는 "확인이 필요한 메모"로 보고 눈에 띄게 원문 그대로 보여줌
  return { kind: "check", label: raw.length > 6 ? raw.slice(0, 6) + "…" : raw, raw };
}

function triangleEntryInfo(t) {
  const states = TRIANGLE_STEPS.map((s) => triangleStepState(s, t[s.key]));
  let total = 0, done = 0, next = null;
  states.forEach((st, i) => {
    if (st.kind === "na") return;
    total++;
    if (st.kind === "done") done++;
    else if (!next) next = { step: TRIANGLE_STEPS[i], kind: st.kind };
  });
  return { states, total, done, next };
}

function triangleProgressHtml(t, info) {
  if (t.doneStatus === "done") return '<span class="done-badge done">✅ 완료</span>';
  if (info.total === 0) return '<span class="tri-next">해당 없음</span>';
  if (!info.next) return '<span class="tri-progress-count">' + info.done + "/" + info.total + '</span><span class="tri-next-all">모두 완료</span>';
  const label = (info.next.kind === "check" ? "확인중 · " : "다음 · ") + info.next.step.short;
  return '<span class="tri-progress-count">' + info.done + "/" + info.total + '</span><span class="tri-next tri-next-' + info.next.kind + '">' + escapeHtml(label) + "</span>";
}

/* "2026-09-21" → "9/21" (요일은 표시하지 않음) */
function triangleFormatDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!m) return str || "";
  return Number(m[2]) + "/" + Number(m[3]);
}

function triangleDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    blNumber: d.blNumber || "",
    vessel: d.vessel || "",
    shipper: d.shipper || "",
    onboardDate: d.onboardDate || "", // 온보드 날짜 "YYYY-MM-DD"
    secondVessel: d.secondVessel || "", // 2ND VSL - 같은 배·화주 그룹 전체 공통 (미국행 등 2차 선적)
    groupRemark: d.groupRemark || "",   // 그룹 공통 REMARK - 같은 배·화주 그룹 전체 공통
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
      onboardDate: entry.onboardDate || "",
      secondVessel: entry.secondVessel || "",
      groupRemark: entry.groupRemark || "",
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
      onboardDate: entry.onboardDate || "",
      secondVessel: entry.secondVessel || "",
      groupRemark: entry.groupRemark || "",
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

/* "여러 BL 한번에 등록" 저장: 같은 값(common)에 BL번호만 다르게 해서 한 번에 여러 건을 만듦 (Firestore batch) */
async function submitTriangleBulk(common, blNumbers) {
  try {
    await window.fbReady;
    const batch = window.fbDb.batch();
    const nowIso = new Date().toISOString();
    blNumbers.forEach((bl) => {
      const ref = window.fbDb.collection(TRIANGLE_COLLECTION).doc();
      batch.set(ref, Object.assign({}, common, {
        blNumber: bl,
        doneStatus: common.doneStatus || "progress",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAtIso: nowIso,
      }));
    });
    await batch.commit();
    return { ok: true };
  } catch (err) {
    console.error("삼국간 일괄 등록 실패:", err);
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
  const hasPending = TRIANGLE_LIST.some((t) => triangleEntryGroupKey(t) === key && t.doneStatus !== "done");
  const isOpen = triangleExpandedGroups.has(key) || (hasPending && !triangleCollapsedGroups.has(key));
  if (isOpen) { triangleExpandedGroups.delete(key); triangleCollapsedGroups.add(key); }
  else { triangleCollapsedGroups.delete(key); triangleExpandedGroups.add(key); }
  renderTriangleList();
}

/* ---- 그룹(같은 배·화주) 전체에 공통으로 적용되는 2ND VSL · REMARK 수정 ---- */
let triangleGroupEditKey = null;

function openTriangleGroupEditor(key) {
  triangleGroupEditKey = key;
  document.getElementById("triangleGroupEditOverlay").style.display = "flex";
  renderTriangleGroupEditorBody();
}

function closeTriangleGroupEditor() {
  document.getElementById("triangleGroupEditOverlay").style.display = "none";
  triangleGroupEditKey = null;
}

function renderTriangleGroupEditorBody() {
  const body = document.getElementById("triangleGroupEditBody");
  body.innerHTML = "";
  const entries = TRIANGLE_LIST.filter((t) => triangleEntryGroupKey(t) === triangleGroupEditKey);
  const vessel = (entries[0] && entries[0].vessel) || "";
  const shipper = (entries[0] && entries[0].shipper) || "";

  const info = document.createElement("div");
  info.className = "hint";
  info.style.marginBottom = "10px";
  info.textContent = "🚢 " + (vessel || "배 미입력") + (shipper ? " · " + shipper : "") + " · 이 그룹 " + entries.length + "건 전체에 적용돼요";
  body.appendChild(info);

  const remarkInput = document.createElement("textarea");
  remarkInput.rows = 3;
  remarkInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  remarkInput.placeholder = "이 배·화주 전체에 공통으로 적용되는 메모 (건별 REMARK와는 별개예요)";
  remarkInput.value = (entries.find((e) => (e.groupRemark || "").trim()) || {}).groupRemark || "";
  body.appendChild(makeFollowupField("그룹 공통 REMARK", remarkInput));

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = await applyTriangleGroupFields(entries.map((e) => e.id), remarkInput.value.trim());
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장하기";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeTriangleGroupEditor();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeTriangleGroupEditor();
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}

/* 그룹에 속한 모든 건에 그룹 공통 REMARK를 한 번에 반영 (Firestore batch). 2ND VSL은 건마다 다를 수 있어서 여기서 다루지 않음 */
async function applyTriangleGroupFields(ids, groupRemark) {
  if (!ids.length) return { ok: true };
  try {
    await window.fbReady;
    const batch = window.fbDb.batch();
    ids.forEach((id) => {
      batch.update(window.fbDb.collection(TRIANGLE_COLLECTION).doc(id), { groupRemark });
    });
    await batch.commit();
    return { ok: true };
  } catch (err) {
    console.error("그룹 정보 저장 실패:", err);
    return { ok: false, error: String(err) };
  }
}

function triangleMatchesChip(t, chip) {
  const info = triangleEntryInfo(t);
  if (chip === "check") return info.states.some((s) => s.kind === "check");
  if (chip === "remit") return info.states[TRIANGLE_REMIT_IDX].kind === "wait";
  if (chip === "novsl") return !(t.vessel || "").trim();
  if (chip === "second") return !!(t.secondVessel || "").trim();
  return true;
}

function setTriangleChipFilter(chip) {
  triangleChipFilter = triangleChipFilter === chip ? null : chip;
  renderTriangleList();
}

function toggleTriangleHideDone() {
  triangleHideDone = !triangleHideDone;
  renderTriangleList();
}

/* ---- 체크박스로 선택해서 BL번호 복사하기 (엑셀처럼 원하는 건만 골라서 복사) ---- */
function toggleTriangleRowSelect(id) {
  if (triangleSelectedIds.has(id)) triangleSelectedIds.delete(id);
  else triangleSelectedIds.add(id);
  renderTriangleList();
}

function toggleTriangleGroupSelectAll(key) {
  const ids = TRIANGLE_LIST.filter((t) => triangleEntryGroupKey(t) === key).map((t) => t.id);
  const allSelected = ids.length > 0 && ids.every((id) => triangleSelectedIds.has(id));
  ids.forEach((id) => { if (allSelected) triangleSelectedIds.delete(id); else triangleSelectedIds.add(id); });
  renderTriangleList();
}

function clearTriangleSelection() {
  triangleSelectedIds.clear();
  renderTriangleList();
}

function copySelectedTriangleBls() {
  const selected = TRIANGLE_LIST.filter((t) => triangleSelectedIds.has(t.id)).sort(triangleCompareByBl);
  if (selected.length === 0) return;
  const text = selected.map((t) => t.blNumber || "").filter(Boolean).join("\n");
  const okText = "BL번호 " + selected.length + "건 복사 완료 📋 (엑셀 등에 그대로 붙여넣을 수 있어요)";
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => alert(okText)).catch(() => legacyCopy(text));
  } else {
    legacyCopy(text);
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

function buildTriangleRow(t, grouped, isLastInGroup, isFirstAfter2nd) {
  const isDone = t.doneStatus === "done";
  const info = triangleEntryInfo(t);
  const tr = document.createElement("tr");
  tr.className = (isDone ? "row-done" : "") + (isLastInGroup ? " tri-group-last" : "") + (isFirstAfter2nd ? " tri-2nd-divider" : "");
  tr.dataset.triangleId = t.id;

  const stepCells = info.states.map((st0) => {
    // 이미 처리완료된 건은 빈칸이 "대기"로 보이면 헷갈리니까 흐린 "—"로
    const st = (isDone && st0.kind === "wait") ? { kind: "na", label: "—", raw: "" } : st0;
    return '<td class="no-strike tri-step-cell"><span class="tri-pill ' + st.kind + '"' + (st.raw ? ' title="' + escapeHtml(st.raw) + '"' : "") + ">" + escapeHtml(st.label) + "</span></td>";
  }).join("");

  const checked = triangleSelectedIds.has(t.id);
  tr.innerHTML = `<td class="no-strike"><input type="checkbox" class="tri-select-box" onclick="event.stopPropagation();toggleTriangleRowSelect('${t.id}')"${checked ? " checked" : ""}></td>`
    + `<td${grouped ? ' style="padding-left:16px;"' : ""}><b>${escapeHtml(t.blNumber || "-")}</b></td>`
    + `<td>${escapeHtml(t.vessel || "-")}${t.secondVessel ? '<div class="tri-2nd-row">2ND ' + escapeHtml(t.secondVessel) + '</div>' : ""}</td>`
    + `<td>${escapeHtml(t.shipper || "-")}</td>`
    + `<td style="white-space:nowrap;">${t.onboardDate ? escapeHtml(triangleFormatDate(t.onboardDate)) : "-"}</td>`
    + stepCells
    + `<td class="no-strike">${triangleProgressHtml(t, info)}</td>`
    + `<td>${escapeHtml(t.remark || "-")}</td>`
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

  const sorted = TRIANGLE_LIST.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  // 위 요약 칩 숫자 - 검색/필터와 상관없이 "진행중인 전체 건" 기준
  const counts = { check: 0, remit: 0, novsl: 0, second: 0 };
  sorted.filter((t) => t.doneStatus !== "done").forEach((t) => {
    ["check", "remit", "novsl", "second"].forEach((c) => { if (triangleMatchesChip(t, c)) counts[c]++; });
  });

  let list = sorted;
  if (q) {
    list = list.filter((t) => [t.blNumber, t.vessel, t.shipper, t.secondVessel, t.remark, t.remittance, t.onboardDate].filter(Boolean).join(" ").toLowerCase().includes(q));
  }
  if (triangleChipFilter) list = list.filter((t) => t.doneStatus !== "done" && triangleMatchesChip(t, triangleChipFilter));
  if (triangleHideDone) list = list.filter((t) => t.doneStatus !== "done");

  wrap.innerHTML = "";

  // ---- 요약 칩 + 범례 ----
  const chipBtn = (cls, key, label, n) =>
    '<button type="button" class="tri-chip ' + cls + (triangleChipFilter === key ? " active" : "") + '" onclick="setTriangleChipFilter(\'' + key + '\')">' + label + '<span class="n">' + n + "</span></button>";
  const bar = document.createElement("div");
  bar.className = "tri-bar";
  bar.innerHTML = chipBtn("check", "check", "확인중", counts.check)
    + chipBtn("remit", "remit", "송금 대기", counts.remit)
    + chipBtn("novsl", "novsl", "배 미입력", counts.novsl)
    + chipBtn("second", "second", "2ND 배 있음", counts.second)
    + '<button type="button" class="tri-chip' + (triangleHideDone ? " active" : "") + '" onclick="toggleTriangleHideDone()">완료 건 숨기기</button>';
  wrap.appendChild(bar);

  const legend = document.createElement("div");
  legend.className = "tri-legend";
  legend.innerHTML = '<span class="tri-pill done">완료</span><span>O</span>'
    + '<span class="tri-pill na">—</span><span>X, 해당 없음</span>'
    + '<span class="tri-pill wait">대기</span><span>빈칸, 아직 안 함</span>'
    + '<span class="tri-pill check">확인중</span><span>CHECKING</span>'
    + '<span class="tri-pill na">신용</span><span>송금 칸의 신용거래 (송금 체크 불필요)</span>';
  wrap.appendChild(legend);

  if (triangleSelectedIds.size > 0) {
    const selBar = document.createElement("div");
    selBar.className = "tri-select-bar";
    selBar.innerHTML = '<span>☑️ ' + triangleSelectedIds.size + '건 선택됨</span>'
      + '<button type="button" class="btn generate-btn" style="padding:5px 12px;font-size:12.5px;" onclick="copySelectedTriangleBls()">📋 BL번호 복사</button>'
      + '<button type="button" class="btn secondary-btn" style="padding:5px 12px;font-size:12.5px;" onclick="clearTriangleSelection()">선택 해제</button>';
    wrap.appendChild(selBar);
  }

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = q ? '❌ "' + (qEl ? qEl.value : "") + '"는 목록에 없어요.' : "조건에 맞는 건이 없어요.";
    if (!triangleQuickAddOpen) { wrap.appendChild(empty); return; }
  }

  // 같은 배(VSL)+화주가 2건 이상이면 그룹으로 묶어요. 배가 비어있는 건은 같은 화주끼리 묶어요. 1건뿐이면 그냥 행으로 보여요.
  const groupCounts = {};
  list.forEach((t) => {
    const key = triangleEntryGroupKey(t);
    if (key) groupCounts[key] = (groupCounts[key] || 0) + 1;
  });

  const table = document.createElement("table");
  table.className = "contacts-table triangle-table sticky-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th></th><th>BL번호</th><th>VSL</th><th>화주</th><th>온보드</th><th>POP CHARGE</th><th>MFST CLOSE</th><th title=\"인보이스 발송요청\">인보이스요청</th><th>송금 완료</th><th>POL/POD 인폼</th><th>진행 · 다음 할 일</th><th>REMARK</th><th></th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  if (triangleQuickAddOpen) tbody.appendChild(buildTriangleQuickAddRow());

  // 블록 단위로 그림: 그룹은 헤더 하나 + BL번호 오름차순으로 정렬한 상세 행들을 통째로, 그룹이 아닌 단일 건은 그 자리에 바로.
  // (그룹이 처음 등장하는 위치는 기존처럼 list 순서를 따르고, 그룹 "안"의 행 순서만 BL번호 오름차순으로 바꿈)
  const renderedGroupKeys = new Set();
  list.forEach((t) => {
    const key = triangleEntryGroupKey(t);
    const groupSize = key ? (groupCounts[key] || 0) : 0;
    const inGroup = groupSize > 1;

    if (!inGroup) {
      tbody.appendChild(buildTriangleRow(t, false, false));
      return;
    }
    if (renderedGroupKeys.has(key)) return; // 그룹의 두 번째 이후 항목은 이미 위에서 통째로 그렸으니 건너뜀
    renderedGroupKeys.add(key);

    const groupEntries = list.filter((x) => triangleEntryGroupKey(x) === key).sort(triangleCompareGrouped);
    const doneCount = groupEntries.filter((x) => x.doneStatus === "done").length;
    const progressCount = groupEntries.length - doneCount;
    const isOpen = triangleExpandedGroups.has(key) || (progressCount > 0 && !triangleCollapsedGroups.has(key));

    const vessel = (t.vessel || "").trim();
    const shipper = (t.shipper || "").trim();
    const dates = Array.from(new Set(groupEntries.map((x) => x.onboardDate).filter(Boolean))).sort();
    const dateLabel = dates.length ? "온보드 " + triangleFormatDate(dates[0]) + (dates.length > 1 ? " 외" : "") : "";
    const groupRemark = (groupEntries.find((x) => (x.groupRemark || "").trim()) || {}).groupRemark || "";
    const groupIds = groupEntries.map((x) => x.id);
    const allSelected = groupIds.length > 0 && groupIds.every((id) => triangleSelectedIds.has(id));
    const someSelected = !allSelected && groupIds.some((id) => triangleSelectedIds.has(id));
    const headerTr = document.createElement("tr");
    headerTr.className = "tri-group-head " + (progressCount > 0 ? "pending" : "alldone") + (vessel ? "" : " novsl");
    headerTr.innerHTML = '<td colspan="13" class="no-strike"><div class="tri-group-inner">'
      + '<div class="tri-group-row">'
      + '<span class="tri-group-name"><input type="checkbox" class="tri-select-box" data-group-key="' + escapeHtml(key) + '"' + (allSelected ? " checked" : "") + ' onclick="event.stopPropagation();toggleTriangleGroupSelectAll(\'' + key + '\')" title="이 그룹 전체 선택"><span>' + (isOpen ? "▾" : "▸") + "</span>🚢 " + escapeHtml(vessel || "배 미입력") + (shipper ? " · " + escapeHtml(shipper) : "") + "</span>"
      + '<span class="tri-group-meta">'
      + (dateLabel ? "<span>" + escapeHtml(dateLabel) + "</span>" : "")
      + (vessel ? "" : '<span class="tri-group-hint">VSL을 적으면 배별로 묶여요</span>')
      + (progressCount > 0 ? '<span class="done-badge progress">진행중 ' + progressCount + "</span>" : "")
      + (doneCount > 0 ? '<span class="done-badge done">완료 ' + doneCount + "</span>" : "")
      + '<button type="button" class="tri-group-edit-btn" title="그룹 공통 REMARK 수정" onclick="event.stopPropagation();openTriangleGroupEditor(\'' + key + '\')">✏️</button>'
      + "</span></div>"
      + (groupRemark ? '<div class="tri-group-remark">📝 ' + escapeHtml(groupRemark) + "</div>" : "")
      + "</div></td>";
    headerTr.onclick = () => toggleTriangleGroup(key);
    tbody.appendChild(headerTr);
    const groupCb = headerTr.querySelector(".tri-select-box");
    if (groupCb) groupCb.indeterminate = someSelected;

    if (!isOpen) return; // 접혀있으면 상세 행은 건너뜀
    groupEntries.forEach((entry, idx) => {
      const hasSecond = !!(entry.secondVessel || "").trim();
      const prevHadSecond = idx > 0 && !!(groupEntries[idx - 1].secondVessel || "").trim();
      const isFirstAfter2nd = idx > 0 && prevHadSecond && !hasSecond; // 2ND 있는 건들 바로 다음, 없는 건이 시작되는 지점
      tbody.appendChild(buildTriangleRow(entry, true, idx === groupEntries.length - 1, isFirstAfter2nd));
    });
  });
  table.appendChild(tbody);
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
  tr.appendChild(document.createElement("td")); // 체크박스 칸 자리 맞추기 (빠른 등록 줄엔 체크박스 없음)

  const mk = (id, placeholder, bold, draftKey, type) => {
    const td = document.createElement("td");
    const input = document.createElement("input");
    if (type) input.type = type;
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
  tr.appendChild(mk("triangleQuickOnboard", "온보드", false, "onboardDate", "date"));
  tr.appendChild(mk("triangleQuickPop", "O / X", false, "popCharge"));
  tr.appendChild(mk("triangleQuickMfst", "O / X", false, "mfstClose"));
  tr.appendChild(mk("triangleQuickInvoice", "O / X", false, "invoiceRequest"));
  tr.appendChild(mk("triangleQuickRemit", "O / X / 신용", false, "remittance"));
  tr.appendChild(mk("triangleQuickInform", "O / X", false, "polPodInform"));

  const hintTd = document.createElement("td");
  hintTd.className = "tri-quick-hint";
  hintTd.textContent = "빈칸 = 아직 안 함";
  tr.appendChild(hintTd);

  tr.appendChild(mk("triangleQuickRemark", "REMARK", false, "remark"));

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
  const onboardDate = (document.getElementById("triangleQuickOnboard").value || "").trim();
  const entry = {
    blNumber,
    vessel,
    shipper,
    onboardDate,
    popCharge: (document.getElementById("triangleQuickPop").value || "").trim(),
    mfstClose: (document.getElementById("triangleQuickMfst").value || "").trim(),
    invoiceRequest: (document.getElementById("triangleQuickInvoice").value || "").trim(),
    remittance: (document.getElementById("triangleQuickRemit").value || "").trim(),
    polPodInform: (document.getElementById("triangleQuickInform").value || "").trim(),
    remark: (document.getElementById("triangleQuickRemark").value || "").trim(),
  };
  const result = await submitTriangleToServer(entry);
  if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류") + " - 입력하신 내용은 그대로 남아있으니 다시 저장을 눌러주세요."); return; }
  // 같은 배·화주로 여러 건 이어서 등록하는 경우가 많아서, VSL/화주/온보드 날짜는 지우지 않고 남겨둬요 (BL번호부터 나머지만 비움)
  triangleQuickDraft = { vessel, shipper, onboardDate };
  const gKey = triangleEntryGroupKey({ vessel, shipper });
  if (gKey) { triangleCollapsedGroups.delete(gKey); triangleExpandedGroups.add(gKey); } // 방금 등록한 그룹은 바로 확인할 수 있게 펼쳐둠
  ["triangleQuickBl", "triangleQuickPop", "triangleQuickMfst", "triangleQuickInvoice", "triangleQuickRemit", "triangleQuickInform", "triangleQuickRemark"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const first = document.getElementById("triangleQuickBl");
  if (first) first.focus();
}

let triangleBulkMode = false; // 새 건 등록 시 "여러 BL 한번에 등록" 모드 여부 (기존 건 수정에는 없음)

function openTriangleEditor(existingId) {
  triangleDraft = existingId ? Object.assign({}, TRIANGLE_LIST.find((t) => t.id === existingId)) : {
    id: null, blNumber: "", vessel: "", shipper: "", onboardDate: "", secondVessel: "", groupRemark: "", popCharge: "", mfstClose: "", invoiceRequest: "", remittance: "", polPodInform: "", remark: "", doneStatus: "progress",
  };
  triangleBulkMode = false;
  document.getElementById("triangleEditTitle").textContent = existingId ? "✏️ 삼국간 건 수정" : "➕ 삼국간 건 등록";
  document.getElementById("triangleEditOverlay").style.display = "flex";
  renderTriangleEditorBody();
}

function closeTriangleEditor() {
  document.getElementById("triangleEditOverlay").style.display = "none";
  triangleDraft = null;
}

/* O / X / 빈칸 셋 중 빠르게 고르고, 그 외 값(신용거래 등)은 직접 입력할 수 있게 텍스트 인풋 + 빠른버튼 조합 */
function makeTriangleStatusField(labelText, value, opts) {
  const wrap = document.createElement("div");
  wrap.appendChild(makeLabel(labelText));
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
  const input = document.createElement("input");
  input.value = value || "";
  input.placeholder = "빈칸 = 아직 안 함";
  input.style.flex = "1";
  input.style.minWidth = "120px";
  row.appendChild(input);

  // 자주 쓰는 값은 버튼 한 번으로: O 완료 / X 해당 없음 / 확인중 / (송금만) 신용 / 비움(아직 안 함)
  const quick = [["O", "O", "완료"], ["X", "X", "해당 없음"], ["확인중", "CHECKING", "확인 중"]];
  if (opts && opts.credit) quick.push(["신용", "신용", "신용거래라 송금 체크 불필요"]);
  quick.push(["비움", "", "아직 안 함"]);
  quick.forEach((q) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn secondary-btn";
    b.style.cssText = "padding:6px 10px;";
    b.textContent = q[0];
    b.title = q[2];
    b.onclick = () => { input.value = q[1]; };
    row.appendChild(b);
  });
  wrap.appendChild(row);
  wrap._input = input;
  return wrap;
}

function renderTriangleEditorBody() {
  const body = document.getElementById("triangleEditBody");
  body.innerHTML = "";
  const d = triangleDraft;

  const legendHint = document.createElement("div");
  legendHint.className = "hint";
  legendHint.style.marginBottom = "8px";
  legendHint.textContent = "O 완료 · X 해당 없음 · 빈칸 아직 안 함 · CHECKING 확인 중 · 송금 칸은 신용거래면 \"신용\"";
  body.appendChild(legendHint);

  let blInput; // input(단건) 또는 textarea(여러 건) - 아래에서 모드에 맞게 만듦

  if (!d.id) {
    const bulkToggle = document.createElement("button");
    bulkToggle.type = "button";
    bulkToggle.className = "btn secondary-btn";
    bulkToggle.style.cssText = "padding:4px 10px;font-size:12px;margin-bottom:10px;";
    bulkToggle.textContent = triangleBulkMode ? "↩️ 한 건만 입력" : "📋 같은 배로 여러 BL 한번에 등록";
    bulkToggle.onclick = () => { triangleBulkMode = !triangleBulkMode; renderTriangleEditorBody(); };
    body.appendChild(bulkToggle);
  }

  if (triangleBulkMode && !d.id) {
    blInput = document.createElement("textarea");
    blInput.rows = 4;
    blInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
    blInput.placeholder = "BL번호를 줄바꿈 또는 쉼표로 구분해서 여러 개 입력하세요\n예:\nZIMUHAI80243306\nZIMUHAI80243307\nZIMUHAI80243308";
    body.appendChild(makeFollowupField("BL번호 (여러 개)", blInput));
    const bulkHint = document.createElement("div");
    bulkHint.className = "hint";
    bulkHint.style.marginTop = "-6px";
    bulkHint.textContent = "아래 VSL·화주·온보드·상태값·REMARK는 여기 적은 BL번호 전체에 똑같이 적용돼요.";
    body.appendChild(bulkHint);
  } else {
    blInput = document.createElement("input");
    blInput.placeholder = "예: ZIMUPKH003136318";
    blInput.value = d.blNumber || "";
    body.appendChild(makeFollowupField("BL번호", blInput));
  }

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
  const onboardInput = document.createElement("input");
  onboardInput.type = "date";
  onboardInput.value = d.onboardDate || "";
  row0.appendChild(makeFollowupField("온보드 날짜", onboardInput));
  body.appendChild(row0);

  const row0b = document.createElement("div");
  row0b.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
  const secondVesselInput = document.createElement("input");
  secondVesselInput.placeholder = "예: ADL 20E (미국행 등 2번째 배)";
  secondVesselInput.value = d.secondVessel || "";
  row0b.appendChild(makeFollowupField("2ND VSL (건마다 다를 수 있어요 - 나중에 각자 따로 고칠 수 있어요)", secondVesselInput));
  body.appendChild(row0b);

  const groupRemarkInput = document.createElement("textarea");
  groupRemarkInput.rows = 2;
  groupRemarkInput.style.cssText = "width:100%;resize:vertical;box-sizing:border-box;";
  groupRemarkInput.placeholder = "이 배·화주 전체에 공통으로 적용되는 메모 (아래 REMARK와는 별개예요)";
  groupRemarkInput.value = d.groupRemark || "";
  body.appendChild(makeFollowupField("그룹 공통 REMARK (같은 배·화주 전체 공통)", groupRemarkInput));

  const popField = makeTriangleStatusField("POP CHARGE", d.popCharge);
  body.appendChild(popField);
  const mfstField = makeTriangleStatusField("MFST CLOSE", d.mfstClose);
  body.appendChild(mfstField);
  const invoiceField = makeTriangleStatusField("인보이스 발송요청", d.invoiceRequest);
  body.appendChild(invoiceField);
  const remitField = makeTriangleStatusField("송금 완료", d.remittance, { credit: true });
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
    const common = {
      vessel: vesselInput.value.trim(),
      shipper: shipperInput.value.trim(),
      onboardDate: onboardInput.value.trim(),
      secondVessel: secondVesselInput.value.trim(),
      groupRemark: groupRemarkInput.value.trim(),
      popCharge: popField._input.value.trim(),
      mfstClose: mfstField._input.value.trim(),
      invoiceRequest: invoiceField._input.value.trim(),
      remittance: remitField._input.value.trim(),
      polPodInform: informField._input.value.trim(),
      remark: remarkInput.value.trim(),
      doneStatus: doneSel.value,
    };

    // ---- 여러 BL 한번에 등록 ----
    if (triangleBulkMode && !d.id) {
      const blNumbers = Array.from(new Set(
        blInput.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      ));
      if (blNumbers.length === 0) { alert("BL번호를 한 개 이상 입력해주세요."); return; }

      saveBtn.disabled = true;
      saveBtn.textContent = "💾 " + blNumbers.length + "건 저장 중...";
      const result = await submitTriangleBulk(common, blNumbers);
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 저장하기";
      if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류") + " - 입력하신 내용은 그대로 남아있으니 다시 저장을 눌러주세요."); return; }
      closeTriangleEditor();
      return;
    }

    // ---- 한 건 등록/수정 ----
    const entry = Object.assign({ id: d.id, blNumber: blInput.value.trim() }, common);
    if (!entry.blNumber) { alert("BL번호를 입력해주세요."); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = entry.id ? await updateTriangleOnServer(entry) : await submitTriangleToServer(entry);
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장하기";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }

    // 기존 건을 수정하면서 그룹 공통 REMARK를 실제로 바꾼 경우에만, 같은 배·화주의 나머지 건에도 그대로 맞춰줌
    // (건드리지 않았으면 다른 건에 있던 값을 빈 값으로 덮어쓰지 않도록 굳이 동기화하지 않음)
    // 2ND VSL은 건마다 다를 수 있는 값이라 여기서는 이 건만 저장하고, 다른 건에는 맞추지 않음
    if (entry.id) {
      const remarkChanged = common.groupRemark !== (d.groupRemark || "");
      if (remarkChanged) {
        const key = triangleGroupKey(entry.vessel, entry.shipper);
        const siblingIds = TRIANGLE_LIST.filter((t) => t.id !== entry.id && triangleEntryGroupKey(t) === key).map((t) => t.id);
        if (siblingIds.length) await applyTriangleGroupFields(siblingIds, common.groupRemark);
      }
    }
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
