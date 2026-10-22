/* =========================================================================
   📨 도착지 B/L 발행 - 현지(도착지) 발행 요청을 BL 한 건씩 기록해두고, 도착지별로 메일을 만들어요

   ■ BL 1건 = 한 줄 (BL 번호 · 배 · POL · POD · 요청일) + "메일 발송" / "발행 완료" 체크
     → 도착지에 요청 메일을 보냈는지, 발행이 끝났는지 한눈에 보여서 까먹지 않아요.
   ■ 메일 만들기: 체크한 줄(체크가 없으면 "메일 발송 전" 줄 전체)을 POD(도착지)별로 한 통씩 묶어서 만들어요.
     · 본문·제목은 "메일 템플릿" 탭에 만들어 둔 "도착지 B/L 발행" 템플릿을 그대로 써요
       (템플릿의 {{BL}} {{배}} {{POL}} {{POD}} {{요청일}} 같은 자리를 자동으로 채우고, {{표}} 자리에는 BL 표가 들어가요).
     · 받는 사람(To)/참조(CC)는 아래 "도착지별 수신처"에 한 번만 등록해두면 도착지마다 자동으로 들어가요.
   ■ 저장 위치(Firestore, 팀 전체 실시간 공유)
       dest_bl_requests : BL 한 건당 문서 하나
       dest_bl_contacts : 도착지(POD)별 받는 사람/참조
   ========================================================================= */
const DESTBL_REQ_COLLECTION = "dest_bl_requests";
const DESTBL_CONTACT_COLLECTION = "dest_bl_contacts";
const DESTBL_TPL_PREF_KEY = "dest_bl_tpl_id_v1";   // 이 브라우저에서 마지막으로 고른 메일 템플릿

let DESTBL_LIST = [];
let DESTBL_CONTACTS = {};         // POD → { to, cc }
let destBlUnsubReq = null, destBlUnsubContacts = null;
let destBlBuilt = false;
let destBlChip = null;            // "unsent"(메일 발송 전) | "wait"(발행 대기) | null
let destBlHideDone = false;
let destBlSelected = new Set();   // 체크한 줄 id
let destBlDraft = { bl: "", vessel: "", pol: "", pod: "", req: "" };
let destBlArmedDelete = null;
let destBlMail = { open: false, ids: [], pod: null };
let destBlRenderPending = false;
let destBlStatusTimer = null;

function destBlSay(text, kind) {
  const el = document.getElementById("dbStatus");
  if (!el) return;
  el.textContent = text || "";
  el.className = "db-status " + (kind || "");
  clearTimeout(destBlStatusTimer);
  if (text) destBlStatusTimer = setTimeout(() => destBlSay("", ""), 9000);
}
function destBlFail(msg) { destBlSay(msg, "bad"); renderDestBlTable(); }

function destBlToday() {
  const n = new Date();
  return n.getFullYear() + "-" + gridPad2(n.getMonth() + 1) + "-" + gridPad2(n.getDate());
}
function destBlDaysSince(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return 0;
  const n = new Date();
  return Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000);
}
function destBlIsDone(r) { return r.sent === "O" && r.issued === "O"; }
function destBlBlKey(s) { return String(s || "").trim().toUpperCase(); }
function destBlParseBls(text) {
  const out = [];
  String(text || "").toUpperCase().split(/[\s,;]+/).filter(Boolean).forEach((b) => { if (out.indexOf(b) < 0) out.push(b); });
  return out;
}
function destBlContactId(pod) { return String(pod || "").toUpperCase().replace(/[^A-Z0-9_\-]/g, "_"); }

function destBlDocToEntry(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    bl: d.bl || "", vessel: d.vessel || "", pol: d.pol || "", pod: d.pod || "",
    req: d.reqDate || "", sent: d.sent === "O" ? "O" : "", issued: d.issued === "O" ? "O" : "",
    createdAt: d.createdAtIso || (d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : ""),
  };
}

/* =========================================================================
   화면 만들기 (한 번만) - 표/메일/수신처 영역은 각각 따로 다시 그려요
   ========================================================================= */
