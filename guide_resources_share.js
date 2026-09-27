/* =========================================================================
   🔗 자료 모음 (Firestore 실시간 공유 버전)
   예전엔 "⚙️ 관리"(로컬 저장, 나만 보임)에서만 고칠 수 있었는데, 이제 팀원 누구나
   이 탭에서 바로 자료를 추가·수정하고, 표(행·열)도 직접 만들 수 있어요.
   표/하위탭을 만드는 화면은 절차(PROCEDURES) 관리자 편집기에서 쓰던 것과 완전히 같은
   함수(renderSubItemRows / renderTableEditor / renderStepRows, guide_admin.js)를
   그대로 재사용해요 - 데이터 구조가 절차와 똑같아서 그대로 가져다 쓸 수 있어요.
   ========================================================================= */
const RESOURCES_SHARE_COLLECTION = "resources_share";
const RESOURCES_SHARE_MIGRATE_FLAG = "resourcesShareMigratedV1";
const RESOURCES_SHARE_MAX_BYTES = 900000; // Firestore 문서 1건 한도(1MB)에 여유를 둔 안전선

let RESOURCES_SHARE_LIST = [];
let resourcesShareUnsubscribe = null;
let resourcesShareDraft = null;

function resGenId(prefix) {
  return (typeof genId === "function")
    ? genId(prefix)
    : (prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

/* ---- Firestore는 "배열 안에 배열"을 저장할 수 없어요 (nested array 금지) ----
   표(table)의 rows는 [["a","b"],["c","d"]] 처럼 배열 안에 배열이 들어있는 구조라
   그대로 저장하면 실패해요. 그래서 저장할 때는 각 행을 {cells:[...]} 객체로 한 번
   감싸서 보내고(encode), 불러올 때 다시 원래 배열 형태로 풀어줘요(decode).
   renderTableEditor/buildStepTableEl 등 화면에 그리는 함수들은 전부 원래(배열) 형태를
   기대하기 때문에, Firestore로 나갈 때만 감싸고 들어올 때 바로 풀어줘요. */
function resourcesShareEncodeSubItems(subItems) {
  if (!Array.isArray(subItems)) return [];
  return subItems.map((s) => {
    const copy = { id: s.id || resGenId("rsi"), name: s.name || "" };
    if (Array.isArray(s.subItems) && s.subItems.length) {
      copy.subItems = resourcesShareEncodeSubItems(s.subItems);
    } else {
      copy.steps = (s.steps || []).map((st) => {
        if (st && typeof st === "object" && st.type === "table") {
          return {
            type: "table",
            caption: st.caption || "",
            headers: st.headers || [],
            rows: (st.rows || []).map((row) => ({ cells: row || [] })),
          };
        }
        return st; // 문자열, 링크 객체({type:"link",...})는 중첩배열이 아니라 그대로 저장 가능
      });
    }
    return copy;
  });
}
function resourcesShareDecodeSubItems(subItems) {
  if (!Array.isArray(subItems)) return [];
  return subItems.map((s) => {
    const copy = { id: s.id || resGenId("rsi"), name: s.name || "" };
    if (Array.isArray(s.subItems) && s.subItems.length) {
      copy.subItems = resourcesShareDecodeSubItems(s.subItems);
    } else {
      copy.steps = (s.steps || []).map((st) => {
        if (st && typeof st === "object" && st.type === "table") {
          return {
            type: "table",
            caption: st.caption || "",
            headers: st.headers || [],
            rows: (st.rows || []).map((row) => (row && Array.isArray(row.cells)) ? row.cells : (Array.isArray(row) ? row : [])),
          };
        }
        return st;
      });
    }
    return copy;
  });
}

function resourcesShareDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    category: d.category || "common",
    group: d.group || "",
    title: d.title || "",
    description: d.description || "",
    link: d.link || "",
    subItems: resourcesShareDecodeSubItems(Array.isArray(d.subItems) ? d.subItems : []),
    author: d.author || "",
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAtIso || ""),
    updatedAt: d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : (d.updatedAtIso || ""),
  };
}

function resourcesShareEntryPayload(entry) {
  return {
    category: entry.category || "common",
    group: entry.group || "",
    title: entry.title || "",
    description: entry.description || "",
    link: entry.link || "",
    subItems: resourcesShareEncodeSubItems(entry.subItems || []),
  };
}

/* Firestore 문서 1건은 1MB가 한도예요. 사진 첨부나 표를 너무 크게 만들면 저장이 통째로
   실패할 수 있어서, 저장 전에 미리 크기를 재서 안내해줘요. */
