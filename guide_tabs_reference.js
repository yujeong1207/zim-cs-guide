/* ===== guide_tabs_reference.js : original lines 18494-20583 ===== */
/* =========================================================================
   📞 연락처 탭
   ========================================================================= */

let expandedContactGroups = new Set();

/* 🖋️ 위임장 제출 현황 - 업체명 검색해서 제출 여부 바로 확인 */
const POA_FORM_URL = "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=z7zew2QPyU-Ghu3u2-n1E8KDAXxCuylKpg52orHbGdVURjBFWUxXQzVZSk81QThNRVNaUk9WRTVDTi4u";

function openPoaForm() {
  // 실시간 연동이 켜져 있으면 인라인 폼을 펼치고, 꺼져 있으면 예전처럼 MS Forms를 새 탭으로 연다
  if (POA_SHEET_API_URL) {
    togglePoaInlineForm();
  } else {
    window.open(POA_FORM_URL, "_blank");
  }
}

function togglePoaInlineForm() {
  const wrap = document.getElementById("poaInlineFormWrap");
  if (!wrap) return;
  const isOpen = wrap.style.display !== "none";
  wrap.style.display = isOpen ? "none" : "block";
  if (!isOpen) {
    const first = document.getElementById("poaInlineApplicant");
    if (first) first.focus();
  }
}

let poaEditingId = null; // 지금 수정 중인 위임장 항목 id (없으면 새로 등록하는 중)

function togglePoaInlineForm() {
  const wrap = document.getElementById("poaInlineFormWrap");
  if (!wrap) return;
  const isOpen = wrap.style.display !== "none";
  wrap.style.display = isOpen ? "none" : "block";
  if (!isOpen) {
    const first = document.getElementById("poaInlineApplicant");
    if (first) first.focus();
  } else {
    poaEditingId = null; // 닫으면 수정 모드도 같이 해제
    const btn = document.getElementById("poaInlineSubmitBtn");
    if (btn) btn.textContent = "✅ 등록하기";
  }
}

