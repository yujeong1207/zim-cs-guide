/* =========================================================================
   🧾 비엘리스트 만들기 (수입 마감용)
   - guide_script.js 용량이 너무 커져서 이 기능만 별도 파일로 분리했어요.
   - index.html 에서 xlsx.full.min.js / exceljs.min.js / guide_script.js 보다
     먼저(또는 나중에, 순서 무관) 로드되면 됩니다. escapeHtml() 등 guide_script.js의
     전역 함수를 그대로 재사용해요.
   ========================================================================= */

// 원본 파일(Agenteam 등에서 추출한 비엘 리스트)의 고정 컬럼 위치 (0-based)
// A=compute6, C=B/L Number, H/I/J=Vessel/Voyage/Leg(2번째 세트), L=POL, M=Via,
// O=POD, P=DEL, AN=Notify, AQ=B/T, AU=prepaid collect ind 1
const BL_LIST_COL = {
  A: 0, C: 2, H: 7, I: 8, J: 9, L: 11, M: 12, O: 14, P: 15, AN: 39, AQ: 42, AU: 46
};
const BL_LIST_HEADER_CHECK = {
  A: "compute 6", C: "b/l number", H: "vessel", I: "voyage", J: "leg",
  L: "pol", M: "via", O: "pod", P: "del", AN: "notify", AQ: "b/t", AU: "prepaid collect ind 1"
};

const BL_LIST_CHECKLIST_ITEMS = [
  "CHR (로컬 닫고 BLOCK)", "전송", "A/N", "포", "화", "F/F", "SYSMAIL",
  "DG", "품목", "SOC LIST", "DEL업로드", "CNTR", "세관마감", "하선",
  "XRAY", "마감메일", "마감목록", "WHF"
];
const BL_LIST_SYSMAIL_ADDRESS = "SYSMAIL@WSC.CO.KR";

function freshBlListState() {
  return {
    file1Name: null, file1Aoa: null,
    file2Name: null, file2Aoa: null,
    serviceName: "", vesselName: "", arrivalDate: "", callSign: "", arrivalCount: "", mrnRaw: "",
    result: null,       // computeBlListResult() 의 결과 캐시
    headerMismatch: []  // 원본 파일 헤더가 예상 위치와 다르면 여기 채워짐 (경고용)
  };
}
let blListState = freshBlListState();

function resetBlListState() {
  blListState = freshBlListState();
}

/* ---------- 파일 업로드 ---------- */

function handleBlListFile1(event) {
  const file = event.target.files[0];
  if (file) processBlListFile1(file);
}
function handleBlListFile2(event) {
  const file = event.target.files[0];
  if (file) processBlListFile2(file);
}

function processBlListFile1(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      blListState.file1Name = file.name;
      blListState.file1Aoa = aoa;
      blListState.result = null;
      renderExcelTool();
    } catch (err) {
      alert("비엘 리스트 원본 파일을 읽는 중 문제가 생겼어요. 파일 형식을 확인해주세요.\n(" + err.message + ")");
    }
  };
  reader.readAsArrayBuffer(file);
}

function processBlListFile2(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      blListState.file2Name = file.name;
      blListState.file2Aoa = aoa;
      blListState.result = null;
      renderExcelTool();
    } catch (err) {
      alert("Customer Name 추출 파일을 읽는 중 문제가 생겼어요. 파일 형식을 확인해주세요.\n(" + err.message + ")");
    }
  };
  reader.readAsArrayBuffer(file);
}

function clearBlListFile1() {
  blListState.file1Name = null;
  blListState.file1Aoa = null;
  blListState.result = null;
  renderExcelTool();
}
function clearBlListFile2() {
  blListState.file2Name = null;
  blListState.file2Aoa = null;
  blListState.result = null;
  renderExcelTool();
}

/* ---------- MRN 형식 변환: 26IALKIG71I -> 26-IALK-IG71-I (2자/4자/4자/나머지) ---------- */
function formatBlListMrn(raw) {
  const clean = String(raw || "").trim().toUpperCase();
  if (!clean) return "";
  const parts = [clean.slice(0, 2), clean.slice(2, 6), clean.slice(6, 10), clean.slice(10)];
  return parts.filter((p) => p).join("-");
}

/* ---------- 핵심 처리 로직 ---------- */

