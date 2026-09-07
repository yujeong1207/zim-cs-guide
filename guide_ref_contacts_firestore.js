/**
 * ===============================================
 * 📞 참고자료 → 연락처 탭 - Firestore 연동
 * ===============================================
 * 예전에는 이 목록이 코드(guide_data.js의 DEFAULT_CONTACTS)에 그대로 박혀 있었는데,
 * 이 저장소가 Public이라 회사 대외 연락처가 통째로 인터넷에 공개되는 상태였다.
 * "AN 연락처" 탭을 Firestore로 옮길 때와 같은 이유로, 이 탭도 Firestore로 옮긴다.
 *
 * ===== AN 연락처와의 차이점 =====
 * AN 연락처(6,885건)는 양이 많아서 "탭 열 때 한 번만 로드 + 수동 새로고침" 방식을 썼지만,
 * 여기는 데이터가 훨씬 작고(수백 건 수준) 국가 그룹 순서·소제목 구조가 중요해서,
 * onSnapshot 실시간 구독을 써서 팀원 중 누군가 추가/수정하면 새로고침 없이 바로 반영되게 한다.
 *
 * ===== 데이터 구조 =====
 * Firestore 컬렉션: "reference_contacts"
 * 각 문서: { order, isHeader, label, country, category, contact, email, email2, updatedAt }
 * order: 화면에 표시되는 순서(그룹/국가 순서가 중요해서 정렬 기준으로 저장) — 숫자가 작을수록 위.
 */

const REF_CONTACTS_COLLECTION = "reference_contacts";

let refContactsUnsubscribe = null; // onSnapshot 리스너 해제 함수 (탭 벗어나도 계속 켜둬도 무해하지만, 명시적으로 관리)
let refContactsLoaded = false;

/* CONTACTS 전역 변수(guide_storage_widgets.js에서 선언)를 Firestore 데이터로 채운다.
   앱 시작 시 한 번 호출해서 구독을 걸어두면, 이후 어떤 탭에 있든 계속 최신 상태로 유지된다. */
function initRefContactsFirestoreSync() {
  if (!window.fbDb) {
    console.warn("Firestore가 아직 준비되지 않았어요. 연락처 탭이 빈 상태로 보일 수 있어요.");
    return;
  }
  if (refContactsUnsubscribe) return; // 이미 구독 중이면 중복 방지

  refContactsUnsubscribe = window.fbDb
    .collection(REF_CONTACTS_COLLECTION)
    .orderBy("order")
    .onSnapshot(
      (snapshot) => {
        CONTACTS = snapshot.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
        refContactsLoaded = true;
        if (typeof mainTab !== "undefined" && mainTab === "contacts") renderContactsTable();
      },
      (err) => {
        console.error("연락처(Firestore) 실시간 동기화 실패:", err);
      }
    );
}

/* 국가 그룹/소제목 순서를 유지하기 위해, 전체 목록을 저장할 때마다 order를 0,1,2...로 다시 매긴다. */
async function replaceAllRefContactsInFirestore(list) {
  const batchSize = 400; // Firestore 배치 쓰기 한도(500) 안전 마진
  const collectionRef = window.fbDb.collection(REF_CONTACTS_COLLECTION);

  // 기존 문서 전부 삭제
  const existing = await collectionRef.get();
  for (let i = 0; i < existing.docs.length; i += batchSize) {
    const batch = window.fbDb.batch();
    existing.docs.slice(i, i + batchSize).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 새 목록 순서대로 다시 기록
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = window.fbDb.batch();
    list.slice(i, i + batchSize).forEach((item, offset) => {
      const order = i + offset;
      const data = Object.assign({}, item, { order, updatedAt: todayStr() });
      delete data.id; // id는 Firestore가 문서 ID로 따로 관리
      batch.set(collectionRef.doc(), data);
    });
    await batch.commit();
  }
}

/* 기존 목록 뒤에 새 항목들을 이어 붙인다 (order는 현재 최대값 이후로 이어서 부여). */
async function appendRefContactsToFirestore(newItems) {
  const collectionRef = window.fbDb.collection(REF_CONTACTS_COLLECTION);
  const currentMaxOrder = CONTACTS.reduce((max, c) => Math.max(max, typeof c.order === "number" ? c.order : 0), -1);

  const batchSize = 400;
  for (let i = 0; i < newItems.length; i += batchSize) {
    const batch = window.fbDb.batch();
    newItems.slice(i, i + batchSize).forEach((item, offset) => {
      const order = currentMaxOrder + 1 + i + offset;
      const data = Object.assign({}, item, { order, updatedAt: todayStr() });
      delete data.id;
      batch.set(collectionRef.doc(), data);
    });
    await batch.commit();
  }
}

