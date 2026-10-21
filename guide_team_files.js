/* =========================================================================
   📁 파일 보관함 - SharePoint(회사 공용 폴더)에 있는 공문·양식의 "링크"를 팀이 같이 모아두는 곳

   ■ 파일은 SharePoint 에 두고, 여기에는 "제목 · 링크 · 분류 · 메모"만 저장해요 (Firestore: team_file_links).
     → 파일 자체는 회사 승인 저장소에만 있고, 이 페이지는 "어디에 있는지"를 찾기 쉽게 정리해주는 목록이에요.
   ■ 팀원 누구나 링크를 등록·고칠 수 있고, 등록하면 바로 다 같이 보여요 (다른 탭들과 같은 방식).
   ■ 링크를 열려면 회사 계정(SharePoint 접근 권한)이 필요해요 - 외부 화주에게는 파일을 받아서 메일에 첨부해야 해요.
   ■ 여기서 삭제해도 SharePoint 의 원본 파일은 지워지지 않아요 (목록에서만 빠져요).
   ========================================================================= */
const TEAM_FILES_COLLECTION = "team_file_links";
const TEAM_FILES_DEFAULT_CATS = ["공문", "양식", "안내문", "기타"];
const TEAM_FILES_PREF_KEY = "team_files_prefs_v1"; // 이 브라우저에서 마지막으로 고른 분류/올린 사람

let TEAM_FILES_LIST = [];
let teamFilesUnsub = null;
let teamFilesBuilt = false;
let teamFilesCatFilter = "";
let teamFilesEditingId = null;     // ✏️ 로 제목/링크를 고치는 중인 줄
let teamFilesRenderPending = false;

function teamFilesPrefs() {
  try { return JSON.parse(localStorage.getItem(TEAM_FILES_PREF_KEY) || "{}") || {}; } catch (e) { return {}; }
}
function teamFilesSavePref(key, value) {
  try { const p = teamFilesPrefs(); p[key] = value; localStorage.setItem(TEAM_FILES_PREF_KEY, JSON.stringify(p)); } catch (e) { /* 무시 */ }
}

function teamFilesSay(text, kind) {
  const el = document.getElementById("tfStatus");
  if (!el) return;
  el.textContent = text || "";
  el.className = "tf-status " + (kind || "");
  clearTimeout(teamFilesSay._t);
  if (text) teamFilesSay._t = setTimeout(() => { el.textContent = ""; el.className = "tf-status"; }, 9000);
}

function teamFilesDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    title: d.title || "",
    url: d.url || "",
    category: d.category || "기타",
    memo: d.memo || "",
    uploader: d.uploader || "",
    createdAt: d.createdAtIso || (d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : ""),
  };
}

/* 링크 검사 - http/https 주소만 받아요 (javascript: 같은 건 막아요). 반환: { url } 또는 { error } */
function teamFilesCheckUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return { error: "링크를 붙여넣어 주세요" };
  let u;
  try { u = new URL(s); } catch (e) { return { error: "링크 형식이 아니에요. SharePoint에서 '링크 복사'한 주소를 그대로 붙여넣어 주세요 (https://로 시작해요)" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "https:// 로 시작하는 링크만 등록할 수 있어요" };
  return { url: s, host: u.hostname };
}

/* 링크 안에 파일 이름이 보이면 제목으로 미리 채워줘요 (SharePoint '공유 링크'는 이름이 없는 경우가 많아서 그땐 직접 써요) */
function teamFilesGuessTitle(url) {
  try {
    const u = new URL(url);
    const idParam = u.searchParams.get("id");              // 문서 보기 주소는 ?id=/sites/.../파일.pdf 형태
    const path = idParam || decodeURIComponent(u.pathname);
    const last = path.split("/").filter(Boolean).pop() || "";
    return /\.[A-Za-z0-9]{2,5}$/.test(last) ? last : "";
  } catch (e) { return ""; }
}

function teamFilesHostLabel(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes("sharepoint")) return "SharePoint";
    if (h.includes("onedrive") || h === "1drv.ms") return "OneDrive";
    return h.replace(/^www\./, "");
  } catch (e) { return ""; }
}