function destBlBuild() {
  const wrap = document.getElementById("destBlWrap");
  if (!wrap || destBlBuilt) return;
  destBlBuilt = true;
  wrap.innerHTML = '<div id="dbStatus" class="db-status"></div><div id="dbChips" class="tri-bar"></div><div id="dbTable"></div>'
    + '<div class="db-actions"><button type="button" class="btn generate-btn" id="dbMake">✉️ 메일 만들기</button>'
    + '<span class="hint" style="margin:0;">체크한 줄로 만들어요. 체크가 없으면 "메일 발송 전" 줄 전체로 만들어요</span></div>'
    + '<div id="dbMail"></div>'
    + '<div class="db-box"><div class="db-box-title">📮 도착지별 수신처 <span class="hint" style="margin:0 0 0 8px;font-weight:400;">한 번 등록해두면 메일을 만들 때 받는 사람·참조가 자동으로 들어가요</span></div><div id="dbContacts"></div></div>';

  document.getElementById("dbMake").addEventListener("click", destBlOpenMail);
  document.getElementById("dbChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-chip]");
    if (!b) return;
    const k = b.dataset.chip;
    if (k === "done") destBlHideDone = !destBlHideDone; else destBlChip = destBlChip === k ? null : k;
    renderDestBlTable();
  });

  const t = document.getElementById("dbTable");
  t.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || !t.contains(el)) return;
    const id = el.dataset.id, act = el.dataset.act;
    if (act === "sent" || act === "issued") destBlToggle(id, act);
    else if (act === "del") destBlOnTrash(id);
    else if (act === "sel") { if (el.checked) destBlSelected.add(id); else destBlSelected.delete(id); destBlSyncAll(); }
    else if (act === "sel-all") {
      DESTBL_LIST.filter((r) => r.sent !== "O" && !destBlIsDone(r)).forEach((r) => { if (el.checked) destBlSelected.add(r.id); else destBlSelected.delete(r.id); });
      renderDestBlTable();
    }
  });
  t.addEventListener("focusin", (e) => { const el = e.target; if (el.dataset && el.dataset.f && el.tagName === "INPUT") { el.dataset.orig = el.value; el.select(); } });
  t.addEventListener("input", (e) => { const el = e.target; if (el.classList && el.classList.contains("db-in")) el.dataset.dirty = "1"; });
  t.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.f || el.tagName !== "INPUT") return;
    if (e.key === "Escape") { if (el.dataset.orig != null) el.value = el.dataset.orig; el.dataset.dirty = "0"; return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const all = Array.from(t.querySelectorAll('input[data-f="' + el.dataset.f + '"]'));
      const nx = all[all.indexOf(el) + (e.shiftKey ? -1 : 1)];
      const desc = nx ? { f: nx.dataset.f, id: nx.dataset.id, d: nx.dataset.draft } : null;
      el.blur();
      if (desc) {
        const sel = 'input[data-f="' + desc.f + '"]' + (desc.id ? '[data-id="' + desc.id + '"]' : '[data-draft="1"]');
        const target = t.querySelector(sel);
        if (target) target.focus();
      }
    }
  });
  t.addEventListener("paste", (e) => {
    const el = e.target;
    if (!el.dataset || el.dataset.draft !== "1" || el.dataset.f !== "bl") return;
    const txt = (e.clipboardData || window.clipboardData).getData("text");
    if (!/[\t\n\s]/.test(txt.trim())) return; // 한 건이면 그냥 붙여넣기
    e.preventDefault();
    destBlPaste(txt);
  });
  t.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.dataset) return;
    if (el.dataset.draft === "1") destBlDraftCommit(el);
    else if (el.dataset.f && el.dataset.id) destBlCommitField(el);
  });
  t.addEventListener("focusout", (e) => {
    const el = e.target;
    setTimeout(() => { if (el.dataset) el.dataset.dirty = "0"; if (destBlRenderPending) renderDestBlTable(); }, 0);
  });

  const c = document.getElementById("dbContacts");
  c.addEventListener("input", (e) => { if (e.target.classList && e.target.classList.contains("db-in")) e.target.dataset.dirty = "1"; });
  c.addEventListener("change", (e) => { const el = e.target; if (el.dataset && el.dataset.pod != null) destBlSaveContact(el); });
  c.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); e.target.blur(); } });
  c.addEventListener("focusout", (e) => { const el = e.target; setTimeout(() => { if (el.dataset) el.dataset.dirty = "0"; }, 0); });

  const m = document.getElementById("dbMail");
  m.addEventListener("click", destBlOnMailClick);
  m.addEventListener("change", destBlOnMailChange);
  m.addEventListener("input", (e) => { if (e.target.id === "dbMSubject") e.target.dataset.edited = "1"; });
}

function destBlVisible(r) {
  if (destBlHideDone && destBlIsDone(r)) return false;
  if (destBlChip) {
    if (destBlIsDone(r)) return false;
    if (destBlChip === "unsent" && r.sent === "O") return false;
    if (destBlChip === "wait" && !(r.sent === "O" && r.issued !== "O")) return false;
  }
  return true;
}

