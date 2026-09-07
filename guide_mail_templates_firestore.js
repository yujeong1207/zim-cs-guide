/**
 * ===============================================
 * 📧 메일 템플릿(화주 응대 모음 등) - Firestore 연동
 * ===============================================
 * guide_ref_contacts_firestore.js와 완전히 같은 이유·같은 구조.
 * 예전에는 guide_data.js의 DEFAULT_TEMPLATES에 실제 메일 문구(연락처, 담당자 이메일 등
 * 민감정보 포함)가 그대로 박혀 있었는데, 이 저장소가 Public이라 전부 노출되는 상태였다.
 * 그리고 관리 화면에서 추가한 내용이 본인 브라우저(localStorage)에만 남고 팀원들에게는
 * 반영되지 않던 문제도 같이 해결한다.
 *
 * ===== 데이터 구조 =====
 * Firestore 컬렉션: "mail_templates"
 * 각 문서: { order, label, group, guide, fields, table, outputs, updatedAt }
 * (기존 코드의 템플릿 객체 구조를 그대로 유지 - fields/outputs는 배열을 통째로 저장)
 * order: 관리 화면·드롭다운에 표시되는 순서 — 숫자가 작을수록 위.
 */

const MAIL_TEMPLATES_COLLECTION = "mail_templates";

let mailTemplatesUnsubscribe = null;
let mailTemplatesLoaded = false;

/* TEMPLATES 전역 변수(guide_storage_widgets.js에서 선언)를 Firestore 데이터로 채운다.
   앱 시작 시 한 번 호출해서 구독을 걸어두면, 이후 어떤 탭에 있든 계속 최신 상태로 유지된다. */
function initMailTemplatesFirestoreSync() {
  if (!window.fbDb) {
    console.warn("Firestore가 아직 준비되지 않았어요. 메일 템플릿이 빈 상태로 보일 수 있어요.");
    return;
  }
  if (mailTemplatesUnsubscribe) return; // 중복 구독 방지

  mailTemplatesUnsubscribe = window.fbDb
    .collection(MAIL_TEMPLATES_COLLECTION)
    .orderBy("order")
    .onSnapshot(
      (snapshot) => {
        TEMPLATES = snapshot.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
        mailTemplatesLoaded = true;
        // 현재 화면이 메일 템플릿 탭이면 드롭다운/미리보기를 새로고침해서 최신 내용을 바로 보여준다.
        if (typeof mainTab !== "undefined" && mainTab === "templates" && typeof initTypeSelect === "function") {
          initTypeSelect();
        }
        if (typeof adminSection !== "undefined" && adminSection === "templates" && typeof renderAdminList === "function") {
          renderAdminList();
        }
      },
      (err) => {
        console.error("메일 템플릿(Firestore) 실시간 동기화 실패:", err);
      }
    );
}

/* 전체 목록 교체 (가져오기/복원 기능에서 사용) */
async function replaceAllMailTemplatesInFirestore(list) {
  const batchSize = 400;
  const collectionRef = window.fbDb.collection(MAIL_TEMPLATES_COLLECTION);

  const existing = await collectionRef.get();
  for (let i = 0; i < existing.docs.length; i += batchSize) {
    const batch = window.fbDb.batch();
    existing.docs.slice(i, i + batchSize).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 새 목록 순서대로 다시 기록. id가 있는 항목(예: istanbul, omit 같은 원래 코드 id)은
  // 그 id를 문서 ID로 그대로 써서 보존하고, id가 없는 새 항목만 Firestore가 새 id를 만들게 둔다.
  // (이걸 안 지키면 마이그레이션할 때마다 화면 드롭다운 옵션 값과 실제 데이터 id가 어긋난다.)
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = window.fbDb.batch();
    list.slice(i, i + batchSize).forEach((item, offset) => {
      const order = i + offset;
      const data = Object.assign({}, item, { order, updatedAt: todayStr() });
      const id = data.id;
      delete data.id;
      const docRef = id ? collectionRef.doc(id) : collectionRef.doc();
      batch.set(docRef, data);
    });
    await batch.commit();
  }
}

/* 개별 항목 추가/수정 (관리 화면 "저장"에서 사용) */
async function saveMailTemplateToFirestore(item) {
  const collectionRef = window.fbDb.collection(MAIL_TEMPLATES_COLLECTION);
  const data = Object.assign({}, item, { updatedAt: todayStr() });
  const id = data.id;
  delete data.id;

  if (id && TEMPLATES.some((t) => t.id === id)) {
    await collectionRef.doc(id).update(data);
  } else {
    const currentMaxOrder = TEMPLATES.reduce((max, t) => Math.max(max, typeof t.order === "number" ? t.order : 0), -1);
    data.order = currentMaxOrder + 1;
    await collectionRef.add(data);
  }
}

/* 개별 항목 삭제 */
async function deleteMailTemplateFromFirestore(id) {
  await window.fbDb.collection(MAIL_TEMPLATES_COLLECTION).doc(id).delete();
}

/* 위/아래 순서 이동 - 연락처와 동일한 방식(바로 옆 항목과 order 값 맞바꾸기) */
async function moveMailTemplateItem(id, direction) {
  const idx = TEMPLATES.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= TEMPLATES.length) return;

  const current = TEMPLATES[idx];
  const target = TEMPLATES[targetIdx];
  const currentOrder = typeof current.order === "number" ? current.order : idx;
  const targetOrder = typeof target.order === "number" ? target.order : targetIdx;

  try {
    const batch = window.fbDb.batch();
    const collectionRef = window.fbDb.collection(MAIL_TEMPLATES_COLLECTION);
    batch.update(collectionRef.doc(current.id), { order: targetOrder });
    batch.update(collectionRef.doc(target.id), { order: currentOrder });
    await batch.commit();
    renderAdminList();
  } catch (err) {
    alert("순서 변경에 실패했어요: " + err.message);
  }
}