/* 개별 항목 추가/수정 (관리 화면의 "편집" 화면에서 사용) */
async function saveRefContactToFirestore(item) {
  const collectionRef = window.fbDb.collection(REF_CONTACTS_COLLECTION);
  const data = Object.assign({}, item, { updatedAt: todayStr() });
  const id = data.id;
  delete data.id;

  if (id && CONTACTS.some((c) => c.id === id)) {
    await collectionRef.doc(id).update(data);
  } else {
    // 새 항목은 맨 뒤에 추가
    const currentMaxOrder = CONTACTS.reduce((max, c) => Math.max(max, typeof c.order === "number" ? c.order : 0), -1);
    data.order = currentMaxOrder + 1;
    await collectionRef.add(data);
  }
}

/* "OO 바로 뒤에 끼워넣기"용 저장. insertAfterLabel과 같은 국가/그룹(label 또는 country)에
   속한 항목들 중 마지막 것을 찾아서, 그 order와 다음 order 사이에 새 항목을 끼워 넣는다.
   두 order 사이에 여유 공간이 없으면(연속된 정수라 끼울 자리가 없으면) 그 뒤 항목들의
   order를 1씩 밀어서 자리를 만든다. */
async function saveRefContactToFirestoreAtPosition(item, insertAfterLabel) {
  const collectionRef = window.fbDb.collection(REF_CONTACTS_COLLECTION);

  // insertAfterLabel과 같은 국가/그룹에 속하는 마지막 인덱스를 찾는다.
  let lastIdxOfGroup = -1;
  for (let i = 0; i < CONTACTS.length; i++) {
    const c = CONTACTS[i];
    const label = c.isHeader ? c.label : c.country;
    if (label === insertAfterLabel) lastIdxOfGroup = i;
  }

  if (lastIdxOfGroup === -1) {
    // 못 찾았으면(그 사이 다른 사람이 지웠을 수도 있음) 그냥 맨 뒤에 추가
    await saveRefContactToFirestore(item);
    return;
  }

  const afterItem = CONTACTS[lastIdxOfGroup];
  const nextItem = CONTACTS[lastIdxOfGroup + 1]; // 없을 수 있음(그 그룹이 맨 끝일 때)
  const afterOrder = typeof afterItem.order === "number" ? afterItem.order : lastIdxOfGroup;
  const nextOrder = nextItem ? (typeof nextItem.order === "number" ? nextItem.order : lastIdxOfGroup + 1) : afterOrder + 2;

  const data = Object.assign({}, item, { updatedAt: todayStr() });
  delete data.id;

  if (nextOrder - afterOrder >= 2) {
    // 두 order 사이에 정수 여유가 있으면 그냥 그 사이 값으로 끼워 넣는다 (다른 항목 안 건드림)
    data.order = (afterOrder + nextOrder) / 2;
    await collectionRef.add(data);
  } else {
    // 여유가 없으면, 이 지점 이후의 모든 항목 order를 1씩 밀어서 자리를 만든다.
    const batch = window.fbDb.batch();
    for (let i = lastIdxOfGroup + 1; i < CONTACTS.length; i++) {
      const c = CONTACTS[i];
      batch.update(collectionRef.doc(c.id), { order: (typeof c.order === "number" ? c.order : i) + 1 });
    }
    data.order = afterOrder + 1;
    const newDocRef = collectionRef.doc();
    batch.set(newDocRef, data);
    await batch.commit();
  }
}

/* 개별 항목 삭제 */
async function deleteRefContactFromFirestore(id) {
  await window.fbDb.collection(REF_CONTACTS_COLLECTION).doc(id).delete();
}

/* 항목을 목록에서 한 칸 위(-1) 또는 아래(+1)로 옮긴다. 바로 옆 항목과 order 값을 맞바꿔서
   화면에 보이는 순서(= 관리 화면에서 편집하는 순서 = 실제 참고자료 탭 표시 순서)를 그대로 바꾼다. */
async function moveRefContactItem(id, direction) {
  const idx = CONTACTS.findIndex((c) => c.id === id);
  if (idx === -1) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= CONTACTS.length) return; // 이미 맨 위/맨 아래

  const current = CONTACTS[idx];
  const target = CONTACTS[targetIdx];
  const currentOrder = typeof current.order === "number" ? current.order : idx;
  const targetOrder = typeof target.order === "number" ? target.order : targetIdx;

  try {
    const batch = window.fbDb.batch();
    const collectionRef = window.fbDb.collection(REF_CONTACTS_COLLECTION);
    batch.update(collectionRef.doc(current.id), { order: targetOrder });
    batch.update(collectionRef.doc(target.id), { order: currentOrder });
    await batch.commit();
    // Firestore 실시간 구독이 CONTACTS를 자동 갱신해주지만, 관리자 목록 화면은 직접 다시 그린다.
    renderAdminList();
  } catch (err) {
    alert("순서 변경에 실패했어요: " + err.message);
  }
}
