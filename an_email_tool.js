/* =========================================================================
   📮 AN 주소 채우기 (NOTIFY 코드 ↔ AN EMAIL 매핑, 라인별)
   - "📧 AN 연락처" 탭(contacts_script.js, 영문/한글 상호 기준 거래처 연락처)과는
     완전히 다른 도구예요. 헷갈리지 않게 이름/아이콘을 다르게 뒀어요.
   - bl_list_tool.js(수입 마감용 비엘리스트 만들기)와도 별개의 도구예요.
   - 매핑표는 구글시트에 저장돼서 팀 전체가 공유해요 (contacts_script.js의
     AN 연락처 탭과 같은 방식 - 탭 열 때 전체를 받아와서 메모리에 캐시).
   - KCI / ZAX / ZCP / ZNS / ZSL / ZNP 라인 지원. 드롭다운에서 라인 고르면
     그 라인은 그 라인대로 구글시트 안에서 별도로 관리돼요 (한 시트, line 컬럼으로 구분).
   ========================================================================= */

// 🔥 Firebase로 이전 완료 (이 값은 이제 "AN 이메일 매핑 실시간 공유 켜짐" 표시 용도로만 쓰임)
const AN_EMAIL_SHEET_API_URL = true;
const AN_EMAIL_COLLECTION = "an_email_map";

/* 라인+코드 조합으로 항상 같은 문서 ID를 만들어서, "이미 있으면 덮어쓰기 없으면 새로 추가"가
   자동으로 되게 함 (구글시트 때 buildRowIndex_로 하던 걸 Firestore 문서 ID로 대신함) */
