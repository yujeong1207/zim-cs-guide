/* =========================================================================
   🌏 삼국간 (수출 CS) - 배(VSL)·화주 한 줄로 보는 진행 체크표 (표에서 바로 고치는 방식)

   ■ 데이터는 예전과 똑같이 "BL번호 1건 = Firestore 문서 1개"(triangle_trade)로 저장돼요.
     → 기존 데이터, 통합검색, 운임지불 메시지 등 다른 기능은 그대로 쓸 수 있어요.
   ■ 같은 배+화주의 BL들을 한 줄로 묶어서 보여주고, 그 줄의 칸을 눌러 바로 고쳐요
     (배 · 화주 · 온보드 · 2ND 배 · 단계 5개 · BL 목록 · REMARK 전부 표에서 직접).
     고친 값은 그 줄에 속한 BL 전부에 한꺼번에 반영돼요.
   ■ 새로 추가하는 방법은 딱 두 가지예요
     1) 표 맨 아래 빈 줄에 직접 쓰기 (배·화주·BL을 쓰면 새 줄로 저장돼요)
     2) 엑셀 붙여넣기 / 파일 올리기 (B/L No · Vsl/Voy/Leg · Payer 열을 읽어서 자동 등록)
   ========================================================================= */
const TRIANGLE_COLLECTION = "triangle_trade"; // Firestore 컬렉션 이름

let TRIANGLE_LIST = [];
let triangleUnsubscribe = null;
let triangleChipFilter = null;   // 위 요약 칩 필터: "check"(확인중) | "remit"(송금 대기) | "second"(2ND 배 있음) | null
let triangleHideDone = false;    // "완료 건 숨기기"
let triangleOpenGroups = new Set(); // BL 목록을 펼친 줄의 key 모음
let triangleRenderPending = false;  // 입력 중이라 미뤄둔 다시 그리기가 있는지
let triangleBound = false;
let triangleArmedDelete = null;     // 🗑 한 번 눌러서 "한 번 더 누르면 삭제" 대기 중인 줄
let triangleBlAddText = {};         // 펼친 BL 목록 아래 "BL 추가" 칸에 쓰던 글 (표가 다시 그려져도, 오류가 나도 안 날아가게)
let triangleBlAddBusy = false;
let triangleDraft = { vessel: "", shipper: "", onboard: "", second: "", secondNote: "", bls: "", remark: "" }; // 맨 아래 빈 줄(저장 전)
let triangleStatus = { text: "", kind: "" };
let triangleStatusTimer = null;

/* 표 위에 잠깐 보이는 안내/오류 메시지 (kind: ok | warn | bad) */
function triangleSay(text, kind) {
  triangleStatus = { text: text || "", kind: kind || "" };
  const el = document.getElementById("triangleStatus");
  if (el) { el.textContent = triangleStatus.text; el.className = "tx-status " + triangleStatus.kind; }
  if (triangleStatusTimer) clearTimeout(triangleStatusTimer);
  if (text) triangleStatusTimer = setTimeout(() => triangleSay("", ""), 8000);
}

/* =========================================================================
   Payer 코드 → 화주 연결
   - 아래 기본 3개는 코드에 들어 있어서 처음부터 자동으로 채워져요.
   - 처음 보는 Payer는 등록할 때 한 번만 화주를 고르면 저장돼요
     (Firestore settings/triangle_payer_map 에 저장 시도, 권한이 없으면 이 PC에만 저장)
   ========================================================================= */
const TRIANGLE_PAYER_DEFAULTS = {
  KRPANTOS: "판토스",
  KRSELEUSUL: "유수",
  KRPACTRAIN: "팍트라",
};
let trianglePayerMap = Object.assign({}, TRIANGLE_PAYER_DEFAULTS);
let trianglePayerLoaded = false;

function trianglePayerKey(p) { return String(p || "").trim().toUpperCase(); }

async function triangleLoadPayerMap() {
  if (trianglePayerLoaded) return;
  trianglePayerLoaded = true;
  try {
    const local = JSON.parse(localStorage.getItem("triangle_payer_map_v1") || "{}");
    Object.keys(local).forEach((k) => { trianglePayerMap[trianglePayerKey(k)] = local[k]; });
  } catch (e) { /* 무시 */ }
  try {
    await window.fbReady;
    const doc = await window.fbDb.collection("settings").doc("triangle_payer_map").get();
    if (doc.exists) {
      const m = (doc.data() || {}).map || {};
      Object.keys(m).forEach((k) => { trianglePayerMap[trianglePayerKey(k)] = m[k]; });
    }
  } catch (e) { /* 읽기 권한이 없어도 기본값+이 PC 저장값으로 계속 동작 */ }
}

/* 반환: "server"(팀 전체에 저장) | "local"(이 PC에만 저장) */
async function triangleSavePayerLink(payer, shipper) {
  const key = trianglePayerKey(payer);
  if (!key || !shipper) return "local";
  trianglePayerMap[key] = shipper;
  try {
    const local = JSON.parse(localStorage.getItem("triangle_payer_map_v1") || "{}");
    local[key] = shipper;
    localStorage.setItem("triangle_payer_map_v1", JSON.stringify(local));
  } catch (e) { /* 무시 */ }
  try {
    await window.fbReady;
    const patch = {}; patch[key] = shipper;
    await window.fbDb.collection("settings").doc("triangle_payer_map").set({ map: patch }, { merge: true });
    return "server";
  } catch (e) {
    return "local";
  }
}

/* =========================================================================
   공통 도우미
   ========================================================================= */
function triangleBlSortNum(bl) {
  const m = /\d+/.exec(String(bl || ""));
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}
function triangleCompareByBl(a, b) {
  const na = triangleBlSortNum(a.blNumber), nb = triangleBlSortNum(b.blNumber);
  if (na !== nb) return na - nb;
  return String(a.blNumber || "").localeCompare(String(b.blNumber || ""));
}
function triangleNormText(s) { return String(s || "").trim().replace(/\s+/g, " ").toUpperCase(); }
function triangleCompact(s) { return String(s || "").replace(/\s+/g, "").toUpperCase(); }
function triangleGroupKey(vessel, shipper) { return triangleNormText(vessel) + "‖" + triangleNormText(shipper); }
function triangleBlKey(bl) { return String(bl || "").trim().toUpperCase(); }