function renderDestBlTable() {
  const wrap = document.getElementById("dbTable");
  if (!wrap) return;
  const ae = document.activeElement;
  if (ae && wrap.contains(ae) && ae.dataset && ae.dataset.dirty === "1") { destBlRenderPending = true; return; }
  destBlRenderPending = false;
  const focusToken = typeof gridCaptureFocus === "function" ? gridCaptureFocus(wrap) : null;
  const esc = escapeHtml;

  // 칩 숫자 (진행 중인 줄 기준)
  const open = DESTBL_LIST.filter((r) => !destBlIsDone(r));
  const nUnsent = open.filter((r) => r.sent !== "O").length;
  const nWait = open.filter((r) => r.sent === "O" && r.issued !== "O").length;
  const chip = (k, label, n) => '<button type="button" class="tri-chip' + (destBlChip === k ? " active" : "") + '" data-chip="' + k + '">' + label + '<span class="n">' + n + "</span></button>";
  document.getElementById("dbChips").innerHTML = chip("unsent", "메일 발송 전", nUnsent) + chip("wait", "발행 대기", nWait)
    + '<button type="button" class="tri-chip' + (destBlHideDone ? " active" : "") + '" data-chip="done">' + (destBlHideDone ? "완료 건 보이기" : "완료 건 숨기기") + "</button>";

  // 정렬: 아직 안 끝난 줄은 오래된 요청이 위로(까먹기 쉬운 것부터), 끝난 줄은 맨 아래
  const rows = DESTBL_LIST.filter(destBlVisible).sort((a, b) => {
    const da = destBlIsDone(a) ? 1 : 0, db = destBlIsDone(b) ? 1 : 0;
    if (da !== db) return da - db;
    const c = da ? (b.req || "").localeCompare(a.req || "") : (a.req || "").localeCompare(b.req || "");
    return c || a.bl.localeCompare(b.bl);
  });

  const vessels = Array.from(new Set(DESTBL_LIST.map((r) => r.vessel).filter(Boolean)));
  const pols = Array.from(new Set(DESTBL_LIST.map((r) => r.pol).filter(Boolean)));
  const pods = Array.from(new Set(DESTBL_LIST.map((r) => r.pod).filter(Boolean)));
  const opt = (arr) => arr.map((v) => '<option value="' + esc(v) + '">').join("");
  const pill = (v, wait) => v === "O" ? '<span class="tri-pill done">완료</span>' : '<span class="tri-pill wait">' + wait + "</span>";

  const unsentIds = open.filter((r) => r.sent !== "O").map((r) => r.id);
  const allChecked = unsentIds.length > 0 && unsentIds.every((id) => destBlSelected.has(id));

  let h = '<datalist id="dbDlVessel">' + opt(vessels) + '</datalist><datalist id="dbDlPol">' + opt(pols) + '</datalist><datalist id="dbDlPod">' + opt(pods) + "</datalist>"
    + '<div class="table-scroll-wrap"><table class="contacts-table db-table"><colgroup><col style="width:36px"><col style="width:190px"><col style="width:140px"><col style="width:90px"><col style="width:100px"><col style="width:120px"><col style="width:90px"><col style="width:90px"><col style="width:44px"></colgroup>'
    + '<thead><tr><th><input type="checkbox" data-act="sel-all" title="메일 발송 전 줄 전체 선택"' + (allChecked ? " checked" : "") + '></th><th>BL 번호</th><th>배(VSL)</th><th>POL</th><th>POD(도착지)</th><th>요청일</th><th>메일 발송</th><th>발행 완료</th><th></th></tr></thead><tbody>';
  rows.forEach((r) => {
    const id = esc(r.id);
    const late = r.sent !== "O" && destBlDaysSince(r.req) >= 2;
    const cell = (f, val, list, style) => '<td class="no-strike"><input class="db-in" type="text" autocomplete="off" data-f="' + f + '" data-id="' + id + '" value="' + esc(val) + '"' + (list ? ' list="' + list + '"' : "") + (style ? ' style="' + style + '"' : "") + "></td>";
    h += '<tr class="' + (destBlIsDone(r) ? "row-done" : "") + '" data-id="' + id + '">'
      + '<td class="no-strike" style="text-align:center;"><input type="checkbox" data-act="sel" data-id="' + id + '"' + (destBlSelected.has(r.id) ? " checked" : "") + (destBlIsDone(r) ? " disabled" : "") + "></td>"
      + cell("bl", r.bl, "", "font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600;")
      + cell("vessel", r.vessel, "dbDlVessel") + cell("pol", r.pol, "dbDlPol") + cell("pod", r.pod, "dbDlPod")
      + cell("req", r.req ? gridFmtDate(r.req) : "", "", late ? "color:#b91c1c;font-weight:700;" : "")
      + '<td class="no-strike db-tg" data-act="sent" data-id="' + id + '">' + pill(r.sent, "발송 전") + "</td>"
      + '<td class="no-strike db-tg" data-act="issued" data-id="' + id + '">' + pill(r.issued, "대기") + "</td>"
      + '<td class="no-strike db-trash' + (destBlArmedDelete === r.id ? " armed" : "") + '" data-act="del" data-id="' + id + '" title="삭제 (두 번 누르면 삭제돼요)">🗑</td></tr>';
  });
  const d = destBlDraft;
  const dcell = (f, v, ph, list) => '<td class="no-strike"><input class="db-in" type="text" autocomplete="off" data-f="' + f + '" data-draft="1" value="' + esc(v) + '" placeholder="' + ph + '"' + (list ? ' list="' + list + '"' : "") + "></td>";
  h += '<tr class="db-draft"><td></td>' + dcell("bl", d.bl, "+ BL 붙여넣기", "") + dcell("vessel", d.vessel, "배 (RM1 11W)", "dbDlVessel") + dcell("pol", d.pol, "POL", "dbDlPol")
    + dcell("pod", d.pod, "POD", "dbDlPod") + dcell("req", d.req ? gridFmtDate(d.req) : "", "요청일(오늘)", "") + '<td colspan="3"></td></tr>';
  h += "</tbody></table></div>";
  if (!DESTBL_LIST.length) h += '<div class="empty-state">아직 등록된 건이 없어요. 표 맨 아래 빈 줄에 BL·배·POD를 쓰면 한 줄이 추가돼요.</div>';
  wrap.innerHTML = h;
  renderDestBlContacts();
  if (focusToken) gridRestoreFocus(wrap, focusToken);
}

function destBlSyncAll() {
  const unsentIds = DESTBL_LIST.filter((r) => !destBlIsDone(r) && r.sent !== "O").map((r) => r.id);
  const box = document.querySelector('#dbTable input[data-act="sel-all"]');
  if (box) box.checked = unsentIds.length > 0 && unsentIds.every((id) => destBlSelected.has(id));
}

