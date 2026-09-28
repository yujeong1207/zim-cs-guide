/* =========================================================================
   ✍️ 답장 다듬기 - 보내기 전에 답장을 붙여넣으면 딱딱하게 들릴 수 있는 표현과
   빠진 한마디(공감·다음 단계·인사말)를 찾아줘요.
   -------------------------------------------------------------------------
   - AI를 쓰지 않아요: 미리 정해둔 표현 목록을 답장 안에서 "찾기"만 해요.
     그래서 답장 내용은 브라우저 안에서만 확인하고 어디에도 저장·전송하지 않아요.
   - 기본 규칙(TONE_RULES)은 코드에 있고, 팀에서 추가하는 표현은 Firestore(tone_rules)에 있어요.
     추가 표현 관리는 ⚙️ 관리 PIN이 필요해요.
   ========================================================================= */
const TONE_RULES_COLLECTION = "tone_rules";

const TONE_RULES = [
  { id: "baramnida1", re: /([가-힣]+)하시기\s?바랍니다/g, why: "\"~하시기 바랍니다\"는 지시하는 말투로 들려요.", fix: (m, a) => a + " 부탁드립니다" },
  { id: "baramnida2", re: /([가-힣]+)\s바랍니다/g, why: "\"~ 바랍니다\"는 윗사람이 지시하는 느낌을 줘요.", fix: (m, a) => a + " 부탁드립니다" },
  { id: "baramnida3", re: /바랍니다/g, why: "\"바랍니다\"보다 \"부탁드립니다\"가 부드럽게 들려요.", fix: () => "부탁드립니다" },
  { id: "yomang", re: /(요망|바람)(?=[.\s]|$)/g, why: "\"요망/바람\"은 내부 지시문 말투예요.", fix: () => "부탁드립니다" },
  { id: "bulga1", re: /([가-힣]+\s)?불가(능)?합니다/g, why: "\"불가합니다\"는 딱 잘라 거절하는 느낌이에요.", fix: (m, a) => (a ? a.trim() + "해드리기 " : "") + "어려운 점 양해 부탁드립니다" },
  { id: "bulga2", re: /([가-힣]+\s)?불가(능)?(하니|하므로|하여|해서)/g, why: "\"불가\"는 딱 잘라 거절하는 느낌이에요.", fix: (m, a) => (a ? a.trim() + "해드리기 " : "") + "어려워" },
  { id: "bulga3", re: /([가-힣]+\s)?불가(능)?한/g, why: "\"불가한\"은 딱 잘라 거절하는 느낌이에요.", fix: (m, a) => (a ? a.trim() + "해드리기 " : "") + "어려운" },
  { id: "mugwan1", re: /(선사와는?\s?)?무관하(니|므로|며|여)/g, why: "\"무관하다\"는 \"우리 일 아니다\"로 들려요.", fix: () => "선사에서 직접 확인이 어려워" },
  { id: "mugwan2", re: /(선사와는?\s?)?무관합니다/g, why: "\"무관합니다\"는 \"우리 일 아니다\"로 들려요.", fix: () => "선사에서 직접 확인이 어려운 부분입니다" },
  { id: "gwonhan1", re: /([가-힣]+할\s)?권한이\s?없습니다/g, why: "\"권한이 없다\"는 선을 긋는 느낌이에요.", fix: () => "저희 쪽에서 진행해드리기 어려운 점 양해 부탁드립니다" },
  { id: "gwonhan2", re: /([가-힣]+할\s)?권한이\s?없는/g, why: "\"권한이 없는\"은 선을 긋는 느낌이에요.", fix: () => "저희 쪽에서 진행해드리기 어려운" },
  { id: "andoem", re: /안\s?됩니다/g, why: "\"안 됩니다\"는 단호하게 들려요.", fix: () => "어렵습니다" },
  { id: "hasyeoya", re: /하셔야\s?합니다/g, why: "\"~하셔야 합니다\"는 의무를 지우는 말투예요.", fix: () => "해주셔야 진행이 가능합니다" },
  { id: "moreuget", re: /모르겠습니다/g, why: "\"모르겠습니다\"로 끝나면 무성의하게 들려요.", fix: () => "확인 후 다시 안내드리겠습니다" },
  { id: "bandeusi", re: /반드시/g, why: "\"반드시\"는 강하게 들려요.", fix: () => "꼭" },
  { id: "imi", re: /(이미|앞서)\s?(안내|말씀)(드린|한)\s?(바와\s?같이|대로)/g, why: "\"이미 안내드린 대로\"는 고객을 탓하는 느낌을 줄 수 있어요.", fix: () => "다시 한번 안내드리면" },
  { id: "geot", re: /(할|말|줄)\s?것(?=[.\s)]|$)/g, why: "\"~할 것\"은 내부 메모 말투라 고객 메일에는 어울리지 않아요.", fix: null },
];
const DENY_RE = /(불가|어렵|어려운|어려워|무관|권한이\s?없|안\s?됩니다|수용되지\s?않|공유\s?불가)/;
const NEXT_RE = /(대신|번거로우시겠지만|문의\s?주시면|연락처|확인해\s?주시면|확인\s?부탁|문의\s?부탁|안내드리겠습니다|방법|측으로|으로\s?연락|진행\s?부탁|요청해\s?주시면)/;
const BAD_SITUATION_RE = /(지연|딜레이|delay|SKIP|스킵|취소|누락|오류|변경되|늦어)/i;
const EMPATHY_RE = /(양해|죄송|불편|송구|기다려)/;
const GREETING = "안녕하세요, ZIM LINE C/S TEAM 입니다.";