function anEmailDocId(line, code) {
  const safeLine = String(line || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "_") || "LINE";
  const safeCode = String(code || "").trim().replace(/[\/\\\s#]/g, "_") || "CODE";
  return safeLine + "__" + safeCode;
}

const AN_EMAIL_DEFAULT_LINE = "KCI";
const AN_EMAIL_KNOWN_LINES = ["KCI", "ZAX", "ZCP", "ZNS", "ZSL", "ZNP"];

function freshAnEmailState() {
  return {
    line: AN_EMAIL_DEFAULT_LINE,
    map: {},           // { code: { email, date:[m,d], source } } - 서버에서 받아온 캐시
    mapLoaded: false,
    mapLoading: false,
    mapLoadError: null,
    lastMaxUpdatedAt: null, // 이번에 받아온 데이터 중 제일 최근 updatedAt (새소식 판단용)

    refBusy: false,
    refLastResult: null, // { updatedCount, addedCount, fileCount, failedFiles }

    targetFileName: null,
    targetWb: null,       // 원본 워크북(그대로 보존, 다운로드 때 재사용)
    targetSheetName: null,
    targetAoa: null,
    targetParsed: null,   // { headerRowIdx, notifyCol, emailCol }
    result: null          // { rows: [{code,email,matched}], matchedCount, unmatchedList }
  };
}
let anEmailState = freshAnEmailState();

function resetAnEmailState() {
  anEmailState = freshAnEmailState();
  // excelTool 안에서 다른 서브탭(LT LIST 등)으로 갈 때도 이 함수가 불려서 매번 새로 받아오는데,
  // "확인함" 처리는 실제로 이 탭(an_email)을 열었을 때만 함
  loadAnEmailMapFromServer(typeof excelMode !== "undefined" && excelMode === "an_email");
}

/* ---------- 서버(구글시트) 통신 ---------- */

function loadAnEmailMapFromServer(markSeen) {
  anEmailState.mapLoading = true;
  anEmailState.mapLoadError = null;
  renderExcelTool();

  (async () => {
    try {
      await window.fbReady;
      const snapshot = await window.fbDb.collection(AN_EMAIL_COLLECTION)
        .where("line", "==", anEmailState.line).get();
      const map = {};
      let maxUpdatedAt = null;
      snapshot.forEach((doc) => {
        const row = doc.data();
        map[row.code] = { email: row.email, date: [row.month, row.day], source: row.source };
        const updatedAtIso = row.updatedAt && row.updatedAt.toDate ? row.updatedAt.toDate().toISOString() : null;
        if (updatedAtIso && (!maxUpdatedAt || new Date(updatedAtIso) > new Date(maxUpdatedAt))) {
          maxUpdatedAt = updatedAtIso;
        }
      });
      anEmailState.map = map;
      anEmailState.lastMaxUpdatedAt = maxUpdatedAt;
      anEmailState.mapLoading = false;
      anEmailState.mapLoaded = true;
      if (anEmailState.targetParsed) anEmailState.result = computeAnEmailFillResult();
      if (markSeen) {
        markAnEmailSeenTimestamp(anEmailState.line, maxUpdatedAt);
      } else {
        checkAnEmailUpdatesForNotice(anEmailState.line, maxUpdatedAt);
      }
      renderExcelTool();
    } catch (err) {
      anEmailState.mapLoadError = String(err);
      anEmailState.mapLoading = false;
      anEmailState.mapLoaded = true;
      renderExcelTool();
    }
  })();
}

/* ===== 🔔 새 소식 알림 - 다른 팀원이 매핑을 새로 추가/갱신했으면 화면에 배너로 알려줌 =====
   구글시트에 저장할 때마다 updatedAt을 기록해두기 때문에(an_email_apps_script.gs 참고),
   "가장 최근 updatedAt이 내가 마지막으로 확인했던 시점보다 늦어졌는지"로 정확히 판단해요.
   (건수만 보는 게 아니라서, 기존 코드의 이메일 주소만 바뀐 경우도 잡아냄) */
function anEmailSeenKey(line) {
  return "an_email_seen_ts_v1_" + String(line || "").toUpperCase();
}

function checkAnEmailUpdatesForNotice(line, maxUpdatedAt) {
  if (!maxUpdatedAt) return;
  const seenRaw = localStorage.getItem(anEmailSeenKey(line));
  if (seenRaw === null) {
    // 처음 확인하는 거면 알림 없이 기준점만 저장
    localStorage.setItem(anEmailSeenKey(line), maxUpdatedAt);
    return;
  }
  if (new Date(maxUpdatedAt) > new Date(seenRaw) && typeof pushSharedUpdateNotice === "function") {
    pushSharedUpdateNotice(
      "an_email_" + line,
      `🔔 AN 주소채우기(${escapeHtml(line)}) 매핑이 갱신됐어요 - 눌러서 확인`,
      () => {
        if (typeof switchMainTab === "function") switchMainTab("excelTool");
        if (typeof switchExcelMode === "function") switchExcelMode("an_email");
      }
    );
  }
}

/* an_email 탭에 실제로 들어왔을 때 호출 - "확인함"으로 기준점 갱신 */
function markAnEmailSeenTimestamp(line, maxUpdatedAt) {
  if (maxUpdatedAt) localStorage.setItem(anEmailSeenKey(line), maxUpdatedAt);
  if (typeof dismissSharedUpdateNotice === "function") dismissSharedUpdateNotice("an_email_" + line);
}

/* 페이지 로드 시 백그라운드로 한 번 조용히 확인 (탭을 안 열어봐도 새소식 배너가 뜨게) */
async function checkAnEmailUpdatesInBackground() {
  try {
    await window.fbReady;
    for (const line of AN_EMAIL_KNOWN_LINES) {
      try {
        const snapshot = await window.fbDb.collection(AN_EMAIL_COLLECTION).where("line", "==", line).get();
        let maxUpdatedAt = null;
        snapshot.forEach((doc) => {
          const row = doc.data();
          const updatedAtIso = row.updatedAt && row.updatedAt.toDate ? row.updatedAt.toDate().toISOString() : null;
          if (updatedAtIso && (!maxUpdatedAt || new Date(updatedAtIso) > new Date(maxUpdatedAt))) {
            maxUpdatedAt = updatedAtIso;
          }
        });
        checkAnEmailUpdatesForNotice(line, maxUpdatedAt);
      } catch (e) { /* 조용히 실패 (백그라운드 체크라 사용자에게 에러 안 띄움) */ }
    }
  } catch (e) { /* fbReady 실패 시에도 조용히 무시 */ }
}
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(checkAnEmailUpdatesInBackground, 1500);
});