/* 위임장 탭에서 팀원 누구나(관리자 PIN 없이) 바로 수정할 수 있게 하는 함수 */
function startPoaEdit(id) {
  const item = POA_LIST.find((p) => p.id === id);
  if (!item) return;
  poaEditingId = id;
  const wrap = document.getElementById("poaInlineFormWrap");
  const applicantEl = document.getElementById("poaInlineApplicant");
  const shipperEl = document.getElementById("poaInlineShipper");
  const dateEl = document.getElementById("poaInlineDate");
  const btn = document.getElementById("poaInlineSubmitBtn");
  if (wrap) wrap.style.display = "block";
  if (applicantEl) applicantEl.value = item.applicant || "";
  if (shipperEl) shipperEl.value = item.shipper || "";
  if (dateEl) dateEl.value = formatPoaDate(item.submittedDate) || "";
  if (btn) btn.textContent = "✅ 수정 저장하기";
  if (applicantEl) applicantEl.focus();
  if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* 위임장 탭에서 팀원 누구나(관리자 PIN 없이) 바로 삭제할 수 있게 하는 함수 */
async function deletePoaFromTable(id) {
  const item = POA_LIST.find((p) => p.id === id);
  const label = item ? `"${item.applicant} → ${item.shipper}"` : "이 항목";
  if (!confirm(label + " 을(를) 삭제할까요?")) return;
  const result = await deletePoaFromServer(id);
  if (!result.ok) {
    alert("삭제에 실패했어요. 잠시 후 다시 시도해주세요.\n(" + result.error + ")");
    return;
  }
  await loadPoaTab();
}

async function submitPoaInlineForm() {
  const applicantEl = document.getElementById("poaInlineApplicant");
  const shipperEl = document.getElementById("poaInlineShipper");
  const dateEl = document.getElementById("poaInlineDate");
  const btn = document.getElementById("poaInlineSubmitBtn");

  const applicant = (applicantEl.value || "").trim();
  const shipper = (shipperEl.value || "").trim();
  const submittedDate = dateEl.value || "";

  if (!applicant) {
    alert("신청업체명을 입력해주세요.");
    applicantEl.focus();
    return;
  }

  const isEdit = !!poaEditingId;
  const entry = { applicant, shipper, submittedDate };
  if (isEdit) entry.id = poaEditingId;

  btn.disabled = true;
  btn.textContent = isEdit ? "수정 저장 중..." : "등록 중...";
  const result = await submitPoaToServer(entry);
  btn.disabled = false;
  btn.textContent = isEdit ? "✅ 수정 저장하기" : "✅ 등록하기";

  if (!result.ok) {
    alert((isEdit ? "수정에" : "등록에") + " 실패했어요. 잠시 후 다시 시도해주세요.\n(" + result.error + ")");
    return;
  }

  applicantEl.value = "";
  shipperEl.value = "";
  dateEl.value = "";
  poaEditingId = null;
  btn.textContent = "✅ 등록하기";
  togglePoaInlineForm();
  await loadPoaTab(); // 등록/수정 직후 최신 목록으로 다시 불러오기
  alert((isEdit ? "수정됐어요" : "등록됐어요") + " ✅");
}

/* 위임장 제출일자가 1년 넘었는지, 아예 없는지 확인해서 안내 문구를 돌려줌.
   문제없으면 null을 돌려줌 */
function getPoaExpiryWarning(submittedDate) {
  const dateStr = formatPoaDate(submittedDate);
  if (!dateStr) {
    return "⚠️ 제출일자가 비어있어요 — 제출일자를 모른다면 위임장을 새로 받아주세요.";
  }
  const submitted = new Date(dateStr);
  if (isNaN(submitted.getTime())) return null;
  const oneYearLater = new Date(submitted);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  if (new Date() >= oneYearLater) {
    return "⚠️ 제출일로부터 1년이 지났어요 (" + dateStr + ") — 위임 권한은 최대 1년이라, 새 위임장을 받아주세요.";
  }
  return null;
}

function renderPoaTable() {
  const wrap = document.getElementById("poaTableWrap");
  if (!wrap) return;
  const qEl = document.getElementById("poaFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();

  if (POA_LIST.length === 0) {
    wrap.innerHTML = POA_SHEET_API_URL
      ? '<div class="empty-state">아직 등록된 업체가 없어요. 위 "➕ 새 업체 등록하기" 버튼으로 첫 업체를 등록해보세요.</div>'
      : '<div class="empty-state">아직 등록된 업체가 없어요. "⚙️ 관리 → 🖋️ 위임장 현황"에서 "🔄 기본 위임장 목록으로 초기화" 버튼을 눌러보세요 (예전 버전을 열어본 적 있는 브라우저라면 빈 목록이 저장돼 있을 수 있어요).</div>';
    return;
  }

  const sorted = POA_LIST.slice().sort((a, b) => (a.shipper || "").localeCompare(b.shipper || "", "ko"));
  const matched = q ? sorted.filter((p) => [p.applicant, p.shipper].filter(Boolean).join(" ").toLowerCase().includes(q)) : sorted;

  if (q && matched.length === 0) {
    wrap.innerHTML = '<div class="empty-state">❌ "' + escapeHtml(qEl.value) + '"는 목록에 없어요. 아직 위임장 제출이 안 됐거나, 업체명 표기가 다를 수 있어요.</div>';
    return;
  }

  const table = document.createElement("table");
  table.className = "contacts-table";
  table.innerHTML = "<tr><th>신청업체 (포워더/관세사무소)</th><th>실화주</th><th>제출일자</th><th>관리</th></tr>";
  let warningCount = 0;
  matched.forEach((p) => {
    const tr = document.createElement("tr");
    tr.dataset.poaId = p.id;
    const warning = getPoaExpiryWarning(p.submittedDate);
    if (warning) warningCount++;
    tr.innerHTML = `<td>${q ? snippetHtml(p.applicant || "", q) : escapeHtml(p.applicant || "")}</td>`
      + `<td>${q ? snippetHtml(p.shipper || "", q) : escapeHtml(p.shipper || "")}</td>`
      + `<td>${formatPoaDate(p.submittedDate) || "-"}${warning ? `<div class="poa-expiry-warning">${escapeHtml(warning)}</div>` : ""}</td>`
      + `<td class="poa-row-actions">`
      + `<button type="button" class="poa-edit-btn" title="수정" onclick="startPoaEdit('${p.id}')">✏️</button>`
      + `<button type="button" class="poa-delete-btn" title="삭제" onclick="deletePoaFromTable('${p.id}')">🗑️</button>`
      + `</td>`;
    table.appendChild(tr);
  });
  wrap.innerHTML = "";
  wrap.appendChild(table);
  if (q) {
    const countInfo = document.createElement("div");
    countInfo.className = "hint";
    countInfo.style.marginTop = "8px";
    countInfo.textContent = warningCount > 0
      ? "✅ " + matched.length + "건 검색됨 (이 중 " + warningCount + "건은 위임장 기한 확인이 필요해요)"
      : "✅ 제출 완료 (" + matched.length + "건 검색됨)";
    wrap.appendChild(countInfo);
  } else if (warningCount > 0) {
    const countInfo = document.createElement("div");
    countInfo.className = "hint";
    countInfo.style.marginTop = "8px";
    countInfo.textContent = "⚠️ 전체 " + matched.length + "건 중 " + warningCount + "건은 위임장 기한 확인이 필요해요";
    wrap.appendChild(countInfo);
  }
}

function renderContactsTable() {
  const wrap = document.getElementById("contactsTableWrap");
  if (!wrap) return;
  const qEl = document.getElementById("contactsFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();

  if (CONTACTS.length === 0) {
    wrap.innerHTML = '<div class="empty-state">아직 등록된 연락처가 없어요. "⚙️ 관리 → 📞 연락처"에서 엑셀 내용을 붙여넣어 추가해보세요.</div>';
    return;
  }

  const matched = CONTACTS.filter((c) => {
    if (c.isHeader) return !q; // 검색 중에는 소제목 줄은 숨김 (검색 결과와 섞이면 헷갈려서)
    if (!q) return true;
    const full = [c.country, c.category, c.contact, c.email, c.email2].filter(Boolean).join(" ").toLowerCase();
    return full.includes(q);
  });

  if (matched.length === 0) {
    wrap.innerHTML = '<div class="empty-state">"' + escapeHtml(qEl.value) + '" 에 해당하는 연락처가 없어요.</div>';
    return;
  }

  // 검색 중이 아닐 때만 그룹(소제목) 접기/펴기를 적용 - 접힌 그룹의 하위 항목은 화면에서 뺀다
  let currentHeaderId = null;
  const rows = [];
  matched.forEach((c) => {
    if (c.isHeader) {
      currentHeaderId = c.id;
      rows.push(c);
      return;
    }
    if (q || currentHeaderId === null || expandedContactGroups.has(currentHeaderId)) {
      rows.push(c);
    }
  });

  // 같은 국가/구분이 연속되면 몇 줄까지 이어지는지 세어서 rowspan으로 병합
  // (matchCategoryToo=false: 국가만 기준으로 병합 범위 계산 / true: 국가+구분 모두 같아야 이어붙임)
  function runLength(idx, matchCategoryToo) {
    const base = rows[idx];
    let n = 0;
    for (let i = idx; i < rows.length; i++) {
      const r = rows[i];
      if (r.isHeader) break;
      if (r.country !== base.country) break;
      if (matchCategoryToo && r.category !== base.category) break;
      n++;
    }
    return n;
  }
  function isFirstOfRun(idx, matchCategoryToo) {
    if (idx === 0) return true;
    const prev = rows[idx - 1];
    const cur = rows[idx];
    if (prev.isHeader) return true;
    if (prev.country !== cur.country) return true;
    if (matchCategoryToo && prev.category !== cur.category) return true;
    return false;
  }

  const table = document.createElement("table");
  table.className = "contacts-table";
  table.innerHTML = '<colgroup><col style="width:17%"><col style="width:14%"><col style="width:22%"><col style="width:23%"><col style="width:24%"></colgroup>';
  const thead = document.createElement("tr");
  thead.innerHTML = "<th>국가/지역</th><th>구분</th><th>담당자/팀</th><th>ZIM 이메일</th><th>GSL 이메일</th>";
  table.appendChild(thead);

  rows.forEach((c, idx) => {
    const tr = document.createElement("tr");
    if (c.isHeader) {
      const isExpanded = expandedContactGroups.has(c.id);
      tr.innerHTML = '<td colspan="5" class="contact-section-header contact-group-toggle">'
        + '<span class="contact-group-arrow">' + (isExpanded ? "▼" : "▶") + '</span> '
        + escapeHtml(c.label || "") + "</td>";
      tr.onclick = () => {
        if (expandedContactGroups.has(c.id)) expandedContactGroups.delete(c.id);
        else expandedContactGroups.add(c.id);
        renderContactsTable();
      };
      table.appendChild(tr);
      return;
    }
    tr.dataset.contactId = c.id;
    let html = "";
    if (isFirstOfRun(idx, false)) {
      html += '<td rowspan="' + runLength(idx, false) + '">' + escapeHtml(c.country || "") + "</td>";
    }
    if (isFirstOfRun(idx, true)) {
      html += '<td rowspan="' + runLength(idx, true) + '">' + escapeHtml(c.category || "") + "</td>";
    }
    html += `<td>${escapeHtml(c.contact || "")}</td>
      <td>${c.email ? '<a href="mailto:' + escapeHtml(c.email) + '">' + escapeHtml(c.email) + "</a>" : ""}</td>
      <td>${c.email2 ? '<a href="mailto:' + escapeHtml(c.email2) + '">' + escapeHtml(c.email2) + "</a>" : ""}</td>`;
    tr.innerHTML = html;
    table.appendChild(tr);
  });
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

/* =========================================================================
   업무 절차 탭
   ========================================================================= */

function renderCatFilter(containerId, current, setter, renderFn) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = "";
  const options = [["all", "전체"]].concat(CATEGORY_ORDER.map((c) => [c, CATEGORY_LABELS[c]]));
  options.forEach(([val, label]) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = val === current ? "active" : "";
    btn.onclick = () => { setter(val); renderFn(); };
    wrap.appendChild(btn);
  });
}

/* node는 { subItems } 또는 { steps }를 가짐 - 하위 항목이 또 하위 항목(카테고리)을 가질 수 있어
   재귀적으로 알약 버튼 → 알약 버튼 → 내용 순으로 렌더링한다 */
function renderProcNode(node, container) {
  container.innerHTML = "";

  if (node.subItems && node.subItems.length > 0) {
    let activeId = node.subItems[0].id;

    const pillRow = document.createElement("div");
    pillRow.className = "subitem-pills";
    const panel = document.createElement("div");
    panel.className = "subitem-content-panel";

    function renderPills() {
      pillRow.innerHTML = "";
      node.subItems.forEach((child) => {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "subitem-pill" + (child.id === activeId ? " active" : "");
        pill.textContent = child.name;
        pill.dataset.subitemId = child.id;
        pill.onclick = (e) => {
          e.stopPropagation();
          activeId = child.id;
          renderPills();
          renderContent();
        };
        pillRow.appendChild(pill);
      });
    }

    function renderContent() {
      const child = node.subItems.find((c) => c.id === activeId);
      if (child) renderProcNode(child, panel);
    }

    // 하위 항목이 1개뿐이면 알약 버튼 없이 바로 내용만 표시
    if (node.subItems.length > 1) renderPills();
    renderContent();

    container.appendChild(pillRow);
    container.appendChild(panel);
  } else {
    const stepsWrap = document.createElement("div");
    stepsWrap.className = "step-list";
    (node.steps || []).forEach((s) => {
      if (isImageValue(s)) {
        const img = document.createElement("img");
        img.src = s;
        img.className = "step-image";
        stepsWrap.appendChild(img);
      } else if (isTableValue(s)) {
        stepsWrap.appendChild(buildStepTableEl(s));
      } else if (isLinkValue(s)) {
        stepsWrap.appendChild(buildStepLinkEl(s));
      } else {
        const item = document.createElement("div");
        item.className = "step-item";
        item.textContent = s;
        stepsWrap.appendChild(item);
      }
    });
    container.appendChild(stepsWrap);
    renderAttachDisplay(container, node.attachments);
    renderExampleEmailDisplay(container, node.exampleEmails);
  }
}

let expandedProcCategories = new Set();

function renderProcList() {
  renderFavRow("procFavRow", FAVORITE_PROC_IDS, PROCEDURES, (p) => p.title, "procedure", (p) => badgeHtml(p.category));
  const list = document.getElementById("procList");
  list.innerHTML = "";

  if (PROCEDURES.length === 0) {
    list.innerHTML = '<div class="empty-state">아직 등록된 절차가 없어요. "⚙️ 관리"에서 추가해보세요.</div>';
    return;
  }

  const CATEGORY_ICONS = { import: "📥", export: "📤", common: "📎" };
  CATEGORY_ORDER.forEach((cat) => {
    const items = PROCEDURES.filter((p) => p.category === cat);
    if (items.length === 0) return;
    list.appendChild(buildProcCategoryFolder(cat, items, CATEGORY_ICONS[cat] || "📁"));
  });
}

function buildProcCategoryFolder(category, items, icon) {
  const folder = document.createElement("div");
  folder.className = "content-card proc-category-folder";
  folder.dataset.procCategory = category;

  const head = document.createElement("div");
  head.className = "content-card-head proc-category-head proc-category-" + category;
  head.innerHTML = '<div class="content-card-title">' + icon + " " + CATEGORY_LABELS[category]
    + ' <span class="resource-folder-count">(' + items.length + '건)</span></div><div class="content-card-toggle">▾</div>';

  const bodyEl = document.createElement("div");
  bodyEl.className = "content-card-body" + (expandedProcCategories.has(category) ? " open" : "");

  items.forEach((p) => {
    const card = document.createElement("div");
    card.className = "content-card";
    card.dataset.procId = p.id;

    const itemHead = document.createElement("div");
    itemHead.className = "content-card-head";
    const isFav = FAVORITE_PROC_IDS.includes(p.id);
    itemHead.innerHTML = '<div class="content-card-title">'
      + '<button type="button" class="star-btn inline-star" title="' + (isFav ? "즐겨찾기 해제" : "즐겨찾기에 추가") + '">' + (isFav ? "⭐" : "☆") + '</button>'
      + escapeHtml(p.title) + '</div><div class="content-card-toggle">▾</div>';
    itemHead.querySelector(".inline-star").onclick = (e) => { e.stopPropagation(); toggleFavoriteProc(p.id); };

    const itemBody = document.createElement("div");
    itemBody.className = "content-card-body";
    renderProcNode({ subItems: p.subItems }, itemBody);

    itemHead.onclick = () => {
      itemBody.classList.toggle("open");
      if (itemBody.classList.contains("open")) recordRecentItem("procedure", p.id, "📋 " + p.title);
    };

    card.appendChild(itemHead);
    card.appendChild(itemBody);
    bodyEl.appendChild(card);
  });

  head.onclick = () => {
    bodyEl.classList.toggle("open");
    if (bodyEl.classList.contains("open")) expandedProcCategories.add(category);
    else expandedProcCategories.delete(category);
  };

  folder.appendChild(head);
  folder.appendChild(bodyEl);
  return folder;
}

function toggleFavoriteProc(id) {
  if (FAVORITE_PROC_IDS.includes(id)) {
    FAVORITE_PROC_IDS = FAVORITE_PROC_IDS.filter((x) => x !== id);
  } else {
    FAVORITE_PROC_IDS.push(id);
  }
  saveData();
  renderProcList();
}

function toggleFavoriteFaq(id) {
  if (FAVORITE_FAQ_IDS.includes(id)) {
    FAVORITE_FAQ_IDS = FAVORITE_FAQ_IDS.filter((x) => x !== id);
  } else {
    FAVORITE_FAQ_IDS.push(id);
  }
  saveData();
  renderFaqList();
}

/* 업무 절차 / FAQ 등에서 공통으로 쓰는 즐겨찾기 알약 행
   containerId: 즐겨찾기 행을 그릴 div id
   favIds: 즐겨찾기 id 배열
   itemsArr: 전체 아이템 배열
   labelFn: 아이템 → 표시 텍스트
   kind: jumpToResult에 넘길 kind 문자열
   badgeFn: (선택) 아이템 → 배지 html */
function renderFavRow(containerId, favIds, itemsArr, labelFn, kind, badgeFn) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const favItems = favIds.map((id) => itemsArr.find((it) => it.id === id)).filter(Boolean);
  wrap.innerHTML = "";
  if (favItems.length === 0) return;
  const title = document.createElement("div");
  title.className = "fav-row-title";
  title.textContent = "⭐ 즐겨찾기";
  wrap.appendChild(title);
  const pillWrap = document.createElement("div");
  pillWrap.className = "fav-pill-wrap";
  favItems.forEach((it) => {
    const pill = document.createElement("button");
    pill.className = "fav-pill";
    pill.innerHTML = (badgeFn ? badgeFn(it) : "") + escapeHtml(labelFn(it));
    pill.onclick = () => jumpToResult(kind, it.id);
    pillWrap.appendChild(pill);
  });
  wrap.appendChild(pillWrap);
}

/* =========================================================================
   FAQ 탭
   ========================================================================= */

/* FAQ 그룹(전화 응대 FAQ처럼 카테고리별 아이콘 사이드바로 보여주는 FAQ) 렌더링 */
function renderFaqTopics() {
  const wrap = document.getElementById("faqTopicsWrap");
  wrap.innerHTML = "";
  FAQ_TOPICS.filter((t) => faqFilter === "all" || t.category === faqFilter).forEach((topic) => {
    const card = document.createElement("div");
    card.className = "content-card";
    card.dataset.faqTopicId = topic.id;

    const head = document.createElement("div");
    head.className = "content-card-head";
    head.innerHTML = '<div class="content-card-title">' + badgeHtml(topic.category) + (topic.icon ? escapeHtml(topic.icon) + " " : "") + escapeHtml(topic.title)
      + ' <button type="button" class="faq-topic-edit-btn" title="이 FAQ 그룹 편집">✏️ 편집</button></div><div class="content-card-toggle">▾</div>';
    head.querySelector(".faq-topic-edit-btn").onclick = (e) => {
      e.stopPropagation();
      openAdminEditDirect("faqTopics", topic.id);
    };

    const bodyEl = document.createElement("div");
    bodyEl.className = "content-card-body";
    renderFaqTopicBody(topic, bodyEl);

    head.onclick = () => {
      bodyEl.classList.toggle("open");
      if (bodyEl.classList.contains("open")) recordRecentItem("faqTopic", topic.id, "❓ " + topic.title);
    };

    card.appendChild(head);
    card.appendChild(bodyEl);
    wrap.appendChild(card);
  });
}

function renderFaqTopicBody(topic, container) {
  container.innerHTML = "";
  if (!topic.groups || topic.groups.length === 0) {
    container.innerHTML = '<div class="faq-topic-empty">등록된 항목이 없어요.</div>';
    return;
  }
  let activeGroupId = topic.groups[0].id;

  const layout = document.createElement("div");
  layout.className = "faq-topic-layout";
  const sidebar = document.createElement("div");
  sidebar.className = "faq-topic-sidebar";
  const content = document.createElement("div");
  content.className = "faq-topic-content";

  function renderSidebar() {
    sidebar.innerHTML = "";
    topic.groups.forEach((g) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "faq-sidebar-btn" + (g.id === activeGroupId ? " active" : "");
      btn.innerHTML = (g.icon ? escapeHtml(g.icon) + " " : "") + escapeHtml(g.name);
      btn.onclick = (e) => {
        e.stopPropagation();
        activeGroupId = g.id;
        renderSidebar();
        renderContent();
      };
      sidebar.appendChild(btn);
    });
  }

  function renderContent() {
    content.innerHTML = "";
    const group = topic.groups.find((g) => g.id === activeGroupId);
    if (!group) return;
    const title = document.createElement("div");
    title.className = "faq-topic-content-title";
    title.innerHTML = (group.icon ? escapeHtml(group.icon) + " " : "") + escapeHtml(group.name);
    content.appendChild(title);
    if (!group.items || group.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "faq-topic-empty";
      empty.textContent = "등록된 질문이 없어요.";
      content.appendChild(empty);
      return;
    }
    group.items.forEach((item) => {
      const block = document.createElement("div");
      block.className = "faq-item-block";
      const q = document.createElement("div");
      q.className = "faq-item-q";
      q.textContent = item.question;
      const a = document.createElement("div");
      a.className = "faq-item-a";
      a.textContent = item.answer;
      block.appendChild(q);
      block.appendChild(a);
      if (item.image) {
        const img = document.createElement("img");
        img.src = item.image;
        img.className = "faq-answer-image";
        block.appendChild(img);
      }
      content.appendChild(block);
    });
  }

  renderSidebar();
  renderContent();

  layout.appendChild(sidebar);
  layout.appendChild(content);
  container.appendChild(layout);
}