function analyzeTone(text) {
  const hits = [];
  TONE_RULES.forEach((r) => {
    r.re.lastIndex = 0; let m;
    while ((m = r.re.exec(text)) !== null) {
      const s = m.index, e = s + m[0].length;
      if (!hits.some((h) => s < h.e && e > h.s)) hits.push({ s, e, rule: r, m });
      if (m[0].length === 0) r.re.lastIndex++;
    }
  });
  hits.sort((a, b) => a.s - b.s);
  const checks = [];
  const trimmed = text.trim();
  if (!trimmed.startsWith(GREETING)) checks.push({ key: "greet", title: "인사말을 팀 공통 문구로 맞춰볼까요?", body: "첫 줄을 \"" + GREETING + "\"로 시작해주세요.", fixable: true });
  const bodyText = trimmed.replace(/^안녕하세요[^\n]*\n?/, "").trim();
  const sentences = bodyText.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 1);
  if (trimmed && sentences.length <= 1) checks.push({ key: "short", title: "한 줄만 더해보면 어떨까요?", body: "내용은 맞아도 짧으면 귀찮아하는 걸로 느껴질 수 있어요. \"참고 부탁드립니다\"나 \"추가로 궁금하신 점 있으시면 말씀 부탁드립니다\" 한 줄만 더해보세요." });
  if (DENY_RE.test(text) && !NEXT_RE.test(text)) checks.push({ key: "next", title: "다음에 어떻게 하시면 되는지 알려드려볼까요?", body: "어디로 문의하면 되는지, 대신 무엇을 해드릴 수 있는지 한 문장 넣으면 \"도와주려는 사람\"으로 읽혀요." });
  if (BAD_SITUATION_RE.test(text) && !EMPATHY_RE.test(text)) checks.push({ key: "empathy", title: "공감 한마디를 더해볼까요?", body: "지연·SKIP·변경 안내에는 \"불편을 드려 죄송합니다\"나 \"양해 부탁드립니다\" 한 줄이 있으면 인상이 크게 달라져요." });
  return { hits, checks };
}

function applyToneFixes(text) {
  let out = text;
  TONE_RULES.forEach((r) => { if (r.fix) { r.re.lastIndex = 0; out = out.replace(r.re, (...args) => r.fix(...args)); } });
  const lines = out.replace(/^\s+/, "").split("\n");
  if (lines[0].trim() !== GREETING) {
    if (/^안녕하세요/.test(lines[0].trim())) lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
    return GREETING + "\n\n" + lines.join("\n");
  }
  return out;
}

