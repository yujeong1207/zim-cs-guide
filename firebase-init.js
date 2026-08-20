/**
 * ===============================================
 * Firebase 초기화
 * ===============================================
 * index.html에서 Firebase SDK(compat) 스크립트들 바로 다음,
 * 다른 모든 스크립트(guide_script.js 등)보다 먼저 로드돼야 해요.
 *
 * 하는 일:
 * 1. Firebase 프로젝트(CS GUIDE)에 연결
 * 2. 팀원이 페이지를 열면 조용히 "익명 로그인" 처리
 *    (팀원 눈에는 로그인 창이 전혀 안 뜨고, 그냥 바로 페이지가 보여요)
 * 3. window.fbDb / window.fbReady 를 다른 스크립트들이 쓸 수 있게 준비해둠
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

window.fbDb = firebase.firestore();

/* 다른 스크립트들이 "await window.fbReady" 하면, 익명 로그인이 끝난 뒤에 이어서 실행돼요. */
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