function renderFaqList() {
  renderFavRow("faqFavRow", FAVORITE_FAQ_IDS, FAQS, (f) => f.question, "faq", (f) => badgeHtml(f.category));
  renderCatFilter("faqCatFilter", faqFilter, (v) => { faqFilter = v; }, () => { renderFaqTopics(); renderFaqList(); });
  renderFaqTopics();
  const list = document.getElementById("faqList");
  list.innerHTML = "";
  const items = FAQS.filter((f) => faqFilter === "all" || f.category === faqFilter);
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state">아직 등록된 FAQ가 없어요. "⚙️ 관리"에서 추가해보세요.</div>';
    return;
  }
  items.forEach((f) => {
    const card = document.createElement("div");
    card.className = "content-card";
    card.dataset.faqId = f.id;

    const head = document.createElement("div");
    head.className = "content-card-head";
    const isFav = FAVORITE_FAQ_IDS.includes(f.id);
    head.innerHTML = '<div class="content-card-title">'
      + '<button type="button" class="star-btn inline-star" title="' + (isFav ? "즐겨찾기 해제" : "즐겨찾기에 추가") + '">' + (isFav ? "⭐" : "☆") + '</button>'
      + badgeHtml(f.category) + escapeHtml(f.question) + '</div><div class="content-card-toggle">▾</div>';
    head.querySelector(".inline-star").onclick = (e) => { e.stopPropagation(); toggleFavoriteFaq(f.id); };

    const bodyEl = document.createElement("div");
    bodyEl.className = "content-card-body";
    const ans = document.createElement("div");
    ans.className = "faq-answer";
    ans.textContent = f.answer;
    bodyEl.appendChild(ans);
    if (f.image) {
      const img = document.createElement("img");
      img.src = f.image;
      img.className = "faq-answer-image";
      bodyEl.appendChild(img);
    }
    renderAttachDisplay(bodyEl, f.attachments);

    head.onclick = () => {
      bodyEl.classList.toggle("open");
      if (bodyEl.classList.contains("open")) recordRecentItem("faq", f.id, "❓ " + f.question);
    };

    card.appendChild(head);
    card.appendChild(bodyEl);
    list.appendChild(card);
  });
}

/* =========================================================================
   자료 모음 탭
   ========================================================================= */

function buildResourceRow(r) {
  const row = document.createElement("div");
  row.className = "resource-row";
  const left = document.createElement("div");
  left.innerHTML = '<div class="content-card-title">' + badgeHtml(r.category) + escapeHtml(r.title) + '</div>'
    + (r.description ? '<div class="resource-desc">' + escapeHtml(r.description) + '</div>' : "");
  row.appendChild(left);
  if (r.link) {
    const openLink = document.createElement("a");
    openLink.className = "resource-open";
    openLink.href = r.link;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "열기 ↗";
    row.appendChild(openLink);
  }
  return row;
}

function renderResList() {
  renderCatFilter("resCatFilter", resFilter, (v) => { resFilter = v; }, renderResList);
  const list = document.getElementById("resList");
  list.innerHTML = "";
  const items = RESOURCES.filter((r) => resFilter === "all" || r.category === resFilter);
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state">아직 등록된 자료가 없어요. "⚙️ 관리"에서 추가해보세요.</div>';
    return;
  }

  const groupOrder = [];
  const groupMap = {};
  const ungrouped = [];
  items.forEach((r) => {
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
    if (r.subItems && r.subItems.length) {
      card.style.cursor = "default";
      const head = document.createElement("div");
      head.className = "content-card-head";
      head.style.cursor = "pointer";
      head.appendChild(buildResourceRow(r));
      const toggleIcon = document.createElement("div");
      toggleIcon.className = "content-card-toggle";
      toggleIcon.textContent = "▾";
      head.appendChild(toggleIcon);
      const subBody = document.createElement("div");
      subBody.className = "content-card-body";
      renderProcNode({ subItems: r.subItems }, subBody);
      head.onclick = () => subBody.classList.toggle("open");
      card.appendChild(head);
      card.appendChild(subBody);
    } else {
      card.style.cursor = "default";
      card.appendChild(buildResourceRow(r));
      renderAttachDisplay(card, r.attachments);
    }
    list.appendChild(card);
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
      if (r.subItems && r.subItems.length) {
        const itemHead = document.createElement("div");
        itemHead.className = "content-card-head resource-sub-head";
        itemHead.style.cursor = "pointer";
        itemHead.appendChild(buildResourceRow(r));
        const toggleIcon = document.createElement("div");
        toggleIcon.className = "content-card-toggle";
        toggleIcon.textContent = "▾";
        itemHead.appendChild(toggleIcon);
        const subBody = document.createElement("div");
        subBody.className = "content-card-body";
        renderProcNode({ subItems: r.subItems }, subBody);
        itemHead.onclick = () => subBody.classList.toggle("open");
        itemWrap.appendChild(itemHead);
        itemWrap.appendChild(subBody);
      } else {
        itemWrap.appendChild(buildResourceRow(r));
        renderAttachDisplay(itemWrap, r.attachments);
      }
      cbody.appendChild(itemWrap);
    });

    head.onclick = () => cbody.classList.toggle("open");

    folderCard.appendChild(head);
    folderCard.appendChild(cbody);
    list.appendChild(folderCard);
  });
}

/* =========================================================================
   🚢 모선 입출항 일정 탭
   ========================================================================= */

function monthLabel(m) {
  const parts = (m || "").split("-");
  if (parts.length !== 2) return m || "";
  return parseInt(parts[0], 10) + "년 " + parseInt(parts[1], 10) + "월";
}

function nextMonthAfter(m) {
  const parts = (m || "").split("-");
  let y = parseInt(parts[0], 10), mo = parseInt(parts[1], 10) + 1;
  if (mo > 12) { mo = 1; y++; }
  return y + "-" + String(mo).padStart(2, "0");
}