function computeBlListResult() {
  const aoa1 = blListState.file1Aoa;
  if (!aoa1 || aoa1.length < 2) return null;

  const header1 = aoa1[0] || [];
  const mismatch = [];
  Object.keys(BL_LIST_HEADER_CHECK).forEach((key) => {
    const idx = BL_LIST_COL[key];
    const actual = String(header1[idx] || "").trim().toLowerCase();
    if (actual !== BL_LIST_HEADER_CHECK[key]) mismatch.push({ col: key, expected: BL_LIST_HEADER_CHECK[key], actual: header1[idx] });
  });
  blListState.headerMismatch = mismatch;

  // Customer Name 매핑 (2번째 파일: C=B/L No, D=Customer Name)
  const customerMap = {};
  const aoa2 = blListState.file2Aoa;
  if (aoa2 && aoa2.length > 1) {
    for (let r = 1; r < aoa2.length; r++) {
      const row = aoa2[r];
      if (!row) continue;
      const blNoRaw = row[2];
      if (blNoRaw === null || blNoRaw === undefined) continue;
      const key = String(blNoRaw).trim();
      customerMap[key] = row[3];
    }
  }

  const vessel = String(aoa1[1] ? aoa1[1][BL_LIST_COL.H] || "" : "").trim();
  const voyage = String(aoa1[1] ? aoa1[1][BL_LIST_COL.I] || "" : "").trim();
  const leg = String(aoa1[1] ? aoa1[1][BL_LIST_COL.J] || "" : "").trim();
  const title = (vessel + " " + voyage + leg).trim().toUpperCase();

  const kept = [];
  const moved = [];
  let deletedCount = 0;
  const deletedList = [];

  for (let r = 1; r < aoa1.length; r++) {
    const row = aoa1[r];
    if (!row) continue;
    const blNoRaw = row[BL_LIST_COL.C];
    if (blNoRaw === null || blNoRaw === undefined || String(blNoRaw).trim() === "") continue; // 완전 빈 행

    const aqRaw = row[BL_LIST_COL.AQ];
    const bt = aqRaw === null || aqRaw === undefined ? null : String(aqRaw).trim();
    const blNo = String(blNoRaw).trim();

    if (bt === "A" || bt === "C") {
      deletedCount++;
      deletedList.push(blNo);
      continue;
    }

    const notifyRaw = row[BL_LIST_COL.AN];
    const notify = notifyRaw === null || notifyRaw === undefined ? notifyRaw : String(notifyRaw).trim();
    const auRaw = row[BL_LIST_COL.AU];
    const au = auRaw === null || auRaw === undefined ? null : String(auRaw).trim();
    const hasCustomerFile = !!(aoa2 && aoa2.length > 1);
    const customer = customerMap.hasOwnProperty(blNo) ? customerMap[blNo] : null;

    const rowData = {
      blNo, bt,
      customer,
      pol: row[BL_LIST_COL.L],
      via: row[BL_LIST_COL.M],
      pod: row[BL_LIST_COL.O],
      del: row[BL_LIST_COL.P],
      notify,
      collect: au === "C",
      matched: hasCustomerFile ? customerMap.hasOwnProperty(blNo) : null // null = 대조 파일 자체가 없음
    };

    if (bt === "V") moved.push(rowData);
    else kept.push(rowData);
  }

  // COMPUTE 6 넘버링: kept 행만 1..N 순서대로 부여, moved(회색) 행은 번호 없음
  kept.forEach((row, i) => { row.compute6 = String(i + 1); });
  moved.forEach((row) => { row.compute6 = null; });

  const collectList = kept.concat(moved).filter((r) => r.collect).map((r) => r.blNo);
  const unmatchedList = kept.concat(moved).filter((r) => r.matched === false).map((r) => r.blNo);

  return {
    title,
    kept, moved,
    blCount: kept.length,          // ⚠️ 회색(V) 처리된 건 제외
    deletedCount, deletedList,
    movedCount: moved.length,
    collectList,
    unmatchedList,
    hasCustomerFile: !!(aoa2 && aoa2.length > 1),
    totalSourceRows: aoa1.length - 1
  };
}

function generateBlListResult() {
  if (!blListState.file1Aoa) { alert("비엘 리스트 원본 파일을 먼저 올려주세요."); return; }
  const result = computeBlListResult();
  if (!result) { alert("원본 파일에서 데이터를 읽지 못했어요."); return; }
  blListState.result = result;
  renderExcelTool();
}

/* ---------- 엑셀 다운로드 (ExcelJS) ---------- */

