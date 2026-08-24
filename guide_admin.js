/* ===== guide_admin.js : original lines 22161-25341 ===== */
/* =========================================================================
   관리자 패널
   ========================================================================= */

let adminSection = "procedures"; // "templates" | "procedures" | "faqs" | "resources" | "vacations"
let draft = null;

const ADMIN_SECTION_LABELS = {
  templates: "✉️ 메일 템플릿",
  ntf: "📨 공문 발송",
  procedures: "📋 업무 절차",
  faqs: "❓ FAQ",
  faqTopics: "🗂 FAQ 그룹",
  resources: "🔗 자료 모음",
  contacts: "📞 연락처",
  vacations: "🌴 휴가 일정",
  vacationMembers: "🎫 팀원 휴가일수",
  teamEvents: "🗓 팀 일정",
  notice: "📢 공지 배너",
  feedback: "💬 의견함",
  quotes: "💬 오늘의 한마디",
  ltMail: "📦 LT LIST 메일 기본값",
  poa: "🖋️ 위임장 현황",
  holidays: "🔴 공휴일"
};

function getSectionItems(section) {
  if (section === "templates") return TEMPLATES;
  if (section === "ntf") return NTF_TEMPLATES;
  if (section === "procedures") return PROCEDURES;
  if (section === "faqs") return FAQS;
  if (section === "faqTopics") return FAQ_TOPICS;
  if (section === "resources") return RESOURCES;
  if (section === "contacts") return CONTACTS;
  if (section === "vacations") return VACATIONS;
  if (section === "vacationMembers") return VACATION_MEMBERS;
  if (section === "quotes") return QUOTES;
  if (section === "poa") return POA_LIST;
  if (section === "holidays") return HOLIDAYS;
  return TEAM_EVENTS;
}

/* ---- 📨 공문 고정 TO/FROM 문구 편집 ---- */
function renderNtfLetterheadBox(body) {
  const box = document.createElement("div");
  box.className = "group-rename-box";

  const title = document.createElement("div");
  title.className = "section-title";
  title.style.marginTop = "0";
  title.textContent = "📌 고정 TO / FROM 문구";
  box.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.margin = "0 0 8px";
  hint.textContent = "모든 공문에 항상 똑같이 들어가는 TO/FROM 문구예요. 여기서 한 번만 고치면 모든 공문 유형에 자동 반영돼요.";
  box.appendChild(hint);

  box.appendChild(makeLabel("TO"));
  const toInput = document.createElement("input");
  toInput.value = NTF_LETTERHEAD.to || "";
  toInput.oninput = (e) => { NTF_LETTERHEAD.to = e.target.value; };
  box.appendChild(toInput);

  box.appendChild(makeLabel("FROM"));
  const fromInput = document.createElement("input");
  fromInput.value = NTF_LETTERHEAD.from || "";
  fromInput.oninput = (e) => { NTF_LETTERHEAD.from = e.target.value; };
  box.appendChild(fromInput);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn secondary-btn";
  saveBtn.style.marginTop = "4px";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = () => {
    const ok = saveData();
    if (!ok) { alert("저장에 실패했어요."); return; }
    alert("저장했어요 ✅ 앞으로 생성되는 모든 공문에 반영돼요.");
  };
  box.appendChild(saveBtn);

  body.appendChild(box);
}

/* ---- 🗂 그룹 이름 일괄 변경 (메일 템플릿 / 공문 발송 / 자료 모음 공통) ---- */
function renderGroupRenameBox(body) {
  const items = getSectionItems(adminSection);
  const groups = Array.from(new Set(items.map((it) => (it.group || "").trim()).filter(Boolean)));
  if (groups.length === 0) return;

  const box = document.createElement("div");
  box.className = "group-rename-box";

  const title = document.createElement("div");
  title.className = "section-title";
  title.style.marginTop = "0";
  title.textContent = "🗂 그룹 이름 일괄 변경";
  box.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.margin = "0 0 8px";
  hint.textContent = "그룹을 골라 새 이름을 입력하고 저장하면, 그 그룹에 속한 항목 전부가 한 번에 새 이름으로 바뀌어요.";
  box.appendChild(hint);

  const row = document.createElement("div");
  row.className = "field-row-top";
  const select = document.createElement("select");
  groups.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    select.appendChild(opt);
  });
  const input = document.createElement("input");
  input.placeholder = "새 그룹 이름";
  row.appendChild(select);
  row.appendChild(input);
  box.appendChild(row);

  const applyBtn = document.createElement("button");
  applyBtn.className = "btn secondary-btn";
  applyBtn.style.marginTop = "8px";
  applyBtn.textContent = "변경 적용";
  applyBtn.onclick = () => applyGroupRename(select.value, input.value);
  box.appendChild(applyBtn);

  body.appendChild(box);
}

function applyGroupRename(oldName, newName) {
  newName = (newName || "").trim();
  if (!newName) { alert("새 그룹 이름을 입력해주세요."); return; }
  if (newName === oldName) { alert("기존 이름과 같아요."); return; }
  const items = getSectionItems(adminSection);
  let count = 0;
  items.forEach((it) => {
    if ((it.group || "").trim() === oldName) { it.group = newName; count++; }
  });
  const ok = saveData();
  if (!ok) { alert("저장에 실패했어요."); return; }
  renderAdminList();
  refreshCurrentTab();
  if (adminSection === "templates") initTypeSelect();
  if (adminSection === "ntf") initNtfTypeSelect();
  alert(`"${oldName}" → "${newName}" 로 ${count}건 변경했어요 ✅`);
}

const ADMIN_PIN = "1104";
const ADMIN_UNLOCK_KEY = "cs_guide_admin_unlocked";

function isAdminUnlocked() {
  try { return sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1"; } catch (e) { return false; }
}

let pendingAdminAction = null;

function openAdminList() {
  pendingAdminAction = openAdminListActual;
  if (isAdminUnlocked()) { openAdminListActual(); return; }
  showPinPrompt();
}

function showPinPrompt() {
  const overlay = document.getElementById("pinOverlay");
  const input = document.getElementById("pinInput");
  const errEl = document.getElementById("pinError");
  if (errEl) errEl.style.display = "none";
  if (input) input.value = "";
  overlay.style.display = "flex";
  if (input) setTimeout(() => input.focus(), 50);
}

function closePinModal() {
  document.getElementById("pinOverlay").style.display = "none";
}

function submitAdminPin() {
  const input = document.getElementById("pinInput");
  const errEl = document.getElementById("pinError");
  if ((input.value || "").trim() === ADMIN_PIN) {
    try { sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1"); } catch (e) {}
    closePinModal();
    const action = pendingAdminAction || openAdminListActual;
    pendingAdminAction = null;
    action();
  } else {
    if (errEl) errEl.style.display = "block";
    input.value = "";
    input.focus();
  }
}

/* 특정 섹션의 특정 항목을 관리자 화면에서 바로 편집 화면으로 열어줌 (PIN 걸려있으면 먼저 확인) */
function openAdminEditDirect(section, id) {
  const run = () => { adminSection = section; openAdminListActual(); openAdminEdit(id); };
  if (isAdminUnlocked()) { run(); return; }
  pendingAdminAction = run;
  showPinPrompt();
}

async function openAdminListActual() {
  adminSection = mainTab === "templates" ? "templates" : mainTab === "faqs" ? "faqs" : mainTab;
  document.getElementById("adminOverlay").style.display = "flex";
  renderAdminSectionTabs();
  if (adminSection === "vacations" && CORE_SHEET_API_URL) { await syncVacationsFromServer(); }
  if (adminSection === "holidays" && CORE_SHEET_API_URL) { await syncHolidaysFromServer(); }
  if (adminSection === "teamEvents" && CORE_SHEET_API_URL) { await syncTeamEventsFromServer(); }
  renderAdminList();
  renderStorageUsage();
}

/* 이 브라우저(도메인)에 저장된 총 용량을 대략 계산해서 보여줌 - 브라우저 저장공간(localStorage) 한도는
   보통 5~10MB(브라우저마다 다름)라서, 4~6MB짜리 첨부파일을 여러 개 올리면 한도에 가까워질 수 있음 */
function renderStorageUsage() {
  const el = document.getElementById("storageUsageIndicator");
  if (!el) return;
  let totalBytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || "";
      totalBytes += (k.length + v.length) * 2; // 브라우저가 대체로 UTF-16(문자당 2바이트) 기준으로 용량을 셈
    }
  } catch (e) {
    el.innerHTML = "";
    return;
  }
  const ASSUMED_QUOTA = 5 * 1024 * 1024; // 가장 보수적인 브라우저 기준(약 5MB)으로 잡은 추정치
  const pct = Math.min(100, Math.round((totalBytes / ASSUMED_QUOTA) * 100));
  const barClass = pct >= 90 ? "danger" : pct >= 70 ? "warn" : "";
  el.innerHTML = `💾 이 브라우저 저장공간 사용량: <b>${formatFileSize(totalBytes)}</b> (브라우저 한도 약 5~10MB 중 최소 기준 대비 약 ${pct}%)
    <div class="storage-usage-bar-track"><div class="storage-usage-bar-fill ${barClass}" style="width:${pct}%;"></div></div>
    <div style="margin-top:4px;">※ 브라우저마다 실제 한도가 달라서 정확한 값은 아니고, 대략적인 참고용이에요. 70% 넘으면 큰 첨부파일은 링크 등록을 추천해요.</div>`;
}

function closeAdmin() {
  document.getElementById("adminOverlay").style.display = "none";
  draft = null;
}

function renderAdminSectionTabs() {
  const wrap = document.getElementById("adminSectionTabs");
  wrap.innerHTML = "";
  Object.keys(ADMIN_SECTION_LABELS).forEach((key) => {
    const btn = document.createElement("button");
    btn.className = "admin-section-tab" + (key === adminSection ? " active" : "");
    btn.textContent = ADMIN_SECTION_LABELS[key];
    btn.onclick = async () => {
      adminSection = key; draft = null; poaAdminQuery = "";
      renderAdminSectionTabs();
      // 확정휴가·공휴일·팀일정·공지배너는 관리 화면 들어갈 때마다 서버에서 최신 목록으로 먼저 갱신
      if (key === "vacations" && CORE_SHEET_API_URL) { await syncVacationsFromServer(); }
      if (key === "holidays" && CORE_SHEET_API_URL) { await syncHolidaysFromServer(); }
      if (key === "teamEvents" && CORE_SHEET_API_URL) { await syncTeamEventsFromServer(); }
      renderAdminList();
    };
    wrap.appendChild(btn);
  });
}

/* ---- 📢 공지 배너 (관리자 화면) ---- */
function renderNoticeAdminBody(body) {
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.margin = "0 0 14px";
  hint.textContent = "켜두면 페이지 상단(탭 공통)에 공지 배너가 표시돼요. 급한 공지·안내사항을 적어두세요.";
  body.appendChild(hint);

  const toggleRow = document.createElement("div");
  toggleRow.className = "toggle-row";
  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.id = "noticeEnabledChk";
  chk.checked = !!NOTICE_BANNER.enabled;
  const chkLabel = document.createElement("label");
  chkLabel.setAttribute("for", "noticeEnabledChk");
  chkLabel.textContent = "배너 표시 켜기";
  toggleRow.appendChild(chk);
  toggleRow.appendChild(chkLabel);
  body.appendChild(toggleRow);

  body.appendChild(makeLabel("공지 내용"));
  const ta = document.createElement("textarea");
  ta.rows = 4;
  ta.value = NOTICE_BANNER.text || "";
  ta.placeholder = "예: 7/30(목) 오후 시스템 점검으로 부킹 시스템 접속이 일시 제한됩니다.";
  body.appendChild(ta);

  if (NOTICE_BANNER.updatedAt) {
    const sub = document.createElement("div");
    sub.className = "hint";
    sub.textContent = "최근 수정: " + NOTICE_BANNER.updatedAt;
    body.appendChild(sub);
  }

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn full";
  saveBtn.style.marginTop = "12px";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = async () => {
    const banner = { enabled: chk.checked, text: ta.value, updatedAt: todayStr() };
    if (CORE_SHEET_API_URL) {
      saveBtn.disabled = true;
      const result = await saveNoticeBannerToServer(banner);
      saveBtn.disabled = false;
      if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
      NOTICE_BANNER = banner;
      renderNoticeBanner();
      renderNoticeAdminBody(body);
      return;
    }
    NOTICE_BANNER.enabled = chk.checked;
    NOTICE_BANNER.text = ta.value;
    NOTICE_BANNER.updatedAt = todayStr();
    const ok = saveData();
    if (!ok) { alert("저장에 실패했어요."); return; }
    renderNoticeBanner();
    renderNoticeAdminBody(body);
  };
  body.appendChild(saveBtn);
}

function renderLtMailAdminBody(body) {
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.margin = "0 0 14px";
  hint.textContent = "📦 엑셀 정리 탭의 LT LIST에서 \"메일로 보내기\" 누를 때 기본으로 채워질 받는사람/내용이에요. 여기서 한 번 저장해두면 매번 안 적어도 돼요. (탭에서 그때그때 수정하는 것도 여전히 가능해요)";
  body.appendChild(hint);

  body.appendChild(makeLabel("받는사람 (여러 명은 , 로 구분)"));
  const toInput = document.createElement("input");
  toInput.type = "text";
  toInput.value = LT_MAIL_SETTINGS.to || "";
  toInput.placeholder = "예: lt.coop@example.com";
  body.appendChild(toInput);

  body.appendChild(makeLabel("참조 CC (여러 명은 , 로 구분)"));
  const ccInput = document.createElement("input");
  ccInput.type = "text";
  ccInput.value = LT_MAIL_SETTINGS.cc || "";
  ccInput.placeholder = "예: team.lead@example.com";
  body.appendChild(ccInput);

  body.appendChild(makeLabel("메일 내용"));
  const ta = document.createElement("textarea");
  ta.rows = 6;
  ta.value = LT_MAIL_SETTINGS.body || "";
  ta.placeholder = "메일 본문에 고정으로 들어갈 내용을 적어주세요.";
  body.appendChild(ta);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn full";
  saveBtn.style.marginTop = "12px";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = () => {
    LT_MAIL_SETTINGS.to = toInput.value;
    LT_MAIL_SETTINGS.cc = ccInput.value;
    LT_MAIL_SETTINGS.body = ta.value;
    const ok = saveData();
    if (!ok) { alert("저장에 실패했어요."); return; }
    alert("저장됐어요 ✅ 이제 LT LIST 메일 보내기에서 자동으로 이 값이 채워져요.");
  };
  body.appendChild(saveBtn);
}

function renderNoticeBanner() {
  const wrap = document.getElementById("noticeBannerWrap");
  if (!wrap) return;
  if (!NOTICE_BANNER.enabled || !(NOTICE_BANNER.text || "").trim()) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";
  wrap.innerHTML = "";
  const box = document.createElement("div");
  box.className = "notice-banner-box";
  const icon = document.createElement("span");
  icon.className = "notice-banner-icon";
  icon.textContent = "📢";
  const text = document.createElement("span");
  text.className = "notice-banner-text";
  text.textContent = NOTICE_BANNER.text;
  box.appendChild(icon);
  box.appendChild(text);
  wrap.appendChild(box);
}

/* ---- 💬 팀원 의견함 ---- */
/* =========================================================================
   ⚙️ 의견 남기기 실시간 공유 설정
   위임장/오비엘/모선일정과 같은 방식이에요. 새 구글 시트 + 새 Apps Script
   웹앱을 배포한 뒤, 그 주소를 아래에 붙여넣으면 활성화돼요. 팀원이 어느
   브라우저에서 의견을 남기든, 관리자(회원님) 화면에 전부 모여요.
   ========================================================================= */
const FEEDBACK_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbwRTAr4gumzsNANjS0oXRfqINFsrl-OndTwcQe8cAXTCDRZ9mwDJ4-Cf8JQC7r0UgQGww/exec";

