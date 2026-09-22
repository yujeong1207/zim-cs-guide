/* =========================================================================
   💸 삼국간 운임지불 메시지
   - 삼국간 운임을 한국에서 받았을 때, 도착지에 "운임 받았다"고 알리는 메일 본문을 만들어줘요.
   - 시스템에서 받은 엑셀을 올리면 필요한 열(B/L No, Vessel, Voyage, Leg, POL, POD, Currency, Amount)만
     열 이름으로 찾아서 쓰고(열 순서/다른 열이 섞여 있어도 OK), 3줄 요약표(M/VSL, POP, Total Customer Paid)와
     아래 상세표를 자동으로 채워요. STR / S/ 는 직접 입력(STR은 POL / POD로 미리 채워줌).
   - 복사하면 표까지 그대로 메일에 붙여넣어져요 (guide_tabs_mail.js 의 복사 함수를 그대로 재사용).
   - 삼국간 탭(guide_triangle.js) 안에서 "💸 운임지불 메시지" 버튼으로 열고 닫아요.
   ========================================================================= */

/* 엑셀에서 찾을 열 (열 이름은 대소문자/띄어쓰기/기호를 무시하고 비교해요: "B/L No" = "BL NO" = "bl_no") */
const TFM_FIELDS = [
  { key: "bl", label: "B/L No", aliases: ["blno", "blnumber", "blnum", "bl"] },
  { key: "vessel", label: "Vessel", aliases: ["vessel", "vesselname", "vsl", "vslname"] },
  { key: "voyage", label: "Voyage", aliases: ["voyage", "voyageno", "voy", "voyno"] },
  { key: "leg", label: "Leg", aliases: ["leg"] },
  { key: "pol", label: "POL", aliases: ["pol", "portofloading", "loadingport"] },
  { key: "pod", label: "POD", aliases: ["pod", "portofdischarge", "dischargeport", "dischargingport"] },
  { key: "currency", label: "Currency", aliases: ["currency", "curr", "ccy", "currencycode"] },
  { key: "amount", label: "Amount", aliases: ["amount", "amt"] },
];
/* 필수는 아니지만 있으면 자동으로 활용하는 열: Shipper(있으면 S/ 자동 채움), POP(있으면 KRSEL과 다를 때 경고) */
const TFM_OPTIONAL_FIELDS = [
  { key: "shipper", aliases: ["shipper"] },
  { key: "pop", aliases: ["pop", "portofpayment"] },
];
const TFM_POP = "KRSEL"; // 고정
const TFM_INTRO_1 = "Dear all,";
const TFM_INTRO_2 = "We confirm that we have collected O/FRT from the local shipper for following shipment at our side.";

function tfmFreshState() {
  return {
    open: false,
    fileName: "",
    aoa: null,        // 엑셀 원본 (2차원 배열)
    headerRow: -1,    // 열 이름이 있는 행 번호
    headers: [],      // 그 행의 열 이름들
    map: {},          // { bl: 열번호, vessel: 열번호, ... }
    missing: [],      // 못 찾은 필드 key 목록
    rows: [],         // 읽어낸 데이터 행
    skipped: 0,       // 금액을 못 읽어서 건너뛴 행 수
    dupBls: [],       // 같은 B/L이 두 번 이상 나온 것
    groups: [],       // 같은 배/항차/Leg/POD 끼리 묶음
    active: 0,        // 지금 보고 있는 묶음
    shipper: "",      // S/ (화주)
    strByKey: {},     // 묶음별로 고친 STR
  };
}
let tfmState = tfmFreshState();

function tfmNorm(v) {
  return String(v === null || v === undefined ? "" : v).toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}
function tfmStr(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}
function tfmParseAmount(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = tfmStr(v);
  if (!/\d/.test(s)) return null;
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : null;
}
function tfmFmtNumber(n) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function tfmFmtAmountCell(n) {
  return String(Math.round(n * 100) / 100); // 엑셀에 적힌 대로 (4300 → "4300")
}