/* 이미 있는 배 이름(2ND 배 포함)인지 */
function triangleVesselKnown(v) {
  const c = triangleCompact(v);
  return TRIANGLE_LIST.some((x) => triangleCompact(x.vessel) === c || (x.secondVessel && triangleCompact(x.secondVessel) === c));
}
/* "RM1 11W" 와 "rm1  11w" 처럼 띄어쓰기·대소문자만 다른 배는 같은 배로 보고, 이미 있는 표기를 그대로 써요 */
function triangleCanonVessel(v) {
  const t = triangleNormText(v);
  if (!t) return "";
  const c = triangleCompact(t);
  const f = TRIANGLE_LIST.find((x) => triangleCompact(x.vessel) === c);
  if (f) return String(f.vessel).trim();
  const g = TRIANGLE_LIST.find((x) => x.secondVessel && triangleCompact(x.secondVessel) === c);
  return g ? String(g.secondVessel).trim() : t;
}
function triangleVesselOptions() {
  const seen = new Map();
  TRIANGLE_LIST.forEach((t) => {
    [t.vessel, t.secondVessel].forEach((raw) => {
      const v = String(raw || "").trim();
      if (!v) return;
      const k = triangleCompact(v);
      const ts = t.createdAt || "";
      const cur = seen.get(k);
      if (!cur || ts > cur.ts) seen.set(k, { v, ts });
    });
  });
  return Array.from(seen.values()).sort((a, b) => b.ts.localeCompare(a.ts)).map((x) => x.v);
}
function triangleShipperOptions() {
  const set = new Set();
  TRIANGLE_LIST.forEach((t) => { const s = String(t.shipper || "").trim(); if (s) set.add(s); });
  Object.keys(trianglePayerMap).forEach((k) => { if (trianglePayerMap[k]) set.add(trianglePayerMap[k]); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
}
function triangleCanonShipper(s) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const lc = t.toLowerCase();
  const f = triangleShipperOptions().find((x) => x.toLowerCase() === lc);
  return f || t;
}

/* 2ND 배 칸에는 배 이름 뒤에 괄호로 메모를 같이 쓸 수 있어요. 예) ZE5 15E (VNHAI ETD 11/4)
   → 배 이름 "ZE5 15E" 와 메모 "VNHAI ETD 11/4" 를 따로 저장해요 (배 이름은 다른 칸처럼 형식·표기를 맞추고, 메모는 쓴 그대로 둬요) */
function triangleSplitSecond(raw) {
  const s = String(raw || "").trim();
  const m = /^(.*?)\s*[\(（](.*)[\)）]\s*$/.exec(s);
  return m ? { vessel: m[1].trim(), note: m[2].trim() } : { vessel: s, note: "" };
}
/* 반환: { vessel, note, isNew } 또는 { error } */
function triangleCheckSecond(raw) {
  const sp = triangleSplitSecond(raw);
  if (!sp.vessel) return sp.note ? { error: "2ND 배 이름이 없어요. 배 이름을 먼저 쓰고 괄호 안에 메모를 써 주세요 (예: ZE5 15E (VNHAI ETD 11/4))" } : { vessel: "", note: "" };
  const r = triangleCheckVessel(sp.vessel, false);
  if (r.error) return r;
  return { vessel: r.value, note: sp.note, isNew: r.isNew };
}
/* 화면에 보여줄 글: 배 이름 + (메모) */
function triangleSecondText(e) {
  const v = String((e && e.secondVessel) || "").trim();
  if (!v) return "";
  const n = String((e && e.secondNote) || "").trim();
  return n ? v + " (" + n + ")" : v;
}

/* =========================================================================
   🚢 2ND 배 출항 표시
   2ND 배 메모에 적은 ETD 날짜(예: "VNHAI ETD 11/4")를 읽어서, 2ND 배가 오늘 출항하거나 이미 출항했는데
   아직 "POL/POD 인폼"(= 운임지불 메시지) 단계가 안 끝났으면 표시를 띄워요 (빨강: 출항 지남 / 주황: 오늘 출항).
   POL/POD 인폼 단계를 완료(O)하거나 해당 없음(X)으로 바꾸면 표시가 사라져요.
   ========================================================================= */
const TRIANGLE_POLPOD_IDX = 4; // TRIANGLE_STEPS 의 맨 끝 = POL/POD 인폼

/* "ETD 11/4", "etd:11.4", "ETD 11월 4일" 을 읽어요. ETD 글자가 없으면 메모 안의 첫 날짜를 써요. 못 읽으면 "" */
function triangleEtdFromNote(note) {
  const s = String(note || "");
  const m = /etd\s*[:\-]?\s*(\d{1,2})\s*(?:[\/.\-]|월)\s*(\d{1,2})/i.exec(s) || /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})/.exec(s);
  if (!m) return "";
  return gridParseDate(m[1] + "/" + m[2]) || "";
}
/* 오늘부터 며칠 뒤인지 (오늘=0, 어제=-1) */
function triangleDaysUntil(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return 0;
  const n = new Date();
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
}
/* BL 한 건의 표시: 없으면 null, 있으면 { cls: "red"|"amb", n, text, tip } */
function triangleEntryEtdStatus(e) {
  if (!String(e.secondVessel || "").trim()) return null;
  if (e.doneStatus === "done") return null;
  const step = TRIANGLE_STEPS[TRIANGLE_POLPOD_IDX];
  const kind = triangleStepState(step, e[step.key]).kind;
  if (kind === "done" || kind === "na") return null;      // POL/POD 인폼까지 끝났으면 표시 없음
  const iso = triangleEtdFromNote(e.secondNote);
  if (!iso) return null;
  const n = triangleDaysUntil(iso);
  if (n > 0) return null;                                  // 아직 출항 전이면 표시 없음
  const when = gridFmtDate(iso).replace(/\(.\)/, "");
  return n < 0
    ? { cls: "red", n, text: "🚢 출항 " + (-n) + "일 지남", tip: "2ND 배가 " + when + "에 출항했어요. POL/POD 인폼(운임지불 메시지)을 보낼 차례예요" }
    : { cls: "amb", n: 0, text: "🚢 오늘 출항", tip: "2ND 배가 오늘(" + when + ") 출항해요. 출항하면 POL/POD 인폼(운임지불 메시지)을 보내세요" };
}
/* 줄(그룹)의 표시: BL들 중 ETD가 가장 빠른(가장 많이 지난) 것 기준 */
function triangleSecondEtdStatus(g) {
  let best = null;
  g.entries.forEach((e) => { const st = triangleEntryEtdStatus(e); if (st && (best === null || st.n < best.n)) best = st; });
  return best;
}
function triangleEtdBadgeHtml(st) {
  return st ? '<span class="tx-etd ' + st.cls + '" title="' + escapeHtml(st.tip) + '">' + st.text + "</span>" : "";
}
/* 2ND 배 칸(<td>…</td>) 맨 뒤에 표시를 붙여요 */
function triangleAddEtdBadge(tdHtml, g) {
  const badge = triangleEtdBadgeHtml(triangleSecondEtdStatus(g));
  return badge ? tdHtml.replace(/<\/td>$/, badge + "</td>") : tdHtml;
}

/* 칸에 쓴 값 검사 - 반환: { value, isNew } 또는 { error } */
function triangleCheckVessel(raw, allowEmpty) {
  const v = triangleNormText(raw);
  if (!v) return allowEmpty ? { value: "" } : { error: "배 이름을 입력해 주세요" };
  const canon = triangleCanonVessel(v);
  const known = triangleVesselKnown(canon);
  if (!known && !GRID_VESSEL_FORMAT.test(canon)) return { error: '배는 "선명 항차+방향" 형식으로 써 주세요 (예: RM1 11W, ZIM ARIES 12E)' };
  return { value: canon, isNew: !known };
}
function triangleCheckShipper(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!s) return { error: "화주를 입력해 주세요" };
  const canon = triangleCanonShipper(s);
  const known = triangleShipperOptions().some((x) => x.toLowerCase() === canon.toLowerCase());
  return { value: canon, isNew: !known };
}

function triangleParseBls(text) {
  const out = [];
  String(text || "").toUpperCase().split(/[\s,;]+/).filter(Boolean).forEach((b) => { if (out.indexOf(b) < 0) out.push(b); });
  return out;
}

/* =========================================================================
   단계 상태 판정
   O = 완료 / X = 해당 없음 / 빈칸 = 아직 안 함(대기) / CHECKING·"발생되어야함" 등 = 확인중
   송금 칸의 "신용"(신용거래)은 송금 체크가 필요 없으니 X와 같은 "해당 없음"
   ========================================================================= */
const TRIANGLE_STEPS = [
  { key: "popCharge", name: "POP CHARGE", short: "POP" },
  { key: "mfstClose", name: "MFST CLOSE", short: "MFST" },
  { key: "invoiceRequest", name: "인보이스 발송요청", short: "인보이스" },
  { key: "remittance", name: "송금 완료", short: "송금", creditIsNa: true },
  { key: "polPodInform", name: "POL/POD 인폼", short: "POL/POD" },
];
const TRIANGLE_REMIT_IDX = 3;

function triangleStepState(step, value) {
  const raw = (value || "").trim();
  const v = raw.toUpperCase();
  if (!raw) return { kind: "wait", label: "대기", raw };
  if (v === "O") return { kind: "done", label: "완료", raw };
  if (v === "X") return { kind: "na", label: "—", raw };
  if (step.creditIsNa && raw.indexOf("신용") !== -1) return { kind: "na", label: "신용", raw };
  if (v === "CHECKING" || raw.indexOf("확인") !== -1 || raw.indexOf("발생") !== -1) return { kind: "check", label: "확인중", raw };
  // 그 외에 직접 적은 글자는 "확인이 필요한 메모"로 보고 눈에 띄게 원문 그대로 보여줌
  return { kind: "check", label: raw.length > 6 ? raw.slice(0, 6) + "…" : raw, raw };
}
function triangleEntryInfo(t) {
  return { states: TRIANGLE_STEPS.map((s) => triangleStepState(s, t[s.key])) };
}
function triangleEntryComplete(t) {
  if (t.doneStatus === "done") return true; // 예전에 "처리완료"를 눌러둔 건도 완료로 인정
  return triangleEntryInfo(t).states.every((s) => s.kind === "done" || s.kind === "na");
}

function triangleDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    blNumber: d.blNumber || "",
    vessel: d.vessel || "",
    shipper: d.shipper || "",
    onboardDate: d.onboardDate || "",
    secondVessel: d.secondVessel || "",
    secondNote: d.secondNote || "",    // 2ND 배 옆에 괄호로 적는 메모 (예: VNHAI ETD 11/4)
    groupRemark: d.groupRemark || "",
    popCharge: d.popCharge || "",
    mfstClose: d.mfstClose || "",
    invoiceRequest: d.invoiceRequest || "",
    remittance: d.remittance || "",
    polPodInform: d.polPodInform || "",
    remark: d.remark || "",
    doneStatus: d.doneStatus || "progress",
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAtIso || ""),
  };
}

/* 여러 문서에 같은 값을 한꺼번에 반영 (Firestore batch는 한 번에 500개까지라 나눠서 처리) */
async function triangleBatchUpdate(ids, patch) {
  if (!ids.length) return { ok: true };
  try {
    await window.fbReady;
    for (let i = 0; i < ids.length; i += 400) {
      const batch = window.fbDb.batch();
      ids.slice(i, i + 400).forEach((id) => batch.update(window.fbDb.collection(TRIANGLE_COLLECTION).doc(id), patch));
      await batch.commit();
    }
    return { ok: true };
  } catch (err) {
    console.error("삼국간 일괄 수정 실패:", err);
    return { ok: false, error: String(err) };
  }
}
async function triangleBatchDelete(ids) {
  if (!ids.length) return { ok: true };
  try {
    await window.fbReady;
    for (let i = 0; i < ids.length; i += 400) {
      const batch = window.fbDb.batch();
      ids.slice(i, i + 400).forEach((id) => batch.delete(window.fbDb.collection(TRIANGLE_COLLECTION).doc(id)));
      await batch.commit();
    }
    return { ok: true };
  } catch (err) {
    console.error("삼국간 삭제 실패:", err);
    return { ok: false, error: String(err) };
  }
}
async function deleteTriangleFromServer(id) { return triangleBatchDelete([id]); }

/* =========================================================================
   배·화주 줄(그룹) 만들기
   ========================================================================= */
