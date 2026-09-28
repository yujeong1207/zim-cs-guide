/* =========================================================================
   💬 SR 응대 매뉴얼 (수입 CS) - 수입 SR 유형별 "처리 방법(내부용)" + "고객 응대 문구" 모음
   -------------------------------------------------------------------------
   메일 템플릿이랑 같은 방식이에요:
   - 문구 칸은 누구나 바로 클릭해서 자기 말투로 고친 뒤 복사할 수 있어요 (저장 안 됨, 그 자리에서만)
   - 원본 문구 자체를 바꾸는 건 ⚙️ 관리 PIN을 넣어야 하고, 고치면 Firestore에 저장돼서 팀 전체에 반영돼요
   - 실제 응대 문구는 Firestore(sr_manual_import 컬렉션)에만 있고, 공개 저장소 코드에는 안 들어가요

   Firestore 문서 구조: { order, category, title, sr, steps: [..], noReplyText, replies: [{label, text}], updatedAt }
   ========================================================================= */
const SR_MANUAL_IMPORT_COLLECTION = "sr_manual_import";

// 유형 버튼 표시 순서 - 여기 없는 유형이 새로 생기면 맨 뒤에 붙어요
const SR_MANUAL_IMPORT_CATEGORY_ORDER = [
  "입항일·스케줄", "B/L 타입", "AN", "터미널", "프리타임·DET", "운임·로컬비용", "기타 문의", "선적지(POL)", "내부·회신 불필요",
];

let SR_MANUAL_IMPORT_LIST = [];
let srManualImportUnsubscribe = null;
let srManualImportLoaded = false;
let srManualImportCategory = "__all";
let srManualImportExpanded = new Set();
let srManualImportDraft = null; // 편집 중인 케이스 (관리 화면)

/* 앱 시작할 때 한 번 구독 - 문서 수가 적어서(수십 건) 계속 살려둬도 부담 없고,
   이렇게 해야 상단 🔍 전체 검색에서도 탭을 안 열어본 상태로 바로 찾아져요 */
function initSrManualImportSync() {
  if (srManualImportUnsubscribe || !window.fbDb) return;
  srManualImportUnsubscribe = window.fbDb.collection(SR_MANUAL_IMPORT_COLLECTION).onSnapshot(
    (snapshot) => {
      SR_MANUAL_IMPORT_LIST = snapshot.docs
        .map((doc) => srManualImportDocToEntry(doc))
        .sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));
      srManualImportLoaded = true;
      if (typeof mainTab !== "undefined" && mainTab === "srManualImport") renderSrManualImportTab();
    },
    (err) => {
      console.error("SR 응대 매뉴얼 실시간 구독 실패:", err);
      const wrap = document.getElementById("srManualImportListWrap");
      if (wrap) wrap.innerHTML = '<div class="empty-state">⚠️ 목록을 불러오지 못했어요. 새로고침 해보시고, 계속 안 되면 알려주세요.</div>';
    }
  );
}

function srManualImportDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    order: typeof d.order === "number" ? d.order : 9999,
    category: d.category || "기타 문의",
    title: d.title || "",
    sr: d.sr || "",
    steps: Array.isArray(d.steps) ? d.steps : [],
    noReplyText: d.noReplyText || "",
    replies: Array.isArray(d.replies) ? d.replies.map((r) => ({ label: r.label || "고객 응대 문구", text: r.text || "" })) : [],
  };
}

/* switchMainTab에서 호출 */
function loadSrManualImportTab() {
  initSrManualImportSync();
  renderSrManualImportTab();
}

function srManualImportCategories() {
  const found = Array.from(new Set(SR_MANUAL_IMPORT_LIST.map((c) => c.category)));
  const ordered = SR_MANUAL_IMPORT_CATEGORY_ORDER.filter((c) => found.includes(c));
  return ordered.concat(found.filter((c) => !ordered.includes(c)).sort());
}

function srManualImportSearchText(c) {
  return [c.title, c.category, c.sr, c.noReplyText].concat(c.steps).concat(c.replies.map((r) => r.label + " " + r.text)).join(" ").toLowerCase();
}