/* Firestore에 여러 건을 한 번에 저장 (문서 ID가 line+code로 고정돼있어서, 있으면 덮어쓰고 없으면 새로 생김) */
async function upsertAnEmailBatch(items) {
  try {
    await window.fbReady;
    let batch = window.fbDb.batch();
    let count = 0;
    for (const item of items) {
      const docRef = window.fbDb.collection(AN_EMAIL_COLLECTION).doc(anEmailDocId(anEmailState.line, item.code));
      batch.set(docRef, {
        line: anEmailState.line,
        code: item.code,
        email: item.email,
        month: item.month,
        day: item.day,
        source: item.source,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = window.fbDb.batch();
      }
    }
    await batch.commit();
    return { ok: true, added: count, updated: 0 };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function clearAnEmailMap() {
  const count = Object.keys(anEmailState.map).length;
  if (!confirm(`"${anEmailState.line}" 라인 매핑표(${count}건)를 전부 지울까요? 팀 전체에 반영되고, 되돌릴 수 없어요.`)) return;

  (async () => {
    try {
      await window.fbReady;
      const snapshot = await window.fbDb.collection(AN_EMAIL_COLLECTION).where("line", "==", anEmailState.line).get();
      let batch = window.fbDb.batch();
      let n = 0;
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        n++;
        if (n % 400 === 0) {
          await batch.commit();
          batch = window.fbDb.batch();
        }
      }
      await batch.commit();
      loadAnEmailMapFromServer(true);
    } catch (err) {
      alert("삭제 실패: " + err);
    }
  })();
}

function handleAnEmailLineSelectChange(value) {
  if (value === "__custom__") {
    const input = prompt("라인명을 입력하세요 (예: ZDV)", "");
    if (input && input.trim()) {
      changeAnEmailLine(input.trim());
    } else {
      renderExcelTool(); // 취소하면 드롭다운을 원래 값으로 되돌리기 위해 다시 그림
    }
    return;
  }
  changeAnEmailLine(value);
}

function changeAnEmailLine(newLine) {
  const line = String(newLine || "").trim().toUpperCase() || AN_EMAIL_DEFAULT_LINE;
  anEmailState.line = line;
  anEmailState.map = {};
  anEmailState.mapLoaded = false;
  anEmailState.refLastResult = null;
  anEmailState.targetFileName = null;
  anEmailState.targetWb = null;
  anEmailState.targetAoa = null;
  anEmailState.targetParsed = null;
  anEmailState.result = null;
  loadAnEmailMapFromServer(true);
}

/* ---------- 파일에서 날짜/헤더/컬럼 위치 찾기 (공통 파서) ---------- */

const AN_EMAIL_DATE_RE = /\)\s*(\d{1,2})\/(\d{1,2})\s*-/;

function parseAnEmailTitleDate(title) {
  const m = AN_EMAIL_DATE_RE.exec(String(title || ""));
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/* 날짜 비교: a가 b보다 최신이면 true (연도 정보가 없어서 월/일만 비교 - 같은 해 안에서만 정확) */
function isAnEmailDateNewer(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a[0] !== b[0]) return a[0] > b[0];
  return a[1] > b[1];
}

/* 첫 5행 안에서 "NOTIFY" 헤더가 있는 행을 찾고, NOTIFY / (AN EMAIL 또는 Address) 컬럼 위치를 찾음 */
function findAnEmailHeaderInfo(aoa) {
  for (let r = 0; r < Math.min(5, aoa.length); r++) {
    const row = aoa[r] || [];
    let notifyCol = -1, emailCol = -1;
    row.forEach((v, c) => {
      const t = String(v || "").trim();
      if (t === "NOTIFY") notifyCol = c;
      if (t === "AN EMAIL" || t === "Address") emailCol = c;
    });
    if (notifyCol !== -1 && emailCol !== -1) {
      return { headerRowIdx: r, notifyCol, emailCol };
    }
  }
  return null;
}

/* ---------- ① 참고 파일로 매핑 갱신 ---------- */

function handleAnEmailRefFiles(event) {
  const files = Array.from(event.target.files || []);
  if (files.length) processAnEmailRefFiles(files);
  event.target.value = "";
}

function processAnEmailRefFiles(files) {
  if (!AN_EMAIL_SHEET_API_URL) { alert("AN_EMAIL_SHEET_API_URL이 아직 설정되지 않았어요."); return; }
  if (anEmailState.refBusy) {
    alert("아직 이전 파일들을 처리하고 있어요. 완료될 때까지 잠시만 기다렸다가 다시 올려주세요.");
    return;
  }

  anEmailState.refBusy = true;
  anEmailState.refLastResult = null;
  renderExcelTool();

  const readers = files.map((file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
        resolve({ fileName: file.name, aoa, error: null });
      } catch (err) {
        resolve({ fileName: file.name, aoa: null, error: err.message });
      }
    };
    reader.onerror = () => resolve({ fileName: file.name, aoa: null, error: "파일을 읽을 수 없어요" });
    reader.readAsArrayBuffer(file);
  }));

  // 다른 팀원이 방금 갱신했을 수도 있으니, 병합하기 직전에 최신 매핑을 한 번 다시 받아옴
  const freshMapPromise = (async () => {
    try {
      await window.fbReady;
      const snapshot = await window.fbDb.collection(AN_EMAIL_COLLECTION)
        .where("line", "==", anEmailState.line).get();
      const map = {};
      snapshot.forEach((doc) => {
        const row = doc.data();
        map[row.code] = { email: row.email, date: [row.month, row.day], source: row.source };
      });
      return map;
    } catch (e) {
      return anEmailState.map;
    }
  })();

  Promise.all([Promise.all(readers), freshMapPromise]).then(([parsedFiles, baseMap]) => {
    const map = Object.assign({}, baseMap);
    const changedItems = [];
    let addedCount = 0, updatedCount = 0, failedFiles = [];

    parsedFiles.forEach(({ fileName, aoa, error }) => {
      if (error || !aoa || !aoa.length) {
        failedFiles.push(fileName + (error ? " (" + error + ")" : ""));
        return;
      }
      const title = aoa[0] && aoa[0][0];
      const dateKey = parseAnEmailTitleDate(title);
      if (!dateKey) {
        failedFiles.push(fileName + " (제목에서 날짜(MM/DD)를 못 찾았어요)");
        return;
      }
      const headerInfo = findAnEmailHeaderInfo(aoa);
      if (!headerInfo) {
        failedFiles.push(fileName + " (NOTIFY / AN EMAIL 헤더를 못 찾았어요)");
        return;
      }
      const { headerRowIdx, notifyCol, emailCol } = headerInfo;
      for (let r = headerRowIdx + 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!row) continue;
        const codeRaw = row[notifyCol];
        const emailRaw = row[emailCol];
        if (codeRaw === null || codeRaw === undefined || String(codeRaw).trim() === "") continue;
        if (emailRaw === null || emailRaw === undefined || String(emailRaw).trim() === "") continue;
        const code = String(codeRaw).trim();
        const email = String(emailRaw).trim();
        const existing = map[code];
        if (!existing) {
          map[code] = { email, date: dateKey, source: fileName };
          changedItems.push({ code, email, month: dateKey[0], day: dateKey[1], source: fileName });
          addedCount++;
        } else if (isAnEmailDateNewer(dateKey, existing.date)) {
          if (existing.email.toLowerCase() !== email.toLowerCase()) updatedCount++;
          map[code] = { email, date: dateKey, source: fileName };
          changedItems.push({ code, email, month: dateKey[0], day: dateKey[1], source: fileName });
        }
      }
    });

    const finish = () => {
      anEmailState.map = map;
      anEmailState.refBusy = false;
      anEmailState.refLastResult = {
        fileCount: parsedFiles.length - failedFiles.length,
        addedCount, updatedCount, failedFiles
      };
      if (anEmailState.targetParsed) anEmailState.result = computeAnEmailFillResult();
      renderExcelTool();
    };

    if (!changedItems.length) { finish(); return; }

    upsertAnEmailBatch(changedItems)
      .then((data) => {
        if (!data.ok) failedFiles.push("(서버 저장 실패: " + data.error + ")");
        finish();
      })
      .catch((err) => {
        failedFiles.push("(서버 저장 실패: " + err + ")");
        finish();
      });
  });
}