function teamFilesIcon(title) {
  const n = String(title || "").toLowerCase();
  if (/\.pdf$/.test(n)) return "📕";
  if (/\.(docx?|hwp|hwpx)$/.test(n)) return "📘";
  if (/\.(xlsx?|csv)$/.test(n)) return "📗";
  if (/\.(pptx?)$/.test(n)) return "📙";
  if (/\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return "🖼️";
  if (/\.(zip|7z|rar)$/.test(n)) return "🗜️";
  return "🔗";
}

function teamFilesCategories() {
  const set = new Set(TEAM_FILES_DEFAULT_CATS);
  TEAM_FILES_LIST.forEach((f) => { if (f.category) set.add(f.category); });
  return Array.from(set);
}

function teamFilesFmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? m[1].slice(2) + "." + m[2] + "." + m[3] : "";
}

/* =========================================================================
   화면 (위쪽 등록 칸은 한 번만 만들고, 아래 목록만 다시 그려요 - 쓰던 입력이 안 날아가게)
   ========================================================================= */
function teamFilesBuild() {
  const wrap = document.getElementById("teamFilesWrap");
  if (!wrap || teamFilesBuilt) return;
  teamFilesBuilt = true;
  const prefs = teamFilesPrefs();
  wrap.innerHTML = ''
    + '<div class="tf-panel">'
    + '  <div class="tf-title">➕ 링크 등록 <span class="tf-sub">SharePoint에서 파일을 열고 → 공유 → "링크 복사"한 주소를 붙여넣으세요</span></div>'
    + '  <div class="tf-row">'
    + '    <label class="tf-wide">링크 <input id="tfUrl" placeholder="https://...sharepoint.com/..." autocomplete="off"></label>'
    + '    <label class="tf-wide">제목 <input id="tfTitle" placeholder="예: 2026 수출 공문 양식.docx" autocomplete="off"></label>'
    + '  </div>'
    + '  <div class="tf-row">'
    + '    <label>분류 <input id="tfCat" list="tfCatList" value="' + escapeHtml(prefs.category || "공문") + '" placeholder="공문"></label>'
    + '    <label>올리는 사람 <select id="tfUploader"><option value="">선택 안 함</option>'
    + (typeof OBL_TEAM_MEMBERS !== "undefined" ? OBL_TEAM_MEMBERS : []).map((n) => '<option' + (prefs.uploader === n ? " selected" : "") + ">" + escapeHtml(n) + "</option>").join("")
    + '</select></label>'
    + '    <label class="tf-wide">메모 (선택) <input id="tfMemo" placeholder="예: 2026년 개정본, 화주 발송용" autocomplete="off"></label>'
    + '    <button type="button" class="btn generate-btn" id="tfAdd">등록</button>'
    + '  </div>'
    + '  <datalist id="tfCatList"></datalist>'
    + '</div>'
    + '<div id="tfStatus" class="tf-status"></div>'
    + '<div class="tf-filters"><input id="tfSearch" class="contacts-filter-input" placeholder="🔍 제목·메모·분류·올린 사람으로 검색"><div id="tfCats"></div></div>'
    + '<div id="tfListWrap"></div>';

  const urlIn = document.getElementById("tfUrl"), titleIn = document.getElementById("tfTitle");
  document.getElementById("tfAdd").addEventListener("click", teamFilesAdd);
  [urlIn, titleIn, document.getElementById("tfMemo")].forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); teamFilesAdd(); } }));
  // 링크를 붙여넣으면 파일 이름이 보일 때 제목을 자동으로 채워줘요 (이미 쓴 제목은 안 건드려요)
  urlIn.addEventListener("input", () => { if (!titleIn.value.trim()) { const g = teamFilesGuessTitle(urlIn.value.trim()); if (g) { titleIn.value = g; titleIn.dataset.auto = "1"; } } });
  titleIn.addEventListener("input", () => { titleIn.dataset.auto = ""; });
  document.getElementById("tfCat").addEventListener("change", (e) => teamFilesSavePref("category", e.target.value.trim()));
  document.getElementById("tfUploader").addEventListener("change", (e) => teamFilesSavePref("uploader", e.target.value));
  document.getElementById("tfSearch").addEventListener("input", renderTeamFilesList);
  document.getElementById("tfCats").addEventListener("click", (e) => {
    const el = e.target.closest("[data-cat]");
    if (!el) return;
    teamFilesCatFilter = el.dataset.cat || "";
    renderTeamFilesList();
  });

  const list = document.getElementById("tfListWrap");
  list.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || !list.contains(el)) return;
    const id = el.dataset.id, act = el.dataset.act;
    if (act === "link") teamFilesCopyLink(id, el);
    else if (act === "del") teamFilesDelete(id);
    else if (act === "edit") { teamFilesEditingId = id; renderTeamFilesList(); }
    else if (act === "cancel") { teamFilesEditingId = null; renderTeamFilesList(); }
    else if (act === "save") teamFilesSaveEdit(id);
  });
  list.addEventListener("input", (e) => { if (e.target.classList && e.target.classList.contains("tf-in")) e.target.dataset.dirty = "1"; });
  list.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("tf-in")) return;
    if (el.dataset.act === "edit-field") { if (e.key === "Enter") { e.preventDefault(); teamFilesSaveEdit(el.dataset.id); } else if (e.key === "Escape") { teamFilesEditingId = null; renderTeamFilesList(); } return; }
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
    else if (e.key === "Escape") { el.value = el.dataset.orig != null ? el.dataset.orig : el.value; el.dataset.dirty = "0"; el.blur(); }
  });
  list.addEventListener("focusin", (e) => { if (e.target.classList && e.target.classList.contains("tf-in")) e.target.dataset.orig = e.target.value; });
  list.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.act === "field") teamFilesSaveField(el);
  });
  list.addEventListener("focusout", (e) => {
    const el = e.target;
    setTimeout(() => { if (el.dataset) el.dataset.dirty = "0"; if (teamFilesRenderPending) renderTeamFilesList(); }, 0);
  });
}