function triangleBuildGroups(list) {
  const map = new Map();
  list.forEach((t) => {
    const key = triangleGroupKey(t.vessel, t.shipper);
    if (!map.has(key)) map.set(key, { key, entries: [] });
    map.get(key).entries.push(t);
  });
  return Array.from(map.values()).map((g) => triangleDecorateGroup(g));
}

function triangleDecorateGroup(g) {
  g.entries.sort(triangleCompareByBl);
  const first = g.entries[0];
  g.vessel = String(first.vessel || "").trim();
  g.shipper = String(first.shipper || "").trim();
  const pick = (f) => ((g.entries.find((e) => String(e[f] || "").trim()) || {})[f] || "").trim();
  const dates = Array.from(new Set(g.entries.map((e) => e.onboardDate).filter(Boolean))).sort();
  g.onboard = dates[0] || "";
  g.dateMixed = dates.length > 1;
  // 2ND 배는 BL마다 다를 수 있어요 (같은 배·화주 줄 안에서 어떤 BL은 있고 어떤 BL은 없을 수도)
  const seconds = g.entries.map((e) => triangleSecondText(e));
  g.secondCount = g.entries.filter((e) => String(e.secondVessel || "").trim()).length;  // 2ND 배가 있는 BL 수
  g.secondMixed = new Set(seconds).size > 1;                      // 모두 같지 않음 (있는 BL·없는 BL이 섞였거나 값이 다름)
  g.second = g.secondMixed ? "" : (seconds[0] || "");             // 줄 전체가 같을 때만 값을 보여줘요 ("배 이름 (메모)")
  g.secondVesselOnly = g.secondMixed ? "" : String(first.secondVessel || "").trim();
  g.secondNoteOnly = g.secondMixed ? "" : String(first.secondNote || "").trim();
  g.remark = pick("groupRemark");
  g.states = TRIANGLE_STEPS.map((step) => {
    const vals = g.entries.map((e) => String(e[step.key] || "").trim());
    const uniform = vals.every((v) => v === vals[0]);
    return uniform ? triangleStepState(step, vals[0]) : { kind: "mixed", label: "혼합", raw: "" };
  });
  g.done = g.entries.every(triangleEntryComplete);
  g.latest = g.entries.reduce((m, e) => ((e.createdAt || "") > m ? e.createdAt : m), "");
  return g;
}

function triangleEntriesOfGroup(key) {
  return TRIANGLE_LIST.filter((t) => triangleGroupKey(t.vessel, t.shipper) === key);
}

function triangleMatchesChip(g, chip) {
  if (chip === "check") return g.entries.some((e) => triangleEntryInfo(e).states.some((s) => s.kind === "check"));
  if (chip === "remit") return g.entries.some((e) => triangleEntryInfo(e).states[TRIANGLE_REMIT_IDX].kind === "wait"); // 신용·X는 대기가 아니라서 안 세요
  if (chip === "second") return g.secondCount > 0; // 한 건이라도 2ND 배가 있으면
  if (chip === "etd") return !!triangleSecondEtdStatus(g); // 2ND 배가 오늘 출항했거나 이미 출항했는데 POL/POD 인폼이 아직
  return true;
}

function setTriangleChipFilter(chip) {
  triangleChipFilter = triangleChipFilter === chip ? null : chip;
  renderTriangleList();
}
function toggleTriangleHideDone() {
  triangleHideDone = !triangleHideDone;
  renderTriangleList();
}

/* 통합검색에서 BL을 눌러 들어왔을 때 그 BL이 들어 있는 줄을 펼쳐줘요 (guide_desks_portschedule.js에서 호출) */
function triangleRevealEntry(id) {
  const t = TRIANGLE_LIST.find((x) => x.id === id);
  if (!t) return;
  triangleChipFilter = null;
  triangleHideDone = false;
  triangleOpenGroups.add(triangleGroupKey(t.vessel, t.shipper));
}

/* =========================================================================
   표 그리기
   ========================================================================= */