function renderSrManualImportTab() {
  const wrap = document.getElementById("srManualImportListWrap");
  const chipsWrap = document.getElementById("srManualImportCategoryChips");
  if (!wrap || !chipsWrap) return;

  if (!srManualImportLoaded) {
    wrap.innerHTML = '<div class="empty-state">⏳ SR 응대 매뉴얼을 불러오는 중이에요...</div>';
    return;
  }

  if (SR_MANUAL_IMPORT_LIST.length === 0) {
    chipsWrap.innerHTML = "";
    wrap.innerHTML = `
      <div class="empty-state">
        아직 등록된 케이스가 없어요.<br>
        처음 한 번만, 받아두신 <b>sr_manual_import_seed.json</b> 파일로 초기 데이터를 넣어주세요.<br><br>
        <button class="btn generate-btn" onclick="srManualImportRequireAdmin(() => document.getElementById('srManualImportSeedInput').click())">📥 초기 데이터 가져오기 (관리 PIN)</button>
      </div>`;
    return;
  }

  const qEl = document.getElementById("srManualImportFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();
  const byQuery = q ? SR_MANUAL_IMPORT_LIST.filter((c) => srManualImportSearchText(c).includes(q)) : SR_MANUAL_IMPORT_LIST;

  // 유형 버튼 (검색어에 맞는 건수로 표시)
  const cats = srManualImportCategories();
  if (srManualImportCategory !== "__all" && !cats.includes(srManualImportCategory)) srManualImportCategory = "__all";
  const chip = (value, label, count) =>
    `<button type="button" class="sr-manual-chip${srManualImportCategory === value ? " active" : ""}" onclick="setSrManualImportCategory('${escapeHtml(value)}')">${escapeHtml(label)} <span class="sr-manual-chip-count">${count}</span></button>`;
  chipsWrap.innerHTML = chip("__all", "전체", byQuery.length) +
    cats.map((c) => chip(c, c, byQuery.filter((x) => x.category === c).length)).join("");

  const list = srManualImportCategory === "__all" ? byQuery : byQuery.filter((c) => c.category === srManualImportCategory);
  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state">조건에 맞는 케이스가 없어요.</div>';
    return;
  }

  // 검색어가 있으면 결과를 전부 펼쳐서 보여줌 (어디에 걸렸는지 바로 보이게)
  wrap.innerHTML = list.map((c) => buildSrManualImportCardHtml(c, !!q || srManualImportExpanded.has(c.id))).join("");
}

function setSrManualImportCategory(value) {
  srManualImportCategory = value;
  renderSrManualImportTab();
}

function toggleSrManualImportCard(id) {
  if (srManualImportExpanded.has(id)) srManualImportExpanded.delete(id); else srManualImportExpanded.add(id);
  renderSrManualImportTab();
}

/* 문구 안의 [대괄호] 빈칸을 노란색으로 표시한 HTML로 바꿈 (복사할 땐 색 빼고 복사됨) */
function srManualImportTextToHtml(text) {
  return escapeHtml(text || "")
    .replace(/\[[^\]\n]+\]/g, (m) => `<span class="sr-ph">${m}</span>`)
    .split("\n").join("<br>");
}

function buildSrManualImportCardHtml(c, isOpen) {
  const id = escapeHtml(c.id);
  const head = `
    <div class="sr-manual-head" onclick="toggleSrManualImportCard('${id}')">
      <span class="sr-manual-cat">${escapeHtml(c.category)}</span>
      <span class="sr-manual-title">${escapeHtml(c.title || "(제목 없음)")}</span>
      ${c.sr ? `<span class="sr-manual-srno">${escapeHtml(c.sr)}</span>` : ""}
      <button type="button" class="btn secondary-btn sr-manual-edit-btn" title="원본 문구 수정 (관리 PIN)" onclick="event.stopPropagation(); openSrManualImportEditor('${id}')">⚙️ 수정</button>
      <span class="sr-manual-caret">${isOpen ? "▴" : "▾"}</span>
    </div>`;
  if (!isOpen) return `<div class="content-card sr-manual-card" data-sr-id="${id}">${head}</div>`;

  const steps = c.steps.length
    ? c.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")
    : '<li style="color:#9ca3af;">적힌 처리 방법이 없어요.</li>';

  const replies = c.replies.map((r, i) => `
    <div class="sr-manual-reply">
      <div class="sr-manual-reply-head">
        <span class="sr-manual-reply-label">${escapeHtml(r.label)}</span>
        <button type="button" class="btn secondary-btn" onclick="resetSrManualImportReply('${id}', ${i})" title="고친 내용을 지우고 원래 문구로">↺ 원래대로</button>
        <button type="button" class="btn copy-btn" id="srCopyBtn_${id}_${i}" onclick="copySrManualImportReply('${id}', ${i})">📋 복사</button>
      </div>
      <div class="preview-html sr-manual-reply-body" id="srReply_${id}_${i}" contenteditable="true">${srManualImportTextToHtml(r.text)}</div>
    </div>`).join("");

  const noReply = c.noReplyText ? `<div class="sr-manual-noreply">${escapeHtml(c.noReplyText)}</div>` : "";

  return `
    <div class="content-card sr-manual-card open" data-sr-id="${id}">
      ${head}
      <div class="sr-manual-body">
        <div class="sr-manual-steps">
          <div class="sr-manual-section-title">처리 방법 (내부용)</div>
          <ul>${steps}</ul>
        </div>
        <div class="sr-manual-replies">
          ${noReply}
          ${replies}
          ${c.replies.length ? '<div class="hint" style="margin:0;">💡 문구 칸을 클릭하면 내 말투로 바로 고칠 수 있어요. 고친 내용은 복사용이라 저장되지 않아요.</div>' : ""}
        </div>
      </div>
    </div>`;
}