function renderTeamFilesList() {
  const wrap = document.getElementById("tfListWrap");
  if (!wrap) return;
  const ae = document.activeElement;
  if (ae && wrap.contains(ae) && ae.dataset && ae.dataset.dirty === "1") { teamFilesRenderPending = true; return; }
  teamFilesRenderPending = false;
  const focusToken = typeof gridCaptureFocus === "function" ? gridCaptureFocus(wrap) : null;

  const cats = teamFilesCategories();
  const dl = document.getElementById("tfCatList");
  if (dl) dl.innerHTML = cats.map((c) => '<option value="' + escapeHtml(c) + '">').join("");
  const chips = document.getElementById("tfCats");
  if (chips) {
    const count = (c) => TEAM_FILES_LIST.filter((f) => f.category === c).length;
    chips.innerHTML = '<button type="button" class="tf-chip' + (!teamFilesCatFilter ? " on" : "") + '" data-cat="">전체 <b>' + TEAM_FILES_LIST.length + "</b></button>"
      + cats.filter((c) => count(c) > 0 || c === teamFilesCatFilter).map((c) =>
        '<button type="button" class="tf-chip' + (teamFilesCatFilter === c ? " on" : "") + '" data-cat="' + escapeHtml(c) + '">' + escapeHtml(c) + " <b>" + count(c) + "</b></button>").join("");
  }

  const q = ((document.getElementById("tfSearch") || {}).value || "").trim().toLowerCase();
  const rows = TEAM_FILES_LIST.filter((f) => {
    if (teamFilesCatFilter && f.category !== teamFilesCatFilter) return false;
    if (!q) return true;
    return [f.title, f.memo, f.category, f.uploader].some((v) => String(v || "").toLowerCase().includes(q));
  }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  let html = "";
  if (!TEAM_FILES_LIST.length) {
    html = '<div class="empty-state">아직 등록된 링크가 없어요. 위에서 SharePoint 링크를 붙여넣고 "등록"을 눌러보세요.</div>';
  } else if (!rows.length) {
    html = '<div class="empty-state">조건에 맞는 항목이 없어요.</div>';
  } else {
    html = '<table class="contacts-table tf-table"><colgroup><col style="width:92px"><col><col style="width:230px"><col style="width:76px"><col style="width:78px"><col style="width:190px"></colgroup>'
      + "<thead><tr><th>분류</th><th>제목</th><th>메모</th><th>올린 사람</th><th>날짜</th><th></th></tr></thead><tbody>"
      + rows.map((f) => {
        const id = escapeHtml(f.id);
        if (teamFilesEditingId === f.id) {
          return '<tr data-id="' + id + '" class="tf-editing"><td colspan="6"><div class="tf-edit">'
            + '<label>제목 <input class="tf-in" data-act="edit-field" data-field="title" data-id="' + id + '" value="' + escapeHtml(f.title) + '"></label>'
            + '<label>링크 <input class="tf-in" data-act="edit-field" data-field="url" data-id="' + id + '" value="' + escapeHtml(f.url) + '"></label>'
            + '<button type="button" class="btn generate-btn tf-btn" data-act="save" data-id="' + id + '">저장</button>'
            + '<button type="button" class="btn secondary-btn tf-btn" data-act="cancel" data-id="' + id + '">취소</button></div></td></tr>';
        }
        const safe = teamFilesCheckUrl(f.url).url ? f.url : "";
        return '<tr data-id="' + id + '">'
          + '<td><input class="tf-in" data-act="field" data-field="category" data-id="' + id + '" list="tfCatList" value="' + escapeHtml(f.category) + '"></td>'
          + '<td>' + (safe
            ? '<a class="tf-name" href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer" title="새 탭에서 열기">' + teamFilesIcon(f.title) + " " + escapeHtml(f.title) + "</a>"
            : '<span class="tf-name">' + escapeHtml(f.title) + " (링크 오류)</span>")
          + ' <span class="tf-host">' + escapeHtml(teamFilesHostLabel(f.url)) + "</span></td>"
          + '<td><input class="tf-in" data-act="field" data-field="memo" data-id="' + id + '" value="' + escapeHtml(f.memo) + '" placeholder="-"></td>'
          + "<td>" + escapeHtml(f.uploader || "-") + "</td>"
          + '<td class="tf-date">' + escapeHtml(teamFilesFmtDate(f.createdAt)) + "</td>"
          + '<td class="tf-actions">'
          + (safe ? '<a class="btn secondary-btn tf-btn" href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">열기</a>' : "")
          + '<button type="button" class="btn secondary-btn tf-btn" data-act="link" data-id="' + id + '">🔗 복사</button>'
          + '<button type="button" class="tf-del" data-act="edit" data-id="' + id + '" title="제목·링크 고치기">✏️</button>'
          + '<button type="button" class="tf-del" data-act="del" data-id="' + id + '" title="목록에서 삭제">🗑</button></td></tr>';
      }).join("")
      + "</tbody></table>"
      + '<div class="hint" style="margin-top:8px;">📁 ' + rows.length + "개 표시 중 · 전체 " + TEAM_FILES_LIST.length + "개 · 링크는 회사 계정으로 로그인한 상태에서 열려요</div>";
  }
  wrap.innerHTML = html;
  if (focusToken) gridRestoreFocus(wrap, focusToken);
}

/* =========================================================================
   등록 / 고치기 / 삭제 / 링크 복사
   ========================================================================= */
async function teamFilesAdd() {
  const urlIn = document.getElementById("tfUrl"), titleIn = document.getElementById("tfTitle");
  const chk = teamFilesCheckUrl(urlIn.value);
  if (chk.error) { teamFilesSay(chk.error, "bad"); urlIn.focus(); return; }
  const title = titleIn.value.trim();
  if (!title) { teamFilesSay("제목을 써 주세요 (예: 2026 수출 공문 양식). 나중에 찾을 때 이 제목으로 검색해요", "bad"); titleIn.focus(); return; }
  const dup = TEAM_FILES_LIST.find((f) => f.url.trim() === chk.url);
  if (dup) { teamFilesSay('이미 등록된 링크예요: "' + dup.title + '" (' + dup.category + ")", "bad"); return; }
  const category = (document.getElementById("tfCat").value || "").trim() || "기타";
  const uploader = document.getElementById("tfUploader").value || "";
  const memo = (document.getElementById("tfMemo").value || "").trim();
  teamFilesSavePref("category", category);
  teamFilesSavePref("uploader", uploader);
  try {
    await window.fbReady;
    await window.fbDb.collection(TEAM_FILES_COLLECTION).doc().set({
      title, url: chk.url, category, memo, uploader,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdAtIso: new Date().toISOString(),
    });
    urlIn.value = ""; titleIn.value = ""; titleIn.dataset.auto = ""; document.getElementById("tfMemo").value = "";
    teamFilesSay('등록했어요: "' + title + '"', "ok");
    urlIn.focus();
  } catch (err) {
    console.error("링크 등록 실패:", err);
    teamFilesSay("등록에 실패했어요: " + (err && err.code === "permission-denied" ? "권한이 없어요 (Firestore 규칙에 team_file_links가 추가됐는지 확인해 주세요)" : (err.message || err)), "bad");
  }
}

async function teamFilesSaveField(el) {
  el.dataset.dirty = "0";
  const f = TEAM_FILES_LIST.find((x) => x.id === el.dataset.id);
  if (!f) return;
  const field = el.dataset.field;
  let value = el.value.trim();
  if (field === "category" && !value) value = "기타";
  const patch = {}; patch[field] = value;
  try {
    await window.fbReady;
    await window.fbDb.collection(TEAM_FILES_COLLECTION).doc(f.id).update(patch);
    teamFilesSay("저장됐어요", "ok");
  } catch (err) {
    teamFilesSay("저장에 실패했어요: " + (err.message || err), "bad");
    renderTeamFilesList();
  }
}

async function teamFilesSaveEdit(id) {
  const f = TEAM_FILES_LIST.find((x) => x.id === id);
  if (!f) return;
  const q = (field) => document.querySelector('#tfListWrap input[data-act="edit-field"][data-field="' + field + '"][data-id="' + id + '"]');
  const titleEl = q("title"), urlEl = q("url");
  if (!titleEl || !urlEl) return;
  const title = titleEl.value.trim();
  if (!title) { teamFilesSay("제목은 비울 수 없어요", "bad"); return; }
  const chk = teamFilesCheckUrl(urlEl.value);
  if (chk.error) { teamFilesSay(chk.error, "bad"); return; }
  const dup = TEAM_FILES_LIST.find((x) => x.id !== id && x.url.trim() === chk.url);
  if (dup) { teamFilesSay('이미 다른 항목으로 등록된 링크예요: "' + dup.title + '"', "bad"); return; }
  try {
    await window.fbReady;
    await window.fbDb.collection(TEAM_FILES_COLLECTION).doc(id).update({ title, url: chk.url });
    teamFilesEditingId = null;
    teamFilesSay("저장됐어요", "ok");
    renderTeamFilesList();
  } catch (err) {
    teamFilesSay("저장에 실패했어요: " + (err.message || err), "bad");
  }
}

async function teamFilesCopyLink(id, btn) {
  const f = TEAM_FILES_LIST.find((x) => x.id === id);
  if (!f) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(f.url);
    else if (typeof legacyCopy === "function") legacyCopy(f.url);
    if (btn) { const old = btn.textContent; btn.textContent = "복사됨 ✓"; setTimeout(() => { btn.textContent = old; }, 1600); }
    teamFilesSay("링크를 복사했어요. 이 링크는 회사 계정이 있는 사람만 열 수 있어요", "ok");
  } catch (err) {
    teamFilesSay("복사에 실패했어요: " + (err.message || err), "bad");
  }
}