function renderTriangleList() {
  const wrap = document.getElementById("triangleListWrap");
  if (!wrap) return;

  // 입력 중인 칸이 있으면 실시간 갱신으로 날아가지 않게 잠깐 미뤄요
  const ae = document.activeElement;
  if (ae && wrap.contains(ae) && ae.dataset && ae.dataset.dirty === "1") { triangleRenderPending = true; return; }
  triangleRenderPending = false;
  const focusToken = gridCaptureFocus(wrap); // 다시 그린 뒤에 커서를 같은 칸으로 되돌리려고

  const qEl = document.getElementById("triangleFilter");
  const q = (qEl ? qEl.value : "").trim().toLowerCase();

  let groups = triangleBuildGroups(TRIANGLE_LIST);

  // 요약 칩 숫자 - 검색/필터와 상관없이 "진행중인 전체 줄" 기준
  const counts = { check: 0, remit: 0, second: 0, etd: 0 };
  const prog = groups.filter((g) => !g.done);
  prog.forEach((g) => { Object.keys(counts).forEach((c) => { if (triangleMatchesChip(g, c)) counts[c]++; }); });
  const doneCount = groups.length - prog.length;

  if (q) {
    groups = groups.filter((g) => [g.vessel, g.shipper, g.second, g.remark].concat(g.entries.map((e) => e.blNumber + " " + e.remark + " " + triangleSecondText(e))).join(" ").toLowerCase().includes(q));
  }
  if (triangleChipFilter) groups = groups.filter((g) => !g.done && triangleMatchesChip(g, triangleChipFilter));
  if (triangleHideDone) groups = groups.filter((g) => !g.done);

  // 정렬: 최근에 등록된 배가 위로, 같은 배 안에서는 화주 이름순
  const vesselLatest = new Map();
  groups.forEach((g) => {
    const k = triangleCompact(g.vessel);
    if ((g.latest || "") > (vesselLatest.get(k) || "")) vesselLatest.set(k, g.latest || "");
  });
  groups.sort((a, b) => {
    const ka = triangleCompact(a.vessel), kb = triangleCompact(b.vessel);
    if (ka !== kb) return (vesselLatest.get(kb) || "").localeCompare(vesselLatest.get(ka) || "") || ka.localeCompare(kb);
    return a.shipper.localeCompare(b.shipper, "ko");
  });

  const esc = escapeHtml;
  const chip = (cls, key, label, n) =>
    '<button type="button" class="tri-chip ' + cls + (triangleChipFilter === key ? " active" : "") + '" onclick="setTriangleChipFilter(\'' + key + '\')">' + label + '<span class="n">' + n + "</span></button>";

  let html = '<div id="triangleStatus" class="tx-status ' + esc(triangleStatus.kind) + '">' + esc(triangleStatus.text) + "</div>";
  html += '<div class="tri-bar">'
    + chip("check", "check", "확인중", counts.check)
    + chip("remit", "remit", "송금 대기", counts.remit)
    + chip("second", "second", "2ND 배 있음", counts.second)
    + chip("etd", "etd", "🚢 2ND 출항함 (오늘 포함)", counts.etd)
    + '<button type="button" class="tri-chip' + (triangleHideDone ? " active" : "") + '" onclick="toggleTriangleHideDone()">' + (triangleHideDone ? "완료 건 보이기" : "완료 건 숨기기") + "</button>"
    + "</div>";

  html += '<div class="tri-legend"><span class="tri-pill done">완료</span><span>O</span>'
    + '<span class="tri-pill na">—</span><span>X, 해당 없음</span>'
    + '<span class="tri-pill wait">대기</span><span>빈칸, 아직 안 함</span>'
    + '<span class="tri-pill check">확인중</span><span>CHECKING</span>'
    + '<span class="tri-pill na">신용</span><span>송금 불필요</span>'
    + '<span class="tx-legend-tip">👆 단계 칸을 누르면 대기 → O → X → (신용) → 확인중 순서로 바뀌어요 · 나머지 칸은 눌러서 바로 고쳐요 (Enter 아래 칸, Esc 되돌리기)</span></div>';

  if (TRIANGLE_LIST.length === 0) {
    html += '<div class="empty-state">아직 등록된 삼국간 건이 없어요. 표 맨 아래 빈 줄에 배·화주·BL을 쓰거나, 위 "➕ 엑셀로 새 건 추가"를 써보세요.</div>';
  } else if (groups.length === 0) {
    html += '<div class="empty-state">' + (q ? "❌ \"" + esc(qEl ? qEl.value : "") + "\"는 목록에 없어요." : "조건에 맞는 줄이 없어요.") + "</div>";
  }

  html += '<datalist id="txDlVessel">' + triangleVesselOptions().map((v) => '<option value="' + esc(v) + '">').join("") + "</datalist>"
    + '<datalist id="txDlShipper">' + triangleShipperOptions().map((v) => '<option value="' + esc(v) + '">').join("") + "</datalist>";

  html += '<table class="contacts-table triangle-table tx-table sticky-table"><colgroup>'
    + '<col style="width:30px"><col style="width:176px"><col style="width:132px"><col style="width:104px"><col style="width:220px">'
    + '<col style="width:84px"><col style="width:84px"><col style="width:90px"><col style="width:84px"><col style="width:90px">'
    + '<col style="width:84px"><col style="width:270px"><col style="width:44px"></colgroup>'
    + "<thead><tr><th></th><th>배(VSL)</th><th>화주</th><th>온보드</th><th>2ND 배</th>"
    + "<th>POP CHARGE</th><th>MFST CLOSE</th><th title=\"인보이스 발송요청\">인보이스요청</th><th>송금 완료</th><th>POL/POD 인폼</th>"
    + "<th>BL</th><th>REMARK</th><th></th></tr></thead><tbody>";

  let lastVessel = null;
  groups.forEach((g) => {
    const gk = esc(g.key);
    const vk = triangleCompact(g.vessel);
    const firstOfVessel = vk !== lastVessel;
    lastVessel = vk;
    const autoOpen = !!q && g.entries.some((e) => String(e.blNumber).toLowerCase().includes(q));
    const open = triangleOpenGroups.has(g.key) || autoOpen;
    const armed = triangleArmedDelete === g.key;
    const etdSt = triangleSecondEtdStatus(g);
    const cell = (field, val, ph, list, extraCls, title) =>
      '<td class="no-strike"><input type="text" class="tx-input ' + (extraCls || "") + '" data-act="field" data-field="' + field + '" data-gk="' + gk + '" value="' + esc(val) + '" placeholder="' + ph + '" autocomplete="off"'
      + (list ? ' list="' + list + '"' : "") + (title ? ' title="' + esc(title) + '"' : "") + "></td>";

    html += '<tr class="tx-row' + (g.done ? " row-done" : "") + (firstOfVessel ? " tx-vfirst" : "") + (etdSt ? (etdSt.n < 0 ? " tx-etd-late" : " tx-etd-today") : "") + '" data-gk="' + gk + '">'
      + '<td class="no-strike tx-caret" data-act="toggle-bl" data-gk="' + gk + '">' + (open ? "▾" : "▸") + "</td>"
      + cell("vessel", g.vessel, "배 미입력", "txDlVessel", "tx-vin" + (firstOfVessel ? "" : " tx-rep") + (g.vessel ? "" : " tx-warnph"))
      + cell("shipper", g.shipper, "화주 미입력", "txDlShipper", g.shipper ? "" : "tx-warnph")
      + cell("onboard", g.onboard ? gridFmtDate(g.onboard) : "", "미입력", "", g.onboard ? (g.dateMixed ? "tx-mixed" : "") : "tx-warnph",
        g.dateMixed ? "BL마다 온보드가 달라요. 여기서 고치면 이 줄 전체가 같은 날짜로 바뀌어요" : "")
      + triangleAddEtdBadge((g.secondMixed
        ? '<td class="no-strike"><input type="text" class="tx-input tx-mixed tx-second-mixed" readonly data-act="toggle-bl" data-gk="' + gk + '" value="혼합 (' + g.secondCount + "/" + g.entries.length + '건)" title="'
          + esc("BL마다 2ND 배가 달라요 (" + Array.from(new Set(g.entries.map(triangleSecondText).filter(Boolean))).join(", ") + "). 눌러서 BL 목록을 펼치면 BL별로 보고 고칠 수 있어요") + '"></td>'
        : cell("second", g.second, "없음", "txDlVessel", "", "2ND 배 이름 뒤에 괄호로 메모를 같이 쓸 수 있어요 (예: ZE5 15E (VNHAI ETD 11/4))" + (g.second ? "\n지금: " + g.second : ""))), g);

    g.states.forEach((st0, i) => {
      const st = (g.done && st0.kind === "wait") ? { kind: "na", label: "—", raw: "" } : st0;
      const tip = st.kind === "mixed" ? "BL마다 값이 달라요. 누르면 이 줄 전체를 O로 맞춰요" : (st.raw ? st.raw : "누르면 바뀌어요");
      html += '<td class="no-strike tri-step-cell tx-step" tabindex="0" data-act="step" data-gk="' + gk + '" data-step="' + i + '" title="' + esc(tip) + '">'
        + '<span class="tri-pill ' + st.kind + '">' + esc(st.label) + "</span></td>";
    });

    html += '<td class="no-strike"><button type="button" class="tx-bl-btn" data-act="toggle-bl" data-gk="' + gk + '">' + g.entries.length + "건 " + (open ? "▴" : "▾") + "</button></td>"
      + '<td class="no-strike"><textarea class="tx-input tx-remark" rows="1" data-act="field" data-field="remark" data-gk="' + gk + '" placeholder="-" spellcheck="false">' + esc(g.remark) + "</textarea></td>"
      + '<td class="no-strike tx-trash' + (armed ? " armed" : "") + '" data-act="del-group" data-gk="' + gk + '" title="이 줄 전체 삭제 (두 번 누르면 삭제돼요)">🗑</td>'
      + "</tr>";

    if (open) {
      const perBl = g.entries.filter((e) => e.remark).map((e) => e.blNumber + ": " + e.remark);
      const addText = triangleBlAddText[g.key] || "";
      html += '<tr class="tx-ex-row"><td></td><td colspan="12" class="no-strike"><div class="tx-ex">'
        + '<div class="tx-ex-head"><b>BL <span class="tx-cnt">' + g.entries.length + "</span>건</b>"
        + '<span class="tx-sub">BL마다 2ND 배를 따로 쓸 수 있어요 (없는 BL은 비워두세요) · 배 이름 뒤에 괄호로 메모도 가능: ZE5 15E (VNHAI ETD 11/4)</span>'
        + '<button type="button" class="btn secondary-btn tx-mini" data-act="copy-bls" data-gk="' + gk + '">📋 BL 전체 복사</button></div>'
        + '<div class="tx-bl-grid"><div class="tx-bl-row tx-bl-grid-head"><span>BL 번호</span><span>2ND 배</span><span></span></div>'
        + g.entries.map((e) => '<div class="tx-bl-row' + (e.secondVessel ? " has-second" : "") + '" data-triangle-id="' + e.id + '">'
          + '<input type="text" class="tx-input tx-bl-no-in" data-act="bl-field" data-field="bl" data-id="' + e.id + '" data-gk="' + gk + '" value="' + esc(e.blNumber) + '" spellcheck="false" autocomplete="off">'
          + '<div class="tx-sec-wrap"><input type="text" class="tx-input" list="txDlVessel" data-act="bl-field" data-field="second" data-id="' + e.id + '" data-gk="' + gk + '" value="' + esc(triangleSecondText(e)) + '" placeholder="없음" title="' + esc("2ND 배 이름 뒤에 괄호로 메모를 같이 쓸 수 있어요 (예: ZE5 15E (VNHAI ETD 11/4))" + (triangleSecondText(e) ? "\n지금: " + triangleSecondText(e) : "")) + '" autocomplete="off">' + triangleEtdBadgeHtml(triangleEntryEtdStatus(e)) + "</div>"
          + '<button type="button" class="tx-del" data-act="del-bl" data-id="' + e.id + '" title="이 BL 삭제">✕</button></div>').join("")
        + "</div>"
        + '<div class="tx-add-bl"><textarea class="tx-input tx-bl-input" rows="1" data-act="bl-add" data-gk="' + gk + '" spellcheck="false" placeholder="BL 추가 · 한 줄에 BL 하나 (2ND 배가 있으면 BL 번호 뒤에 같이 써요: ZIMUHAI80255002 RM1 11W). 엑셀에서 BL·2ND 두 열을 복사해 붙여넣어도 돼요">' + esc(addText) + "</textarea>"
        + '<button type="button" class="btn generate-btn tx-mini" data-act="bl-add-btn" data-gk="' + gk + '">추가</button></div>'
        + (perBl.length ? '<div class="tx-sub" style="margin-top:6px;">BL별로 적혀 있던 메모: ' + esc(perBl.join(" · ")) + "</div>" : "")
        + "</div></td></tr>";
    }
  });

  // 맨 아래 빈 줄 - 여기에 쓰면 새 줄이 돼요
  const d = triangleDraft;
  const dcell = (field, val, ph, list) =>
    '<td class="no-strike"><input type="text" class="tx-input" data-act="draft" data-field="' + field + '" value="' + esc(val) + '" placeholder="' + ph + '" autocomplete="off"' + (list ? ' list="' + list + '"' : "") + "></td>";
  html += '<tr class="tx-draft"><td class="no-strike tx-caret">＋</td>'
    + dcell("vessel", d.vessel, "새 줄: 배 (예: RM1 11W)", "txDlVessel")
    + dcell("shipper", d.shipper, "화주", "txDlShipper")
    + dcell("onboard", d.onboard ? gridFmtDate(d.onboard) : "", "온보드 10/17", "")
    + dcell("second", d.second ? d.second + (d.secondNote ? " (" + d.secondNote + ")" : "") : "", "2ND 배 (메모는 괄호로)", "txDlVessel")
    + '<td colspan="5" class="no-strike tx-draft-hint">← 배·화주를 쓰고 오른쪽에 BL을 붙여넣으면 새 줄로 저장돼요</td>'
    + dcell("bls", d.bls, "BL 붙여넣기", "")
    + dcell("remark", d.remark, "REMARK", "")
    + "<td></td></tr>";

  html += "</tbody></table>"
    + '<div class="hint" style="margin-top:8px;">✅ 배·화주 ' + groups.length + "줄 표시됨 (진행 " + prog.length + " · 완료 " + doneCount + ")</div>";
  wrap.innerHTML = html;
  wrap.querySelectorAll("textarea.tx-remark, textarea.tx-bl-input").forEach(triangleAutoSize);
  gridRestoreFocus(wrap, focusToken);
}

