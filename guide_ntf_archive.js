/* =========================================================================
   🗂 공문(NTF) 보관함 - "📨 공문 발송" 탭에서 만든 공문을 저장해두면,
   팀원 누구나 나중에 여기서 검색해서 파일(HTML/Word)로 다시 받아 고객 응대에
   쓸 수 있어요. 위임장/팔로우업보드와 같은 Firestore 실시간 공유 방식이에요.
   ⚠️ 저장은 생성 버튼을 누른 사람이 "☁️ 팀 보관함에 저장" 버튼을 눌러야
   되고, 자동으로 저장되지는 않아요 (실수로 만든 초안까지 다 쌓이지 않게).
   ========================================================================= */
const NTF_ARCHIVE_COLLECTION = "ntf_archive"; // Firestore 컬렉션 이름
const NTF_ARCHIVE_AUTHOR_KEY = "ntf_archive_author"; // 이 브라우저에 마지막으로 고른 작성자를 기억해두는 localStorage 키

let NTF_ARCHIVE_LIST = [];
let ntfArchiveUnsubscribe = null;
let ntfArchiveExpanded = new Set(); // 미리보기를 펼쳐서 보고 있는 카드 id 모음

/* "작성자" 드롭다운 채우기 - 이전에 골랐던 값을 기억해서 다음에도 자동 선택되게 함 */
function initNtfAuthorSelect() {
  const select = document.getElementById("ntfAuthorSelect");
  if (!select) return;
  select.innerHTML = "";
  const blankOpt = document.createElement("option");
  blankOpt.value = "";
  blankOpt.textContent = "선택 안 함";
  select.appendChild(blankOpt);
  OBL_TEAM_MEMBERS.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  let saved = "";
  try { saved = localStorage.getItem(NTF_ARCHIVE_AUTHOR_KEY) || ""; } catch (e) { /* 무시 */ }
  if (saved && OBL_TEAM_MEMBERS.includes(saved)) select.value = saved;
}

function onNtfAuthorChange() {
  const select = document.getElementById("ntfAuthorSelect");
  if (!select) return;
  try { localStorage.setItem(NTF_ARCHIVE_AUTHOR_KEY, select.value || ""); } catch (e) { /* 무시 */ }
}

/* Firestore에서 보관함 전체 목록을 가져온다 (최초 1회, onSnapshot 실패시 폴백용) */
async function fetchNtfArchiveListFromServer() {
  try {
    await window.fbReady;
    const snapshot = await window.fbDb.collection(NTF_ARCHIVE_COLLECTION).get();
    return snapshot.docs.map((doc) => ntfArchiveDocToEntry(doc));
  } catch (err) {
    console.error("공문 보관함 서버 목록 불러오기 실패:", err);
    return null;
  }
}

function ntfArchiveDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    title: d.title || "",
    ntfTypeName: d.ntfTypeName || "",
    outputName: d.outputName || "",
    author: d.author || "",
    dateLabel: d.dateLabel || "",
    htmlDoc: d.htmlDoc || "",
    wordDoc: d.wordDoc || "",
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAtIso || ""),
  };
}