async function fetchFeedbackListFromServer() {
  if (!FEEDBACK_SHEET_API_URL) return null;
  try {
    const res = await fetch(FEEDBACK_SHEET_API_URL, { method: "GET" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "목록을 불러오지 못했어요.");
    return data.list.map((row) => ({
      id: row.id, text: row.text || "", date: row.date || "",
      resolved: row.resolved === true || row.resolved === "TRUE" || row.resolved === "true"
    }));
  } catch (err) {
    console.error("의견 목록 서버 불러오기 실패:", err);
    return null;
  }
}

async function submitFeedbackToServer(entry) {
  if (!FEEDBACK_SHEET_API_URL) return { ok: false, error: "연동 주소가 설정되지 않았어요." };
  try {
    const res = await fetch(FEEDBACK_SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "add" }, entry)),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "등록에 실패했어요.");
    return { ok: true };
  } catch (err) {
    console.error("의견 서버 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function updateFeedbackOnServer(id, resolved) {
  if (!FEEDBACK_SHEET_API_URL) return { ok: false, error: "연동 주소가 설정되지 않았어요." };
  try {
    const res = await fetch(FEEDBACK_SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "update", id: id, resolved: resolved }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "변경에 실패했어요.");
    return { ok: true };
  } catch (err) {
    console.error("의견 서버 수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteFeedbackFromServer(id) {
  if (!FEEDBACK_SHEET_API_URL) return { ok: false, error: "연동 주소가 설정되지 않았어요." };
  try {
    const res = await fetch(FEEDBACK_SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "delete", id: id }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "삭제에 실패했어요.");
    return { ok: true };
  } catch (err) {
    console.error("의견 서버 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

function renderFeedbackBadge() {
  const badge = document.getElementById("feedbackBadge");
  if (!badge) return;
  const count = FEEDBACK_LIST.filter((f) => !f.resolved).length;
  if (count > 0) {
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }
}

function openFeedbackModal() {
  document.getElementById("feedbackText").value = "";
  document.getElementById("feedbackOverlay").style.display = "flex";
}

function closeFeedbackModal() {
  document.getElementById("feedbackOverlay").style.display = "none";
}

async function submitFeedback() {
  const text = document.getElementById("feedbackText").value.trim();
  if (!text) { alert("내용을 입력해주세요."); return; }
  const entry = { text, date: todayStr(), resolved: false };

  if (FEEDBACK_SHEET_API_URL) {
    const result = await submitFeedbackToServer(entry);
    closeFeedbackModal();
    if (result.ok) alert("의견이 등록됐어요. 소중한 의견 감사합니다! 🙌");
    else alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류"));
    return;
  }

  // 연동 꺼져있으면 예전 방식(브라우저 저장) 그대로 - 이 경우 본인 브라우저에만 남아요
  FEEDBACK_LIST.push(Object.assign({ id: genId("fb") }, entry));
  const ok = saveData();
  closeFeedbackModal();
  renderFeedbackBadge();
  if (ok) alert("의견이 등록됐어요. 소중한 의견 감사합니다! 🙌");
  else alert("저장에 실패했어요. 저장 공간을 확인해주세요.");
}

async function renderFeedbackAdminBody(body) {
  body.innerHTML = "";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.margin = "0 0 14px";
  hint.textContent = "팀원이 우측 하단 \"📝 의견 남기기\" 버튼으로 보낸 의견·오탈자 제보가 모여요. 확인 후 해결 표시하거나 삭제할 수 있어요.";
  body.appendChild(hint);

  if (FEEDBACK_SHEET_API_URL) {
    const loading = document.createElement("div");
    loading.className = "empty-state";
    loading.textContent = "⏳ 최신 의견을 불러오는 중이에요...";
    body.appendChild(loading);
    const list = await fetchFeedbackListFromServer();
    if (list) {
      FEEDBACK_LIST = list;
    } else {
      loading.textContent = "⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요).";
      return;
    }
    body.removeChild(loading);
  }

  renderFeedbackAdminListInner(body);
}

function renderFeedbackAdminListInner(body) {
  if (FEEDBACK_LIST.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 등록된 의견이 없어요.";
    body.appendChild(empty);
    return;
  }

  const sorted = FEEDBACK_LIST.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  sorted.forEach((fb) => {
    const card = document.createElement("div");
    card.className = "tpl-card";
    const info = document.createElement("div");
    info.innerHTML = `<div class="tpl-card-name" style="${fb.resolved ? "text-decoration:line-through;color:#9ca3af;" : ""}">${escapeHtml(fb.text)}</div>
      <div class="tpl-card-sub">📅 ${fb.date}${fb.resolved ? " · ✅ 해결완료" : ""}</div>`;
    const actions = document.createElement("div");
    actions.className = "tpl-card-actions";
    const resolveBtn = document.createElement("button");
    resolveBtn.className = "btn secondary-btn";
    resolveBtn.textContent = fb.resolved ? "미해결로" : "해결완료";
    resolveBtn.onclick = async () => {
      const newResolved = !fb.resolved;
      if (FEEDBACK_SHEET_API_URL) {
        resolveBtn.disabled = true;
        const result = await updateFeedbackOnServer(fb.id, newResolved);
        if (!result.ok) { alert("변경에 실패했어요: " + (result.error || "알 수 없는 오류")); resolveBtn.disabled = false; return; }
      } else {
        saveData();
      }
      fb.resolved = newResolved;
      renderFeedbackAdminListRefresh(body);
      renderFeedbackBadge();
    };
    const delBtn = document.createElement("button");
    delBtn.className = "btn danger-btn";
    delBtn.textContent = "삭제";
    delBtn.onclick = async () => {
      if (!confirm("이 의견을 삭제할까요?")) return;
      if (FEEDBACK_SHEET_API_URL) {
        const result = await deleteFeedbackFromServer(fb.id);
        if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
      } else {
        saveData();
      }
      FEEDBACK_LIST = FEEDBACK_LIST.filter((x) => x.id !== fb.id);
      renderFeedbackAdminListRefresh(body);
      renderFeedbackBadge();
    };
    actions.appendChild(resolveBtn);
    actions.appendChild(delBtn);
    card.appendChild(info);
    card.appendChild(actions);
    body.appendChild(card);
  });
}

function renderFeedbackAdminListRefresh(body) {
  body.innerHTML = "";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.margin = "0 0 14px";
  hint.textContent = "팀원이 우측 하단 \"📝 의견 남기기\" 버튼으로 보낸 의견·오탈자 제보가 모여요. 확인 후 해결 표시하거나 삭제할 수 있어요.";
  body.appendChild(hint);
  renderFeedbackAdminListInner(body);
}

/* ---- ⭐ 즐겨찾기 메일 템플릿 ---- */
function renderFavoriteRow() {
  const wrap = document.getElementById("favTemplateRow");
  if (!wrap) return;
  const favTemplates = FAVORITE_TEMPLATE_IDS.map((id) => TEMPLATES.find((t) => t.id === id)).filter(Boolean);
  wrap.innerHTML = "";
  if (favTemplates.length > 0) {
    const title = document.createElement("div");
    title.className = "fav-row-title";
    title.textContent = "⭐ 즐겨찾기";
    wrap.appendChild(title);
    const pillWrap = document.createElement("div");
    pillWrap.className = "fav-pill-wrap";
    favTemplates.forEach((tpl) => {
      const pill = document.createElement("button");
      pill.className = "fav-pill" + (tpl.id === currentType ? " active" : "");
      pill.textContent = tpl.label;
      pill.onclick = () => {
        document.getElementById("type").value = tpl.id;
        onTypeChange();
      };
      pillWrap.appendChild(pill);
    });
    wrap.appendChild(pillWrap);
  }
  updateFavToggleBtn();
}

function updateFavToggleBtn() {
  const btn = document.getElementById("favToggleBtn");
  if (!btn || !currentType) return;
  const isFav = FAVORITE_TEMPLATE_IDS.includes(currentType);
  btn.textContent = isFav ? "⭐" : "☆";
  btn.title = isFav ? "즐겨찾기 해제" : "즐겨찾기에 추가";
}

function toggleFavoriteTemplate() {
  if (!currentType) return;
  if (FAVORITE_TEMPLATE_IDS.includes(currentType)) {
    FAVORITE_TEMPLATE_IDS = FAVORITE_TEMPLATE_IDS.filter((id) => id !== currentType);
  } else {
    FAVORITE_TEMPLATE_IDS.push(currentType);
  }
  saveData();
  renderFavoriteRow();
}

function countFaqTopicItems(topic) {
  return (topic.groups || []).reduce((sum, g) => sum + (g.items ? g.items.length : 0), 0);
}

function filterPoaAdminItems(items) {
  const q = poaAdminQuery.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => [it.applicant, it.shipper].filter(Boolean).join(" ").toLowerCase().includes(q));
}

function renderAdminList() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  if (adminSection === "notice") { renderNoticeAdminBody(body); return; }
  if (adminSection === "feedback") { renderFeedbackAdminBody(body); return; }
  if (adminSection === "ltMail") { renderLtMailAdminBody(body); return; }

  const addBtn = document.createElement("button");
  addBtn.className = "btn generate-btn full";
  addBtn.textContent = adminSection === "templates" ? "＋ 새 메일 유형 추가"
    : adminSection === "ntf" ? "＋ 새 공문 유형 추가"
    : adminSection === "procedures" ? "＋ 새 절차 추가"
    : adminSection === "faqs" ? "＋ 새 FAQ 추가"
    : adminSection === "faqTopics" ? "＋ 새 FAQ 그룹 추가"
    : adminSection === "resources" ? "＋ 새 자료 추가"
    : adminSection === "contacts" ? "＋ 연락처 1건 직접 추가"
    : adminSection === "vacations" ? "＋ 새 휴가 일정 추가"
    : adminSection === "vacationMembers" ? "＋ 새 팀원 추가"
    : adminSection === "quotes" ? "＋ 새 문구 추가"
    : adminSection === "poa" ? "＋ 업체 1건 직접 추가"
    : adminSection === "holidays" ? "＋ 공휴일 추가"
    : "＋ 새 일정 추가";
  addBtn.onclick = () => openAdminNew();
  body.appendChild(addBtn);

  if (adminSection === "ntf") {
    renderNtfLetterheadBox(body);
  }

  if (adminSection === "templates" || adminSection === "ntf" || adminSection === "resources") {
    renderGroupRenameBox(body);
  }

  if (adminSection === "contacts") {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.style.margin = "10px 0";
    hint.innerHTML = "엑셀에서 국가/지역 · 구분 · 담당자/팀 · ZIM 이메일 · GSL 이메일, 순서로 최대 5개 열(머리글 행은 제외)을 선택해 복사한 다음 붙여넣으세요. GSL 이메일이 없는 행은 그 칸만 비워두면 돼요(빈 칸도 괜찮아요). 병합된 셀이라 빈칸으로 복사돼도 국가/지역과 구분은 각각 바로 위 값으로 자동 채워지고, 화면 표에서도 같은 국가/구분이 연속되면 자동으로 병합돼 보여요.<br><br>"
      + "<b>\"APAC\"처럼 새 그룹으로 묶고 싶으면</b>, 붙여넣을 내용 맨 위에 다른 칸 없이 그룹 이름만 있는 줄 하나를 넣어주세요(예: 그냥 \"APAC\"만 있고 탭도 없는 한 줄). 그 줄이 그룹 제목이 되고, 그 아래 붙어있는 행들이 접었다 펼 수 있는 그 그룹의 하위 항목으로 들어가요. 이 그룹 줄을 안 넣으면, \"추가하기\"로 이어붙였을 때 화면상 바로 이전 그룹 밑에 딸려있는 것처럼 보일 수 있어요.";
    body.appendChild(hint);

    const pasteArea = document.createElement("textarea");
    pasteArea.rows = 6;
    pasteArea.id = "contactsPasteArea";
    pasteArea.placeholder = "여기에 엑셀에서 복사한 내용을 그대로 붙여넣으세요 (Ctrl+V)";
    body.appendChild(pasteArea);

    const appendBtn = document.createElement("button");
    appendBtn.className = "btn generate-btn full";
    appendBtn.style.marginBottom = "8px";
    appendBtn.textContent = "➕ 기존 표 유지하고 추가하기 (현재 " + CONTACTS.length + "건 + 새로 붙여넣은 내용)";
    appendBtn.onclick = () => appendContactsPaste(pasteArea.value);
    body.appendChild(appendBtn);

    const applyBtn = document.createElement("button");
    applyBtn.className = "btn generate-btn full";
    applyBtn.style.marginBottom = "16px";
    applyBtn.style.background = "#9ca3af";
    applyBtn.textContent = "🔁 표 전체 교체하기 (기존 " + CONTACTS.length + "건 삭제 후 새로 반영)";
    applyBtn.onclick = () => applyContactsPaste(pasteArea.value);
    body.appendChild(applyBtn);
  }

  if (adminSection === "poa") {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.style.margin = "10px 0";
    hint.innerHTML = "새로 제출된 위임장을 여기서 추가할 수 있어요. 한 줄에 하나씩, <b>신청업체, 실화주, 제출일자(선택)</b> 형식으로 콤마로 구분해서 적어주세요:<br>"
      + "<code>ABC로지스틱스, XYZ상사, 2026-08-04</code><br>제출일자를 모르면 마지막 콤마 뒤를 비워두면 돼요 (예: <code>ABC로지스틱스, XYZ상사, </code>). 현재 " + POA_LIST.length + "건이 등록돼 있어요.";
    body.appendChild(hint);

    const pasteArea = document.createElement("textarea");
    pasteArea.rows = 8;
    pasteArea.id = "poaPasteArea";
    pasteArea.placeholder = "예)\nABC로지스틱스, XYZ상사, 2026-08-04\n대흥기업, 승리미트, ";
    body.appendChild(pasteArea);

    const appendBtn = document.createElement("button");
    appendBtn.className = "btn generate-btn full";
    appendBtn.style.marginBottom = "16px";
    appendBtn.textContent = "➕ 기존 목록 유지하고 추가하기";
    appendBtn.onclick = () => appendPoaPaste(pasteArea.value);
    body.appendChild(appendBtn);

    const resetHint = document.createElement("div");
    resetHint.className = "hint";
    resetHint.style.margin = "10px 0";
    resetHint.textContent = "워드파일 기준 최신 목록으로 통째로 덮어쓰고 싶으면 아래 버튼을 쓰세요. 지금 브라우저에 있는 " + POA_LIST.length + "건은 사라지고, 최신 기본 목록(" + DEFAULT_POA_LIST.length + "건)으로 완전히 바뀌어요. 방금 직접 추가한 내용이 있다면 먼저 백업해두세요.";
    body.appendChild(resetHint);

    const resetPoaBtn = document.createElement("button");
    resetPoaBtn.className = "btn secondary-btn full";
    resetPoaBtn.style.marginBottom = "16px";
    resetPoaBtn.textContent = "🔄 최신 기본 위임장 목록(" + DEFAULT_POA_LIST.length + "건)으로 덮어쓰기";
    resetPoaBtn.onclick = () => {
      if (!confirm("지금 목록(" + POA_LIST.length + "건)을 지우고 최신 기본 목록(" + DEFAULT_POA_LIST.length + "건)으로 덮어쓸까요? 이 작업은 되돌릴 수 없어요.")) return;
      POA_LIST = JSON.parse(JSON.stringify(DEFAULT_POA_LIST));
      const ok = saveData();
      if (!ok) { alert("저장에 실패했어요."); return; }
      renderAdminList();
      refreshCurrentTab();
      alert("기본 위임장 목록 " + POA_LIST.length + "건으로 덮어썼어요 ✅");
    };
    body.appendChild(resetPoaBtn);

    const searchBox = document.createElement("input");
    searchBox.className = "contacts-filter-input";
    searchBox.id = "poaAdminSearchInput";
    searchBox.placeholder = "🔍 신청업체 또는 실화주로 검색해서 찾기 (삭제/수정할 항목 찾을 때 편해요)";
    searchBox.value = poaAdminQuery;
    searchBox.style.marginTop = "8px";
    searchBox.oninput = (e) => {
      poaAdminQuery = e.target.value;
      const cursorPos = e.target.selectionStart;
      renderAdminList();
      const newInput = document.getElementById("poaAdminSearchInput");
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(cursorPos, cursorPos);
      }
    };
    body.appendChild(searchBox);

    if (poaAdminQuery.trim()) {
      const countInfo = document.createElement("div");
      countInfo.className = "hint";
      countInfo.style.margin = "6px 0 0";
      countInfo.textContent = filterPoaAdminItems(POA_LIST).length + "건 검색됨 (전체 " + POA_LIST.length + "건 중)";
      body.appendChild(countInfo);
    }
  }

  if (adminSection === "quotes") {
    const hint2 = document.createElement("div");
    hint2.className = "hint";
    hint2.style.margin = "10px 0";
    hint2.textContent = "이 브라우저에 예전 버전(명언) 문구가 저장돼 있으면 새로 배포한 파일을 열어도 그대로 남아있을 수 있어요. 아래 버튼으로 최신 기본 문구 목록(응원 문구 + 영화 명대사)으로 되돌릴 수 있어요. 그동안 직접 추가/수정한 문구는 사라져요.";
    body.appendChild(hint2);

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn secondary-btn full";
    resetBtn.style.marginBottom = "16px";
    resetBtn.textContent = "🔄 최신 기본 문구 목록으로 초기화";
    resetBtn.onclick = () => {
      if (!confirm("지금 등록된 문구 " + QUOTES.length + "개를 지우고, 최신 기본 문구 목록으로 되돌릴까요?")) return;
      QUOTES = JSON.parse(JSON.stringify(DEFAULT_QUOTES));
      const ok = saveData();
      if (!ok) { alert("저장에 실패했어요."); return; }
      renderAdminList();
      alert("최신 기본 문구 " + QUOTES.length + "개로 초기화됐어요 ✅");
    };
    body.appendChild(resetBtn);
  }

  if (adminSection === "faqTopics") {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.style.margin = "10px 0";
    hint.textContent = "FAQ 그룹은 \"전화 응대 FAQ\"처럼, 아이콘이 붙은 카테고리(D/O, 인보이스/비용 등)를 사이드바로 보여주고 싶을 때 사용해요. FAQ 탭 위쪽에 표시됩니다.";
    body.appendChild(hint);
  }
  if (adminSection === "vacationMembers") {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.style.margin = "10px 0";
    hint.textContent = "여기서 등록한 사번·이름·총 휴가일수를 기준으로 휴가 일정 탭의 \"월별 사용 현황\" 표와 잔여일수가 자동 계산돼요.";
    body.appendChild(hint);
  }
  if (adminSection === "teamEvents") {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.style.margin = "10px 0";
    hint.textContent = "휴가·교육·출장·공휴일·회사 행사 등 무엇이든 날짜 하나에 등록하면 \"🗓 팀 일정\" 탭 캘린더에 표시돼요. 같은 날짜에 여러 개 등록해도 다 함께 보여요.";
    body.appendChild(hint);
  }

  const listWrap = document.createElement("div");
  listWrap.style.marginTop = "16px";

  const items = adminSection === "teamEvents"
    ? getSectionItems(adminSection).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : getSectionItems(adminSection);

  function createAdminItemCard(item) {
    const card = document.createElement("div");
    card.className = "tpl-card";

    const info = document.createElement("div");
    if (adminSection === "templates") {
      const tableInfo = item.table
        ? (item.table.columns && item.table.columns.length ? ` · 표 옵션 켜짐(기본 ${item.table.columns.length}열)` : " · 표 옵션 켜짐(자유 입력)")
        : "";
      info.innerHTML = `<div class="tpl-card-name">${escapeHtml(item.label)}</div>
        <div class="tpl-card-sub">입력항목 ${item.fields.length}개 · 결과물 ${item.outputs.length}개${tableInfo}</div>`;
    } else if (adminSection === "ntf") {
      const tableInfo = item.table ? ` · 표 있음(${item.table.columns.length}열)` : "";
      info.innerHTML = `<div class="tpl-card-name">${item.group ? "📁 " + escapeHtml(item.group) + " · " : ""}${escapeHtml(item.label)}</div>
        <div class="tpl-card-sub">입력항목 ${item.fields.length}개${tableInfo}</div>`;
    } else if (adminSection === "procedures") {
      const totalSteps = countProcNodeSteps(item.subItems);
      info.innerHTML = `<div class="tpl-card-name">${badgeHtml(item.category)}${escapeHtml(item.title)}</div>
        <div class="tpl-card-sub">하위 항목 ${item.subItems.length}개 · 총 단계 ${totalSteps}개</div>`;
    } else if (adminSection === "faqs") {
      info.innerHTML = `<div class="tpl-card-name">${badgeHtml(item.category)}${escapeHtml(item.question)}</div>`;
    } else if (adminSection === "faqTopics") {
      info.innerHTML = `<div class="tpl-card-name">${badgeHtml(item.category)}${item.icon ? escapeHtml(item.icon) + " " : ""}${escapeHtml(item.title)}</div>
        <div class="tpl-card-sub">그룹 ${(item.groups || []).length}개 · 질문 ${countFaqTopicItems(item)}개</div>`;
    } else if (adminSection === "resources") {
      info.innerHTML = `<div class="tpl-card-name">${badgeHtml(item.category)}${escapeHtml(item.title)}</div>
        <div class="tpl-card-sub">${item.group ? "📁 " + escapeHtml(item.group) + " · " : ""}${item.link ? escapeHtml(item.link) : "링크 미등록"}</div>`;
    } else if (adminSection === "contacts") {
      info.innerHTML = item.isHeader
        ? `<div class="tpl-card-name">📌 그룹: ${escapeHtml(item.label || "")}</div>
           <div class="tpl-card-sub">표에서 클릭해 접었다 펼 수 있는 그룹 제목이에요</div>`
        : `<div class="tpl-card-name">${escapeHtml(item.country || "국가 미지정")}${item.category ? " · " + escapeHtml(item.category) : ""}</div>
        <div class="tpl-card-sub">${escapeHtml(item.contact || "-")}${item.email ? " · " + escapeHtml(item.email) : ""}</div>`;
    } else if (adminSection === "vacations") {
      info.innerHTML = `<div class="tpl-card-name">${escapeHtml(item.name)}</div>
        <div class="tpl-card-sub">📅 ${formatDateRange(item.startDate, item.endDate)}${item.note ? " · " + escapeHtml(item.note) : ""}</div>`;
    } else if (adminSection === "vacationMembers") {
      info.innerHTML = `<div class="tpl-card-name">${escapeHtml(item.name)}</div>
        <div class="tpl-card-sub">사번 ${item.empNo || "-"} · 총 휴가일수 ${item.totalDays || 0}일</div>`;
    } else if (adminSection === "quotes") {
      info.innerHTML = `<div class="tpl-card-name">${escapeHtml(item.text || "")}</div>`;
    } else if (adminSection === "poa") {
      info.innerHTML = `<div class="tpl-card-name">${escapeHtml(item.applicant || "")} → ${escapeHtml(item.shipper || "")}</div>
        <div class="tpl-card-sub">📅 제출일자 ${formatPoaDate(item.submittedDate) || "미상"}</div>`;
    } else if (adminSection === "holidays") {
      info.innerHTML = `<div class="tpl-card-name">${escapeHtml(item.name || "")}</div>
        <div class="tpl-card-sub">📅 ${item.date || "날짜 미등록"}</div>`;
    } else {
      info.innerHTML = `<div class="tpl-card-name">${item.highlight ? '<span style="color:#dc2626">' + escapeHtml(item.text) + "</span>" : escapeHtml(item.text)}</div>
        <div class="tpl-card-sub">📅 ${item.date || "날짜 미등록"}</div>`;
    }

    const actions = document.createElement("div");
    actions.className = "tpl-card-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn secondary-btn";
    editBtn.textContent = "수정";
    editBtn.onclick = () => openAdminEdit(item.id);
    const delBtn = document.createElement("button");
    delBtn.className = "btn danger-btn";
    delBtn.textContent = "삭제";
    delBtn.onclick = () => deleteItem(item.id);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(info);
    card.appendChild(actions);
    return card;
  }

  if (adminSection === "templates" || adminSection === "ntf") {
    const groupOrder = [];
    const groupMap = {};
    const ungrouped = [];
    items.forEach((item) => {
      const g = (item.group || "").trim();
      if (g) {
        if (!groupMap[g]) { groupMap[g] = []; groupOrder.push(g); }
        groupMap[g].push(item);
      } else {
        ungrouped.push(item);
      }
    });
    ungrouped.forEach((item) => listWrap.appendChild(createAdminItemCard(item)));
    groupOrder.forEach((g) => {
      const header = document.createElement("div");
      header.className = "admin-group-header";
      header.textContent = "🗂 " + g;
      listWrap.appendChild(header);
      groupMap[g].forEach((item) => listWrap.appendChild(createAdminItemCard(item)));
    });
  } else {
    const renderItems = adminSection === "poa" ? filterPoaAdminItems(items) : items;
    renderItems.forEach((item) => listWrap.appendChild(createAdminItemCard(item)));
  }

  body.appendChild(listWrap);

  const ioRow = document.createElement("div");
  ioRow.className = "io-row";
  ioRow.innerHTML = `
    <button class="btn secondary-btn" onclick="exportAll()">⬇️ 전체 내보내기 (백업/공유)</button>
    <button class="btn secondary-btn" onclick="document.getElementById('importInput').click()">⬆️ 전체 가져오기</button>
    <button class="btn secondary-btn" onclick="document.getElementById('partialImportInput').click()">🧩 선택 가져오기 (원하는 항목만)</button>
  `;
  body.appendChild(ioRow);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.marginTop = "10px";
  hint.textContent = "내보내기는 절차·FAQ·FAQ그룹·메일템플릿·공문·자료·연락처·휴가일정·팀원 휴가일수·팀 일정을 전부 하나의 파일로 백업해요. 팀원에게 전달하면 가져오기로 동일하게 세팅할 수 있어요. (전체 가져오기 시 현재 내용 전체가 교체됩니다 — 일부만 반영하고 싶으면 '🧩 선택 가져오기'를 쓰세요, 체크한 항목만 교체되고 나머지는 그대로 남아요)";
  body.appendChild(hint);
}

async function deletePoaItemFlow(id) {
  const result = await deletePoaFromServer(id);
  if (!result.ok) {
    alert("삭제에 실패했어요. 잠시 후 다시 시도해주세요.\n(" + result.error + ")");
    return;
  }
  await loadPoaTab();
  renderAdminList();
  renderFavoriteRow();
}

async function deleteItem(id) {
  if (adminSection === "templates") {
    const item = TEMPLATES.find((t) => t.id === id);
    if (!confirm(`"${item.label}" 유형을 삭제할까요?`)) return;
    TEMPLATES = TEMPLATES.filter((t) => t.id !== id);
    FAVORITE_TEMPLATE_IDS = FAVORITE_TEMPLATE_IDS.filter((fid) => fid !== id);
  } else if (adminSection === "ntf") {
    const item = NTF_TEMPLATES.find((t) => t.id === id);
    if (!confirm(`"${item.label}" 공문 유형을 삭제할까요?`)) return;
    NTF_TEMPLATES = NTF_TEMPLATES.filter((t) => t.id !== id);
  } else if (adminSection === "procedures") {
    const item = PROCEDURES.find((t) => t.id === id);
    if (!confirm(`"${item.title}" 절차를 삭제할까요?`)) return;
    PROCEDURES = PROCEDURES.filter((t) => t.id !== id);
    FAVORITE_PROC_IDS = FAVORITE_PROC_IDS.filter((fid) => fid !== id);
  } else if (adminSection === "faqs") {
    const item = FAQS.find((t) => t.id === id);
    if (!confirm(`"${item.question}" 항목을 삭제할까요?`)) return;
    FAQS = FAQS.filter((t) => t.id !== id);
    FAVORITE_FAQ_IDS = FAVORITE_FAQ_IDS.filter((fid) => fid !== id);
  } else if (adminSection === "faqTopics") {
    const item = FAQ_TOPICS.find((t) => t.id === id);
    if (!confirm(`"${item.title}" FAQ 그룹을 삭제할까요?`)) return;
    FAQ_TOPICS = FAQ_TOPICS.filter((t) => t.id !== id);
  } else if (adminSection === "resources") {
    const item = RESOURCES.find((t) => t.id === id);
    if (!confirm(`"${item.title}" 자료를 삭제할까요?`)) return;
    RESOURCES = RESOURCES.filter((t) => t.id !== id);
  } else if (adminSection === "contacts") {
    const item = CONTACTS.find((t) => t.id === id);
    if (!confirm(`"${item.isHeader ? item.label : (item.country || item.contact || "이")}" 연락처를 삭제할까요?`)) return;
    CONTACTS = CONTACTS.filter((t) => t.id !== id);
  } else if (adminSection === "vacations") {
    const item = VACATIONS.find((t) => t.id === id);
    if (!confirm(`"${item.name}"님의 휴가 일정을 삭제할까요?`)) return;
    if (CORE_SHEET_API_URL) {
      const result = await deleteVacationFromServer(id);
      if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
      await syncVacationsFromServer();
      renderAdminList();
      refreshCurrentTab();
      return;
    }
    VACATIONS = VACATIONS.filter((t) => t.id !== id);
  } else if (adminSection === "vacationMembers") {
    const item = VACATION_MEMBERS.find((t) => t.id === id);
    if (!confirm(`"${item.name}"님을 팀원 목록에서 삭제할까요? (기존 휴가 일정 기록은 그대로 남아요)`)) return;
    VACATION_MEMBERS = VACATION_MEMBERS.filter((t) => t.id !== id);
  } else if (adminSection === "quotes") {
    const item = QUOTES.find((t) => t.id === id);
    if (!confirm(`"${item.text}" 문구를 삭제할까요?`)) return;
    QUOTES = QUOTES.filter((t) => t.id !== id);
  } else if (adminSection === "poa") {
    const item = POA_LIST.find((t) => t.id === id);
    if (!confirm(`"${item.applicant} → ${item.shipper}" 항목을 위임장 목록에서 삭제할까요?`)) return;
    if (POA_SHEET_API_URL) {
      deletePoaItemFlow(id); // 서버 연동이 켜져 있으면 서버에서 지우고 최신 목록으로 갱신 (비동기라 아래 공용 로직은 건너뜀)
      return;
    }
    POA_LIST = POA_LIST.filter((t) => t.id !== id);
  } else if (adminSection === "holidays") {
    const item = HOLIDAYS.find((t) => t.id === id);
    if (!confirm(`"${item.name}" (${item.date}) 공휴일을 삭제할까요?`)) return;
    if (CORE_SHEET_API_URL) {
      const result = await deleteHolidayFromServer(id);
      if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
      await syncHolidaysFromServer();
      renderAdminList();
      refreshCurrentTab();
      return;
    }
    HOLIDAYS = HOLIDAYS.filter((t) => t.id !== id);
  } else {
    const item = TEAM_EVENTS.find((t) => t.id === id);
    if (!confirm(`"${item.text}" 일정을 삭제할까요?`)) return;
    if (CORE_SHEET_API_URL) {
      const result = await deleteTeamEventFromServer(id);
      if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
      await syncTeamEventsFromServer();
      renderAdminList();
      refreshCurrentTab();
      return;
    }
    TEAM_EVENTS = TEAM_EVENTS.filter((t) => t.id !== id);
  }
  saveData();
  renderAdminList();
  refreshCurrentTab();
  renderFavoriteRow();
}

function refreshCurrentTab() {
  if (mainTab === "templates") initTypeSelect();
  if (mainTab === "ntf") initNtfTypeSelect();
  if (mainTab === "procedures") renderProcList();
  if (mainTab === "faqs") { renderFaqTopics(); renderFaqList(); }
  if (mainTab === "resources") renderResList();
  if (mainTab === "vessels") loadVesselTab();
  if (mainTab === "contacts") renderContactsTable();
  if (mainTab === "poa") loadPoaTab();
  if (mainTab === "obl") loadOblTab();
  if (mainTab === "vacations") loadVacationTab();
  if (mainTab === "teamEvents") loadTeamCalendarTab();
}

function openAdminNew() {
  if (adminSection === "templates") {
    draft = { id: null, label: "", group: "", guide: "", fields: [], table: null, outputs: [{ id: genId("o"), name: "화주 답장", text: "", to: "", subject: "", attachments: [], attachmentLink: "", images: [] }] };
  } else if (adminSection === "ntf") {
    draft = { id: null, label: "", group: "", guide: "", fields: [], table: null, outputs: [{ id: genId("o"), name: "화주 안내", text: "", to: "", subject: "", attachments: [], attachmentLink: "" }] };
  } else if (adminSection === "procedures") {
    draft = { id: null, category: "import", title: "", subItems: [{ id: genId("si"), name: "", steps: [""], attachments: [] }] };
  } else if (adminSection === "faqs") {
    draft = { id: null, category: "common", question: "", answer: "", image: "", attachments: [] };
  } else if (adminSection === "faqTopics") {
    draft = {
      id: null, category: "import", icon: "📞", title: "",
      groups: [{ id: genId("g"), icon: "📦", name: "", items: [{ id: genId("it"), question: "", answer: "", image: "" }] }]
    };
  } else if (adminSection === "resources") {
    draft = { id: null, category: "common", group: "", title: "", description: "", link: "", attachments: [] };
  } else if (adminSection === "contacts") {
    draft = { id: null, country: "", contact: "", email: "", email2: "" };
  } else if (adminSection === "vacations") {
    draft = { id: null, name: "", startDate: "", endDate: "", note: "" };
  } else if (adminSection === "vacationMembers") {
    draft = { id: null, empNo: "", name: "", totalDays: 15 };
  } else if (adminSection === "quotes") {
    draft = { id: null, text: "" };
  } else if (adminSection === "poa") {
    draft = { id: null, applicant: "", shipper: "", submittedDate: "" };
  } else if (adminSection === "holidays") {
    draft = { id: null, date: "", name: "" };
  } else {
    draft = { id: null, date: "", text: "", highlight: false };
  }
  renderAdminEdit();
}

function openAdminEdit(id) {
  const items = getSectionItems(adminSection);
  const item = items.find((t) => t.id === id);
  draft = JSON.parse(JSON.stringify(item));
  renderAdminEdit();
}

function renderAdminEdit() {
  if (adminSection === "templates") return renderTemplateEdit();
  if (adminSection === "ntf") return renderNtfTemplateEdit();
  if (adminSection === "procedures") return renderProcedureEdit();
  if (adminSection === "faqs") return renderFaqEdit();
  if (adminSection === "faqTopics") return renderFaqTopicEdit();
  if (adminSection === "resources") return renderResourceEdit();
  if (adminSection === "contacts") return renderContactEdit();
  if (adminSection === "vacations") return renderVacationEdit();
  if (adminSection === "vacationMembers") return renderVacationMemberEdit();
  if (adminSection === "quotes") return renderQuoteEdit();
  if (adminSection === "poa") return renderPoaEdit();
  if (adminSection === "holidays") return renderHolidayEdit();
  return renderTeamEventEdit();
}

function categorySelectHtml(current) {
  return CATEGORY_ORDER.map((c) => `<option value="${c}" ${c === current ? "selected" : ""}>${CATEGORY_LABELS[c]}</option>`).join("");
}

/* ---- 절차 편집 ---- */
function renderProcedureEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("구분"));
  const catSelect = document.createElement("select");
  catSelect.innerHTML = categorySelectHtml(draft.category);
  catSelect.onchange = (e) => { draft.category = e.target.value; };
  body.appendChild(catSelect);

  body.appendChild(makeLabel("절차 제목"));
  const titleInput = document.createElement("input");
  titleInput.value = draft.title;
  titleInput.placeholder = "예: 수입 화물 도착지 변경 요청 처리";
  titleInput.oninput = (e) => { draft.title = e.target.value; };
  body.appendChild(titleInput);

  const subTitle = document.createElement("div");
  subTitle.className = "section-title";
  subTitle.textContent = "📝 하위 항목 (알약 버튼으로 표시돼요. 예: ETA 문의 / BL TYPE 문의)";
  body.appendChild(subTitle);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.marginBottom = "8px";
  hint.textContent = "하위 항목이 1개뿐이면 알약 버튼 없이 내용만 바로 보여져요. 각 항목은 \"🗂 하위 카테고리로 전환\" 버튼으로 그 안에 또 하위 항목(예: D/O, 인보이스/비용 같은 카테고리)을 만들 수 있어요.";
  body.appendChild(hint);

  const subItemsWrap = document.createElement("div");
  subItemsWrap.id = "subItemsWrap";
  body.appendChild(subItemsWrap);
  renderSubItemRows(subItemsWrap, draft.subItems);

  const addSubItemBtn = document.createElement("button");
  addSubItemBtn.className = "add-row-btn";
  addSubItemBtn.textContent = "＋ 하위 항목 추가";
  addSubItemBtn.onclick = () => {
    draft.subItems.push({ id: genId("si"), name: "", steps: [""], attachments: [] });
    renderSubItemRows(subItemsWrap, draft.subItems);
  };
  body.appendChild(addSubItemBtn);

  appendSaveCancelButtons(body, saveProcedure);
}