/* ---------- ② 새 비엘리스트에 AN EMAIL 채우기 ---------- */

function handleAnEmailTargetFile(event) {
  const file = event.target.files[0];
  if (file) processAnEmailTargetFile(file);
}

function processAnEmailTargetFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

      const headerInfo = findAnEmailHeaderInfo(aoa);
      if (!headerInfo) {
        alert("이 파일에서 NOTIFY / AN EMAIL(또는 Address) 헤더를 못 찾았어요. 파일 형식을 확인해주세요.");
        return;
      }

      anEmailState.targetFileName = file.name;
      anEmailState.targetWb = wb;
      anEmailState.targetSheetName = sheetName;
      anEmailState.targetAoa = aoa;
      anEmailState.targetParsed = headerInfo;
      anEmailState.result = computeAnEmailFillResult();
      renderExcelTool();
    } catch (err) {
      alert("비엘리스트 파일을 읽는 중 문제가 생겼어요.\n(" + err.message + ")");
    }
  };
  reader.readAsArrayBuffer(file);
}

function clearAnEmailTargetFile() {
  anEmailState.targetFileName = null;
  anEmailState.targetWb = null;
  anEmailState.targetAoa = null;
  anEmailState.targetParsed = null;
  anEmailState.result = null;
  renderExcelTool();
}