/* 공문 보관함에 새로 저장 (수정 기능은 없음 - 다시 필요하면 새로 생성해서 다시 저장) */
async function submitNtfArchiveToServer(entry) {
  try {
    await window.fbReady;
    const nowIso = new Date().toISOString();
    const docRef = await window.fbDb.collection(NTF_ARCHIVE_COLLECTION).add({
      title: entry.title || "",
      ntfTypeName: entry.ntfTypeName || "",
      outputName: entry.outputName || "",
      author: entry.author || "",
      dateLabel: entry.dateLabel || "",
      htmlDoc: entry.htmlDoc || "",
      wordDoc: entry.wordDoc || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtIso: nowIso,
    });
    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error("공문 보관함 저장 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteNtfArchiveFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(NTF_ARCHIVE_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("공문 보관함 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 탭을 열 때 호출 - 처음 한 번만 실시간 구독 시작, 팀원 누가 저장/삭제하면 자동 반영.
   forceRefresh=true(새로고침 버튼)일 때만 구독을 끊고 다시 읽어옴. */
async function loadNtfArchiveTab(forceRefresh) {
  const wrap = document.getElementById("ntfArchiveListWrap");
  if (liveSubscribed.ntfArchive && !forceRefresh) { renderNtfArchiveList(); return; }
  if (forceRefresh && ntfArchiveUnsubscribe) { ntfArchiveUnsubscribe(); ntfArchiveUnsubscribe = null; liveSubscribed.ntfArchive = false; }
  if (wrap && !NTF_ARCHIVE_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 보관함을 불러오는 중이에요...</div>';
  await window.fbReady;
  ntfArchiveUnsubscribe = window.fbDb.collection(NTF_ARCHIVE_COLLECTION).onSnapshot(
    (snapshot) => {
      NTF_ARCHIVE_LIST = snapshot.docs.map((doc) => ntfArchiveDocToEntry(doc));
      renderNtfArchiveList();
    },
    (err) => {
      console.error("공문 보관함 실시간 구독 실패:", err);
      if (wrap && !NTF_ARCHIVE_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadNtfArchiveTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.ntfArchive = true;
  liveTabUnsubscribers.ntfArchive = () => { if (ntfArchiveUnsubscribe) { ntfArchiveUnsubscribe(); ntfArchiveUnsubscribe = null; liveSubscribed.ntfArchive = false; } };
}

function ntfArchiveFilteredList() {
  const qEl = document.getElementById("ntfArchiveFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();
  let list = NTF_ARCHIVE_LIST.slice();
  if (q) {
    list = list.filter((n) => [n.title, n.ntfTypeName, n.author, n.outputName].filter(Boolean).join(" ").toLowerCase().includes(q));
  }
  list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return list;
}

function renderNtfArchiveList() {
  const wrap = document.getElementById("ntfArchiveListWrap");
  if (!wrap) return;
  const list = ntfArchiveFilteredList();

  if (NTF_ARCHIVE_LIST.length === 0) {
    wrap.innerHTML = '<div class="empty-state">아직 저장된 공문이 없어요. 왼쪽에서 공문을 생성한 뒤 "☁️ 팀 보관함에 저장" 버튼을 눌러보세요.</div>';
    return;
  }
  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state">검색 결과가 없어요.</div>';
    return;
  }

  wrap.innerHTML = "";
  const countInfo = document.createElement("div");
  countInfo.className = "hint";
  countInfo.style.marginBottom = "8px";
  countInfo.textContent = "✅ " + list.length + "건 저장됨";
  wrap.appendChild(countInfo);

  list.forEach((n) => wrap.appendChild(buildNtfArchiveRow(n)));
}

function buildNtfArchiveRow(n) {
  const isExpanded = ntfArchiveExpanded.has(n.id);
  const row = document.createElement("div");
  row.className = "content-card";
  row.style.cssText = "padding:12px 14px;margin-bottom:8px;";

  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;";

  const info = document.createElement("div");
  info.style.cssText = "flex:1;min-width:220px;";
  const titleLine = document.createElement("div");
  titleLine.style.cssText = "font-weight:700;font-size:14px;color:#111827;";
  titleLine.textContent = n.title || "(제목 없음)";
  info.appendChild(titleLine);
  const metaLine = document.createElement("div");
  metaLine.className = "hint";
  metaLine.style.marginTop = "3px";
  metaLine.textContent = [n.ntfTypeName, n.outputName, n.dateLabel, n.author ? "저장: " + n.author : ""].filter(Boolean).join(" · ");
  info.appendChild(metaLine);
  head.appendChild(info);

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;flex-shrink:0;";

  const previewBtn = document.createElement("button");
  previewBtn.className = "btn secondary-btn";
  previewBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  previewBtn.textContent = isExpanded ? "▴ 접기" : "👁 미리보기";
  previewBtn.onclick = () => {
    if (isExpanded) ntfArchiveExpanded.delete(n.id); else ntfArchiveExpanded.add(n.id);
    renderNtfArchiveList();
  };
  actions.appendChild(previewBtn);

  const htmlBtn = document.createElement("button");
  htmlBtn.className = "btn secondary-btn";
  htmlBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  htmlBtn.textContent = "💾 HTML";
  htmlBtn.onclick = () => downloadNtfArchiveFile(n.id, "html");
  actions.appendChild(htmlBtn);

  const docBtn = document.createElement("button");
  docBtn.className = "btn secondary-btn";
  docBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  docBtn.textContent = "📄 Word";
  docBtn.onclick = () => downloadNtfArchiveFile(n.id, "word");
  actions.appendChild(docBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "btn danger-btn";
  delBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  delBtn.textContent = "🗑";
  delBtn.onclick = () => deleteNtfArchiveEntry(n.id);
  actions.appendChild(delBtn);

  head.appendChild(actions);
  row.appendChild(head);

  if (isExpanded) {
    const previewBox = document.createElement("div");
    previewBox.className = "preview-html ntf-body-preview";
    previewBox.style.cssText = "margin-top:10px;max-height:420px;overflow:auto;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;padding:10px;";
    previewBox.innerHTML = n.htmlDoc || "<div class='hint'>미리보기를 불러올 수 없어요.</div>";
    row.appendChild(previewBox);
  }

  return row;
}

function downloadNtfArchiveFile(id, kind) {
  const item = NTF_ARCHIVE_LIST.find((n) => n.id === id);
  if (!item) return;
  const isWord = kind === "word";
  const content = isWord ? item.wordDoc : item.htmlDoc;
  if (!content) { alert("저장된 파일 내용을 찾을 수 없어요."); return; }
  const blob = new Blob([content], { type: isWord ? "application/msword;charset=utf-8" : "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeTitle = (item.title || "공문").replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, "_");
  a.download = safeTitle + (isWord ? ".doc" : ".htm");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function deleteNtfArchiveEntry(id) {
  const item = NTF_ARCHIVE_LIST.find((n) => n.id === id);
  if (!item) return;
  if (!confirm('"' + (item.title || "") + '" 저장본을 삭제할까요?')) return;
  const result = await deleteNtfArchiveFromServer(id);
  if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
}

/* "📨 공문 발송" 탭에서 공문을 생성한 뒤 "☁️ 팀 보관함에 저장" 버튼을 누르면 호출됨.
   guide_tabs_mail.js의 buildNtfDocumentHtml()을 그대로 재사용해서, 다운로드되는 파일과
   완전히 동일한 내용을 HTML/Word 두 버전 모두 Firestore에 저장해둬요. */
async function saveGeneratedNtfToArchive(idx, tpl, out) {
  const builtHtml = buildNtfDocumentHtml(idx, false);
  const builtWord = buildNtfDocumentHtml(idx, true);
  if (!builtHtml || !builtWord) { alert("저장할 내용을 찾을 수 없어요. 먼저 공문을 생성해주세요."); return; }

  const authorSelect = document.getElementById("ntfAuthorSelect");
  const author = authorSelect ? authorSelect.value : "";
  const dateEl = document.getElementById("ntf_date_" + idx);

  const entry = {
    title: builtHtml.title,
    ntfTypeName: tpl ? tpl.label : "",
    outputName: (tpl && tpl.outputs && tpl.outputs.length > 1) ? (out ? out.name : "") : "",
    author: author,
    dateLabel: dateEl ? dateEl.textContent : "",
    htmlDoc: builtHtml.htm,
    wordDoc: builtWord.htm,
  };

  const result = await submitNtfArchiveToServer(entry);
  if (!result.ok) { alert("보관함 저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
  alert("☁️ 팀 보관함에 저장됐어요! \"저장된 공문\" 목록에서 언제든 다시 찾아 다운로드할 수 있어요.");
  loadNtfArchiveTab();
}
