/* =========================================================================
   🌏 삼국간 "엑셀 보기" (BL 한 건 = 한 줄)
   guide_triangle.js 뒤에 불러와요. 데이터(Firestore triangle_trade, BL 1건 = 문서 1개)는 그대로이고
   화면만 새로 그려요. 기존 "묶음 보기"(배·화주 한 줄)는 그대로 남아 있고 위 버튼으로 바꿔 볼 수 있어요.

   ■ BL 한 건이 한 줄 - 배 · 화주 · BL · 온보드 · 2ND 배 · 단계 5개 · REMARK 전부 그 건만 따로 고쳐요
   ■ 같은 배·화주는 회색 띠로 묶어서 보여줘요
       - 띠의 "n/N" 칸 = 그 묶음 전체를 그 단계만 한 번에 완료(O)로 (다시 누르면 비움)
       - 배 이름을 누르면 접고 펴기 (전부 완료된 묶음은 처음부터 접혀 있어요 / 접은 상태는 각자 브라우저에만 저장)
   ■ 화주 / 2ND 배 / 위 칩 / 검색으로 거르면 → 보이는 BL만 모아서 맨 위 띠에서 단계별 일괄 처리
   ■ 표 아래 "엑셀에서 붙여넣어 추가"에서 배·화주·BL·2ND 배 열을 붙여넣고 [추가]를 눌러야 저장돼요
   ■ 키보드: 방향키 / Enter 로 칸 이동, 단계 칸에서 O · X · C(확인중) · Delete(대기), Space/Enter 는 순서대로 바꾸기
   ========================================================================= */