function renderVesselTab() {
  const wrap = document.getElementById("vesselMonthsWrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  // 로컬에 추가해둔 달(VESSEL_MONTHS) + 서버에서 받아온 배들이 실제로 속한 달을 합쳐서 보여줌
  // (팀원이 새 달에 배를 하나 등록하면, 내가 그 달을 따로 추가한 적 없어도 자동으로 보이게 하기 위함)
  const monthSet = new Set(VESSEL_MONTHS);
  VESSELS.forEach((v) => { if (v.month) monthSet.add(v.month); });
  const months = Array.from(monthSet).sort();
  if (months.length === 0) {
    wrap.innerHTML = '<div class="empty-state">등록된 달이 없어요. 아래 "＋ 새 달 추가" 버튼으로 시작해보세요.</div>';
    return;
  }
  months.forEach((m) => wrap.appendChild(buildVesselMonthSection(m)));
}

function buildVesselMonthSection(month) {
  const vesselsInMonth = VESSELS.filter((v) => v.month === month)
    .slice()
    .sort((a, b) => (a.arrivalDate || "").localeCompare(b.arrivalDate || ""));

  const card = document.createElement("div");
  card.className = "content-card vessel-month-card";
  card.dataset.vesselMonth = month;

  const head = document.createElement("div");
  head.className = "content-card-head";
  head.innerHTML = '<div class="content-card-title">🚢 ' + escapeHtml(monthLabel(month))
    + ' <span class="resource-folder-count">(' + vesselsInMonth.length + '척)</span></div><div class="content-card-toggle">▾</div>';

  const bodyEl = document.createElement("div");
  bodyEl.className = "content-card-body" + (expandedVesselMonths.has(month) ? " open" : "");

  const actionRow = document.createElement("div");
  actionRow.className = "vessel-action-row";

  const delMonthBtn = document.createElement("button");
  delMonthBtn.className = "btn secondary-btn vessel-delete-month-btn";
  delMonthBtn.type = "button";
  delMonthBtn.textContent = "🗑 이 달 삭제";
  delMonthBtn.onclick = (e) => { e.stopPropagation(); deleteVesselMonth(month); };
  actionRow.appendChild(delMonthBtn);

  bodyEl.appendChild(actionRow);

  if (vesselsInMonth.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 등록된 배가 없어요.";
    bodyEl.appendChild(empty);
  } else {
    const tableWrap = document.createElement("div");
    tableWrap.className = "vessel-table-wrap";
    const table = document.createElement("table");
    table.className = "vessel-table";
    table.innerHTML = "<thead><tr><th>선명</th><th>코드명</th><th>항차</th><th class=\"vessel-th-arr\">⚓ 입항일</th><th class=\"vessel-th-dep\">🚩 출항일</th><th></th></tr></thead>";
    const tbody = document.createElement("tbody");

    vesselsInMonth.forEach((v) => {
      const tr = document.createElement("tr");
      tr.dataset.vesselId = v.id;

      const nameTd = document.createElement("td");
      nameTd.textContent = v.name || "-";

      const codeTd = document.createElement("td");
      codeTd.className = "vessel-code";
      codeTd.textContent = v.code || "-";

      const voyTd = document.createElement("td");
      voyTd.textContent = v.voyage || "-";

      const arrTd = document.createElement("td");
      arrTd.className = "vessel-td-arr";
      arrTd.textContent = formatVesselDateTime(v.arrivalDate, v.arrivalTimeConfirmed);

      const depTd = document.createElement("td");
      depTd.className = "vessel-td-dep";
      depTd.textContent = formatVesselDateTime(v.departureDate, v.departureTimeConfirmed);

      const actTd = document.createElement("td");
      actTd.className = "vessel-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "icon-btn";
      editBtn.type = "button";
      editBtn.title = "수정";
      editBtn.textContent = "✏️";
      editBtn.onclick = () => openVesselEditor(month, v.id);
      const delBtn = document.createElement("button");
      delBtn.className = "icon-btn";
      delBtn.type = "button";
      delBtn.title = "삭제";
      delBtn.textContent = "🗑";
      delBtn.onclick = () => deleteVessel(v.id);
      actTd.appendChild(editBtn);
      actTd.appendChild(delBtn);

      tr.appendChild(nameTd);
      tr.appendChild(codeTd);
      tr.appendChild(voyTd);
      tr.appendChild(arrTd);
      tr.appendChild(depTd);
      tr.appendChild(actTd);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    bodyEl.appendChild(tableWrap);
  }

  head.onclick = () => {
    bodyEl.classList.toggle("open");
    if (bodyEl.classList.contains("open")) expandedVesselMonths.add(month);
    else expandedVesselMonths.delete(month);
  };

  card.appendChild(head);
  card.appendChild(bodyEl);
  return card;
}

/* ---- 배 추가/수정 모달 ---- */
function openVesselEditor(month, existingId) {
  const overlay = document.getElementById("vesselEditOverlay");
  document.getElementById("vesselEditTitle").textContent = existingId ? "✏️ 모선 일정 수정" : "🚢 배 추가";
  overlay.style.display = "flex";
  renderVesselEditorBody(month, existingId);
}

function closeVesselEditor() {
  document.getElementById("vesselEditOverlay").style.display = "none";
}

function renderVesselEditorBody(month, existingId) {
  const body = document.getElementById("vesselEditBody");
  body.innerHTML = "";

  const existing = existingId ? VESSELS.find((v) => v.id === existingId) : null;

  body.appendChild(makeLabel("선명"));
  const nameRow = document.createElement("div");
  nameRow.style.cssText = "display:flex;gap:8px;";
  const nameInput = document.createElement("input");
  nameInput.placeholder = "예: MSC CHIYO";
  nameInput.value = existing ? (existing.name || "") : "";
  nameInput.style.flex = "1";
  const autoFetchBtn = document.createElement("button");
  autoFetchBtn.type = "button";
  autoFetchBtn.className = "btn secondary-btn";
  autoFetchBtn.textContent = "🔄 자동조회";
  nameRow.appendChild(nameInput);
  nameRow.appendChild(autoFetchBtn);
  body.appendChild(nameRow);

  const vesselFetchStatus = document.createElement("div");
  vesselFetchStatus.className = "hint";
  vesselFetchStatus.style.margin = "4px 0 0";
  body.appendChild(vesselFetchStatus);

  const vesselFetchResults = document.createElement("div");
  vesselFetchResults.style.margin = "4px 0 0";
  body.appendChild(vesselFetchResults);

  const usageGuide = document.createElement("div");
  usageGuide.className = "hint";
  usageGuide.style.margin = "6px 0 4px";
  usageGuide.textContent = "💡 PNIT·HPNT·BPT·E1은 위 \"🔄 자동조회\" 버튼 누르면 바로 불러와져요. BCT나 한진인천 스케줄을 볼 땐 아래 트레드링스를 참고해주세요.";
  body.appendChild(usageGuide);

  const manualLinksRow = document.createElement("div");
  manualLinksRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;";
  MANUAL_TERMINAL_LINKS.forEach((link) => {
    const a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "btn secondary-btn";
    a.style.cssText = "font-size:12px;padding:4px 10px;text-decoration:none;";
    a.textContent = "🔗 " + link.label + " 직접 확인";
    manualLinksRow.appendChild(a);
  });
  body.appendChild(manualLinksRow);

  body.appendChild(makeLabel("📋 트레드링스 등에서 복사한 줄 붙여넣기 (선택)"));
  const pasteHint = document.createElement("div");
  pasteHint.className = "hint";
  pasteHint.style.margin = "0 0 6px";
  pasteHint.textContent = "트레드링스 컨테이너터미널 스케줄 표에서 원하는 배 한 줄을 마우스로 드래그해서 복사한 다음, 아래 칸에 붙여넣으세요(Ctrl+V). 선명/항차/입출항일을 알아서 채워드려요.";
  body.appendChild(pasteHint);
  const pasteArea = document.createElement("textarea");
  pasteArea.placeholder = "여기에 붙여넣기...";
  pasteArea.rows = 2;
  pasteArea.style.cssText = "width:100%;resize:vertical;";
  body.appendChild(pasteArea);
  const pasteStatus = document.createElement("div");
  pasteStatus.className = "hint";
  pasteStatus.style.margin = "4px 0 10px";
  body.appendChild(pasteStatus);

  pasteArea.addEventListener("paste", () => {
    // paste 이벤트 시점엔 아직 값이 안 들어와있어서 한 틱 뒤에 처리
    setTimeout(() => {
      const parsed = parsePastedVesselRow(pasteArea.value);
      if (!parsed) {
        pasteStatus.textContent = "⚠️ 붙여넣은 내용에서 배 정보를 못 찾았어요. 형식이 다를 수 있어요 - 직접 입력해주세요.";
        return;
      }
      if (parsed.vessel) nameInput.value = parsed.vessel + (parsed.isIncheon ? " (인천)" : "");
      if (parsed.eta) arrInput.value = parsed.eta;
      if (parsed.etd) depInput.value = parsed.etd;
      pasteStatus.textContent = "✅ 붙여넣은 내용에서 자동으로 채웠어요. 맞는지 한 번 확인해주세요.";
    }, 0);
  });

  body.appendChild(makeLabel("코드명"));
  const codeInput = document.createElement("input");
  codeInput.placeholder = "예: ZMF";
  codeInput.value = existing ? (existing.code || "") : "";
  body.appendChild(codeInput);

  body.appendChild(makeLabel("항차"));
  const voyInput = document.createElement("input");
  voyInput.placeholder = "예: 013E";
  voyInput.value = existing ? (existing.voyage || "") : "";
  body.appendChild(voyInput);

  const dateRow = document.createElement("div");
  dateRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";

  const arrWrap = document.createElement("div");
  arrWrap.style.cssText = "flex:1;min-width:130px;";
  arrWrap.appendChild(makeLabel("⚓ 모선 입항일 (D/O 기준)"));
  const arrInput = document.createElement("input");
  arrInput.type = "datetime-local";
  arrInput.value = existing ? toDatetimeLocalValue(existing.arrivalDate) : "";
  arrWrap.appendChild(arrInput);
  const arrConfirmLabel = document.createElement("label");
  arrConfirmLabel.className = "vessel-time-confirm-label";
  const arrConfirmChk = document.createElement("input");
  arrConfirmChk.type = "checkbox";
  arrConfirmChk.checked = existing ? existing.arrivalTimeConfirmed === true : false;
  arrConfirmLabel.appendChild(arrConfirmChk);
  arrConfirmLabel.appendChild(document.createTextNode(" 시간까지 정확해요 (체크 안 하면 00:00은 자동으로 숨겨져요)"));
  arrWrap.appendChild(arrConfirmLabel);

  const depWrap = document.createElement("div");
  depWrap.style.cssText = "flex:1;min-width:130px;";
  depWrap.appendChild(makeLabel("🚩 모선 출항일 (B/L 기준)"));
  const depInput = document.createElement("input");
  depInput.type = "datetime-local";
  depInput.value = existing ? toDatetimeLocalValue(existing.departureDate) : "";
  depWrap.appendChild(depInput);
  const depConfirmLabel = document.createElement("label");
  depConfirmLabel.className = "vessel-time-confirm-label";
  const depConfirmChk = document.createElement("input");
  depConfirmChk.type = "checkbox";
  depConfirmChk.checked = existing ? existing.departureTimeConfirmed === true : false;
  depConfirmLabel.appendChild(depConfirmChk);
  depConfirmLabel.appendChild(document.createTextNode(" 시간까지 정확해요 (체크 안 하면 00:00은 자동으로 숨겨져요)"));
  depWrap.appendChild(depConfirmLabel);

  dateRow.appendChild(arrWrap);
  dateRow.appendChild(depWrap);
  body.appendChild(dateRow);

  autoFetchBtn.onclick = () => {
    fetchVesselScheduleAuto(nameInput.value.trim(), vesselFetchStatus, vesselFetchResults, (match) => {
      if (match.vessel) {
        const port = match.terminal === "한진인천" ? "인천" : "부산";
        nameInput.value = match.vessel + " (" + port + ")";
      }
      voyInput.value = match.voyage || voyInput.value;
      if (match.eta) arrInput.value = normalizeDateForInput(match.eta);
      if (match.etd) depInput.value = normalizeDateForInput(match.etd);
    });
  };

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.type = "button";
  saveBtn.textContent = "💾 저장";
  saveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) { alert("선명을 입력해주세요."); return; }
    let targetMonth = month;
    if (!targetMonth) {
      if (!arrInput.value) { alert("모선 입항일을 먼저 선택해주세요 (그 날짜로 달을 자동 판단해요)."); return; }
      targetMonth = arrInput.value.slice(0, 7);
      if (!VESSEL_MONTHS.includes(targetMonth)) {
        VESSEL_MONTHS.push(targetMonth);
      }
    }
    const entry = {
      month: targetMonth, name: name,
      code: codeInput.value.trim(), voyage: voyInput.value.trim(),
      arrivalDate: arrInput.value, departureDate: depInput.value,
      arrivalTimeConfirmed: arrConfirmChk.checked, departureTimeConfirmed: depConfirmChk.checked
    };

    if (VESSEL_SHEET_API_URL) {
      // 실시간 공유가 켜져 있으면 서버(구글시트)에 저장하고, 성공하면 최신 목록을 다시 받아옴
      saveBtn.disabled = true;
      saveBtn.textContent = "💾 저장 중...";
      const result = existing
        ? await updateVesselOnServer(Object.assign({ id: existing.id }, entry))
        : await submitVesselToServer(entry);
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 저장";
      if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
      expandedVesselMonths.add(targetMonth);
      closeVesselEditor();
      await loadVesselTab(); // 방금 저장한 내용까지 포함해서 최신 목록으로 다시 그림
      return;
    }

    // 연동 꺼져있으면 예전 방식(브라우저 저장) 그대로
    if (existing) {
      existing.name = name;
      existing.code = codeInput.value.trim();
      existing.voyage = voyInput.value.trim();
      existing.arrivalDate = arrInput.value;
      existing.departureDate = depInput.value;
    } else {
      VESSELS.push({
        id: genId("vsl"), month: targetMonth, name: name,
        code: codeInput.value.trim(), voyage: voyInput.value.trim(),
        arrivalDate: arrInput.value, departureDate: depInput.value
      });
    }
    const ok = saveData();
    if (!ok) { alert("저장에 실패했어요."); return; }
    expandedVesselMonths.add(targetMonth);
    closeVesselEditor();
    renderVesselTab();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeVesselEditor();
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}

/* 자동조회 지원 터미널 목록 - 하나씩 검증되는 대로 여기에 추가 */
const VESSEL_AUTO_FETCH_TERMINALS = [
  { source: "pnit", label: "PNIT" },
  { source: "hpnt", label: "HPNT" },
  { source: "bpt", label: "BPT" },
  { source: "hanjin_incheon", label: "한진인천" },
  { source: "e1", label: "E1" },
];

/* 자동조회가 안 되는 터미널 - 트레드링스 하나로 통일해서 바로가기 제공 */
const MANUAL_TERMINAL_LINKS = [
  { label: "트레드링스(전체 터미널)", url: "https://www.tradlinx.com/ko/container-terminal-schedule" },
];

async function fetchVesselScheduleAuto(vesselName, statusEl, resultsEl, onPick) {
  resultsEl.innerHTML = "";
  if (!vesselName) { statusEl.textContent = "⚠️ 선명을 먼저 입력해주세요."; return; }
  statusEl.textContent = "🔄 조회 중... (" + VESSEL_AUTO_FETCH_TERMINALS.map((t) => t.label).join(", ") + ")";

  const fetchOne = async (term) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25초 넘으면 포기
    try {
      const url = CITI_FX_PROXY_URL + "?source=" + term.source + "&vessel=" + encodeURIComponent(vesselName);
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();
      if (!data.ok) {
        console.warn("[자동조회] " + term.label + " 실패:", data.error || "알 수 없는 오류");
        return [];
      }
      if (data.results && data.results.length) {
        return data.results.map((r) => Object.assign({ terminal: term.label }, r));
      }
    } catch (e) {
      console.warn("[자동조회] " + term.label + " 요청 실패:", e && e.message ? e.message : e);
    } finally {
      clearTimeout(timeoutId);
    }
    return [];
  };

  // 앱스스크립트 하나에 한꺼번에 너무 많은 요청이 몰리지 않게, 2개씩 묶어서 순차 실행
  const chunks = [];
  for (let i = 0; i < VESSEL_AUTO_FETCH_TERMINALS.length; i += 2) {
    chunks.push(VESSEL_AUTO_FETCH_TERMINALS.slice(i, i + 2));
  }
  const resultsByTerminal = [];
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(fetchOne));
    resultsByTerminal.push(...chunkResults);
  }
  let allMatches = resultsByTerminal.flat();

  if (allMatches.length === 0) {
    statusEl.textContent = "⚠️ 등록된 터미널(" + VESSEL_AUTO_FETCH_TERMINALS.map((t) => t.label).join(", ") + ")에서 못 찾았어요. 아래 'BCT/HJIT 직접 확인' 링크를 써보세요.";
    return;
  }

  if (allMatches.length === 1) {
    onPick(allMatches[0]);
    statusEl.textContent = "✅ " + allMatches[0].terminal + "에서 자동으로 채워졌어요 (항차 " + (allMatches[0].voyage || "-") + "). 필요하면 직접 수정하세요.";
    return;
  }

  statusEl.textContent = "🔎 " + allMatches.length + "건 찾았어요. 맞는 항차를 골라주세요:";
  allMatches.forEach((m) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn secondary-btn";
    btn.style.cssText = "display:block;width:100%;text-align:left;margin-top:6px;";
    btn.textContent = "[" + m.terminal + "] " + m.vessel + " · 항차 " + (m.voyage || "-") + " · 접안 " + (m.eta || "-") + " · 출항 " + (m.etd || "-");
    btn.onclick = () => {
      onPick(m);
      statusEl.textContent = "✅ " + m.terminal + " " + (m.voyage || "") + " 기준으로 채워졌어요.";
      resultsEl.innerHTML = "";
    };
    resultsEl.appendChild(btn);
  });
}