/* items: 편집 중인 하위 항목 배열 (draft.subItems 또는 그 안의 중첩 배열).
   각 항목은 steps(단계/답변) 또는 subItems(하위 카테고리) 둘 중 하나를 가짐 - 재귀적으로 렌더링 */
function renderSubItemRows(wrap, items) {
  wrap.innerHTML = "";
  items.forEach((sub, subIdx) => {
    const block = document.createElement("div");
    block.className = "subitem-edit-block";

    const top = document.createElement("div");
    top.className = "subitem-edit-top";
    const nameInput = document.createElement("input");
    nameInput.value = sub.name;
    nameInput.placeholder = "하위 항목 이름 (예: ETA 문의 또는 D/O)";
    nameInput.oninput = (e) => { sub.name = e.target.value; };
    const removeSubBtn = document.createElement("button");
    removeSubBtn.className = "remove-row";
    removeSubBtn.textContent = "항목 삭제";
    removeSubBtn.style.display = items.length > 1 ? "block" : "none";
    removeSubBtn.onclick = () => { items.splice(subIdx, 1); renderSubItemRows(wrap, items); };
    top.appendChild(nameInput);
    top.appendChild(removeSubBtn);
    block.appendChild(top);

    const isBranch = !!(sub.subItems && sub.subItems.length);

    const modeBtn = document.createElement("button");
    modeBtn.className = "btn secondary-btn";
    modeBtn.style.fontSize = "12px";
    modeBtn.style.padding = "6px 12px";
    modeBtn.style.marginBottom = "10px";
    modeBtn.textContent = isBranch ? "📋 단계/답변 목록으로 전환" : "🗂 하위 카테고리로 전환 (한 번 더 나누기)";
    modeBtn.onclick = () => {
      if (isBranch) {
        delete sub.subItems;
        sub.steps = [""];
        if (!sub.attachments) sub.attachments = [];
      } else {
        delete sub.steps;
        sub.subItems = [{ id: genId("si"), name: "", steps: [""], attachments: [] }];
      }
      renderSubItemRows(wrap, items);
    };
    block.appendChild(modeBtn);

    if (isBranch) {
      const nestedWrap = document.createElement("div");
      nestedWrap.className = "subitem-nested-wrap";
      block.appendChild(nestedWrap);
      renderSubItemRows(nestedWrap, sub.subItems);

      const addNestedBtn = document.createElement("button");
      addNestedBtn.className = "add-row-btn";
      addNestedBtn.textContent = "＋ 하위 항목 추가";
      addNestedBtn.onclick = () => {
        sub.subItems.push({ id: genId("si"), name: "", steps: [""], attachments: [] });
        renderSubItemRows(nestedWrap, sub.subItems);
      };
      block.appendChild(addNestedBtn);
    } else {
      const stepsLabel = document.createElement("div");
      stepsLabel.className = "subitem-edit-steps-title";
      stepsLabel.textContent = "단계 / 답변 내용 (처리 순서대로, FAQ라면 답변을 한 줄씩)";
      block.appendChild(stepsLabel);

      const stepsWrap = document.createElement("div");
      block.appendChild(stepsWrap);
      if (!sub.steps || sub.steps.length === 0) sub.steps = [""];
      renderStepRows(stepsWrap, sub);

      const addStepBtn = document.createElement("button");
      addStepBtn.className = "add-row-btn";
      addStepBtn.textContent = "＋ 단계 추가";
      addStepBtn.onclick = () => { sub.steps.push(""); renderStepRows(stepsWrap, sub); };
      block.appendChild(addStepBtn);

      const addImgBtn = document.createElement("button");
      addImgBtn.className = "add-row-btn";
      addImgBtn.textContent = "🖼️ 이미지 추가";
      addImgBtn.onclick = () => {
        triggerImageUpload((dataUrl) => {
          sub.steps.push(dataUrl);
          renderStepRows(stepsWrap, sub);
        });
      };
      block.appendChild(addImgBtn);

      const addTableBtn = document.createElement("button");
      addTableBtn.className = "add-row-btn";
      addTableBtn.textContent = "📊 표 추가";
      addTableBtn.onclick = () => {
        sub.steps.push({ type: "table", caption: "", headers: ["열1", "열2"], rows: [["", ""]] });
        renderStepRows(stepsWrap, sub);
      };
      block.appendChild(addTableBtn);

      const addLinkBtn = document.createElement("button");
      addLinkBtn.className = "add-row-btn";
      addLinkBtn.textContent = "🔗 링크 추가";
      addLinkBtn.onclick = () => {
        sub.steps.push({ type: "link", label: "", url: "" });
        renderStepRows(stepsWrap, sub);
      };
      block.appendChild(addLinkBtn);

      renderAttachEditSection(block, sub);
      renderExampleEmailEditSection(block, sub);
    }

    wrap.appendChild(block);
  });
}