(function () {
  "use strict";

  const VIEW_KEY = "triangleViewMode_v1";
  const FOLD_KEY = "triangleXFold_v1";

  let viewMode = "excel";
  try { viewMode = localStorage.getItem(VIEW_KEY) === "group" ? "group" : "excel"; } catch (e) { /* 무시 */ }
  let foldMap = {};
  try { foldMap = JSON.parse(localStorage.getItem(FOLD_KEY) || "{}") || {}; } catch (e) { foldMap = {}; }

  let fShipper = "";
  let fSecond = "";
  let pasteText = "";
  let pasteDate = "";
  let pasteBusy = false;
  let pendingFocus = null; // { sel, at } 저장하느라 표가 다시 그려져도 이동하려던 칸으로 가요

  const origRender = window.renderTriangleList;
  const origReveal = window.triangleRevealEntry;

  function saveFold() { try { localStorage.setItem(FOLD_KEY, JSON.stringify(foldMap)); } catch (e) { /* 무시 */ } }
  const esc = (s) => escapeHtml(String(s == null ? "" : s));

  /* ---------- 보기 전환 (위 버튼) ---------- */
  window.setTriangleView = function (mode) {
    viewMode = mode === "group" ? "group" : "excel";
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch (e) { /* 무시 */ }
    syncViewButtons();
    renderTriangleList();
  };
  function syncViewButtons() {
    const a = document.getElementById("triViewExcel"), b = document.getElementById("triViewGroup");
    if (a) a.classList.toggle("active", viewMode === "excel");
    if (b) b.classList.toggle("active", viewMode === "group");
  }

  /* ---------- 건별 판단 ---------- */
  function entryMatchesChip(e, chip) {
    const states = triangleEntryInfo(e).states;
    if (chip === "check") return states.some((s) => s.kind === "check");
    if (chip === "remit") return states[TRIANGLE_REMIT_IDX].kind === "wait";
    if (chip === "second") return !!String(e.secondVessel || "").trim();
    if (chip === "etd") return !!triangleEntryEtdStatus(e);
    return true;
  }

  /* 지금 화면에 보일 줄들을 계산 (그리기와 일괄 처리가 같은 결과를 쓰도록 한 곳에서) */
  function computeView() {
    const qEl = document.getElementById("triangleFilter");
    const q = (qEl ? qEl.value : "").trim().toLowerCase();
    const filtered = !!(q || fShipper || fSecond || triangleChipFilter);

    const pass = (e) => {
      if (q && ![e.vessel, e.shipper, e.blNumber, e.remark, e.groupRemark, triangleSecondText(e)].join(" ").toLowerCase().includes(q)) return false;
      if (fShipper && triangleNormText(e.shipper) !== triangleNormText(fShipper)) return false;
      if (fSecond) {
        if (fSecond === "__none") { if (String(e.secondVessel || "").trim()) return false; }
        else if (triangleCompact(e.secondVessel) !== triangleCompact(fSecond)) return false;
      }
      if (triangleChipFilter && (triangleEntryComplete(e) || !entryMatchesChip(e, triangleChipFilter))) return false;
      if (triangleHideDone && triangleEntryComplete(e)) return false;
      return true;
    };

    const counts = { check: 0, remit: 0, second: 0, etd: 0 };
    TRIANGLE_LIST.forEach((e) => {
      if (triangleEntryComplete(e)) return;
      Object.keys(counts).forEach((c) => { if (entryMatchesChip(e, c)) counts[c]++; });
    });

    const groups = triangleBuildGroups(TRIANGLE_LIST);
    groups.forEach((g) => { g.rows = g.entries.filter(pass); });
    const shown = groups.filter((g) => g.rows.length);

    // 정렬: 최근에 등록된 배가 위로, 같은 배 안에서는 화주 이름순 (묶음 보기와 같은 순서)
    const vesselLatest = new Map();
    shown.forEach((g) => {
      const k = triangleCompact(g.vessel);
      if ((g.latest || "") > (vesselLatest.get(k) || "")) vesselLatest.set(k, g.latest || "");
    });
    shown.sort((a, b) => {
      const ka = triangleCompact(a.vessel), kb = triangleCompact(b.vessel);
      if (ka !== kb) return (vesselLatest.get(kb) || "").localeCompare(vesselLatest.get(ka) || "") || ka.localeCompare(kb);
      return a.shipper.localeCompare(b.shipper, "ko");
    });

    const rows = [];
    shown.forEach((g) => g.rows.forEach((e) => rows.push(e)));
    return { q, filtered, groups: shown, rows, counts, totalGroups: groups.length, totalDone: groups.filter((g) => g.done).length };
  }

  /* ---------- 그리기 ---------- */
  function stepCellHtml(e, idx, entryDone) {
    const step = TRIANGLE_STEPS[idx];
    let st = triangleStepState(step, e[step.key]);
    if (entryDone && st.kind === "wait") st = { kind: "na", label: "—", raw: "" };
    const tip = st.raw ? st.raw : "누르면 바뀌어요 (O · X · C · Delete 키도 돼요)";
    return '<div class="xv-c xv-stepc"><button type="button" class="xv-step" data-xnav="1" data-act="xstep" data-id="' + esc(e.id) + '" data-step="' + idx + '" title="' + esc(tip) + '" aria-label="' + esc(step.name + " " + st.label) + '">'
      + '<span class="tri-pill ' + st.kind + '">' + esc(st.label) + "</span></button></div>";
  }

  function inputCell(act, field, e, gk, val, ph, list, extra) {
    return '<div class="xv-c"><input type="text" class="tx-input xv-in' + (extra || "") + '" data-xnav="1" data-act="' + act + '" data-field="' + field + '" data-id="' + esc(e.id) + '" data-gk="' + gk + '" value="' + esc(val) + '" placeholder="' + esc(ph || "") + '" autocomplete="off" spellcheck="false"' + (list ? ' list="' + list + '"' : "") + "></div>";
  }

  function bulkBtnHtml(ents, idx, scope, gk) {
    const key = TRIANGLE_STEPS[idx].key;
    const n = ents.filter((e) => String(e[key] || "").trim().toUpperCase() === "O").length;
    const all = ents.length > 0 && n === ents.length;
    return '<button type="button" class="xv-bulk" data-act="xbulk" data-scope="' + scope + '" data-gk="' + gk + '" data-step="' + idx + '" aria-label="' + esc(TRIANGLE_STEPS[idx].name + (all ? " 전체 비우기" : " 전체 완료로 바꾸기")) + '" title="' + (all ? "눌러서 이 단계를 전부 비워요" : "눌러서 이 단계를 전부 O로 바꿔요") + '">'
      + "<b>" + n + "/" + ents.length + "</b><span>" + (all ? "전체 비우기" : "전체 O") + "</span></button>";
  }

  function renderExcelView() {
    const wrap = document.getElementById("triangleListWrap");
    if (!wrap) return;

    // 입력 중인 칸이 있으면 실시간 갱신으로 날아가지 않게 잠깐 미뤄요 (묶음 보기와 같은 방식)
    const ae = document.activeElement;
    if (ae && wrap.contains(ae) && ae.dataset && ae.dataset.dirty === "1") { triangleRenderPending = true; return; }
    triangleRenderPending = false;
    const focusToken = gridCaptureFocus(wrap);

    const v = computeView();
    const chip = (cls, key, label, n) =>
      '<button type="button" class="tri-chip ' + cls + (triangleChipFilter === key ? " active" : "") + '" onclick="setTriangleChipFilter(\'' + key + '\')">' + label + '<span class="n">' + n + "</span></button>";

    let html = '<div id="triangleStatus" class="tx-status ' + esc(triangleStatus.kind) + '">' + esc(triangleStatus.text) + "</div>";

    // 필터 줄
    const shipperOpts = triangleShipperOptions();
    const secondSet = new Map();
    TRIANGLE_LIST.forEach((e) => { const s = String(e.secondVessel || "").trim(); if (s) secondSet.set(triangleCompact(s), s); });
    const secondOpts = Array.from(secondSet.values()).sort((a, b) => a.localeCompare(b, "ko"));
    const opt = (val, label, cur) => '<option value="' + esc(val) + '"' + (val === cur ? " selected" : "") + ">" + esc(label) + "</option>";
    html += '<div class="xv-filterbar"><b>🔎 거르기</b>'
      + '<label>화주 <select class="xv-sel" data-act="xfilter" data-field="shipper">' + opt("", "전체", fShipper) + shipperOpts.map((s) => opt(s, s, fShipper)).join("") + "</select></label>"
      + '<label>2ND 배 <select class="xv-sel" data-act="xfilter" data-field="second">' + opt("", "전체", fSecond) + opt("__none", "2ND 배 없음", fSecond) + secondOpts.map((s) => opt(s, s, fSecond)).join("") + "</select></label>"
      + '<button type="button" class="btn secondary-btn tx-mini" data-act="xfilter-clear">거르기 해제</button>'
      + '<span class="xv-filterhint">거르면 보이는 BL만 모아서, 맨 위 띠에서 단계별로 한 번에 처리해요</span></div>';

    html += '<div class="tri-bar">'
      + chip("check", "check", "확인중", v.counts.check)
      + chip("remit", "remit", "송금 대기", v.counts.remit)
      + chip("second", "second", "2ND 배 있음", v.counts.second)
      + chip("etd", "etd", "🚢 2ND 출항함 (오늘 포함)", v.counts.etd)
      + '<button type="button" class="tri-chip' + (triangleHideDone ? " active" : "") + '" onclick="toggleTriangleHideDone()">' + (triangleHideDone ? "완료 건 보이기" : "완료 건 숨기기") + "</button>"
      + "</div>";

    html += '<div class="tri-legend"><span class="tri-pill done">완료</span><span>O</span>'
      + '<span class="tri-pill na">—</span><span>X, 해당 없음</span>'
      + '<span class="tri-pill wait">대기</span><span>빈칸, 아직 안 함</span>'
      + '<span class="tri-pill check">확인중</span><span>CHECKING</span>'
      + '<span class="tri-pill na">신용</span><span>송금 불필요</span>'
      + '<span class="tx-legend-tip">👆 BL 줄의 단계 칸은 그 건만, 회색 띠의 칸은 묶음 전체를 바꿔요 · 방향키/Enter로 이동 · 단계 칸에서 O · X · C · Delete 키</span></div>';

    if (TRIANGLE_LIST.length === 0) {
      html += '<div class="empty-state">아직 등록된 삼국간 건이 없어요. 아래 "엑셀에서 붙여넣어 추가"를 써보세요.</div>';
    } else if (!v.groups.length) {
      html += '<div class="empty-state">' + (v.filtered ? "조건에 맞는 BL이 없어요." : "표시할 줄이 없어요.") + "</div>";
    }

    html += '<datalist id="txDlVessel">' + triangleVesselOptions().map((x) => '<option value="' + esc(x) + '">').join("") + "</datalist>"
      + '<datalist id="txDlShipper">' + shipperOpts.map((x) => '<option value="' + esc(x) + '">').join("") + "</datalist>";

    html += '<div class="xv-scroll"><div class="xv-inner">'
      + '<div class="xv-grid xv-head"><div></div><div>배(VSL)</div><div>화주</div><div>BL</div><div>온보드</div><div>2ND 배</div>'
      + '<div class="xv-hc">POP CHARGE</div><div class="xv-hc">MFST CLOSE</div><div class="xv-hc">인보이스</div><div class="xv-hc">송금 완료</div><div class="xv-hc">POL/POD</div><div>REMARK</div><div></div></div>';

    // 거르는 중이면 맨 위에 "보이는 BL 전체" 일괄 처리 띠
    if (v.filtered && v.rows.length) {
      const desc = [fShipper ? "화주 " + fShipper : "", fSecond ? "2ND 배 " + (fSecond === "__none" ? "없음" : fSecond) : "", triangleChipFilter ? "위 칩으로 거름" : "", v.q ? '검색 "' + v.q + '"' : ""].filter(Boolean).join(" · ");
      html += '<div class="xv-grid xv-band xv-bulkbar"><div class="xv-bandmain"><b>🔎 거른 ' + v.rows.length + "건 일괄 처리</b><span>" + esc(desc) + "</span></div>"
        + [0, 1, 2, 3, 4].map((i) => bulkBtnHtml(v.rows, i, "filter", "")).join("") + "<div></div><div></div></div>";
    }

    let no = 0;
    v.groups.forEach((g) => {
      const gk = esc(g.key);
      const ov = foldMap[g.key];
      const open = v.filtered ? true : (ov !== undefined ? !!ov : !g.done);
      if (!v.filtered) {
        const remitKey = TRIANGLE_STEPS[TRIANGLE_REMIT_IDX].key;
        const remitDone = g.entries.filter((e) => { const k = triangleStepState(TRIANGLE_STEPS[TRIANGLE_REMIT_IDX], e[remitKey]).kind; return k === "done" || k === "na"; }).length;
        const etd = triangleSecondEtdStatus(g);
        html += '<div class="xv-grid xv-band' + (g.done ? " xv-banddone" : "") + '"><div class="xv-bandmain">'
          + '<button type="button" class="xv-fold" data-act="xfold" data-gk="' + gk + '" aria-expanded="' + (open ? "true" : "false") + '"><span class="xv-caret">' + (open ? "▾" : "▸") + "</span>" + esc(g.vessel || "배 미입력") + " · " + esc(g.shipper || "화주 미입력") + (g.onboard ? " · 온보드 " + esc(gridFmtDate(g.onboard)) : "") + "</button>"
          + "<span>BL " + g.entries.length + "건</span>"
          + "<span>" + (g.done ? "✅ 전부 완료" + (open ? "" : " · 접혀 있어요 (배 이름을 누르면 펼쳐요)") : "송금 완료 " + remitDone + "/" + g.entries.length) + "</span>"
          + (etd ? '<span class="tx-etd ' + etd.cls + '" title="' + esc(etd.tip) + '">' + esc(etd.text) + "</span>" : "")
          + '<input type="text" class="tx-input xv-bremark" data-act="field" data-field="remark" data-gk="' + gk + '" value="' + esc(g.remark) + '" placeholder="묶음 메모" autocomplete="off" spellcheck="false" title="이 묶음 전체에 붙는 메모예요">'
          + "</div>"
          + [0, 1, 2, 3, 4].map((i) => bulkBtnHtml(g.entries, i, "group", gk)).join("")
          + '<div></div><div class="xv-trash' + (triangleArmedDelete === g.key ? " armed" : "") + '" data-act="del-group" data-gk="' + gk + '" title="이 묶음 전체 삭제 (두 번 누르면 삭제돼요)">🗑</div></div>';
      }
      if (!open) return;
      g.rows.forEach((e) => {
        no += 1;
        const done = triangleEntryComplete(e);
        const etd = triangleEntryEtdStatus(e);
        html += '<div class="xv-grid xv-row' + (done ? " xv-done" : "") + (etd ? (etd.n < 0 ? " xv-etd-late" : " xv-etd-today") : "") + '" data-id="' + esc(e.id) + '">'
          + '<div class="xv-no">' + no + "</div>"
          + inputCell("xfield", "vessel", e, gk, e.vessel, "배 미입력", "txDlVessel", " xv-bold")
          + inputCell("xfield", "shipper", e, gk, e.shipper, "화주 미입력", "txDlShipper")
          + inputCell("bl-field", "bl", e, gk, e.blNumber, "BL", "", " xv-mono")
          + inputCell("xfield", "onboard", e, gk, e.onboardDate ? gridFmtDate(e.onboardDate) : "", "미입력")
          + '<div class="xv-c xv-sec"><input type="text" class="tx-input xv-in" data-xnav="1" data-act="bl-field" data-field="second" data-id="' + esc(e.id) + '" data-gk="' + gk + '" list="txDlVessel" value="' + esc(triangleSecondText(e)) + '" placeholder="없음" autocomplete="off" spellcheck="false" title="2ND 배 이름 뒤에 괄호로 메모를 같이 쓸 수 있어요 (예: ZE5 15E (VNHAI ETD 11/4))">' + triangleEtdBadgeHtml(etd) + "</div>"
          + [0, 1, 2, 3, 4].map((i) => stepCellHtml(e, i, done)).join("")
          + inputCell("xfield", "xremark", e, gk, e.remark, "-")
          + '<div class="xv-c"><button type="button" class="tx-del" data-act="del-bl" data-id="' + esc(e.id) + '" title="이 BL 삭제" aria-label="' + esc(e.blNumber) + ' 삭제">✕</button></div>'
          + "</div>";
      });
    });

    html += "</div></div>"
      + '<div class="hint" style="margin-top:8px;">✅ BL ' + v.rows.length + "건 표시됨 · 묶음 " + v.groups.length + "개 (전체 " + v.totalGroups + " · 완료 " + v.totalDone + ")</div>";

    // 붙여넣어 추가
    html += '<div class="xv-paste-box"><div class="xv-paste-title">➕ 엑셀에서 붙여넣어 추가</div>'
      + '<div class="hint">엑셀에서 <b>배 · 화주 · BL · 2ND 배</b> 열(2ND 배는 없으면 비워도 돼요)을 복사해서 붙여넣으면 미리보기가 떠요. 확인하고 <b>[추가]</b>를 눌러야 저장돼요. 새로 들어가는 BL은 단계가 모두 "대기"로 시작해요.</div>'
      + '<textarea class="xv-paste" rows="4" data-act="xpaste" placeholder="ACJ 18E&#9;팍트라&#9;BL번호&#9;2ND 배(없으면 비움)" spellcheck="false">' + esc(pasteText) + "</textarea>"
      + '<div id="xvPastePreview" class="xv-paste-preview">' + pasteSummaryHtml(pasteText) + "</div>"
      + '<div class="xv-paste-actions"><label>온보드 <input type="date" data-act="xpaste-date" value="' + esc(pasteDate) + '"></label>'
      + '<span class="hint" style="margin:0;">새 묶음에만 적용돼요 (이미 있는 묶음은 그 묶음의 온보드를 따라가요)</span>'
      + '<button type="button" class="btn generate-btn" data-act="xpaste-add">추가</button></div></div>';

    wrap.innerHTML = html;
    gridRestoreFocus(wrap, focusToken);
    if (pendingFocus && Date.now() - pendingFocus.at < 2500) {
      const t = wrap.querySelector(pendingFocus.sel);
      if (t) { try { t.focus({ preventScroll: false }); } catch (err) { t.focus(); } }
      pendingFocus = null;
    }
  }

  window.renderTriangleList = function () {
    if (viewMode === "excel") renderExcelView();
    else origRender();
  };

  window.triangleRevealEntry = function (id) {
    if (typeof origReveal === "function") origReveal(id);
    const t = TRIANGLE_LIST.find((x) => x.id === id);
    if (t) { foldMap[triangleGroupKey(t.vessel, t.shipper)] = true; saveFold(); }
  };

  /* ---------- 붙여넣기 읽기 ---------- */
  function parsePaste(text) {
    const items = [], bad = [], dups = [];
    const existing = new Map(TRIANGLE_LIST.map((t) => [triangleBlKey(t.blNumber), t]));
    const seen = new Set();
    let first = true;
    String(text || "").replace(/\r/g, "").split("\n").forEach((raw) => {
      if (!raw.trim()) return;
      const cells = (raw.indexOf("\t") >= 0 ? raw.split("\t") : raw.split(",")).map((x) => x.trim());
      const isFirst = first; first = false;
      const bl = (cells[2] || "").toUpperCase();
      if (!/^[A-Z]+\d+$/.test(bl)) {
        if (isFirst && cells.length >= 3 && !/\d/.test(cells[2] || "")) return; // 머리글 줄 (배 / 화주 / BL ...)
        bad.push(raw.trim() + " → 3번째 칸이 BL 번호가 아니에요");
        return;
      }
      const vr = triangleCheckVessel(cells[0], false);
      if (vr.error) { bad.push(raw.trim() + " → " + vr.error); return; }
      const sr = triangleCheckShipper(cells[1]);
      if (sr.error) { bad.push(raw.trim() + " → " + sr.error); return; }
      const sec = cells[3] ? triangleCheckSecond(cells[3]) : { vessel: "", note: "" };
      if (sec.error) { bad.push(raw.trim() + " → 2ND 배: " + sec.error); return; }
      if (existing.has(bl) || seen.has(bl)) { dups.push(bl); return; }
      seen.add(bl);
      items.push({ vessel: vr.value, shipper: sr.value, bl: bl, second: sec.vessel || "", secondNote: sec.note || "" });
    });
    const keys = new Set(items.map((it) => triangleGroupKey(it.vessel, it.shipper)));
    let addToOld = 0, newGroups = 0;
    keys.forEach((k) => { if (triangleEntriesOfGroup(k).length) addToOld++; else newGroups++; });
    return { items, bad, dups, addToOld, newGroups };
  }

  function pasteSummaryHtml(text) {
    if (!String(text || "").trim()) return "";
    const r = parsePaste(text);
    let h = '<div class="xv-paste-sum"><b class="tx-ok">' + r.items.length + "건 추가 가능</b>"
      + (r.items.length ? " · 기존 묶음에 추가 " + r.addToOld + "개 · 새 묶음 " + r.newGroups + "개" : "")
      + (r.dups.length ? " · 이미 있는 BL " + r.dups.length + "건은 제외" : "")
      + (r.bad.length ? ' · <span class="tx-bad">읽지 못한 줄 ' + r.bad.length + "개</span>" : "") + "</div>";
    if (r.items.length) {
      h += '<div class="xv-paste-list">' + r.items.slice(0, 12).map((it) => esc(it.vessel) + " · " + esc(it.shipper) + " · " + esc(it.bl) + (it.second ? " · 2ND " + esc(it.second) : "")).join("<br>")
        + (r.items.length > 12 ? "<br>… 외 " + (r.items.length - 12) + "건" : "") + "</div>";
    }
    if (r.dups.length) h += '<div class="tx-sub">이미 있는 BL: ' + r.dups.slice(0, 8).map(esc).join(", ") + (r.dups.length > 8 ? " …" : "") + "</div>";
    if (r.bad.length) h += '<div class="tx-sub tx-bad">' + r.bad.slice(0, 4).map(esc).join("<br>") + (r.bad.length > 4 ? "<br>…" : "") + "</div>";
    return h;
  }

  async function submitPaste() {
    if (pasteBusy) return;
    const r = parsePaste(pasteText);
    if (!r.items.length) {
      triangleSay(r.bad.length ? "읽지 못한 줄이 있어요: " + r.bad[0] : (r.dups.length ? "이미 있는 BL이에요: " + r.dups.slice(0, 3).join(", ") : "붙여넣은 내용이 없어요"), "bad");
      return;
    }
    pasteBusy = true;
    try {
      await window.fbReady;
      const nowIso = new Date().toISOString();
      const byGroup = new Map();
      r.items.forEach((it) => {
        const k = triangleGroupKey(it.vessel, it.shipper);
        if (!byGroup.has(k)) byGroup.set(k, []);
        byGroup.get(k).push(it);
      });
      let ops = 0;
      const batch = window.fbDb.batch();
      byGroup.forEach((its, k) => {
        const entries = triangleEntriesOfGroup(k);
        const pick = (f) => ((entries.find((e) => String(e[f] || "").trim()) || {})[f] || "");
        const tpl = { vessel: its[0].vessel, shipper: its[0].shipper, onboardDate: entries.length ? pick("onboardDate") : pasteDate, groupRemark: pick("groupRemark") };
        its.forEach((it) => {
          const data = triangleNewDocData(it.bl, tpl, nowIso);   // 단계는 모두 비어 있어요 (대기)
          data.secondVessel = it.second;
          data.secondNote = it.secondNote;
          batch.set(window.fbDb.collection(TRIANGLE_COLLECTION).doc(), data);
          ops++;
        });
      });
      if (ops > 450) throw new Error("한 번에 넣을 수 있는 양(약 450건)을 넘었어요. 나눠서 붙여넣어 주세요.");
      await batch.commit();
      pasteText = "";
      triangleSay("BL " + ops + "건 추가했어요" + (r.dups.length ? " · 이미 있는 BL " + r.dups.length + "건 제외" : "") + (r.bad.length ? " · 읽지 못한 줄 " + r.bad.length + "개는 빠졌어요" : ""), (r.dups.length || r.bad.length) ? "warn" : "ok");
      renderTriangleList();
    } catch (err) {
      console.error("삼국간 붙여넣기 추가 실패:", err);
      triangleSay("저장에 실패했어요: " + (err && err.message ? err.message : err), "bad");
    } finally {
      pasteBusy = false;
    }
  }

  /* ---------- 단계 바꾸기 ---------- */
  async function setStep(id, idx, value) {
    const patch = {}; patch[TRIANGLE_STEPS[idx].key] = value;
    const r = await triangleBatchUpdate([id], patch);
    if (!r.ok) triangleSay("저장에 실패했어요: " + r.error, "bad");
  }
  function cycleStep(id, idx) {
    const e = TRIANGLE_LIST.find((x) => x.id === id);
    if (!e) return;
    const st = triangleStepState(TRIANGLE_STEPS[idx], e[TRIANGLE_STEPS[idx].key]);
    return setStep(id, idx, triangleNextStepValue(idx, st));
  }

  async function doBulk(scope, gk, idx) {
    const ents = scope === "filter" ? computeView().rows : triangleEntriesOfGroup(gk);
    if (!ents.length) return;
    const key = TRIANGLE_STEPS[idx].key;
    const all = ents.every((e) => String(e[key] || "").trim().toUpperCase() === "O");
    const value = all ? "" : "O";
    if (scope === "filter" && ents.length > 1 && !confirm("거른 " + ents.length + "건의 \"" + TRIANGLE_STEPS[idx].name + "\"을(를) " + (all ? "모두 비울까요?" : "모두 완료(O)로 바꿀까요?"))) return;
    const patch = {}; patch[key] = value;
    const r = await triangleBatchUpdate(ents.map((e) => e.id), patch);
    triangleSay(r.ok ? TRIANGLE_STEPS[idx].name + " " + ents.length + "건을 " + (all ? "비웠어요" : "완료로 바꿨어요") : "저장에 실패했어요: " + r.error, r.ok ? "ok" : "bad");
  }

  /* ---------- 칸 고치기 (BL 한 건 기준) ---------- */
  async function commitCell(el) {
    el.dataset.dirty = "0";
    const id = el.dataset.id, field = el.dataset.field;
    const t = TRIANGLE_LIST.find((x) => x.id === id);
    if (!t) return;
    let patch = null, note = "";
    if (field === "vessel") {
      const r = triangleCheckVessel(el.value, false); if (r.error) return triangleFail(r.error);
      if (triangleNormText(r.value) === triangleNormText(t.vessel)) return;
      patch = { vessel: r.value };
      note = r.isNew ? "새 배로 저장됐어요: " + r.value : "";
      if (triangleGroupKey(r.value, t.shipper) !== triangleGroupKey(t.vessel, t.shipper)) note = (note ? note + " · " : "") + "이 BL만 " + r.value + " 묶음으로 옮겨졌어요";
    } else if (field === "shipper") {
      const r = triangleCheckShipper(el.value); if (r.error) return triangleFail(r.error);
      if (triangleNormText(r.value) === triangleNormText(t.shipper)) return;
      patch = { shipper: r.value };
      note = r.isNew ? "처음 쓰는 화주예요: " + r.value + " (새 화주로 저장됐어요)" : "";
      note = (note ? note + " · " : "") + "이 BL만 " + r.value + " 묶음으로 옮겨졌어요";
    } else if (field === "onboard") {
      const d = gridParseDate(el.value);
      if (d === null) return triangleFail('온보드: "' + el.value.trim() + '" 날짜를 읽지 못했어요 (예: 10/17 또는 1017)');
      if (d === (t.onboardDate || "")) return;
      patch = { onboardDate: d };
    } else if (field === "xremark") {
      if (el.value.trim() === (t.remark || "")) return;
      patch = { remark: el.value.trim() };
    }
    if (!patch) return;
    const res = await triangleBatchUpdate([id], patch);
    if (!res.ok) triangleSay("저장에 실패했어요: " + res.error, "bad");
    else triangleSay(note || "저장됐어요", note ? "warn" : "ok");
  }

  /* ---------- 키보드 이동 ---------- */
  function cellSelector(el) {
    let s = '[data-act="' + el.dataset.act + '"][data-id="' + el.dataset.id + '"]';
    if (el.dataset.field) s += '[data-field="' + el.dataset.field + '"]';
    if (el.dataset.step) s += '[data-step="' + el.dataset.step + '"]';
    return s;
  }
  function moveFocus(wrap, el, dc, dr) {
    const rowEl = el.closest(".xv-row");
    if (!rowEl) return;
    const rows = Array.from(wrap.querySelectorAll(".xv-row"));
    const ri = rows.indexOf(rowEl);
    const cells = Array.from(rowEl.querySelectorAll("[data-xnav]"));
    const ci = cells.indexOf(el);
    let target = null;
    if (dr) { const r2 = rows[ri + dr]; if (r2) target = r2.querySelectorAll("[data-xnav]")[ci] || null; }
    else target = cells[ci + dc] || null;
    if (!target) return;
    const sel = cellSelector(target);
    pendingFocus = { sel, at: Date.now() };
    if (el.tagName === "INPUT") el.blur();            // 값이 바뀌었으면 여기서 저장(change)돼요
    const t2 = wrap.querySelector(sel);                // 다시 그려지지 않았으면 바로 이동
    if (t2) { t2.focus(); pendingFocus = null; }
  }

  function bind() {
    const wrap = document.getElementById("triangleListWrap");
    if (!wrap || wrap.dataset.xvBound === "1") return;
    wrap.dataset.xvBound = "1";

    wrap.addEventListener("click", (e) => {
      const el = e.target.closest("[data-act]");
      if (!el || !wrap.contains(el)) return;
      const act = el.dataset.act;
      if (act === "xstep") cycleStep(el.dataset.id, Number(el.dataset.step));
      else if (act === "xbulk") doBulk(el.dataset.scope, el.dataset.gk, Number(el.dataset.step));
      else if (act === "xfold") {
        const k = el.dataset.gk;
        const g = triangleBuildGroups(triangleEntriesOfGroup(k))[0];
        const cur = foldMap[k] !== undefined ? !!foldMap[k] : !(g && g.done);
        foldMap[k] = !cur; saveFold();
        renderTriangleList();
      }
      else if (act === "xfilter-clear") { fShipper = ""; fSecond = ""; triangleChipFilter = null; const q = document.getElementById("triangleFilter"); if (q) q.value = ""; renderTriangleList(); }
      else if (act === "xpaste-add") submitPaste();
    });

    wrap.addEventListener("change", (e) => {
      const el = e.target;
      if (!el.dataset) return;
      if (el.dataset.act === "xfield") commitCell(el);
      else if (el.dataset.act === "xfilter") {
        if (el.dataset.field === "shipper") fShipper = el.value; else fSecond = el.value;
        renderTriangleList();
      }
      else if (el.dataset.act === "xpaste-date") pasteDate = el.value;
    });

    wrap.addEventListener("input", (e) => {
      const el = e.target;
      if (!el.dataset || el.dataset.act !== "xpaste") return;
      el.dataset.dirty = "1";
      pasteText = el.value;
      const box = document.getElementById("xvPastePreview");
      if (box) box.innerHTML = pasteSummaryHtml(pasteText);
    });

    // 묶음 보기의 키 처리보다 먼저 (capture) - 이 표 안의 칸만 직접 처리해요
    wrap.addEventListener("keydown", (e) => {
      const el = e.target;
      if (!el.dataset || !el.dataset.xnav) return;
      const isInput = el.tagName === "INPUT";
      const k = e.key;
      if (isInput && k === "Escape") {
        el.value = el.dataset.orig != null ? el.dataset.orig : el.value; el.dataset.dirty = "0";
        e.stopPropagation(); return;
      }
      if (isInput && k === "Enter") { e.preventDefault(); e.stopPropagation(); moveFocus(wrap, el, 0, e.shiftKey ? -1 : 1); return; }
      if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); e.stopPropagation(); moveFocus(wrap, el, 0, k === "ArrowDown" ? 1 : -1); return; }
      if (k === "ArrowLeft" || k === "ArrowRight") {
        if (isInput) {
          const allSel = el.selectionStart === 0 && el.selectionEnd === el.value.length;
          const edge = el.selectionStart === el.selectionEnd && (k === "ArrowLeft" ? el.selectionStart === 0 : el.selectionStart === el.value.length);
          if (!allSel && !edge) return;
        }
        e.preventDefault(); e.stopPropagation(); moveFocus(wrap, el, k === "ArrowRight" ? 1 : -1, 0); return;
      }
      if (!isInput && el.dataset.act === "xstep") {
        const id = el.dataset.id, idx = Number(el.dataset.step);
        const map = { o: "O", x: "X", c: "CHECKING", Delete: "", Backspace: "" };
        const key = k.length === 1 ? k.toLowerCase() : k;
        if (Object.prototype.hasOwnProperty.call(map, key)) { e.preventDefault(); e.stopPropagation(); setStep(id, idx, map[key]); }
      }
    }, true);

  }

  bind();
  syncViewButtons();
  if (typeof loadTriangleTab === "function") {
    const origLoad = window.loadTriangleTab;
    window.loadTriangleTab = function () { bind(); syncViewButtons(); return origLoad.apply(this, arguments); };
  }
})();