/* 트레드링스 등 터미널스케줄 표에서 한 줄을 드래그해 복사 → 붙여넣기 했을 때 파싱.
   표준 열 순서(트레드링스 기준): Port, Terminal, Vessel Name, 터미널항차, Status, Cut-off, Arrival(ETA), Departure(ETD), Carrier
   탭 구분이 기본이고, 안 되면 공백 2개 이상으로도 시도. 날짜는 패턴 매칭으로 위치에 안 흔들리게 찾음. */
/* 트레드링스 등에서 복사하면 "New BusanBCT"처럼 셀 사이 줄바꿈이 없이 붙거나,
   "MFLW003OPEN"처럼 항차+상태가 한 줄에 붙어서 오는 경우가 있어서, 줄 위치가 아니라
   내용 패턴(날짜/터미널코드/상태값/영문대문자 여부)으로 각 값을 알아서 찾아낸다. */
const TRADLINX_TERMINAL_CODES = [
  "BCT", "PNIT", "HPNT", "PNC", "DGT", "HJNC", "BNCT", "BPTG", "BPTS", "HKTG", "BPT", "E1", "한진",
];
const TRADLINX_STATUS_WORDS = [
  "OPEN", "CLOSED", "CLOSING", "CLOSING SOON", "DEPARTED", "ARRIVED", "PLANNED", "WORKING", "BERTHED", "SAILED",
];