// 팀에서 추가한 표현 { id, from, to, why } - 글자 그대로 찾아요 (정규식 아님)
let TONE_CUSTOM_RULES = [];
let toneRulesUnsubscribe = null;
let toneCopyTimer = null;

function initToneRulesSync() {
  if (toneRulesUnsubscribe || !window.fbDb) return;
  toneRulesUnsubscribe = window.fbDb.collection(TONE_RULES_COLLECTION).onSnapshot(
    (snapshot) => {
      TONE_CUSTOM_RULES = snapshot.docs
        .map((doc) => Object.assign({ id: doc.id }, doc.data()))
        .filter((r) => r.from && String(r.from).trim())
        .sort((a, b) => String(a.from).localeCompare(String(b.from)));
      if (typeof mainTab !== "undefined" && mainTab === "toneCheck") renderToneCheck();
      renderToneRulesManager();
    },
    (err) => console.error("답장 다듬기 표현 목록 구독 실패:", err)
  );
}

function toneEscapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* 팀 추가 표현을 기본 규칙과 같은 모양으로 바꿔서 합침 (팀 추가 표현이 먼저 - 더 구체적인 경우가 많아서) */
function toneAllRules() {
  const custom = TONE_CUSTOM_RULES.map((r) => ({
    id: "custom_" + r.id,
    re: new RegExp(toneEscapeRegExp(String(r.from).trim()), "g"),
    why: r.why || "팀에서 바꿔 쓰기로 한 표현이에요.",
    fix: r.to ? () => r.to : null,
    custom: true,
  }));
  return custom.concat(TONE_RULES);
}

/* 기본 analyzeTone / applyToneFixes는 TONE_RULES만 보니까, 팀 추가 표현까지 합친 버전으로 감쌈 */
function toneAnalyze(text) {
  const saved = TONE_RULES.slice();
  const all = toneAllRules(); // 비우기 전에 먼저 합쳐둬야 해요
  TONE_RULES.length = 0;
  all.forEach((r) => TONE_RULES.push(r));
  try { return { result: analyzeTone(text), fixed: applyToneFixes(text) }; }
  finally { TONE_RULES.length = 0; saved.forEach((r) => TONE_RULES.push(r)); }
}

function loadToneCheckTab() {
  initToneRulesSync();
  renderToneCheck();
}