function resourcesShareByteSize(entry) {
  try {
    return new Blob([JSON.stringify(resourcesShareEntryPayload(entry))]).size;
  } catch (e) {
    return JSON.stringify(resourcesShareEntryPayload(entry)).length;
  }
}

async function submitResourceShareToServer(entry) {
  try {
    await window.fbReady;
    const nowIso = new Date().toISOString();
    const payload = resourcesShareEntryPayload(entry);
    payload.author = entry.author || "";
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    payload.createdAtIso = nowIso;
    payload.updatedAtIso = nowIso;
    const docRef = await window.fbDb.collection(RESOURCES_SHARE_COLLECTION).add(payload);
    return { ok: true, id: docRef.id };
  } catch (err) {
    console.error("자료 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function updateResourceShareOnServer(entry) {
  try {
    await window.fbReady;
    const payload = resourcesShareEntryPayload(entry);
    payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    payload.updatedAtIso = new Date().toISOString();
    await window.fbDb.collection(RESOURCES_SHARE_COLLECTION).doc(entry.id).update(payload);
    return { ok: true };
  } catch (err) {
    console.error("자료 수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deleteResourceShareFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(RESOURCES_SHARE_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("자료 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 탭을 열 때 호출 - 처음 한 번만 실시간 구독 시작, 팀원 누가 추가/수정/삭제하면 자동 반영.
   forceRefresh=true(새로고침 버튼)일 때만 구독을 끊고 다시 읽어옴. */
async function loadResourcesShareTab(forceRefresh) {
  const wrap = document.getElementById("resourceShareListWrap");
  ensureResourcesShareCategoryFilterOptions();
  if (liveSubscribed.resourcesShare && !forceRefresh) { renderResourcesShareList(); return; }
  if (forceRefresh && resourcesShareUnsubscribe) { resourcesShareUnsubscribe(); resourcesShareUnsubscribe = null; liveSubscribed.resourcesShare = false; }
  if (wrap && !RESOURCES_SHARE_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 자료 목록을 불러오는 중이에요...</div>';
  await window.fbReady;
  resourcesShareUnsubscribe = window.fbDb.collection(RESOURCES_SHARE_COLLECTION).onSnapshot(
    (snapshot) => {
      RESOURCES_SHARE_LIST = snapshot.docs.map((doc) => resourcesShareDocToEntry(doc));
      renderResourcesShareList();
    },
    (err) => {
      console.error("자료 모음 실시간 구독 실패:", err);
      if (wrap && !RESOURCES_SHARE_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadResourcesShareTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.resourcesShare = true;
  liveTabUnsubscribers.resourcesShare = () => { if (resourcesShareUnsubscribe) { resourcesShareUnsubscribe(); resourcesShareUnsubscribe = null; liveSubscribed.resourcesShare = false; } };
}

function ensureResourcesShareCategoryFilterOptions() {
  const catEl = document.getElementById("resourceShareCategoryFilter");
  if (!catEl || catEl.dataset.filled === "1") return;
  let html = '<option value="__all">구분 전체</option>';
  if (typeof CATEGORY_ORDER !== "undefined" && typeof CATEGORY_LABELS !== "undefined") {
    html += CATEGORY_ORDER.map((c) => '<option value="' + c + '">' + CATEGORY_LABELS[c] + '</option>').join("");
  }
  catEl.innerHTML = html;
  catEl.dataset.filled = "1";
}

/* 표/하위탭 안까지 검색어가 있는지 재귀적으로 확인 (나라별 표처럼 여러 겹으로 나뉜 경우도 다 뒤짐) */
function resourcesShareNodeMatchesQuery(subItems, q) {
  if (!Array.isArray(subItems)) return false;
  return subItems.some((s) => {
    if (s.name && s.name.toLowerCase().includes(q)) return true;
    if (Array.isArray(s.steps)) {
      const hit = s.steps.some((st) => {
        if (typeof st === "string") return st.toLowerCase().includes(q);
        if (st && st.type === "table") {
          const headerHit = (st.headers || []).some((h) => String(h).toLowerCase().includes(q));
          const rowHit = (st.rows || []).some((r) => (r || []).some((c) => String(c).toLowerCase().includes(q)));
          return headerHit || rowHit || (st.caption || "").toLowerCase().includes(q);
        }
        if (st && st.type === "link") return (st.label || "").toLowerCase().includes(q) || (st.url || "").toLowerCase().includes(q);
        return false;
      });
      if (hit) return true;
    }
    return resourcesShareNodeMatchesQuery(s.subItems, q);
  });
}

function resourcesShareFilteredList() {
  const qEl = document.getElementById("resourceShareFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();
  const catEl = document.getElementById("resourceShareCategoryFilter");
  const catFilter = catEl ? catEl.value : "__all";

  let list = RESOURCES_SHARE_LIST.slice();
  if (catFilter && catFilter !== "__all") list = list.filter((r) => r.category === catFilter);
  if (q) {
    list = list.filter((r) =>
      [r.title, r.description, r.group, r.link].filter(Boolean).join(" ").toLowerCase().includes(q)
      || resourcesShareNodeMatchesQuery(r.subItems, q)
    );
  }
  return list;
}

function resourcesShareBuildRow(r) {
  const row = document.createElement("div");
  row.className = "resource-row";
  const left = document.createElement("div");
  left.innerHTML = '<div class="content-card-title">' + badgeHtml(r.category) + escapeHtml(r.title || "(제목 없음)") + '</div>'
    + (r.description ? '<div class="resource-desc">' + escapeHtml(r.description) + '</div>' : "");
  row.appendChild(left);

  const rightWrap = document.createElement("div");
  rightWrap.className = "no-strike";
  rightWrap.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0;";
  if (r.link) {
    const openLink = document.createElement("a");
    openLink.className = "resource-open";
    openLink.href = r.link;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "열기 ↗";
    openLink.onclick = (e) => e.stopPropagation();
    rightWrap.appendChild(openLink);
  }
  const editBtn = document.createElement("button");
  editBtn.className = "btn secondary-btn";
  editBtn.style.cssText = "padding:4px 10px;font-size:12px;";
  editBtn.textContent = "✏️ 수정";
  editBtn.onclick = (e) => { e.stopPropagation(); openResourceShareEditor(r.id); };
  rightWrap.appendChild(editBtn);
  row.appendChild(rightWrap);

  return row;
}

function resourcesShareBuildCardInner(r) {
  const box = document.createElement("div");
  if (r.subItems && r.subItems.length) {
    const itemHead = document.createElement("div");
    itemHead.className = "content-card-head resource-sub-head";
    itemHead.style.cursor = "pointer";
    itemHead.appendChild(resourcesShareBuildRow(r));
    const toggleIcon = document.createElement("div");
    toggleIcon.className = "content-card-toggle";
    toggleIcon.textContent = "▾";
    itemHead.appendChild(toggleIcon);
    const subBody = document.createElement("div");
    subBody.className = "content-card-body";
    renderProcNode({ subItems: r.subItems }, subBody);
    itemHead.onclick = () => subBody.classList.toggle("open");
    box.appendChild(itemHead);
    box.appendChild(subBody);
  } else {
    box.appendChild(resourcesShareBuildRow(r));
  }
  return box;
}

function renderResourcesShareList() {
  const wrap = document.getElementById("resourceShareListWrap");
  if (!wrap) return;

  const list = resourcesShareFilteredList();

  if (RESOURCES_SHARE_LIST.length === 0) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 자료가 없어요. 위 "➕ 자료 추가" 버튼으로 첫 자료를 남겨보세요.</div>';
    return;
  }
  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state">조건에 맞는 자료가 없어요.</div>';
    return;
  }

  wrap.innerHTML = "";
  const countInfo = document.createElement("div");
  countInfo.className = "hint";
  countInfo.style.marginBottom = "10px";
  countInfo.textContent = "✅ " + list.length + "건 표시됨";
  wrap.appendChild(countInfo);

  const groupOrder = [];
  const groupMap = {};
  const ungrouped = [];
  list.forEach((r) => {
    const g = (r.group || "").trim();
    if (g) {
      if (!groupMap[g]) { groupMap[g] = []; groupOrder.push(g); }
      groupMap[g].push(r);
    } else {
      ungrouped.push(r);
    }
  });

  ungrouped.forEach((r) => {
    const card = document.createElement("div");
    card.className = "content-card";
    card.dataset.resId = r.id;
    card.style.cursor = "default";
    card.appendChild(resourcesShareBuildCardInner(r));
    wrap.appendChild(card);
  });

  groupOrder.forEach((g) => {
    const folderCard = document.createElement("div");
    folderCard.className = "content-card resource-folder-card";

    const head = document.createElement("div");
    head.className = "content-card-head";
    head.innerHTML = '<div class="content-card-title">📁 ' + escapeHtml(g) + ' <span class="resource-folder-count">(' + groupMap[g].length + '건)</span></div><div class="content-card-toggle">▾</div>';

    const cbody = document.createElement("div");
    cbody.className = "content-card-body";
    groupMap[g].forEach((r) => {
      const itemWrap = document.createElement("div");
      itemWrap.className = "resource-group-item";
      itemWrap.dataset.resId = r.id;
      itemWrap.appendChild(resourcesShareBuildCardInner(r));
      cbody.appendChild(itemWrap);
    });
    head.onclick = () => cbody.classList.toggle("open");

    folderCard.appendChild(head);
    folderCard.appendChild(cbody);
    wrap.appendChild(folderCard);
  });
}

/* ---- 등록/수정 모달 ---- */
function openResourceShareEditor(existingId) {
  const found = existingId ? RESOURCES_SHARE_LIST.find((r) => r.id === existingId) : null;
  resourcesShareDraft = found
    ? JSON.parse(JSON.stringify(found))
    : { id: null, category: "common", group: "", title: "", description: "", link: "", subItems: [], author: "" };
  document.getElementById("resourceShareEditTitle").textContent = existingId ? "✏️ 자료 수정" : "➕ 자료 추가";
  document.getElementById("resourceShareEditOverlay").style.display = "flex";
  renderResourceShareEditorBody();
}

function closeResourceShareEditor() {
  document.getElementById("resourceShareEditOverlay").style.display = "none";
  resourcesShareDraft = null;
}

function renderResourceShareEditorBody() {
  const body = document.getElementById("resourceShareEditBody");
  body.innerHTML = "";
  const d = resourcesShareDraft;
  if (!d.subItems) d.subItems = [];

  body.appendChild(makeLabel("구분"));
  const catSelect = document.createElement("select");
  catSelect.innerHTML = categorySelectHtml(d.category);
  catSelect.onchange = (e) => { d.category = e.target.value; };
  body.appendChild(catSelect);

  body.appendChild(makeLabel("자료 이름"));
  const titleInput = document.createElement("input");
  titleInput.value = d.title || "";
  titleInput.placeholder = "예: 중남미 BL 발행 참고사항";
  titleInput.oninput = (e) => { d.title = e.target.value; };
  body.appendChild(titleInput);

  body.appendChild(makeLabel("그룹 (선택 - 비슷한 자료끼리 폴더로 묶어서 보여줘요)"));
  const groupInput = document.createElement("input");
  groupInput.value = d.group || "";
  groupInput.placeholder = "예: 중남미·아프리카 BL 발행 참고사항 (비워두면 폴더 없이 개별로 표시돼요)";
  groupInput.setAttribute("list", "resourceShareGroupList");
  groupInput.oninput = (e) => { d.group = e.target.value; };
  body.appendChild(groupInput);

  const groupDatalist = document.createElement("datalist");
  groupDatalist.id = "resourceShareGroupList";
  Array.from(new Set(RESOURCES_SHARE_LIST.map((r) => r.group).filter(Boolean))).forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g;
    groupDatalist.appendChild(opt);
  });
  body.appendChild(groupDatalist);

  body.appendChild(makeLabel("설명 (선택)"));
  const descInput = document.createElement("input");
  descInput.value = d.description || "";
  descInput.placeholder = "예: 부킹/SI 접수용 시스템";
  descInput.oninput = (e) => { d.description = e.target.value; };
  body.appendChild(descInput);

  body.appendChild(makeLabel("링크 (선택)"));
  const linkInput = document.createElement("input");
  linkInput.value = d.link || "";
  linkInput.placeholder = "https://...";
  linkInput.oninput = (e) => { d.link = e.target.value; };
  body.appendChild(linkInput);

  const subTitle = document.createElement("div");
  subTitle.className = "section-title";
  subTitle.textContent = "📊 표 / 하위 탭 (선택)";
  body.appendChild(subTitle);

  const subHint = document.createElement("div");
  subHint.className = "hint";
  subHint.style.marginBottom = "8px";
  subHint.textContent = "링크나 설명만 남기려면 아래는 비워두셔도 돼요. 나라별 표처럼 여러 개로 나누고 싶으면 \"하위 항목 추가\"를 여러 번 눌러서 각각 이름(예: 콜롬비아)을 적고, 그 안에서 \"📊 표 추가\"로 행·열을 만들면 돼요. 하위 항목이 2개 이상이면 자동으로 알약 버튼(탭)으로 나뉘어서 보여요. ⚠️ 사진 첨부는 용량 제한 때문에 이 화면에서는 지원하지 않아요 (표/텍스트/링크만 가능해요).";
  body.appendChild(subHint);

  const subItemsWrap = document.createElement("div");
  body.appendChild(subItemsWrap);
  renderSubItemRows(subItemsWrap, d.subItems);

  const addSubItemBtn = document.createElement("button");
  addSubItemBtn.className = "add-row-btn";
  addSubItemBtn.textContent = "＋ 하위 항목 추가";
  addSubItemBtn.onclick = () => {
    d.subItems.push({ id: resGenId("rsi"), name: "", steps: [] });
    renderSubItemRows(subItemsWrap, d.subItems);
  };
  body.appendChild(addSubItemBtn);

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.textContent = "💾 저장하기";
  saveBtn.onclick = async () => {
    if (!d.title.trim()) { alert("자료 이름을 입력해주세요."); return; }
    const size = resourcesShareByteSize(d);
    if (size > RESOURCES_SHARE_MAX_BYTES) {
      alert("내용이 너무 커서 저장할 수 없어요 (현재 약 " + Math.round(size / 1024) + "KB, 최대 약 " + Math.round(RESOURCES_SHARE_MAX_BYTES / 1024) + "KB까지 가능해요). 표를 나눠서 별도 자료로 등록해주세요.");
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = d.id ? await updateResourceShareOnServer(d) : await submitResourceShareToServer(d);
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장하기";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeResourceShareEditor();
  };
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn danger-btn";
  deleteBtn.textContent = "🗑️ 삭제";
  deleteBtn.style.display = d.id ? "" : "none";
  deleteBtn.onclick = async () => {
    if (!confirm("이 자료를 삭제할까요? 삭제하면 되돌릴 수 없어요.")) return;
    const result = await deleteResourceShareFromServer(d.id);
    if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    closeResourceShareEditor();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeResourceShareEditor();
  actions.appendChild(saveBtn);
  if (d.id) actions.appendChild(deleteBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}

/* ---- 예전 자료(로컬저장, DEFAULT_RESOURCES/RESOURCES)를 Firestore로 옮기기 ----
   이미 Firestore에 같은 제목의 자료가 있으면 자동으로 건너뛰고, 빠진 것만 채워 넣어요.
   그래서 실패한 게 있어서(예: 표 저장 오류) 다시 눌러도 중복 걱정 없이 안전해요. */
async function migrateResourcesToFirestoreOnce() {
  const total = (typeof RESOURCES !== "undefined" && Array.isArray(RESOURCES)) ? RESOURCES.length : 0;
  if (!total) { alert("옮길 예전 자료가 없어요 (RESOURCES가 비어있어요)."); return; }
  if (!confirm("예전 자료 " + total + "건을 확인해서, 아직 Firestore에 없는 것만 옮길까요?\n(제목이 이미 있는 자료는 자동으로 건너뛰어서 중복 걱정 안 하셔도 돼요.)")) return;

  const btn = document.getElementById("resourcesMigrateBtn");
  if (btn) { btn.disabled = true; btn.textContent = "기존 자료 확인하는 중..."; }

  await window.fbReady;
  const existingTitles = new Set();
  try {
    const snap = await window.fbDb.collection(RESOURCES_SHARE_COLLECTION).get();
    snap.docs.forEach((doc) => {
      const t = (doc.data().title || "").trim();
      if (t) existingTitles.add(t);
    });
  } catch (err) {
    console.error("기존 자료 목록 확인 실패:", err);
  }

  if (btn) btn.textContent = "옮기는 중... (닫지 마세요)";
  let okCount = 0;
  let skipCount = 0;
  const failedTitles = [];
  for (const r of RESOURCES) {
    const t = (r.title || "").trim();
    if (t && existingTitles.has(t)) { skipCount++; continue; }
    try {
      const payload = resourcesShareEntryPayload(r);
      const size = new Blob([JSON.stringify(payload)]).size;
      if (size > RESOURCES_SHARE_MAX_BYTES) {
        failedTitles.push((r.title || r.id) + " (용량 초과, 건너뜀)");
        continue;
      }
      payload.author = "마이그레이션";
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.createdAtIso = new Date().toISOString();
      payload.updatedAtIso = new Date().toISOString();
      await window.fbDb.collection(RESOURCES_SHARE_COLLECTION).add(payload);
      if (t) existingTitles.add(t);
      okCount++;
    } catch (err) {
      console.error("마이그레이션 실패:", r.title, err);
      failedTitles.push((r.title || r.id) + " (" + (err && err.message ? err.message : err) + ")");
    }
  }

  localStorage.setItem(RESOURCES_SHARE_MIGRATE_FLAG, "1");
  if (btn) { btn.disabled = false; btn.textContent = "☁️ 예전 자료 옮기기 (빠진 것만)"; }
  alert("새로 옮김: " + okCount + "건 / 이미 있어서 건너뜀: " + skipCount + "건"
    + (failedTitles.length ? ("\n\n실패 (" + failedTitles.length + "건):\n" + failedTitles.join("\n")) : ""));
  loadResourcesShareTab(true);
}