/* 절차 단계 안의 표(table)를 관리 화면에서 직접 편집 - 제목/열 추가삭제/행 추가삭제/셀 내용까지 전부 수정 가능 */
function renderTableEditor(container, tableObj, onDeleteTable) {
  container.innerHTML = "";

  const capInput = document.createElement("input");
  capInput.value = tableObj.caption || "";
  capInput.placeholder = "표 제목 (선택)";
  capInput.style.marginBottom = "6px";
  capInput.oninput = () => { tableObj.caption = capInput.value; };
  container.appendChild(capInput);

  const grid = document.createElement("div");
  grid.className = "step-table-editor-grid";
  container.appendChild(grid);

  function renderGrid() {
    grid.innerHTML = "";
    if (!tableObj.headers) tableObj.headers = [];
    if (!tableObj.rows) tableObj.rows = [];

    const headerRow = document.createElement("div");
    headerRow.className = "ste-row ste-header-row";
    tableObj.headers.forEach((h, ci) => {
      const cell = document.createElement("input");
      cell.value = h;
      cell.placeholder = "열 제목";
      cell.oninput = () => { tableObj.headers[ci] = cell.value; };
      headerRow.appendChild(cell);
      const delColBtn = document.createElement("button");
      delColBtn.className = "ste-col-del";
      delColBtn.textContent = "✕";
      delColBtn.title = "이 열 삭제";
      delColBtn.onclick = () => {
        tableObj.headers.splice(ci, 1);
        tableObj.rows.forEach((r) => r.splice(ci, 1));
        renderGrid();
      };
      headerRow.appendChild(delColBtn);
    });
    const addColBtn = document.createElement("button");
    addColBtn.className = "ste-add-col";
    addColBtn.textContent = "+ 열";
    addColBtn.onclick = () => {
      tableObj.headers.push("새 열");
      tableObj.rows.forEach((r) => r.push(""));
      renderGrid();
    };
    headerRow.appendChild(addColBtn);
    grid.appendChild(headerRow);

    tableObj.rows.forEach((rowArr, ri) => {
      const rowEl = document.createElement("div");
      rowEl.className = "ste-row";
      rowArr.forEach((cellVal, ci) => {
        const cell = document.createElement("input");
        cell.value = cellVal;
        cell.oninput = () => { tableObj.rows[ri][ci] = cell.value; };
        rowEl.appendChild(cell);
      });
      const delRowBtn = document.createElement("button");
      delRowBtn.className = "ste-row-del";
      delRowBtn.textContent = "행 삭제";
      delRowBtn.onclick = () => { tableObj.rows.splice(ri, 1); renderGrid(); };
      rowEl.appendChild(delRowBtn);
      grid.appendChild(rowEl);
    });
  }
  renderGrid();

  const addRowBtn = document.createElement("button");
  addRowBtn.className = "btn secondary-btn";
  addRowBtn.style.cssText = "margin-top:6px;font-size:12px;padding:5px 10px;";
  addRowBtn.textContent = "+ 행 추가";
  addRowBtn.onclick = () => {
    const newRow = new Array((tableObj.headers || []).length).fill("");
    tableObj.rows.push(newRow);
    renderGrid();
  };
  container.appendChild(addRowBtn);

  const delTableBtn = document.createElement("button");
  delTableBtn.className = "remove-row";
  delTableBtn.style.cssText = "margin-top:8px;margin-left:8px;";
  delTableBtn.textContent = "🗑️ 표 전체 삭제";
  delTableBtn.onclick = onDeleteTable;
  container.appendChild(delTableBtn);
}

function renderStepRows(wrap, sub) {
  wrap.innerHTML = "";
  sub.steps.forEach((s, idx) => {
    const row = document.createElement("div");
    row.style.marginBottom = "6px";
    if (isImageValue(s)) {
      row.className = "step-image-edit-wrap";
      const img = document.createElement("img");
      img.src = s;
      img.className = "step-image-thumb";
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-row";
      removeBtn.textContent = "이미지 삭제";
      removeBtn.onclick = () => { sub.steps.splice(idx, 1); renderStepRows(wrap, sub); };
      row.appendChild(img);
      row.appendChild(removeBtn);
    } else if (isTableValue(s)) {
      row.className = "step-table-edit-wrap";
      renderTableEditor(row, s, () => { sub.steps.splice(idx, 1); renderStepRows(wrap, sub); });
    } else if (isLinkValue(s)) {
      row.className = "step-link-edit-wrap";
      const labelInput = document.createElement("input");
      labelInput.value = s.label || "";
      labelInput.placeholder = "버튼에 보일 문구 (예: USSAV 터미널 스케줄)";
      labelInput.oninput = (e) => { s.label = e.target.value; };
      const urlInput = document.createElement("input");
      urlInput.value = s.url || "";
      urlInput.placeholder = "https://...";
      urlInput.oninput = (e) => { s.url = e.target.value; };
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-row";
      removeBtn.textContent = "링크 삭제";
      removeBtn.onclick = () => { sub.steps.splice(idx, 1); renderStepRows(wrap, sub); };
      row.appendChild(labelInput);
      row.appendChild(urlInput);
      row.appendChild(removeBtn);
    } else {
      row.className = "field-row-top";
      const input = document.createElement("input");
      input.value = s;
      input.placeholder = (idx + 1) + "번째 단계";
      input.oninput = (e) => { sub.steps[idx] = e.target.value; };
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-row";
      removeBtn.textContent = "삭제";
      removeBtn.onclick = () => { sub.steps.splice(idx, 1); renderStepRows(wrap, sub); };
      row.appendChild(input);
      row.appendChild(removeBtn);
    }
    wrap.appendChild(row);
  });
}

/* 저장 전에 subItems 트리를 재귀적으로 정리(빈 값 제거)하고 검증 */
function cleanSubItemTree(items) {
  return items
    .map((it) => {
      const cleaned = { id: it.id, name: (it.name || "").trim() };
      if (it.subItems && it.subItems.length) {
        cleaned.subItems = cleanSubItemTree(it.subItems);
      } else {
        cleaned.steps = (it.steps || []).filter((s) => (typeof s === "string" ? s.trim() !== "" : !!s));
        cleaned.attachments = it.attachments || [];
      }
      return cleaned;
    })
    .filter((it) => it.name !== "" || (it.subItems ? it.subItems.length > 0 : it.steps.length > 0));
}

function validateSubItemTree(items) {
  for (const it of items) {
    if (!it.name) return "모든 하위 항목의 이름을 입력해주세요.";
    if (it.subItems) {
      if (it.subItems.length === 0) return `"${it.name}" 안에 하위 항목을 최소 1개 추가해주세요.`;
      const err = validateSubItemTree(it.subItems);
      if (err) return err;
    } else if (!it.steps || it.steps.length === 0) {
      return `"${it.name}" 항목에 단계/답변을 최소 1개 이상 입력해주세요.`;
    }
  }
  return null;
}

function saveProcedure() {
  if (!draft.title.trim()) { alert("절차 제목을 입력해주세요."); return; }
  draft.subItems = cleanSubItemTree(draft.subItems);
  if (draft.subItems.length === 0) { alert("하위 항목을 최소 1개 이상 입력해주세요."); return; }
  const err = validateSubItemTree(draft.subItems);
  if (err) { alert(err); return; }
  commitDraft(PROCEDURES, (list) => { PROCEDURES = list; });
}

/* ---- FAQ 편집 ---- */
/* 재사용 가능한 "이미지 첨부(선택사항)" 컨트롤 - getValue/setValue로 아무 필드에나 연결 가능 */
/* 이미지를 여러 장 추가/삭제할 수 있는 컨트롤 (메일 템플릿 본문 이미지처럼 여러 장 첨부가 필요한 곳에서 사용) */
function createMultiImageFieldControl(getImages, setImages) {
  const wrap = document.createElement("div");
  function render() {
    wrap.innerHTML = "";
    const images = getImages() || [];
    if (images.length > 0) {
      const grid = document.createElement("div");
      grid.className = "multi-image-grid";
      images.forEach((src, i) => {
        const item = document.createElement("div");
        item.className = "multi-image-item";
        const img = document.createElement("img");
        img.src = src;
        img.className = "image-field-preview";
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "multi-image-remove";
        removeBtn.textContent = "✕";
        removeBtn.title = "이 이미지 삭제";
        removeBtn.onclick = () => {
          const next = images.slice();
          next.splice(i, 1);
          setImages(next);
          render();
        };
        item.appendChild(img);
        item.appendChild(removeBtn);
        grid.appendChild(item);
      });
      wrap.appendChild(grid);
    }

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-row-btn";
    addBtn.textContent = images.length > 0 ? "🖼️ 이미지 더 추가하기 (" + images.length + "장 등록됨)" : "🖼️ 이미지 첨부 (선택사항, 여러 장 가능)";
    addBtn.onclick = () => {
      triggerImageUpload((dataUrl) => {
        const next = (getImages() || []).concat([dataUrl]);
        setImages(next);
        render();
      });
    };
    wrap.appendChild(addBtn);
  }
  render();
  return wrap;
}

function createImageFieldControl(getValue, setValue) {
  const wrap = document.createElement("div");
  function render() {
    wrap.innerHTML = "";
    const value = getValue();
    if (value) {
      const row = document.createElement("div");
      row.className = "image-field-wrap";
      const img = document.createElement("img");
      img.src = value;
      img.className = "image-field-preview";
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-row";
      removeBtn.textContent = "이미지 삭제";
      removeBtn.onclick = () => { setValue(""); render(); };
      row.appendChild(img);
      row.appendChild(removeBtn);
      wrap.appendChild(row);
    } else {
      const addBtn = document.createElement("button");
      addBtn.className = "add-row-btn";
      addBtn.textContent = "🖼️ 이미지 첨부 (선택사항)";
      addBtn.onclick = () => {
        triggerImageUpload((dataUrl) => { setValue(dataUrl); render(); });
      };
      wrap.appendChild(addBtn);
    }
  }
  render();
  return wrap;
}

function renderFaqEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("구분"));
  const catSelect = document.createElement("select");
  catSelect.innerHTML = categorySelectHtml(draft.category);
  catSelect.onchange = (e) => { draft.category = e.target.value; };
  body.appendChild(catSelect);

  body.appendChild(makeLabel("질문"));
  const qInput = document.createElement("input");
  qInput.value = draft.question;
  qInput.placeholder = "예: ERS 비용은 누가 요청해야 하나요?";
  qInput.oninput = (e) => { draft.question = e.target.value; };
  body.appendChild(qInput);

  body.appendChild(makeLabel("답변"));
  const aInput = document.createElement("textarea");
  aInput.style.height = "140px";
  aInput.value = draft.answer;
  aInput.placeholder = "답변 내용을 적어주세요";
  aInput.oninput = (e) => { draft.answer = e.target.value; };
  body.appendChild(aInput);

  body.appendChild(makeLabel("이미지"));
  body.appendChild(createImageFieldControl(() => draft.image || "", (v) => { draft.image = v; }));

  renderAttachEditSection(body, draft);

  appendSaveCancelButtons(body, saveFaq);
}

function saveFaq() {
  if (!draft.question.trim()) { alert("질문을 입력해주세요."); return; }
  commitDraft(FAQS, (list) => { FAQS = list; });
}

/* ---- FAQ 그룹(전화 응대 FAQ처럼 아이콘 사이드바로 보여주는 FAQ) 편집 ---- */
function renderFaqTopicEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("구분"));
  const catSelect = document.createElement("select");
  catSelect.innerHTML = categorySelectHtml(draft.category);
  catSelect.onchange = (e) => { draft.category = e.target.value; };
  body.appendChild(catSelect);

  const iconTitleRow = document.createElement("div");
  iconTitleRow.className = "subitem-edit-top";
  const iconInput = document.createElement("input");
  iconInput.value = draft.icon || "";
  iconInput.placeholder = "아이콘 (예: 📞)";
  iconInput.style.maxWidth = "90px";
  iconInput.oninput = (e) => { draft.icon = e.target.value; };
  const titleInput = document.createElement("input");
  titleInput.value = draft.title;
  titleInput.placeholder = "FAQ 그룹 제목 (예: 전화 응대 FAQ)";
  titleInput.oninput = (e) => { draft.title = e.target.value; };
  iconTitleRow.appendChild(iconInput);
  iconTitleRow.appendChild(titleInput);
  body.appendChild(makeLabel("아이콘 + 그룹 제목"));
  body.appendChild(iconTitleRow);

  const groupsTitle = document.createElement("div");
  groupsTitle.className = "section-title";
  groupsTitle.textContent = "🗂 카테고리 (사이드바에 아이콘+이름으로 보여져요. 예: 🍊 D/O, 📄 인보이스/비용)";
  body.appendChild(groupsTitle);

  const groupsWrap = document.createElement("div");
  groupsWrap.id = "faqGroupsWrap";
  body.appendChild(groupsWrap);
  renderFaqGroupRows(groupsWrap);

  const addGroupBtn = document.createElement("button");
  addGroupBtn.className = "add-row-btn";
  addGroupBtn.textContent = "＋ 카테고리 추가";
  addGroupBtn.onclick = () => {
    draft.groups.push({ id: genId("g"), icon: "📦", name: "", items: [{ id: genId("it"), question: "", answer: "", image: "" }] });
    renderFaqGroupRows(groupsWrap);
  };
  body.appendChild(addGroupBtn);

  appendSaveCancelButtons(body, saveFaqTopic);
}

function renderFaqGroupRows(wrap) {
  wrap.innerHTML = "";
  draft.groups.forEach((group, gIdx) => {
    const block = document.createElement("div");
    block.className = "subitem-edit-block";

    const top = document.createElement("div");
    top.className = "subitem-edit-top";
    const iconInput = document.createElement("input");
    iconInput.value = group.icon || "";
    iconInput.placeholder = "아이콘";
    iconInput.style.maxWidth = "70px";
    iconInput.oninput = (e) => { group.icon = e.target.value; };
    const nameInput = document.createElement("input");
    nameInput.value = group.name;
    nameInput.placeholder = "카테고리 이름 (예: D/O)";
    nameInput.oninput = (e) => { group.name = e.target.value; };
    const removeGroupBtn = document.createElement("button");
    removeGroupBtn.className = "remove-row";
    removeGroupBtn.textContent = "카테고리 삭제";
    removeGroupBtn.style.display = draft.groups.length > 1 ? "block" : "none";
    removeGroupBtn.onclick = () => { draft.groups.splice(gIdx, 1); renderFaqGroupRows(wrap); };
    top.appendChild(iconInput);
    top.appendChild(nameInput);
    top.appendChild(removeGroupBtn);
    block.appendChild(top);

    const itemsLabel = document.createElement("div");
    itemsLabel.className = "subitem-edit-steps-title";
    itemsLabel.textContent = "질문 / 답변";
    block.appendChild(itemsLabel);

    const itemsWrap = document.createElement("div");
    block.appendChild(itemsWrap);
    if (!group.items || group.items.length === 0) group.items = [{ id: genId("it"), question: "", answer: "", image: "" }];
    renderFaqGroupItemRows(itemsWrap, group);

    const addItemBtn = document.createElement("button");
    addItemBtn.className = "add-row-btn";
    addItemBtn.textContent = "＋ 질문 추가";
    addItemBtn.onclick = () => {
      group.items.push({ id: genId("it"), question: "", answer: "", image: "" });
      renderFaqGroupItemRows(itemsWrap, group);
    };
    block.appendChild(addItemBtn);

    wrap.appendChild(block);
  });
}

function renderFaqGroupItemRows(wrap, group) {
  wrap.innerHTML = "";
  group.items.forEach((item, idx) => {
    const itemBlock = document.createElement("div");
    itemBlock.className = "subitem-edit-block";
    itemBlock.style.background = "#fff";

    const qInput = document.createElement("input");
    qInput.value = item.question;
    qInput.placeholder = "질문 (예: D/O 신청은 어디서 하나요?)";
    qInput.oninput = (e) => { item.question = e.target.value; };
    itemBlock.appendChild(qInput);

    const aInput = document.createElement("textarea");
    aInput.style.height = "80px";
    aInput.value = item.answer;
    aInput.placeholder = "답변";
    aInput.oninput = (e) => { item.answer = e.target.value; };
    itemBlock.appendChild(aInput);

    itemBlock.appendChild(createImageFieldControl(() => item.image || "", (v) => { item.image = v; }));

    const removeItemBtn = document.createElement("button");
    removeItemBtn.className = "remove-row";
    removeItemBtn.textContent = "질문 삭제";
    removeItemBtn.style.display = group.items.length > 1 ? "block" : "none";
    removeItemBtn.onclick = () => { group.items.splice(idx, 1); renderFaqGroupItemRows(wrap, group); };
    itemBlock.appendChild(removeItemBtn);

    wrap.appendChild(itemBlock);
  });
}

function saveFaqTopic() {
  if (!draft.title.trim()) { alert("FAQ 그룹 제목을 입력해주세요."); return; }
  draft.groups = draft.groups
    .map((g) => ({
      id: g.id, icon: (g.icon || "").trim(), name: (g.name || "").trim(),
      items: (g.items || [])
        .map((it) => ({ id: it.id, question: (it.question || "").trim(), answer: (it.answer || "").trim(), image: it.image || "" }))
        .filter((it) => it.question !== "" || it.answer !== "")
    }))
    .filter((g) => g.name !== "" && g.items.length > 0);
  if (draft.groups.length === 0) { alert("카테고리를 최소 1개 이상, 질문도 1개 이상 입력해주세요."); return; }
  for (const g of draft.groups) {
    for (const it of g.items) {
      if (!it.question) { alert(`"${g.name}" 카테고리에 질문을 입력해주세요.`); return; }
      if (!it.answer) { alert(`"${it.question}" 질문에 답변을 입력해주세요.`); return; }
    }
  }
  commitDraft(FAQ_TOPICS, (list) => { FAQ_TOPICS = list; });
}

/* ---- 자료 편집 ---- */
function renderResourceEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("구분"));
  const catSelect = document.createElement("select");
  catSelect.innerHTML = categorySelectHtml(draft.category);
  catSelect.onchange = (e) => { draft.category = e.target.value; };
  body.appendChild(catSelect);

  body.appendChild(makeLabel("자료 이름"));
  const titleInput = document.createElement("input");
  titleInput.value = draft.title;
  titleInput.placeholder = "예: myZIM 로그인 페이지";
  titleInput.oninput = (e) => { draft.title = e.target.value; };
  body.appendChild(titleInput);

  const groupInput = document.createElement("input");
  groupInput.value = draft.group || "";
  groupInput.placeholder = "예: 공문 관련 모음 (비워두면 그룹 없이 개별로 표시돼요)";
  groupInput.setAttribute("list", "resourceGroupList");
  groupInput.oninput = (e) => { draft.group = e.target.value; };
  body.appendChild(makeLabel("그룹 (선택사항 - 비슷한 자료끼리 폴더로 묶어서 보여줘요)"));
  body.appendChild(groupInput);

  const groupDatalist = document.createElement("datalist");
  groupDatalist.id = "resourceGroupList";
  Array.from(new Set(RESOURCES.map((r) => r.group).filter(Boolean))).forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    groupDatalist.appendChild(opt);
  });
  body.appendChild(groupDatalist);

  body.appendChild(makeLabel("설명 (선택사항)"));
  const descInput = document.createElement("input");
  descInput.value = draft.description || "";
  descInput.placeholder = "예: 부킹/SI 접수용 시스템";
  descInput.oninput = (e) => { draft.description = e.target.value; };
  body.appendChild(descInput);

  body.appendChild(makeLabel("링크 (선택사항)"));
  const linkInput = document.createElement("input");
  linkInput.value = draft.link || "";
  linkInput.placeholder = "https://...";
  linkInput.oninput = (e) => { draft.link = e.target.value; };
  body.appendChild(linkInput);

  const linkOrFileHint = document.createElement("div");
  linkOrFileHint.className = "hint";
  linkOrFileHint.style.marginTop = "-4px";
  linkOrFileHint.textContent = "링크와 첨부파일 둘 다, 또는 하나만 등록해도 돼요. 4~5MB 이하 파일은 직접 첨부하는 걸 추천해요 (그 이상은 저장이 실패할 수 있어요).";
  body.appendChild(linkOrFileHint);

  renderAttachEditSection(body, draft);

  appendSaveCancelButtons(body, saveResource);
}

function saveResource() {
  if (!draft.title.trim()) { alert("자료 이름을 입력해주세요."); return; }
  commitDraft(RESOURCES, (list) => { RESOURCES = list; });
}

/* ---- 📞 연락처 개별 편집 ---- */
function renderContactEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("국가/지역"));
  const countryInput = document.createElement("input");
  countryInput.value = draft.country || "";
  countryInput.placeholder = "예: China / 중국";
  countryInput.oninput = (e) => { draft.country = e.target.value; };
  body.appendChild(countryInput);

  body.appendChild(makeLabel("구분 (선택사항)"));
  const categoryInput = document.createElement("input");
  categoryInput.value = draft.category || "";
  categoryInput.placeholder = "예: Import, Export, Customer Service 등";
  categoryInput.oninput = (e) => { draft.category = e.target.value; };
  body.appendChild(categoryInput);

  body.appendChild(makeLabel("담당자/팀"));
  const contactInput = document.createElement("input");
  contactInput.value = draft.contact || "";
  contactInput.placeholder = "예: Customer Service";
  contactInput.oninput = (e) => { draft.contact = e.target.value; };
  body.appendChild(contactInput);

  body.appendChild(makeLabel("이메일"));
  const emailInput = document.createElement("input");
  emailInput.value = draft.email || "";
  emailInput.placeholder = "예: cs@example.com";
  emailInput.oninput = (e) => { draft.email = e.target.value; };
  body.appendChild(emailInput);

  body.appendChild(makeLabel("이메일2 (GSL 등, 선택사항)"));
  const email2Input = document.createElement("input");
  email2Input.value = draft.email2 || "";
  email2Input.placeholder = "예: gsl-cs@example.com";
  email2Input.oninput = (e) => { draft.email2 = e.target.value; };
  body.appendChild(email2Input);

  appendSaveCancelButtons(body, saveContact);
}

function saveContact() {
  if (!(draft.country || "").trim() && !(draft.contact || "").trim()) {
    alert("국가 또는 담당자 중 하나는 입력해주세요.");
    return;
  }
  commitDraft(CONTACTS, (list) => { CONTACTS = list; });
}

/* ---- 📞 연락처 엑셀 붙여넣기 파싱 (공용) ----
   - 탭이 하나도 없거나(혹은 나머지 칸이 다 비어있어서) 실제 내용이 한 칸뿐인 줄은
     "Transshipment Team"처럼 접었다 펼 수 있는 그룹 제목 줄로 처리한다.
   - 그 외에는 국가/지역 · 구분 · 담당자/팀 · 이메일 4열로 해석하고,
     국가/지역, 구분 열이 병합 셀이라 빈칸이면 각각 바로 위 값을 이어붙인다. */

/* 엑셀에서 셀 안에 줄바꿈(Alt+Enter)이 들어있으면, 복사할 때 그 셀 앞뒤로 큰따옴표(")를
   붙여서 내보내는데, 이 줄바꿈 때문에 실제로는 한 줄이어야 할 내용이 우리 쪽에서는
   여러 줄로 쪼개져 보인다. 여기서는 큰따옴표가 짝이 안 맞는(열리기만 한) 줄을 만나면
   닫히는 큰따옴표가 나오는 줄까지 계속 이어붙여서(줄바꿈은 공백으로 치환) 원래 한 줄로 되돌린다. */