function renderDestBlContacts() {
  const wrap = document.getElementById("dbContacts");
  if (!wrap) return;
  const ae = document.activeElement;
  if (ae && wrap.contains(ae) && ae.dataset && ae.dataset.dirty === "1") return;
  const pods = Array.from(new Set(DESTBL_LIST.map((r) => r.pod).filter(Boolean).concat(Object.keys(DESTBL_CONTACTS)))).sort();
  const esc = escapeHtml;
  if (!pods.length) { wrap.innerHTML = '<div class="empty-state" style="margin:0;">줄이 등록되면 도착지(POD)가 여기에 나타나요.</div>'; return; }
  wrap.innerHTML = '<table class="contacts-table db-table"><colgroup><col style="width:110px"><col><col style="width:36%"></colgroup><thead><tr><th>POD</th><th>받는 사람(To)</th><th>참조(CC)</th></tr></thead><tbody>'
    + pods.map((p) => {
      const c = DESTBL_CONTACTS[p] || { to: "", cc: "" };
      return "<tr><td><b>" + esc(p) + '</b></td><td class="no-strike"><input class="db-in" data-pod="' + esc(p) + '" data-pf="to" value="' + esc(c.to) + '" placeholder="받는 사람 메일 주소 (여러 개는 ; 로 구분)"></td>'
        + '<td class="no-strike"><input class="db-in" data-pod="' + esc(p) + '" data-pf="cc" value="' + esc(c.cc) + '" placeholder="참조 (선택)"></td></tr>';
    }).join("") + "</tbody></table>";
}

/* =========================================================================
   줄 만들기 / 고치기 / 삭제 / 체크
   ========================================================================= */
function destBlNormVessel(raw, allowEmpty) {
  const v = gridNormText(raw);
  if (!v) return allowEmpty ? { value: "" } : { error: "배 이름을 입력해 주세요" };
  const known = DESTBL_LIST.find((r) => gridCompact(r.vessel) === gridCompact(v));
  if (known) return { value: known.vessel };
  if (typeof TRIANGLE_LIST !== "undefined" && Array.isArray(TRIANGLE_LIST)) {
    const t = TRIANGLE_LIST.find((x) => gridCompact(x.vessel) === gridCompact(v));
    if (t) return { value: String(t.vessel).trim() };
  }
  if (!GRID_VESSEL_FORMAT.test(v)) return { error: '배는 "선명 항차+방향" 형식으로 써 주세요 (예: RM1 11W, ZIM ARIES 12E)' };
  return { value: v };
}

async function destBlWrite(fn) {
  try { await window.fbReady; await fn(window.fbDb.collection(DESTBL_REQ_COLLECTION)); return true; }
  catch (err) { console.error("도착지 BL 저장 실패:", err); destBlSay("저장에 실패했어요: " + (err && err.code === "permission-denied" ? "권한이 없어요 (Firestore 규칙에 dest_bl_requests가 추가됐는지 확인해 주세요)" : (err.message || err)), "bad"); return false; }
}

async function destBlCommitField(el) {
  el.dataset.dirty = "0";
  const r = DESTBL_LIST.find((x) => x.id === el.dataset.id);
  if (!r) return;
  const f = el.dataset.f, txt = el.value;
  const patch = {};
  if (f === "bl") {
    const b = destBlBlKey(txt);
    if (!/^[A-Z]+\d+$/.test(b)) return destBlFail("BL 형식이 이상해요: " + txt.trim());
    const dup = DESTBL_LIST.find((x) => x.id !== r.id && destBlBlKey(x.bl) === b);
    if (dup) return destBlFail("이미 등록된 BL이에요: " + b + " (" + dup.vessel + " → " + dup.pod + ")");
    patch.bl = b;
  } else if (f === "vessel") {
    const v = destBlNormVessel(txt, false); if (v.error) return destBlFail(v.error);
    patch.vessel = v.value;
  } else if (f === "pol" || f === "pod") {
    const v = gridNormText(txt);
    if (f === "pod" && !v) return destBlFail("POD(도착지)는 비울 수 없어요");
    patch[f] = v;
  } else if (f === "req") {
    const d = gridParseDate(txt);
    if (d === null || d === "") return destBlFail('요청일: "' + txt.trim() + '" 날짜를 읽지 못했어요 (예: 10/21 또는 1021)');
    patch.reqDate = d;
  }
  if (await destBlWrite((col) => col.doc(r.id).update(patch))) destBlSay("저장됐어요", "ok");
}

async function destBlToggle(id, which) {
  const r = DESTBL_LIST.find((x) => x.id === id);
  if (!r) return;
  const patch = {};
  const next = r[which] === "O" ? "" : "O";
  patch[which] = next;
  if (which === "issued" && next === "O" && r.sent !== "O") patch.sent = "O"; // 발행됐다면 메일은 이미 보낸 것
  if (which === "sent" && next === "") patch.issued = "";                       // 발송 취소하면 발행 완료도 같이 해제
  await destBlWrite((col) => col.doc(id).update(patch));
}

function destBlOnTrash(id) {
  const r = DESTBL_LIST.find((x) => x.id === id);
  if (!r) return;
  if (destBlArmedDelete !== id) {
    destBlArmedDelete = id;
    destBlSay("한 번 더 누르면 " + r.bl + " 줄을 삭제해요", "warn");
    renderDestBlTable();
    setTimeout(() => { if (destBlArmedDelete === id) { destBlArmedDelete = null; renderDestBlTable(); } }, 3000);
    return;
  }
  destBlArmedDelete = null;
  destBlSelected.delete(id);
  destBlWrite((col) => col.doc(id).delete()).then((ok) => { if (ok) destBlSay("삭제했어요", "ok"); });
}