function resetSrManualImportReply(id, idx) {
  const c = SR_MANUAL_IMPORT_LIST.find((x) => x.id === id);
  const el = document.getElementById(`srReply_${id}_${idx}`);
  if (c && el && c.replies[idx]) el.innerHTML = srManualImportTextToHtml(c.replies[idx].text);
}

/* 지금 칸에 보이는 그대로(직접 고친 내용 포함) 복사 - 빈칸 노란 표시는 빼고,
   메일 템플릿이랑 똑같이 Calibri 11pt로 감싸서 아웃룩에 붙여넣어도 글꼴이 안 튀게 */
function copySrManualImportReply(id, idx) {
  const el = document.getElementById(`srReply_${id}_${idx}`);
  if (!el) return;
  const clone = el.cloneNode(true);
  clone.querySelectorAll(".sr-ph").forEach((s) => s.replaceWith(document.createTextNode(s.textContent)));
  const html = typeof wrapEmailHtmlFont === "function" ? wrapEmailHtmlFont(clone.innerHTML) : clone.innerHTML;
  const plain = el.innerText;

  const done = () => {
    const btn = document.getElementById(`srCopyBtn_${id}_${idx}`);
    if (!btn) return;
    btn.textContent = "✅ 복사됨";
    setTimeout(() => { btn.textContent = "📋 복사"; }, 1500);
  };

  if (typeof copyHtmlViaSelection === "function" && copyHtmlViaSelection(html)) { done(); return; }
  if (navigator.clipboard && window.ClipboardItem) {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plain], { type: "text/plain" }),
    });
    navigator.clipboard.write([item]).then(done).catch(() => legacyCopy(plain));
  } else {
    legacyCopy(plain);
  }
}

/* ---------- 관리 PIN 확인 (메일 템플릿 관리와 같은 PIN / 같은 방식) ---------- */
function srManualImportRequireAdmin(fn) {
  if (typeof isAdminUnlocked === "function" && isAdminUnlocked()) { fn(); return; }
  pendingAdminAction = fn;
  showPinPrompt();
}

/* ---------- 원본 문구 편집 (관리 PIN 필요) ---------- */
function openSrManualImportEditor(id) {
  srManualImportRequireAdmin(() => {
    const src = id ? SR_MANUAL_IMPORT_LIST.find((c) => c.id === id) : null;
    const maxOrder = SR_MANUAL_IMPORT_LIST.reduce((m, c) => Math.max(m, c.order), 0);
    srManualImportDraft = src
      ? JSON.parse(JSON.stringify(src))
      : { id: null, order: maxOrder + 10, category: srManualImportCategory !== "__all" ? srManualImportCategory : "기타 문의", title: "", sr: "", steps: [], noReplyText: "", replies: [{ label: "고객 응대 문구", text: "안녕하세요, ZIM LINE C/S TEAM 입니다.\n\n" }] };
    document.getElementById("srManualImportEditTitle").textContent = src ? "⚙️ SR 응대 매뉴얼 수정" : "➕ SR 응대 매뉴얼 새 케이스";
    renderSrManualImportEditor();
    document.getElementById("srManualImportEditOverlay").style.display = "flex";
  });
}

function closeSrManualImportEditor() {
  document.getElementById("srManualImportEditOverlay").style.display = "none";
  srManualImportDraft = null;
}