/* ---------------------------------------------------------------- 열기/닫기 */
function toggleTriangleFreightPanel() {
  tfmState.open = !tfmState.open;
  renderTriangleFreightPanel();
}

function renderTriangleFreightPanel() {
  const panel = document.getElementById("triangleFreightPanel");
  if (!panel) return;
  if (!tfmState.open) { panel.style.display = "none"; panel.innerHTML = ""; return; }
  panel.style.display = "block";
  panel.innerHTML = `<div class="tfm-panel">
    <div class="tfm-head">
      <span class="tfm-title">💸 삼국간 운임지불 메시지</span>
      <button type="button" class="btn secondary-btn" style="padding:4px 12px;font-size:12px;" onclick="toggleTriangleFreightPanel()">✕ 닫기</button>
    </div>
    <div class="hint" style="margin-bottom:12px;">삼국간 운임을 받았을 때 도착지에 보내는 메일 본문을 만들어줘요. 시스템에서 받은 엑셀을 올리면 <b>표는 자동으로 채워지고</b>, STR / S/ 만 확인해서 복사하면 돼요.</div>
    <label class="excel-upload-box" id="tfmUploadBox" style="padding:18px 14px;">
      <input type="file" id="tfmFileInput" accept=".xlsx,.xls,.csv" onchange="handleTfmFile(event)">
      <div class="excel-upload-icon">💸</div>
      <div class="excel-upload-label">운임 엑셀 올리기</div>
      <div class="excel-upload-sub">B/L No · Vessel · Voyage · Leg · POL · POD · Currency · Amount 열이 있는 파일 (.xlsx) — 다른 열이 섞여 있어도 괜찮아요</div>
    </label>
    <div id="tfmBody"></div>
  </div>`;
  const box = document.getElementById("tfmUploadBox");
  if (box) {
    box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("dragover"); });
    box.addEventListener("dragleave", () => box.classList.remove("dragover"));
    box.addEventListener("drop", (e) => {
      e.preventDefault();
      box.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) processTfmFile(e.dataTransfer.files[0]);
    });
  }
  renderTfmBody();
}

/* ---------------------------------------------------------------- 파일 읽기 */
function handleTfmFile(event) {
  const f = event.target.files && event.target.files[0];
  if (f) processTfmFile(f);
  event.target.value = ""; // 같은 파일을 다시 올려도 반응하도록
}

function processTfmFile(file) {
  if (typeof XLSX === "undefined") { alert("엑셀을 읽는 도구(XLSX)를 불러오지 못했어요. 새로고침 후 다시 시도해주세요."); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      loadTfmAoa(aoa, file.name);
    } catch (err) {
      alert("엑셀 파일을 읽는 중 문제가 생겼어요. 파일 형식을 확인해주세요.\n(" + err.message + ")");
    }
  };
  reader.readAsArrayBuffer(file);
}

/* 열 이름이 있는 행을 찾음: 앞쪽 40줄 중 우리가 찾는 열 이름이 가장 많이 들어있는 줄 */
function tfmDetectHeader(aoa) {
  let best = { row: -1, map: {}, count: 0 };
  const limit = Math.min(aoa.length, 40);
  for (let r = 0; r < limit; r++) {
    const row = aoa[r] || [];
    const map = {};
    row.forEach((cell, c) => {
      const n = tfmNorm(cell);
      if (!n) return;
      TFM_FIELDS.forEach((f) => { if (map[f.key] === undefined && f.aliases.indexOf(n) !== -1) map[f.key] = c; });
      TFM_OPTIONAL_FIELDS.forEach((f) => { if (map[f.key] === undefined && f.aliases.indexOf(n) !== -1) map[f.key] = c; });
    });
    const count = Object.keys(map).length;
    if (count > best.count) best = { row: r, map, count };
  }
  if (best.count >= 3) return best;
  // 거의 못 찾았으면: 값이 제일 많이 채워진 줄을 열 이름 줄로 보고, 열은 직접 고르게 함
  let rowIdx = 0, most = -1;
  for (let r = 0; r < limit; r++) {
    const filled = (aoa[r] || []).filter((x) => tfmStr(x) !== "").length;
    if (filled > most) { most = filled; rowIdx = r; }
  }
  return { row: rowIdx, map: {}, count: 0 };
}

