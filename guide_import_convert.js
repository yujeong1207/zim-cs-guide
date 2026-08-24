/* ===== guide_import_convert.js : original lines 25342-27105 ===== */
/* =========================================================================
   🧩 선택 가져오기 - 백업 파일 안의 항목 중 원하는 것만 골라서 가져오기
   (전체 가져오기는 다 교체돼버려서, 자료모음처럼 일부만 새로 반영하고 싶을 때는
   이걸로 쓰면 나머지 항목은 안 건드리고 딱 고른 것만 반영됨)
   ========================================================================= */
const PARTIAL_IMPORT_LABELS = {
  templates: "✉️ 메일 템플릿",
  ntfTemplates: "📨 공문 템플릿",
  procedures: "📋 업무 절차",
  faqs: "❓ FAQ",
  faqTopics: "🗂 FAQ 그룹",
  resources: "🔗 자료 모음",
  contacts: "📞 연락처",
  quotes: "💬 오늘의 한마디 문구",
  vacationMembers: "👥 팀원 휴가일수",
  vacationNotice: "📢 휴가 공지 문구",
  ltMailSettings: "📧 LT LIST 메일 기본값",
  ntfLetterhead: "📄 공문 레터헤드",
  exchangeRates: "💱 환율 이력",
  favoriteTemplateIds: "⭐ 메일템플릿 즐겨찾기",
  favoriteProcIds: "⭐ 절차 즐겨찾기",
  favoriteFaqIds: "⭐ FAQ 즐겨찾기",
  vacations: "🏖 확정휴가 (이미 실시간 연동됨 - 보통 선택 불필요)",
  holidays: "🎌 공휴일 (이미 실시간 연동됨 - 보통 선택 불필요)",
  teamEvents: "🗓 팀일정 (이미 실시간 연동됨 - 보통 선택 불필요)",
  noticeBanner: "📣 공지배너 (이미 실시간 연동됨 - 보통 선택 불필요)",
  vessels: "🚢 모선일정 (이미 실시간 연동됨 - 보통 선택 불필요)",
  vesselMonths: "🚢 모선일정 월 목록 (이미 실시간 연동됨 - 보통 선택 불필요)",
  poaList: "🖋 위임장 (이미 실시간 연동됨 - 보통 선택 불필요)",
  feedbackList: "💬 의견함 (이미 실시간 연동됨 - 보통 선택 불필요)",
};

const PARTIAL_IMPORT_SETTERS = {
  templates: (v) => { TEMPLATES = v; },
  ntfTemplates: (v) => { NTF_TEMPLATES = v; },
  procedures: (v) => { PROCEDURES = normalizeProcedures(v); },
  faqs: (v) => { FAQS = v; },
  faqTopics: (v) => { FAQ_TOPICS = v; },
  resources: (v) => { RESOURCES = v; },
  contacts: (v) => { CONTACTS = v; },
  quotes: (v) => { QUOTES = v; },
  vacationMembers: (v) => { VACATION_MEMBERS = v; },
  vacationNotice: (v) => { VACATION_NOTICE = v; },
  ltMailSettings: (v) => { LT_MAIL_SETTINGS = v; },
  ntfLetterhead: (v) => { NTF_LETTERHEAD = v; },
  exchangeRates: (v) => { EXCHANGE_RATES = v; },
  ttLines: (v) => { TT_LINES = v; },
  favoriteTemplateIds: (v) => { FAVORITE_TEMPLATE_IDS = v; },
  favoriteProcIds: (v) => { FAVORITE_PROC_IDS = v; },
  favoriteFaqIds: (v) => { FAVORITE_FAQ_IDS = v; },
  vacations: (v) => { VACATIONS = v; },
  holidays: (v) => { HOLIDAYS = v; },
  teamEvents: (v) => { TEAM_EVENTS = v; },
  noticeBanner: (v) => { NOTICE_BANNER = v; },
  vessels: (v) => { VESSELS = v; },
  vesselMonths: (v) => { VESSEL_MONTHS = v; },
  poaList: (v) => { POA_LIST = v; },
  feedbackList: (v) => { FEEDBACK_LIST = v; },
};

let pendingPartialImportData = null;

function handlePartialImportFile(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported || typeof imported !== "object") throw new Error("형식이 올바르지 않습니다");
      const foundKeys = Object.keys(PARTIAL_IMPORT_SETTERS).filter((k) => imported[k] !== undefined);
      if (foundKeys.length === 0) {
        alert("이 파일 안에서 가져올 수 있는 항목을 찾지 못했어요.");
        return;
      }
      pendingPartialImportData = imported;
      openPartialImportModal(foundKeys);
    } catch (err) {
      alert("파일을 읽을 수 없습니다. 올바른 백업 JSON 파일인지 확인해주세요.");
    }
  };
  reader.readAsText(file);
}

function openPartialImportModal(keys) {
  let overlay = document.getElementById("partialImportOverlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "partialImportOverlay";
  overlay.className = "admin-overlay";
  overlay.style.display = "flex";
  overlay.onclick = (e) => { if (e.target === overlay) { pendingPartialImportData = null; overlay.remove(); } };

  const box = document.createElement("div");
  box.className = "admin-panel small-panel";

  const header = document.createElement("div");
  header.className = "admin-header";
  const title = document.createElement("div");
  title.className = "admin-title";
  title.textContent = "🧩 어떤 항목을 가져올까요?";
  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "✕ 닫기";
  closeBtn.onclick = () => { pendingPartialImportData = null; overlay.remove(); };
  header.appendChild(title);
  header.appendChild(closeBtn);
  box.appendChild(header);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.marginBottom = "12px";
  hint.textContent = "체크한 항목만 이 파일 내용으로 교체돼요. 체크 안 한 항목은 지금 상태 그대로 안전하게 남아있어요.";
  box.appendChild(hint);

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:8px;max-height:320px;overflow-y:auto;";
  const checkboxes = [];
  keys.forEach((k) => {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = true;
    chk.dataset.key = k;
    checkboxes.push(chk);
    const span = document.createElement("span");
    span.textContent = PARTIAL_IMPORT_LABELS[k] || k;
    row.appendChild(chk);
    row.appendChild(span);
    list.appendChild(row);
  });
  box.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  actions.style.marginTop = "16px";
  const applyBtn = document.createElement("button");
  applyBtn.className = "btn generate-btn";
  applyBtn.type = "button";
  applyBtn.textContent = "✅ 선택한 항목 가져오기";
  applyBtn.onclick = () => {
    const selected = checkboxes.filter((c) => c.checked).map((c) => c.dataset.key);
    if (selected.length === 0) { alert("최소 하나는 선택해주세요."); return; }
    selected.forEach((k) => {
      if (pendingPartialImportData[k] !== undefined && PARTIAL_IMPORT_SETTERS[k]) {
        PARTIAL_IMPORT_SETTERS[k](pendingPartialImportData[k]);
      }
    });
    saveData();
    renderAdminList();
    refreshCurrentTab();
    renderNoticeBanner();
    renderFeedbackBadge();
    pendingPartialImportData = null;
    overlay.remove();
    alert("선택한 " + selected.length + "개 항목을 가져왔어요 💖");
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => { pendingPartialImportData = null; overlay.remove(); };
  actions.appendChild(applyBtn);
  actions.appendChild(cancelBtn);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function exportAll() {
  const payload = {
    templates: TEMPLATES, ntfTemplates: NTF_TEMPLATES, procedures: PROCEDURES, faqs: FAQS, resources: RESOURCES,
    vacations: VACATIONS, faqTopics: FAQ_TOPICS, faqProcedureMigrated: true, templateGroupsMigrated: true, ntfSeedsMigratedV2: true, workManualImportedV1: true, workManualImportedV3: true, workManualImportedV4: true, faqPhoneTopicV1: true,
    vacationMembers: VACATION_MEMBERS, vacationNotice: VACATION_NOTICE, teamEvents: TEAM_EVENTS,
    noticeBanner: NOTICE_BANNER, ltMailSettings: LT_MAIL_SETTINGS, ntfLetterhead: NTF_LETTERHEAD, contacts: CONTACTS, feedbackList: FEEDBACK_LIST,
    favoriteTemplateIds: FAVORITE_TEMPLATE_IDS,
    favoriteProcIds: FAVORITE_PROC_IDS, favoriteFaqIds: FAVORITE_FAQ_IDS,
    vesselMonths: VESSEL_MONTHS, vessels: VESSELS, quotes: QUOTES, poaList: POA_LIST, holidays: HOLIDAYS,
    exchangeRates: EXCHANGE_RATES, ttLines: TT_LINES
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cs_guide_backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported || typeof imported !== "object") throw new Error("형식이 올바르지 않습니다");
      if (!confirm("가져오기를 하면 절차·FAQ·메일템플릿·공문·자료·연락처·휴가일정 전체가 이 파일 내용으로 교체됩니다. 계속할까요?")) return;
      TEMPLATES = imported.templates || TEMPLATES;
      NTF_TEMPLATES = imported.ntfTemplates || NTF_TEMPLATES;
      PROCEDURES = normalizeProcedures(imported.procedures || PROCEDURES);
      FAQS = imported.faqs || FAQS;
      RESOURCES = imported.resources || RESOURCES;
      VACATIONS = imported.vacations || VACATIONS;
      FAQ_TOPICS = imported.faqTopics || FAQ_TOPICS;
      VACATION_MEMBERS = imported.vacationMembers || VACATION_MEMBERS;
      VACATION_NOTICE = imported.vacationNotice !== undefined ? imported.vacationNotice : VACATION_NOTICE;
      TEAM_EVENTS = imported.teamEvents || TEAM_EVENTS;
      NOTICE_BANNER = imported.noticeBanner || NOTICE_BANNER;
      LT_MAIL_SETTINGS = imported.ltMailSettings || LT_MAIL_SETTINGS;
      NTF_LETTERHEAD = imported.ntfLetterhead || NTF_LETTERHEAD;
      CONTACTS = imported.contacts || CONTACTS;
      FEEDBACK_LIST = imported.feedbackList || FEEDBACK_LIST;
      FAVORITE_TEMPLATE_IDS = imported.favoriteTemplateIds || FAVORITE_TEMPLATE_IDS;
      FAVORITE_PROC_IDS = imported.favoriteProcIds || FAVORITE_PROC_IDS;
      FAVORITE_FAQ_IDS = imported.favoriteFaqIds || FAVORITE_FAQ_IDS;
      VESSEL_MONTHS = imported.vesselMonths || VESSEL_MONTHS;
      VESSELS = imported.vessels || VESSELS;
      QUOTES = imported.quotes || QUOTES;
      POA_LIST = imported.poaList || POA_LIST;
      HOLIDAYS = imported.holidays || HOLIDAYS;
      EXCHANGE_RATES = imported.exchangeRates || EXCHANGE_RATES;
      DATA.faqProcedureMigrated = true;
      DATA.templateGroupsMigrated = true;
      DATA.ntfSeedsMigratedV2 = true;
      DATA.workManualImportedV1 = true;
      DATA.workManualImportedV3 = true;
      DATA.workManualImportedV4 = true;
      DATA.faqPhoneTopicV1 = true;
      saveData();
      renderAdminList();
      refreshCurrentTab();
      renderNoticeBanner();
      renderFeedbackBadge();
      alert("가져오기 완료 💖");
    } catch (err) {
      alert("파일을 읽을 수 없습니다. 올바른 백업 JSON 파일인지 확인해주세요.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

/* =========================================================================
   📄 PDF(CA) → HTML 변환
   ========================================================================= */

if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
}

async function handlePdfSelected(event) {
  const file = event.target.files[0];
  const statusEl = document.getElementById("pdfConvertStatus");
  const previewEl = document.getElementById("pdfConvertPreview");
  const saveBtn = document.getElementById("pdfSaveHtmlBtn");
  const toolbarEl = document.getElementById("pdfConvertToolbar");
  const toolbarHintEl = document.getElementById("pdfConvertToolbarHint");
  const tableBuilderEl = document.getElementById("pdfConvertTableBuilder");
  if (!file) return;

  pdfConvertedFileBaseName = file.name.replace(/\.pdf$/i, "") || "CA_문서";

  if (typeof pdfjsLib === "undefined") {
    statusEl.textContent = "⚠️ PDF 변환 라이브러리를 불러오지 못했어요. 인터넷 연결이 안 되어 있거나, 회사 네트워크에서 외부 라이브러리(cdnjs)가 막혀있을 수 있어요.";
    return;
  }

  statusEl.textContent = "변환 중이에요... (페이지 수에 따라 몇 초 걸릴 수 있어요)";
  previewEl.style.display = "none";
  saveBtn.style.display = "none";
  toolbarEl.style.display = "none";
  toolbarHintEl.style.display = "none";
  tableBuilderEl.style.display = "none";

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageHtmlList = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const lines = groupPdfTextItemsIntoLines(textContent.items);
      pageHtmlList.push(lines.map((l) => escapeHtml(l)).join("<br>"));
    }

    const combined = pageHtmlList.join('<br><br><div style="color:#999;font-size:11px;">— 다음 페이지 —</div><br>');
    const dateLine = '<div class="pdf-conv-date">' + formatDateWithSup() + "</div>";

    if (combined.trim()) {
      previewEl.innerHTML = dateLine + "<br>" + combined;
      statusEl.textContent = "✅ " + pdf.numPages + "페이지 변환 완료 — 위 날짜는 오늘 날짜로 자동 채워졌어요. 아래 내용을 클릭해서 바로 수정할 수 있어요.";
    } else {
      previewEl.innerHTML = dateLine;
      statusEl.textContent = "⚠️ 본문 텍스트를 추출하지 못했어요. 스캔본(이미지) PDF는 이 방식으로 변환이 안 돼요.";
    }
    previewEl.style.fontFamily = "'Aptos', Calibri, 'Malgun Gothic', sans-serif";
    previewEl.style.fontSize = "12pt";
    previewEl.style.display = "block";
    saveBtn.style.display = "block";
    toolbarEl.style.display = "flex";
    toolbarHintEl.style.display = "block";
    tableBuilderEl.style.display = "block";

    attachPdfPreviewSelectionTracking();
    renderPdfTableBuilder();
  } catch (err) {
    statusEl.textContent = "⚠️ 변환에 실패했어요. 파일이 손상되었거나 지원하지 않는 PDF 형식일 수 있어요.";
  }
}

/* 오늘 날짜를 "23rd July 2026" 형태로, 서수(rd/nd/th/st)는 위첨자(<sup>)로 표시 */
function formatDateWithSup() {
  const d = new Date();
  const day = d.getDate();
  let suffix = "th";
  if (day === 1 || day === 21 || day === 31) suffix = "st";
  else if (day === 2 || day === 22) suffix = "nd";
  else if (day === 3 || day === 23) suffix = "rd";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return day + "<sup>" + suffix + "</sup> " + months[d.getMonth()] + " " + d.getFullYear();
}

/* 본문(contentEditable) 안에서 굵게/밑줄/정렬 적용 */
function applyPdfFormat(command) {
  const previewEl = document.getElementById("pdfConvertPreview");
  if (!previewEl) return;
  previewEl.focus();
  document.execCommand(command, false, null);
}

/* ---- 📊 PDF 변환용 표 만들기 도구 ---- */
let PDF_TABLE_COLUMNS = ["Port", "ETA"];
let PDF_TABLE_ROWS = [["", ""]];
let pdfPreviewLastRange = null;
let pdfConvertedFileBaseName = "CA_문서";

function attachPdfPreviewSelectionTracking() {
  const el = document.getElementById("pdfConvertPreview");
  if (!el || el.dataset.trackingAttached) return;
  el.dataset.trackingAttached = "1";
  const save = () => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      pdfPreviewLastRange = sel.getRangeAt(0).cloneRange();
    }
  };
  el.addEventListener("keyup", save);
  el.addEventListener("mouseup", save);
  el.addEventListener("blur", save);
}