/* 다른 탭(SR 응대 매뉴얼 등)에서 "✍️ 답장 다듬기" 버튼으로 문구를 넘겨받아 바로 점검 */
function openToneCheckWithText(text) {
  switchMainTab("toneCheck");
  const input = document.getElementById("toneCheckInput");
  if (input) input.value = text || "";
  renderToneCheck();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderToneCheck() {
  const input = document.getElementById("toneCheckInput");
  const resultWrap = document.getElementById("toneCheckResult");
  if (!input || !resultWrap) return;
  const text = input.value || "";

  if (!text.trim()) {
    resultWrap.innerHTML = '<div class="empty-state">위 칸에 보내려는 답장을 붙여넣으면 같이 다듬어볼게요 ✍️</div>';
    return;
  }

  const { result, fixed } = toneAnalyze(text);

  // 1) 걸린 곳 표시
  let marked = "";
  let last = 0;
  result.hits.forEach((h, i) => {
    marked += escapeHtml(text.slice(last, h.s));
    marked += `<mark class="tone-mark">${escapeHtml(text.slice(h.s, h.e))}<sup>${i + 1}</sup></mark>`;
    last = h.e;
  });
  marked += escapeHtml(text.slice(last));

  // 2) 바꿀 표현 카드
  const findings = result.hits.map((h, i) => {
    const r = h.rule;
    let to = "다른 표현으로 바꿔주세요";
    if (r.fix) { to = h.m[0].replace(new RegExp(r.re.source), (...a) => r.fix(...a)); }
    return `
      <div class="tone-finding">
        <div class="tone-finding-line">
          <span class="tone-num">${i + 1}</span>
          <span class="tone-from">${escapeHtml(h.m[0])}</span>
          <span class="tone-arrow">→</span>
          <span class="tone-to">${escapeHtml(to)}</span>
          ${r.custom ? '<span class="tone-custom-badge">팀 추가</span>' : ""}
        </div>
        <div class="tone-why">${escapeHtml(r.why)}</div>
      </div>`;
  }).join("");

  // 3) 빠진 한마디
  const checks = result.checks.map((c) => `
    <div class="tone-check">
      <div class="tone-check-title">🧡 ${escapeHtml(c.title)}</div>
      <div class="tone-why">${escapeHtml(c.body)}</div>
    </div>`).join("");

  const total = result.hits.length + result.checks.length;
  const summary = total === 0
    ? '<div class="tone-summary good">🎉 따뜻하게 잘 쓰셨어요! 이대로 보내셔도 좋아요.</div>'
    : `<div class="tone-summary">✨ 다듬어볼 표현 <b>${result.hits.length}</b>곳 · 더해보면 좋은 한마디 <b>${result.checks.length}</b>개<div class="tone-summary-sub">내용은 그대로 두고, 고객에게 조금 더 부드럽게 닿도록 바꿔볼 수 있는 부분이에요.</div></div>`;

  resultWrap.innerHTML = `
    <div class="tone-grid">
      <div class="tone-col">
        <div class="tone-box">
          <div class="tone-box-title">🔍 다듬어볼 곳</div>
          <div class="tone-marked">${marked}</div>
        </div>
      </div>
      <div class="tone-col">
        ${summary}
        ${findings}
        ${checks}
      </div>
    </div>
    <div class="tone-fixed-box">
      <div class="tone-fixed-head">
        <div style="flex:1;">
          <div class="tone-box-title" style="color:#047857;">🌿 추천 문장</div>
          <div class="hint" style="margin:2px 0 0;">바꿀 수 있는 표현은 자동으로 바꿨어요. 🧡 항목은 상황에 맞게 한 줄을 직접 더해주세요.</div>
        </div>
        <button type="button" class="btn secondary-btn" onclick="applyToneFixedToInput()">⬆️ 위 칸에 적용</button>
        <button type="button" class="btn copy-btn" id="toneCopyBtn" onclick="copyToneFixed()">📋 복사</button>
      </div>
      <div class="tone-fixed-text" id="toneFixedText">${escapeHtml(fixed)}</div>
    </div>`;
}

function applyToneFixedToInput() {
  const input = document.getElementById("toneCheckInput");
  const fixedEl = document.getElementById("toneFixedText");
  if (!input || !fixedEl) return;
  input.value = fixedEl.textContent;
  renderToneCheck();
}

function copyToneFixed() {
  const fixedEl = document.getElementById("toneFixedText");
  if (!fixedEl) return;
  const plain = fixedEl.textContent;
  const html = escapeHtml(plain).split("\n").join("<br>");
  const wrapped = typeof wrapEmailHtmlFont === "function" ? wrapEmailHtmlFont(html) : html;
  const done = () => {
    const btn = document.getElementById("toneCopyBtn");
    if (!btn) return;
    btn.textContent = "✅ 복사됨";
    clearTimeout(toneCopyTimer);
    toneCopyTimer = setTimeout(() => { btn.textContent = "📋 복사"; }, 1500);
  };
  if (typeof copyHtmlViaSelection === "function" && copyHtmlViaSelection(wrapped)) { done(); return; }
  if (navigator.clipboard) navigator.clipboard.writeText(plain).then(done).catch(() => legacyCopy(plain));
  else legacyCopy(plain);
}

/* ---------- ⚙️ 표현 목록 관리 (관리 PIN) ---------- */
function openToneRulesManager() {
  const run = () => {
    initToneRulesSync();
    document.getElementById("toneRulesOverlay").style.display = "flex";
    renderToneRulesManager();
  };
  if (typeof isAdminUnlocked === "function" && isAdminUnlocked()) { run(); return; }
  pendingAdminAction = run;
  showPinPrompt();
}

function closeToneRulesManager() {
  document.getElementById("toneRulesOverlay").style.display = "none";
}

function renderToneRulesManager() {
  const body = document.getElementById("toneRulesBody");
  const overlay = document.getElementById("toneRulesOverlay");
  if (!body || !overlay || overlay.style.display === "none") return;

  const customRows = TONE_CUSTOM_RULES.map((r) => `
    <tr>
      <td><input type="text" id="toneRuleFrom_${escapeHtml(r.id)}" value="${escapeHtml(r.from || "")}"></td>
      <td><input type="text" id="toneRuleTo_${escapeHtml(r.id)}" value="${escapeHtml(r.to || "")}" placeholder="(비우면 표시만)"></td>
      <td><input type="text" id="toneRuleWhy_${escapeHtml(r.id)}" value="${escapeHtml(r.why || "")}"></td>
      <td style="white-space:nowrap;">
        <button type="button" class="btn secondary-btn" onclick="saveToneRule('${escapeHtml(r.id)}')">💾</button>
        <button type="button" class="btn danger-btn" onclick="deleteToneRule('${escapeHtml(r.id)}')">🗑</button>
      </td>
    </tr>`).join("");

  const builtinRows = TONE_RULES.map((r) => {
    let example = "";
    try { example = r.fix ? r.fix("", "") : "(표시만)"; } catch (e) { example = ""; }
    return `<li><b>${escapeHtml(r.why)}</b>${example ? ` <span class="hint" style="margin:0;">→ ${escapeHtml(example)}</span>` : ""}</li>`;
  }).join("");

  body.innerHTML = `
    <div class="hint" style="margin-top:0;">"이 말도 바꾸면 좋겠다" 싶은 표현을 추가하면 팀 전체 답장 다듬기에 바로 반영돼요. 적은 글자 그대로 찾아요.</div>
    <div class="tone-rule-add">
      <input type="text" id="toneRuleNewFrom" placeholder="찾을 표현 (예: 확인 바람)">
      <input type="text" id="toneRuleNewTo" placeholder="바꿀 표현 (예: 확인 부탁드립니다)">
      <input type="text" id="toneRuleNewWhy" placeholder="이유 (선택)">
      <button type="button" class="btn generate-btn" onclick="addToneRule()">＋ 추가</button>
    </div>
    <div class="section-title" style="margin-top:14px;">💜 팀에서 추가한 표현 (${TONE_CUSTOM_RULES.length})</div>
    ${TONE_CUSTOM_RULES.length
      ? `<div style="overflow-x:auto;"><table class="tone-rule-table"><tr><th>찾을 표현</th><th>바꿀 표현</th><th>이유</th><th></th></tr>${customRows}</table></div>`
      : '<div class="hint">아직 추가한 표현이 없어요.</div>'}
    <details style="margin-top:14px;">
      <summary class="section-title" style="cursor:pointer;">📚 기본으로 들어있는 규칙 ${TONE_RULES.length}개 보기</summary>
      <ul class="tone-builtin-list">${builtinRows}</ul>
    </details>`;
}

async function addToneRule() {
  const v = (id) => (document.getElementById(id).value || "").trim();
  const from = v("toneRuleNewFrom");
  if (!from) { alert("찾을 표현을 적어주세요."); return; }
  try {
    await window.fbReady;
    await window.fbDb.collection(TONE_RULES_COLLECTION).add({
      from, to: v("toneRuleNewTo"), why: v("toneRuleNewWhy"),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) { alert("추가 실패: " + err); }
}

async function saveToneRule(id) {
  const v = (prefix) => (document.getElementById(prefix + id).value || "").trim();
  const from = v("toneRuleFrom_");
  if (!from) { alert("찾을 표현은 비울 수 없어요."); return; }
  try {
    await window.fbReady;
    await window.fbDb.collection(TONE_RULES_COLLECTION).doc(id).set({
      from, to: v("toneRuleTo_"), why: v("toneRuleWhy_"),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) { alert("저장 실패: " + err); }
}

async function deleteToneRule(id) {
  if (!confirm("이 표현을 목록에서 뺄까요?")) return;
  try {
    await window.fbReady;
    await window.fbDb.collection(TONE_RULES_COLLECTION).doc(id).delete();
  } catch (err) { alert("삭제 실패: " + err); }
}