function loadTfmAoa(aoa, fileName) {
  const keepShipper = tfmState.shipper;
  tfmState = tfmFreshState();
  tfmState.open = true;
  tfmState.shipper = keepShipper; // 같은 화주로 이어서 만드는 경우가 많아서 S/ 는 남겨둠
  tfmState.fileName = fileName;
  tfmState.aoa = aoa;

  const found = tfmDetectHeader(aoa);
  tfmState.headerRow = found.row;
  tfmState.headers = (aoa[found.row] || []).map((h) => tfmStr(h));
  tfmState.map = found.map;
  tfmRecompute();

  if (!tfmState.shipper.trim() && tfmState.groups.length > 0) {
    const allShippers = Array.from(new Set(tfmState.groups.flatMap((g) => g.shippers).filter(Boolean)));
    if (allShippers.length === 1) tfmState.shipper = allShippers[0];
  }
  renderTfmBody();
}

/* 열 매핑이 정해지면 데이터 행 → 묶음까지 다시 계산 */
function tfmRecompute() {
  const st = tfmState;
  st.missing = TFM_FIELDS.filter((f) => st.map[f.key] === undefined || st.map[f.key] === null || st.map[f.key] === "").map((f) => f.key);
  st.rows = []; st.groups = []; st.skipped = 0; st.dupBls = []; st.active = 0;
  if (st.missing.length > 0 || !st.aoa) return;

  const rows = [];
  for (let r = st.headerRow + 1; r < st.aoa.length; r++) {
    const row = st.aoa[r] || [];
    const get = (k) => row[st.map[k]];
    const bl = tfmStr(get("bl"));
    if (!bl) continue;
    if (/^(total|subtotal|grand ?total|합계|소계)$/i.test(bl)) continue;
    const amount = tfmParseAmount(get("amount"));
    if (amount === null) { st.skipped++; continue; }
    rows.push({
      bl, amount,
      vessel: tfmStr(get("vessel")), voyage: tfmStr(get("voyage")), leg: tfmStr(get("leg")),
      pol: tfmStr(get("pol")), pod: tfmStr(get("pod")), currency: tfmStr(get("currency")).toUpperCase(),
      shipper: st.map.shipper !== undefined ? tfmStr(get("shipper")) : "",
      pop: st.map.pop !== undefined ? tfmStr(get("pop")).toUpperCase() : "",
    });
  }
  st.rows = rows;

  const seen = {}, dups = [];
  rows.forEach((r) => { if (seen[r.bl]) { if (dups.indexOf(r.bl) === -1) dups.push(r.bl); } else seen[r.bl] = true; });
  st.dupBls = dups;
  st.groups = tfmBuildGroups(rows);
}

function tfmBuildGroups(rows) {
  const order = [], byKey = {};
  rows.forEach((r) => {
    const key = [r.vessel, r.voyage, r.leg, r.pod].map((x) => String(x).trim().toUpperCase()).join("|");
    if (!byKey[key]) { byKey[key] = { key, rows: [] }; order.push(key); }
    byKey[key].rows.push(r);
  });
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
  return order.map((key) => {
    const g = byKey[key];
    const first = g.rows[0];
    const cents = {};
    g.rows.forEach((r) => { cents[r.currency] = (cents[r.currency] || 0) + Math.round(r.amount * 100); });
    const totals = {};
    Object.keys(cents).forEach((c) => { totals[c] = cents[c] / 100; });
    const vsl = [first.vessel, first.voyage, first.leg].filter(Boolean).join("/");
    const shippers = uniq(g.rows.map((r) => r.shipper));
    const pops = uniq(g.rows.map((r) => r.pop));
    return {
      key,
      rows: g.rows,
      mvsl: vsl + (first.pod ? " - " + first.pod : ""),
      defaultStr: uniq(g.rows.map((r) => r.pol)).join(", ") + " / " + uniq(g.rows.map((r) => r.pod)).join(", "),
      totals,
      currencies: Object.keys(totals),
      shippers,
      pops,
    };
  });
}