function renderPdfTableBuilder() {
  renderPdfTableColEditor(document.getElementById("pdfTableColWrap"));
  renderPdfTableRowsEditor(document.getElementById("pdfTableRowsWrap"));
}

function renderPdfTableColEditor(wrap) {
  wrap.innerHTML = "";
  PDF_TABLE_COLUMNS.forEach((col, idx) => {
    const row = document.createElement("div");
    row.className = "field-row-top";
    row.style.marginTop = "6px";
    const input = document.createElement("input");
    input.value = col;
    input.placeholder = "열 이름 (예: Port)";
    input.oninput = (e) => {
      PDF_TABLE_COLUMNS[idx] = e.target.value;
      renderPdfTableRowsEditor(document.getElementById("pdfTableRowsWrap"));
    };
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-row";
    removeBtn.textContent = "삭제";
    removeBtn.onclick = () => {
      PDF_TABLE_COLUMNS.splice(idx, 1);
      PDF_TABLE_ROWS.forEach((r) => r.splice(idx, 1));
      renderPdfTableBuilder();
    };
    row.appendChild(input);
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

function addPdfTableColumn() {
  PDF_TABLE_COLUMNS.push("새 열");
  PDF_TABLE_ROWS.forEach((r) => r.push(""));
  renderPdfTableBuilder();
}

function renderPdfTableRowsEditor(wrap) {
  wrap.innerHTML = "";
  if (PDF_TABLE_COLUMNS.length === 0) return;
  const tableEl = document.createElement("table");
  tableEl.className = "table-editor";
  const headerRow = document.createElement("tr");
  PDF_TABLE_COLUMNS.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c || "(이름 없음)";
    headerRow.appendChild(th);
  });
  headerRow.appendChild(document.createElement("th"));
  tableEl.appendChild(headerRow);

  PDF_TABLE_ROWS.forEach((row, rIdx) => {
    const tr = document.createElement("tr");
    PDF_TABLE_COLUMNS.forEach((c, cIdx) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.value = row[cIdx] || "";
      input.oninput = (e) => { PDF_TABLE_ROWS[rIdx][cIdx] = e.target.value; };
      td.appendChild(input);
      tr.appendChild(td);
    });
    const delTd = document.createElement("td");
    delTd.className = "del-cell";
    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.onclick = () => { PDF_TABLE_ROWS.splice(rIdx, 1); renderPdfTableRowsEditor(wrap); };
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);
    tableEl.appendChild(tr);
  });
  const pdfScrollWrap = document.createElement("div");
  pdfScrollWrap.className = "table-editor-scroll";
  pdfScrollWrap.appendChild(tableEl);
  wrap.appendChild(pdfScrollWrap);
}

function addPdfTableRow() {
  PDF_TABLE_ROWS.push(PDF_TABLE_COLUMNS.map(() => ""));
  renderPdfTableRowsEditor(document.getElementById("pdfTableRowsWrap"));
}

function buildPdfTableHtml() {
  if (PDF_TABLE_COLUMNS.length === 0) return "";
  const rows = PDF_TABLE_ROWS.filter((r) => r.some((c) => c && c.trim() !== ""));
  if (rows.length === 0) return "";
  let html = '<table class="pdf-conv-table">';
  html += "<tr>" + PDF_TABLE_COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join("") + "</tr>";
  rows.forEach((r) => {
    html += "<tr>" + PDF_TABLE_COLUMNS.map((c, i) => `<td>${escapeHtml(r[i] || "")}</td>`).join("") + "</tr>";
  });
  html += "</table>";
  return html;
}