/* 입력 중인 값을 draft에 먼저 담아둠 (문구 추가/삭제 버튼 누를 때 입력한 게 날아가지 않게) */
function syncSrManualImportDraftFromForm() {
  const d = srManualImportDraft;
  if (!d) return;
  const v = (elId) => { const el = document.getElementById(elId); return el ? el.value : ""; };
  d.category = v("srEditCategory").trim();
  d.title = v("srEditTitle").trim();
  d.sr = v("srEditSr").trim();
  d.order = Number(v("srEditOrder")) || 0;
  d.steps = v("srEditSteps").split("\n").map((s) => s.trim()).filter(Boolean);
  d.noReplyText = v("srEditNoReply").trim();
  d.replies = d.replies.map((r, i) => ({ label: v(`srEditReplyLabel_${i}`).trim(), text: v(`srEditReplyText_${i}`) }));
}

function renderSrManualImportEditor() {
  const d = srManualImportDraft;
  const body = document.getElementById("srManualImportEditBody");
  if (!d || !body) return;
  const catOptions = Array.from(new Set(SR_MANUAL_IMPORT_CATEGORY_ORDER.concat(srManualImportCategories())))
    .map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
  const replies = d.replies.map((r, i) => `
    <div class="sr-edit-reply">
      <div style="display:flex; gap:6px; align-items:center;">
        <input id="srEditReplyLabel_${i}" type="text" value="${escapeHtml(r.label)}" placeholder="문구 이름 (예: 고객 응대 문구)" style="flex:1;">
        <button type="button" class="btn secondary-btn" onclick="removeSrManualImportDraftReply(${i})">🗑 이 문구 삭제</button>
      </div>
      <textarea id="srEditReplyText_${i}" rows="8" placeholder="문구 내용 - 바꿔 써야 하는 곳은 [B/L 번호]처럼 대괄호로 적으면 노란색으로 표시돼요">${escapeHtml(r.text)}</textarea>
    </div>`).join("");

  body.innerHTML = `
    <div class="sr-edit-grid">
      <label>유형<input id="srEditCategory" type="text" list="srEditCategoryList" value="${escapeHtml(d.category)}"></label>
      <datalist id="srEditCategoryList">${catOptions}</datalist>
      <label>표시 순서 <span class="hint" style="margin:0;">(작을수록 위)</span><input id="srEditOrder" type="number" value="${escapeHtml(String(d.order))}"></label>
      <label style="grid-column:1 / -1;">제목<input id="srEditTitle" type="text" value="${escapeHtml(d.title)}" placeholder="예: SKIP으로 홈페이지와 터미널 입항일이 다른 경우"></label>
      <label style="grid-column:1 / -1;">참고 SR 번호<input id="srEditSr" type="text" value="${escapeHtml(d.sr)}" placeholder="예: SR-11667316"></label>
      <label style="grid-column:1 / -1;">처리 방법 (내부용) <span class="hint" style="margin:0;">한 줄에 하나씩</span>
        <textarea id="srEditSteps" rows="5">${escapeHtml(d.steps.join("\n"))}</textarea></label>
      <label style="grid-column:1 / -1;">회신 안내 <span class="hint" style="margin:0;">회신이 필요 없는 건일 때만 (예: 별도 회신 없이 D/O 보류 여부만 확인)</span>
        <input id="srEditNoReply" type="text" value="${escapeHtml(d.noReplyText)}"></label>
    </div>
    <div class="sr-manual-section-title" style="margin-top:14px;">응대 문구</div>
    ${replies || '<div class="hint">응대 문구가 없어요 (회신 불필요 건).</div>'}
    <button type="button" class="btn secondary-btn" style="margin-top:6px;" onclick="addSrManualImportDraftReply()">＋ 문구 추가</button>
    <div style="display:flex; gap:8px; margin-top:18px; flex-wrap:wrap;">
      <button type="button" class="btn generate-btn" id="srEditSaveBtn" onclick="saveSrManualImportDraft()">💾 저장 (팀 전체 반영)</button>
      ${d.id ? '<button type="button" class="btn secondary-btn" style="color:#b91c1c;" onclick="deleteSrManualImportDraft()">🗑 케이스 삭제</button>' : ""}
      <button type="button" class="btn secondary-btn" onclick="closeSrManualImportEditor()">취소</button>
    </div>
    <div id="srEditStatus" class="hint"></div>`;
}

function addSrManualImportDraftReply() {
  syncSrManualImportDraftFromForm();
  srManualImportDraft.replies.push({ label: "고객 응대 문구", text: "안녕하세요, ZIM LINE C/S TEAM 입니다.\n\n" });
  renderSrManualImportEditor();
}