function triangleAutoSize(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 360) + "px"; }

/* =========================================================================
   표 안에서 일어나는 클릭/입력 처리
   ========================================================================= */

/* 대기 → O → X → (송금만: 신용) → 확인중 → 대기 */
function triangleNextStepValue(stepIdx, st) {
  if (st.kind === "mixed" || st.kind === "wait") return "O";
  if (st.kind === "done") return "X";
  if (st.kind === "na") return (stepIdx === TRIANGLE_REMIT_IDX && st.label === "—") ? "신용" : "CHECKING";
  return ""; // 확인중 → 대기
}

async function triangleCycleStep(key, stepIdx) {
  const entries = triangleEntriesOfGroup(key);
  if (!entries.length) return;
  const g = triangleDecorateGroup({ key, entries: entries.slice() });
  const value = triangleNextStepValue(stepIdx, g.states[stepIdx]);
  const patch = {}; patch[TRIANGLE_STEPS[stepIdx].key] = value;
  const r = await triangleBatchUpdate(entries.map((e) => e.id), patch);
  if (!r.ok) triangleSay("저장에 실패했어요: " + r.error, "bad");
}

/* 같은 줄에 BL을 새로 넣을 때, 그 줄의 현재 값(2ND·REMARK·진행 단계)을 그대로 물려줘요 */
function triangleTemplateFromEntries(entries) {
  const g = triangleDecorateGroup({ key: "", entries: entries.slice() });
  const t = { vessel: g.vessel, shipper: g.shipper, onboardDate: g.onboard, secondVessel: g.secondVesselOnly, secondNote: g.secondNoteOnly, groupRemark: g.remark };
  TRIANGLE_STEPS.forEach((s, i) => { t[s.key] = g.states[i].kind === "mixed" ? "" : g.states[i].raw; });
  return t;
}

function triangleNewDocData(bl, template, nowIso) {
  return {
    blNumber: bl,
    vessel: template.vessel || "",
    shipper: template.shipper || "",
    onboardDate: template.onboardDate || "",
    secondVessel: template.secondVessel || "",
    secondNote: template.secondNote || "",
    groupRemark: template.groupRemark || "",
    popCharge: template.popCharge || "",
    mfstClose: template.mfstClose || "",
    invoiceRequest: template.invoiceRequest || "",
    remittance: template.remittance || "",
    polPodInform: template.polPodInform || "",
    remark: "",
    doneStatus: "progress",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdAtIso: nowIso,
  };
}

async function triangleCreateEntries(blNumbers, template) {
  try {
    await window.fbReady;
    const nowIso = new Date().toISOString();
    for (let i = 0; i < blNumbers.length; i += 400) {
      const batch = window.fbDb.batch();
      blNumbers.slice(i, i + 400).forEach((bl) => {
        batch.set(window.fbDb.collection(TRIANGLE_COLLECTION).doc(), triangleNewDocData(bl, template, nowIso));
      });
      await batch.commit();
    }
    return { ok: true };
  } catch (err) {
    console.error("삼국간 등록 실패:", err);
    return { ok: false, error: String(err) };
  }
}

/* ---- 줄에 있는 칸(배·화주·온보드·2ND·REMARK) 고치기 ---- */
function triangleFail(msg) { triangleSay(msg, "bad"); renderTriangleList(); }

async function triangleCommitField(el) {
  const key = el.dataset.gk, field = el.dataset.field;
  el.dataset.dirty = "0";
  const entries = triangleEntriesOfGroup(key);
  if (!entries.length) return;
  const ids = entries.map((e) => e.id);
  const txt = el.value;
  let patch = null, note = "", newKey = null;

  if (field === "vessel") {
    const r = triangleCheckVessel(txt, false); if (r.error) return triangleFail(r.error);
    patch = { vessel: r.value };
    if (r.isNew) note = "새 배로 저장됐어요: " + r.value;
    newKey = triangleGroupKey(r.value, entries[0].shipper);
  } else if (field === "shipper") {
    const r = triangleCheckShipper(txt); if (r.error) return triangleFail(r.error);
    patch = { shipper: r.value };
    if (r.isNew) note = "처음 쓰는 화주예요: " + r.value + " (새 화주로 저장됐어요)";
    newKey = triangleGroupKey(entries[0].vessel, r.value);
  } else if (field === "onboard") {
    const d = gridParseDate(txt);
    if (d === null) return triangleFail('온보드: "' + txt.trim() + '" 날짜를 읽지 못했어요 (예: 10/17 또는 1017)');
    patch = { onboardDate: d };
  } else if (field === "second") {
    const r = triangleCheckSecond(txt); if (r.error) return triangleFail("2ND 배: " + r.error);
    patch = { secondVessel: r.vessel, secondNote: r.note };
    if (r.isNew) note = "새 2ND 배로 저장됐어요: " + r.vessel;
  } else if (field === "remark") {
    patch = { groupRemark: txt.trim() };
  }
  if (!patch) return;

  if (newKey && newKey !== key && TRIANGLE_LIST.some((t) => triangleGroupKey(t.vessel, t.shipper) === newKey)) {
    note = "같은 배·화주 줄이 이미 있어서 한 줄로 합쳐졌어요";
  }
  const r = await triangleBatchUpdate(ids, patch);
  if (!r.ok) triangleSay("저장에 실패했어요: " + r.error, "bad");
  else triangleSay(note || "저장됐어요", note ? "warn" : "ok");
}

/* ---- BL 한 건씩 고치기: BL 번호, 그 BL의 2ND 배 ---- */
async function triangleCommitBlField(el) {
  el.dataset.dirty = "0";
  const id = el.dataset.id, field = el.dataset.field;
  const t = TRIANGLE_LIST.find((x) => x.id === id);
  if (!t) return;
  const patch = {};
  let note = "";
  if (field === "bl") {
    const b = triangleBlKey(el.value);
    if (!/^[A-Z]+\d+$/.test(b)) return triangleFail("BL 형식이 이상해요: " + el.value.trim());
    const dup = TRIANGLE_LIST.find((x) => x.id !== id && triangleBlKey(x.blNumber) === b);
    if (dup) return triangleFail("이미 등록된 BL이에요: " + b + " (" + dup.vessel + " / " + dup.shipper + ")");
    patch.blNumber = b;
  } else if (field === "second") {
    const r = triangleCheckSecond(el.value); if (r.error) return triangleFail("2ND 배: " + r.error);
    patch.secondVessel = r.vessel;
    patch.secondNote = r.note;
    if (r.isNew) note = "새 2ND 배로 저장됐어요: " + r.vessel;
  } else { return; }
  const res = await triangleBatchUpdate([id], patch);
  if (!res.ok) triangleSay("저장에 실패했어요: " + res.error, "bad");
  else triangleSay(note || "저장됐어요", note ? "warn" : "ok");
}

/* ---- BL 한 건 삭제 (✕) ---- */
async function triangleDeleteBlRow(id) {
  const t = TRIANGLE_LIST.find((x) => x.id === id);
  if (!t) return;
  const left = triangleEntriesOfGroup(triangleGroupKey(t.vessel, t.shipper)).length;
  const msg = left <= 1
    ? t.blNumber + "은(는) 이 줄의 마지막 BL이에요. 삭제하면 이 줄이 통째로 사라져요. 삭제할까요?"
    : t.blNumber + "을(를) 삭제할까요?";
  if (!confirm(msg)) return;
  const r = await triangleBatchDelete([id]);
  triangleSay(r.ok ? t.blNumber + " 삭제했어요" : "삭제에 실패했어요: " + r.error, r.ok ? "ok" : "bad");
}

/* ---- BL 추가 칸 읽기: 한 줄에 BL 하나, 2ND 배가 있으면 BL 번호 뒤에 같이 (탭이나 띄어쓰기로 구분) ---- */
function triangleParseBlLines(text) {
  const items = [], bad = [];
  const isBl = (t) => /^[A-Za-z]+\d+$/.test(t);
  String(text || "").replace(/\r/g, "").split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    if (line.indexOf("\t") >= 0) {
      const c = line.split("\t").map((x) => x.trim());
      if (isBl(c[0])) items.push({ bl: c[0].toUpperCase(), second: (c[1] || "").trim() }); else bad.push(line);
      return;
    }
    const toks = line.split(/[\s,;]+/).filter(Boolean);
    if (!toks.length) return;
    if (toks.every(isBl)) toks.forEach((t) => items.push({ bl: t.toUpperCase(), second: "" })); // 한 줄에 BL만 여러 개
    else if (isBl(toks[0])) items.push({ bl: toks[0].toUpperCase(), second: toks.slice(1).join(" ") }); // BL 뒤는 2ND 배
    else bad.push(line);
  });
  return { items, bad };
}