function insertPdfTable() {
  const previewEl = document.getElementById("pdfConvertPreview");
  if (!previewEl || previewEl.style.display === "none") { alert("먼저 PDF를 변환해주세요."); return; }
  const tableHtml = buildPdfTableHtml();
  if (!tableHtml) { alert("표에 채워진 값이 없어요. 최소 한 행은 입력해주세요."); return; }

  previewEl.focus();
  const sel = window.getSelection();
  if (pdfPreviewLastRange && previewEl.contains(pdfPreviewLastRange.startContainer)) {
    sel.removeAllRanges();
    sel.addRange(pdfPreviewLastRange);
  } else {
    const range = document.createRange();
    range.selectNodeContents(previewEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.execCommand("insertHTML", false, "<br>" + tableHtml + "<br>");
  pdfPreviewLastRange = null;
}

/* PDF 텍스트 조각들을 y좌표 기준으로 줄 단위로 묶고, 각 줄은 x좌표 순으로 정렬한다.
   "23rd", "22nd" 처럼 위첨자(작은 글씨, 살짝 위로 올라간 위치)로 렌더링된 서수 표기가
   본문과 다른 줄로 쪼개지지 않도록, 줄 병합 기준을 글자 높이에 비례해 넉넉하게 잡는다. */
function groupPdfTextItemsIntoLines(items) {
  if (!items || items.length === 0) return [];
  const sorted = items.slice().sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const lines = [];
  let currentLine = [];
  let currentY = null;
  let currentMaxHeight = 0;

  sorted.forEach((item) => {
    const y = item.transform[5];
    const h = item.height || Math.abs(item.transform[3]) || 10;
    const threshold = Math.max(5, currentMaxHeight * 0.75, h * 0.75);
    if (currentY === null || Math.abs(y - currentY) <= threshold) {
      currentLine.push(item);
      if (currentY === null) currentY = y;
      currentMaxHeight = Math.max(currentMaxHeight, h);
    } else {
      lines.push(currentLine);
      currentLine = [item];
      currentY = y;
      currentMaxHeight = h;
    }
  });
  if (currentLine.length > 0) lines.push(currentLine);

  return lines
    .map((lineItems) => {
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
      return joinPdfLineItems(lineItems);
    })
    .filter((l) => l.length > 0);
}

/* 같은 줄 안의 텍스트 조각들을 이어붙일 때, 실제로 글자 사이가 벌어진 경우에만 공백을 넣는다.
   (PDF에 따라 숫자 한 글자씩("2","3")이 별도 조각으로 저장된 경우 "2 3"처럼 붙는 걸 방지) */
function joinPdfLineItems(lineItems) {
  let result = "";
  let prevEndX = null;
  let prevAvgCharWidth = 4;
  lineItems.forEach((item) => {
    const str = item.str || "";
    const startX = item.transform[4];
    if (prevEndX !== null && str) {
      const gap = startX - prevEndX;
      if (gap > prevAvgCharWidth * 0.35 && result && !/\s$/.test(result) && !/^\s/.test(str)) {
        result += " ";
      }
    }
    result += str;
    const w = item.width || str.length * 4;
    prevEndX = startX + w;
    if (str.length > 0) prevAvgCharWidth = w / str.length;
  });
  return result.replace(/[ \t]+/g, " ").trim();
}

function savePdfConvertedHtml() {
  const previewEl = document.getElementById("pdfConvertPreview");
  const html = previewEl ? normalizeSmartChars(previewEl.innerHTML) : "";
  if (!html.trim()) { alert("저장할 내용이 없어요. 먼저 PDF를 변환해주세요."); return; }

  const styles = "<style>@page{size:A4;margin:20mm 25mm;}"
    + "html,body{margin:0;}"
    + "body{font-family:'Aptos',Calibri,'Malgun Gothic',sans-serif;font-size:12pt;line-height:1.8;color:#1f3864;"
    + "width:210mm;min-height:297mm;margin:0 auto;padding:20mm 25mm;box-sizing:border-box;}"
    + "strong,b{font-weight:700;}"
    + ".pdf-conv-date{text-align:right;margin-bottom:10px;color:#1f3864;}"
    + ".pdf-conv-table{font-family:'Aptos',Calibri,'Malgun Gothic',sans-serif;border-collapse:collapse;margin:14px auto;font-size:12pt;}"
    + ".pdf-conv-table th{background:#003d6b;color:#fff;padding:6px 16px;text-align:center;font-weight:600;}"
    + ".pdf-conv-table td{padding:6px 16px;border:1px solid #ccc;text-align:center;color:#1f3864;}"
    + "</style>";
  const title = pdfConvertedFileBaseName || "CA_문서";
  const htm = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">" + darkModeSafeMeta()
    + "<title>" + escapeHtml(title) + "</title>" + styles + darkModeSafeCss("#ffffff", "#1f3864") + "</head><body>" + html + "</body></html>";
  const blob = new Blob([htm], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = title.replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, "_") + ".htm";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* =========================================================================
   📦 엑셀 정리 (LT LIST 자동 변환)
   ========================================================================= */

let excelMode = "lt";

// LT LIST 규칙에서 제외할 컬럼 (원본 정제 파일과 대조해서 확정한 목록)
const LT_LIST_DROP_HEADERS = ["Special Flags", "Liner Term", "B/L Type"];
const LT_MAIL_SUBJECT_PREFIX = "[L/T 요청] 화성익스프레스 - "; // 메일 제목에만 붙는 고정 접두어 (엑셀 제목/파일명에는 안 붙음)

// 양하리스트 규칙에서 제외할 컬럼 (정제 파일과 대조해서 확정한 목록)
const UNLOADING_DROP_HEADERS = ["VGM (kgs)", "Mvmt", "Partner", "Notify", "No. of Pkgs", "Tare", "Special Flags", "Liner Term", "B/L Type"];
const UNLOADING_PORTS = {
  unloading_busan: { group: "KRPUS", label: "부산" },
  unloading_incheon: { group: "KRICN", label: "인천" },
  unloading_gwangyang: { group: "KRKWA", label: "광양" }
};
function isUnloadingMode(mode) { return Object.prototype.hasOwnProperty.call(UNLOADING_PORTS, mode); }
const UNLOADING_ZIM_NOTIFY_PREFIXES = ["ZIM KOREA", "ZIM PUSAN"]; // Empty + 이 접두어로 시작하는 Notify는 삭제해도 되는지 물어봄

function normalizeHeaderText(h) {
  return String(h || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function findColIdxIn(headers, name) {
  return headers.findIndex((h) => normalizeHeaderText(h) === name);
}

function freshExcelToolState() {
  return {
    fileName: null,
    titleAuto: "",   // 원본에서 자동 추출한 제목
    titleFinal: "",  // 사용자가 확정한 제목 (수정 가능)
    headers: [],     // 최종 남길 컬럼 헤더
    rows: [],        // 최종 확정된 데이터 행들 (배열의 배열)

    // --- LT LIST 전용 ---
    emptyCandidates: [], // 엠티 컨테이너인데 Delivery Port가 있는 후보 행들 (아직 포함 여부 미정)
    emptyDecided: true,
    emptyIncluded: false,
    removedBlankCount: 0, // Container 번호가 비어있어서 자동 제외한 행 수

    // --- 양하리스트 전용 (단계별 확인) ---
    ulStep: "blank",      // 'blank' -> 'emptyZim' -> 'done' 순서로 하나씩 확인
    ulBlankCandidates: [], // KRPUS 그룹인데 Container가 공란인 행들
    ulBlankDecided: false,
    ulBlankRemove: null,
    ulEmptyZimCandidates: [], // Empty + Notify가 ZIM KOREA/ZIM PUSAN으로 시작하는 행들
    ulEmptyZimDecided: false,
    ulEmptyZimRemove: null,
    ulRemovedGroups: [],  // KRPUS가 아니라서 통째로 제외한 그룹들 (구간/건수)
    ulHzAlerts: [],        // 위험물(DG) 관련 알림
    ulOogAlerts: [],        // OOG(오버사이즈) 알림 - 인천 전용
    ulHvAlerts: [],         // HIGH VALUE CARGO 확인 필요 건
    ulTkSocAlerts: [],      // TK 타입 + 50kg 이하 - SOC 엠티 신고 확인 필요 건
    ulPending: null,        // 파싱 중간 결과 보관용

    // --- 공통 메일 정보 ---
    mailTo: LT_MAIL_SETTINGS.to || "",
    mailCc: LT_MAIL_SETTINGS.cc || "",
    mailBody: null
  };
}

let excelToolState = freshExcelToolState();

/* =========================================================================
   🔎 선적 대조 - 선사 양하목록(바이플랜)에서, 우리가 만든 양하리스트가 향하는
   POD(양하항)에 해당하는 우리 화물(ZIM/GSL)만 뽑아서, 우리 리스트의 컨테이너가
   전부 그 안에 들어있는지(=실제로 실려있는지) 대조
   ========================================================================= */

const CROSS_CHECK_CARRIER_LABELS = {
  msc: "MSC",
  zim: "ZIM",
  interasia: "인터아시아",
  namsung: "남성해운"
};

function freshCrossCheckState() {
  return {
    carrier: "msc", // 'msc' | 'zim' | 'interasia' | 'namsung'
    manifestFileName: null, manifestSheets: null, manifestKrpusSet: null,
    oursFileName: null, oursContainers: null, oursPod: null
  };
}
let crossCheckState = freshCrossCheckState();

function buildCrossCheckMscHtml() {
  const carrierLabel = CROSS_CHECK_CARRIER_LABELS[crossCheckState.carrier];
  let html = `<div class="hint" style="margin-bottom:14px;">선사 양하목록(바이플랜)에서, 우리가 만든 양하리스트가 향하는 POD(양하항)에 해당하는 컨테이너만 뽑아서, 우리 리스트의 컨테이너가 다 그 안에 들어있는지(=실제로 실려있는지) 확인해요.</div>`;

  html += `<div class="calc-sub-tabs" style="margin-bottom:14px;">
    ${Object.keys(CROSS_CHECK_CARRIER_LABELS).map((c) => `<button class="calc-sub-tab-btn${crossCheckState.carrier === c ? " active" : ""}" onclick="switchCrossCheckCarrier('${c}')">${CROSS_CHECK_CARRIER_LABELS[c]}</button>`).join("")}
  </div>`;

  html += `<div style="display:flex; gap:14px; flex-wrap:wrap;">`;

  html += `<div style="flex:1; min-width:240px;">
    <div style="font-size:13px;font-weight:bold;color:#4b5563;margin-bottom:6px;">① ${carrierLabel} 양하목록 (바이플랜)</div>
    <label class="excel-upload-box" id="crossManifestUploadBox" style="padding:22px 14px;">
      <input type="file" id="crossManifestInput" accept=".xlsx,.xls" onchange="handleCrossManifestFile(event)">
      <div class="excel-upload-icon">📄</div>
      <div class="excel-upload-label">${carrierLabel} 파일 올리기</div>
      <div class="excel-upload-sub">POD·Container 컬럼이 있는 원본</div>
    </label>
    ${crossCheckState.manifestFileName ? `<div class="excel-file-chip">📎 ${escapeHtml(crossCheckState.manifestFileName)} <button onclick="clearCrossManifest()">✕</button></div>` : ""}
  </div>`;

  html += `<div style="flex:1; min-width:240px;">
    <div style="font-size:13px;font-weight:bold;color:#4b5563;margin-bottom:6px;">② 우리가 만든 양하리스트</div>
    <label class="excel-upload-box" id="crossOursUploadBox" style="padding:22px 14px;">
      <input type="file" id="crossOursInput" accept=".xlsx,.xls" onchange="handleCrossOursFile(event)">
      <div class="excel-upload-icon">📄</div>
      <div class="excel-upload-label">양하리스트 파일 올리기</div>
      <div class="excel-upload-sub">엑셀 정리 탭에서 만든 결과 파일</div>
    </label>
    ${crossCheckState.oursFileName ? `<div class="excel-file-chip">📎 ${escapeHtml(crossCheckState.oursFileName)} <button onclick="clearCrossOurs()">✕</button></div>` : ""}
    ${crossCheckState.oursContainers ? `<div class="hint" style="margin-top:8px;">컨테이너 <b>${crossCheckState.oursContainers.length}건</b>, POD <b>${escapeHtml(crossCheckState.oursPod || "확인 안 됨")}</b></div>` : ""}
  </div>`;

  html += `</div>`;

  if (crossCheckState.manifestSheets && crossCheckState.oursContainers && !crossCheckState.oursPod) {
    html += `<div class="excel-question-box" style="margin-top:16px;">⚠️ 양하리스트 파일에서 POD(양하항)를 못 찾았어요. "Disch Port/Depot To" 컬럼이 있는 파일이 맞는지 확인해주세요.</div>`;
  } else if (crossCheckState.manifestKrpusSet && crossCheckState.oursContainers) {
    const missing = crossCheckState.oursContainers.filter((c) => !crossCheckState.manifestKrpusSet.has(c));

    if (missing.length === 0) {
      html += `<div class="excel-question-box" style="margin-top:16px;">✅ 우리 양하리스트 컨테이너 <b>${crossCheckState.oursContainers.length}건 전부</b> ${carrierLabel} 양하목록(POD:${escapeHtml(podAliasDisplay(crossCheckState.oursPod))})에서 확인됐어요.</div>`;
    } else {
      html += `<div class="excel-warning-box" style="margin-top:16px;">
        <div class="excel-warning-title">⚠️ 우리 리스트엔 있는데 선사 목록엔 없는 컨테이너 ${missing.length}건</div>
        아래 컨테이너들은 우리 양하리스트엔 있는데, ${carrierLabel} 양하목록(POD:${escapeHtml(podAliasDisplay(crossCheckState.oursPod))})에서 이 POD로 확인이 안 돼요. 실제로 안 실렸거나 리스트 오류일 수 있으니 꼭 확인해주세요:
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table"><thead><tr><th>Container</th></tr></thead>
          <tbody>${missing.map((c) => `<tr><td>${escapeHtml(c)}</td></tr>`).join("")}</tbody></table>
        </div>
      </div>`;
    }
  }

  return html;
}

function switchCrossCheckCarrier(carrier) {
  crossCheckState = freshCrossCheckState();
  crossCheckState.carrier = carrier;
  renderExcelTool();
}

function handleCrossManifestFile(event) {
  const file = event.target.files[0];
  if (file) processCrossManifestFile(file);
}

function processCrossManifestFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheets = {};
      wb.SheetNames.forEach((name) => {
        sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
      });
      crossCheckState.manifestFileName = file.name;
      crossCheckState.manifestSheets = sheets;
      recomputeCrossCheck();
    } catch (err) {
      alert("양하목록 파일을 읽는 중 문제가 생겼어요. 파일 형식을 확인해주세요.\n(" + err.message + ")");
    }
  };
  reader.readAsArrayBuffer(file);
}

function handleCrossOursFile(event) {
  const file = event.target.files[0];
  if (file) processCrossOursFile(file);
}

function processCrossOursFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      parseOursDischList(aoa, file.name);
    } catch (err) {
      alert("양하리스트 파일을 읽는 중 문제가 생겼어요. 파일 형식을 확인해주세요.\n(" + err.message + ")");
    }
  };
  reader.readAsArrayBuffer(file);
}

