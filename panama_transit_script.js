/* =========================================================================
   🛳️ 파나마 통과 현황 (수출 CS용)
   위임장/오비엘/모선일정과 완전히 같은 방식의 실시간 공유 기능이에요.
   팀원 누구나 등록·수정·삭제하면 다른 사람 화면에도 바로 반영돼요.
   부산 출항일 기준 월별로 묶어서 보여주고, 소요일 25일 이상은 강조,
   이미 통과한 항차는 흐리게 표시해요 (모두 오늘 날짜 기준 자동 계산).
   ========================================================================= */

const PANAMA_TRANSIT_COLLECTION = "panama_transit"; // Firestore 컬렉션 이름
const PANAMA_LONG_TRANSIT_DAYS = 25; // 이 값 이상 걸리면 강조 표시

let PANAMA_TRANSITS = [];
let panamaTransitUnsubscribe = null;
let expandedPanamaMonths = new Set();

/* 부산 출항일 → 파나마 통과(예정)일까지 며칠 걸렸는지 계산 */
function panamaTransitDays(departureDate, transitDate) {
  if (!departureDate || !transitDate) return null;
  const d1 = new Date(departureDate + "T00:00:00");
  const d2 = new Date(transitDate + "T00:00:00");
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  return Math.round((d2 - d1) / 86400000);
}

/* 오늘 기준으로 이미 통과했는지 (통과일이 오늘보다 이전이면 완료로 봄) */
function isPanamaTransitPast(transitDate) {
  if (!transitDate) return false;
  return transitDate < todayStr();
}

/* "YYYY-MM-DD" → "M/D" 짧은 표시 */
function formatPanamaShortDate(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr || "-";
  return Number(m[2]) + "/" + Number(m[3]);
}

async function fetchPanamaTransitListFromServer() {
  try {
    await window.fbReady;
    const snapshot = await window.fbDb.collection(PANAMA_TRANSIT_COLLECTION).get();
    return snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        line: d.line || "",
        vesselName: d.vesselName || "",
        code: d.code || "",
        voyage: d.voyage || "",
        busanDeparture: d.busanDeparture || "",
        panamaTransit: d.panamaTransit || "",
        unconfirmed: d.unconfirmed === true,
      };
    });
  } catch (err) {
    console.error("파나마 통과 현황 서버 목록 불러오기 실패:", err);
    return null;
  }
}

