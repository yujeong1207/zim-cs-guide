/* ===== guide_finalize.js : original lines 27106-27231 ===== */
/* =========================================================================
   초기화
   ========================================================================= */

function populateOblNameSelect() {
  const sel = document.getElementById("oblInlineName");
  if (!sel) return;
  OBL_TEAM_MEMBERS.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

/* =========================================================================
   💰 입금현황 - 비엘번호 발행가능 여부 조회
   ========================================================================= */

/* ⚠️ 연동 주소/비밀키는 Firestore의 secrets/paymentFlow 문서에 저장돼있어요
   (팀장님이 Firebase 콘솔에서 딱 한 번만 넣어두면 돼요). 팀원들은 아무 입력
   없이, 페이지 열면 조용히 자동으로 가져다 써요 - 코드에는 값이 안 남아요. */
let paymentFlowCredsCache = null;

async function getPaymentFlowCreds() {
  if (paymentFlowCredsCache) return paymentFlowCredsCache;
  try {
    await window.fbReady;
    const doc = await window.fbDb.collection("secrets").doc("paymentFlow").get();
    if (!doc.exists) return null;
    const d = doc.data();
    if (!d.url || !d.secret) return null;
    paymentFlowCredsCache = { url: d.url, secret: d.secret };
    return paymentFlowCredsCache;
  } catch (err) {
    console.error("입금현황 연동 정보 불러오기 실패:", err);
    return null;
  }
}

let paymentDataCache = null;       // { "비엘번호": {amount, paid, issued} }
let paymentDataUpdatedAt = null;

async function refreshPaymentData() {
  const statusEl = document.getElementById("paymentRefreshStatus");

  const creds = await getPaymentFlowCreds();
  if (!creds) {
    if (statusEl) statusEl.textContent = "⚠️ 연동 정보가 아직 설정 안 됐어요. 팀장님께 문의해주세요.";
    return;
  }

  if (statusEl) statusEl.textContent = "⏳ 재무팀 파일에서 최신 데이터 가져오는 중...";

  try {
    const res = await fetch(creds.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: creds.secret }),
    });
    if (!res.ok) throw new Error("서버 응답 오류 (" + res.status + ")");

    const raw = await res.json();
    // raw는 Office Script가 이미 3개 컬럼만 골라서 반환한 결과예요.
    // 순서: [BL NO, BL발행, 입금처리유무]
    //          0       1          2
    const rows = Array.isArray(raw) ? raw.slice(1) : []; // 첫 행(헤더) 제외

    paymentDataCache = {};
    rows.forEach((r) => {
      const blNo = String(r[0] || "").trim().toUpperCase();
      if (!blNo) return;
      paymentDataCache[blNo] = {
        issued: String(r[1] || "").trim(),
        paid: String(r[2] || "").trim(),
      };
    });

    paymentDataUpdatedAt = new Date();
    try {
      localStorage.setItem("payment_data_cache", JSON.stringify(paymentDataCache));
      localStorage.setItem("payment_data_updated_at", paymentDataUpdatedAt.toISOString());
    } catch (e) { /* localStorage 사용 불가 시 무시 */ }

    if (statusEl) {
      statusEl.textContent = `✅ 갱신 완료 (${paymentDataUpdatedAt.toLocaleString("ko-KR")}) · 총 ${Object.keys(paymentDataCache).length}건`;
    }
  } catch (err) {
    console.error("입금현황 갱신 오류:", err);
    if (statusEl) statusEl.textContent = "❌ 갱신 실패: " + err.message;
  }
}

function loadCachedPaymentData() {
  try {
    const cached = localStorage.getItem("payment_data_cache");
    const updatedAt = localStorage.getItem("payment_data_updated_at");
    if (cached) {
      paymentDataCache = JSON.parse(cached);
      paymentDataUpdatedAt = updatedAt ? new Date(updatedAt) : null;
      const statusEl = document.getElementById("paymentRefreshStatus");
      if (statusEl && paymentDataUpdatedAt) {
        statusEl.textContent = `마지막 갱신: ${paymentDataUpdatedAt.toLocaleString("ko-KR")} · 총 ${Object.keys(paymentDataCache).length}건 (필요하면 다시 갱신하세요)`;
      }
    }
  } catch (e) { /* 무시 */ }
}

switchMainTab("procedures");
initTypeSelect();
initNtfTypeSelect();
renderNoticeBanner();
if (CORE_SHEET_API_URL) {
  syncNoticeBannerFromServer().then(() => renderNoticeBanner());
}
renderFeedbackBadge();
if (FEEDBACK_SHEET_API_URL) {
  fetchFeedbackListFromServer().then((list) => {
    if (list) { FEEDBACK_LIST = list; renderFeedbackBadge(); }
  });
}
checkAndShowDailyQuote();
renderRecentItemsRow();
populateOblNameSelect();
loadCachedPaymentData();