async function downloadBlListExcel() {
  if (!blListState.file1Aoa) { alert("비엘 리스트 원본 파일을 먼저 올려주세요."); return; }
  const result = computeBlListResult();
  blListState.result = result;
  if (!result) { alert("원본 파일에서 데이터를 읽지 못했어요."); return; }

  const serviceName = (document.getElementById("blListServiceName") || {}).value || "";
  const vesselName = (document.getElementById("blListVesselName") || {}).value || "";
  const arrivalDate = (document.getElementById("blListArrivalDate") || {}).value || "";
  const callSign = (document.getElementById("blListCallSign") || {}).value || "";
  const arrivalCount = (document.getElementById("blListArrivalCount") || {}).value || "";
  const mrnRaw = (document.getElementById("blListMrn") || {}).value || "";

  if (!serviceName || !vesselName || !arrivalDate || !callSign || !arrivalCount || !mrnRaw) {
    alert("상단 안내 문구를 만들려면 서비스명 / 모선명 / 입항일 / CALL SIGN / 입항 횟수 / MRN을 모두 입력해주세요.");
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("비엘리스트");

  const FONT_NAME = "Aptos";
  const FONT_SIZE = 10;
  const HEADER_BLUE = { argb: "FF0000FF" };
  const DATA_BLACK = { argb: "FF1A1A1A" };
  const GREY_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  const YELLOW_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  const STRIPE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F4EF" } }; // 한 줄씩 옅은 배경(줄무늬)
  const THIN_GREY = { style: "thin", color: { argb: "FFD0D0D0" } };
  const CELL_BORDER = { top: THIN_GREY, bottom: THIN_GREY, left: THIN_GREY, right: THIN_GREY };

  const headers = ["COMPUTE 6", "B/L Number", "B/T", "Customer Name", "POL", "VIA", "POD", "DEL", "NOTIFY", "COLLECT"];
  ws.columns = [
    { width: 11 }, { width: 20 }, { width: 7 }, { width: 26 }, { width: 9 },
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 14 }, { width: 11 },
    { width: 22 }, { width: 22 }
  ];

  // ---- 1~2행: 안내 문구 (A:E 병합, 볼드 없음, 가운데정렬) ----
  ws.mergeCells(1, 1, 2, 5);
  const titleCell = ws.getCell(1, 1);
  const mrnFmt = formatBlListMrn(mrnRaw);
  const line1 = `${serviceName} - ${result.title} (${vesselName}) ${arrivalDate} - ${callSign} - ${arrivalCount}`;
  const line2 = `MRN : ${mrnFmt}    BL : ${result.blCount}`;
  titleCell.value = line1 + "\n" + line2;
  titleCell.font = { name: FONT_NAME, size: 11 };
  titleCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 15;
  ws.getRow(2).height = 15;

  // ---- 3행: 헤더 (파란 글자, 굵게, 회색 배경 유지) ----
  const HEADER_ROW = 3;
  const headerRow = ws.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true, color: HEADER_BLUE };
    cell.fill = GREY_FILL;
    cell.border = CELL_BORDER;
  });
  headerRow.height = 20;

  // ---- 데이터 행 ----
  const finalRows = result.kept.concat(result.moved);
  finalRows.forEach((row, i) => {
    const r = HEADER_ROW + 1 + i;
    const excelRow = ws.getRow(r);
    const isMoved = i >= result.kept.length;      // moved(V, 회색) 행
    const isStripe = !isMoved && i % 2 === 1;      // kept 행끼리만 한 줄씩 옅은 배경
    const values = [row.compute6, row.blNo, row.bt, row.customer, row.pol, row.via, row.pod, row.del, row.notify, row.collect ? "COLLECT" : null];
    values.forEach((v, c) => {
      const cell = excelRow.getCell(c + 1);
      cell.value = v;
      cell.font = { name: FONT_NAME, size: FONT_SIZE, color: DATA_BLACK };
      cell.border = CELL_BORDER;
      if (isStripe) cell.fill = STRIPE_FILL;
    });
    if (isMoved) {
      for (let c = 1; c <= headers.length; c++) excelRow.getCell(c).fill = GREY_FILL;
    }
    if (row.collect) {
      const cc = excelRow.getCell(10);
      cc.font = { name: FONT_NAME, size: FONT_SIZE, bold: true, color: DATA_BLACK };
      cc.fill = YELLOW_FILL;
    }
    excelRow.height = 15;
  });

  // ---- 체크리스트 (K열, 헤더+2행부터) ----
  const checklistStartRow = HEADER_ROW + 2;
  BL_LIST_CHECKLIST_ITEMS.forEach((item, idx) => {
    const r = checklistStartRow + idx;
    const cell = ws.getCell(r, 11);
    cell.value = item;
    cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true };
    if (!ws.getRow(r).height) ws.getRow(r).height = 15;
    if (item === "SYSMAIL") {
      const mailCell = ws.getCell(r, 12);
      mailCell.value = BL_LIST_SYSMAIL_ADDRESS;
      mailCell.font = { name: FONT_NAME, size: FONT_SIZE };
    }
  });

  // 혹시 데이터 행보다 체크리스트가 더 아래로 내려가서 행 높이가 비어있는 경우 보정
  const lastRow = Math.max(HEADER_ROW + finalRows.length, checklistStartRow + BL_LIST_CHECKLIST_ITEMS.length - 1);
  for (let r = 1; r <= lastRow; r++) {
    if (!ws.getRow(r).height) ws.getRow(r).height = 15;
  }

  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.title.replace(/[\/\\:*?"<>|]/g, "_") + ".xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  renderExcelTool();
}

/* ---------- 화면 렌더링 ---------- */

function buildBlListHtml() {
  let html = `<div class="hint" style="margin-bottom:14px;">수입 마감할 때 만드는 비엘 리스트를 자동으로 만들어줘요. ① 원본 비엘 리스트(Agenteam 추출)와 ② Customer Name 추출 파일 두 개를 올려주세요.</div>`;

  html += `<div style="display:flex; gap:14px; flex-wrap:wrap;">`;

  html += `<div style="flex:1; min-width:240px;">
    <div style="font-size:13px;font-weight:bold;color:#4b5563;margin-bottom:6px;">① 비엘 리스트 원본</div>
    <label class="excel-upload-box" id="blListUploadBox1" style="padding:22px 14px;">
      <input type="file" id="blListFileInput1" accept=".xlsx,.xls" onchange="handleBlListFile1(event)">
      <div class="excel-upload-icon">📄</div>
      <div class="excel-upload-label">원본 비엘 리스트 올리기</div>
      <div class="excel-upload-sub">Agenteam 등에서 추출한 원본 (.xlsx)</div>
    </label>
    ${blListState.file1Name ? `<div class="excel-file-chip">📎 ${escapeHtml(blListState.file1Name)} <button onclick="clearBlListFile1()">✕</button></div>` : ""}
  </div>`;

  html += `<div style="flex:1; min-width:240px;">
    <div style="font-size:13px;font-weight:bold;color:#4b5563;margin-bottom:6px;">② Customer Name 추출 파일</div>
    <label class="excel-upload-box" id="blListUploadBox2" style="padding:22px 14px;">
      <input type="file" id="blListFileInput2" accept=".xlsx,.xls" onchange="handleBlListFile2(event)">
      <div class="excel-upload-icon">📄</div>
      <div class="excel-upload-label">Customer Name 파일 올리기</div>
      <div class="excel-upload-sub">B/L No · Customer Name 컬럼이 있는 파일</div>
    </label>
    ${blListState.file2Name ? `<div class="excel-file-chip">📎 ${escapeHtml(blListState.file2Name)} <button onclick="clearBlListFile2()">✕</button></div>` : ""}
  </div>`;

  html += `</div>`;

  if (blListState.headerMismatch && blListState.headerMismatch.length) {
    html += `<div class="excel-warning-box" style="margin-top:16px;">
      <div class="excel-warning-title">⚠️ 원본 파일 컬럼 위치가 예상과 달라요</div>
      아래 컬럼들이 평소 양식과 다른 자리에 있어요. 결과가 정확한지 꼭 확인해주세요:
      <ul style="margin:8px 0 0 18px;">
        ${blListState.headerMismatch.map((m) => `<li>${m.col}열: "${escapeHtml(String(m.actual || "(비어있음)"))}" (예상: "${m.expected}")</li>`).join("")}
      </ul>
    </div>`;
  }

  html += `<div class="section-title" style="margin-top:20px;">📝 안내 문구에 들어갈 정보</div>
  <div class="hint" style="margin-bottom:8px;">파일 맨 위 두 줄(A~E 병합)에 들어갈 내용이에요. 선명/항차와 BL 건수는 자동으로 채워져요.</div>
  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:10px;">
    <input type="text" id="blListServiceName" placeholder="서비스명 (예: KCI)" value="${escapeHtml(blListState.serviceName)}" oninput="blListState.serviceName=this.value">
    <input type="text" id="blListVesselName" placeholder="모선명 (예: INTERASIA ENGAGE)" value="${escapeHtml(blListState.vesselName)}" oninput="blListState.vesselName=this.value">
    <input type="text" id="blListArrivalDate" placeholder="입항일 (예: 08/16)" value="${escapeHtml(blListState.arrivalDate)}" oninput="blListState.arrivalDate=this.value">
    <input type="text" id="blListCallSign" placeholder="CALL SIGN (예: 9V8377)" value="${escapeHtml(blListState.callSign)}" oninput="blListState.callSign=this.value">
    <input type="text" id="blListArrivalCount" placeholder="입항 횟수 (예: 007)" value="${escapeHtml(blListState.arrivalCount)}" oninput="blListState.arrivalCount=this.value">
    <input type="text" id="blListMrn" placeholder="모선 MRN (예: 26IALKIG71I)" value="${escapeHtml(blListState.mrnRaw)}" oninput="blListState.mrnRaw=this.value">
  </div>`;

  html += `<button class="btn generate-btn full" style="margin-top:16px;" onclick="generateBlListResult()">🧾 결과 확인하기</button>`;

  const result = blListState.result;
  if (result) {
    html += `<div class="excel-question-box" style="margin-top:16px;">✅ 처리 완료 — 선명/항차 <b>${escapeHtml(result.title)}</b>, 최종 BL 건수 <b>${result.blCount}건</b></div>`;

    html += `<div class="excel-result-summary">
      <div class="excel-result-stat">원본 데이터 <b>${result.totalSourceRows}</b>건</div>
      <div class="excel-result-stat">삭제됨(A/C) <b>${result.deletedCount}</b>건</div>
      <div class="excel-result-stat">맨 아래 이동+회색(V) <b>${result.movedCount}</b>건</div>
      <div class="excel-result-stat">COLLECT 표시 <b>${result.collectList.length}</b>건</div>
      <div class="excel-result-stat">최종 BL(넘버링) <b>${result.blCount}</b>건</div>
    </div>`;

    if (!result.hasCustomerFile) {
      html += `<div class="excel-warning-box"><div class="excel-warning-title">⚠️ Customer Name 파일이 없어요</div>Customer Name 열이 전부 비어있는 채로 만들어져요. ②번 파일을 올려주세요.</div>`;
    } else if (result.unmatchedList.length) {
      html += `<div class="excel-warning-box">
        <div class="excel-warning-title">⚠️ Customer Name 매칭 안 된 B/L ${result.unmatchedList.length}건</div>
        아래 B/L 번호는 Customer Name 파일에서 못 찾았어요. 두 파일의 B/L No가 맞는지 확인해주세요:
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table"><thead><tr><th>B/L Number</th></tr></thead>
          <tbody>${result.unmatchedList.map((b) => `<tr><td>${escapeHtml(b)}</td></tr>`).join("")}</tbody></table>
        </div>
      </div>`;
    }

    if (result.deletedList.length) {
      html += `<div class="excel-warning-box">
        <div class="excel-warning-title">🗑️ 삭제된 B/L (B/T = A 또는 C) ${result.deletedList.length}건</div>
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table"><thead><tr><th>B/L Number</th></tr></thead>
          <tbody>${result.deletedList.map((b) => `<tr><td>${escapeHtml(b)}</td></tr>`).join("")}</tbody></table>
        </div>
      </div>`;
    }

    if (result.collectList.length) {
      html += `<div class="excel-warning-box">
        <div class="excel-warning-title">🟡 COLLECT 표시된 B/L ${result.collectList.length}건 — 운임 프리즘 전송 금지!, A/N 발송 주소 유의!</div>
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table"><thead><tr><th>B/L Number</th></tr></thead>
          <tbody>${result.collectList.map((b) => `<tr><td>${escapeHtml(b)}</td></tr>`).join("")}</tbody></table>
        </div>
      </div>`;
    }

    html += `<button class="btn generate-btn full" style="margin-top:16px;" onclick="downloadBlListExcel()">⬇ 엑셀 다운로드</button>`;
  }

  return html;
}

function attachBlListHandlers() {
  [["blListUploadBox1", processBlListFile1], ["blListUploadBox2", processBlListFile2]].forEach(([id, handler]) => {
    const box = document.getElementById(id);
    if (!box) return;
    box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("dragover"); });
    box.addEventListener("dragleave", () => box.classList.remove("dragover"));
    box.addEventListener("drop", (e) => {
      e.preventDefault();
      box.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]);
    });
  });
}