/* 우리 쪽에서 만든 양하리스트(정리된 결과 파일) 형식: "Container" 헤더가 있는 행을 찾아서 그 열의 값을 다 모으고,
   "Disch Port/Depot To" 컬럼(예: "KRPUS/TPN")에서 앞부분(POD)을 뽑아낸다 */
function parseOursDischList(aoa, fileName) {
  let headerRowIdx = -1;
  let containerIdx = -1;
  let dischIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i] || [];
    const idx = row.findIndex((h) => typeof h === "string" && h.trim() === "Container");
    if (idx !== -1) {
      headerRowIdx = i;
      containerIdx = idx;
      dischIdx = row.findIndex((h) => typeof h === "string" && /disch/i.test(h) && /port/i.test(h));
      break;
    }
  }
  if (headerRowIdx === -1) { alert("Container 컬럼을 찾지 못했어요. 양하리스트 결과 파일이 맞는지 확인해주세요."); return; }

  const containers = [];
  let pod = null;
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const v = row[containerIdx];
    if (v) containers.push(String(v).replace(/\s+/g, "").toUpperCase());
    if (!pod && dischIdx >= 0 && typeof row[dischIdx] === "string" && row[dischIdx].trim()) {
      pod = row[dischIdx].split("/")[0].trim().toUpperCase();
    }
  }

  crossCheckState.oursFileName = fileName;
  crossCheckState.oursContainers = containers;
  crossCheckState.oursPod = pod;
  recomputeCrossCheck();
}

// 같은 항구인데 우리 쪽 표기와 선사 양하목록 표기가 다른 경우 (예: 인천 = KRICN(우리) / KRINC(ZIM·남성해운))
const POD_CODE_ALIASES = {
  KRICN: ["KRICN", "KRINC"],
  KRPUS: ["KRPUS"],
  KRKWA: ["KRKWA"]
};
function podCodesMatch(oursPod, manifestPod) {
  if (!oursPod || !manifestPod) return false;
  const aliases = POD_CODE_ALIASES[oursPod] || [oursPod];
  return aliases.includes(manifestPod);
}

function podAliasDisplay(pod) {
  const aliases = POD_CODE_ALIASES[pod] || [pod];
  return aliases.length > 1 ? aliases.join("/") : pod;
}

/* 시트 하나(aoa)에서 헤더 행/POD/Container/오퍼레이터 컬럼 위치를 찾아, POD가 맞고 오퍼레이터가
   허용 목록에 있는 컨테이너 번호를 결과 Set에 채워 넣는다. (여러 선사 형식이 공통으로 재사용) */
function scanManifestAoaInto(set, aoa, targetPod, opts) {
  if (!aoa) return;
  const { headerTest, podHeader, cntrHeader, opHeader, allowedOps, podHeaderIsFirstMatch } = opts;
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    if (headerTest(aoa[i] || [])) { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) return;
  const headers = aoa[headerRowIdx];
  const cntrIdx = headers.findIndex((h) => h === cntrHeader);
  let podIdx, opIdx;
  if (opts.podRelativeToOp) {
    // 남성해운 형식: 앞쪽에 POD라는 이름의 다른 컬럼이 섞여있을 수 있어서, "Opr" 컬럼 바로 앞칸을 POD로 확정
    opIdx = headers.findIndex((h) => h === opHeader);
    podIdx = opIdx - 1;
  } else {
    podIdx = podHeaderIsFirstMatch ? headers.findIndex((h) => h === podHeader) : headers.lastIndexOf(podHeader);
    opIdx = opHeader ? headers.findIndex((h) => h === opHeader) : -1;
  }
  if (podIdx < 0 || cntrIdx === -1) return;

  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const podOk = podCodesMatch(targetPod, row[podIdx]);
    const opVal = opIdx >= 0 ? String(row[opIdx] || "").trim().toUpperCase() : null;
    const opOk = opIdx === -1 || !allowedOps ? true : allowedOps.includes(opVal);
    if (podOk && opOk && row[cntrIdx]) {
      set.add(String(row[cntrIdx]).replace(/\s+/g, "").toUpperCase());
    }
  }
}

/* 파일 두 개(양하목록/우리 양하리스트)가 다 준비되면, 우리 리스트의 POD를 기준으로
   양하목록에서 우리 화물(ZIM/GSL)만 뽑아 대조 세트를 다시 계산한다.
   선사마다 시트 구성·헤더 위치가 달라서 선사별로 따로 처리:
   - MSC: 시트 1개, "POD" 헤더 행 기준, 컨테이너 "Cntr No.", 오퍼레이터 "OPR"이 ZIM인 것만
   - ZIM: 시트 1개, "POD"·"Container"가 같이 있는 헤더 행, 오퍼레이터 "Line"이 GSL/ZIM인 것만
   - 인터아시아: "ZIM"·"GSL" 시트 두 개를 각각 읽어서 합침 (시트 자체가 선사별로 나뉘어 있음)
   - 남성해운(STARSHIP): "CNTR LIST" 시트가 있으면 그걸, 없으면 유일한 시트를 사용.
     POD 헤더 이름이 겹쳐서 애매하니 "Opr" 바로 앞 칸을 POD로 확정, 오퍼레이터 GSL/ZIM만 */
function recomputeCrossCheck() {
  if (crossCheckState.manifestSheets && crossCheckState.oursPod) {
    const sheets = crossCheckState.manifestSheets;
    const carrier = crossCheckState.carrier;
    const set = new Set();

    if (carrier === "msc") {
      const aoa = sheets[Object.keys(sheets)[0]];
      scanManifestAoaInto(set, aoa, crossCheckState.oursPod, {
        headerTest: (row) => row[0] === "POD",
        podHeader: "POD", cntrHeader: "Cntr No.", opHeader: "OPR", allowedOps: ["ZIM"], podHeaderIsFirstMatch: true
      });
    } else if (carrier === "zim") {
      const aoa = sheets[Object.keys(sheets)[0]];
      scanManifestAoaInto(set, aoa, crossCheckState.oursPod, {
        headerTest: (row) => row.includes("POD") && row.includes("Container"),
        podHeader: "POD", cntrHeader: "Container", opHeader: "Line", allowedOps: ["GSL", "ZIM"], podHeaderIsFirstMatch: true
      });
    } else if (carrier === "interasia") {
      ["ZIM", "GSL"].forEach((sheetName) => {
        scanManifestAoaInto(set, sheets[sheetName], crossCheckState.oursPod, {
          headerTest: (row) => row.includes("POD") && row.includes("Container No"),
          podHeader: "POD", cntrHeader: "Container No", opHeader: "Carrier", allowedOps: ["ZIM", "GSL"], podHeaderIsFirstMatch: true
        });
      });
    } else if (carrier === "namsung") {
      // "CNTR LIST", "LIST" 등 시트명이 파일마다 조금씩 달라서, SUMMARY가 아니면서 이름에 "LIST"가 들어간 시트를 찾음
      const listSheetName = Object.keys(sheets).find((n) => /list/i.test(n) && !/summary/i.test(n));
      const sheetName = listSheetName || sheets["CNTR LIST"] && "CNTR LIST" || Object.keys(sheets)[0];
      scanManifestAoaInto(set, sheets[sheetName], crossCheckState.oursPod, {
        headerTest: (row) => row.includes("Opr") && row.includes("Container No"),
        cntrHeader: "Container No", opHeader: "Opr", allowedOps: ["ZIM", "GSL"], podRelativeToOp: true
      });
    }

    if (set.size === 0) {
      crossCheckState.manifestKrpusSet = set; // 0건이어도 결과는 보여줌 (전부 미확인으로 안내됨)
    } else {
      crossCheckState.manifestKrpusSet = set;
    }
  }
  renderExcelTool();
}

function clearCrossManifest() {
  crossCheckState.manifestFileName = null;
  crossCheckState.manifestSheets = null;
  crossCheckState.manifestKrpusSet = null;
  renderExcelTool();
}

function clearCrossOurs() {
  crossCheckState.oursFileName = null;
  crossCheckState.oursContainers = null;
  crossCheckState.oursPod = null;
  crossCheckState.manifestKrpusSet = null;
  renderExcelTool();
}