function parsePastedVesselRow(text) {
  if (!text || !text.trim()) return null;

  let lines = text
    .split(/\t|\r?\n/)
    .map((l) => l.replace(/\[([^\]]+)\]\([^)]*\)/, "$1").trim())
    .filter((l) => l !== "");
  if (lines.length < 2) return null;

  const dateRe = /(\d{4})[/-](\d{2})[/-](\d{2})(\s+\d{2}:\d{2})?/;
  const statusSuffixRe = new RegExp("(" + TRADLINX_STATUS_WORDS.join("|") + ")$", "i");

  let dates = []; // 찾은 날짜를 순서대로 다 모아뒀다가, 개수를 보고 무슨 날짜인지 나중에 판단
  let voyage = "";
  let vessel = "";

  lines.forEach((rawLine) => {
    if (dateRe.test(rawLine)) {
      dates.push(normalizeDateForInput(rawLine));
      return;
    }

    let candidate = rawLine;

    // "MFLW003OPEN"처럼 상태값이 뒤에 붙어있으면 떼어내기
    const statusMatch = candidate.match(statusSuffixRe);
    if (statusMatch) {
      candidate = candidate.slice(0, statusMatch.index).trim();
      if (!candidate) return; // 상태값만 단독으로 있던 줄
    }
    if (TRADLINX_STATUS_WORDS.includes(candidate.toUpperCase())) return;

    // "New BusanBCT"처럼 터미널 코드가 뒤에 붙어있으면 떼어내기
    TRADLINX_TERMINAL_CODES.forEach((code) => {
      const re = new RegExp(code + "$", "i");
      if (re.test(candidate) && candidate.toUpperCase() !== code) {
        candidate = candidate.replace(re, "").trim();
      }
    });
    if (TRADLINX_TERMINAL_CODES.includes(candidate.toUpperCase())) return; // 터미널 코드만 단독으로 남으면 스킵
    if (!candidate) return;

    // 알파벳+숫자가 섞인 짧은 코드형(공백 없음, 숫자 포함) → 항차로 추정
    if (!voyage && /^[A-Z0-9-]{3,12}$/i.test(candidate) && /\d/.test(candidate)) {
      voyage = candidate;
      return;
    }

    // 영문 대문자 위주(숫자 없음)면 선명 후보 - 단, "New Busan"처럼 첫 글자만 대문자인
    // 포트명은 전체가 대문자가 아니라서 자동으로 걸러짐
    if (!vessel && !/\d/.test(candidate) && candidate === candidate.toUpperCase() && candidate.replace(/[^A-Za-z]/g, "").length >= 3) {
      vessel = candidate;
    }
  });

  // 트레드링스 표는 항상 "Cut-off(closed) → Arrival(ETA) → Departure(ETD)" 순서로 나온다.
  // PNIT처럼 Cut-off 날짜가 있는 터미널은 날짜가 3개 잡히므로, 맨 앞(Cut-off)은 버리고
  // 뒤의 2개(입항일/출항일)만 쓴다. Cut-off가 없는 터미널은 날짜가 2개만 잡혀서 그대로 쓴다.
  let eta = "";
  let etd = "";
  if (dates.length >= 3) {
    eta = dates[1];
    etd = dates[2];
  } else if (dates.length === 2) {
    eta = dates[0];
    etd = dates[1];
  } else if (dates.length === 1) {
    eta = dates[0];
  }

  if (!vessel && !eta && !etd) return null;
  const isIncheon = /인천|incheon/i.test(text);
  return { vessel, voyage, eta, etd, isIncheon };
}

/* datetime-local input에 넣을 값 보정 - 기존 데이터가 시간 없이 "YYYY-MM-DD"만 있으면
   "T00:00"을 붙여서 입력칸이 깨지지 않게 함 */
function toDatetimeLocalValue(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + "T00:00";
  return s;
}

/* "2026-08-01T14:30" 형태를 "2026-08-01 14:30"처럼 보기 좋게 표시.
   시간이 00:00(입력 안 한 경우)이면 시간은 생략하고 날짜만 보여줌 */
function formatVesselDateTime(s, confirmed) {
  if (!s) return "-";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (!m) return s;
  if (m[2] === "00:00" && !confirmed) return m[1]; // 시간을 명시적으로 확인한 게 아니면, 00:00은 "시간 미입력"으로 보고 숨김
  return m[1] + " " + m[2];
}

function normalizeDateForInput(s) {
  const m = s.match(/(\d{4})[/-](\d{2})[/-](\d{2})(?:[T\s]+(\d{2}):(\d{2}))?/);
  if (!m) return "";
  const datePart = m[1] + "-" + m[2] + "-" + m[3];
  const timePart = (m[4] && m[5]) ? (m[4] + ":" + m[5]) : "00:00";
  return datePart + "T" + timePart;
}

async function deleteVessel(id) {
  const item = VESSELS.find((v) => v.id === id);
  if (!item) return;
  if (!confirm('"' + item.name + '" 일정을 삭제할까요?')) return;

  if (VESSEL_SHEET_API_URL) {
    const result = await deleteVesselFromServer(id);
    if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    expandedVesselMonths.add(item.month);
    await loadVesselTab();
    return;
  }

  VESSELS = VESSELS.filter((v) => v.id !== id);
  saveData();
  expandedVesselMonths.add(item.month);
  renderVesselTab();
}