async function triangleAddBlsFromText(key, text, ta) {
  if (triangleBlAddBusy) return;
  const entries = triangleEntriesOfGroup(key);
  if (!entries.length) return;
  if (!String(text || "").trim()) { delete triangleBlAddText[key]; return; }
  triangleBlAddText[key] = text;                       // 오류가 나도 쓰던 글이 남아 있게
  const { items, bad } = triangleParseBlLines(text);
  if (bad.length) return triangleFail("읽지 못한 줄이 있어요: " + bad.slice(0, 2).join(" / ") + " (BL 번호로 시작해야 해요)");
  const byBl = new Map(entries.map((e) => [triangleBlKey(e.blNumber), e]));
  const others = new Map();
  TRIANGLE_LIST.forEach((t) => { if (triangleGroupKey(t.vessel, t.shipper) !== key) others.set(triangleBlKey(t.blNumber), t); });

  const creates = [], updates = [], same = [], dupOther = [];
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.bl)) continue;
    seen.add(it.bl);
    let second = "", secondNote = "";
    if (it.second) {
      const r = triangleCheckSecond(it.second);
      if (r.error) return triangleFail(it.bl + "의 2ND 배: " + r.error);
      second = r.vessel; secondNote = r.note;
    }
    if (byBl.has(it.bl)) { if (second) updates.push({ id: byBl.get(it.bl).id, bl: it.bl, second, secondNote }); else same.push(it.bl); }
    else if (others.has(it.bl)) dupOther.push(it.bl);
    else creates.push({ bl: it.bl, second, secondNote });
  }
  if (dupOther.length) {
    return triangleFail("이미 다른 줄에 있는 BL이에요: " + dupOther.map((b) => b + " → " + others.get(b).vessel + " / " + others.get(b).shipper).join(", "));
  }
  if (!creates.length && !updates.length) return triangleFail("새로 추가할 BL이 없어요 (이미 이 줄에 있는 BL: " + same.join(", ") + ")");

  triangleBlAddBusy = true;
  // 저장되는 순간 표가 바로 다시 그려질 수 있어서, 쓰던 글은 저장하기 "전에" 비워둬요 (실패하면 아래에서 되돌려요)
  const keepText = triangleBlAddText[key];
  delete triangleBlAddText[key];
  if (ta) ta.value = "";
  try {
    await window.fbReady;
    const tpl = triangleTemplateFromEntries(entries);   // 새 BL은 이 줄의 진행 단계를 물려받아요. 2ND 배는 줄 전체가 같을 때만 물려받고요
    const nowIso = new Date().toISOString();
    const batch = window.fbDb.batch();
    creates.forEach((c) => {
      const data = triangleNewDocData(c.bl, tpl, nowIso);
      if (c.second) { data.secondVessel = c.second; data.secondNote = c.secondNote || ""; }
      batch.set(window.fbDb.collection(TRIANGLE_COLLECTION).doc(), data);
    });
    updates.forEach((u) => batch.update(window.fbDb.collection(TRIANGLE_COLLECTION).doc(u.id), { secondVessel: u.second, secondNote: u.secondNote || "" }));
    await batch.commit();
    const parts = [];
    if (creates.length) parts.push("BL " + creates.length + "건 추가");
    if (updates.length) parts.push("2ND 배 " + updates.length + "건 갱신");
    if (same.length) parts.push("이미 있는 BL " + same.length + "건은 그대로");
    triangleSay(parts.join(" · "), same.length ? "warn" : "ok");
  } catch (err) {
    console.error("BL 추가 실패:", err);
    triangleBlAddText[key] = keepText;   // 저장에 실패하면 쓰던 글을 되돌려놔요
    triangleSay("저장에 실패했어요: " + err, "bad");
    renderTriangleList();
  } finally {
    triangleBlAddBusy = false;
  }
}

/* ---- 🗑 줄 전체 삭제 (두 번 눌러야 삭제) ---- */
function triangleOnTrash(key) {
  if (triangleArmedDelete !== key) {
    triangleArmedDelete = key;
    const entries = triangleEntriesOfGroup(key);
    triangleSay("한 번 더 누르면 이 줄(BL " + entries.length + "건)을 삭제해요", "warn");
    renderTriangleList();
    setTimeout(() => { if (triangleArmedDelete === key) { triangleArmedDelete = null; renderTriangleList(); } }, 3000);
    return;
  }
  triangleArmedDelete = null;
  const ids = triangleEntriesOfGroup(key).map((e) => e.id);
  triangleBatchDelete(ids).then((r) => triangleSay(r.ok ? "삭제했어요" : "삭제에 실패했어요: " + r.error, r.ok ? "ok" : "bad"));
}

/* ---- 맨 아래 빈 줄 ---- */
function triangleDraftCommit(el) {
  const f = el.dataset.field, txt = el.value;
  el.dataset.dirty = "0";
  const d = triangleDraft;
  let note = "";
  if (f === "vessel") {
    if (!txt.trim()) d.vessel = "";
    else { const r = triangleCheckVessel(txt, false); if (r.error) { d.vessel = ""; return triangleFail(r.error); } d.vessel = r.value; if (r.isNew) note = "새 배로 저장돼요: " + r.value; }
  } else if (f === "shipper") {
    if (!txt.trim()) d.shipper = "";
    else { const r = triangleCheckShipper(txt); if (r.error) { d.shipper = ""; return triangleFail(r.error); } d.shipper = r.value; if (r.isNew) note = "처음 쓰는 화주예요: " + r.value + " (새 화주로 저장돼요)"; }
  } else if (f === "onboard") {
    const v = gridParseDate(txt);
    if (v === null) { d.onboard = ""; return triangleFail('온보드: "' + txt.trim() + '" 날짜를 읽지 못했어요 (예: 10/17 또는 1017)'); }
    d.onboard = v;
  } else if (f === "second") {
    const r = triangleCheckSecond(txt); if (r.error) { d.second = ""; d.secondNote = ""; return triangleFail("2ND 배: " + r.error); }
    d.second = r.vessel;
    d.secondNote = r.note;
  } else if (f === "bls") {
    d.bls = triangleParseBls(txt).join(" ");
  } else if (f === "remark") {
    d.remark = txt.trim();
  }
  triangleDraftTryCreate(note);
}

async function triangleDraftTryCreate(note) {
  const d = triangleDraft;
  const bls = triangleParseBls(d.bls);
  const missing = [];
  if (!d.vessel) missing.push("배");
  if (!d.shipper) missing.push("화주");
  if (!bls.length) missing.push("BL");
  if (missing.length) {
    if (d.vessel || d.shipper || bls.length) triangleSay((note ? note + " · " : "") + missing.join(", ") + "까지 쓰면 새 줄로 저장돼요", "warn");
    renderTriangleList();
    return;
  }
  const bad = bls.filter((b) => !/^[A-Z]+\d+$/.test(b));
  if (bad.length) { triangleSay("BL 형식이 이상해요: " + bad.join(", "), "bad"); renderTriangleList(); return; }

  const existing = new Map(TRIANGLE_LIST.map((t) => [triangleBlKey(t.blNumber), t]));
  const fresh = bls.filter((b) => !existing.has(b));
  const dups = bls.filter((b) => existing.has(b));
  if (!fresh.length) { triangleSay("이미 등록된 BL이에요: " + dups.map((b) => b + " → " + existing.get(b).vessel + " / " + existing.get(b).shipper).join(", "), "bad"); renderTriangleList(); return; }

  const key = triangleGroupKey(d.vessel, d.shipper);
  const entries = triangleEntriesOfGroup(key);
  let tpl, merged = false;
  if (entries.length) {
    merged = true;
    tpl = triangleTemplateFromEntries(entries);
    if (!tpl.onboardDate && d.onboard) { // 온보드가 비어 있던 줄이면 이번에 쓴 날짜를 줄 전체에 채워줘요
      tpl.onboardDate = d.onboard;
      await triangleBatchUpdate(entries.map((e) => e.id), { onboardDate: d.onboard });
    }
  } else {
    tpl = { vessel: d.vessel, shipper: d.shipper, onboardDate: d.onboard, secondVessel: d.second, secondNote: d.secondNote || "", groupRemark: d.remark };
  }
  const res = await triangleCreateEntries(fresh, tpl);
  if (!res.ok) { triangleSay("저장에 실패했어요: " + res.error, "bad"); return; }
  triangleDraft = { vessel: "", shipper: "", onboard: "", second: "", secondNote: "", bls: "", remark: "" };
  triangleSay("BL " + fresh.length + "건 저장됐어요 (" + (merged ? "기존 줄에 추가" : "새 줄") + ")" + (note ? " · " + note : "") + (dups.length ? " · 이미 있는 BL 제외: " + dups.join(", ") : ""), (dups.length || note) ? "warn" : "ok");
  renderTriangleList();
  const first = document.querySelector('#triangleListWrap input[data-act="draft"][data-field="vessel"]');
  if (first) first.focus();
}

function triangleFindCell(desc) {
  const wrap = document.getElementById("triangleListWrap");
  if (!wrap || !desc) return null;
  const sel = '[data-act="' + desc.act + '"][data-field="' + desc.field + '"]' + (desc.gk != null ? '[data-gk="' + String(desc.gk).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]' : "");
  return wrap.querySelector(sel);
}