function tfmTotalText(group) {
  return group.currencies.map((c) => (c ? c + " " : "") + tfmFmtNumber(group.totals[c])).join(" + ");
}

function tfmActiveGroup() {
  return tfmState.groups[tfmState.active] || null;
}

function tfmCurrentStr(group) {
  return Object.prototype.hasOwnProperty.call(tfmState.strByKey, group.key) ? tfmState.strByKey[group.key] : group.defaultStr;
}

/* ---------------------------------------------------------------- 메시지 만들기 */
function tfmBuildMessage(group, shipper, strText) {
  const cell = "border:1px solid #000000;padding:3px 8px;font-size:11pt;text-align:left;vertical-align:middle;";
  const gray = "background:#e7e6e6;";
  const p = "margin:0 0 12px 0;";
  const totalText = tfmTotalText(group);

  const summaryRows = [
    ["M/VSL", group.mvsl, gray],
    ["POP", TFM_POP, ""],
    ["Total Customer Paid", totalText, gray],
  ];
  let summaryHtml = '<table style="border-collapse:collapse;margin:0 0 16px 0;width:520px;">';
  summaryRows.forEach((r) => {
    summaryHtml += "<tr>"
      + '<td style="' + cell + r[2] + 'width:200px;">' + escapeHtml(r[0]) + "</td>"
      + '<td style="' + cell + r[2] + '">' + escapeHtml(r[1]) + "</td></tr>";
  });
  summaryHtml += "</table>";

  const cols = ["B/L No", "Vessel", "Voyage", "Leg", "POL", "POD", "Currency", "Amount"];
  let detailHtml = '<table style="border-collapse:collapse;margin:0;">';
  detailHtml += "<tr>" + cols.map((c) => '<td style="' + cell + 'background:#d9d9d9;font-weight:bold;">' + escapeHtml(c) + "</td>").join("") + "</tr>";
  group.rows.forEach((r) => {
    const vals = [r.bl, r.vessel, r.voyage, r.leg, r.pol, r.pod, r.currency, tfmFmtAmountCell(r.amount)];
    detailHtml += "<tr>" + vals.map((v) => '<td style="' + cell + '">' + escapeHtml(v) + "</td>").join("") + "</tr>";
  });
  detailHtml += "</table>";

  const html = "<div>"
    + '<p style="' + p + '">' + escapeHtml(TFM_INTRO_1) + "</p>"
    + '<p style="' + p + '">' + escapeHtml(TFM_INTRO_2) + "</p>"
    + '<p style="' + p + '">STR : ' + escapeHtml(strText) + "<br>S/ " + escapeHtml(shipper) + "</p>"
    + summaryHtml + detailHtml + "</div>";

  const plain = [
    TFM_INTRO_1, "", TFM_INTRO_2, "",
    "STR : " + strText, "S/ " + shipper, "",
    "M/VSL\t" + group.mvsl, "POP\t" + TFM_POP, "Total Customer Paid\t" + totalText, "",
    cols.join("\t"),
  ].concat(group.rows.map((r) => [r.bl, r.vessel, r.voyage, r.leg, r.pol, r.pod, r.currency, tfmFmtAmountCell(r.amount)].join("\t"))).join("\n");

  return { html, plain };
}