/* ---- 새 달 추가 모달 (같은 오버레이를 재사용) ---- */
function openAddVesselMonth() {
  const months = VESSEL_MONTHS.slice().sort();
  const suggested = months.length ? nextMonthAfter(months[months.length - 1]) : "2026-07";

  const overlay = document.getElementById("vesselEditOverlay");
  document.getElementById("vesselEditTitle").textContent = "🗓 새 달 추가";
  overlay.style.display = "flex";

  const body = document.getElementById("vesselEditBody");
  body.innerHTML = "";
  body.appendChild(makeLabel("연-월"));
  const monthInput = document.createElement("input");
  monthInput.type = "month";
  monthInput.value = suggested;
  body.appendChild(monthInput);

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.type = "button";
  saveBtn.textContent = "💾 추가";
  saveBtn.onclick = () => {
    const m = monthInput.value;
    if (!m) { alert("연-월을 선택해주세요."); return; }
    if (VESSEL_MONTHS.includes(m)) { alert("이미 등록된 달이에요."); return; }
    VESSEL_MONTHS.push(m);
    const ok = saveData();
    if (!ok) { alert("저장에 실패했어요."); return; }
    expandedVesselMonths.add(m);
    closeVesselEditor();
    renderVesselTab();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closeVesselEditor();
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}

async function deleteVesselMonth(month) {
  const vesselsInMonth = VESSELS.filter((v) => v.month === month);
  const count = vesselsInMonth.length;
  const msg = count > 0
    ? monthLabel(month) + "을(를) 삭제하면 그 안의 배 일정 " + count + "건도 함께 삭제돼요. 계속할까요?"
    : monthLabel(month) + "을(를) 삭제할까요?";
  if (!confirm(msg)) return;

  VESSEL_MONTHS = VESSEL_MONTHS.filter((m) => m !== month);
  expandedVesselMonths.delete(month);

  if (VESSEL_SHEET_API_URL) {
    // 서버에 있는 배들도 하나씩 삭제 (실패한 건 있으면 알려드림)
    let failCount = 0;
    for (const v of vesselsInMonth) {
      const result = await deleteVesselFromServer(v.id);
      if (!result.ok) failCount++;
    }
    if (failCount > 0) alert(failCount + "건은 삭제에 실패했어요. 네트워크 확인 후 다시 시도해주세요.");
    saveData(); // VESSEL_MONTHS는 여전히 브라우저 로컬 값이라 저장
    await loadVesselTab();
    return;
  }

  VESSELS = VESSELS.filter((v) => v.month !== month);
  saveData();
  renderVesselTab();
}

/* normalizeVesselDateStr - 위임장 등 다른 곳에서도 씀 */
function normalizeVesselDateStr(s) {
  if (!s) return "";
  const m = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return "";
  const mo = String(parseInt(m[2], 10)).padStart(2, "0");
  const d = String(parseInt(m[3], 10)).padStart(2, "0");
  return m[1] + "-" + mo + "-" + d;
}


/* =========================================================================
   휴가 일정 탭
   ========================================================================= */

function formatDateRange(start, end) {
  const fmt = (d) => {
    if (!d) return "?";
    const parts = d.split("-");
    return parseInt(parts[1], 10) + "/" + parseInt(parts[2], 10);
  };
  return start === end ? fmt(start) : fmt(start) + " ~ " + fmt(end);
}

/* 휴가 탭 전체(공지 + 월별 사용 현황표 + 상세 일정)를 한 번에 새로고침 */
function renderVacationTab() {
  renderVacationNotice();
  renderVacationSummaryTable();
  renderVacationList();
}

/* ---- 공지사항 ---- */
function renderVacationNotice() {
  const wrap = document.getElementById("vacationNoticeWrap");
  wrap.innerHTML = "";
  const box = document.createElement("div");
  box.className = "vacation-notice-box";

  const head = document.createElement("div");
  head.className = "vacation-notice-head";
  head.innerHTML = "<span>📢 휴가 사용 공지</span>";
  const editBtn = document.createElement("button");
  editBtn.className = "btn secondary-btn";
  editBtn.textContent = "✏️ 편집";
  editBtn.onclick = () => renderVacationNoticeEdit();
  head.appendChild(editBtn);
  box.appendChild(head);

  const text = document.createElement("div");
  text.className = "vacation-notice-text";
  text.textContent = VACATION_NOTICE && VACATION_NOTICE.trim() ? VACATION_NOTICE : "등록된 공지가 없어요.";
  box.appendChild(text);

  wrap.appendChild(box);
}

function renderVacationNoticeEdit() {
  const wrap = document.getElementById("vacationNoticeWrap");
  wrap.innerHTML = "";
  const box = document.createElement("div");
  box.className = "vacation-notice-box";

  const head = document.createElement("div");
  head.className = "vacation-notice-head";
  head.innerHTML = "<span>📢 휴가 사용 공지 편집 (팀 전체에게 보여요)</span>";
  box.appendChild(head);

  const textarea = document.createElement("textarea");
  textarea.style.height = "110px";
  textarea.value = VACATION_NOTICE || "";
  textarea.placeholder = "예: 휴가는 최소 3일 전에 팀장님께 미리 말씀해주시고 등록해주세요.";
  box.appendChild(textarea);

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.textContent = "💾 저장";
  saveBtn.onclick = () => {
    VACATION_NOTICE = textarea.value;
    saveData();
    renderVacationNotice();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => renderVacationNotice();
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  box.appendChild(actions);

  wrap.appendChild(box);
}

/* ---- 월별 사용 현황(달력형) + 잔여 휴가일수 ---- */

/* 휴가 기간(start~end)이 특정 연/월과 겹치는 일수 (달력 걸쳐도 정확히 계산) */
/* 연차 종류별 소진 일수 - 연차(하루 종일)=1, 반차(오전/오후)=0.5, 반반차(2시간 단위 등)=0.25 */
const VACATION_UNIT_VALUES = { full: 1, half: 0.5, quarter: 0.25 };
const VACATION_UNIT_LABELS = { full: "연차", half: "반차", quarter: "반반차" };

function daysInMonthOverlap(startStr, endStr, year, month) {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const from = start > monthStart ? start : monthStart;
  const to = end < monthEnd ? end : monthEnd;
  if (from > to) return 0;
  return Math.round((to - from) / 86400000) + 1;
}

/* 숫자를 "1", "0.5", "1.25" 처럼 불필요한 소수점 0은 없애고 표시 */
function formatVacationDays(n) {
  return Math.round(n * 100) / 100 + "";
}

function computeVacationUsage(member, year) {
  const monthly = new Array(12).fill(0);
  VACATIONS.forEach((v) => {
    if (v.name !== member.name) return;
    const unitValue = VACATION_UNIT_VALUES[v.unit] || 1; // 예전 데이터(단위 미지정)는 연차(1)로 취급
    for (let m = 1; m <= 12; m++) {
      monthly[m - 1] += daysInMonthOverlap(v.startDate, v.endDate, year, m) * unitValue;
    }
  });
  const yearTotal = monthly.reduce((a, b) => a + b, 0);
  return { monthly, yearTotal };
}

let vacationMonthlyExpanded = false; // 월별 휴가표를 펼쳐서(월별 숫자까지) 보여줄지 여부 - 이 브라우저 세션에서만 기억함

function renderVacationSummaryTable() {
  const wrap = document.getElementById("vacationSummaryWrap");
  wrap.innerHTML = "";

  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const titleRow = document.createElement("div");
  titleRow.style.display = "flex";
  titleRow.style.alignItems = "center";
  titleRow.style.justifyContent = "space-between";
  titleRow.style.gap = "10px";

  const title = document.createElement("div");
  title.className = "section-title";
  title.style.marginTop = "0";
  title.textContent = `📅 ${year}년 월별 휴가 사용 현황`;
  titleRow.appendChild(title);

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "btn secondary-btn";
  toggleBtn.style.padding = "6px 12px";
  toggleBtn.style.fontSize = "12.5px";
  toggleBtn.textContent = vacationMonthlyExpanded ? "▲ 월별 상세 접기" : "▼ 월별 상세 펼치기";
  toggleBtn.onclick = () => { vacationMonthlyExpanded = !vacationMonthlyExpanded; renderVacationSummaryTable(); };
  titleRow.appendChild(toggleBtn);

  wrap.appendChild(titleRow);

  if (VACATION_MEMBERS.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '등록된 팀원이 없어요. "⚙️ 관리 → 🎫 팀원 휴가일수"에서 추가해보세요.';
    wrap.appendChild(empty);
    return;
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "vacation-summary-table-wrap";

  const table = document.createElement("table");
  table.className = "vacation-summary-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["사번", "이름"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.appendChild(th);
  });
  const grantedTh = document.createElement("th");
  grantedTh.textContent = "총 부여일수";
  headRow.appendChild(grantedTh);
  if (vacationMonthlyExpanded) {
    for (let m = 1; m <= 12; m++) {
      const th = document.createElement("th");
      th.textContent = m + "월";
      if (m === currentMonth) th.classList.add("current-month-col");
      headRow.appendChild(th);
    }
  }
  const remainTh = document.createElement("th");
  remainTh.textContent = "잔여";
  headRow.appendChild(remainTh);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const monthlyTotals = new Array(12).fill(0);
  let grandUsedTotal = 0;
  let grandRemainingTotal = 0;
  let grandGrantedTotal = 0;
  VACATION_MEMBERS.forEach((member) => {
    const { monthly, yearTotal } = computeVacationUsage(member, year);
    const remaining = (member.totalDays || 0) - yearTotal;
    monthly.forEach((count, idx) => { monthlyTotals[idx] += count; });
    grandUsedTotal += yearTotal;
    grandRemainingTotal += remaining;
    grandGrantedTotal += (member.totalDays || 0);

    const row = document.createElement("tr");
    const noTd = document.createElement("td");
    noTd.className = "vacation-emp-no";
    noTd.textContent = member.empNo || "-";
    const nameTd = document.createElement("td");
    nameTd.className = "vacation-emp-name vacation-name-link";
    nameTd.textContent = member.name;
    nameTd.onclick = () => openPersonVacationEditor(member.name);
    row.appendChild(noTd);
    row.appendChild(nameTd);

    const grantedTd = document.createElement("td");
    grantedTd.innerHTML = '<span class="granted-pill">' + formatVacationDays(member.totalDays || 0) + "일</span>";
    row.appendChild(grantedTd);

    monthly.forEach((count, idx) => {
      if (!vacationMonthlyExpanded) return;
      const td = document.createElement("td");
      if (idx + 1 === currentMonth) td.classList.add("current-month-col");
      td.innerHTML = count > 0
        ? '<span class="month-pill">' + formatVacationDays(count) + '</span>'
        : '<span class="month-pill zero">-</span>';
      row.appendChild(td);
    });

    const remainTd = document.createElement("td");
    const remainClass = remaining <= 0 ? "remaining-pill low" : "remaining-pill";
    remainTd.innerHTML = '<span class="' + remainClass + '">' + formatVacationDays(remaining) + "일</span>";
    row.appendChild(remainTd);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  const tfoot = document.createElement("tfoot");
  const totalRow = document.createElement("tr");
  totalRow.className = "vacation-total-row";
  const totalLabelTd = document.createElement("td");
  totalLabelTd.colSpan = 2;
  totalLabelTd.textContent = "🧮 월별 합계";
  totalRow.appendChild(totalLabelTd);
  const grantedTotalTd = document.createElement("td");
  grantedTotalTd.style.textAlign = "center";
  grantedTotalTd.innerHTML = '<span class="granted-pill total-pill">' + formatVacationDays(grandGrantedTotal) + "일</span>";
  totalRow.appendChild(grantedTotalTd);
  monthlyTotals.forEach((sum, idx) => {
    if (!vacationMonthlyExpanded) return;
    const td = document.createElement("td");
    if (idx + 1 === currentMonth) td.classList.add("current-month-col");
    td.innerHTML = sum > 0
      ? '<span class="month-pill total-pill">' + formatVacationDays(sum) + '</span>'
      : '<span class="month-pill zero">-</span>';
    totalRow.appendChild(td);
  });
  const grandTotalTd = document.createElement("td");
  grandTotalTd.innerHTML = '<span class="remaining-pill total-pill">' + formatVacationDays(grandRemainingTotal) + "일</span>";
  totalRow.appendChild(grandTotalTd);
  tfoot.appendChild(totalRow);
  table.appendChild(tfoot);

  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.marginTop = "10px";
  hint.textContent = "이름·사번·총 휴가일수는 \"⚙️ 관리 → 🎫 팀원 휴가일수\"에서 등록/수정할 수 있어요. 이 표는 아래 \"상세 일정\"에 등록된 이름과 일치하는 휴가만 자동으로 집계돼요.";
  wrap.appendChild(hint);
}

function renderVacationList() {
  const list = document.getElementById("vacationList");
  list.innerHTML = "";
  if (VACATIONS.length === 0) {
    list.innerHTML = '<div class="empty-state">아직 등록된 휴가 일정이 없어요. "+ 휴가 추가하기"로 등록해보세요.</div>';
    return;
  }
  const todayStr = new Date().toISOString().slice(0, 10);

  // 이름별로 그룹핑
  const byName = {};
  VACATIONS.forEach((v) => {
    if (!byName[v.name]) byName[v.name] = [];
    byName[v.name].push(v);
  });
  const names = Object.keys(byName).sort((a, b) => a.localeCompare(b, "ko"));

  names.forEach((name) => {
    const entries = byName[name].slice().sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    const hasOngoing = entries.some((v) => v.startDate && v.endDate && todayStr >= v.startDate && todayStr <= v.endDate);

    const card = document.createElement("div");
    card.className = "content-card vacation-card" + (hasOngoing ? " is-ongoing" : "");
    card.onclick = () => openPersonVacationEditor(name);

    const row = document.createElement("div");
    row.className = "resource-row";

    const left = document.createElement("div");
    left.style.cssText = "min-width:0;";
    const nameLine = document.createElement("div");
    nameLine.className = "content-card-title";
    nameLine.textContent = name + (hasOngoing ? " 🌴" : "");
    left.appendChild(nameLine);

    const summaryLine = document.createElement("div");
    summaryLine.className = "vacation-summary-line";
    summaryLine.textContent = entries.map((v) => {
      const unitLabel = VACATION_UNIT_LABELS[v.unit] || "연차";
      const dateLabel = v.startDate === v.endDate
        ? formatShortDate(v.startDate)
        : formatShortDate(v.startDate) + "~" + formatShortDate(v.endDate);
      const noteLabel = v.note ? " " + v.note : " " + unitLabel;
      return dateLabel + noteLabel;
    }).join(",  ");
    left.appendChild(summaryLine);
    row.appendChild(left);

    const countBadge = document.createElement("span");
    countBadge.className = "vacation-badge vacation-unit-badge";
    countBadge.style.flexShrink = "0";
    countBadge.textContent = entries.length + "건 · 자세히 보기 →";
    row.appendChild(countBadge);

    card.appendChild(row);
    list.appendChild(card);
  });
}

/* "2026-08-03" -> "8/3" 짧은 날짜 표시 */
function formatShortDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  return parseInt(parts[1], 10) + "/" + parseInt(parts[2], 10);
}

/* ---- 한 사람의 휴가 목록을 모아서 보여주고 그 자리에서 수정/삭제/추가 ---- */
function openPersonVacationEditor(name) {
  const overlay = document.getElementById("personVacationOverlay");
  document.getElementById("personVacationTitle").textContent = "🏖️ " + name + "님의 휴가";
  overlay.style.display = "flex";
  renderPersonVacationBody(name);
}

function closePersonVacationEditor() {
  document.getElementById("personVacationOverlay").style.display = "none";
  renderVacationList(); // 요약 줄(건수 등)이 바뀌었을 수 있으니 뒤 화면도 갱신
}

/* person-vacation-row 안에서 값 하나 바뀔 때마다 호출 - 서버 연동 켜져있으면 그쪽으로,
   아니면 예전처럼 로컬 저장 */
async function persistVacationEdit(v) {
  if (CORE_SHEET_API_URL) {
    const result = await updateVacationOnServer({ id: v.id, name: v.name, startDate: v.startDate, endDate: v.endDate, note: v.note || "", unit: v.unit || "full" });
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return false; }
    await syncVacationsFromServer();
    return true;
  }
  return saveData();
}

function renderPersonVacationBody(name) {
  const body = document.getElementById("personVacationBody");
  body.innerHTML = "";

  const entries = VACATIONS.filter((v) => v.name === name).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.style.marginBottom = "10px";
    empty.textContent = "등록된 휴가가 없어요. 아래에서 추가해보세요.";
    body.appendChild(empty);
  }

  entries.forEach((v) => {
    const row = document.createElement("div");
    row.className = "person-vacation-row";
    row.style.flexWrap = "wrap";

    const isRange = v.startDate !== v.endDate;

    const dateWrap = document.createElement("div");
    dateWrap.style.cssText = "display:flex;gap:4px;align-items:center;flex-shrink:0;";

    const startInput = document.createElement("input");
    startInput.type = "date";
    startInput.value = v.startDate;
    startInput.style.cssText = "width:126px;margin-bottom:0;";
    dateWrap.appendChild(startInput);

    const tilde = document.createElement("span");
    tilde.textContent = "~";
    tilde.style.cssText = isRange ? "" : "display:none;";
    dateWrap.appendChild(tilde);

    const endInput = document.createElement("input");
    endInput.type = "date";
    endInput.value = v.endDate;
    endInput.style.cssText = "width:126px;margin-bottom:0;" + (isRange ? "" : "display:none;");
    dateWrap.appendChild(endInput);
    row.appendChild(dateWrap);

    const rangeLabel = document.createElement("label");
    rangeLabel.className = "vacation-range-toggle";
    rangeLabel.style.flexShrink = "0";
    const rangeCheck = document.createElement("input");
    rangeCheck.type = "checkbox";
    rangeCheck.checked = isRange;
    rangeCheck.onchange = () => {
      if (rangeCheck.checked) {
        tilde.style.display = ""; endInput.style.display = "";
      } else {
        tilde.style.display = "none"; endInput.style.display = "none";
        endInput.value = startInput.value;
        v.endDate = startInput.value;
        persistVacationEdit(v).then(() => { refreshCurrentTab(); renderPersonVacationBody(name); });
      }
    };
    rangeLabel.appendChild(rangeCheck);
    rangeLabel.appendChild(document.createTextNode(" 기간"));
    row.appendChild(rangeLabel);

    startInput.onchange = () => {
      v.startDate = startInput.value;
      if (!rangeCheck.checked) { endInput.value = startInput.value; v.endDate = startInput.value; }
      else if (endInput.value && endInput.value < startInput.value) { endInput.value = startInput.value; v.endDate = startInput.value; }
      persistVacationEdit(v).then(() => { refreshCurrentTab(); renderPersonVacationBody(name); });
    };
    endInput.onchange = () => {
      v.endDate = endInput.value < v.startDate ? v.startDate : endInput.value;
      endInput.value = v.endDate;
      persistVacationEdit(v).then(() => { refreshCurrentTab(); renderPersonVacationBody(name); });
    };

    const unitSelect = document.createElement("select");
    unitSelect.style.cssText = "width:88px;flex-shrink:0;margin-bottom:0;";
    ["full", "half", "quarter"].forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = VACATION_UNIT_LABELS[u];
      unitSelect.appendChild(opt);
    });
    unitSelect.value = v.unit || "full";
    unitSelect.onchange = () => {
      v.unit = unitSelect.value;
      persistVacationEdit(v).then(() => { refreshCurrentTab(); renderPersonVacationBody(name); });
    };
    row.appendChild(unitSelect);

    const delBtn = document.createElement("button");
    delBtn.className = "btn secondary-btn";
    delBtn.style.cssText = "flex-shrink:0;padding:6px 10px;font-size:12px;color:#dc2626;";
    delBtn.textContent = "삭제";
    delBtn.onclick = async () => {
      if (CORE_SHEET_API_URL) {
        const result = await deleteVacationFromServer(v.id);
        if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
        await syncVacationsFromServer();
      } else {
        VACATIONS = VACATIONS.filter((t) => t.id !== v.id);
        saveData();
      }
      refreshCurrentTab();
      renderPersonVacationBody(name);
    };
    row.appendChild(delBtn);

    body.appendChild(row);
  });

  const addRow = document.createElement("div");
  addRow.className = "person-vacation-row";
  addRow.style.marginTop = "10px";

  const addDate = document.createElement("input");
  addDate.type = "date";
  addDate.style.cssText = "width:126px;flex-shrink:0;margin-bottom:0;";
  addRow.appendChild(addDate);

  const addUnit = document.createElement("select");
  addUnit.style.cssText = "width:88px;flex-shrink:0;margin-bottom:0;";
  ["full", "half", "quarter"].forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = VACATION_UNIT_LABELS[u];
    addUnit.appendChild(opt);
  });
  addRow.appendChild(addUnit);

  const addBtn = document.createElement("button");
  addBtn.className = "btn generate-btn";
  addBtn.style.cssText = "flex-shrink:0;padding:6px 14px;font-size:12.5px;";
  addBtn.textContent = "+ 추가";
  addBtn.onclick = async () => {
    if (!addDate.value) { alert("날짜를 선택해주세요."); return; }
    const entry = { name, startDate: addDate.value, endDate: addDate.value, unit: addUnit.value, note: "" };
    if (CORE_SHEET_API_URL) {
      const result = await submitVacationToServer(entry);
      if (!result.ok) { alert("등록에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
      await syncVacationsFromServer();
    } else {
      VACATIONS.push(Object.assign({ id: genId("v") }, entry));
      saveData();
    }
    refreshCurrentTab();
    renderPersonVacationBody(name);
  };
  addRow.appendChild(addBtn);
  body.appendChild(addRow);
}

/* ---- 🌴 휴가 일정을 관리 화면 안 거치고 바로 추가/수정 ---- */
function openVacationEditor(existingId, prefillName) {
  const overlay = document.getElementById("vacationEditOverlay");
  const nameOptions = document.getElementById("vacationNameOptions");
  nameOptions.innerHTML = VACATION_MEMBERS.map((m) => '<option value="' + escapeHtml(m.name) + '">').join("");

  document.getElementById("vacationEditTitle").textContent = existingId ? "✏️ 휴가 일정 수정" : "🌴 휴가 추가";
  overlay.style.display = "flex";
  renderVacationEditorBody(existingId, prefillName);
}

function closeVacationEditor() {
  document.getElementById("vacationEditOverlay").style.display = "none";
}

function renderVacationEditorBody(existingId, prefillName) {
  const body = document.getElementById("vacationEditBody");
  body.innerHTML = "";

  const existing = existingId ? VACATIONS.find((v) => v.id === existingId) : null;

  const nameInput = document.createElement("input");
  nameInput.setAttribute("list", "vacationNameOptions");
  nameInput.placeholder = "이름 (예: 김민지)";
  nameInput.value = existing ? existing.name : (prefillName || "");
  body.appendChild(nameInput);

  const unitLabel = document.createElement("div");
  unitLabel.className = "hint";
  unitLabel.style.cssText = "margin:2px 0 4px;";
  unitLabel.textContent = "연차 종류";
  body.appendChild(unitLabel);

  const unitSelect = document.createElement("select");
  ["full", "half", "quarter"].forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = VACATION_UNIT_LABELS[u] + " (" + VACATION_UNIT_VALUES[u] + "일)";
    unitSelect.appendChild(opt);
  });
  unitSelect.value = existing ? (existing.unit || "full") : "full";
  body.appendChild(unitSelect);

  const dateRow = document.createElement("div");
  dateRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
  const startInput = document.createElement("input");
  startInput.type = "date";
  startInput.style.cssText = "width:140px;flex-shrink:0;";
  startInput.value = existing ? existing.startDate : "";
  const tilde = document.createElement("span");
  tilde.textContent = "~";
  const endInput = document.createElement("input");
  endInput.type = "date";
  endInput.style.cssText = "width:140px;flex-shrink:0;";
  endInput.value = existing ? existing.endDate : "";

  const isRange = existing ? existing.startDate !== existing.endDate : false;
  tilde.style.display = isRange ? "" : "none";
  endInput.style.display = isRange ? "" : "none";

  const rangeLabel = document.createElement("label");
  rangeLabel.className = "vacation-range-toggle";
  const rangeCheck = document.createElement("input");
  rangeCheck.type = "checkbox";
  rangeCheck.checked = isRange;
  rangeCheck.onchange = () => {
    if (rangeCheck.checked) {
      tilde.style.display = ""; endInput.style.display = "";
    } else {
      tilde.style.display = "none"; endInput.style.display = "none";
      endInput.value = startInput.value;
    }
  };
  rangeLabel.appendChild(rangeCheck);
  rangeLabel.appendChild(document.createTextNode(" 여러 날짜에 걸쳐요"));

  startInput.onchange = () => {
    if (!rangeCheck.checked) { endInput.value = startInput.value; }
    else if (endInput.value && endInput.value < startInput.value) { endInput.value = startInput.value; }
  };

  dateRow.appendChild(startInput);
  dateRow.appendChild(tilde);
  dateRow.appendChild(endInput);
  dateRow.appendChild(rangeLabel);
  body.appendChild(dateRow);

  const noteInput = document.createElement("input");
  noteInput.placeholder = "메모 (예: 여름 휴가, 반차(오후) 등)";
  noteInput.value = existing ? (existing.note || "") : "";
  body.appendChild(noteInput);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn full";
  saveBtn.textContent = existing ? "저장" : "+ 추가하기";
  saveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) { alert("이름을 입력해주세요."); return; }
    if (!startInput.value) { alert("시작일을 선택해주세요."); return; }
    const endDate = rangeCheck.checked ? (endInput.value || startInput.value) : startInput.value;
    const unit = unitSelect.value;
    const entry = { name, startDate: startInput.value, endDate, note: noteInput.value.trim(), unit };

    if (CORE_SHEET_API_URL) {
      saveBtn.disabled = true;
      const result = existing
        ? await updateVacationOnServer(Object.assign({ id: existing.id }, entry))
        : await submitVacationToServer(entry);
      saveBtn.disabled = false;
      if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
      await syncVacationsFromServer();
      refreshCurrentTab();
      closeVacationEditor();
      return;
    }

    if (existing) {
      existing.name = name;
      existing.startDate = startInput.value;
      existing.endDate = endDate;
      existing.note = noteInput.value.trim();
      existing.unit = unit;
    } else {
      VACATIONS.push(Object.assign({ id: genId("v") }, entry));
    }
    saveData();
    refreshCurrentTab();
    closeVacationEditor();
  };
  body.appendChild(saveBtn);
}

