/**
 * ===============================================
 * Firebase 초기화
 * ===============================================
 * index.html에서 Firebase SDK(compat) 스크립트들 바로 다음,
 * 다른 모든 스크립트(guide_script.js 등)보다 먼저 로드돼야 해요.
 *
 * 하는 일:
 * 1. Firebase 프로젝트(CS GUIDE)에 연결 - 이건 가장 먼저, 무조건 성공하게 함
 * 2. 팀원이 페이지를 열면 조용히 "익명 로그인" 처리
 * 3. App Check(reCAPTCHA)는 body가 준비된 다음에 "안전하게"(에러 나도 무시) 붙임
 *    - 순서를 바꾼 이유: App Check가 화면에 작은 배지를 붙이려고 하는데,
 *      <head> 안에서 너무 일찍 실행되면 아직 <body>가 없어서 에러가 나고,
 *      그 에러 때문에 뒤에 있던 코드(fbDb 설정)까지 통째로 멈춰버리는
 *      문제가 있었어요. 그래서 fbDb를 먼저 확실히 만들어두고,
 *      App Check는 나중에 별도로, 실패해도 나머지에 영향 없게 처리해요.
 *
 * ※ 이 apiKey는 "비밀번호"가 아니에요 - 원래 코드에 공개적으로 들어가는 값이고,
 *   실제 보안은 Firestore 쪽 "규칙(Rules)"이 담당해요. 걱정 안 하셔도 돼요.
 */

const firebaseConfig = {
  apiKey: "AIzaSyARdqi9m-K7BtJL7BAp8sF8jYTnEcxzlMU",
  authDomain: "cs-guide-a29bc.firebaseapp.com",
  projectId: "cs-guide-a29bc",
  storageBucket: "cs-guide-a29bc.firebasestorage.app",
  messagingSenderId: "613008059888",
  appId: "1:613008059888:web:2255dab714d0676ccd4135",
};

firebase.initializeApp(firebaseConfig);

/* 1) 핵심 기능(Firestore, 인증)부터 먼저 확실하게 준비 */
window.fbDb = firebase.firestore();

window.fbReady = new Promise((resolve, reject) => {
  const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      unsubscribe();
      resolve(user);
    }
  });
  firebase.auth().signInAnonymously().catch((err) => {
    console.error("Firebase 익명 로그인 실패:", err);
    reject(err);
  });
});

/* 2) App Check(reCAPTCHA)는 body가 생긴 다음, 실패해도 나머지엔 영향 없게 별도로 시도 */
function initAppCheckSafely() {
  try {
    firebase.appCheck().activate(
      "6Ldw6I8tAAAAADkaPzll9wJT382Ns8ELeZs8oAop", // reCAPTCHA v3 사이트 키
      true // 토큰 자동 갱신
    );
  } catch (err) {
    console.error("App Check 초기화 실패 (위임장/연락처 등 나머지 기능은 정상 작동해요):", err);
  }
}

if (document.body) {
  initAppCheckSafely();
} else {
  document.addEventListener("DOMContentLoaded", initAppCheckSafely);
}
