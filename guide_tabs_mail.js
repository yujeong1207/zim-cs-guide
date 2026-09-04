/* ===== guide_tabs_mail.js : original lines 20584-22160 ===== */
/* =========================================================================
   팀 일정 캘린더 탭 (휴가/교육/출장/공휴일/행사 등 - 월 단위 캘린더)
   ========================================================================= */

let calendarViewYear = new Date().getFullYear();
let calendarViewMonth = new Date().getMonth() + 1; // 1~12

function shiftCalendarMonth(delta) {
  calendarViewMonth += delta;
  if (calendarViewMonth > 12) { calendarViewMonth = 1; calendarViewYear++; }
  if (calendarViewMonth < 1) { calendarViewMonth = 12; calendarViewYear--; }
  renderTeamCalendar();
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MONTH_ICONS = ["❄️", "💝", "🌸", "🌷", "🌼", "☔", "🌻", "🍉", "🍁", "🎃", "🍂", "🎄"];

/* 캘린더처럼 좁은 공간에 이름을 표시할 때, 한글 성을 떼고 이름만 보여줌 (예: 박민희 → 민희).
   순한글 3글자 이상일 때만 떼고, 2글자 이하이거나 한글이 아니면(영문, [예시] 등) 그대로 둠 - 안전하게. */
/* 반차/반반차 메모("반차 (오후)" 등)에서 오전/오후만 뽑아냄. 없으면 빈 문자열 */
function vacationPeriodLabel(v) {
  if (!v.unit || v.unit === "full" || !v.note) return "";
  if (v.note.includes("오전")) return " 오전";
  if (v.note.includes("오후")) return " 오후";
  return "";
}

function firstNameOnly(name) {
  if (!name) return name;
  const trimmed = name.trim();
  if (/^[가-힣]{3,}$/.test(trimmed)) return trimmed.slice(1);
  return trimmed;
}

function renderTeamCalendar() {
  document.getElementById("calendarMonthTitle").textContent = `${calendarViewYear}년 ${calendarViewMonth}월`;
  document.getElementById("calendarMonthIcon").textContent = MONTH_ICONS[calendarViewMonth - 1] || "🗓";

  const grid = document.getElementById("teamCalendarGrid");
  grid.innerHTML = "";

  const table = document.createElement("table");
  table.className = "team-calendar-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["월", "화", "수", "목", "금"].forEach((d) => {
    const th = document.createElement("th");
    th.textContent = d;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const firstOfMonth = new Date(calendarViewYear, calendarViewMonth - 1, 1);
  const lastOfMonth = new Date(calendarViewYear, calendarViewMonth, 0);

  // 이 달의 1일이 속한 주의 월요일부터 시작
  const firstWeekday = firstOfMonth.getDay(); // 0=일 ... 1=월
  const mondayOffset = firstWeekday === 0 ? -6 : 1 - firstWeekday;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() + mondayOffset);

  const todayStr = toDateStr(new Date());
  const tbody = document.createElement("tbody");

  let cursor = new Date(gridStart);
  let anyRowRendered = false;
  while (cursor <= lastOfMonth || cursor.getDay() !== 1) {
    // 한 주(월~금) 렌더링, 이 주가 이번 달과 전혀 겹치지 않으면 이후 루프에서 종료
    const weekDates = [];
    for (let i = 0; i < 5; i++) {
      weekDates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    cursor.setDate(cursor.getDate() + 2); // 토/일 건너뛰고 다음 주 월요일로

    const weekHasCurrentMonth = weekDates.some((d) => d.getMonth() === calendarViewMonth - 1);
    if (!weekHasCurrentMonth && weekDates[0] > lastOfMonth) break;
    /* 이번 달 1일이 토요일이라 월~금이 전부 지난달인 주는(이번 달 날짜가 하나도 없음) 아예 안 보여줌 */
    if (!weekHasCurrentMonth && !anyRowRendered) continue;
    anyRowRendered = true;

    const row = document.createElement("tr");
    weekDates.forEach((d) => {
      const dateStr = toDateStr(d);
      const isOutside = d.getMonth() !== calendarViewMonth - 1;
      const td = document.createElement("td");
      td.className = "calendar-cell" + (isOutside ? " outside-month" : "");
      td.onclick = () => openDayEditor(dateStr);

      const isHolidayDate = HOLIDAYS.some((h) => h.date === dateStr);
      const dayNum = document.createElement("div");
      dayNum.className = "calendar-day-num" + (dateStr === todayStr ? " today" : "") + (isHolidayDate ? " holiday-date" : "");
      dayNum.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일`;
      td.appendChild(dayNum);

      const dayHoliday = HOLIDAYS.find((h) => h.date === dateStr);
      if (dayHoliday) {
        const line = document.createElement("div");
        line.className = "calendar-event-line holiday";
        line.textContent = dayHoliday.name;
        td.appendChild(line);
      }

      const dayEvents = TEAM_EVENTS.filter((ev) => ev.date === dateStr);
      dayEvents.forEach((ev) => {
        const line = document.createElement("div");
        line.className = "calendar-event-line" + (ev.highlight ? " highlight" : "");
        line.textContent = ev.text;
        td.appendChild(line);
      });

      /* 휴가 일정 탭에 등록된 휴가는 따로 다시 입력할 필요 없이, 시작일~종료일 범위에 맞춰 자동으로 여기에도 나타남 */
      const dayVacations = VACATIONS.filter((v) => dateStr >= v.startDate && dateStr <= v.endDate);
      dayVacations.forEach((v) => {
        const line = document.createElement("div");
        line.className = "calendar-event-line vacation";
        const unitLabel = VACATION_UNIT_LABELS[v.unit] || "연차";
        line.textContent = "🌴 " + firstNameOnly(v.name) + " (" + unitLabel + vacationPeriodLabel(v) + ")";
        td.appendChild(line);
      });

      const dayTentativeVacations = TENTATIVE_VACATIONS.filter((tv) => tv.date === dateStr);
      dayTentativeVacations.forEach((tv) => {
        const line = document.createElement("div");
        line.className = "calendar-event-line tentative-vacation";
        line.textContent = "🏖️ " + firstNameOnly(tv.name) + " (" + (tv.type || "연차") + " 찜)";
        td.appendChild(line);
      });

      row.appendChild(td);
    });
    tbody.appendChild(row);

    if (weekDates[4] >= lastOfMonth) break;
  }

  table.appendChild(tbody);
  grid.appendChild(table);
}

/* ---- 📅 달력에서 날짜 클릭 → 바로 일정 추가/수정/삭제 ---- */
function openDayEditor(dateStr) {
  const overlay = document.getElementById("dayEditOverlay");
  const [y, m, d] = dateStr.split("-").map(Number);
  document.getElementById("dayEditTitle").textContent = `📅 ${y}년 ${m}월 ${d}일 일정`;
  overlay.style.display = "flex";
  renderDayEditorBody(dateStr);
}

function closeDayEditor() {
  document.getElementById("dayEditOverlay").style.display = "none";
}

const TENTATIVE_VACATION_TYPES = ["연차", "오전반차", "오후반차", "오전반반차", "오후반반차"];

function renderDayEditorTvBox(box, dateStr, dayTentativeVacations) {
  if (!TENTATIVE_VACATION_API_URL) {
    box.style.display = "none";
    return;
  }
  box.innerHTML = "";

  const title = document.createElement("div");
  title.innerHTML = "🏖️ <b>휴가 찜하기</b> <span class=\"hint\" style=\"display:inline;\">(정식 승인 전, 미리 표시만 해두는 용도예요)</span>";
  title.style.marginBottom = "8px";
  box.appendChild(title);

  if (dayTentativeVacations.length > 0) {
    dayTentativeVacations.forEach((tv) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:6px;";
      const label = document.createElement("div");
      label.style.cssText = "flex:1;font-size:13px;";
      label.textContent = tv.name + " · " + (tv.type || "연차");
      row.appendChild(label);
      const delBtn = document.createElement("button");
      delBtn.className = "btn secondary-btn";
      delBtn.style.cssText = "flex-shrink:0;padding:6px 10px;font-size:12px;color:#dc2626;";
      delBtn.textContent = "삭제";
      delBtn.onclick = async () => {
        delBtn.disabled = true;
        const result = await deleteTentativeVacationFromServer(tv.id);
        if (!result.ok) { alert("삭제 실패: " + result.error); delBtn.disabled = false; return; }
        await loadTentativeVacations();
        renderTeamCalendar();
        renderDayEditorTvBox(box, dateStr, TENTATIVE_VACATIONS.filter((t) => t.date === dateStr));
      };
      row.appendChild(delBtn);
      box.appendChild(row);
    });
  }

  const addRow = document.createElement("div");
  addRow.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;";
  const nameSelect = document.createElement("select");
  nameSelect.style.cssText = "flex:1;margin-bottom:0;min-width:90px;";
  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = "이름 선택";
  nameSelect.appendChild(emptyOpt);
  OBL_TEAM_MEMBERS.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    nameSelect.appendChild(opt);
  });
  addRow.appendChild(nameSelect);

  const typeSelect = document.createElement("select");
  typeSelect.style.cssText = "flex:1;margin-bottom:0;min-width:100px;";
  TENTATIVE_VACATION_TYPES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    typeSelect.appendChild(opt);
  });
  addRow.appendChild(typeSelect);

  const addBtn = document.createElement("button");
  addBtn.className = "btn generate-btn";
  addBtn.style.cssText = "flex-shrink:0;padding:8px 14px;font-size:13px;";
  addBtn.textContent = "🏖️ 찜하기";
  addBtn.onclick = async () => {
    const name = nameSelect.value;
    const type = typeSelect.value;
    if (!name) { alert("이름을 선택해주세요."); return; }
    addBtn.disabled = true;
    const result = await submitTentativeVacationToServer({ name, date: dateStr, type });
    addBtn.disabled = false;
    if (!result.ok) { alert("등록 실패: " + result.error); return; }
    await loadTentativeVacations();
    renderTeamCalendar();
    renderDayEditorTvBox(box, dateStr, TENTATIVE_VACATIONS.filter((t) => t.date === dateStr));
  };
  addRow.appendChild(addBtn);
  box.appendChild(addRow);
}

function renderDayEditorBody(dateStr) {
  const body = document.getElementById("dayEditBody");
  body.innerHTML = "";

  const dayHoliday = HOLIDAYS.find((h) => h.date === dateStr);
  if (dayHoliday) {
    const holBox = document.createElement("div");
    holBox.className = "day-editor-holiday-box";
    holBox.innerHTML = "<b>공휴일</b>: " + escapeHtml(dayHoliday.name)
      + '<div class="hint" style="margin-top:4px;">공휴일 수정/삭제는 "⚙️ 관리 → 🔴 공휴일"에서 해주세요.</div>';
    body.appendChild(holBox);
  }

  const dayVacations = VACATIONS.filter((v) => dateStr >= v.startDate && dateStr <= v.endDate);
  if (dayVacations.length > 0) {
    const vacBox = document.createElement("div");
    vacBox.className = "day-editor-vacation-box";
    vacBox.innerHTML = "🌴 <b>이날 휴가</b>: " + dayVacations.map((v) => {
      const unitLabel = VACATION_UNIT_LABELS[v.unit] || "연차";
      return escapeHtml(firstNameOnly(v.name)) + " (" + unitLabel + vacationPeriodLabel(v) + ")";
    }).join(", ") + '<div class="hint" style="margin-top:4px;">휴가 수정/삭제는 "🌴 휴가 일정" 탭에서 해주세요.</div>';
    body.appendChild(vacBox);
  }

  const dayTentativeVacations = TENTATIVE_VACATIONS.filter((tv) => tv.date === dateStr);
  const tvBox = document.createElement("div");
  tvBox.className = "day-editor-tentative-box";
  tvBox.id = "dayEditorTvBox";
  renderDayEditorTvBox(tvBox, dateStr, dayTentativeVacations);
  body.appendChild(tvBox);

  const events = TEAM_EVENTS.filter((ev) => ev.date === dateStr);

  if (events.length > 0) {
    const list = document.createElement("div");
    list.style.marginBottom = "12px";
    events.forEach((ev) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:8px;";

      const input = document.createElement("input");
      input.value = ev.text;
      input.style.cssText = "flex:1;margin-bottom:0;";
      input.onchange = () => { ev.text = input.value; saveData(); refreshCurrentTab(); };
      row.appendChild(input);

      const highlightBtn = document.createElement("button");
      highlightBtn.className = "btn secondary-btn";
      highlightBtn.style.cssText = "flex-shrink:0;padding:8px 10px;font-size:12px;" + (ev.highlight ? "background:#f87171;color:#fff;border-color:#f87171;" : "");
      highlightBtn.textContent = "🔴";
      highlightBtn.title = "강조 표시 켜기/끄기";
      highlightBtn.onclick = async () => {
        const newHighlight = !ev.highlight;
        if (CORE_SHEET_API_URL) {
          const result = await updateTeamEventOnServer({ id: ev.id, date: ev.date, text: ev.text, highlight: newHighlight });
          if (!result.ok) { alert("변경에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
          await syncTeamEventsFromServer();
        } else {
          ev.highlight = newHighlight;
          saveData();
        }
        refreshCurrentTab();
        renderDayEditorBody(dateStr);
      };
      row.appendChild(highlightBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "btn secondary-btn";
      delBtn.style.cssText = "flex-shrink:0;padding:8px 10px;font-size:12px;color:#dc2626;";
      delBtn.textContent = "삭제";
      delBtn.onclick = async () => {
        if (CORE_SHEET_API_URL) {
          const result = await deleteTeamEventFromServer(ev.id);
          if (!result.ok) { alert("삭제에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
          await syncTeamEventsFromServer();
        } else {
          TEAM_EVENTS = TEAM_EVENTS.filter((t) => t.id !== ev.id);
          saveData();
        }
        refreshCurrentTab();
        renderDayEditorBody(dateStr);
      };
      row.appendChild(delBtn);

      list.appendChild(row);
    });
    body.appendChild(list);
  } else {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.style.marginBottom = "10px";
    empty.textContent = "아직 이 날짜에 등록된 일정이 없어요.";
    body.appendChild(empty);
  }

  const addRow = document.createElement("div");
  addRow.style.cssText = "display:flex;gap:6px;align-items:center;";
  const addInput = document.createElement("input");
  addInput.placeholder = "새 일정 (예: 민희 연차, 팀 회식 등)";
  addInput.style.cssText = "flex:1;margin-bottom:0;";
  addInput.onkeydown = (e) => { if (e.key === "Enter") addBtn.click(); };
  addRow.appendChild(addInput);
  const addBtn = document.createElement("button");
  addBtn.className = "btn generate-btn";
  addBtn.style.cssText = "flex-shrink:0;padding:8px 14px;font-size:13px;";
  addBtn.textContent = "+ 추가";
  addBtn.onclick = async () => {
    const text = addInput.value.trim();
    if (!text) return;
    if (CORE_SHEET_API_URL) {
      addBtn.disabled = true;
      const result = await submitTeamEventToServer({ date: dateStr, text, highlight: false });
      addBtn.disabled = false;
      if (!result.ok) { alert("등록에 실패했어요: " + (result.error || "알 수 없는 오류")); return; }
      await syncTeamEventsFromServer();
    } else {
      TEAM_EVENTS.push({ id: genId("te"), date: dateStr, text, highlight: false });
      saveData();
    }
    refreshCurrentTab();
    renderDayEditorBody(dateStr);
  };
  addRow.appendChild(addBtn);
  body.appendChild(addRow);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.style.marginTop = "10px";
  hint.textContent = "🔴 버튼을 누르면 공휴일·중요 행사처럼 빨간 강조 표시로 바뀌어요.";
  body.appendChild(hint);
}

/* =========================================================================
   메일 템플릿 탭 (기존 기능)
   ========================================================================= */

let currentType = null;
let currentTableRows = [];
let currentTableColumns = [];
let currentTablePlaceholders = [];
let currentTableEnabled = false;
let generatedOutputs = [];
let currentNtfType = null;
let currentNtfTableRows = [];
let generatedNtfOutputs = [];

function initTypeSelect() {
  const select = document.getElementById("type");
  const prevValue = select.value;
  select.innerHTML = "";

  const groupOrder = [];
  const groupMap = {};
  const ungrouped = [];

  TEMPLATES.forEach((tpl) => {
    const g = (tpl.group || "").trim();
    if (g) {
      if (!groupMap[g]) { groupMap[g] = []; groupOrder.push(g); }
      groupMap[g].push(tpl);
    } else {
      ungrouped.push(tpl);
    }
  });

  ungrouped.forEach((tpl) => {
    const opt = document.createElement("option");
    opt.value = tpl.id;
    opt.textContent = tpl.label;
    select.appendChild(opt);
  });

  groupOrder.forEach((g) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = g;
    groupMap[g].forEach((tpl) => {
      const opt = document.createElement("option");
      opt.value = tpl.id;
      opt.textContent = tpl.label;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  });

  if (TEMPLATES.some((t) => t.id === prevValue)) select.value = prevValue;
  currentType = select.value || (TEMPLATES[0] && TEMPLATES[0].id);
  renderFields();
  document.getElementById("tabs").innerHTML = "";
  document.getElementById("outputs").innerHTML = "";
  renderFavoriteRow();
}

function getCurrentTemplate() {
  return TEMPLATES.find((t) => t.id === currentType);
}

function renderGuide(tpl, boxId) {
  const box = document.getElementById(boxId || "guideBox");
  box.innerHTML = "";
  if (!tpl.guide || !tpl.guide.trim()) return;
  const wrap = document.createElement("div");
  wrap.className = "guide-box";
  const title = document.createElement("div");
  title.className = "guide-box-title";
  title.textContent = "💡 이럴 땐 이렇게 처리하세요";
  wrap.appendChild(title);
  const body = document.createElement("div");
  body.textContent = tpl.guide;
  wrap.appendChild(body);
  box.appendChild(wrap);
}

function renderFields() {
  currentType = document.getElementById("type").value;
  const wrap = document.getElementById("fields");
  wrap.innerHTML = "";
  const tpl = getCurrentTemplate();
  if (!tpl) return;

  renderGuide(tpl);

  tpl.fields.forEach((f) => {
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = f.label;
    const input = document.createElement(f.multiline ? "textarea" : "input");
    input.id = "field_" + f.id;
    input.placeholder = f.placeholder || "";
    if (f.multiline) input.className = "field-multiline";
    wrap.appendChild(label);
    wrap.appendChild(input);
  });

  if (tpl.fields.length === 0 && !tpl.table) {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "이 유형은 별도 입력값 없이 바로 생성 가능합니다.";
    wrap.appendChild(hint);
  }

  currentTableRows = [];
  currentTableColumns = [];
  currentTablePlaceholders = [];
  currentTableEnabled = false;
  renderMailTableEditor();
}

/* 메일 작성 카드의 "표 (선택사항)" 영역.
   관리에서는 이 유형이 표를 "쓸 수 있는지"만 켜두고(tpl.table), 실제 열/행 내용은
   여기 메일 작성 화면에서 팀원이 그때그때 자유롭게 채워 넣는다 (단, "고정 항목 비교표"는 행 이름이 고정돼서
   팀원은 값 칸만 채운다). */
function renderMailTableEditor() {
  const wrap = document.getElementById("tableEditorWrap");
  wrap.innerHTML = "";
  const tpl = getCurrentTemplate();
  if (!tpl || !tpl.table) { currentTableColumns = []; currentTableRows = []; currentTablePlaceholders = []; currentTableEnabled = false; return; }

  const isFixed = tpl.table.mode === "fixed";

  const sectionTitle = document.createElement("div");
  sectionTitle.className = "label";
  sectionTitle.innerHTML = '<span class="icon">📊</span>표 (선택사항 - 여러 건을 표로 넣고 싶을 때)';
  wrap.appendChild(sectionTitle);

  const toggleRow = document.createElement("label");
  toggleRow.className = "toggle-row";
  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = currentTableEnabled;
  toggleInput.onchange = (e) => {
    currentTableEnabled = e.target.checked;
    if (currentTableEnabled && currentTableColumns.length === 0) {
      if (isFixed) {
        const valueCols = (tpl.table.columns && tpl.table.columns.length) ? tpl.table.columns : ["값"];
        const labels = (tpl.table.rowLabels && tpl.table.rowLabels.length) ? tpl.table.rowLabels : ["항목1"];
        currentTableColumns = [""].concat(valueCols);
        currentTablePlaceholders = [""].concat(valueCols.map(() => ""));
        currentTableRows = labels.map((label) => [label].concat(valueCols.map(() => "")));
      } else {
        const defaults = (tpl.table && tpl.table.columns && tpl.table.columns.length) ? tpl.table.columns : null;
        if (defaults) {
          currentTableColumns = defaults.slice();
          currentTablePlaceholders = (tpl.table.placeholders || []).slice();
          while (currentTablePlaceholders.length < currentTableColumns.length) currentTablePlaceholders.push("");
          currentTableRows = [defaults.map(() => "")];
        } else {
          currentTableColumns = ["항목1", "항목2"];
          currentTablePlaceholders = ["", ""];
          currentTableRows = [["", ""]];
        }
      }
    }
    renderMailTableEditor();
  };
  toggleRow.appendChild(toggleInput);
  toggleRow.appendChild(document.createTextNode("표 추가하기"));
  wrap.appendChild(toggleRow);

  if (!currentTableEnabled) return;

  if (isFixed) {
    const fixedHint = document.createElement("div");
    fixedHint.className = "hint";
    fixedHint.style.cssText = "margin-top:8px;";
    fixedHint.textContent = "항목 이름은 고정돼 있어요. 값 칸만 채워주세요.";
    wrap.appendChild(fixedHint);

    const fixedWrap = document.createElement("div");
    fixedWrap.id = "composeFixedTableWrap";
    wrap.appendChild(fixedWrap);
    renderFixedTableEditor(fixedWrap, tpl);
    return;
  }

  const colHint = document.createElement("div");
  colHint.className = "hint";
  colHint.style.cssText = "margin-top:8px;";
  colHint.textContent = "표의 열(컬럼) 이름을 순서대로 적어주세요.";
  wrap.appendChild(colHint);

  const colWrap = document.createElement("div");
  colWrap.id = "composeTableColWrap";
  wrap.appendChild(colWrap);
  renderComposeTableColEditor(colWrap);

  const addColBtn = document.createElement("button");
  addColBtn.className = "add-row-btn";
  addColBtn.textContent = "＋ 열 추가";
  addColBtn.onclick = () => {
    currentTableColumns.push("새 열");
    currentTablePlaceholders.push("");
    currentTableRows.forEach((r) => r.push(""));
    renderMailTableEditor();
  };
  wrap.appendChild(addColBtn);

  const rowsLabel = document.createElement("div");
  rowsLabel.className = "label";
  rowsLabel.style.cssText = "margin-top:14px;";
  rowsLabel.innerHTML = '<span class="icon">📋</span>표 데이터 (필요한 만큼 행 추가)';
  wrap.appendChild(rowsLabel);

  const rowsWrap = document.createElement("div");
  rowsWrap.id = "composeTableRowsWrap";
  wrap.appendChild(rowsWrap);
  renderComposeTableRowsEditor(rowsWrap);

  const addRowBtn = document.createElement("button");
  addRowBtn.className = "add-row-btn";
  addRowBtn.textContent = "＋ 행 추가";
  addRowBtn.onclick = () => {
    currentTableRows.push(currentTableColumns.map(() => ""));
    renderComposeTableRowsEditor(document.getElementById("composeTableRowsWrap"));
  };
  wrap.appendChild(addRowBtn);
}

/* 고정 항목 비교표 - 행(항목) 이름은 고정, 팀원은 값 칸만 채움 */
function renderFixedTableEditor(wrap, tpl) {
  wrap.innerHTML = "";
  const valueCols = currentTableColumns.slice(1); // 첫 열은 항목 이름 열(고정)이라 값 열에서 제외

  const table = document.createElement("table");
  table.className = "table-editor";
  const thead = document.createElement("tr");
  thead.innerHTML = "<th>항목</th>" + valueCols.map((c) => "<th>" + escapeHtml(c) + "</th>").join("");
  table.appendChild(thead);

  currentTableRows.forEach((row, rIdx) => {
    const tr = document.createElement("tr");
    const labelTd = document.createElement("td");
    labelTd.className = "fixed-table-row-label";
    labelTd.textContent = row[0] || "";
    tr.appendChild(labelTd);
    valueCols.forEach((c, cIdx) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.value = row[cIdx + 1] || "";
      input.placeholder = (currentTablePlaceholders && currentTablePlaceholders[cIdx + 1]) || "";
      input.oninput = (e) => { currentTableRows[rIdx][cIdx + 1] = e.target.value; };
      td.appendChild(input);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  const scrollWrap = document.createElement("div");
  scrollWrap.className = "table-editor-scroll";
  scrollWrap.appendChild(table);
  wrap.appendChild(scrollWrap);
}

function renderComposeTableColEditor(wrap) {
  wrap.innerHTML = "";
  currentTableColumns.forEach((col, idx) => {
    const row = document.createElement("div");
    row.className = "field-row-top";
    row.style.marginTop = "6px";
    const input = document.createElement("input");
    input.value = col;
    input.placeholder = "열 이름 (예: M/V)";
    input.oninput = (e) => {
      currentTableColumns[idx] = e.target.value;
      renderComposeTableRowsEditor(document.getElementById("composeTableRowsWrap"));
    };
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-row";
    removeBtn.textContent = "삭제";
    removeBtn.onclick = () => {
      currentTableColumns.splice(idx, 1);
      currentTablePlaceholders.splice(idx, 1);
      currentTableRows.forEach((r) => r.splice(idx, 1));
      renderMailTableEditor();
    };
    row.appendChild(input);
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

function renderComposeTableRowsEditor(wrap) {
  wrap.innerHTML = "";
  if (currentTableColumns.length === 0) return;
  const tableEl = document.createElement("table");
  tableEl.className = "table-editor";
  const headerRow = document.createElement("tr");
  currentTableColumns.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c || "(이름 없음)";
    headerRow.appendChild(th);
  });
  headerRow.appendChild(document.createElement("th"));
  tableEl.appendChild(headerRow);

  currentTableRows.forEach((row, rIdx) => {
    const tr = document.createElement("tr");
    currentTableColumns.forEach((c, cIdx) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.value = row[cIdx] || "";
      input.placeholder = currentTablePlaceholders[cIdx] || "";
      input.oninput = (e) => { currentTableRows[rIdx][cIdx] = e.target.value; };
      td.appendChild(input);
      tr.appendChild(td);
    });
    const delTd = document.createElement("td");
    delTd.className = "del-cell";
    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.onclick = () => { currentTableRows.splice(rIdx, 1); renderComposeTableRowsEditor(wrap); };
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);
    tableEl.appendChild(tr);
  });
  const scrollWrap = document.createElement("div");
  scrollWrap.className = "table-editor-scroll";
  scrollWrap.appendChild(tableEl);
  wrap.appendChild(scrollWrap);
}

function onTypeChange() {
  renderFields();
  document.getElementById("tabs").innerHTML = "";
  document.getElementById("outputs").innerHTML = "";
  renderFavoriteRow();
  const tpl = getCurrentTemplate();
  if (tpl) recordRecentItem("template", tpl.id, "✉️ " + tpl.label);
}

function collectValues() {
  const tpl = getCurrentTemplate();
  const values = {};
  tpl.fields.forEach((f) => { values[f.label] = document.getElementById("field_" + f.id).value; });
  return values;
}

function substitute(text, values) {
  let result = text;
  Object.keys(values).forEach((label) => { result = result.split("{{" + label + "}}").join(values[label]); });
  return result;
}

/* NTF 전용: 템플릿 안의 <b>, <div style="text-align:right"> 같은 서식 태그는 그대로 두고,
   {{필드}} 자리에 들어가는 실제 입력값만 안전하게 escape 해서 치환 */
function substituteHtml(text, values) {
  let result = text;
  Object.keys(values).forEach((label) => { result = result.split("{{" + label + "}}").join(escapeHtml(values[label])); });
  return result;
}

/* NTF 전용: 회사 NTF 발송 시스템이 UTF-8 외 인코딩으로 파일을 읽으면서 말줄임표(…)나 스마트 어퍼스트로피(’)
   같은 특수문자가 â€¦ / â€™ 처럼 깨지는 문제가 있어서, 생성 시점에 전부 안전한 일반 ASCII 문자로 바꿔준다. */
function normalizeSmartChars(str) {
  if (!str) return str;
  return str
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // 스마트 어퍼스트로피/작은따옴표 → '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // 스마트 큰따옴표 → "
    .replace(/\u2026/g, "...")                     // 말줄임표(…) → ...
    .replace(/[\u2013\u2014]/g, "-")               // en/em dash → -
    .replace(/\u00A0/g, " ");                      // 줄바꿈 없는 공백 → 일반 공백
}

/* NTF 전용: HTML 태그를 걷어내고 순수 텍스트만 남김 (일반 텍스트 복사/메일 본문용) */
function stripHtmlTags(html) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
}

function buildTableParts() {
  const columns = currentTableColumns;
  const rows = currentTableRows.filter((r) => r.some((cell) => cell && cell.trim() !== ""));
  const plain = columns.join("\t") + "\n" + rows.map((r) => r.map((c) => c || "").join("\t")).join("\n");

  /* 표 스타일은 인라인으로 직접 넣는다. 아웃룩/지메일은 외부 style.css를 읽지 않기 때문에,
     복사했을 때도 색이 그대로 유지되려면 style 속성이 태그에 박혀 있어야 한다. */
  const tableStyle = "border-collapse:collapse;margin:8px 0;";
  const thStyle = "border:1px solid #bcdff2;background:#e8f6fd;color:#1c5a7a;padding:6px 10px;font-size:13px;text-align:left;";
  const tdStyle = "border:1px solid #d9edf7;padding:6px 10px;font-size:13px;";

  let html = `<table style="${tableStyle}">`;
  html += "<tr>" + columns.map((c) => `<th style="${thStyle}">${escapeHtml(c)}</th>`).join("") + "</tr>";
  rows.forEach((r) => { html += "<tr>" + columns.map((c, i) => `<td style="${tdStyle}">${escapeHtml(r[i] || "")}</td>`).join("") + "</tr>"; });
  html += "</table>";
  return { plain, html };
}

function generate() {
  const tpl = getCurrentTemplate();
  if (!tpl) return;
  const values = collectValues();

  const tabsWrap = document.getElementById("tabs");
  const outputsWrap = document.getElementById("outputs");
  tabsWrap.innerHTML = "";
  outputsWrap.innerHTML = "";
  generatedOutputs = [];

  tpl.outputs.forEach((out, idx) => {
    if (tpl.outputs.length > 1) {
      const tabBtn = document.createElement("button");
      tabBtn.className = "tab-btn" + (idx === 0 ? " active" : "");
      tabBtn.textContent = out.name;
      tabBtn.onclick = () => switchTab(idx);
      tabsWrap.appendChild(tabBtn);
    }

    const block = document.createElement("div");
    block.className = "output-block" + (idx === 0 ? " active" : "");
    block.id = "output_" + idx;

    const toResolved = out.to ? substitute(out.to, values).trim() : "";
    const subjectResolved = out.subject ? substitute(out.subject, values).trim() : "";
    const hasTableToken = tpl.table && out.text.indexOf("{{표}}") !== -1;
    const tableActive = hasTableToken && currentTableEnabled && currentTableColumns.length > 0;

    let plainFull, htmlFull;
    if (hasTableToken) {
      const textParts = out.text.split("{{표}}").map((p) => substitute(p, values));
      if (tableActive) {
        const tableParts = buildTableParts();
        plainFull = textParts.join(tableParts.plain);
        htmlFull = textParts.map((p) => escapeHtml(p).split("\n").join("<br>")).join(tableParts.html);
      } else {
        /* 표를 이번엔 안 쓰기로 했으면(체크 안 함) {{표}} 자리는 그냥 비워둔다 */
        plainFull = textParts.join("");
        htmlFull = textParts.map((p) => escapeHtml(p).split("\n").join("<br>")).join("");
      }
    } else {
      plainFull = substitute(out.text, values);
      htmlFull = escapeHtml(plainFull).split("\n").join("<br>");
    }

    const outImages = (out.images && out.images.length) ? out.images : (out.image ? [out.image] : []);
    if (outImages.length > 0) {
      outImages.forEach((src) => {
        htmlFull += '<br><img src="' + src + '" style="max-width:100%;margin-top:10px;" alt="첨부 이미지">';
      });
      plainFull += "\n[이미지 " + outImages.length + "장 첨부됨 - 미리보기 화면에서 확인해주세요]";
    }

    generatedOutputs[idx] = {
      name: out.name, hasTable: tableActive, hasImage: outImages.length > 0, plainText: plainFull, htmlText: "<div>" + htmlFull + "</div>",
      to: toResolved, subject: subjectResolved, attachments: out.attachments || [], attachmentLink: out.attachmentLink || ""
    };

    if (toResolved || subjectResolved) appendToRow(block, idx, toResolved, subjectResolved);
    if ((out.attachments && out.attachments.length > 0) || out.attachmentLink) appendAttachBox(block, out.attachments || [], out.attachmentLink);

    const toolbar = document.createElement("div");
    toolbar.className = "mail-format-toolbar";
    const boldBtn = document.createElement("button");
    boldBtn.type = "button";
    boldBtn.className = "btn secondary-btn";
    boldBtn.innerHTML = "<b>B</b> 굵게";
    boldBtn.onmousedown = (e) => e.preventDefault();
    boldBtn.onclick = () => applyMailFormat(idx, "bold");
    const highlightBtn = document.createElement("button");
    highlightBtn.type = "button";
    highlightBtn.className = "btn secondary-btn";
    highlightBtn.innerHTML = "🖍️ 형광펜";
    highlightBtn.onmousedown = (e) => e.preventDefault();
    highlightBtn.onclick = () => applyMailFormat(idx, "hiliteColor", "#fff59d");
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn secondary-btn";
    clearBtn.textContent = "✕ 서식 지우기";
    clearBtn.onmousedown = (e) => e.preventDefault();
    clearBtn.onclick = () => applyMailFormat(idx, "removeFormat");
    toolbar.appendChild(boldBtn);
    toolbar.appendChild(highlightBtn);
    toolbar.appendChild(clearBtn);
    block.appendChild(toolbar);

    const toolbarHint = document.createElement("div");
    toolbarHint.className = "hint";
    toolbarHint.style.margin = "4px 0 8px";
    toolbarHint.textContent = "강조하고 싶은 글자를 드래그해서 선택한 뒤 위 버튼을 눌러보세요.";
    block.appendChild(toolbarHint);

    const previewDiv = document.createElement("div");
    previewDiv.className = "preview-html";
    previewDiv.id = "preview_" + idx;
    previewDiv.contentEditable = "true";
    previewDiv.innerHTML = htmlFull;
    block.appendChild(previewDiv);

    if (tableActive) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "표 내용을 고치려면 왼쪽 표 데이터를 수정한 뒤 다시 생성해주세요.";
      block.appendChild(hint);
    }

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn copy-btn full";
    copyBtn.textContent = tableActive ? "📋 답장 복사하기 (표 포함)" : "📋 답장 복사하기";
    copyBtn.onclick = () => copyText(idx);
    block.appendChild(copyBtn);

    outputsWrap.appendChild(block);
  });
}

/* 메일 미리보기(contentEditable) 안에서 굵게/형광펜/서식 지우기 적용 */
function applyMailFormat(idx, command, value) {
  const previewEl = document.getElementById("preview_" + idx);
  if (!previewEl) return;
  previewEl.focus();
  document.execCommand(command, false, value || null);
}

function appendAttachBox(block, attachments, attachmentLink) {
  const box = document.createElement("div");
  box.className = "attach-box";
  const title = document.createElement("div");
  title.className = "attach-box-title";
  title.textContent = "📎 첨부파일 (직접 메일에 첨부해주세요)";
  box.appendChild(title);

  if (attachmentLink) {
    const linkRow = document.createElement("div");
    linkRow.className = "attach-download-row";
    const label = document.createElement("div");
    label.style.flex = "1";
    label.style.wordBreak = "break-all";
    label.textContent = "🔗 " + attachmentLink;
    linkRow.appendChild(label);
    const openBtn = document.createElement("a");
    openBtn.href = attachmentLink;
    openBtn.target = "_blank";
    openBtn.rel = "noopener noreferrer";
    openBtn.textContent = "열기";
    linkRow.appendChild(openBtn);
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn secondary-btn";
    copyBtn.style.cssText = "padding:6px 12px;font-size:12px;flex-shrink:0;";
    copyBtn.textContent = "링크 복사";
    copyBtn.onclick = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(attachmentLink).then(() => alert("링크 복사 완료 💖")).catch(() => legacyCopy(attachmentLink));
      } else { legacyCopy(attachmentLink); }
    };
    linkRow.appendChild(copyBtn);
    box.appendChild(linkRow);
  }

  attachments.forEach((att) => {
    const row = document.createElement("div");
    row.className = "attach-download-row";
    const name = document.createElement("div");
    name.style.flex = "1";
    name.textContent = "📄 " + att.name + " (" + formatFileSize(att.size) + ")";
    row.appendChild(name);
    const a = document.createElement("a");
    a.href = att.dataUrl;
    a.download = att.name;
    a.textContent = "⬇️ 다운로드";
    row.appendChild(a);
    box.appendChild(row);
  });

  block.appendChild(box);
}

function appendToRow(block, idx, toResolved, subjectResolved) {
  if (!toResolved && !subjectResolved) return;
  const toRow = document.createElement("div");
  toRow.className = "mail-meta-box";

  const textWrap = document.createElement("div");
  textWrap.className = "mail-meta-text";
  if (toResolved) {
    const toLine = document.createElement("div");
    toLine.className = "mail-meta-line";
    toLine.innerHTML = '<span class="mail-meta-badge">TO</span><span class="mail-meta-value">' + escapeHtml(toResolved) + "</span>";
    textWrap.appendChild(toLine);
  }
  if (subjectResolved) {
    const subjLine = document.createElement("div");
    subjLine.className = "mail-meta-line";
    subjLine.innerHTML = '<span class="mail-meta-badge mail-meta-badge-subject">제목</span><span class="mail-meta-value">' + escapeHtml(subjectResolved) + "</span>";
    textWrap.appendChild(subjLine);
  }
  toRow.appendChild(textWrap);

  const btnWrap = document.createElement("div");
  btnWrap.className = "mail-meta-btns";
  if (toResolved) {
    const toCopyBtn = document.createElement("button");
    toCopyBtn.className = "btn secondary-btn";
    toCopyBtn.style.cssText = "flex-shrink:0;padding:8px 12px;font-size:12px;";
    toCopyBtn.textContent = "TO 복사";
    toCopyBtn.onclick = () => copyToAddress(idx);
    btnWrap.appendChild(toCopyBtn);
  }
  if (subjectResolved) {
    const titleCopyBtn = document.createElement("button");
    titleCopyBtn.className = "btn secondary-btn";
    titleCopyBtn.style.cssText = "flex-shrink:0;padding:8px 12px;font-size:12px;";
    titleCopyBtn.textContent = "📌 제목 복사";
    titleCopyBtn.onclick = () => copySubjectOnly(idx);
    btnWrap.appendChild(titleCopyBtn);
  }
  if (toResolved) {
    const mailBtn = document.createElement("button");
    mailBtn.className = "btn generate-btn";
    mailBtn.style.cssText = "flex-shrink:0;padding:8px 12px;font-size:12px;";
    mailBtn.textContent = "📧 메일 앱 열기";
    mailBtn.onclick = () => openMailClient(idx);
    btnWrap.appendChild(mailBtn);
  }
  toRow.appendChild(btnWrap);
  block.appendChild(toRow);
}

function copyToAddress(idx) {
  const info = generatedOutputs[idx];
  if (!info || !info.to) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(info.to).then(() => alert("TO 주소 복사 완료 💖")).catch(() => legacyCopy(info.to));
  } else { legacyCopy(info.to); }
}

function copySubjectOnly(idx) {
  const info = generatedOutputs[idx];
  if (!info || !info.subject) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(info.subject).then(() => alert("제목 복사 완료 💖")).catch(() => legacyCopy(info.subject));
  } else { legacyCopy(info.subject); }
}

function openMailClient(idx) {
  const info = generatedOutputs[idx];
  if (!info || !info.to) return;
  const previewEl = document.getElementById("preview_" + idx);
  const body = previewEl ? previewEl.innerText : (info.plainText || "");
  const link = "mailto:" + encodeURIComponent(info.to) + "?subject=" + encodeURIComponent(info.subject || "") + "&body=" + encodeURIComponent(body);
  if (info.hasTable) {
    alert("메일 앱이 열립니다. mailto 링크는 서식(색·테두리)을 담을 수 없어서, 표는 예쁜 모양 없이 텍스트로만 들어가요. 표 모양 그대로 넣고 싶으면 위의 \"복사하기\"로 복사해서 메일 앱에 직접 붙여넣어주세요.");
  }
  if (info.hasImage) {
    alert("메일 앱이 열립니다. mailto 링크는 이미지를 담을 수 없어서, 본문 이미지는 안 들어가요. 이미지까지 넣고 싶으면 위의 \"복사하기\"로 복사해서 메일 앱에 직접 붙여넣어주세요.");
  }
  if ((info.attachments && info.attachments.length > 0) || info.attachmentLink) {
    alert("메일 앱이 열립니다. 첨부파일/링크는 자동으로 들어가지 않으니, 위에서 다운로드하거나 링크를 열어 받은 파일을 메일 창에 직접 첨부해주세요.");
  }
  window.location.href = link;
}

function switchTab(idx) {
  document.querySelectorAll(".tab-btn").forEach((el, i) => el.classList.toggle("active", i === idx));
  document.querySelectorAll(".output-block").forEach((el) => el.classList.toggle("active", el.id === "output_" + idx));
}

function copyText(idx) {
  const info = generatedOutputs[idx];
  if (!info) return;
  const previewEl = document.getElementById("preview_" + idx);
  const liveHtml = previewEl ? previewEl.innerHTML : (info.hasTable ? info.htmlText : escapeHtml(info.plainText).split("\n").join("<br>"));
  const livePlain = previewEl ? previewEl.innerText : info.plainText;
  const fontWrappedHtml = wrapEmailHtmlFont(liveHtml);

  if (copyHtmlViaSelection(fontWrappedHtml)) {
    alert(info.hasTable ? "복사 완료 💖 (아웃룩/지메일에 붙여넣으면 표 형태 그대로 들어갑니다)" : "복사 완료 💖");
  } else if (navigator.clipboard && window.ClipboardItem) {
    const item = new ClipboardItem({
      "text/html": new Blob([fontWrappedHtml], { type: "text/html" }),
      "text/plain": new Blob([livePlain], { type: "text/plain" })
    });
    navigator.clipboard.write([item]).then(() => alert(info.hasTable ? "복사 완료 💖 (아웃룩/지메일에 붙여넣으면 표 형태 그대로 들어갑니다)" : "복사 완료 💖")).catch(() => legacyCopy(livePlain));
  } else { legacyCopy(livePlain); }
}

/* 표(HTML)를 실제로 클립보드에 "표 형태"로 복사하기 위한 보조 함수.
   navigator.clipboard.write(ClipboardItem)이 (권한 문제 등으로) 조용히 실패하는 환경이 있어서,
   화면에 보이지 않는 편집 가능한 요소를 만들고 그 내용을 "선택"한 뒤 execCommand('copy')로 복사한다.
   이 방식은 브라우저가 표준적으로 지원하는 "선택 영역 복사"이기 때문에 아웃룩/워드에서도
   표(HTML) 형식이 훨씬 안정적으로 인식된다. */
/* 복사한 내용을 아웃룩/지메일에 붙여넣었을 때 앱 기본 폰트가 아니라 항상 Calibri 11pt로
   고정되어 들어가도록, 복사 직전에 인라인 스타일로 감싸준다. (표 안의 th/td처럼 이미
   자체 스타일이 있는 요소는 그 스타일이 우선 적용되니 표 모양엔 영향 없음) */
function wrapEmailHtmlFont(html) {
  return '<div style="font-family:Calibri, Arial, sans-serif; font-size:11pt; color:#000000; background:transparent; background-color:transparent; border:none; box-shadow:none; margin:0; padding:0;">' + html + "</div>";
}

function copyHtmlViaSelection(html) {
  try {
    const container = document.createElement("div");
    container.innerHTML = html;
    container.setAttribute("contenteditable", "true");
    container.style.position = "fixed";
    container.style.left = "-99999px";
    container.style.top = "0";
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const ok = document.execCommand("copy");

    sel.removeAllRanges();
    document.body.removeChild(container);
    return ok;
  } catch (e) {
    return false;
  }
}

function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
  alert("복사 완료 💖");
}

/* =========================================================================
   📨 공문 발송 (NTF) 탭 — 메일 템플릿과 동일한 방식이지만 완전히 별도의 목록/상태로 동작
   ========================================================================= */

function getCurrentNtfTemplate() {
  return NTF_TEMPLATES.find((t) => t.id === currentNtfType);
}

function initNtfTypeSelect() {
  const select = document.getElementById("ntfType");
  const prevValue = select.value;
  select.innerHTML = "";

  const groupOrder = [];
  const groupMap = {};
  const ungrouped = [];

  NTF_TEMPLATES.forEach((tpl) => {
    const g = (tpl.group || "").trim();
    if (g) {
      if (!groupMap[g]) { groupMap[g] = []; groupOrder.push(g); }
      groupMap[g].push(tpl);
    } else {
      ungrouped.push(tpl);
    }
  });

  ungrouped.forEach((tpl) => {
    const opt = document.createElement("option");
    opt.value = tpl.id;
    opt.textContent = tpl.label;
    select.appendChild(opt);
  });

  groupOrder.forEach((g) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = g;
    groupMap[g].forEach((tpl) => {
      const opt = document.createElement("option");
      opt.value = tpl.id;
      opt.textContent = tpl.label;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  });

  if (NTF_TEMPLATES.some((t) => t.id === prevValue)) select.value = prevValue;
  currentNtfType = select.value || (NTF_TEMPLATES[0] && NTF_TEMPLATES[0].id);
  renderNtfFields();
  document.getElementById("ntfTabs").innerHTML = "";
  document.getElementById("ntfOutputs").innerHTML = "";
}

function onNtfTypeChange() {
  renderNtfFields();
  document.getElementById("ntfTabs").innerHTML = "";
  document.getElementById("ntfOutputs").innerHTML = "";
  const tpl = getCurrentNtfTemplate();
  if (tpl) recordRecentItem("ntf", tpl.id, "📨 " + tpl.label);
}

function renderNtfFields() {
  currentNtfType = document.getElementById("ntfType").value;
  const wrap = document.getElementById("ntfFields");
  wrap.innerHTML = "";
  const tpl = getCurrentNtfTemplate();
  if (!tpl) return;

  renderGuide(tpl, "ntfGuideBox");

  tpl.fields.forEach((f) => {
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = f.label;
    const input = document.createElement("input");
    input.id = "ntf_field_" + f.id;
    input.placeholder = f.placeholder || "";
    wrap.appendChild(label);
    wrap.appendChild(input);
  });

  if (tpl.fields.length === 0 && !tpl.table) {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "이 유형은 별도 입력값 없이 바로 생성 가능합니다.";
    wrap.appendChild(hint);
  }

  currentNtfTableRows = [];
  renderNtfTableEditor();
}

function renderNtfTableEditor() {
  const wrap = document.getElementById("ntfTableEditorWrap");
  wrap.innerHTML = "";
  const tpl = getCurrentNtfTemplate();
  if (!tpl || !tpl.table || !tpl.table.columns.length) { currentNtfTableRows = []; return; }
  if (currentNtfTableRows.length === 0) currentNtfTableRows.push(tpl.table.columns.map(() => ""));

  const label = document.createElement("div");
  label.className = "label";
  label.innerHTML = '<span class="icon">📊</span>표 데이터 (필요한 만큼 행 추가)';
  wrap.appendChild(label);

  const tableEl = document.createElement("table");
  tableEl.className = "table-editor";
  const headerRow = document.createElement("tr");
  tpl.table.columns.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    headerRow.appendChild(th);
  });
  headerRow.appendChild(document.createElement("th"));
  tableEl.appendChild(headerRow);

  currentNtfTableRows.forEach((row, rIdx) => {
    const tr = document.createElement("tr");
    tpl.table.columns.forEach((c, cIdx) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.value = row[cIdx] || "";
      input.oninput = (e) => { currentNtfTableRows[rIdx][cIdx] = e.target.value; };
      td.appendChild(input);
      tr.appendChild(td);
    });
    const delTd = document.createElement("td");
    delTd.className = "del-cell";
    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.onclick = () => { currentNtfTableRows.splice(rIdx, 1); renderNtfTableEditor(); };
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);
    tableEl.appendChild(tr);
  });
  const ntfScrollWrap = document.createElement("div");
  ntfScrollWrap.className = "table-editor-scroll";
  ntfScrollWrap.appendChild(tableEl);
  wrap.appendChild(ntfScrollWrap);

  const addRowBtn = document.createElement("button");
  addRowBtn.className = "add-row-btn";
  addRowBtn.textContent = "＋ 행 추가";
  addRowBtn.onclick = () => { currentNtfTableRows.push(tpl.table.columns.map(() => "")); renderNtfTableEditor(); };
  wrap.appendChild(addRowBtn);
}

function collectNtfValues() {
  const tpl = getCurrentNtfTemplate();
  const values = {};
  tpl.fields.forEach((f) => { values[f.label] = document.getElementById("ntf_field_" + f.id).value; });
  return values;
}

function buildNtfTableParts(tpl) {
  const columns = tpl.table.columns;
  const rows = currentNtfTableRows.filter((r) => r.some((cell) => cell && cell.trim() !== ""));
  const plain = columns.join("\t") + "\n" + rows.map((r) => r.map((c) => c || "").join("\t")).join("\n");

  /* 표 스타일은 인라인으로 직접 넣는다 - 일부 발송 시스템이 <head><style> 안 규칙을 못 읽거나
     이상하게 처리해서(빈 박스로 남는 등), 태그마다 style 속성을 직접 박아넣어야 확실히 유지된다. */
  const tableStyle = "border-collapse:collapse;margin:12px 0;font-size:12px;width:100%;";
  const thStyle = "background:#003366;color:#fff;padding:6px 10px;text-align:left;font-weight:600;font-size:11px;";
  const tdStyle = "padding:6px 10px;border:1px solid #ccc;font-size:12px;";

  let html = `<table style="${tableStyle}">`;
  html += "<tr>" + columns.map((c) => `<th style="${thStyle}">${escapeHtml(c)}</th>`).join("") + "</tr>";
  rows.forEach((r) => { html += "<tr>" + columns.map((c, i) => `<td style="${tdStyle}">${escapeHtml(r[i] || "")}</td>`).join("") + "</tr>"; });
  html += "</table>";
  return { plain, html };
}

function generateNtf() {
  const tpl = getCurrentNtfTemplate();
  if (!tpl) return;
  const values = collectNtfValues();

  const tabsWrap = document.getElementById("ntfTabs");
  const outputsWrap = document.getElementById("ntfOutputs");
  tabsWrap.innerHTML = "";
  outputsWrap.innerHTML = "";
  generatedNtfOutputs = [];
  const todayLabel = formatNtfDate();

  tpl.outputs.forEach((out, idx) => {
    if (tpl.outputs.length > 1) {
      const tabBtn = document.createElement("button");
      tabBtn.className = "tab-btn ntf-tab-btn" + (idx === 0 ? " active" : "");
      tabBtn.textContent = out.name;
      tabBtn.onclick = () => switchNtfTab(idx);
      tabsWrap.appendChild(tabBtn);
    }

    const block = document.createElement("div");
    block.className = "output-block ntf-output-block" + (idx === 0 ? " active" : "");
    block.id = "ntf_output_" + idx;

    const toResolved = out.to ? normalizeSmartChars(substitute(out.to, values)).trim() : "";
    const subjectResolved = out.subject ? normalizeSmartChars(substitute(out.subject, values)).trim() : "";
    const hasTableToken = tpl.table && out.text.indexOf("{{표}}") !== -1;

    generatedNtfOutputs[idx] = {
      name: out.name, hasTable: hasTableToken, to: toResolved, subject: subjectResolved,
      attachments: out.attachments || [], attachmentLink: out.attachmentLink || "", date: todayLabel
    };

    if (toResolved) appendNtfToRow(block, idx, toResolved, "");
    if ((out.attachments && out.attachments.length > 0) || out.attachmentLink) appendAttachBox(block, out.attachments || [], out.attachmentLink);

    // 고정 TO/FROM + 수정 가능한 제목(TITLE)
    const letterhead = document.createElement("div");
    letterhead.className = "ntf-letterhead-box";
    letterhead.innerHTML = `<div class="ntf-letterhead-date" id="ntf_date_${idx}">${escapeHtml(todayLabel)}</div>
      <div class="ntf-letterhead-line"><b>TO</b>&nbsp;&nbsp;&nbsp;&nbsp;: ${escapeHtml(NTF_LETTERHEAD.to)}</div>
      <div class="ntf-letterhead-line"><b>FROM</b> : ${escapeHtml(NTF_LETTERHEAD.from)}</div>`;
    const titleRow = document.createElement("div");
    titleRow.className = "ntf-letterhead-title-row";
    const titleLabel = document.createElement("span");
    titleLabel.innerHTML = "<b>NOTIFICATION TITLE</b> :";
    const titleInput = document.createElement("input");
    titleInput.id = "ntf_title_" + idx;
    titleInput.className = "ntf-title-input";
    titleInput.value = subjectResolved;
    titleRow.appendChild(titleLabel);
    titleRow.appendChild(titleInput);
    letterhead.appendChild(titleRow);
    const titleHint = document.createElement("div");
    titleHint.className = "hint";
    titleHint.style.margin = "4px 0 0";
    titleHint.textContent = "제목은 자동으로 채워지지만, 필요하면 직접 고쳐서 복사/저장할 수 있어요.";
    letterhead.appendChild(titleHint);
    block.appendChild(letterhead);

    const titleCopyBtn = document.createElement("button");
    titleCopyBtn.className = "btn secondary-btn full";
    titleCopyBtn.style.marginBottom = "10px";
    titleCopyBtn.textContent = "📌 제목 복사";
    titleCopyBtn.onclick = () => copyNtfTitle(idx);
    block.appendChild(titleCopyBtn);

    if (hasTableToken) {
      const tableParts = buildNtfTableParts(tpl);
      const textParts = out.text.split("{{표}}");
      const plainFull = normalizeSmartChars(textParts.map((p) => substitute(p, values)).join(tableParts.plain));
      const htmlFull = normalizeSmartChars(textParts.map((p) => substituteHtml(p, values).split("\n").join("<br>")).join(tableParts.html));

      generatedNtfOutputs[idx].plainText = plainFull;
      generatedNtfOutputs[idx].htmlText = htmlFull;
    } else {
      const plainFull = normalizeSmartChars(substitute(out.text, values));
      const htmlFull = normalizeSmartChars(substituteHtml(out.text, values).split("\n").join("<br>"));

      generatedNtfOutputs[idx].plainText = plainFull;
      generatedNtfOutputs[idx].htmlText = htmlFull;
    }

    const previewDiv = document.createElement("div");
    previewDiv.className = "preview-html ntf-body-preview";
    previewDiv.id = "ntf_htmlpreview_" + idx;
    previewDiv.contentEditable = "true";
    previewDiv.innerHTML = generatedNtfOutputs[idx].htmlText;
    block.appendChild(previewDiv);

    const editHint = document.createElement("div");
    editHint.className = "hint";
    editHint.textContent = hasTableToken
      ? "표 내용을 고치려면 왼쪽 표 데이터를 수정한 뒤 다시 생성해주세요. 본문 영역은 직접 클릭해서 문구를 조금씩 수정할 수도 있어요."
      : "본문 영역을 직접 클릭하면 문구를 바로 수정할 수 있어요 (볼드·정렬 서식은 유지돼요).";
    block.appendChild(editHint);

    const copyBodyBtn = document.createElement("button");
    copyBodyBtn.className = "btn generate-btn full";
    copyBodyBtn.style.marginTop = "8px";
    copyBodyBtn.textContent = "📋 본문 복사하기 (서식 포함)";
    copyBodyBtn.onclick = () => copyNtfText(idx);
    block.appendChild(copyBodyBtn);

    const saveHtmlBtn = document.createElement("button");
    saveHtmlBtn.className = "btn secondary-btn full";
    saveHtmlBtn.style.marginTop = "8px";
    saveHtmlBtn.textContent = "💾 HTML 파일로 저장";
    saveHtmlBtn.onclick = () => saveNtfAsHtml(idx);
    block.appendChild(saveHtmlBtn);

    const saveDocBtn = document.createElement("button");
    saveDocBtn.className = "btn secondary-btn full";
    saveDocBtn.style.marginTop = "8px";
    saveDocBtn.textContent = "📄 Word 파일로 저장 (.doc, 서식 동일)";
    saveDocBtn.onclick = () => saveNtfAsDoc(idx);
    block.appendChild(saveDocBtn);

    outputsWrap.appendChild(block);
  });
}

function formatNtfDate() {
  const d = new Date();
  const day = d.getDate();
  let suffix = "th";
  if (day === 1 || day === 21 || day === 31) suffix = "st";
  else if (day === 2 || day === 22) suffix = "nd";
  else if (day === 3 || day === 23) suffix = "rd";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return day + suffix + " " + months[d.getMonth()] + " " + d.getFullYear();
}

function copyNtfTitle(idx) {
  const input = document.getElementById("ntf_title_" + idx);
  const title = input ? input.value : "";
  if (!title.trim()) { alert("제목이 비어있어요."); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(title).then(() => alert("제목 복사 완료 💖")).catch(() => legacyCopy(title));
  } else { legacyCopy(title); }
}

/* 아웃룩/지메일 등 메일 클라이언트의 "다크 모드"가 흰 배경을 남색 등으로 자동으로
   뒤집으면서, 명시적으로 지정한 어두운 글자색(#333 등)은 그대로 둬 버려서
   "어두운 글자 + 어두운 배경"으로 안 보이게 되는 문제를 막기 위한 안전장치.
   메타태그로 다크모드 자체를 요청하고, 혹시 무시되는 클라이언트를 위해
   [data-ogsc](아웃룩 다크모드가 붙이는 표식) 선택자로 강제로 원래 색을 되돌린다. */
function darkModeSafeMeta() {
  return '<meta name="color-scheme" content="light only">'
    + '<meta name="supported-color-schemes" content="light only">';
}
function darkModeSafeCss(bg, fg) {
  return "<style>"
    + "html,body{background:" + bg + " !important;}"
    + "[data-ogsc] body,[data-ogsc]{background:" + bg + " !important;color:" + fg + " !important;}"
    + "</style>";
}

/* saveNtfAsHtml / saveNtfAsDoc이 공유하는 본문 조립 로직. 서식(레터헤드+본문)은 완전히
   동일하고, 마지막에 어떤 확장자·MIME으로 내보내느냐만 다르다. */
function buildNtfDocumentHtml(idx) {
  const info = generatedNtfOutputs[idx];
  if (!info) return null;
  const titleInput = document.getElementById("ntf_title_" + idx);
  const title = (titleInput ? titleInput.value : (info.subject || "")).trim() || "공문";
  const dateEl = document.getElementById("ntf_date_" + idx);
  const dateStr = dateEl ? dateEl.textContent : (info.date || formatNtfDate());
  const previewEl = document.getElementById("ntf_htmlpreview_" + idx);
  const bodyHtml = previewEl ? previewEl.innerHTML : (info.htmlText || "");

  /* 일부 발송 시스템이 <head><style> 규칙을 못 읽거나 이상하게 처리해서(내용 없는 빈 박스로
     남는 등), <style> 태그를 아예 안 쓰고 각 요소에 style 속성을 직접 박아넣는 방식으로 전환. */
  const dateStyle = "text-align:right;color:#555;font-size:11pt;margin-bottom:12px;";
  const toFromStyle = "font-size:11pt;margin-bottom:4px;";
  const titleLineStyle = "font-size:11pt;margin:16px 0 24px;";
  const titleSpanStyle = "color:#00bcd4;font-weight:600;";

  const letterheadHtml = `<div style="${dateStyle}">${escapeHtml(dateStr)}</div>
    <div style="${toFromStyle}">TO&nbsp;&nbsp;&nbsp;&nbsp;: ${escapeHtml(NTF_LETTERHEAD.to)}</div>
    <div style="${toFromStyle}">FROM : ${escapeHtml(NTF_LETTERHEAD.from)}</div>
    <div style="${titleLineStyle}">NOTIFICATION TITLE : <span style="${titleSpanStyle}">${escapeHtml(title)}</span></div>`;

  const bodyStyle = "margin:0 auto;padding:18px 20px;box-sizing:border-box;max-width:620px;"
    + "font-family:'Aptos',Calibri,'Malgun Gothic',sans-serif;font-size:12pt;line-height:1.8;color:#333;background:#ffffff;";

  const htm = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">" + darkModeSafeMeta()
    + "<title>" + escapeHtml(title) + "</title></head><body style=\"" + bodyStyle + "\">"
    + letterheadHtml + bodyHtml + "</body></html>";

  return { htm, title };
}

function saveNtfAsHtml(idx) {
  const built = buildNtfDocumentHtml(idx);
  if (!built) return;
  const { htm, title } = built;

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

/* Word는 확장자가 .doc여도 내용이 HTML이면 그대로 열어서 서식 있는 문서로 인식한다
   (Word의 오래된 "필터링된 HTML" 저장 방식과 동일한 원리). 그래서 지금 만드는 HTML을
   그대로 재사용하고 확장자·MIME 타입만 .doc/msword로 바꿔서 내려주면, 위 HTML 저장
   버튼과 완전히 같은 서식의 워드 문서가 만들어진다. */
function saveNtfAsDoc(idx) {
  const built = buildNtfDocumentHtml(idx);
  if (!built) return;
  const { htm, title } = built;

  const blob = new Blob([htm], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = title.replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, "_") + ".doc";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function appendNtfToRow(block, idx, toResolved, subjectResolved) {
  if (!toResolved && !subjectResolved) return;
  const toRow = document.createElement("div");
  toRow.className = "mail-meta-box";

  const textWrap = document.createElement("div");
  textWrap.className = "mail-meta-text";
  if (toResolved) {
    const toLine = document.createElement("div");
    toLine.className = "mail-meta-line";
    toLine.innerHTML = '<span class="mail-meta-badge">TO</span><span class="mail-meta-value">' + escapeHtml(toResolved) + "</span>";
    textWrap.appendChild(toLine);
  }
  if (subjectResolved) {
    const subjLine = document.createElement("div");
    subjLine.className = "mail-meta-line";
    subjLine.innerHTML = '<span class="mail-meta-badge mail-meta-badge-subject">제목</span><span class="mail-meta-value">' + escapeHtml(subjectResolved) + "</span>";
    textWrap.appendChild(subjLine);
  }
  toRow.appendChild(textWrap);

  const btnWrap = document.createElement("div");
  btnWrap.className = "mail-meta-btns";
  if (toResolved) {
    const toCopyBtn = document.createElement("button");
    toCopyBtn.className = "btn secondary-btn";
    toCopyBtn.style.cssText = "flex-shrink:0;padding:8px 12px;font-size:12px;";
    toCopyBtn.textContent = "TO 복사";
    toCopyBtn.onclick = () => copyNtfToAddress(idx);
    btnWrap.appendChild(toCopyBtn);
  }
  if (subjectResolved) {
    const titleCopyBtn = document.createElement("button");
    titleCopyBtn.className = "btn secondary-btn";
    titleCopyBtn.style.cssText = "flex-shrink:0;padding:8px 12px;font-size:12px;";
    titleCopyBtn.textContent = "📌 제목 복사";
    titleCopyBtn.onclick = () => copyNtfSubjectOnly(idx);
    btnWrap.appendChild(titleCopyBtn);
  }
  if (toResolved) {
    const mailBtn = document.createElement("button");
    mailBtn.className = "btn generate-btn";
    mailBtn.style.cssText = "flex-shrink:0;padding:8px 12px;font-size:12px;";
    mailBtn.textContent = "📧 메일 앱 열기";
    mailBtn.onclick = () => openNtfMailClient(idx);
    btnWrap.appendChild(mailBtn);
  }
  toRow.appendChild(btnWrap);
  block.appendChild(toRow);
}

function copyNtfToAddress(idx) {
  const info = generatedNtfOutputs[idx];
  if (!info || !info.to) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(info.to).then(() => alert("TO 주소 복사 완료 💖")).catch(() => legacyCopy(info.to));
  } else { legacyCopy(info.to); }
}

function copyNtfSubjectOnly(idx) {
  const info = generatedNtfOutputs[idx];
  if (!info || !info.subject) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(info.subject).then(() => alert("제목 복사 완료 💖")).catch(() => legacyCopy(info.subject));
  } else { legacyCopy(info.subject); }
}

function openNtfMailClient(idx) {
  const info = generatedNtfOutputs[idx];
  if (!info || !info.to) return;
  const previewEl = document.getElementById("ntf_htmlpreview_" + idx);
  const body = previewEl ? previewEl.innerText : (info.plainText || "");
  const link = "mailto:" + encodeURIComponent(info.to) + "?subject=" + encodeURIComponent(info.subject || "") + "&body=" + encodeURIComponent(body);
  if (info.hasTable) {
    alert("메일 앱이 열립니다. mailto 링크는 서식(색·테두리)을 담을 수 없어서, 표는 예쁜 모양 없이 텍스트로만 들어가요. 표 모양 그대로 넣고 싶으면 위의 \"복사하기\"로 복사해서 메일 앱에 직접 붙여넣어주세요.");
  }
  if ((info.attachments && info.attachments.length > 0) || info.attachmentLink) {
    alert("메일 앱이 열립니다. 첨부파일/링크는 자동으로 들어가지 않으니, 위에서 다운로드하거나 링크를 열어 받은 파일을 메일 창에 직접 첨부해주세요.");
  }
  window.location.href = link;
}

function switchNtfTab(idx) {
  document.querySelectorAll(".ntf-tab-btn").forEach((el, i) => el.classList.toggle("active", i === idx));
  document.querySelectorAll(".ntf-output-block").forEach((el) => el.classList.toggle("active", el.id === "ntf_output_" + idx));
}

function copyNtfText(idx) {
  const info = generatedNtfOutputs[idx];
  if (!info) return;
  const previewEl = document.getElementById("ntf_htmlpreview_" + idx);
  const html = previewEl ? previewEl.innerHTML : info.htmlText;
  const plain = previewEl ? previewEl.innerText : info.plainText;
  if (copyHtmlViaSelection(html)) {
    alert("복사 완료 💖 (아웃룩/지메일에 붙여넣으면 볼드·정렬 서식 그대로 들어갑니다)");
  } else if (navigator.clipboard && window.ClipboardItem) {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plain], { type: "text/plain" })
    });
    navigator.clipboard.write([item]).then(() => alert("복사 완료 💖 (아웃룩/지메일에 붙여넣으면 볼드·정렬 서식 그대로 들어갑니다)")).catch(() => legacyCopy(plain));
  } else { legacyCopy(plain); }
}


function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

