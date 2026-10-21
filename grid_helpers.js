/* =========================================================================
   grid_helpers.js - "표에서 바로 고치는(엑셀 같은)" 화면들이 같이 쓰는 도우미
   (삼국간 탭, 노션 입항 스케줄 raw 표에서 써요)

   1) 날짜/시간을 사람이 편하게 쓴 대로 읽기
        날짜  : 10/22, 1022, 10.22, 10월 22일, 2026-10-22  → 2026-10-22
        시간  : 16:00, 1600, 오후4시, 오후 4:00, 4pm       → 16:00
        한 칸 : 10/22 오후 4:00, 1022 1600                  → 날짜 + 시간
   2) 실시간 갱신으로 표가 다시 그려져도 "지금 커서가 있던 칸"으로 돌아오게 하기
   ========================================================================= */

function gridPad2(n) { return String(n).padStart(2, "0"); }

function gridValidYMD(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/* 연도를 안 쓰고 "10/22"만 쓴 경우 - 오늘과 가장 가까운 해로 정해요 (12월에 "1/5"를 쓰면 내년 1월로) */
function gridPickYear(m, d) {
  const now = new Date();
  const base = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  let best = null, bestDiff = Infinity;
  [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].forEach((y) => {
    if (!gridValidYMD(y, m, d)) return;
    const diff = Math.abs(Date.UTC(y, m - 1, d) - base);
    if (diff < bestDiff) { bestDiff = diff; best = y; }
  });
  return best;
}

/* 반환: "YYYY-MM-DD" | "" (빈 칸) | null (읽을 수 없음) */
function gridParseDate(txt) {
  const s = String(txt == null ? "" : txt).replace(/\([^)]*\)/g, "").trim();
  if (!s) return "";
  let m, y, mo, d;
  if ((m = s.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})$/))) { mo = +m[1]; d = +m[2]; y = gridPickYear(mo, d); }
  else if ((m = s.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/))) { mo = +m[1]; d = +m[2]; y = gridPickYear(mo, d); }
  else if ((m = s.match(/^(\d{3,4})$/))) { const t = m[1]; mo = +t.slice(0, t.length - 2); d = +t.slice(-2); y = gridPickYear(mo, d); }
  else return null;
  if (!y || !gridValidYMD(y, mo, d)) return null;
  return y + "-" + gridPad2(mo) + "-" + gridPad2(d);
}

/* "2026-10-22" → "10/22(목)" (올해가 아니면 연도도 같이) */
function gridFmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  const thisYear = new Date().getFullYear();
  return (+m[1] === thisYear ? (+m[2] + "/" + (+m[3])) : (m[1] + "-" + m[2] + "-" + m[3])) + "(" + wd + ")";
}

/* 반환: "HH:MM"(24시간) | "" (빈 칸) | null (읽을 수 없음) */
function gridParseTime(txt) {
  let s = String(txt == null ? "" : txt).trim().toLowerCase();
  if (!s) return "";
  const ap = /오후|pm/.test(s) ? "p" : (/오전|am/.test(s) ? "a" : "");
  s = s.replace(/오전|오후|am|pm/g, "").replace(/\s+/g, "").replace(/시/, ":").replace(/분/, "");
  if (/:$/.test(s)) s += "00";
  let h, mi, m;
  if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) { h = +m[1]; mi = +m[2]; }
  else if ((m = s.match(/^(\d{1,2})$/))) { h = +m[1]; mi = 0; }
  else if ((m = s.match(/^(\d{3,4})$/))) { h = +m[1].slice(0, m[1].length - 2); mi = +m[1].slice(-2); }
  else return null;
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return gridPad2(h) + ":" + gridPad2(mi);
}

/* "16:00" → "오후 4:00" (예전 데이터와 같은 표기) */
function gridTimeToKorean(t24) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t24 || "");
  if (!m) return t24 || "";
  const h = +m[1];
  return (h < 12 ? "오전 " : "오후 ") + (h % 12 === 0 ? 12 : h % 12) + ":" + m[2];
}

/* 한 칸에 "10/22 오후 4:00"처럼 날짜+시간을 같이 쓴 것 읽기. 반환: { d, t(24시간) } | null */
function gridParseDateTime(txt) {
  const s = String(txt == null ? "" : txt).replace(/\([^)]*\)/g, "").trim();
  if (!s) return { d: "", t: "" };
  const m = s.match(/^(\d{4}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일?|\d{1,2}\s*[\/.\-]\s*\d{1,2}|\d{3,4})(?:\s+(.*))?$/);
  if (!m) return null;
  const d = gridParseDate(m[1]);
  if (d === null || d === "") return null;
  const t = gridParseTime(m[2] || "");
  if (t === null) return null;
  return { d, t };
}

function gridMinusDays(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "";
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - n));
  return dt.getUTCFullYear() + "-" + gridPad2(dt.getUTCMonth() + 1) + "-" + gridPad2(dt.getUTCDate());
}

/* "ASIA  test 36s" → "ASIA TEST 36S" (대문자·띄어쓰기 통일) / 띄어쓰기까지 없앤 비교용 */
function gridNormText(s) { return String(s || "").trim().replace(/\s+/g, " ").toUpperCase(); }
function gridCompact(s) { return String(s || "").replace(/\s+/g, "").toUpperCase(); }

/* 배 이름 규칙: "선명 + 띄어쓰기 + 항차(숫자)+방향" 예) RM1 11W, ZIM ARIES 12E */
var GRID_VESSEL_FORMAT = /\s\d+[A-Z]*$/;

/* =========================================================================
   실시간 갱신으로 표가 통째로 다시 그려질 때, 커서가 있던 칸을 기억했다가 되돌려줘요
   (칸마다 data-* 속성이 있으면 그걸로 같은 칸을 찾아요)
   ========================================================================= */
function gridCaptureFocus(root) {
  const ae = document.activeElement;
  if (!root || !ae || ae === document.body || !root.contains(ae) || !ae.dataset) return null;
  const keys = Object.keys(ae.dataset).filter((k) => k !== "orig" && k !== "dirty");
  if (!keys.length) return null;
  let sel = ae.tagName.toLowerCase();
  keys.forEach((k) => {
    const attr = "data-" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    sel += "[" + attr + '="' + String(ae.dataset[k]).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
  });
  let s = null, e = null;
  try { if (typeof ae.selectionStart === "number") { s = ae.selectionStart; e = ae.selectionEnd; } } catch (err) { /* 체크박스 등 */ }
  return { sel, s, e };
}

function gridRestoreFocus(root, token) {
  if (!root || !token) return;
  let el = null;
  try { el = root.querySelector(token.sel); } catch (err) { return; }
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
  try { if (token.s != null && el.setSelectionRange) el.setSelectionRange(token.s, token.e); } catch (err) { /* 무시 */ }
}