function removeSrManualImportDraftReply(idx) {
  syncSrManualImportDraftFromForm();
  if (!confirm("이 문구를 지울까요? (저장을 눌러야 실제로 반영돼요)")) return;
  srManualImportDraft.replies.splice(idx, 1);
  renderSrManualImportEditor();
}

async function saveSrManualImportDraft() {
  syncSrManualImportDraftFromForm();
  const d = srManualImportDraft;
  if (!d.title) { alert("제목은 꼭 적어주세요."); return; }
  const status = document.getElementById("srEditStatus");
  const btn = document.getElementById("srEditSaveBtn");
  if (btn) btn.disabled = true;
  if (status) status.textContent = "저장 중...";
  const data = {
    order: d.order, category: d.category || "기타 문의", title: d.title, sr: d.sr,
    steps: d.steps, noReplyText: d.noReplyText,
    replies: d.replies.filter((r) => r.text.trim()).map((r) => ({ label: r.label || "고객 응대 문구", text: r.text.replace(/\s+$/, "") })),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  try {
    await window.fbReady;
    const col = window.fbDb.collection(SR_MANUAL_IMPORT_COLLECTION);
    const ref = d.id ? col.doc(d.id) : col.doc();
    await ref.set(data);
    srManualImportExpanded.add(ref.id);
    closeSrManualImportEditor();
  } catch (err) {
    if (status) status.textContent = "❌ 저장 실패: " + err;
    if (btn) btn.disabled = false;
  }
}

async function deleteSrManualImportDraft() {
  const d = srManualImportDraft;
  if (!d || !d.id) return;
  if (!confirm(`"${d.title}" 케이스를 삭제할까요? 팀 전체에서 사라져요.`)) return;
  try {
    await window.fbReady;
    await window.fbDb.collection(SR_MANUAL_IMPORT_COLLECTION).doc(d.id).delete();
    closeSrManualImportEditor();
  } catch (err) {
    alert("삭제 실패: " + err);
  }
}

/* ---------- 처음 한 번: 초기 데이터(JSON) 가져오기 ----------
   실제 응대 문구가 공개 저장소에 올라가지 않게, 문구는 JSON 파일로 따로 받아서 여기서 한 번만 넣어요 */
function handleSrManualImportSeedFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items) || !items.length) throw new Error("파일 안에 케이스가 없어요.");
      if (SR_MANUAL_IMPORT_LIST.length && !confirm(`이미 ${SR_MANUAL_IMPORT_LIST.length}건이 있어요. 같은 ID는 덮어쓰고 나머지는 추가할까요?`)) return;
      await window.fbReady;
      const batch = window.fbDb.batch();
      const col = window.fbDb.collection(SR_MANUAL_IMPORT_COLLECTION);
      items.forEach((it, i) => {
        const ref = it.id ? col.doc(String(it.id)) : col.doc();
        batch.set(ref, {
          order: typeof it.order === "number" ? it.order : (i + 1) * 10,
          category: it.category || "기타 문의",
          title: it.title || "",
          sr: it.sr || "",
          steps: Array.isArray(it.steps) ? it.steps : [],
          noReplyText: it.noReplyText || "",
          replies: Array.isArray(it.replies) ? it.replies.map((r) => ({ label: r.label || "고객 응대 문구", text: r.text || "" })) : [],
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
      alert(`✅ ${items.length}건 넣었어요.`);
    } catch (err) {
      alert("가져오기 실패: " + (err.message || err));
    }
  };
  reader.readAsText(file, "utf-8");
}

/* 🔍 전체 검색 결과에서 눌렀을 때 - 그 케이스를 펼치고 그 위치로 스크롤 */
function jumpToSrManualImportCase(id) {
  switchMainTab("srManualImport");
  srManualImportCategory = "__all";
  const f = document.getElementById("srManualImportFilter");
  if (f) f.value = "";
  srManualImportExpanded.add(id);
  renderSrManualImportTab();
  setTimeout(() => {
    const card = document.querySelector(`.sr-manual-card[data-sr-id="${CSS.escape(id)}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 60);
}

// 앱 시작 시 구독 시작 (전체 검색에서 바로 찾을 수 있게)
if (window.fbReady && typeof window.fbReady.then === "function") {
  window.fbReady.then(() => initSrManualImportSync()).catch(() => {});
}