/* ---- 맨 아래 빈 줄 ---- */
function destBlDraftCommit(el) {
  el.dataset.dirty = "0";
  const f = el.dataset.f, txt = el.value, d = destBlDraft;
  if (f === "bl") {
    const bls = destBlParseBls(txt);
    if (bls.length > 1) { destBlPaste(bls.join("\n")); return; }
    d.bl = bls[0] || "";
  } else if (f === "vessel") {
    if (!txt.trim()) d.vessel = "";
    else { const v = destBlNormVessel(txt, false); if (v.error) { d.vessel = ""; return destBlFail(v.error); } d.vessel = v.value; }
  } else if (f === "pol" || f === "pod") {
    d[f] = gridNormText(txt);
  } else if (f === "req") {
    const v = gridParseDate(txt);
    if (v === null) { d.req = ""; return destBlFail('요청일: "' + txt.trim() + '" 날짜를 읽지 못했어요 (예: 10/21 또는 1021)'); }
    d.req = v;
  }
  destBlDraftTryCreate();
}

async function destBlDraftTryCreate() {
  const d = destBlDraft;
  if (!(d.bl && d.vessel && d.pod)) {
    const miss = [];
    if (!d.bl) miss.push("BL"); if (!d.vessel) miss.push("배"); if (!d.pod) miss.push("POD");
    if (d.bl || d.vessel || d.pod) destBlSay(miss.join(", ") + "까지 쓰면 한 줄이 추가돼요", "warn");
    renderDestBlTable();
    return;
  }
  if (!/^[A-Z]+\d+$/.test(d.bl)) return destBlFail("BL 형식이 이상해요: " + d.bl);
  const dup = DESTBL_LIST.find((x) => destBlBlKey(x.bl) === d.bl);
  if (dup) return destBlFail("이미 등록된 BL이에요: " + d.bl + " (" + dup.vessel + " → " + dup.pod + ")");
  const ok = await destBlWrite((col) => col.doc().set(destBlNewDoc(d.bl, d)));
  if (!ok) return;
  destBlDraft = { bl: "", vessel: "", pol: "", pod: "", req: "" };
  destBlSay("한 줄 추가했어요", "ok");
  renderDestBlTable();
  const first = document.querySelector('#dbTable input[data-draft="1"][data-f="bl"]');
  if (first) first.focus();
}

function destBlNewDoc(bl, v) {
  return {
    bl, vessel: v.vessel, pol: v.pol || "", pod: v.pod, reqDate: v.req || destBlToday(), sent: "", issued: "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdAtIso: new Date().toISOString(),
  };
}

/* BL 여러 건 붙여넣기
   · 엑셀에서 여러 열을 복사한 경우: 열 순서는 BL, 배, POL, POD, 요청일
   · BL 번호만 여러 개: 맨 아래 빈 줄에 미리 쓴 배·POL·POD·요청일을 모두 같은 값으로 써요 */
async function destBlPaste(text) {
  const lines = String(text).replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const multiCol = lines.some((l) => l.indexOf("\t") >= 0);
  const items = [], problems = [];
  const seen = new Set(DESTBL_LIST.map((r) => destBlBlKey(r.bl)));
  const addItem = (bl, vessel, pol, pod, reqRaw, label) => {
    const b = destBlBlKey(bl);
    const who = label === b ? "" : label + ": ";
    if (!/^[A-Z]+\d+$/.test(b)) { problems.push(who + "BL 형식 " + bl); return; }
    if (seen.has(b)) { problems.push(who + "이미 있는 BL " + b); return; }
    const v = destBlNormVessel(vessel, false); if (v.error) { problems.push(label + ": " + v.error); return; }
    const p = gridNormText(pod); if (!p) { problems.push(label + ": POD가 없어요"); return; }
    let req = destBlToday();
    if (reqRaw) { const d = gridParseDate(reqRaw); if (d === null || d === "") { problems.push(label + ": 요청일 " + reqRaw); return; } req = d; }
    seen.add(b);
    items.push({ bl: b, vessel: v.value, pol: gridNormText(pol), pod: p, req });
  };
  if (multiCol) {
    lines.forEach((l, i) => { const c = l.split("\t").map((x) => x.trim()); if (i === 0 && /^b\/?l/i.test(c[0] || "")) return; addItem(c[0], c[1], c[2], c[3], c[4], (i + 1) + "번째 줄"); });
  } else {
    const d = destBlDraft;
    if (!d.vessel || !d.pod) { destBlDraft.bl = destBlParseBls(text).join(" "); return destBlFail("여러 BL을 붙여넣으려면 배와 POD를 먼저 써 주세요 (모두 같은 값으로 들어가요)"); }
    destBlParseBls(text).forEach((b) => addItem(b, d.vessel, d.pol, d.pod, d.req ? d.req : "", b));
  }
  if (!items.length) return destBlFail(problems.length ? problems.slice(0, 3).join(" / ") : "붙여넣은 내용에서 읽을 수 있는 BL이 없어요");
  const ok = await destBlWrite(async (col) => {
    await window.fbReady;
    for (let i = 0; i < items.length; i += 400) {
      const batch = window.fbDb.batch();
      items.slice(i, i + 400).forEach((it) => batch.set(col.doc(), destBlNewDoc(it.bl, it)));
      await batch.commit();
    }
  });
  if (!ok) return;
  destBlDraft = { bl: "", vessel: "", pol: "", pod: "", req: "" };
  destBlSay(items.length + "건 추가했어요" + (problems.length ? " · 건너뜀 " + problems.length + "건 (" + problems.slice(0, 2).join(" / ") + ")" : ""), problems.length ? "warn" : "ok");
  renderDestBlTable();
}