function computeAnEmailFillResult() {
  const { headerRowIdx, notifyCol, emailCol } = anEmailState.targetParsed;
  const aoa = anEmailState.targetAoa;
  const map = anEmailState.map;

  const rows = [];
  let matchedCount = 0;
  const unmatchedList = [];

  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const codeRaw = row[notifyCol];
    if (codeRaw === null || codeRaw === undefined || String(codeRaw).trim() === "") continue;
    const code = String(codeRaw).trim();
    const mapped = map[code];
    if (mapped) {
      matchedCount++;
      rows.push({ rowIdx: r, code, email: mapped.email, matched: true });
    } else {
      const existingEmail = row[emailCol];
      unmatchedList.push({ rowIdx: r, code, existingEmail: existingEmail || "" });
      rows.push({ rowIdx: r, code, email: existingEmail || "", matched: false });
    }
  }

  return { rows, matchedCount, unmatchedList };
}

/* 매핑된 이메일을 원본 워크북에 실제로 채워넣고 다운로드 (서식은 원본 그대로, 값만 채움) */
function downloadAnEmailFilledFile() {
  const { targetWb, targetSheetName, targetParsed, result, targetFileName } = anEmailState;
  if (!targetWb || !result) return;

  const ws = targetWb.Sheets[targetSheetName];
  const emailCol = targetParsed.emailCol;

  result.rows.forEach(({ rowIdx, email, matched }) => {
    if (!matched) return;
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c: emailCol });
    ws[addr] = { t: "s", v: email };
  });

  const range = XLSX.utils.decode_range(ws["!ref"]);
  if (emailCol > range.e.c) {
    range.e.c = emailCol;
    ws["!ref"] = XLSX.utils.encode_range(range);
  }

  const outName = (targetFileName || "비엘리스트").replace(/\.xlsx?$/i, "") + "_AN이메일채움.xlsx";
  XLSX.writeFile(targetWb, outName);
}

/* ---------- 화면 렌더링 ---------- */