function triangleBindEvents() {
  if (triangleBound) return;
  const wrap = document.getElementById("triangleListWrap");
  if (!wrap) return;
  triangleBound = true;

  wrap.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || !wrap.contains(el)) return;
    const act = el.dataset.act, gk = el.dataset.gk;
    if (act === "step") { triangleCycleStep(gk, Number(el.dataset.step)); }
    else if (act === "toggle-bl") {
      if (triangleOpenGroups.has(gk)) triangleOpenGroups.delete(gk); else triangleOpenGroups.add(gk);
      renderTriangleList();
    }
    else if (act === "del-group") { triangleOnTrash(gk); }
    else if (act === "del-bl") { triangleDeleteBlRow(el.dataset.id); }
    else if (act === "bl-add-btn") {
      const ta = el.parentElement.querySelector("textarea");
      if (ta) { ta.dataset.dirty = "0"; triangleAddBlsFromText(gk, ta.value, ta); }
    }
    else if (act === "copy-bls") {
      const text = triangleEntriesOfGroup(gk).sort(triangleCompareByBl).map((t) => t.blNumber).filter(Boolean).join("\n");
      const done = () => { const old = el.textContent; el.textContent = "복사됨 ✓"; setTimeout(() => { el.textContent = old; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text));
      else legacyCopy(text);
    }
  });

  wrap.addEventListener("focusin", (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.act && el.tagName === "INPUT" && !el.readOnly) { el.dataset.orig = el.value; el.select(); }
    else if (el.dataset && el.dataset.act && el.tagName === "TEXTAREA") { el.dataset.orig = el.value; }
  });

  wrap.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.act) return;
    if (el.dataset.act === "step" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); triangleCycleStep(el.dataset.gk, Number(el.dataset.step)); return; }
    // REMARK 칸은 여러 줄 칸이에요: Enter = 저장하고 아래 칸으로, Shift+Enter = 줄바꿈
    const isRemarkBox = el.tagName === "TEXTAREA" && el.dataset.act === "field";
    if (el.tagName !== "INPUT" && !isRemarkBox) return;
    if (el.readOnly) return;
    if (e.key === "Escape") { el.value = el.dataset.orig != null ? el.dataset.orig : el.value; el.dataset.dirty = "0"; if (isRemarkBox) triangleAutoSize(el); return; }
    if (e.key === "Enter") {
      if (isRemarkBox && e.shiftKey) return; // 줄바꿈은 그대로 두기
      e.preventDefault();
      // 같은 열의 아래(Shift는 위) 칸으로 이동 - 저장하느라 표가 다시 그려져도 같은 칸을 다시 찾아서 이동해요
      const all = Array.from(wrap.querySelectorAll('input[data-field="' + el.dataset.field + '"], textarea[data-field="' + el.dataset.field + '"]'));
      const nx = all[all.indexOf(el) + (e.shiftKey ? -1 : 1)];
      const desc = nx ? { act: nx.dataset.act, field: nx.dataset.field, gk: nx.dataset.gk } : null;
      el.blur(); // 값이 바뀌었으면 여기서 저장(change)돼요
      const target = triangleFindCell(desc);
      if (target) target.focus();
    }
  });

  wrap.addEventListener("input", (e) => {
    const el = e.target;
    if (el.classList && el.classList.contains("tx-input")) {
      el.dataset.dirty = "1";
      if (el.tagName === "TEXTAREA") triangleAutoSize(el);
      if (el.dataset.act === "bl-add") triangleBlAddText[el.dataset.gk] = el.value;
    }
  });

  wrap.addEventListener("paste", (e) => {
    const el = e.target;
    if (!el.dataset || el.dataset.act !== "draft" || el.dataset.field !== "bls") return;
    const txt = (e.clipboardData || window.clipboardData).getData("text");
    if (!/\s/.test(txt.trim())) return; // 한 건이면 그냥 붙여넣기
    e.preventDefault();
    el.value = triangleParseBls(txt).join(" ");
    el.dataset.dirty = "1";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });

  wrap.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.dataset) return;
    if (el.dataset.act === "field") triangleCommitField(el);
    else if (el.dataset.act === "bl-field") triangleCommitBlField(el);
    else if (el.dataset.act === "bl-add") { el.dataset.dirty = "0"; triangleAddBlsFromText(el.dataset.gk, el.value, el); }
    else if (el.dataset.act === "draft") triangleDraftCommit(el);
  });

  wrap.addEventListener("focusout", (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.act) return;
    // change 이벤트가 먼저 처리된 다음, 입력 중이라 미뤄둔 다시 그리기가 있으면 그때 실행
    setTimeout(() => {
      if (el.dataset) el.dataset.dirty = "0";
      if (triangleRenderPending) renderTriangleList();
    }, 0);
  });
}

async function loadTriangleTab(forceRefresh) {
  const wrap = document.getElementById("triangleListWrap");
  triangleBindEvents();
  triangleLoadPayerMap();
  if (liveSubscribed.triangle && !forceRefresh) { renderTriangleList(); return; }
  if (forceRefresh && triangleUnsubscribe) { triangleUnsubscribe(); triangleUnsubscribe = null; liveSubscribed.triangle = false; }
  if (wrap && !TRIANGLE_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 최신 삼국간 목록을 불러오는 중이에요...</div>';
  await window.fbReady;
  triangleUnsubscribe = window.fbDb.collection(TRIANGLE_COLLECTION).onSnapshot(
    (snapshot) => {
      TRIANGLE_LIST = snapshot.docs.map((doc) => triangleDocToEntry(doc));
      renderTriangleList();
    },
    (err) => {
      console.error("삼국간 실시간 구독 실패:", err);
      if (wrap && !TRIANGLE_LIST.length) wrap.innerHTML = '<div class="empty-state">⚠️ 최신 목록을 불러오지 못했어요 (네트워크 문제일 수 있어요). <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadTriangleTab(true)">다시 시도</button></div>';
    }
  );
  liveSubscribed.triangle = true;
  liveTabUnsubscribers.triangle = () => { if (triangleUnsubscribe) { triangleUnsubscribe(); triangleUnsubscribe = null; liveSubscribed.triangle = false; } };
}

/* =========================================================================
   ➕ 엑셀로 새 건 추가 (붙여넣기 / 파일 올리기)
   ========================================================================= */
let triangleAddOpen = false;
let triangleImport = { total: 0, excl: [], dups: [], groups: [], error: "" };

function toggleTriangleAddPanel() {
  triangleAddOpen = !triangleAddOpen;
  renderTriangleAddPanel();
}

function renderTriangleAddPanel() {
  const panel = document.getElementById("triangleAddPanel");
  if (!panel) return;
  if (!triangleAddOpen) { panel.style.display = "none"; panel.innerHTML = ""; return; }
  triangleLoadPayerMap();
  triangleImport = { total: 0, excl: [], dups: [], groups: [], error: "" };
  panel.style.display = "block";
  panel.innerHTML = '<div class="tx-add">'
    + '<div class="tx-add-tabs"><b>📋 엑셀로 새 건 추가</b>'
    + '<button type="button" class="btn secondary-btn tx-close" onclick="toggleTriangleAddPanel()">✕ 닫기</button></div>'
    + '<div class="hint">엑셀에서 복사해서 붙여넣거나 파일을 올리면 <b>B/L No</b>, <b>Vsl·Voy·Leg</b>(배), <b>Payer</b>(화주)를 읽어요. 숫자가 <b>9로 시작하는 BL은 자동 제외</b>돼요. 헤더를 같이 복사해도, 빼도 돼요. (한두 건은 표 맨 아래 빈 줄에 직접 쓰는 게 빨라요)</div>'
    + '<textarea id="txaPaste" class="tx-paste" rows="4" data-act="imp-paste" placeholder="여기에 붙여넣기 (Ctrl+V)"></textarea>'
    + '<div style="margin-top:6px;"><input type="file" id="txaFile" data-act="imp-file" accept=".xlsx,.xls,.csv"></div>'
    + '<div id="txaPreview"></div>'
    + '<div class="tx-field tx-date"><label>온보드</label><input type="date" id="txaDate"></div>'
    + '<div class="tx-add-actions"><button type="button" class="btn generate-btn" onclick="submitTriangleAdd()">등록</button><span id="txaMsg" class="tx-msg"></span></div>'
    + "</div>";
}

function triangleSetMsg(text, kind) {
  const m = document.getElementById("txaMsg");
  if (!m) return;
  m.textContent = text;
  m.className = "tx-msg" + (kind ? " " + kind : "");
}

/* 엑셀 미리보기에서 화주를 고르거나, 파일/붙여넣기가 바뀔 때 */
document.addEventListener("change", (e) => {
  const el = e.target;
  if (!el.dataset) return;
  if (el.dataset.act === "imp-ship") {
    const g = triangleImport.groups[Number(el.dataset.gi)];
    g.sel = el.value;
    g.auto = !!g.payer && el.value === trianglePayerMap[g.payer];
    triangleRenderImportPreview();
  } else if (el.dataset.act === "imp-file") {
    triangleReadImportFile(el.files && el.files[0]);
  }
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.dataset) return;
  if (el.dataset.act === "imp-ship-new") triangleImport.groups[Number(el.dataset.gi)].nw = el.value;
  else if (el.dataset.act === "imp-paste") triangleParseImportText(el.value);
});

/* ---------- 엑셀 읽기 ---------- */
function triangleParseImportText(text) {
  const rows = String(text || "").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split("\t"));
  triangleParseImportRows(rows);
}

function triangleReadImportFile(file) {
  if (!file) return;
  if (typeof XLSX === "undefined") { alert("엑셀 읽기 도구를 불러오지 못했어요. 붙여넣기로 시도해 주세요."); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
      triangleParseImportRows(rows);
    } catch (err) {
      console.error(err);
      triangleImport = { total: 0, excl: [], dups: [], groups: [], error: "파일을 읽지 못했어요. 엑셀 파일(.xlsx)인지 확인해 주세요." };
      triangleRenderImportPreview();
    }
  };
  reader.readAsArrayBuffer(file);
}