/* ---- 도착지별 수신처 ---- */
async function destBlSaveContact(el) {
  el.dataset.dirty = "0";
  const pod = el.dataset.pod, field = el.dataset.pf;
  const value = el.value.trim();
  const cur = DESTBL_CONTACTS[pod] || { to: "", cc: "" };
  const next = { to: cur.to, cc: cur.cc }; next[field] = value;
  try {
    await window.fbReady;
    await window.fbDb.collection(DESTBL_CONTACT_COLLECTION).doc(destBlContactId(pod)).set({ pod, to: next.to, cc: next.cc, updatedAtIso: new Date().toISOString() }, { merge: true });
    destBlSay("수신처를 저장했어요", "ok");
  } catch (err) {
    console.error("수신처 저장 실패:", err);
    destBlSay("저장에 실패했어요: " + (err && err.code === "permission-denied" ? "권한이 없어요 (Firestore 규칙에 dest_bl_contacts가 추가됐는지 확인해 주세요)" : (err.message || err)), "bad");
  }
}

/* =========================================================================
   ✉️ 메일 만들기
   ========================================================================= */
function destBlTemplates() { return (typeof TEMPLATES !== "undefined" && Array.isArray(TEMPLATES)) ? TEMPLATES : []; }

/* 메일 템플릿 중 "도착지 … 발행"처럼 이름이 비슷한 것을 자동으로 찾아요 (직접 고른 게 있으면 그걸 우선) */
function destBlPickTemplate() {
  const list = destBlTemplates();
  let id = "";
  try { id = localStorage.getItem(DESTBL_TPL_PREF_KEY) || ""; } catch (e) { /* 무시 */ }
  const saved = list.find((t) => t.id === id);
  if (saved) return saved;
  return list.find((t) => /도착지/.test(t.label || "") && /(오비엘|B\/?L|비엘|발행)/i.test(t.label || ""))
    || list.find((t) => /(도착지|현지).*(발행)|발행.*(도착지|현지)/.test(t.label || "")) || null;
}

function destBlOpenMail() {
  const picked = DESTBL_LIST.filter((r) => destBlSelected.has(r.id) && !destBlIsDone(r));
  const rows = picked.length ? picked : DESTBL_LIST.filter((r) => r.sent !== "O" && !destBlIsDone(r));
  destBlMail = { open: true, ids: rows.map((r) => r.id), pod: null };
  if (!rows.length) destBlSay("메일로 만들 줄이 없어요 (체크하거나, 메일 발송 전 줄이 있어야 해요)", "warn");
  renderDestBlMail();
}

/* 템플릿 칸 이름으로 어떤 값을 넣을지 정해요: BL·배·POL·POD·요청일 */
function destBlFieldValue(label, rows, pod) {
  const k = String(label || "").replace(/\s+/g, "").toLowerCase();
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
  if (/(요청일|요청날짜|date|날짜)/.test(k)) return uniq(rows.map((r) => gridFmtDate(r.req).replace(/\(.\)/, ""))).join(", ");
  if (/(b\/?l|비엘|오비엘|obl)/.test(k)) return rows.map((r) => r.bl).join(", ");
  if (/(선박|모선|vsl|vessel|^배)/.test(k)) return uniq(rows.map((r) => r.vessel)).join(", ");
  if (/(pol|선적항)/.test(k)) return uniq(rows.map((r) => r.pol)).join(", ");
  if (/(pod|도착지|양하항|dest)/.test(k)) return pod;
  return null; // 자동으로 채울 수 없는 칸
}

function destBlTableHtml(rows) {
  const th = 'style="border:1px solid #888;padding:4px 10px;background:#eee;text-align:left;"', td = 'style="border:1px solid #888;padding:4px 10px;"';
  return '<table style="border-collapse:collapse;margin:8px 0;"><tr><th ' + th + ">B/L No</th><th " + th + ">Vessel</th><th " + th + ">POL</th><th " + th + ">POD</th></tr>"
    + rows.map((r) => "<tr><td " + td + ">" + escapeHtml(r.bl) + "</td><td " + td + ">" + escapeHtml(r.vessel) + "</td><td " + td + ">" + escapeHtml(r.pol) + "</td><td " + td + ">" + escapeHtml(r.pod) + "</td></tr>").join("") + "</table>";
}