/* ---------------------------------------------------------------- 화면 */
function renderTfmBody() {
  const body = document.getElementById("tfmBody");
  if (!body) return;
  const st = tfmState;
  if (!st.aoa) { body.innerHTML = ""; return; }

  let html = '<div class="excel-file-chip" style="margin-top:10px;">📎 ' + escapeHtml(st.fileName) + ' <button type="button" onclick="clearTfmFile()">✕</button></div>';

  // 못 찾은 열이 있으면: 직접 고르게 함
  if (st.missing.length > 0) {
    const opts = (selected) => '<option value="">선택</option>' + st.headers.map((h, i) =>
      h ? '<option value="' + i + '"' + (String(selected) === String(i) ? " selected" : "") + ">" + escapeHtml(h) + "</option>" : "").join("");
    html += '<div class="excel-question-box" style="margin-top:12px;">⚠️ 엑셀에서 <b>' + st.missing.map((k) => escapeHtml(TFM_FIELDS.find((f) => f.key === k).label)).join(", ")
      + '</b> 열을 자동으로 찾지 못했어요. 아래에서 알맞은 열을 골라주세요.'
      + '<div class="tfm-map-grid">'
      + TFM_FIELDS.filter((f) => st.missing.indexOf(f.key) !== -1).map((f) =>
        '<label class="tfm-map-item"><span>' + escapeHtml(f.label) + '</span><select id="tfmMap_' + f.key + '">' + opts(st.map[f.key]) + "</select></label>").join("")
      + '</div><button type="button" class="btn generate-btn" style="padding:6px 14px;font-size:13px;margin-top:8px;" onclick="applyTfmMapping()">이 열로 적용</button>'
      + (st.headers.filter(Boolean).length === 0 ? '<div style="margin-top:6px;color:#92400e;">열 이름을 읽지 못했어요. 파일 첫 줄에 열 이름이 있는지 확인해주세요.</div>' : "")
      + "</div>";
    body.innerHTML = html;
    return;
  }

  if (st.groups.length === 0) {
    html += '<div class="excel-question-box" style="margin-top:12px;">⚠️ 읽을 수 있는 데이터 행이 없어요. B/L No와 Amount 값이 들어있는지 확인해주세요.'
      + (st.skipped ? " (금액을 읽지 못해 건너뛴 행: " + st.skipped + "개)" : "") + "</div>";
    body.innerHTML = html;
    return;
  }

  // 요약 + 경고
  const g = tfmActiveGroup();
  const totalCount = st.rows.length;
  html += '<div class="tfm-summary">' + totalCount + '건 읽었어요' + (st.groups.length > 1 ? " · 배/항차/POD가 달라서 " + st.groups.length + "개 메시지로 나눴어요" : "") + "</div>";
  const warns = [];
  if (st.skipped) warns.push("금액을 읽지 못해 건너뛴 행이 " + st.skipped + "개 있어요. 엑셀을 확인해주세요.");
  if (st.dupBls.length) warns.push("같은 B/L이 두 번 이상 들어있어요: " + st.dupBls.slice(0, 5).join(", ") + (st.dupBls.length > 5 ? " 외 " + (st.dupBls.length - 5) + "건" : "") + " (합계에 중복으로 더해졌을 수 있어요)");
  st.groups.forEach((gr) => { if (gr.currencies.length > 1) warns.push("[" + gr.mvsl + "] 통화가 여러 개 섞여 있어요 (" + gr.currencies.join(", ") + "). 통화별 합계를 함께 표시했으니 확인해주세요."); });
  st.groups.forEach((gr) => { if (gr.shippers.length > 1) warns.push("[" + gr.mvsl + "] 엑셀의 Shipper 값이 여러 개예요 (" + gr.shippers.join(", ") + "). S/에 어떤 걸 쓸지 확인해주세요."); });
  st.groups.forEach((gr) => { const wrong = gr.pops.filter((p) => p && p !== TFM_POP); if (wrong.length) warns.push("[" + gr.mvsl + "] 엑셀의 POP 값이 " + TFM_POP + "가 아니에요 (" + wrong.join(", ") + "). 메시지의 POP은 " + TFM_POP + "로 고정돼 있으니 확인해주세요."); });
  const blankCur = st.groups.some((gr) => gr.currencies.indexOf("") !== -1);
  if (blankCur) warns.push("Currency가 비어 있는 행이 있어요.");
  if (warns.length) html += '<div class="tfm-warn">' + warns.map((w) => "⚠️ " + escapeHtml(w)).join("<br>") + "</div>";

  // 묶음이 여러 개면 고르는 탭
  if (st.groups.length > 1) {
    html += '<div class="tfm-group-tabs">' + st.groups.map((gr, i) =>
      '<button type="button" class="tfm-group-tab' + (i === st.active ? " active" : "") + '" onclick="setTfmGroup(' + i + ')">' + escapeHtml(gr.mvsl) + " (" + gr.rows.length + "건)</button>").join("") + "</div>";
  }

  html += '<div class="tfm-fields">'
    + '<div><div class="label">STR <span class="tfm-sub">(표의 POL / POD로 미리 채웠어요)</span></div><input id="tfmStrInput" value="' + escapeHtml(tfmCurrentStr(g)) + '" oninput="tfmOnStrInput(this.value)"></div>'
    + '<div><div class="label">S/ <span class="tfm-sub">' + (g.shippers.length === 1 ? "(엑셀의 Shipper 값으로 자동으로 채웠어요 — 고칠 수 있어요)" : "(화주 — 직접 입력)") + '</span></div><input id="tfmShipperInput" placeholder="예: LX PANTOS VIETNAM CO., LTD" value="' + escapeHtml(st.shipper) + '" oninput="tfmOnShipperInput(this.value)"></div>'
    + "</div>";

  html += '<div class="tfm-preview-head"><span>미리보기</span><button type="button" class="btn generate-btn" style="padding:6px 16px;font-size:13px;" onclick="copyTfmMessage()">📋 메시지 복사 (표 포함)</button></div>'
    + '<div id="tfmPreview" class="tfm-preview"></div>';

  body.innerHTML = html;
  updateTfmPreview();
}