/* entry.id가 있으면 수정, 없으면 새로 등록 */
async function submitPanamaTransitToServer(entry) {
  try {
    await window.fbReady;
    const payload = {
      line: entry.line || "",
      vesselName: entry.vesselName || "",
      code: entry.code || "",
      voyage: entry.voyage || "",
      busanDeparture: entry.busanDeparture || "",
      panamaTransit: entry.panamaTransit || "",
      unconfirmed: entry.unconfirmed === true,
    };
    if (entry.id) {
      await window.fbDb.collection(PANAMA_TRANSIT_COLLECTION).doc(entry.id).update(payload);
    } else {
      await window.fbDb.collection(PANAMA_TRANSIT_COLLECTION).add(payload);
    }
    return { ok: true };
  } catch (err) {
    console.error("파나마 통과 현황 등록/수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}

async function deletePanamaTransitFromServer(id) {
  try {
    await window.fbReady;
    await window.fbDb.collection(PANAMA_TRANSIT_COLLECTION).doc(id).delete();
    return { ok: true };
  } catch (err) {
    console.error("파나마 통과 현황 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* 탭을 열 때 호출 - 처음 한 번만 실시간 구독 시작, 팀원 누가 등록/수정/삭제하면 자동 반영 */
async function loadPanamaTransitTab(forceRefresh) {
  const wrap = document.getElementById("panamaTransitMonthsWrap");
  if (liveSubscribed.panamaTransit && !forceRefresh) { renderPanamaTransitTab(); return; }
  if (forceRefresh && panamaTransitUnsubscribe) { panamaTransitUnsubscribe(); panamaTransitUnsubscribe = null; liveSubscribed.panamaTransit = false; }
  if (wrap && !PANAMA_TRANSITS.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 파나마 통과 현황을 불러오는 중이에요...</div>';
  await window.fbReady;
  panamaTransitUnsubscribe = window.fbDb.collection(PANAMA_TRANSIT_COLLECTION).onSnapshot(
    (snapshot) => {
      PANAMA_TRANSITS = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          line: d.line || "",
          vesselName: d.vesselName || "",
          code: d.code || "",
          voyage: d.voyage || "",
          busanDeparture: d.busanDeparture || "",
          panamaTransit: d.panamaTransit || "",
          unconfirmed: d.unconfirmed === true,
        };
      });
      renderPanamaTransitTab();
    },
    (err) => {
      console.error("파나마 통과 현황 실시간 구독 실패:", err);
      if (wrap && !PANAMA_TRANSITS.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadPanamaTransitTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.panamaTransit = true;
  liveTabUnsubscribers.panamaTransit = () => { if (panamaTransitUnsubscribe) { panamaTransitUnsubscribe(); panamaTransitUnsubscribe = null; liveSubscribed.panamaTransit = false; } };
}

/* 처음에 주신 17건 원본 데이터 - "초기 데이터 등록" 버튼 한 번 누르면 이걸 그대로 Firestore에 올려요.
   연도는 시스템 기준 현재 연도(2026)로 넣었어요. */
const PANAMA_TRANSIT_SEED_DATA = [
  { line: "ZSL", vesselName: "ROTTERDAM", code: "ZTD", voyage: "86E", busanDeparture: "2026-07-17", panamaTransit: "2026-08-23", unconfirmed: false },
  { line: "ZCP", vesselName: "ZIM AMBER", code: "ZA6", voyage: "14E", busanDeparture: "2026-07-18", panamaTransit: "2026-08-09", unconfirmed: false },
  { line: "ZCP", vesselName: "ZIM ARIES", code: "ZA9", voyage: "11E", busanDeparture: "2026-07-18", panamaTransit: "2026-08-16", unconfirmed: false },
  { line: "ZNS", vesselName: "MSC ILLINOIS VII", code: "IIO", voyage: "15E", busanDeparture: "2026-07-23", panamaTransit: "2026-08-11", unconfirmed: false },
  { line: "ZNS", vesselName: "MSC BOSPHORUS", code: "B7P", voyage: "28E", busanDeparture: "2026-07-25", panamaTransit: "2026-08-13", unconfirmed: false },
  { line: "ZSL", vesselName: "MSC RIDA VIII", code: "YYM", voyage: "5E", busanDeparture: "2026-07-28", panamaTransit: "2026-08-21", unconfirmed: false },
  { line: "ZSL", vesselName: "SANTA LINEA", code: "VGX", voyage: "35E", busanDeparture: "2026-07-27", panamaTransit: "2026-08-21", unconfirmed: false },
  { line: "ZCP", vesselName: "ZIM ALEXANDRITE", code: "ZA7", voyage: "7E", busanDeparture: "2026-07-30", panamaTransit: "2026-08-19", unconfirmed: false },
  { line: "ZNS", vesselName: "GSL MYNY", code: "ER1", voyage: "35E", busanDeparture: "2026-07-31", panamaTransit: "2026-08-19", unconfirmed: false },
  { line: "ZCP", vesselName: "ZIM SCORPIO", code: "ZS9", voyage: "10E", busanDeparture: "2026-08-01", panamaTransit: "2026-09-04", unconfirmed: false },
  { line: "ZSL", vesselName: "MSC GREENWICH", code: "GR4", voyage: "9E", busanDeparture: "2026-08-15", panamaTransit: "2026-09-14", unconfirmed: false },
  { line: "ZNS", vesselName: "MSC BRASILIA VII", code: "CP1", voyage: "11E", busanDeparture: "2026-08-18", panamaTransit: "2026-09-14", unconfirmed: false },
  { line: "ZCP", vesselName: "ZIM CORAL", code: "ZIW", voyage: "12E", busanDeparture: "2026-08-18", panamaTransit: "2026-09-06", unconfirmed: false },
  { line: "ZCP", vesselName: "ZIM PEARL", code: "ZP2", voyage: "11E", busanDeparture: "2026-08-21", panamaTransit: "2026-09-13", unconfirmed: true },
  { line: "ZSL", vesselName: "ANTWERP", code: "ZAW", voyage: "81E", busanDeparture: "2026-08-22", panamaTransit: "2026-09-10", unconfirmed: true },
  { line: "ZSL", vesselName: "MSC JAVELIN IX", code: "JN5", voyage: "16E", busanDeparture: "2026-08-25", panamaTransit: "2026-09-12", unconfirmed: false },
  { line: "ZNS", vesselName: "KURE", code: "YVE", voyage: "11E", busanDeparture: "2026-08-27", panamaTransit: "2026-09-15", unconfirmed: false },
];

let panamaSeedBusy = false;

/* "초기 데이터 등록" 버튼 - 위 17건을 한 번에 Firestore로 올림. 목록이 비어있을 때만 버튼이 보여서
   실수로 두 번 눌러 중복 등록되는 걸 방지해요. */
async function seedInitialPanamaTransitData() {
  if (panamaSeedBusy) return;
  if (!confirm("처음에 주신 17건 데이터를 한 번에 등록할까요?")) return;
  panamaSeedBusy = true;
  const btn = document.getElementById("panamaSeedBtn");
  if (btn) { btn.disabled = true; btn.textContent = "등록 중... (0/" + PANAMA_TRANSIT_SEED_DATA.length + ")"; }

  let successCount = 0;
  for (let i = 0; i < PANAMA_TRANSIT_SEED_DATA.length; i++) {
    const result = await submitPanamaTransitToServer(PANAMA_TRANSIT_SEED_DATA[i]);
    if (result.ok) successCount++;
    if (btn) btn.textContent = "등록 중... (" + (i + 1) + "/" + PANAMA_TRANSIT_SEED_DATA.length + ")";
  }

  panamaSeedBusy = false;
  if (successCount < PANAMA_TRANSIT_SEED_DATA.length) {
    alert(successCount + "/" + PANAMA_TRANSIT_SEED_DATA.length + "건만 등록됐어요. 나머지는 네트워크 문제일 수 있어요 - 다시 눌러서 이어서 등록해주세요.");
  } else {
    alert("✅ 17건 모두 등록됐어요!");
  }
  await loadPanamaTransitTab(true);
}

function renderPanamaTransitTab() {
  const wrap = document.getElementById("panamaTransitMonthsWrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (PANAMA_TRANSITS.length === 0) {
    wrap.innerHTML = '<div class="empty-state">등록된 항차가 없어요. 아래 "＋ 항차 추가" 버튼으로 하나씩 등록하시거나,'
      + ' <button class="btn generate-btn" id="panamaSeedBtn" style="margin-top:10px;" onclick="seedInitialPanamaTransitData()">📥 처음 주신 17건 한 번에 등록하기</button>'
      + ' 버튼으로 시작해보세요.</div>';
    return;
  }
  // 부산 출항일 기준으로 월을 자동으로 뽑아서 그룹핑 (모선일정처럼 달을 따로 미리 추가할 필요 없음)
  const monthSet = new Set(PANAMA_TRANSITS.filter((v) => v.busanDeparture).map((v) => v.busanDeparture.slice(0, 7)));
  const months = Array.from(monthSet).sort();
  months.forEach((m) => wrap.appendChild(buildPanamaTransitMonthSection(m)));
}

function buildPanamaTransitMonthSection(month) {
  const rows = PANAMA_TRANSITS.filter((v) => (v.busanDeparture || "").slice(0, 7) === month)
    .slice()
    .sort((a, b) => (a.busanDeparture || "").localeCompare(b.busanDeparture || ""));

  const doneCount = rows.filter((v) => isPanamaTransitPast(v.panamaTransit)).length;
  const allDone = rows.length > 0 && doneCount === rows.length;

  const card = document.createElement("div");
  card.className = "content-card vessel-month-card";
  card.dataset.panamaMonth = month;

  const head = document.createElement("div");
  head.className = "content-card-head";
  head.innerHTML = '<div class="content-card-title">🛳️ ' + escapeHtml(monthLabel(month))
    + ' <span class="resource-folder-count">(' + rows.length + '건 출항' + (allDone ? " · 전체 통과완료" : "") + ')</span></div><div class="content-card-toggle">▾</div>';

  const bodyEl = document.createElement("div");
  bodyEl.className = "content-card-body" + (expandedPanamaMonths.has(month) ? " open" : "");

  const tableWrap = document.createElement("div");
  tableWrap.className = "vessel-table-wrap";
  const table = document.createElement("table");
  table.className = "vessel-table";
  table.innerHTML = "<thead><tr><th>라인</th><th>선명</th><th>코드명</th><th>항차</th><th>부산 출항</th><th>파나마 통과</th><th>소요일</th><th></th></tr></thead>";
  const tbody = document.createElement("tbody");

  rows.forEach((v) => {
    const tr = document.createElement("tr");
    tr.dataset.panamaId = v.id;
    const days = panamaTransitDays(v.busanDeparture, v.panamaTransit);
    if (isPanamaTransitPast(v.panamaTransit)) tr.classList.add("panama-row-done");

    const lineTd = document.createElement("td"); lineTd.textContent = v.line || "-";
    const nameTd = document.createElement("td"); nameTd.textContent = v.vesselName || "-";
    const codeTd = document.createElement("td"); codeTd.className = "vessel-code"; codeTd.textContent = v.code || "-";
    const voyTd = document.createElement("td"); voyTd.textContent = v.voyage || "-";
    const depTd = document.createElement("td"); depTd.textContent = formatPanamaShortDate(v.busanDeparture);

    const transitTd = document.createElement("td");
    transitTd.textContent = formatPanamaShortDate(v.panamaTransit);
    if (v.unconfirmed) {
      const badge = document.createElement("span");
      badge.className = "panama-unconfirmed-badge";
      badge.textContent = "확인필요";
      transitTd.appendChild(document.createTextNode(" "));
      transitTd.appendChild(badge);
    }

    const daysTd = document.createElement("td");
    daysTd.className = "panama-days-cell";
    if (days !== null) {
      if (days >= PANAMA_LONG_TRANSIT_DAYS) {
        const badge = document.createElement("span");
        badge.className = "panama-days-badge";
        badge.textContent = days + "일";
        daysTd.appendChild(badge);
      } else {
        daysTd.textContent = days + "일";
      }
    } else {
      daysTd.textContent = "-";
    }

    const actTd = document.createElement("td");
    actTd.className = "vessel-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn"; editBtn.type = "button"; editBtn.title = "수정"; editBtn.textContent = "✏️";
    editBtn.onclick = () => openPanamaTransitEditor(v.id);
    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn"; delBtn.type = "button"; delBtn.title = "삭제"; delBtn.textContent = "🗑";
    delBtn.onclick = () => deletePanamaTransit(v.id);
    actTd.appendChild(editBtn);
    actTd.appendChild(delBtn);

    tr.appendChild(lineTd);
    tr.appendChild(nameTd);
    tr.appendChild(codeTd);
    tr.appendChild(voyTd);
    tr.appendChild(depTd);
    tr.appendChild(transitTd);
    tr.appendChild(daysTd);
    tr.appendChild(actTd);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  bodyEl.appendChild(tableWrap);

  head.onclick = () => {
    bodyEl.classList.toggle("open");
    if (bodyEl.classList.contains("open")) expandedPanamaMonths.add(month);
    else expandedPanamaMonths.delete(month);
  };

  card.appendChild(head);
  card.appendChild(bodyEl);
  return card;
}

/* ---- 항차 추가/수정 모달 ---- */
function openPanamaTransitEditor(existingId) {
  const overlay = document.getElementById("panamaEditOverlay");
  document.getElementById("panamaEditTitle").textContent = existingId ? "✏️ 파나마 통과 현황 수정" : "🛳️ 항차 추가";
  overlay.style.display = "flex";
  renderPanamaTransitEditorBody(existingId);
}

function closePanamaTransitEditor() {
  document.getElementById("panamaEditOverlay").style.display = "none";
}

function renderPanamaTransitEditorBody(existingId) {
  const body = document.getElementById("panamaEditBody");
  body.innerHTML = "";
  const existing = existingId ? PANAMA_TRANSITS.find((v) => v.id === existingId) : null;

  body.appendChild(makeLabel("라인"));
  const lineInput = document.createElement("input");
  lineInput.placeholder = "예: ZSL";
  lineInput.value = existing ? (existing.line || "") : "";
  body.appendChild(lineInput);

  body.appendChild(makeLabel("선명"));
  const nameInput = document.createElement("input");
  nameInput.placeholder = "예: ROTTERDAM";
  nameInput.value = existing ? (existing.vesselName || "") : "";
  body.appendChild(nameInput);

  const codeVoyRow = document.createElement("div");
  codeVoyRow.style.cssText = "display:flex;gap:8px;";
  const codeWrap = document.createElement("div");
  codeWrap.style.flex = "1";
  codeWrap.appendChild(makeLabel("코드명"));
  const codeInput = document.createElement("input");
  codeInput.placeholder = "예: ZTD";
  codeInput.value = existing ? (existing.code || "") : "";
  codeWrap.appendChild(codeInput);
  const voyWrap = document.createElement("div");
  voyWrap.style.flex = "1";
  voyWrap.appendChild(makeLabel("항차"));
  const voyInput = document.createElement("input");
  voyInput.placeholder = "예: 86E";
  voyInput.value = existing ? (existing.voyage || "") : "";
  voyWrap.appendChild(voyInput);
  codeVoyRow.appendChild(codeWrap);
  codeVoyRow.appendChild(voyWrap);
  body.appendChild(codeVoyRow);

  const dateRow = document.createElement("div");
  dateRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";

  const depWrap = document.createElement("div");
  depWrap.style.cssText = "flex:1;min-width:130px;";
  depWrap.appendChild(makeLabel("부산 출항"));
  const depInput = document.createElement("input");
  depInput.type = "date";
  depInput.value = existing ? (existing.busanDeparture || "") : "";
  depWrap.appendChild(depInput);

  const transitWrap = document.createElement("div");
  transitWrap.style.cssText = "flex:1;min-width:130px;";
  transitWrap.appendChild(makeLabel("파나마 통과 예정일"));
  const transitInput = document.createElement("input");
  transitInput.type = "date";
  transitInput.value = existing ? (existing.panamaTransit || "") : "";
  transitWrap.appendChild(transitInput);
  const unconfirmedLabel = document.createElement("label");
  unconfirmedLabel.className = "vessel-time-confirm-label";
  const unconfirmedChk = document.createElement("input");
  unconfirmedChk.type = "checkbox";
  unconfirmedChk.checked = existing ? existing.unconfirmed === true : false;
  unconfirmedLabel.appendChild(unconfirmedChk);
  unconfirmedLabel.appendChild(document.createTextNode(" 아직 확정 아님 (확인 필요)"));
  transitWrap.appendChild(unconfirmedLabel);

  dateRow.appendChild(depWrap);
  dateRow.appendChild(transitWrap);
  body.appendChild(dateRow);

  const daysPreview = document.createElement("div");
  daysPreview.className = "hint";
  daysPreview.style.margin = "6px 0 0";
  body.appendChild(daysPreview);
  const updateDaysPreview = () => {
    const d = panamaTransitDays(depInput.value, transitInput.value);
    daysPreview.textContent = d !== null
      ? ("💡 소요일: " + d + "일" + (d >= PANAMA_LONG_TRANSIT_DAYS ? " (25일 이상이라 목록에서 강조 표시돼요)" : ""))
      : "";
  };
  depInput.addEventListener("input", updateDaysPreview);
  transitInput.addEventListener("input", updateDaysPreview);
  updateDaysPreview();

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn generate-btn";
  saveBtn.type = "button";
  saveBtn.textContent = "💾 저장";
  saveBtn.onclick = async () => {
    const vesselName = nameInput.value.trim();
    if (!vesselName) { alert("선명을 입력해주세요."); return; }
    if (!depInput.value) { alert("부산 출항일을 선택해주세요."); return; }
    const entry = {
      line: lineInput.value.trim(),
      vesselName: vesselName,
      code: codeInput.value.trim(),
      voyage: voyInput.value.trim(),
      busanDeparture: depInput.value,
      panamaTransit: transitInput.value,
      unconfirmed: unconfirmedChk.checked,
    };
    if (existing) entry.id = existing.id;

    saveBtn.disabled = true;
    saveBtn.textContent = "💾 저장 중...";
    const result = await submitPanamaTransitToServer(entry);
    saveBtn.disabled = false;
    saveBtn.textContent = "💾 저장";
    if (!result.ok) { alert("저장에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
    expandedPanamaMonths.add(entry.busanDeparture.slice(0, 7));
    closePanamaTransitEditor();
    await loadPanamaTransitTab();
  };
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary-btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "취소";
  cancelBtn.onclick = () => closePanamaTransitEditor();
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}

async function deletePanamaTransit(id) {
  const item = PANAMA_TRANSITS.find((v) => v.id === id);
  if (!item) return;
  if (!confirm('"' + (item.vesselName || "") + '" 항차를 삭제할까요?')) return;
  const result = await deletePanamaTransitFromServer(id);
  if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
  await loadPanamaTransitTab();
}