function preprocessQuotedMultilineCells(text) {
  const rawLines = text.split(/\r?\n/);
  const merged = [];
  let buffer = null;
  rawLines.forEach((line) => {
    if (buffer !== null) {
      buffer += " " + line;
      if (((line.match(/"/g) || []).length) % 2 === 1) {
        merged.push(buffer);
        buffer = null;
      }
      return;
    }
    if (((line.match(/"/g) || []).length) % 2 === 1) {
      buffer = line;
      return;
    }
    merged.push(line);
  });
  if (buffer !== null) merged.push(buffer); // 혹시 끝까지 안 닫혔으면 그냥 있는 그대로 추가
  return merged.join("\n");
}

/* 셀 값이 큰따옴표로 감싸져 있으면(엑셀의 줄바꿈 셀 표시 방식) 그 따옴표를 벗기고,
   이스케이프된 큰따옴표(“”)는 원래 큰따옴표 하나로 되돌린다. */
function stripCellQuotes(cell) {
  const t = (cell || "").trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"').trim();
  }
  return t;
}

function parseContactsPasteText(rawText) {
  const text = preprocessQuotedMultilineCells(rawText);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  let lastCountry = "";
  let lastCategory = "";
  const parsed = [];
  lines.forEach((line) => {
    const cells = line.split("\t").map(stripCellQuotes);
    const filledCells = cells.filter((c) => c !== "");
    if (filledCells.length <= 1 && line.indexOf("\t") !== 0) {
      // 탭이 아예 없거나(순수 텍스트 한 줄), 엑셀에서 여러 열을 같이 복사해서
      // 숨은 탭이 딸려왔더라도 실제 내용이 첫 칸 하나뿐이면 -> 소제목(그룹) 줄로 취급
      const label = cells[0] || stripCellQuotes(line);
      if (label) { parsed.push({ id: genId("ct"), isHeader: true, label }); lastCountry = ""; lastCategory = ""; }
      return;
    }
    const countryVal = cells[0] || "";
    if (countryVal) { lastCountry = countryVal; lastCategory = ""; } // 국가가 바뀌면 구분도 새로 시작
    const country = countryVal || lastCountry;
    const categoryVal = cells[1] || "";
    if (categoryVal) lastCategory = categoryVal;
    const category = categoryVal || lastCategory;
    const contact = cells[2] || "";
    const email = cells[3] || "";
    const email2 = cells[4] || "";
    parsed.push({ id: genId("ct"), country, category, contact, email, email2 });
  });
  return parsed.filter((row) => row.isHeader ? row.label !== "" : (row.country || row.category || row.contact || row.email || row.email2));
}

/* 붙여넣은 결과에서 소제목(헤더) 줄을 발견하면, 그 아래 이어지는 항목들을
   그룹으로 묶을지 하나씩 확인한다. "취소"를 누르면 해당 헤더만 제거되어
   자식 항목들이 그냥 낱개(그룹 없음) 항목으로 남는다. */
function confirmContactGroupings(rows) {
  const result = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.isHeader) {
      let childCount = 0;
      let j = i + 1;
      while (j < rows.length && !rows[j].isHeader) { childCount++; j++; }
      if (childCount > 0) {
        const ok = confirm('"' + row.label + '" 아래 ' + childCount + '개 항목을 그룹으로 묶을까요?\n\n확인: 그룹으로 묶여서 목록에서 눌러 펼치고 접을 수 있어요.\n취소: 그룹 없이 낱개 항목으로 추가돼요.');
        if (ok) result.push(row);
      } else {
        result.push(row); // 자식이 없는 헤더는 그냥 라벨로 유지
      }
      i++;
    } else {
      result.push(row);
      i++;
    }
  }
  return result;
}

/* ---- 📞 연락처 엑셀 붙여넣기 일괄 반영 (전체 교체) ---- */
function applyContactsPaste(text) {
  if (!text || !text.trim()) { alert("붙여넣을 내용이 없어요."); return; }
  let parsed = parseContactsPasteText(text);
  if (parsed.length === 0) { alert("붙여넣을 내용이 없어요."); return; }
  parsed = confirmContactGroupings(parsed);
  if (!confirm("현재 연락처 표 전체(" + CONTACTS.length + "건)가 붙여넣은 내용(" + parsed.length + "행)으로 교체됩니다. 계속할까요?")) return;

  CONTACTS = parsed;

  const ok = saveData();
  if (!ok) { alert("저장에 실패했어요. 저장 공간을 확인해주세요."); return; }
  renderAdminList();
  refreshCurrentTab();
  alert("연락처 " + CONTACTS.length + "건이 반영됐어요 ✅");
}

/* ---- 📞 연락처 엑셀 붙여넣기 - 기존 표 유지하고 뒤에 추가 ---- */
function appendContactsPaste(text) {
  if (!text || !text.trim()) { alert("붙여넣을 내용이 없어요."); return; }
  let parsed = parseContactsPasteText(text);
  if (parsed.length === 0) { alert("붙여넣을 내용이 없어요."); return; }
  parsed = confirmContactGroupings(parsed);

  CONTACTS = CONTACTS.concat(parsed);

  const ok = saveData();
  if (!ok) { alert("저장에 실패했어요. 저장 공간을 확인해주세요."); return; }
  renderAdminList();
  refreshCurrentTab();
  alert("연락처 " + parsed.length + "건이 기존 표 아래에 추가됐어요 ✅ (전체 " + CONTACTS.length + "건)");
}

/* ---- 휴가 일정 편집 ---- */
function renderVacationEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("이름"));
  const nameInput = document.createElement("input");
  nameInput.value = draft.name;
  nameInput.placeholder = "예: 김민지 (팀원 목록에 등록된 이름을 고르면 자동완성돼요)";
  nameInput.setAttribute("list", "vacationMemberNameList");
  nameInput.oninput = (e) => { draft.name = e.target.value; };
  body.appendChild(nameInput);

  const datalist = document.createElement("datalist");
  datalist.id = "vacationMemberNameList";
  VACATION_MEMBERS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.name;
    datalist.appendChild(opt);
  });
  body.appendChild(datalist);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.marginTop = "-8px";
  hint.style.marginBottom = "10px";
  hint.textContent = "여기 적은 이름이 \"⚙️ 관리 → 🎫 팀원 휴가일수\"에 등록된 이름과 정확히 같아야 월별 사용 현황표에 자동으로 집계돼요.";
  body.appendChild(hint);

  body.appendChild(makeLabel("연차 종류"));
  const unitSelect = document.createElement("select");
  ["full", "half", "quarter"].forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = VACATION_UNIT_LABELS[u] + " (" + VACATION_UNIT_VALUES[u] + "일)";
    unitSelect.appendChild(opt);
  });
  unitSelect.value = draft.unit || "full";
  unitSelect.onchange = (e) => { draft.unit = e.target.value; };
  body.appendChild(unitSelect);

  body.appendChild(makeLabel("휴가 시작일"));
  const startInput = document.createElement("input");
  startInput.type = "date";
  startInput.value = draft.startDate || "";
  body.appendChild(startInput);

  const rangeLabel = document.createElement("label");
  rangeLabel.className = "vacation-range-toggle";
  rangeLabel.style.cssText = "display:block;margin:6px 0;";
  const rangeCheck = document.createElement("input");
  rangeCheck.type = "checkbox";
  const isRange = !!(draft.startDate && draft.endDate && draft.startDate !== draft.endDate);
  rangeCheck.checked = isRange;
  rangeLabel.appendChild(rangeCheck);
  rangeLabel.appendChild(document.createTextNode(" 여러 날짜에 걸쳐요 (예: 여름휴가 8/3~8/7)"));
  body.appendChild(rangeLabel);

  const endLabel = makeLabel("휴가 종료일");
  endLabel.style.display = isRange ? "" : "none";
  body.appendChild(endLabel);
  const endInput = document.createElement("input");
  endInput.type = "date";
  endInput.value = draft.endDate || draft.startDate || "";
  endInput.style.display = isRange ? "" : "none";
  endInput.oninput = (e) => { draft.endDate = e.target.value; };
  body.appendChild(endInput);

  startInput.oninput = (e) => {
    draft.startDate = e.target.value;
    if (!rangeCheck.checked) { draft.endDate = e.target.value; endInput.value = e.target.value; }
    else if (endInput.value && endInput.value < e.target.value) { endInput.value = e.target.value; draft.endDate = e.target.value; }
  };
  rangeCheck.onchange = () => {
    if (rangeCheck.checked) {
      endLabel.style.display = ""; endInput.style.display = "";
    } else {
      endLabel.style.display = "none"; endInput.style.display = "none";
      endInput.value = startInput.value; draft.endDate = startInput.value;
    }
  };

  body.appendChild(makeLabel("메모 (선택사항)"));
  const noteInput = document.createElement("input");
  noteInput.value = draft.note || "";
  noteInput.placeholder = "예: 연차, 반차, 경조사 등";
  noteInput.oninput = (e) => { draft.note = e.target.value; };
  body.appendChild(noteInput);

  appendSaveCancelButtons(body, saveVacation);
}

function saveVacation() {
  if (!draft.name.trim()) { alert("이름을 입력해주세요."); return; }
  if (!draft.startDate) { alert("휴가 시작일을 입력해주세요."); return; }
  if (!draft.endDate || draft.endDate < draft.startDate) { draft.endDate = draft.startDate; }
  commitDraft(VACATIONS, (list) => { VACATIONS = list; });
}

/* ---- 팀원 휴가일수 편집 ---- */
function renderVacationMemberEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("사번 (선택사항)"));
  const empNoInput = document.createElement("input");
  empNoInput.value = draft.empNo || "";
  empNoInput.placeholder = "예: 10001";
  empNoInput.oninput = (e) => { draft.empNo = e.target.value; };
  body.appendChild(empNoInput);

  body.appendChild(makeLabel("이름"));
  const nameInput = document.createElement("input");
  nameInput.value = draft.name;
  nameInput.placeholder = "예: 김민지";
  nameInput.oninput = (e) => { draft.name = e.target.value; };
  body.appendChild(nameInput);

  body.appendChild(makeLabel("총 휴가일수 (연차 등)"));
  const daysInput = document.createElement("input");
  daysInput.type = "number";
  daysInput.min = "0";
  daysInput.step = "0.5";
  daysInput.value = draft.totalDays;
  daysInput.oninput = (e) => { draft.totalDays = parseFloat(e.target.value) || 0; };
  body.appendChild(daysInput);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "이름은 \"휴가 일정\"에 등록할 때 적는 이름과 정확히 같아야 사용일수가 자동으로 집계돼요.";
  body.appendChild(hint);

  appendSaveCancelButtons(body, saveVacationMember);
}

function saveVacationMember() {
  if (!draft.name.trim()) { alert("이름을 입력해주세요."); return; }
  commitDraft(VACATION_MEMBERS, (list) => { VACATION_MEMBERS = list; });
}

/* ---- 💬 오늘의 한마디 편집 ---- */
function renderQuoteEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.marginBottom = "8px";
  hint.textContent = "여기 등록한 문구들이 날짜 순서대로 하루에 하나씩 돌아가면서, 팀원이 그날 처음 길라잡이 페이지를 열 때 팝업으로 떠요.";
  body.appendChild(hint);

  body.appendChild(makeLabel("문구"));
  const textArea = document.createElement("textarea");
  textArea.rows = 3;
  textArea.value = draft.text || "";
  textArea.placeholder = "예: 오늘도 무사히, 클레임 없이! 💪";
  textArea.oninput = (e) => { draft.text = e.target.value; };
  body.appendChild(textArea);

  appendSaveCancelButtons(body, saveQuote);
}

function saveQuote() {
  if (!draft.text.trim()) { alert("문구를 입력해주세요."); return; }
  commitDraft(QUOTES, (list) => { QUOTES = list; });
}

/* ---- 🖋️ 위임장 현황 편집 ---- */
function renderPoaEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("신청업체 (포워더/관세사무소)"));
  const applicantInput = document.createElement("input");
  applicantInput.value = draft.applicant || "";
  applicantInput.placeholder = "예: ABC로지스틱스";
  applicantInput.oninput = (e) => { draft.applicant = e.target.value; };
  body.appendChild(applicantInput);

  body.appendChild(makeLabel("실화주"));
  const shipperInput = document.createElement("input");
  shipperInput.value = draft.shipper || "";
  shipperInput.placeholder = "예: XYZ상사";
  shipperInput.oninput = (e) => { draft.shipper = e.target.value; };
  body.appendChild(shipperInput);

  body.appendChild(makeLabel("제출일자 (선택)"));
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = formatPoaDate(draft.submittedDate) || "";
  dateInput.oninput = (e) => { draft.submittedDate = e.target.value; };
  body.appendChild(dateInput);

  appendSaveCancelButtons(body, savePoa);
}

function savePoa() {
  if (!(draft.applicant || "").trim() || !(draft.shipper || "").trim()) { alert("신청업체와 실화주를 모두 입력해주세요."); return; }
  commitDraft(POA_LIST, (list) => { POA_LIST = list; });
}

/* ---- 🔴 공휴일 편집 ---- */
function renderHolidayEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("날짜"));
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = draft.date || "";
  dateInput.oninput = (e) => { draft.date = e.target.value; };
  body.appendChild(dateInput);

  body.appendChild(makeLabel("공휴일 이름"));
  const nameInput = document.createElement("input");
  nameInput.value = draft.name || "";
  nameInput.placeholder = "예: 신정, 설날, 대체공휴일";
  nameInput.oninput = (e) => { draft.name = e.target.value; };
  body.appendChild(nameInput);

  appendSaveCancelButtons(body, saveHoliday);
}

function saveHoliday() {
  if (!draft.date) { alert("날짜를 선택해주세요."); return; }
  if (!(draft.name || "").trim()) { alert("공휴일 이름을 입력해주세요."); return; }
  commitDraft(HOLIDAYS, (list) => { HOLIDAYS = list; });
}

/* "업체명, 제출일자" 콤마 구분 한 줄 = 업체 한 곳. 워드파일 목록을 한 번에 옮길 때 사용 */
function parsePoaPasteText(text) {
  const lines = (text || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const rows = [];
  lines.forEach((line) => {
    const parts = line.split(",").map((p) => p.trim());
    const applicant = parts[0];
    const shipper = parts[1] || "";
    if (!applicant || !shipper) return;
    rows.push({ id: genId("poa"), applicant: applicant, shipper: shipper, submittedDate: normalizeVesselDateStr(parts[2] || "") || (parts[2] || "") });
  });
  return rows;
}

function appendPoaPaste(text) {
  if (!text || !text.trim()) { alert("붙여넣을 내용이 없어요."); return; }
  const rows = parsePoaPasteText(text);
  if (rows.length === 0) { alert("인식할 수 있는 업체명이 없어요."); return; }
  POA_LIST = POA_LIST.concat(rows);
  const ok = saveData();
  if (!ok) { alert("저장에 실패했어요."); return; }
  renderAdminList();
  refreshCurrentTab();
  alert(rows.length + "개 업체가 추가됐어요 ✅ (전체 " + POA_LIST.length + "건)");
}

/* ---- 팀 일정 편집 (휴가/교육/출장/공휴일/행사 등) ---- */
function renderTeamEventEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  body.appendChild(makeLabel("날짜"));
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = draft.date || "";
  dateInput.oninput = (e) => { draft.date = e.target.value; };
  body.appendChild(dateInput);

  body.appendChild(makeLabel("내용"));
  const textInput = document.createElement("input");
  textInput.value = draft.text || "";
  textInput.placeholder = "예: 민희 연차, 선길 오전 CS 교육, 제헌절, ZIM EVOLVE 등";
  textInput.oninput = (e) => { draft.text = e.target.value; };
  body.appendChild(textInput);

  const highlightRow = document.createElement("label");
  highlightRow.style.display = "flex";
  highlightRow.style.alignItems = "center";
  highlightRow.style.gap = "8px";
  highlightRow.style.margin = "4px 0 16px";
  highlightRow.style.fontSize = "13px";
  highlightRow.style.color = "#374151";
  const highlightCheckbox = document.createElement("input");
  highlightCheckbox.type = "checkbox";
  highlightCheckbox.checked = !!draft.highlight;
  highlightCheckbox.onchange = (e) => { draft.highlight = e.target.checked; };
  highlightRow.appendChild(highlightCheckbox);
  highlightRow.appendChild(document.createTextNode("강조 표시 (빨간 글씨) - 공휴일, 회사 행사 등에 사용해보세요"));
  body.appendChild(highlightRow);

  appendSaveCancelButtons(body, saveTeamEvent);
}

function saveTeamEvent() {
  if (!draft.date) { alert("날짜를 입력해주세요."); return; }
  if (!draft.text.trim()) { alert("내용을 입력해주세요."); return; }
  commitDraft(TEAM_EVENTS, (list) => { TEAM_EVENTS = list; });
}

/* ---- 공통 헬퍼 ---- */
function makeLabel(text) {
  const l = document.createElement("div");
  l.className = "label";
  l.textContent = text;
  return l;
}

function appendSaveCancelButtons(body, saveFn) {
  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = saveFn;
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => { draft = null; renderAdminList(); };
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}

async function commitDraft(list, setter) {
  const isNew = !draft.id;

  // 확정휴가·공휴일은 서버 연동이 켜져 있으면 구글시트에 저장하고, 최신 목록으로 다시 불러온다
  if (adminSection === "vacations" && CORE_SHEET_API_URL) {
    const entry = { name: draft.name, startDate: draft.startDate, endDate: draft.endDate, note: draft.note, unit: draft.unit || "full" };
    const result = isNew ? await submitVacationToServer(entry) : await updateVacationOnServer(Object.assign({ id: draft.id }, entry));
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    draft = null;
    await syncVacationsFromServer();
    renderAdminList();
    refreshCurrentTab();
    return;
  }
  if (adminSection === "holidays" && CORE_SHEET_API_URL) {
    const entry = { date: draft.date, name: draft.name };
    const result = isNew ? await submitHolidayToServer(entry) : await updateHolidayOnServer(Object.assign({ id: draft.id }, entry));
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    draft = null;
    await syncHolidaysFromServer();
    renderAdminList();
    refreshCurrentTab();
    return;
  }
  if (adminSection === "teamEvents" && CORE_SHEET_API_URL) {
    const entry = { date: draft.date, text: draft.text, highlight: !!draft.highlight };
    const result = isNew ? await submitTeamEventToServer(entry) : await updateTeamEventOnServer(Object.assign({ id: draft.id }, entry));
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    draft = null;
    await syncTeamEventsFromServer();
    renderAdminList();
    refreshCurrentTab();
    return;
  }

  // 연동 꺼져있거나 다른 섹션이면 예전 방식(브라우저 저장) 그대로
  const next = list.slice();
  draft.updatedAt = todayStr();
  if (isNew) {
    draft.id = genId("item");
    next.push(draft);
  } else {
    const idx = next.findIndex((t) => t.id === draft.id);
    next[idx] = draft;
  }
  setter(next);
  const ok = saveData();
  if (!ok) {
    alert("저장에 실패했어요. 저장 공간이 부족할 수 있어요 (첨부파일 용량을 확인해주세요).");
    return;
  }
  draft = null;
  renderAdminList();
  refreshCurrentTab();
}