function updateTfmPreview() {
  const g = tfmActiveGroup();
  const el = document.getElementById("tfmPreview");
  if (!g || !el) return;
  el.innerHTML = tfmBuildMessage(g, tfmState.shipper, tfmCurrentStr(g)).html;
}

function tfmOnStrInput(v) {
  const g = tfmActiveGroup();
  if (!g) return;
  tfmState.strByKey[g.key] = v;
  updateTfmPreview();
}

function tfmOnShipperInput(v) {
  tfmState.shipper = v;
  updateTfmPreview();
}

function setTfmGroup(i) {
  tfmState.active = i;
  renderTfmBody();
}

function applyTfmMapping() {
  const st = tfmState;
  st.missing.forEach((k) => {
    const sel = document.getElementById("tfmMap_" + k);
    if (sel && sel.value !== "") st.map[k] = Number(sel.value);
  });
  tfmRecompute();
  if (st.missing.length > 0) alert("아직 못 고른 열이 있어요: " + st.missing.map((k) => TFM_FIELDS.find((f) => f.key === k).label).join(", "));
  renderTfmBody();
}

function clearTfmFile() {
  const keepShipper = tfmState.shipper;
  tfmState = tfmFreshState();
  tfmState.open = true;
  tfmState.shipper = keepShipper;
  renderTfmBody();
}

/* ---------------------------------------------------------------- 복사 (메일 템플릿 복사와 같은 방식) */
function copyTfmMessage() {
  const g = tfmActiveGroup();
  if (!g) return;
  if (!tfmState.shipper.trim() && !confirm("S/(화주)가 비어 있어요. 그대로 복사할까요?")) return;

  const msg = tfmBuildMessage(g, tfmState.shipper, tfmCurrentStr(g));
  const fontWrappedHtml = wrapEmailHtmlFont(msg.html);
  const okText = "복사 완료 💖 (아웃룩/지메일에 붙여넣으면 표 형태 그대로 들어갑니다)";

  if (copyHtmlViaSelection(fontWrappedHtml)) {
    alert(okText);
  } else if (navigator.clipboard && window.ClipboardItem) {
    const item = new ClipboardItem({
      "text/html": new Blob([fontWrappedHtml], { type: "text/html" }),
      "text/plain": new Blob([msg.plain], { type: "text/plain" }),
    });
    navigator.clipboard.write([item]).then(() => alert(okText)).catch(() => legacyCopy(msg.plain));
  } else {
    legacyCopy(msg.plain);
  }
}