async function teamFilesDelete(id) {
  const f = TEAM_FILES_LIST.find((x) => x.id === id);
  if (!f) return;
  if (!confirm('"' + f.title + '"을(를) 목록에서 삭제할까요?\n(SharePoint의 원본 파일은 지워지지 않아요. 이 목록에서만 빠져요)')) return;
  try {
    await window.fbReady;
    await window.fbDb.collection(TEAM_FILES_COLLECTION).doc(f.id).delete();
    teamFilesSay("목록에서 삭제했어요", "ok");
  } catch (err) {
    teamFilesSay("삭제에 실패했어요: " + (err.message || err), "bad");
  }
}

/* =========================================================================
   탭 열기 - 목록은 실시간으로 받아요
   ========================================================================= */
async function loadTeamFilesTab(forceRefresh) {
  teamFilesBuild();
  if (typeof liveSubscribed !== "undefined" && liveSubscribed.teamFiles && !forceRefresh) { renderTeamFilesList(); return; }
  if (forceRefresh && teamFilesUnsub) { teamFilesUnsub(); teamFilesUnsub = null; liveSubscribed.teamFiles = false; }
  const wrap = document.getElementById("tfListWrap");
  if (wrap && !TEAM_FILES_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 목록을 불러오는 중이에요...</div>';
  await window.fbReady;
  teamFilesUnsub = window.fbDb.collection(TEAM_FILES_COLLECTION).onSnapshot(
    (snapshot) => { TEAM_FILES_LIST = snapshot.docs.map(teamFilesDocToEntry); renderTeamFilesList(); },
    (err) => {
      console.error("파일 보관함 실시간 구독 실패:", err);
      if (wrap) wrap.innerHTML = '<div class="empty-state">⚠️ 목록을 불러오지 못했어요. Firestore 규칙에 team_file_links가 추가됐는지 확인해 주세요. <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadTeamFilesTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.teamFiles = true;
  if (typeof liveTabUnsubscribers !== "undefined") liveTabUnsubscribers.teamFiles = () => { if (teamFilesUnsub) { teamFilesUnsub(); teamFilesUnsub = null; liveSubscribed.teamFiles = false; } };
}