function buildAnEmailHtml() {
  if (!AN_EMAIL_SHEET_API_URL) {
    return `<div class="excel-warning-box">
      <div class="excel-warning-title">⚙️ 아직 설정 전이에요</div>
      an_email_tool.js 맨 위 AN_EMAIL_SHEET_API_URL에 구글시트 Apps Script 배포 주소를 넣어야 이 기능을 쓸 수 있어요.
    </div>`;
  }

  if (!anEmailState.mapLoaded) {
    return `<div class="excel-question-box">⏳ "${escapeHtml(anEmailState.line)}" 라인 매핑표 불러오는 중...</div>`;
  }

  const mapCount = Object.keys(anEmailState.map).length;

  let html = `<div class="hint" style="margin-bottom:14px;">
    NOTIFY 코드 ↔ AN EMAIL 매핑표를 라인별로 구글시트에 저장해서 팀 전체가 공유해요. 새 비엘리스트를 올리면 AN EMAIL 칸을 자동으로 채워줘요.
    <b>KCI / ZAX / ZCP / ZNS / ZSL / ZNP 라인</b>을 지원해요. 위 드롭다운에서 골라 쓰세요.
  </div>`;

  if (anEmailState.mapLoadError) {
    html += `<div class="excel-warning-box" style="margin-bottom:14px;"><div class="excel-warning-title">⚠️ 불러오기 오류</div>${escapeHtml(anEmailState.mapLoadError)}</div>`;
  }

  const lineOptions = AN_EMAIL_KNOWN_LINES.map((l) =>
    `<option value="${l}" ${l === anEmailState.line ? "selected" : ""}>${l}</option>`
  ).join("");
  const isCustomLine = AN_EMAIL_KNOWN_LINES.indexOf(anEmailState.line) === -1;
  const customOption = isCustomLine
    ? `<option value="${escapeHtml(anEmailState.line)}" selected>${escapeHtml(anEmailState.line)} (직접입력)</option>`
    : "";

  html += `<div style="display:flex; align-items:center; gap:10px; margin-bottom:18px; flex-wrap:wrap;">
    <div style="font-size:13px;font-weight:bold;color:#4b5563;">라인</div>
    <select id="anEmailLineSelect" style="padding:6px 10px; border:1px solid #e5e7eb; border-radius:8px; font-weight:bold;" onchange="handleAnEmailLineSelectChange(this.value)">
      ${lineOptions}${customOption}
      <option value="__custom__">✏️ 직접 입력...</option>
    </select>
    <div class="excel-result-stat">현재 매핑 코드 수 <b>${mapCount.toLocaleString()}</b>건</div>
    <button class="btn" style="padding:6px 12px;font-size:12px;" onclick="loadAnEmailMapFromServer(true)" title="다른 팀원이 방금 추가한 내용까지 새로 불러와요">🔄 새로고침</button>
    ${mapCount ? `<button class="btn" style="padding:6px 12px;font-size:12px;" onclick="clearAnEmailMap()">🗑️ 이 라인 매핑 초기화</button>` : ""}
  </div>`;

  html += `<div class="section-title">① 참고 파일로 매핑 갱신</div>
  <div class="hint" style="margin-bottom:8px;">NOTIFY·AN EMAIL 컬럼이 있는 예전 비엘리스트 파일들을 올리면, 제목에 있는 날짜(예: 08/18)를 기준으로 제일 최신 값으로 정리해서 매핑표에 반영해요 (팀 전체에 바로 공유돼요). 파일 선택 창에서 여러 개를 한 번에 골라서 올리는 걸 추천해요 (Ctrl 또는 Shift로 여러 개 선택). 따로따로 올리실 거면, 이전 파일 처리(⏳ 표시)가 끝난 다음에 올려주세요.</div>
  <label class="excel-upload-box" id="anEmailRefUploadBox" style="padding:22px 14px;">
    <input type="file" id="anEmailRefFileInput" accept=".xlsx,.xls" multiple onchange="handleAnEmailRefFiles(event)">
    <div class="excel-upload-icon">📄</div>
    <div class="excel-upload-label">참고 비엘리스트 파일 올리기 (여러 개 선택 가능)</div>
    <div class="excel-upload-sub">NOTIFY · AN EMAIL(또는 Address) 컬럼이 있는 파일</div>
  </label>`;

  if (anEmailState.refBusy) {
    html += `<div class="excel-question-box" style="margin-top:12px;">⏳ 파일 분석 + 저장 중이에요...</div>`;
  } else if (anEmailState.refLastResult) {
    const r = anEmailState.refLastResult;
    html += `<div class="excel-question-box" style="margin-top:12px;">✅ ${r.fileCount}개 파일 반영 완료 (팀 전체 공유됨) — 새로 추가 <b>${r.addedCount}</b>건, 주소 변경(최신값 반영) <b>${r.updatedCount}</b>건</div>`;
    if (r.failedFiles.length) {
      html += `<div class="excel-warning-box" style="margin-top:8px;">
        <div class="excel-warning-title">⚠️ 처리 못한 파일 ${r.failedFiles.length}건</div>
        <ul style="margin:8px 0 0 18px;">${r.failedFiles.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
      </div>`;
    }
  }

  html += `<div class="section-title" style="margin-top:24px;">② 새 비엘리스트에 AN EMAIL 채우기</div>
  <div class="hint" style="margin-bottom:8px;">AN EMAIL 칸이 비어있는(또는 확인이 필요한) 비엘리스트를 올리면, 위 매핑표 기준으로 자동으로 채운 파일을 만들어줘요.</div>
  <label class="excel-upload-box" id="anEmailTargetUploadBox" style="padding:22px 14px;">
    <input type="file" id="anEmailTargetFileInput" accept=".xlsx,.xls" onchange="handleAnEmailTargetFile(event)">
    <div class="excel-upload-icon">📄</div>
    <div class="excel-upload-label">AN EMAIL 채울 비엘리스트 올리기</div>
    <div class="excel-upload-sub">NOTIFY 컬럼이 있는 파일</div>
  </label>
  ${anEmailState.targetFileName ? `<div class="excel-file-chip">📎 ${escapeHtml(anEmailState.targetFileName)} <button onclick="clearAnEmailTargetFile()">✕</button></div>` : ""}`;

  const result = anEmailState.result;
  if (result) {
    html += `<div class="excel-result-summary" style="margin-top:12px;">
      <div class="excel-result-stat">전체 <b>${result.rows.length}</b>건</div>
      <div class="excel-result-stat">매핑으로 채움 <b>${result.matchedCount}</b>건</div>
      <div class="excel-result-stat">매핑 없음 <b>${result.unmatchedList.length}</b>건</div>
    </div>`;

    if (result.unmatchedList.length) {
      html += `<div class="excel-warning-box" style="margin-top:10px;">
        <div class="excel-warning-title">⚠️ 이메일 매핑 안 된 NOTIFY 코드 ${result.unmatchedList.length}건</div>
        아래 코드는 "${escapeHtml(anEmailState.line)}" 라인 매핑표에 없어서 원본 값 그대로 남겨뒀어요. 확인 후 필요하면 ①에서 참고 파일을 추가로 올려서 매핑을 갱신해주세요.
        <div class="excel-result-table-wrap" style="margin-top:10px;">
          <table class="excel-result-table"><thead><tr><th>NOTIFY 코드</th><th>원본 AN EMAIL 값</th></tr></thead>
          <tbody>${result.unmatchedList.map((u) => `<tr><td>${escapeHtml(u.code)}</td><td>${escapeHtml(String(u.existingEmail || "(공란)"))}</td></tr>`).join("")}</tbody></table>
        </div>
      </div>`;
    }

    html += `<button class="btn generate-btn full" style="margin-top:16px;" onclick="downloadAnEmailFilledFile()">⬇ AN EMAIL 채운 파일 다운로드</button>`;
  }

  return html;
}

function attachAnEmailHandlers() {
  [["anEmailRefUploadBox", (files) => processAnEmailRefFiles(Array.from(files))],
   ["anEmailTargetUploadBox", (files) => { if (files[0]) processAnEmailTargetFile(files[0]); }]
  ].forEach(([id, handler]) => {
    const box = document.getElementById(id);
    if (!box) return;
    box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("dragover"); });
    box.addEventListener("dragleave", () => box.classList.remove("dragover"));
    box.addEventListener("drop", (e) => {
      e.preventDefault();
      box.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length) handler(e.dataTransfer.files);
    });
  });
}