function switchExcelMode(mode) {
  excelMode = mode;
  document.querySelectorAll("#excelModeTabs .calc-sub-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  excelToolState = freshExcelToolState();
  crossCheckState = freshCrossCheckState();
  if (typeof resetBlListState === "function") resetBlListState(); // bl_list_tool.js
  if (typeof resetAnEmailState === "function") resetAnEmailState(); // an_email_tool.js
  renderExcelTool();
}

function renderExcelTool() {
  const body = document.getElementById("excelToolBody");
  if (!body) return;

  if (excelMode === "crosscheck_msc") {
    body.innerHTML = buildCrossCheckMscHtml();
    ["crossManifestUploadBox", "crossOursUploadBox"].forEach((id, idx) => {
      const box = document.getElementById(id);
      if (!box) return;
      const handler = idx === 0 ? processCrossManifestFile : processCrossOursFile;
      box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("dragover"); });
      box.addEventListener("dragleave", () => box.classList.remove("dragover"));
      box.addEventListener("drop", (e) => {
        e.preventDefault();
        box.classList.remove("dragover");
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]);
      });
    });
    return;
  }

  if (excelMode === "bl_list") {
    // bl_list_tool.js (용량 문제로 분리된 파일)에 렌더링을 위임
    body.innerHTML = buildBlListHtml();
    attachBlListHandlers();
    return;
  }

  if (excelMode === "an_email") {
    // an_email_tool.js (새 파일)에 렌더링을 위임
    body.innerHTML = buildAnEmailHtml();
    attachAnEmailHandlers();
    return;
  }

  let html = "";

  html += `
    <label class="excel-upload-box" id="excelUploadBox">
      <input type="file" id="excelFileInput" accept=".xlsx,.xls" onchange="handleExcelFileSelected(event)">
      <div class="excel-upload-icon">📄</div>
      <div class="excel-upload-label">원본 엑셀 파일을 여기에 올려주세요</div>
      <div class="excel-upload-sub">Container Report (.xlsx) — 클릭하거나 파일을 끌어다 놓으세요</div>
    </label>`;

  if (excelToolState.fileName) {
    html += `<div class="excel-file-chip">📎 ${escapeHtml(excelToolState.fileName)} <button onclick="clearExcelFile()">✕</button></div>`;
  }

  if (isUnloadingMode(excelMode)) {
    html += buildUnloadingStatusHtml();
  } else if (excelToolState.fileName) {
    html += `
      <div class="excel-warning-box">
        <div class="excel-warning-title">📦 이삿짐(개인 이사화물) 확인!</div>
        이삿짐 컨테이너가 있는지 별도로 확인해주세요. 이삿짐 건은 <b>LT 협동통운</b>에 보내야 해요.
      </div>`;

    // 엠티+딜리버리포트 확인 알림
    if (excelToolState.emptyCandidates.length && !excelToolState.emptyDecided) {
      html += `
        <div class="excel-warning-box">
          <div class="excel-warning-title">🤔 확인해주세요</div>
          엠티(Empty) 컨테이너인데 Delivery Port가 채워진 건이 <b>${excelToolState.emptyCandidates.length}건</b> 있어요.
          <div class="excel-result-table-wrap" style="margin-top:10px;">
            <table class="excel-result-table">
              <thead><tr><th>Container</th><th>Delivery Port</th><th>B/L No.</th></tr></thead>
              <tbody>
                ${excelToolState.emptyCandidates.map((r) => `<tr><td>${escapeHtml(r.container || "(공란)")}</td><td>${escapeHtml(r.deliveryPort)}</td><td>${escapeHtml(r.bl || "")}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
          이 건들도 LT LIST에 포함할까요?
          <div class="excel-warning-actions">
            <button class="btn generate-btn" onclick="decideEmptyInclusion(true)">✅ 포함할게요</button>
            <button class="btn secondary-btn" onclick="decideEmptyInclusion(false)">제외할게요</button>
          </div>
        </div>`;
    }

    if (excelToolState.removedBlankCount) {
      html += `
        <div class="excel-question-box">
          ℹ️ Container 번호가 비어있는 행 <b>${excelToolState.removedBlankCount}건</b>은 LT LIST에서 자동으로 제외했어요 (같은 B/L의 초과 패키지 분 등으로 보여요).
        </div>`;
    }
  }

  if (excelToolState.headers.length) {
    html += buildExcelResultsHtml();
  }

  body.innerHTML = html;

  const box = document.getElementById("excelUploadBox");
  if (box) {
    box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("dragover"); });
    box.addEventListener("dragleave", () => box.classList.remove("dragover"));
    box.addEventListener("drop", (e) => {
      e.preventDefault();
      box.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) processExcelFile(e.dataTransfer.files[0]);
    });
  }
}

/* 양하리스트 모드의 단계별 확인/알림 배너들을 만든다 (공란 컨테이너 확인 -> Empty+ZIM Notify 확인 -> 완료 후 안내) */
function buildUnloadingStatusHtml() {
  if (!excelToolState.fileName) return "";
  let html = "";
  const targetGroupLabel = (UNLOADING_PORTS[excelMode] || UNLOADING_PORTS.unloading_busan).group;

  // 1단계: 대상 그룹 안 Container 공란 행 확인
  if (excelToolState.ulBlankCandidates.length && !excelToolState.ulBlankDecided) {
    html += `
      <div class="excel-warning-box">
        <div class="excel-warning-title">🤔 확인해주세요 (1/2)</div>
        ${targetGroupLabel} 대상인데 Container 번호가 공란인 행이 <b>${excelToolState.ulBlankCandidates.length}건</b> 있어요 (같은 B/L의 초과 패키지 분 등으로 보여요).
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table">
            <thead><tr><th>구분</th><th>B/L No.</th><th>RF-C/ IMO. UN No/ OOG H-M</th></tr></thead>
            <tbody>
              ${excelToolState.ulBlankCandidates.map((r) => `<tr><td>${r.section === "empty" ? "Empty" : "Full"}</td><td>${escapeHtml(r.bl || "")}</td><td>${escapeHtml(r.rf || "-")}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        이 행들 지워도 될까요?
        <div class="excel-warning-actions">
          <button class="btn generate-btn" onclick="decideUlBlank(true)">🗑️ 삭제할게요</button>
          <button class="btn secondary-btn" onclick="decideUlBlank(false)">남겨둘게요</button>
        </div>
      </div>`;
    return html;
  }

  // 2단계: Empty + Notify가 ZIM KOREA/ZIM PUSAN 확인
  if (excelToolState.ulEmptyZimCandidates.length && !excelToolState.ulEmptyZimDecided) {
    const sample = excelToolState.ulEmptyZimCandidates.slice(0, 8);
    html += `
      <div class="excel-warning-box">
        <div class="excel-warning-title">🤔 확인해주세요 (2/2)</div>
        Empty 컨테이너 중 Notify가 <b>ZIM KOREA / ZIM PUSAN</b>으로 시작하는 건이 <b>${excelToolState.ulEmptyZimCandidates.length}건</b> 있어요.
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table">
            <thead><tr><th>Notify</th><th>B/L No.</th></tr></thead>
            <tbody>
              ${sample.map((r) => `<tr><td>${escapeHtml(r.notify || "")}</td><td>${escapeHtml(r.bl || "")}</td></tr>`).join("")}
            </tbody>
          </table>
          ${excelToolState.ulEmptyZimCandidates.length > sample.length ? `<div class="hint" style="margin:8px 10px;">그 외 ${excelToolState.ulEmptyZimCandidates.length - sample.length}건 더 있어요 (Notify 기준 동일)</div>` : ""}
        </div>
        이 EQ EMPTY 건들 지워도 될까요?
        <div class="excel-warning-actions">
          <button class="btn generate-btn" onclick="decideUlEmptyZim(true)">🗑️ 삭제할게요</button>
          <button class="btn secondary-btn" onclick="decideUlEmptyZim(false)">남겨둘게요</button>
        </div>
      </div>`;
    return html;
  }

  // 완료: 투명성 안내(제외한 그룹) + 위험물(DG)/OOG/HIGH VALUE CARGO 알림
  if (excelToolState.ulRemovedGroups && excelToolState.ulRemovedGroups.length) {
    html += `
      <div class="excel-question-box">
        ℹ️ <b>${targetGroupLabel}가 아닌 그룹은 전부 제외</b>했어요:
        ${excelToolState.ulRemovedGroups.map((g) => `${escapeHtml(g.group)}(${g.section}) ${g.count}건`).join(", ")}
      </div>`;
  }
  if (excelToolState.ulHzAlerts && excelToolState.ulHzAlerts.length) {
    html += excelMode !== "unloading_busan" ? `
      <div class="excel-warning-box">
        <div class="excel-warning-title">🧪 DG(위험물) 있습니다 확인해주세요</div>
        RF-C/IMO에 위험물(Hz) 표시가 있는 건이에요:
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table">
            <thead><tr><th>Container</th><th>위험물 상세</th></tr></thead>
            <tbody>${excelToolState.ulHzAlerts.map((a) => `<tr><td>${escapeHtml(a.container || "")}</td><td>${escapeHtml(a.detail)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>` : `
      <div class="excel-warning-box">
        <div class="excel-warning-title">☢️ 직반출 건이 있습니다</div>
        RF-C/IMO 위험물 등급이 1·2·7로 시작하는 건이에요, 직반출 대상인지 확인해주세요:
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table">
            <thead><tr><th>Container</th><th>위험물 상세</th></tr></thead>
            <tbody>${excelToolState.ulHzAlerts.map((a) => `<tr><td>${escapeHtml(a.container || "")}</td><td>${escapeHtml(a.detail)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>`;
  }
  if (excelToolState.ulOogAlerts && excelToolState.ulOogAlerts.length) {
    html += `
      <div class="excel-warning-box">
        <div class="excel-warning-title">📏 OOG(오버사이즈) 있습니다 확인해주세요</div>
        RF-C/IMO에 Over Width/Height/Length 표시가 있는 건이에요:
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table">
            <thead><tr><th>Container</th><th>OOG 상세</th></tr></thead>
            <tbody>${excelToolState.ulOogAlerts.map((a) => `<tr><td>${escapeHtml(a.container || "")}</td><td>${escapeHtml(a.detail)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>`;
  }
  if (excelToolState.ulHvAlerts && excelToolState.ulHvAlerts.length) {
    html += `
      <div class="excel-warning-box">
        <div class="excel-warning-title">💎 HIGH VALUE CARGO 있습니다 확인해주세요</div>
        원본 HV 컬럼이 'Y'로 표시된 건이에요:
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table">
            <thead><tr><th>Container</th><th>B/L No.</th></tr></thead>
            <tbody>${excelToolState.ulHvAlerts.map((a) => `<tr><td>${escapeHtml(a.container || "")}</td><td>${escapeHtml(a.bl)}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>`;
  }
  if (excelToolState.ulTkSocAlerts && excelToolState.ulTkSocAlerts.length) {
    html += `
      <div class="excel-warning-box">
        <div class="excel-warning-title">🛢️ SOC 엠티 신고인지 확인하세요</div>
        TK(탱크) 타입인데 Net WT가 50kg 이하인 건이에요 (데이터는 원본 그대로 두었어요, 직접 확인해주세요):
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table">
            <thead><tr><th>Container</th><th>Type</th><th>Net WT</th></tr></thead>
            <tbody>${excelToolState.ulTkSocAlerts.map((a) => `<tr><td>${escapeHtml(a.container || "")}</td><td>${escapeHtml(a.type)}</td><td>${escapeHtml(String(a.netWt))}kg</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>`;
  }
  return html;
}

/* 제목/결과표/메일 UI/다운로드 버튼 - LT LIST, 양하리스트 공통으로 재사용 */
function buildExcelResultsHtml() {
  let html = "";
  html += `
    <div class="excel-title-edit">
      <span style="font-size:13px;color:#6b7280;">엑셀 제목 (파일명·1행 제목)</span>
      <input id="excelTitleInput" value="${escapeHtml(excelToolState.titleFinal)}" oninput="excelToolState.titleFinal=this.value">
    </div>
    <div class="excel-question-box" style="margin-top:8px;">✏️ 여기서 제목을 고치면, <b>다운로드되는 엑셀의 1행 제목</b>이랑 <b>파일명</b>이 모두 그대로 바뀐 제목으로 나가요.</div>`;

  html += `<div class="excel-result-summary">
    <div class="excel-result-stat">최종 행 수 <b>${excelToolState.rows.length}</b>건</div>
  </div>`;

  const INTEGER_DISPLAY_HEADERS_PREVIEW = ["Sr #", "Net WT (kgs)", "Gross WT (kgs)", "VGM (kgs)", "No. of Pkgs", "Tare"];
  const integerColsPreview = excelToolState.headers.map((h) => INTEGER_DISPLAY_HEADERS_PREVIEW.includes(normalizeHeaderText(h)));

  html += `<div class="excel-result-table-wrap"><table class="excel-result-table"><thead><tr>${excelToolState.headers.map((h) => `<th>${escapeHtml(String(h).replace(/\n/g, " "))}</th>`).join("")}</tr></thead><tbody>`;
  excelToolState.rows.forEach((r) => {
    html += `<tr>${r.map((v, i) => {
      let disp = v === null || v === undefined ? "" : v;
      if (integerColsPreview[i] && typeof disp === "number") disp = Math.round(disp);
      return `<td>${escapeHtml(String(disp))}</td>`;
    }).join("")}</tr>`;
  });
  html += `</tbody></table></div>`;

  if (excelMode === "lt") {
    html += `<div class="excel-title-edit">
      <span style="font-size:13px;color:#6b7280;">받는사람</span>
      <input id="excelMailTo" type="text" placeholder="이메일 주소 (여러 명은 , 로 구분)" list="excelContactList" value="${escapeHtml(excelToolState.mailTo || "")}" oninput="excelToolState.mailTo=this.value">
    </div>
    <div class="excel-title-edit">
      <span style="font-size:13px;color:#6b7280;">참조 CC</span>
      <input id="excelMailCc" type="text" placeholder="이메일 주소 (여러 명은 , 로 구분, 없으면 비워두세요)" list="excelContactList" value="${escapeHtml(excelToolState.mailCc || "")}" oninput="excelToolState.mailCc=this.value">
    </div>
    <datalist id="excelContactList">
      ${CONTACTS.filter((c) => c.email).map((c) => `<option value="${escapeHtml(c.email)}">${escapeHtml(c.country || "")} ${escapeHtml(c.contact || "")}</option>`).join("")}
    </datalist>

    <div class="hint" style="margin:10px 0 0;">📌 메일 제목: <b>${escapeHtml(LT_MAIL_SUBJECT_PREFIX + (excelToolState.titleFinal || excelToolState.titleAuto))}</b> (앞부분 "${escapeHtml(LT_MAIL_SUBJECT_PREFIX.trim())}"는 메일에만 자동으로 붙어요, 엑셀 제목·파일명엔 안 붙어요)</div>

    <div style="margin:14px 0;">
      <div style="font-size:13px;color:#6b7280;margin-bottom:6px;">메일 내용 (자유롭게 수정 가능해요)</div>
      <textarea id="excelMailBody" rows="5" style="width:100%; box-sizing:border-box; font-family:'Aptos','Calibri',sans-serif; font-size:10.5pt; padding:10px; border-radius:10px; border:1px solid #e5e7eb; resize:vertical;" oninput="excelToolState.mailBody=this.value">${escapeHtml(excelToolState.mailBody !== null && excelToolState.mailBody !== undefined ? excelToolState.mailBody : defaultExcelMailBody())}</textarea>
    </div>

    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn generate-btn" style="flex:1;" onclick="downloadExcelResult()">💾 정리된 엑셀 다운로드</button>
      <button class="btn secondary-btn" style="flex:1;" onclick="sendExcelResultMail()">📧 메일로 보내기</button>
    </div>
    <div class="hint" style="margin-top:8px;">📧 버튼을 누르면 엑셀 파일이 먼저 다운로드되고, 위 내용으로 메일 앱이 새 메일 화면으로 열려요. 브라우저 특성상 파일을 메일에 자동으로 첨부할 수는 없어서, 방금 다운로드된 파일을 다운로드 폴더에서 끌어다 직접 첨부해주셔야 해요.</div>`;
  } else {
    html += `<button class="btn generate-btn full" style="margin-top:16px;" onclick="downloadExcelResult()">💾 정리된 엑셀 다운로드</button>`;
  }

  return html;
}

function clearExcelFile() {
  excelToolState = freshExcelToolState();
  renderExcelTool();
}

function handleExcelFileSelected(event) {
  const file = event.target.files[0];
  if (file) processExcelFile(file);
}

function processExcelFile(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      if (isUnloadingMode(excelMode)) {
        parseUnloadingRaw(aoa, file.name);
      } else {
        parseLtListRaw(aoa, file.name);
      }
    } catch (err) {
      alert("엑셀을 읽는 중 문제가 생겼어요. 파일 형식을 확인해주세요.\n(" + err.message + ")");
    }
  };
  reader.readAsArrayBuffer(file);
}

/* 원본 Container Report(09056) 형태를 읽어서 LT LIST 규칙대로 정리한다.
   확정 규칙:
   1) 1~2행(제목/파라미터) 제외, 2행에서 Vessel Code/Voyage/Leg 추출해 제목 자동 생성
   2) "Special Flags", "Liner Term", "B/L Type" 컬럼 제외
   3) "Full Containers" 섹션의 "KRPUS" 그룹만 대상
   4) 그 안에서 Delivery Port 값이 있는 행만 유지 (Container 공란이어도 Delivery Port 있으면 유지)
   5) Empty Containers 섹션에 Delivery Port가 있는 행은 자동 포함하지 않고 사용자에게 확인 후 결정
   6) Sr#는 1부터 순번 재부여, Container 번호 공백 제거 */
function parseLtListRaw(aoa, fileName) {
  if (aoa.length < 4) { alert("원본 파일 형식을 알아볼 수 없어요."); return; }

  // --- 제목 자동 추출 (2행 파라미터) ---
  const paramRow = aoa[1] || [];
  const findParam = (label) => {
    for (const v of paramRow) {
      if (typeof v === "string" && v.trim().startsWith(label)) return v.split(":").slice(1).join(":").trim();
    }
    return null;
  };
  const vesselCode = findParam("Vessel Code") || "";
  const voyage = findParam("Voyage") || "";
  const leg = findParam("Leg") || "";
  const titleAuto = `${vesselCode} ${voyage}${leg} LT LIST`.toUpperCase().replace(/\s+/g, " ").trim();

  // --- 헤더 행 찾기 (Sr # 로 시작하는 행) ---
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const c0 = aoa[i][0];
    if (typeof c0 === "string" && c0.trim().replace(/\s+/g, " ") === "Sr #") { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) { alert("헤더 행(Sr #)을 찾지 못했어요. 원본 형식이 맞는지 확인해주세요."); return; }

  const rawHeaders = aoa[headerRowIdx];
  const keepIdx = [];
  rawHeaders.forEach((h, idx) => {
    if (h === null || h === undefined || String(h).trim() === "") return;
    const clean = String(h).trim();
    if (LT_LIST_DROP_HEADERS.includes(clean)) return;
    keepIdx.push(idx);
  });
  const deliveryPortIdx = rawHeaders.findIndex((h) => typeof h === "string" && h.replace(/\s+/g, "") === "Delivery\nPort".replace(/\s+/g, ""));
  const containerIdx = rawHeaders.findIndex((h) => typeof h === "string" && h.trim() === "Container");

  const isGroupHeader = (row) => typeof row[0] === "string" && (row[1] === null || row[1] === undefined) && /^[A-Z]{3,8}$/.test(row[0].trim());

  let inFull = false;
  let inTargetGroup = false;
  const ltRows = [];
  const emptyCandidates = [];

  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const c0 = row[0];

    if (c0 === "Full Containers") { inFull = true; inTargetGroup = false; continue; }
    if (c0 === "Empty Containers") { inFull = false; inTargetGroup = false; continue; }

    if (isGroupHeader(row)) {
      inTargetGroup = inFull && row[0].trim() === "KRPUS";
      continue;
    }

    if (typeof c0 !== "number") continue; // 데이터 행이 아님 (요약행, 빈 행 등)
    if (typeof row[1] === "number") continue; // Container 열이 숫자면 진짜 데이터가 아니라 파일 끝 날짜/시간 꼬리표(footer)임

    const dp = deliveryPortIdx >= 0 ? row[deliveryPortIdx] : null;
    const hasDp = dp !== null && dp !== undefined && String(dp).trim() !== "";

    if (inFull && inTargetGroup && hasDp) {
      ltRows.push(row);
    } else if (!inFull && hasDp) {
      // Empty Containers 섹션인데 Delivery Port가 있는 경우 -> 자동 포함 안 하고 후보로만 기록
      emptyCandidates.push({
        raw: row,
        container: containerIdx >= 0 ? row[containerIdx] : "",
        deliveryPort: String(dp),
        bl: row[keepIdx.find((i) => rawHeaders[i] === "B/L No.")] || ""
      });
    }
  }

  finalizeLtRows(ltRows, keepIdx, rawHeaders, containerIdx, titleAuto, fileName, emptyCandidates);
}

function finalizeLtRows(dataRows, keepIdx, rawHeaders, containerIdx, titleAuto, fileName, emptyCandidates) {
  const headers = keepIdx.map((i) => rawHeaders[i]);
  const cIdxInKept = keepIdx.indexOf(containerIdx);

  // Container 번호가 비어있는 행은 LT LIST에서 제외 (터미널 제출용이라 컨테이너 없는 행은 그대로 두면 안 됨)
  let removedBlankCount = 0;
  const filtered = dataRows.filter((row) => {
    const cVal = containerIdx >= 0 ? row[containerIdx] : null;
    const isBlank = cVal === null || cVal === undefined || String(cVal).trim() === "";
    if (isBlank) removedBlankCount++;
    return !isBlank;
  });

  const rows = filtered.map((row, i) => {
    const out = keepIdx.map((idx) => (typeof row[idx] === "string" ? row[idx].replace(/[\r\n]+/g, " ").trim() : row[idx]));
    out[0] = i + 1; // Sr# 재번호
    if (cIdxInKept >= 0 && out[cIdxInKept]) out[cIdxInKept] = String(out[cIdxInKept]).replace(/\s+/g, "");
    return out;
  });

  excelToolState.fileName = fileName;
  excelToolState.titleAuto = titleAuto;
  excelToolState.titleFinal = titleAuto;
  excelToolState.headers = headers;
  excelToolState.rows = rows;
  excelToolState.removedBlankCount = removedBlankCount;
  excelToolState.emptyCandidates = emptyCandidates;
  excelToolState.emptyDecided = emptyCandidates.length === 0;
  excelToolState._pendingKeepIdx = keepIdx;
  excelToolState._pendingRawHeaders = rawHeaders;
  excelToolState._pendingContainerIdx = containerIdx;
  excelToolState._pendingBaseRows = dataRows;

  renderExcelTool();
}

function decideEmptyInclusion(include) {
  excelToolState.emptyDecided = true;
  excelToolState.emptyIncluded = include;
  if (include) {
    const merged = excelToolState._pendingBaseRows.concat(excelToolState.emptyCandidates.map((c) => c.raw));
    finalizeLtRows(merged, excelToolState._pendingKeepIdx, excelToolState._pendingRawHeaders, excelToolState._pendingContainerIdx, excelToolState.titleAuto, excelToolState.fileName, []);
    excelToolState.emptyDecided = true;
  } else {
    excelToolState.emptyCandidates = [];
    renderExcelTool();
  }
}

/* =========================================================================
   ⚓ 양하리스트 자동 변환 (부산=KRPUS / 인천=KRICN, 탭에서 선택한 모드 기준)
   확정 규칙:
   1) 2행 파라미터에서 Vessel Code/Voyage/Leg 추출해 제목 자동 생성
   2) VGM/Mvmt/Partner/Notify/No.of Pkgs/Tare/Special Flags/Liner Term 컬럼 제외 (HV는 유지)
   3) Disch Port/Depot To 그룹이 대상 항구(부산=KRPUS, 인천=KRICN)면 Full/Empty 상관없이 다 대상 (LT LIST와 다르게 Delivery Port는 안 봄)
   4) 대상 항구가 아닌 그룹은 통째로 제외하고, 뭘 얼마나 제외했는지 화면에 안내
   5) 대상인데 Container가 공란인 행은 자동 삭제하지 않고 상세 내용 보여주며 확인
   6) Empty + Notify가 "ZIM KOREA"/"ZIM PUSAN"으로 시작하는 행도 자동 삭제하지 않고 확인
   7) 확정된 행 기준 위험물(Hz) 알림 - 부산은 등급 앞자리가 1·2·7이면 "직반출 의심", 인천은 Hz: 있으면 그냥 "DG 있음"
   7-1) 인천 전용: RF-C/IMO에 "Over Width/Height/Length" 있으면 "OOG 있음" 알림
   8) HV 컬럼도 결과에 그대로 남기고, 'Y'면 HIGH VALUE CARGO 알림
   9) Sr#는 1부터 순번 재부여, Container 번호 공백 제거
   ========================================================================= */

function parseUnloadingRaw(aoa, fileName) {
  if (aoa.length < 4) { alert("원본 파일 형식을 알아볼 수 없어요."); return; }

  const portConf = UNLOADING_PORTS[excelMode] || UNLOADING_PORTS.unloading_busan;
  const targetGroup = portConf.group;

  const paramRow = aoa[1] || [];
  const findParam = (label) => {
    for (const v of paramRow) {
      if (typeof v === "string" && v.trim().startsWith(label)) return v.split(":").slice(1).join(":").trim();
    }
    return null;
  };
  const vesselCode = findParam("Vessel Code") || "";
  const voyage = findParam("Voyage") || "";
  const leg = findParam("Leg") || "";
  const titleAuto = `${vesselCode} ${voyage}${leg} LOCAL DISCH LIST`.toUpperCase().replace(/\s+/g, " ").trim();

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const c0 = aoa[i][0];
    if (typeof c0 === "string" && c0.trim().replace(/\s+/g, " ") === "Sr #") { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) { alert("헤더 행(Sr #)을 찾지 못했어요. 원본 형식이 맞는지 확인해주세요."); return; }

  const rawHeaders = aoa[headerRowIdx];
  const keepIdx = [];
  rawHeaders.forEach((h, idx) => {
    if (h === null || h === undefined || String(h).trim() === "") return;
    if (UNLOADING_DROP_HEADERS.includes(normalizeHeaderText(h))) return;
    keepIdx.push(idx);
  });

  const findColIdx = (name) => rawHeaders.findIndex((h) => normalizeHeaderText(h) === name);
  const containerIdx = findColIdx("Container");
  const notifyIdx = findColIdx("Notify");
  const blIdx = findColIdx("B/L No.");
  const rfIdx = findColIdx("RF-C/ IMO. UN No/ OOG H-M");
  const hvIdx = findColIdx("HV");

  const isGroupHeader = (row) => typeof row[0] === "string" && (row[1] === null || row[1] === undefined) && /^[A-Z]{3,8}$/.test(row[0].trim());

  let section = null; // 'full' | 'empty'
  let inTargetGroup = false;
  let currentGroupCode = null;
  const baseRows = [];
  const blankCandidates = [];
  const emptyZimCandidates = [];
  const removedGroupsMap = {};

  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const c0 = row[0];

    if (c0 === "Full Containers") { section = "full"; inTargetGroup = false; currentGroupCode = null; continue; }
    if (c0 === "Empty Containers") { section = "empty"; inTargetGroup = false; currentGroupCode = null; continue; }

    if (isGroupHeader(row)) {
      currentGroupCode = row[0].trim();
      inTargetGroup = currentGroupCode === targetGroup;
      continue;
    }

    if (typeof c0 !== "number") continue; // 데이터 행이 아님 (요약행, 빈 행 등)
    if (typeof row[1] === "number") continue; // Container 열이 숫자면 진짜 데이터가 아니라 파일 끝 날짜/시간 꼬리표(footer)임

    if (!inTargetGroup) {
      const key = (section || "?") + "|" + (currentGroupCode || "?");
      removedGroupsMap[key] = (removedGroupsMap[key] || 0) + 1;
      continue;
    }

    const containerVal = containerIdx >= 0 ? row[containerIdx] : null;
    const isBlank = containerVal === null || containerVal === undefined || String(containerVal).trim() === "";
    const notifyVal = notifyIdx >= 0 ? row[notifyIdx] : "";
    const isZimNotify = typeof notifyVal === "string" && UNLOADING_ZIM_NOTIFY_PREFIXES.some((p) => notifyVal.trim().toUpperCase().startsWith(p));

    const detail = {
      raw: row,
      section,
      container: containerVal || "(공란)",
      bl: blIdx >= 0 ? row[blIdx] : "",
      notify: notifyIdx >= 0 ? row[notifyIdx] : "",
      rf: rfIdx >= 0 ? row[rfIdx] : ""
    };

    if (isBlank) {
      blankCandidates.push(detail);
    } else if (section === "empty" && isZimNotify) {
      emptyZimCandidates.push(detail);
    } else {
      baseRows.push(row);
    }
  }

  const removedGroups = Object.keys(removedGroupsMap).map((key) => {
    const [sec, grp] = key.split("|");
    return { section: sec === "full" ? "Full" : sec === "empty" ? "Empty" : "-", group: grp, count: removedGroupsMap[key] };
  }).sort((a, b) => b.count - a.count);

  // 같은 B/L No.인데 공란 행에만 있는 RF-C/IMO 정보가 있으면, 대표 행(컨테이너 번호 있는 행)에 합쳐서
  // 공란 행을 지워도 그 정보가 사라지지 않게 함. "Hz: 코드/등급" 형식이면 기존 다중 위험물 표기(콤마로 이어붙이는 것)와
  // 똑같이 콤마로 합침 (예: "Hz: 1195/3,1173/3,2810/6.1,3082/9,3423/8")
  function mergeRfValue(mainRf, blankRf) {
    if (!blankRf) return mainRf;
    if (!mainRf) return blankRf;
    const mainMatch = mainRf.match(/^Hz:\s*(.+)$/i);
    const blankMatch = blankRf.match(/^Hz:\s*(.+)$/i);
    if (mainMatch && blankMatch) {
      const mainCodes = mainMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      const blankCodes = blankMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      blankCodes.forEach((c) => { if (!mainCodes.includes(c)) mainCodes.push(c); });
      return "Hz: " + mainCodes.join(",");
    }
    if (mainRf.indexOf(blankRf) !== -1) return mainRf; // 이미 포함된 내용이면 그대로
    return mainRf + " " + blankRf; // 형식이 서로 다르면(Hz/RF 등) 한 칸 띄워서 이어붙임
  }

  if (rfIdx >= 0 && blIdx >= 0) {
    const mainRowByBL = {};
    baseRows.concat(emptyZimCandidates.map((c) => c.raw)).forEach((row) => {
      const bl = row[blIdx];
      if (bl && !mainRowByBL[bl]) mainRowByBL[bl] = row;
    });
    blankCandidates.forEach((detail) => {
      const mainRow = detail.bl ? mainRowByBL[detail.bl] : null;
      if (!mainRow) return;
      const blankRf = String(detail.rf || "").trim();
      const mainRf = String(mainRow[rfIdx] || "").trim();
      mainRow[rfIdx] = mergeRfValue(mainRf, blankRf);
    });
  }

  excelToolState.fileName = fileName;
  excelToolState.titleAuto = titleAuto;
  excelToolState.titleFinal = titleAuto;
  excelToolState.headers = [];
  excelToolState.rows = [];
  excelToolState.ulRemovedGroups = removedGroups;
  excelToolState.ulBlankCandidates = blankCandidates;
  excelToolState.ulBlankDecided = blankCandidates.length === 0;
  excelToolState.ulBlankRemove = null;
  excelToolState.ulEmptyZimCandidates = emptyZimCandidates;
  excelToolState.ulEmptyZimDecided = emptyZimCandidates.length === 0;
  excelToolState.ulEmptyZimRemove = null;
  excelToolState.ulHzAlerts = [];
  excelToolState.ulHvAlerts = [];
  excelToolState.ulPending = { baseRows, keepIdx, rawHeaders, containerIdx, notifyIdx, blIdx, rfIdx, hvIdx, portKey: excelMode };

  if (blankCandidates.length) {
    excelToolState.ulStep = "blank";
    renderExcelTool();
  } else if (emptyZimCandidates.length) {
    excelToolState.ulStep = "emptyZim";
    renderExcelTool();
  } else {
    excelToolState.ulStep = "done";
    finalizeUnloadingRows();
  }
}

function decideUlBlank(remove) {
  excelToolState.ulBlankDecided = true;
  excelToolState.ulBlankRemove = remove;
  if (excelToolState.ulEmptyZimCandidates.length && !excelToolState.ulEmptyZimDecided) {
    excelToolState.ulStep = "emptyZim";
    renderExcelTool();
  } else {
    excelToolState.ulStep = "done";
    finalizeUnloadingRows();
  }
}

function decideUlEmptyZim(remove) {
  excelToolState.ulEmptyZimDecided = true;
  excelToolState.ulEmptyZimRemove = remove;
  excelToolState.ulStep = "done";
  finalizeUnloadingRows();
}

/* 두 단계 확인이 다 끝나면 최종 행을 확정하고, 직반출 의심(HZ) / HIGH VALUE CARGO(B/L 접두어) 알림까지 계산한다 */
function finalizeUnloadingRows() {
  const p = excelToolState.ulPending;
  if (!p) return;

  let rows = p.baseRows.slice();
  if (excelToolState.ulBlankRemove === false) {
    rows = rows.concat(excelToolState.ulBlankCandidates.map((c) => c.raw));
  }
  if (excelToolState.ulEmptyZimRemove === false) {
    rows = rows.concat(excelToolState.ulEmptyZimCandidates.map((c) => c.raw));
  }

  const headers = p.keepIdx.map((i) => p.rawHeaders[i]);
  const cIdxInKept = p.keepIdx.indexOf(p.containerIdx);
  const blIdxInKept = p.keepIdx.indexOf(p.blIdx);
  const rfIdxInKept = p.keepIdx.indexOf(p.rfIdx);

  const finalRows = rows.map((row, i) => {
    const out = p.keepIdx.map((idx) => (typeof row[idx] === "string" ? row[idx].replace(/[\r\n]+/g, " ").trim() : row[idx]));
    out[0] = i + 1;
    if (cIdxInKept >= 0 && out[cIdxInKept]) out[cIdxInKept] = String(out[cIdxInKept]).replace(/\s+/g, "");
    return out;
  });

  // 직반출 의심(HZ) 알림 - 부산: 등급이 1·2·7로 시작할 때만 / 그 외 항구: Hz:가 있으면 그냥 DG 알림 (등급 안 가림)
  const useGeneralDgRule = p.portKey !== "unloading_busan";
  const hzAlerts = [];
  finalRows.forEach((out) => {
    const rf = rfIdxInKept >= 0 ? out[rfIdxInKept] : "";
    if (typeof rf !== "string" || !rf) return;
    const m = rf.match(/Hz:\s*(.+)/i);
    if (!m) return;
    if (useGeneralDgRule) {
      hzAlerts.push({ container: cIdxInKept >= 0 ? out[cIdxInKept] : "", detail: m[1].trim() });
      return;
    }
    const hitClasses = [];
    m[1].split(",").forEach((part) => {
      const seg = part.trim();
      const slashIdx = seg.indexOf("/");
      if (slashIdx === -1) return;
      const cls = seg.slice(slashIdx + 1).trim();
      if (/^[127]/.test(cls)) hitClasses.push(seg);
    });
    if (hitClasses.length) hzAlerts.push({ container: cIdxInKept >= 0 ? out[cIdxInKept] : "", detail: hitClasses.join(", ") });
  });

  // OOG(오버사이즈) 알림 - 부산 외 항구 전용. RF-C/IMO에 "Over Width/Height/Length" 표시가 있으면
  const oogAlerts = [];
  if (useGeneralDgRule) {
    finalRows.forEach((out) => {
      const rf = rfIdxInKept >= 0 ? out[rfIdxInKept] : "";
      if (typeof rf !== "string" || !rf) return;
      if (/Over\s*(Width|Height|Length)/i.test(rf)) {
        oogAlerts.push({ container: cIdxInKept >= 0 ? out[cIdxInKept] : "", detail: rf.replace(/\n/g, " ").trim() });
      }
    });
  }

  // HIGH VALUE CARGO 알림 - HV 컬럼이 'Y'면 (이제 결과 컬럼에도 HV를 그대로 남겨둠)
  const hvIdxInKept = p.keepIdx.indexOf(p.hvIdx);
  const hvAlerts = [];
  finalRows.forEach((out) => {
    const hv = hvIdxInKept >= 0 ? out[hvIdxInKept] : "";
    if (typeof hv === "string" && hv.trim().toUpperCase() === "Y") {
      hvAlerts.push({ container: cIdxInKept >= 0 ? out[cIdxInKept] : "", bl: blIdxInKept >= 0 ? out[blIdxInKept] : "" });
    }
  });

  // TK(탱크) 타입인데 Net WT가 50kg 이하면 - 데이터는 그대로 두고 SOC 엠티 신고인지 확인하라는 알림만
  const typeIdxInKept = p.keepIdx.indexOf(findColIdxIn(p.rawHeaders, "Type/ Size"));
  const netWtIdxInKept = p.keepIdx.indexOf(findColIdxIn(p.rawHeaders, "Net WT (kgs)"));
  const tkSocAlerts = [];
  finalRows.forEach((out) => {
    const type = typeIdxInKept >= 0 ? out[typeIdxInKept] : "";
    const netWt = netWtIdxInKept >= 0 ? out[netWtIdxInKept] : null;
    if (typeof type === "string" && type.toUpperCase().startsWith("TK") && typeof netWt === "number" && netWt <= 50) {
      tkSocAlerts.push({ container: cIdxInKept >= 0 ? out[cIdxInKept] : "", type, netWt });
    }
  });

  excelToolState.headers = headers;
  excelToolState.rows = finalRows;
  excelToolState.ulHzAlerts = hzAlerts;
  excelToolState.ulOogAlerts = oogAlerts;
  excelToolState.ulHvAlerts = hvAlerts;
  excelToolState.ulTkSocAlerts = tkSocAlerts;

  renderExcelTool();
}

function defaultExcelMailBody() {
  if (LT_MAIL_SETTINGS.body && LT_MAIL_SETTINGS.body.trim()) return LT_MAIL_SETTINGS.body;
  const title = (excelToolState.titleFinal || excelToolState.titleAuto || "").trim();
  const safeName = title.replace(/[\/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim() + ".xlsx";
  return `${title} 정리 파일 첨부드립니다.\n\n첨부파일: ${safeName}\n\n※ 방금 다운로드된 엑셀 파일을 이 메일에 직접 첨부해주세요.`;
}

async function sendExcelResultMail() {
  if (!excelToolState.rows.length) { alert("보낼 데이터가 없어요."); return; }
  const title = (excelToolState.titleFinal || excelToolState.titleAuto).trim();
  const toInput = document.getElementById("excelMailTo");
  const ccInput = document.getElementById("excelMailCc");
  const bodyInput = document.getElementById("excelMailBody");
  const to = toInput ? toInput.value.trim() : "";
  const cc = ccInput ? ccInput.value.trim() : "";
  const body = bodyInput ? bodyInput.value : defaultExcelMailBody();
  const subject = excelMode === "lt" ? LT_MAIL_SUBJECT_PREFIX + title : title;

  await downloadExcelResult();

  const safeName = title.replace(/[\/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim() + ".xlsx";
  let link = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  if (cc) link += "&cc=" + encodeURIComponent(cc);
  window.location.href = link;

  alert("엑셀 파일이 다운로드됐어요. 메일 앱이 열리면, 방금 다운로드된 파일(" + safeName + ")을 다운로드 폴더에서 끌어와 첨부해주세요 — 브라우저 보안 정책상 파일을 자동으로 첨부할 수는 없어요.");
}

async function downloadExcelResult() {
  if (!excelToolState.rows.length) { alert("다운로드할 데이터가 없어요."); return; }
  const title = (excelToolState.titleFinal || excelToolState.titleAuto).trim();
  const headers = excelToolState.headers;
  const rows = excelToolState.rows;
  const colCount = headers.length;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");

  // 원본 정제 파일 규격: Sr#/중량/개수 계열은 소수점 없이 표시(값 자체는 유지), 나머지는 일반 표시
  const INTEGER_DISPLAY_HEADERS = ["Sr #", "Net WT (kgs)", "Gross WT (kgs)", "VGM (kgs)", "No. of Pkgs", "Tare"];
  const normalizeHeader = (h) => String(h || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  const integerCols = headers.map((h) => INTEGER_DISPLAY_HEADERS.includes(normalizeHeader(h)));

  // ---- 열 너비: 더블클릭 자동맞춤과 비슷하게 헤더(줄바꿈 없앤 한 줄 기준)/데이터 중 가장 긴 값으로 계산 ----
  // (헤더에 원래 줄바꿈이 들어있어서 줄 단위로만 길이를 재면 실제 한 줄로 찍힐 때보다 훨씬 짧게 계산되는 버그가 있었음 -> 수정)
  const colWidths = headers.map((h, i) => {
    let maxLen = normalizeHeader(h).length;
    rows.forEach((r) => {
      const v = r[i];
      const len = v === null || v === undefined ? 0 : String(v).length;
      if (len > maxLen) maxLen = len;
    });
    return Math.min(Math.max(maxLen + 2, 6), 45);
  });
  ws.columns = headers.map((h, i) => ({ width: colWidths[i] }));

  // ---- 1행: 제목 (병합 + 가운데정렬 + Calibri 15 + 행높이 19.5) ----
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Calibri", size: 15, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 19.5;

  // ---- 2행: 헤더 (Arial 10 + 행높이 15) ----
  const headerRow = ws.getRow(2);
  headers.forEach((h, i) => { headerRow.getCell(i + 1).value = String(h || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim(); });
  headerRow.height = 15;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10 };
    cell.alignment = { vertical: "top", wrapText: false };
  });

  // ---- 데이터 행들 (Arial 10 + 행높이 15) ----
  rows.forEach((r, idx) => {
    const row = ws.getRow(idx + 3);
    r.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      if (integerCols[i] && typeof v === "number") cell.numFmt = "0";
    });
    row.height = 15;
    row.eachCell((cell) => { cell.font = { name: "Arial", size: 10 }; cell.alignment = { vertical: "top" }; });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // 파일명에는 언더바 없이 원래 제목 그대로 (경로에 못 쓰는 문자만 제거)
  const safeName = title.replace(/[\/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim() + ".xlsx";
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