/* rows: 줄마다 칸 배열. 헤더 이름(B/L No, Vsl, Voy, Leg, Payer)으로 열을 찾고, 헤더가 없으면 C·E·F·G·BK 열 위치로 읽어요 */
function triangleParseImportRows(rows) {
  const out = { total: 0, excl: [], dups: [], groups: [], error: "" };
  if (!rows.length) { triangleImport = out; triangleRenderImportPreview(); return; }
  const isBlHead = (c) => /^b\/?l\s*no\.?$/i.test(String(c == null ? "" : c).trim());
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 5); i++) { if (rows[i].some(isBlHead)) { hi = i; break; } }
  let bi = 2, vi = 4, yi = 5, li = 6, pi = 62, start = 0;
  if (hi >= 0) {
    const h = rows[hi].map((c) => String(c == null ? "" : c).trim().toLowerCase());
    bi = h.findIndex((c) => /^b\/?l\s*no\.?$/.test(c));
    vi = h.indexOf("vsl"); yi = h.indexOf("voy"); li = h.indexOf("leg"); pi = h.indexOf("payer");
    start = hi + 1;
    if (vi < 0 || yi < 0) { out.error = "Vsl, Voy 열을 찾지 못했어요. 헤더 줄까지 같이 복사해 주세요."; triangleImport = out; triangleRenderImportPreview(); return; }
  }
  const cell = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
  const existing = new Set(TRIANGLE_LIST.map((t) => triangleBlKey(t.blNumber)));
  const seen = new Set();
  const map = {};
  rows.slice(start).forEach((r) => {
    const bl = cell(r, bi).toUpperCase();
    const m = /^([A-Z]+)(\d+)$/.exec(bl);
    if (!m) return;
    out.total++;
    if (m[2].charAt(0) === "9") { out.excl.push(bl); return; }
    if (existing.has(bl) || seen.has(bl)) { out.dups.push(bl); return; }
    seen.add(bl);
    const vessel = triangleCanonVessel((cell(r, vi) + " " + cell(r, yi) + cell(r, li)).trim());
    const payer = trianglePayerKey(pi >= 0 ? cell(r, pi) : "");
    const key = triangleCompact(vessel) + "|" + payer;
    if (!map[key]) {
      const mapped = payer ? (trianglePayerMap[payer] || "") : "";
      map[key] = { vessel, payer, bls: [], sel: mapped, nw: "", auto: !!mapped };
      out.groups.push(map[key]);
    }
    map[key].bls.push(bl);
  });
  if (!out.total) out.error = "BL 번호를 찾지 못했어요. B/L No 열이 들어 있게 복사해 주세요.";
  triangleImport = out;
  triangleRenderImportPreview();
}

function triangleRenderImportPreview() {
  const box = document.getElementById("txaPreview");
  if (!box) return;
  const imp = triangleImport;
  if (imp.error) { box.innerHTML = '<div class="tx-msg err">' + escapeHtml(imp.error) + "</div>"; return; }
  if (!imp.total) { box.innerHTML = ""; return; }
  const kept = imp.groups.reduce((a, g) => a + g.bls.length, 0);
  let h = '<div class="tx-pv-sum">인식 <b>' + imp.total + "건</b> → 9로 시작해서 제외 " + imp.excl.length + "건"
    + (imp.dups.length ? " · 이미 등록됨 " + imp.dups.length + "건" : "")
    + ' → <b class="tx-ok">등록 ' + kept + "건</b></div>";
  const shippers = triangleShipperOptions();
  imp.groups.forEach((g, gi) => {
    h += '<div class="tx-pv-card"><div><b>' + escapeHtml(g.vessel || "배 미입력") + '</b> <span class="tx-sub">BL ' + g.bls.length + "건 · Payer " + escapeHtml(g.payer || "없음") + "</span></div>"
      + '<div class="tx-pv-bls">' + g.bls.map(escapeHtml).join("<br>") + "</div>"
      + '<select class="tx-sel" data-act="imp-ship" data-gi="' + gi + '"><option value="">화주 선택</option>'
      + shippers.map((s) => "<option" + (s === g.sel ? " selected" : "") + ' value="' + escapeHtml(s) + '">' + escapeHtml(s) + "</option>").join("")
      + '<option value="__new"' + (g.sel === "__new" ? " selected" : "") + ">＋ 새 화주 추가</option></select>"
      + (g.sel === "__new" ? '<input class="tx-snew" data-act="imp-ship-new" data-gi="' + gi + '" placeholder="새 화주 이름" value="' + escapeHtml(g.nw) + '" style="display:block;">' : "")
      + (g.auto ? '<div class="tx-note ok">Payer ' + escapeHtml(g.payer) + " 기준으로 화주가 자동으로 들어갔어요</div>"
        : (g.payer ? '<div class="tx-note warn">처음 보는 Payer예요. 한 번만 골라 주세요. 다음부터는 자동이에요</div>'
          : '<div class="tx-note warn">Payer 정보가 없어요. 화주를 골라 주세요</div>')) + "</div>";
  });
  if (imp.excl.length) h += '<div class="tx-sub">제외(9로 시작): ' + imp.excl.map(escapeHtml).join(", ") + "</div>";
  if (imp.dups.length) h += '<div class="tx-sub">이미 있어서 제외: ' + imp.dups.map(escapeHtml).join(", ") + "</div>";
  box.innerHTML = h;
}

/* ---------- 등록 ---------- */
async function submitTriangleAdd() {
  const date = (document.getElementById("txaDate") || {}).value || "";
  const imp = triangleImport;
  if (!imp.groups.length) { triangleSetMsg(imp.total ? "등록할 BL이 없어요" : "엑셀 내용을 먼저 붙여넣거나 파일을 올려 주세요", "err"); return; }
  const items = [];     // [{ vessel, shipper, bls }]
  const links = [];     // 처음 연결할 Payer → 화주
  for (const g of imp.groups) {
    const raw = g.sel === "__new" ? g.nw.trim().toUpperCase() : g.sel;
    if (!raw) { triangleSetMsg("화주를 골라 주세요 (" + (g.vessel || "배 미입력") + ")", "err"); return; }
    if (!g.vessel) { triangleSetMsg("배(Vsl·Voy·Leg)를 읽지 못한 BL이 있어요", "err"); return; }
    const shipper = triangleCanonShipper(raw);
    items.push({ vessel: g.vessel, shipper, bls: g.bls.slice() });
    if (g.payer && !trianglePayerMap[g.payer]) links.push([g.payer, shipper]);
  }

  const existing = new Set(TRIANGLE_LIST.map((t) => triangleBlKey(t.blNumber)));
  const dups = [];
  let createdLines = 0, mergedLines = 0, total = 0;
  try {
    await window.fbReady;
    const nowIso = new Date().toISOString();
    const batch = window.fbDb.batch();
    let ops = 0;
    for (const it of items) {
      const fresh = it.bls.filter((b) => { if (existing.has(b)) { dups.push(b); return false; } existing.add(b); return true; });
      if (!fresh.length) continue;
      const entries = triangleEntriesOfGroup(triangleGroupKey(it.vessel, it.shipper));
      let tpl;
      if (entries.length) {
        tpl = triangleTemplateFromEntries(entries);
        if (!tpl.onboardDate && date) { // 온보드가 비어 있던 줄이면 이번에 입력한 날짜를 줄 전체에 채워줘요
          tpl.onboardDate = date;
          entries.forEach((e) => { batch.update(window.fbDb.collection(TRIANGLE_COLLECTION).doc(e.id), { onboardDate: date }); ops++; });
        }
        mergedLines++;
      } else {
        tpl = { vessel: it.vessel, shipper: it.shipper, onboardDate: date, secondVessel: "", groupRemark: "" };
        createdLines++;
      }
      fresh.forEach((bl) => {
        batch.set(window.fbDb.collection(TRIANGLE_COLLECTION).doc(), triangleNewDocData(bl, tpl, nowIso));
        ops++; total++;
      });
    }
    if (!total) { triangleSetMsg("등록된 BL이 없어요" + (dups.length ? " · 이미 있는 BL: " + dups.join(", ") : ""), "err"); return; }
    if (ops > 450) throw new Error("한 번에 등록할 수 있는 양(약 450건)을 넘었어요. 나눠서 등록해 주세요.");
    await batch.commit();
  } catch (err) {
    console.error("삼국간 등록 실패:", err);
    triangleSetMsg("등록에 실패했어요: " + err.message, "err");
    return;
  }

  let saveWhere = "server";
  for (const [payer, shipper] of links) { if ((await triangleSavePayerLink(payer, shipper)) === "local") saveWhere = "local"; }

  let note = "BL " + total + "건 등록 (" + (createdLines ? "새 줄 " + createdLines : "") + (createdLines && mergedLines ? " · " : "") + (mergedLines ? "기존 줄에 추가 " + mergedLines : "") + ")";
  if (dups.length) note += " · 이미 있는 BL 제외: " + dups.join(", ");
  if (links.length) note += " · Payer 연결 저장" + (saveWhere === "local" ? "(이 PC에만 저장됐어요)" : "");
  const paste = document.getElementById("txaPaste"); if (paste) paste.value = "";
  const file = document.getElementById("txaFile"); if (file) file.value = "";
  triangleImport = { total: 0, excl: [], dups: [], groups: [], error: "" };
  triangleRenderImportPreview();
  triangleSetMsg(note, dups.length ? "warn" : "ok");
}