/* ---- 메일 템플릿 편집 (기존 기능) ---- */
function renderTemplateEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  const nameInput = document.createElement("input");
  nameInput.value = draft.label;
  nameInput.placeholder = "예: 도착지 변경 문의";
  nameInput.oninput = (e) => { draft.label = e.target.value; };
  body.appendChild(makeLabel("메일 유형 이름 (드롭다운에 표시됩니다)"));
  body.appendChild(nameInput);

  const groupInput = document.createElement("input");
  groupInput.value = draft.group || "";
  groupInput.placeholder = "예: 스케줄 확인 요청 (비워두면 그룹 없이 표시돼요)";
  groupInput.setAttribute("list", "templateGroupList");
  groupInput.oninput = (e) => { draft.group = e.target.value; };
  body.appendChild(makeLabel("그룹 (선택사항 - 비슷한 유형끼리 묶어서 보여줘요)"));
  body.appendChild(groupInput);

  const groupDatalist = document.createElement("datalist");
  groupDatalist.id = "templateGroupList";
  Array.from(new Set(TEMPLATES.map((t) => t.group).filter(Boolean))).forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    groupDatalist.appendChild(opt);
  });
  body.appendChild(groupDatalist);

  const guideTitle = document.createElement("div");
  guideTitle.className = "section-title";
  guideTitle.textContent = "💡 업무 팁 / 가이드 (선택사항)";
  body.appendChild(guideTitle);

  const guideHint = document.createElement("div");
  guideHint.className = "hint";
  guideHint.style.marginBottom = "6px";
  guideHint.textContent = "새로 온 팀원이 이 유형을 선택했을 때 가장 먼저 보게 됩니다.";
  body.appendChild(guideHint);

  const guideInput = document.createElement("textarea");
  guideInput.style.height = "100px";
  guideInput.value = draft.guide || "";
  guideInput.placeholder = "예: 1. 먼저 B/L 조회 시스템에서 상태 확인\n2. OO팀에 확인 후 답장";
  guideInput.oninput = (e) => { draft.guide = e.target.value; };
  body.appendChild(guideInput);

  const fieldsTitle = document.createElement("div");
  fieldsTitle.className = "section-title";
  fieldsTitle.textContent = "📝 입력 항목 (팀원이 채워 넣을 값 하나씩)";
  body.appendChild(fieldsTitle);

  const fieldsWrap = document.createElement("div");
  fieldsWrap.id = "fieldsEditWrap";
  body.appendChild(fieldsWrap);
  renderFieldRows(fieldsWrap);

  const addFieldBtn = document.createElement("button");
  addFieldBtn.className = "add-row-btn";
  addFieldBtn.textContent = "＋ 입력 항목 추가";
  addFieldBtn.onclick = () => {
    draft.fields.push({ id: genId("f"), label: "", placeholder: "", multiline: false });
    renderFieldRows(fieldsWrap);
    renderOutputRows(document.getElementById("outputsEditWrap"));
  };
  body.appendChild(addFieldBtn);

  const tableTitle = document.createElement("div");
  tableTitle.className = "section-title";
  tableTitle.textContent = "📊 표 옵션 (선택사항 - 여러 건을 표로 넣고 싶을 때)";
  body.appendChild(tableTitle);

  const tableHint = document.createElement("div");
  tableHint.className = "hint";
  tableHint.style.marginBottom = "6px";
  tableHint.textContent = "이 유형에서 표를 쓸 수 있게 켜주세요. 아래에 기본 열을 미리 저장해두면 팀원이 메일 작성 화면에서 \"표 추가하기\"를 눌렀을 때 그 열이 그대로 나와요 (물론 팀원이 그 자리에서 열을 더 넣거나 지우거나 이름을 바꿀 수도 있어요). 기본 열을 비워두면 팀원이 매번 처음부터 자유롭게 만들어요. 표를 쓰려면 아래 결과물 본문 중 표가 들어갈 자리에 \"📊 표\" 칩을 눌러 {{표}}를 넣어주세요.";
  body.appendChild(tableHint);

  /* 예전 버전 호환: draft.table이 단순 boolean(true)으로 저장돼 있으면 열 편집이 가능하도록 객체로 바꿔줌 */
  if (draft.table === true) draft.table = { columns: [], placeholders: [] };

  const toggleRow = document.createElement("label");
  toggleRow.className = "toggle-row";
  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = !!draft.table;
  toggleInput.onchange = (e) => {
    draft.table = e.target.checked ? { columns: [], placeholders: [], mode: "rows", rowLabels: [] } : null;
    renderMailTableModeEditor(tableModeWrap);
    renderMailTableColEditor(tableColWrap);
    renderOutputRows(document.getElementById("outputsEditWrap"));
  };
  toggleRow.appendChild(toggleInput);
  toggleRow.appendChild(document.createTextNode("이 유형에 표 옵션 켜기"));
  body.appendChild(toggleRow);

  const tableModeWrap = document.createElement("div");
  tableModeWrap.id = "tableModeWrap";
  body.appendChild(tableModeWrap);
  renderMailTableModeEditor(tableModeWrap);

  const tableColWrap = document.createElement("div");
  tableColWrap.id = "tableColWrap";
  body.appendChild(tableColWrap);
  renderMailTableColEditor(tableColWrap);

  const outputsTitle = document.createElement("div");
  outputsTitle.className = "section-title";
  outputsTitle.textContent = "📄 결과물 (탭으로 나올 메일 본문)";
  body.appendChild(outputsTitle);

  const outputsWrap = document.createElement("div");
  outputsWrap.id = "outputsEditWrap";
  body.appendChild(outputsWrap);
  renderOutputRows(outputsWrap);

  const addOutputBtn = document.createElement("button");
  addOutputBtn.className = "add-row-btn";
  addOutputBtn.textContent = "＋ 결과물 추가 (예: 현지 요청 메일)";
  addOutputBtn.onclick = () => {
    draft.outputs.push({ id: genId("o"), name: "새 결과물", text: "", to: "", subject: "", attachments: [], attachmentLink: "", images: [] });
    renderOutputRows(outputsWrap);
  };
  body.appendChild(addOutputBtn);

  appendSaveCancelButtons(body, saveTemplateDraft);
}

function renderFieldRows(wrap) {
  wrap.innerHTML = "";
  if (draft.fields.length === 0) {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "입력 항목이 없으면, 이 유형은 별도 입력 없이 바로 생성돼요.";
    wrap.appendChild(hint);
  }
  draft.fields.forEach((f, idx) => {
    const row = document.createElement("div");
    row.className = "field-row";
    const top = document.createElement("div");
    top.className = "field-row-top";
    const labelInput = document.createElement("input");
    labelInput.value = f.label;
    labelInput.placeholder = "항목 이름 (예: 🚢 모선명)";
    labelInput.oninput = (e) => { f.label = e.target.value; renderOutputRows(document.getElementById("outputsEditWrap")); };
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-row";
    removeBtn.textContent = "삭제";
    removeBtn.onclick = () => { draft.fields.splice(idx, 1); renderFieldRows(wrap); renderOutputRows(document.getElementById("outputsEditWrap")); };
    top.appendChild(labelInput);
    top.appendChild(removeBtn);
    const placeholderInput = document.createElement("input");
    placeholderInput.value = f.placeholder;
    placeholderInput.placeholder = "입력창에 보일 예시 텍스트";
    placeholderInput.oninput = (e) => { f.placeholder = e.target.value; };
    row.appendChild(top);
    row.appendChild(placeholderInput);

    const multilineRow = document.createElement("label");
    multilineRow.className = "toggle-row";
    multilineRow.style.marginTop = "6px";
    const multilineInput = document.createElement("input");
    multilineInput.type = "checkbox";
    multilineInput.checked = !!f.multiline;
    multilineInput.onchange = (e) => { f.multiline = e.target.checked; };
    multilineRow.appendChild(multilineInput);
    multilineRow.appendChild(document.createTextNode("여러 줄 입력 (주소처럼 길게 붙여넣고, 줄바꿈을 그대로 메일에 넣고 싶을 때)"));
    row.appendChild(multilineRow);

    wrap.appendChild(row);
  });
}

function renderMailTableModeEditor(wrap) {
  wrap.innerHTML = "";
  if (!draft.table) return;
  if (!draft.table.mode) draft.table.mode = "rows";
  if (!draft.table.rowLabels) draft.table.rowLabels = [];

  const modeHint = document.createElement("div");
  modeHint.className = "hint";
  modeHint.style.margin = "10px 0 6px";
  modeHint.textContent = "표 형태를 골라주세요.";
  wrap.appendChild(modeHint);

  const modeRow = document.createElement("div");
  modeRow.className = "calc-sub-tabs";
  const rowsBtn = document.createElement("button");
  rowsBtn.type = "button";
  rowsBtn.className = "calc-sub-tab-btn" + (draft.table.mode === "rows" ? " active" : "");
  rowsBtn.textContent = "🔁 여러 건 (행 자유 추가)";
  rowsBtn.onclick = () => { draft.table.mode = "rows"; renderMailTableModeEditor(wrap); renderMailTableColEditor(document.getElementById("tableColWrap")); };
  const fixedBtn = document.createElement("button");
  fixedBtn.type = "button";
  fixedBtn.className = "calc-sub-tab-btn" + (draft.table.mode === "fixed" ? " active" : "");
  fixedBtn.textContent = "🔒 고정 항목 비교표 (행 이름 고정)";
  fixedBtn.onclick = () => { draft.table.mode = "fixed"; renderMailTableModeEditor(wrap); renderMailTableColEditor(document.getElementById("tableColWrap")); };
  modeRow.appendChild(rowsBtn);
  modeRow.appendChild(fixedBtn);
  wrap.appendChild(modeRow);

  const modeExplain = document.createElement("div");
  modeExplain.className = "hint";
  modeExplain.style.margin = "6px 0 10px";
  modeExplain.textContent = draft.table.mode === "fixed"
    ? "POL/POD/FD처럼 행(줄) 이름이 항상 똑같은 비교표에 맞아요. 팀원은 행을 추가/삭제할 수 없고, 값 칸만 채워요."
    : "배 여러 척, 여러 건처럼 매번 몇 줄이 될지 모르는 표에 맞아요. 팀원이 그때그때 행을 추가/삭제해요.";
  wrap.appendChild(modeExplain);

  if (draft.table.mode === "fixed") {
    const rowLabelsTitle = document.createElement("div");
    rowLabelsTitle.className = "hint";
    rowLabelsTitle.innerHTML = "<b>고정 행 이름</b> (예: POL, POD, FD - 순서대로 표에 나와요)";
    wrap.appendChild(rowLabelsTitle);

    const rowLabelsWrap = document.createElement("div");
    wrap.appendChild(rowLabelsWrap);

    const renderRowLabels = () => {
      rowLabelsWrap.innerHTML = "";
      draft.table.rowLabels.forEach((label, i) => {
        const row = document.createElement("div");
        row.className = "field-row-top";
        row.style.marginTop = "6px";
        const input = document.createElement("input");
        input.value = label;
        input.placeholder = "예: POL";
        input.oninput = (e) => { draft.table.rowLabels[i] = e.target.value; };
        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-row";
        removeBtn.textContent = "삭제";
        removeBtn.onclick = () => { draft.table.rowLabels.splice(i, 1); renderRowLabels(); };
        row.appendChild(input);
        row.appendChild(removeBtn);
        rowLabelsWrap.appendChild(row);
      });
    };
    renderRowLabels();

    const addRowLabelBtn = document.createElement("button");
    addRowLabelBtn.className = "add-row-btn";
    addRowLabelBtn.textContent = "＋ 행 이름 추가";
    addRowLabelBtn.onclick = () => { draft.table.rowLabels.push(""); renderRowLabels(); };
    wrap.appendChild(addRowLabelBtn);
  }
}

function renderMailTableColEditor(wrap) {
  wrap.innerHTML = "";
  if (!draft.table) return;
  if (!draft.table.placeholders) draft.table.placeholders = draft.table.columns.map(() => "");
  while (draft.table.placeholders.length < draft.table.columns.length) draft.table.placeholders.push("");

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = draft.table.mode === "fixed"
    ? "값을 채워 넣을 열(컬럼) 이름을 적어주세요 (예: Now READ, Requested to change as). 행 이름 열은 위에서 따로 정하니 여기엔 안 넣어도 돼요."
    : "표의 열(컬럼) 이름과, 팀원이 입력할 때 참고할 예시를 적어주세요 (예시는 선택사항이지만 넣어두면 팀원이 헷갈리지 않아요).";
  wrap.appendChild(hint);

  draft.table.columns.forEach((col, idx) => {
    const row = document.createElement("div");
    row.className = "field-row";
    row.style.marginTop = "6px";

    const top = document.createElement("div");
    top.className = "field-row-top";
    const input = document.createElement("input");
    input.value = col;
    input.placeholder = "열 이름 (예: M/V)";
    input.oninput = (e) => { draft.table.columns[idx] = e.target.value; renderOutputRows(document.getElementById("outputsEditWrap")); };
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-row";
    removeBtn.textContent = "삭제";
    removeBtn.onclick = () => {
      draft.table.columns.splice(idx, 1);
      draft.table.placeholders.splice(idx, 1);
      renderMailTableColEditor(wrap);
      renderOutputRows(document.getElementById("outputsEditWrap"));
    };
    top.appendChild(input);
    top.appendChild(removeBtn);
    row.appendChild(top);

    const exInput = document.createElement("input");
    exInput.value = draft.table.placeholders[idx] || "";
    exInput.placeholder = "입력 예시 (선택사항, 예: ZIMU CAPE TOWN)";
    exInput.oninput = (e) => { draft.table.placeholders[idx] = e.target.value; };
    row.appendChild(exInput);

    wrap.appendChild(row);
  });

  const addColBtn = document.createElement("button");
  addColBtn.className = "add-row-btn";
  addColBtn.textContent = "＋ 열 추가";
  addColBtn.onclick = () => {
    draft.table.columns.push("새 열");
    draft.table.placeholders.push("");
    renderMailTableColEditor(wrap);
  };
  wrap.appendChild(addColBtn);
}

function renderTableColEditor(wrap) {
  wrap.innerHTML = "";
  if (!draft.table) return;
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "표의 열(컬럼) 이름을 순서대로 적어주세요.";
  wrap.appendChild(hint);
  draft.table.columns.forEach((col, idx) => {
    const row = document.createElement("div");
    row.className = "field-row-top";
    row.style.marginTop = "6px";
    const input = document.createElement("input");
    input.value = col;
    input.placeholder = "열 이름";
    input.oninput = (e) => { draft.table.columns[idx] = e.target.value; renderOutputRows(document.getElementById("outputsEditWrap")); };
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-row";
    removeBtn.textContent = "삭제";
    removeBtn.onclick = () => { draft.table.columns.splice(idx, 1); renderTableColEditor(wrap); renderOutputRows(document.getElementById("outputsEditWrap")); };
    row.appendChild(input);
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
  const addColBtn = document.createElement("button");
  addColBtn.className = "add-row-btn";
  addColBtn.textContent = "＋ 열 추가";
  addColBtn.onclick = () => { draft.table.columns.push("새 열"); renderTableColEditor(wrap); };
  wrap.appendChild(addColBtn);
}

function renderOutputRows(wrap) {
  wrap.innerHTML = "";
  draft.outputs.forEach((out, idx) => {
    const block = document.createElement("div");
    block.className = "output-block-edit";

    const top = document.createElement("div");
    top.className = "field-row-top";
    const nameInput = document.createElement("input");
    nameInput.value = out.name;
    nameInput.placeholder = "결과물 이름";
    nameInput.oninput = (e) => { out.name = e.target.value; };
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-row";
    removeBtn.textContent = "삭제";
    removeBtn.style.display = draft.outputs.length > 1 ? "block" : "none";
    removeBtn.onclick = () => { draft.outputs.splice(idx, 1); renderOutputRows(wrap); };
    top.appendChild(nameInput);
    top.appendChild(removeBtn);
    block.appendChild(top);

    block.appendChild(makeLabel("📧 받는사람 (TO) - 선택사항, 여러 명이면 세미콜론(;)으로 구분돼요"));
    const toRow = document.createElement("div");
    toRow.style.cssText = "display:flex;gap:6px;";
    const toInput = document.createElement("input");
    toInput.value = out.to || "";
    toInput.placeholder = "예: agent@zim.com";
    toInput.dataset.field = "to";
    toInput.style.flex = "1";
    toInput.oninput = (e) => { out.to = e.target.value; };
    toInput.onblur = (e) => {
      /* 콤마·줄바꿈으로 구분해서 넣어도 자동으로 세미콜론(; )으로 정리해줌 */
      let v = e.target.value;
      v = v.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean).join("; ");
      e.target.value = v;
      out.to = v;
    };
    const addAddrBtn = document.createElement("button");
    addAddrBtn.type = "button";
    addAddrBtn.className = "btn secondary-btn";
    addAddrBtn.style.cssText = "flex-shrink:0;padding:0 12px;font-size:12px;";
    addAddrBtn.textContent = "＋ 주소 추가";
    addAddrBtn.title = "세미콜론(;)을 자동으로 붙여줘요. 이어서 다음 주소만 입력하면 돼요.";
    addAddrBtn.onclick = () => {
      let v = toInput.value.trim();
      if (v && !v.endsWith(";")) v += "; ";
      else if (v) v += " ";
      toInput.value = v;
      out.to = v;
      toInput.focus();
    };
    toRow.appendChild(toInput);
    toRow.appendChild(addAddrBtn);
    block.appendChild(toRow);
    const toHint = document.createElement("div");
    toHint.className = "hint";
    toHint.style.margin = "4px 0 0";
    toHint.textContent = "콤마(,)나 줄바꿈으로 여러 주소를 넣어도 저장할 때 자동으로 세미콜론(;)으로 바뀌니, 편하게 입력하시면 돼요.";
    block.appendChild(toHint);

    block.appendChild(makeLabel("✉️ 제목 / 공문 제목(NOTIFICATION TITLE) - 선택사항"));
    const subjectInput = document.createElement("input");
    subjectInput.value = out.subject || "";
    subjectInput.placeholder = "예: Destination Change Request";
    subjectInput.dataset.field = "subject";
    subjectInput.oninput = (e) => { out.subject = e.target.value; };
    block.appendChild(subjectInput);

    block.appendChild(makeLabel("📝 본문"));
    const textarea = document.createElement("textarea");
    textarea.style.height = "160px";
    textarea.value = out.text;
    textarea.dataset.field = "text";
    textarea.oninput = (e) => { out.text = e.target.value; };

    let activeEl = textarea;
    toInput.onfocus = () => { activeEl = toInput; };
    subjectInput.onfocus = () => { activeEl = subjectInput; };
    textarea.onfocus = () => { activeEl = textarea; };

    if (draft.fields.length > 0 || draft.table) {
      const chipHint = document.createElement("div");
      chipHint.className = "hint";
      chipHint.textContent = "칩을 클릭하면 방금 클릭한 칸(TO·제목·본문)의 커서 위치에 삽입됩니다:";
      block.appendChild(chipHint);
      const chipRow = document.createElement("div");
      chipRow.className = "chip-row";
      draft.fields.forEach((f) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        chip.textContent = f.label || "(이름 없음)";
        chip.onclick = () => insertTokenIntoField(activeEl, idx, f.label);
        chipRow.appendChild(chip);
      });
      if (draft.table) {
        const tableChip = document.createElement("button");
        tableChip.type = "button";
        tableChip.className = "chip table-chip";
        tableChip.textContent = "📊 표";
        tableChip.onclick = () => insertTokenIntoField(activeEl, idx, "표");
        chipRow.appendChild(tableChip);
      }
      block.appendChild(chipRow);
    }

    block.appendChild(textarea);

    const imageLabel = document.createElement("div");
    imageLabel.className = "label";
    imageLabel.style.marginTop = "10px";
    imageLabel.textContent = "🖼️ 본문 이미지 (선택사항, 캡처 화면 등)";
    block.appendChild(imageLabel);

    const imageHint = document.createElement("div");
    imageHint.className = "hint";
    imageHint.style.marginBottom = "4px";
    imageHint.textContent = "메일 본문 맨 아래에 이미지가 순서대로 같이 들어가요 (여러 장 추가 가능). \"복사하기\"로 붙여넣을 때만 이미지가 포함되고, \"메일 앱 열기\"에는 이미지가 안 들어가요.";
    block.appendChild(imageHint);

    if (!out.images) out.images = out.image ? [out.image] : []; // 예전 단일 이미지 필드가 있으면 자동으로 옮겨줌
    block.appendChild(createMultiImageFieldControl(() => out.images, (v) => { out.images = v; }));

    const attachLabel = document.createElement("div");
    attachLabel.className = "label";
    attachLabel.style.marginTop = "10px";
    attachLabel.textContent = "📎 첨부파일 (선택사항)";
    block.appendChild(attachLabel);

    const linkHint = document.createElement("div");
    linkHint.className = "hint";
    linkHint.style.marginBottom = "4px";
    linkHint.textContent = "🔗 용량이 큰 파일은 회사 공유 드라이브에 올려두고 링크를 등록하는 걸 추천해요.";
    block.appendChild(linkHint);

    const linkInput = document.createElement("input");
    linkInput.value = out.attachmentLink || "";
    linkInput.placeholder = "https://... (공유 드라이브 링크)";
    linkInput.oninput = (e) => { out.attachmentLink = e.target.value; };
    block.appendChild(linkInput);

    const fileSectionLabel = document.createElement("div");
    fileSectionLabel.className = "hint";
    fileSectionLabel.style.marginTop = "8px";
    fileSectionLabel.textContent = "또는 작은 파일(5MB 이하 권장)은 직접 올려서 저장할 수도 있어요:";
    block.appendChild(fileSectionLabel);

    if (!out.attachments) out.attachments = [];
    const attachListWrap = document.createElement("div");
    attachListWrap.className = "attach-list";
    block.appendChild(attachListWrap);
    renderAttachList(attachListWrap, out);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.onchange = (e) => handleAttachmentUpload(e, out, attachListWrap);
    block.appendChild(fileInput);

    const attachHint = document.createElement("div");
    attachHint.className = "hint";
    attachHint.textContent = "이 브라우저에 파일 내용까지 저장돼요. 너무 큰 파일은 저장이 안 될 수 있어요.";
    block.appendChild(attachHint);

    wrap.appendChild(block);
  });
}