/* 한 도착지(rows는 모두 같은 POD)의 메일 내용을 만들어요 → { to, cc, subject, html, notes[] } */
function destBlBuildMail(pod, rows, tpl) {
  const contact = DESTBL_CONTACTS[pod] || { to: "", cc: "" };
  const notes = [];
  const vessels = Array.from(new Set(rows.map((r) => r.vessel))).join(", ");
  let subject = "", textTpl = "", toTpl = "";
  const values = {};
  if (tpl) {
    (tpl.fields || []).forEach((f) => { const v = destBlFieldValue(f.label, rows, pod); values[f.label] = v == null ? "{{" + f.label + "}}" : v; });
    const out = (tpl.outputs && tpl.outputs[0]) || { text: "" };
    textTpl = out.text || ""; subject = out.subject || ""; toTpl = out.to || "";
  } else {
    textTpl = "Dear all,\n\nAs requested by the local shipper, please issue the following B/L(s) at destination.\n\n{{표}}\n\nBest regards,";
    subject = "Request to issue B/L at destination - " + vessels + " / " + (rows[0].pol || "") + " → " + pod + " (" + rows.length + " B/L)";
    notes.push("메일 템플릿 탭에서 '도착지 B/L 발행' 템플릿을 찾지 못해 기본 문구를 썼어요. 아래에서 쓸 템플릿을 고를 수 있어요.");
  }
  const sub = (t) => { let s = String(t || ""); Object.keys(values).forEach((k) => { s = s.split("{{" + k + "}}").join(values[k]); }); return s; };
  const hasTableToken = textTpl.indexOf("{{표}}") !== -1;
  const hasBlSlot = (tpl && (tpl.fields || []).some((f) => { const v = destBlFieldValue(f.label, rows, pod); return v != null && /(b\/?l|비엘|오비엘|obl)/i.test(f.label.replace(/\s+/g, "")) && textTpl.indexOf("{{" + f.label + "}}") !== -1; }));
  const parts = textTpl.split("{{표}}").map(sub);
  const toHtml = (s) => escapeHtml(s).split("\n").join("<br>");
  let html = parts.map(toHtml).join(destBlTableHtml(rows));
  if (!hasTableToken && !hasBlSlot && tpl) {
    html += destBlTableHtml(rows);
    notes.push("템플릿에 BL 번호를 넣는 자리({{BL}} 또는 {{표}})가 없어서, 본문 아래에 BL 표를 붙였어요.");
  }
  html = html.replace(/(https?:\/\/[^\s<>"']+)/g, (u) => '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + "</a>");
  subject = sub(subject).trim() || ("Request to issue B/L at destination - " + vessels + " / " + (rows[0].pol || "") + " → " + pod + " (" + rows.length + " B/L)");
  const toFromTpl = sub(toTpl).trim();
  const left = new Set();
  [html, subject, toFromTpl].forEach((s) => { (String(s).match(/\{\{[^}]+\}\}/g) || []).forEach((m) => { if (!/^\{\{이미지\d+\}\}$/.test(m)) left.add(m); }); });
  if (left.size) notes.push("템플릿에 자동으로 못 채운 칸이 있어요: " + Array.from(left).join(" ") + " — 아래 미리보기에서 직접 고쳐 주세요.");
  return { to: contact.to || toFromTpl, cc: contact.cc || "", subject, html, notes, missingTo: !(contact.to || toFromTpl) };
}

function renderDestBlMail() {
  const box = document.getElementById("dbMail");
  if (!box) return;
  if (!destBlMail.open) { box.innerHTML = ""; return; }
  const rows = destBlMail.ids.map((id) => DESTBL_LIST.find((r) => r.id === id)).filter(Boolean);
  const pods = Array.from(new Set(rows.map((r) => r.pod)));
  const esc = escapeHtml;
  if (!pods.length) { box.innerHTML = '<div class="db-box"><div class="hint" style="margin:0;">메일로 만들 줄이 없어요. 줄을 체크하거나, "메일 발송 전" 줄이 있어야 해요.</div></div>'; return; }
  if (!destBlMail.pod || pods.indexOf(destBlMail.pod) < 0) destBlMail.pod = pods[0];
  const groupRows = rows.filter((r) => r.pod === destBlMail.pod);
  const tpl = destBlPickTemplate();
  const m = destBlBuildMail(destBlMail.pod, groupRows, tpl);
  const tplList = destBlTemplates();

  box.innerHTML = '<div class="db-box"><div class="db-box-title">✉️ 도착지별 메일</div>'
    + '<div class="db-tabs">' + pods.map((p) => '<button type="button" class="tf-chip' + (p === destBlMail.pod ? " on" : "") + '" data-pod="' + esc(p) + '">' + esc(p) + " · " + rows.filter((r) => r.pod === p).length + "건</button>").join("") + "</div>"
    + '<div class="db-tplrow"><span>메일 템플릿</span><select id="dbTplSel"><option value="">' + (tplList.length ? "자동 선택" : "템플릿 없음") + "</option>"
    + tplList.map((t) => '<option value="' + esc(t.id) + '"' + (tpl && t.id === tpl.id ? " selected" : "") + ">" + esc(t.label) + "</option>").join("") + "</select>"
    + '<span class="hint" style="margin:0;">' + (tpl ? "사용 중: " + esc(tpl.label) : "맞는 템플릿을 찾지 못했어요") + "</span></div>"
    + m.notes.map((n) => '<div class="db-note">⚠️ ' + esc(n) + "</div>").join("")
    + (m.missingTo ? '<div class="db-note bad">⚠️ ' + esc(destBlMail.pod) + " 도착지의 받는 사람이 아직 없어요. 아래 \"도착지별 수신처\"에 한 번만 등록해 주세요.</div>" : "")
    + '<div class="db-fr"><span>받는 사람</span><input id="dbMTo" value="' + esc(m.to) + '"><button type="button" class="btn secondary-btn tx-mini" data-copy="to">복사</button></div>'
    + '<div class="db-fr"><span>참조</span><input id="dbMCc" value="' + esc(m.cc) + '"><button type="button" class="btn secondary-btn tx-mini" data-copy="cc">복사</button></div>'
    + '<div class="db-fr"><span>제목</span><input id="dbMSubject" value="' + esc(m.subject) + '"><button type="button" class="btn secondary-btn tx-mini" data-copy="subject">복사</button></div>'
    + '<div class="preview-html" id="dbMBody" contenteditable="true">' + m.html + "</div>"
    + '<div class="hint" style="margin:4px 0 8px;">미리보기는 직접 고칠 수 있어요. 복사하면 표 모양 그대로 메일에 붙여넣어져요.</div>'
    + '<div class="db-actions" style="margin:0;"><button type="button" class="btn copy-btn" data-copy="body">📋 본문 복사 (표 포함)</button>'
    + '<button type="button" class="btn generate-btn" data-act="marksent">✔ 이 메일 보냈어요 (발송 표시)</button>'
    + '<button type="button" class="btn secondary-btn" data-act="close">닫기</button></div></div>';
}

function destBlOnMailChange(e) {
  const el = e.target;
  if (el.id === "dbTplSel") {
    try { if (el.value) localStorage.setItem(DESTBL_TPL_PREF_KEY, el.value); else localStorage.removeItem(DESTBL_TPL_PREF_KEY); } catch (err) { /* 무시 */ }
    renderDestBlMail();
  }
}

async function destBlOnMailClick(e) {
  const pb = e.target.closest("[data-pod]");
  if (pb && pb.closest(".db-tabs")) { destBlMail.pod = pb.dataset.pod; renderDestBlMail(); return; }
  const cb = e.target.closest("[data-copy]");
  if (cb) {
    const k = cb.dataset.copy;
    if (k === "body") {
      const html = document.getElementById("dbMBody").innerHTML;
      const plain = document.getElementById("dbMBody").innerText;
      if (typeof copyHtmlViaSelection === "function" && copyHtmlViaSelection(typeof wrapEmailHtmlFont === "function" ? wrapEmailHtmlFont(html) : html)) destBlSay("본문을 복사했어요 (아웃룩에 붙여넣으면 표 모양 그대로 들어가요)", "ok");
      else { destBlCopyPlain(plain); destBlSay("본문을 글자로 복사했어요", "ok"); }
    } else {
      const v = document.getElementById(k === "to" ? "dbMTo" : k === "cc" ? "dbMCc" : "dbMSubject").value;
      destBlCopyPlain(v);
      destBlSay((k === "to" ? "받는 사람" : k === "cc" ? "참조" : "제목") + "을(를) 복사했어요", "ok");
    }
    return;
  }
  const a = e.target.closest("[data-act]");
  if (!a) return;
  if (a.dataset.act === "close") { destBlMail.open = false; renderDestBlMail(); }
  else if (a.dataset.act === "marksent") {
    const rows = destBlMail.ids.map((id) => DESTBL_LIST.find((r) => r.id === id)).filter((r) => r && r.pod === destBlMail.pod);
    if (!rows.length) return;
    const pod = destBlMail.pod;
    const ok = await destBlWrite(async () => {
      await window.fbReady;
      const batch = window.fbDb.batch();
      rows.forEach((r) => batch.update(window.fbDb.collection(DESTBL_REQ_COLLECTION).doc(r.id), { sent: "O" }));
      await batch.commit();
    });
    if (!ok) return;
    destBlMail.ids = destBlMail.ids.filter((id) => !rows.some((r) => r.id === id));
    rows.forEach((r) => destBlSelected.delete(r.id));
    destBlSay(pod + " " + rows.length + "건을 \"메일 발송\"으로 표시했어요", "ok");
    renderDestBlMail();
  }
}

function destBlCopyPlain(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => { /* 무시 */ });
  else if (typeof legacyCopy === "function") legacyCopy(text);
}

/* =========================================================================
   탭 열기 - 목록과 수신처는 실시간으로 받아요
   ========================================================================= */
async function loadDestBlTab(forceRefresh) {
  destBlBuild();
  if (typeof liveSubscribed !== "undefined" && liveSubscribed.destBl && !forceRefresh) { renderDestBlTable(); return; }
  if (forceRefresh) { if (destBlUnsubReq) destBlUnsubReq(); if (destBlUnsubContacts) destBlUnsubContacts(); liveSubscribed.destBl = false; }
  const wrap = document.getElementById("dbTable");
  if (wrap && !DESTBL_LIST.length) wrap.innerHTML = '<div class="empty-state">⏳ 목록을 불러오는 중이에요...</div>';
  await window.fbReady;
  destBlUnsubReq = window.fbDb.collection(DESTBL_REQ_COLLECTION).onSnapshot(
    (snap) => { DESTBL_LIST = snap.docs.map(destBlDocToEntry); renderDestBlTable(); if (destBlMail.open) renderDestBlMail(); },
    (err) => {
      console.error("도착지 BL 구독 실패:", err);
      if (wrap) wrap.innerHTML = '<div class="empty-state">⚠️ 목록을 불러오지 못했어요. Firestore 규칙에 dest_bl_requests, dest_bl_contacts가 추가됐는지 확인해 주세요. <button class="btn secondary-btn" style="padding:2px 10px;font-size:12px;margin-left:6px;" onclick="loadDestBlTab(true)">다시 시도</button></div>';
    }
  );
  destBlUnsubContacts = window.fbDb.collection(DESTBL_CONTACT_COLLECTION).onSnapshot(
    (snap) => {
      DESTBL_CONTACTS = {};
      snap.docs.forEach((d) => { const x = d.data(); if (x.pod) DESTBL_CONTACTS[x.pod] = { to: x.to || "", cc: x.cc || "" }; });
      renderDestBlContacts();
      if (destBlMail.open) renderDestBlMail();
    },
    (err) => console.error("도착지 수신처 구독 실패:", err)
  );
  liveSubscribed.destBl = true;
  if (typeof liveTabUnsubscribers !== "undefined") liveTabUnsubscribers.destBl = () => { if (destBlUnsubReq) destBlUnsubReq(); if (destBlUnsubContacts) destBlUnsubContacts(); liveSubscribed.destBl = false; };
}