function renderAttachList(listWrap, out) {
  listWrap.innerHTML = "";
  out.attachments.forEach((att, aIdx) => {
    const item = document.createElement("div");
    item.className = "attach-item";
    const name = document.createElement("div");
    name.className = "attach-name";
    name.textContent = "📄 " + att.name;
    const size = document.createElement("div");
    size.className = "attach-size";
    size.textContent = formatFileSize(att.size);
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "삭제";
    removeBtn.onclick = () => { out.attachments.splice(aIdx, 1); renderAttachList(listWrap, out); };
    item.appendChild(name);
    item.appendChild(size);
    item.appendChild(removeBtn);
    listWrap.appendChild(item);
  });
}

const MAX_ATTACHMENT_SIZE = 6 * 1024 * 1024; // 6MB (브라우저 저장공간 한도 때문에 이보다 더 키우면 저장 자체가 실패할 수 있어요)

function handleAttachmentUpload(event, out, listWrap) {
  const allFiles = Array.from(event.target.files || []);
  if (allFiles.length === 0) return;

  const tooBig = allFiles.filter((f) => f.size > MAX_ATTACHMENT_SIZE);
  const files = allFiles.filter((f) => f.size <= MAX_ATTACHMENT_SIZE);
  if (tooBig.length > 0) {
    alert("6MB가 넘는 파일은 첨부할 수 없어요 (제외됨):\n" + tooBig.map((f) => "- " + f.name + " (" + formatFileSize(f.size) + ")").join("\n") + "\n\n큰 파일은 회사 공유 드라이브에 올리고 링크로 등록해주세요.");
  }

  let remaining = files.length;
  if (remaining === 0) { event.target.value = ""; return; }
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      out.attachments.push({ name: file.name, size: file.size, type: file.type, dataUrl: e.target.result });
      remaining -= 1;
      if (remaining === 0) { renderAttachList(listWrap, out); event.target.value = ""; }
    };
    reader.readAsDataURL(file);
  });
}

/* 업무 절차 / FAQ / 자료 모음 등에서 재사용하는 첨부파일 편집 UI (업로드 + 목록 + 삭제) */
function renderAttachEditSection(container, obj) {
  const label = document.createElement("div");
  label.className = "label";
  label.style.marginTop = "10px";
  label.textContent = "📎 첨부파일 (선택사항, 6MB 이하 · 4~5MB대는 저장 실패할 수 있어 링크 등록 추천)";
  container.appendChild(label);

  if (!obj.attachments) obj.attachments = [];
  const listWrap = document.createElement("div");
  listWrap.className = "attach-list";
  container.appendChild(listWrap);
  renderAttachList(listWrap, obj);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.onchange = (e) => handleAttachmentUpload(e, obj, listWrap);
  container.appendChild(fileInput);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "이 브라우저에 파일 내용까지 저장돼요. 6MB가 넘는 파일은 첨부할 수 없고, 그 이하라도 용량이 크면(4~5MB대) 브라우저 저장공간 한도 때문에 저장이 실패할 수 있어요 — 저장 실패 알림이 뜨면 링크 등록으로 바꿔주세요.";
  container.appendChild(hint);
}

/* 업무 절차 항목에 "실제 처리된 예시 메일" 링크를 등록/관리 - 메일 자체는 용량이
   커서 첨부 대신, 공유폴더(원드라이브 등)에 있는 링크만 저장해서 보여줌 */
function renderExampleEmailEditSection(container, obj) {
  const label = document.createElement("div");
  label.className = "label";
  label.style.marginTop = "10px";
  label.textContent = "📧 예시 메일 링크 (실제 처리된 메일을 공유폴더에 올려두고, 그 링크만 등록)";
  container.appendChild(label);

  if (!obj.exampleEmails) obj.exampleEmails = [];
  const listWrap = document.createElement("div");
  listWrap.className = "attach-list";
  container.appendChild(listWrap);

  function renderList() {
    listWrap.innerHTML = "";
    obj.exampleEmails.forEach((ex, idx) => {
      const row = document.createElement("div");
      row.className = "attach-download-row";
      const labelInput = document.createElement("input");
      labelInput.placeholder = "설명 (예: 화주 클레임 응대 예시)";
      labelInput.value = ex.label || "";
      labelInput.style.flex = "1";
      labelInput.onchange = () => { ex.label = labelInput.value; };
      const urlInput = document.createElement("input");
      urlInput.placeholder = "https://... (공유 링크)";
      urlInput.value = ex.url || "";
      urlInput.style.flex = "1.5";
      urlInput.onchange = () => { ex.url = urlInput.value; };
      const delBtn = document.createElement("button");
      delBtn.className = "btn danger-btn";
      delBtn.style.cssText = "padding:4px 10px;font-size:12px;flex-shrink:0;";
      delBtn.textContent = "삭제";
      delBtn.onclick = () => { obj.exampleEmails.splice(idx, 1); renderList(); };
      row.appendChild(labelInput);
      row.appendChild(urlInput);
      row.appendChild(delBtn);
      listWrap.appendChild(row);
    });
  }
  renderList();

  const addBtn = document.createElement("button");
  addBtn.className = "add-row-btn";
  addBtn.textContent = "＋ 예시 메일 링크 추가";
  addBtn.onclick = () => { obj.exampleEmails.push({ label: "", url: "" }); renderList(); };
  container.appendChild(addBtn);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "링크는 원드라이브·셰어포인트 등 공유 폴더 주소를 붙여넣으면 돼요. 팀원이 볼 수 있는 권한으로 공유돼 있는지 확인해주세요.";
  container.appendChild(hint);
}

/* 업무 절차 화면에서 등록된 예시 메일 링크를 보여주는 표시용 UI */
function renderExampleEmailDisplay(container, exampleEmails) {
  if (!exampleEmails || exampleEmails.length === 0) return;
  const box = document.createElement("div");
  box.className = "attach-box";
  exampleEmails.forEach((ex) => {
    if (!ex.url) return;
    const row = document.createElement("div");
    row.className = "attach-download-row";
    const name = document.createElement("div");
    name.style.flex = "1";
    name.textContent = "📧 " + (ex.label || "예시 메일 보기");
    row.appendChild(name);
    const a = document.createElement("a");
    a.href = ex.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "🔗 열기";
    row.appendChild(a);
    box.appendChild(row);
  });
  container.appendChild(box);
}


function renderAttachDisplay(container, attachments) {
  if (!attachments || attachments.length === 0) return;
  const box = document.createElement("div");
  box.className = "attach-box";
  attachments.forEach((att) => {
    const row = document.createElement("div");
    row.className = "attach-download-row";
    const name = document.createElement("div");
    name.style.flex = "1";
    name.textContent = "📄 " + att.name + " (" + formatFileSize(att.size) + ")";
    row.appendChild(name);
    const a = document.createElement("a");
    a.href = att.dataUrl;
    a.download = att.name;
    a.textContent = "⬇️ 다운로드";
    row.appendChild(a);
    box.appendChild(row);
  });
  container.appendChild(box);
}

function insertTokenIntoField(el, outIdx, fieldLabel) {
  const token = "{{" + fieldLabel + "}}";
  const start = el.selectionStart || 0;
  const end = el.selectionEnd || 0;
  const val = el.value;
  el.value = val.slice(0, start) + token + val.slice(end);
  const newPos = start + token.length;
  el.selectionStart = el.selectionEnd = newPos;
  el.focus();
  const key = el.dataset.field;
  draft.outputs[outIdx][key] = el.value;
}

function saveTemplateDraft() {
  if (!draft.label.trim()) { alert("메일 유형 이름을 입력해주세요."); return; }
  commitDraft(TEMPLATES, (list) => { TEMPLATES = list; });
}

/* ---- 📨 공문 발송 (NTF) 유형 편집 ---- */
function renderNtfTemplateEdit() {
  const body = document.getElementById("adminBody");
  body.innerHTML = "";

  const nameInput = document.createElement("input");
  nameInput.value = draft.label;
  nameInput.placeholder = "예: 기항지 생략 통지 (OMISSION)";
  nameInput.oninput = (e) => { draft.label = e.target.value; };
  body.appendChild(makeLabel("공문 유형 이름 (드롭다운에 표시됩니다)"));
  body.appendChild(nameInput);

  const groupInput = document.createElement("input");
  groupInput.value = draft.group || "";
  groupInput.placeholder = "예: 스케줄 변경 통지 (비워두면 그룹 없이 표시돼요)";
  groupInput.setAttribute("list", "ntfGroupList");
  groupInput.oninput = (e) => { draft.group = e.target.value; };
  body.appendChild(makeLabel("그룹 (선택사항 - 비슷한 유형끼리 묶어서 보여줘요)"));
  body.appendChild(groupInput);

  const groupDatalist = document.createElement("datalist");
  groupDatalist.id = "ntfGroupList";
  Array.from(new Set(NTF_TEMPLATES.map((t) => t.group).filter(Boolean))).forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    groupDatalist.appendChild(opt);
  });
  body.appendChild(groupDatalist);

  const guideTitle = document.createElement("div");
  guideTitle.className = "section-title";
  guideTitle.textContent = "💡 업무 팁 / 가이드 (선택사항)";
  body.appendChild(guideTitle);

  const guideHint = document.createElement("div");
  guideHint.className = "hint";
  guideHint.style.marginBottom = "6px";
  guideHint.textContent = "팀원이 이 유형을 선택했을 때 가장 먼저 보게 됩니다. 로고 배너·TO/FROM 줄은 발송 시스템이 자동으로 붙여준다는 점을 여기 적어두면 좋아요.";
  body.appendChild(guideHint);

  const guideInput = document.createElement("textarea");
  guideInput.style.height = "100px";
  guideInput.value = draft.guide || "";
  guideInput.placeholder = "예: 1. TM팀에서 받은 변경 사유를 정확히 확인 후 입력\n2. 생성 후 제목/본문을 각각 복사해서 발송 시스템에 붙여넣기";
  guideInput.oninput = (e) => { draft.guide = e.target.value; };
  body.appendChild(guideInput);

  const fieldsTitle = document.createElement("div");
  fieldsTitle.className = "section-title";
  fieldsTitle.textContent = "📝 입력 항목 (팀원이 채워 넣을 값 하나씩)";
  body.appendChild(fieldsTitle);

  const fieldsWrap = document.createElement("div");
  fieldsWrap.id = "fieldsEditWrap";
  body.appendChild(fieldsWrap);
  renderFieldRows(fieldsWrap);

  const addFieldBtn = document.createElement("button");
  addFieldBtn.className = "add-row-btn";
  addFieldBtn.textContent = "＋ 입력 항목 추가";
  addFieldBtn.onclick = () => {
    draft.fields.push({ id: genId("f"), label: "", placeholder: "", multiline: false });
    renderFieldRows(fieldsWrap);
    renderOutputRows(document.getElementById("outputsEditWrap"));
  };
  body.appendChild(addFieldBtn);

  const tableTitle = document.createElement("div");
  tableTitle.className = "section-title";
  tableTitle.textContent = "📊 표 (선택사항 - 스케줄 변경 등 여러 건을 표로 넣고 싶을 때)";
  body.appendChild(tableTitle);

  const toggleRow = document.createElement("label");
  toggleRow.className = "toggle-row";
  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = !!draft.table;
  toggleInput.onchange = (e) => {
    draft.table = e.target.checked ? { columns: ["항목1"] } : null;
    renderTableColEditor(tableColWrap);
    renderOutputRows(document.getElementById("outputsEditWrap"));
  };
  toggleRow.appendChild(toggleInput);
  toggleRow.appendChild(document.createTextNode("이 유형에 표 추가하기"));
  body.appendChild(toggleRow);

  const tableColWrap = document.createElement("div");
  tableColWrap.id = "tableColWrap";
  body.appendChild(tableColWrap);
  renderTableColEditor(tableColWrap);

  const outputsTitle = document.createElement("div");
  outputsTitle.className = "section-title";
  outputsTitle.textContent = "📄 결과물 (제목 + 본문)";
  body.appendChild(outputsTitle);

  const outputsHint = document.createElement("div");
  outputsHint.className = "hint";
  outputsHint.style.margin = "0 0 8px";
  outputsHint.textContent = '"받는사람(TO)"은 보통 비워두시면 돼요 (NTF는 TO WHOM IT MAY CONCERN이라 특정 수신자가 없어요). "제목"에는 NOTIFICATION TITLE에 들어갈 문구를 넣으세요.';
  body.appendChild(outputsHint);

  const outputsWrap = document.createElement("div");
  outputsWrap.id = "outputsEditWrap";
  body.appendChild(outputsWrap);
  renderOutputRows(outputsWrap);

  appendSaveCancelButtons(body, saveNtfDraft);
}

function saveNtfDraft() {
  if (!draft.label.trim()) { alert("공문 유형 이름을 입력해주세요."); return; }
  commitDraft(NTF_TEMPLATES, (list) => { NTF_TEMPLATES = list; });
}

/* ---- 내보내기 / 가져오기 (전체) ---- */
