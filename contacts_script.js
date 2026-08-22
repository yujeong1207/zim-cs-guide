/**
 * ===============================================
 * AN 연락처 탭 - 프론트엔드
 * ===============================================
 * guide_script.js 랑 분리된 별도 파일이에요.
 *
 * ===== 동작 방식 (중요) =====
 * 탭이 열릴 때 전체 데이터를 딱 한 번 다 받아와서 브라우저 메모리에 저장해두고,
 * 검색은 서버에 안 물어보고 그 메모리 안에서 바로 걸러내요.
 * → 그래서 검색이 타이핑 즉시 반응하고, 경합 조건(늦게 온 응답이 최신 걸 덮어쓰는 버그) 걱정도 없어요.
 * → 대신 다른 팀원이 방금 추가한 항목은, 내가 "🔄 새로고침"을 누르거나 탭을 다시 열기 전까지는
 *   내 화면에 바로 안 보일 수 있어요. (등록/수정은 항상 서버에 바로 반영되니, 데이터 자체는 안전해요)
 */

const CONTACT_SHEET_API_URL = true; // 🔥 Firebase로 이전 완료 (이 값은 이제 "연락처 실시간 공유 켜짐" 표시 용도로만 쓰임)
const CONTACTS_COLLECTION = "contacts"; // Firestore 컬렉션 이름

const CONTACTS_RENDER_PAGE_SIZE = 200; // 검색 결과가 많을 때 한 번에 화면에 그릴 개수 ("더 보기"로 늘어남)

let contactsAllItems = null; // 전체 데이터 캐시 (한 번 로드되면 계속 재사용)
let contactsFilteredItems = []; // 현재 검색어로 걸러진 결과
let contactsRenderCount = CONTACTS_RENDER_PAGE_SIZE; // 지금까지 화면에 그린 개수
let contactsCurrentQuery = "";

function initContactsTab() {
  const root = document.getElementById("an-anemail-tab");
  if (!root) return;
  if (root.dataset.anemailInited === "1") return; // 이미 초기화됐으면 다시 안 그림 (검색창 값 유지)
  root.dataset.anemailInited = "1";

  root.innerHTML = `
    <div class="anemail-wrap">
      <div class="hint" style="margin:0;">💡 등록·수정은 서버에 바로 반영되지만, <b>다른 팀원 화면엔 자동으로 안 떠요.</b> 새 업체를 추가하기 전이나, 방금 등록/수정한 게 있는지 확인하고 싶을 땐 꼭 "🔄 새로고침"을 먼저 눌러주세요.</div>
      <div class="anemail-search-row">
        <input id="anemail-search-input" type="text"
          placeholder="영문상호·한글상호·비고(포워더명 등)로 검색... (비워두면 전체 목록)" autocomplete="off" disabled />
        <button id="anemail-refresh-btn" type="button" title="다른 팀원이 방금 추가한 내용까지 새로 불러와요">🔄 새로고침</button>
        <button id="anemail-add-btn" type="button">+ 새 거래처 등록</button>
      </div>
      <div id="anemail-add-form" class="anemail-form" style="display:none;"></div>
      <div id="anemail-count" class="anemail-count"></div>
      <div id="anemail-list"></div>
    </div>
  `;

  document.getElementById("anemail-search-input").addEventListener("input", (e) => {
    applyContactsFilter(e.target.value);
  });

  document.getElementById("anemail-add-btn").addEventListener("click", () => {
    renderContactForm(null);
  });

  document.getElementById("anemail-refresh-btn").addEventListener("click", () => {
    loadAllContacts(true);
  });

  loadAllContacts(false);
}

/* 전체 데이터를 한 번에 불러와 캐시에 저장 (forceReload면 캐시 무시하고 새로 받아옴) */
const CONTACTS_CACHE_STORAGE_KEY = "cs_guide_contacts_cache_v1";
const CONTACTS_CACHE_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4시간 - 며칠에 한 번 정도 추가되는 빈도라, 완전 실시간보단 이 정도면 충분

function loadAllContacts(forceReload) {
  const listEl = document.getElementById("anemail-list");
  const inputEl = document.getElementById("anemail-search-input");

  if (contactsAllItems && !forceReload) {
    applyContactsFilter(inputEl.value);
    return;
  }

  // "새로고침" 버튼을 직접 누른 게 아니면, 브라우저에 저장해둔 캐시부터 먼저 확인
  // (있고 아직 안 오래됐으면 Firestore를 아예 안 읽어요 - 비용/한도 절약)
  if (!forceReload) {
    try {
      const cachedRaw = localStorage.getItem(CONTACTS_CACHE_STORAGE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        const age = Date.now() - (cached.savedAt || 0);
        if (age < CONTACTS_CACHE_MAX_AGE_MS && Array.isArray(cached.items)) {
          contactsAllItems = cached.items;
          inputEl.disabled = false;
          applyContactsFilter(inputEl.value);
          checkContactsUpdatesForNotice();
          return; // Firestore 읽기 없이 여기서 끝
        }
      }
    } catch (e) { /* 캐시 읽기 실패하면 그냥 아래로 내려가서 새로 불러옴 */ }
  }

  listEl.innerHTML = `<div class="anemail-loading">전체 연락처 불러오는 중... (처음 한 번만 시간이 좀 걸려요)</div>`;
  inputEl.disabled = true;

  (async () => {
    try {
      await window.fbReady;
      const snapshot = await window.fbDb.collection(CONTACTS_COLLECTION).get();
      contactsAllItems = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          eng: d.eng || "",
          kor: d.kor || "",
          email: d.email || "",
          manager: d.manager || "",
          note: d.note || "",
          updatedAt: d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : "",
        };
      });

      try {
        localStorage.setItem(CONTACTS_CACHE_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), items: contactsAllItems }));
      } catch (e) { /* 저장 실패해도(용량 초과 등) 무시 - 이번 세션에서 메모리로는 잘 쓰고 있으니 괜찮음 */ }

      inputEl.disabled = false;
      applyContactsFilter(inputEl.value);
      checkContactsUpdatesForNotice();
    } catch (err) {
      listEl.innerHTML = `<div class="anemail-empty">불러오기 실패: ${escapeHtml(String(err))}</div>`;
    }
  })();
}

/* 캐시된 전체 데이터 안에서 검색어로 걸러서 화면에 그림 (서버 호출 없음 - 즉시 반응) */
function applyContactsFilter(query) {
  contactsCurrentQuery = query || "";
  contactsRenderCount = CONTACTS_RENDER_PAGE_SIZE;

  const q = contactsCurrentQuery.trim().toUpperCase();

  if (!q) {
    contactsFilteredItems = contactsAllItems || [];
  } else {
    contactsFilteredItems = (contactsAllItems || []).filter((item) => {
      const eng = (item.eng || "").toUpperCase();
      const kor = (item.kor || "").toUpperCase();
      const note = (item.note || "").toUpperCase();
      return eng.includes(q) || kor.includes(q) || note.includes(q);
    });
  }

  renderContactList();
}

function renderContactList() {
  const listEl = document.getElementById("anemail-list");
  const countEl = document.getElementById("anemail-count");
  const all = contactsFilteredItems;

  if (!all || all.length === 0) {
    countEl.textContent = "";
    listEl.innerHTML = `<div class="anemail-empty">
      ${contactsCurrentQuery ? "검색 결과가 없어요. 새로 등록해보세요." : "등록된 연락처가 없어요."}
    </div>`;
    return;
  }

  const visible = all.slice(0, contactsRenderCount);
  countEl.textContent = `${visible.length.toLocaleString()} / ${all.length.toLocaleString()}건`;

  const rowsHtml = visible.map((item) => {
    const hasNote = item.note && item.note.trim();
    const rowClass = hasNote ? "anemail-row-warning" : "";
    const mainRow = `
      <tr class="${rowClass}" data-id="${escapeHtml(item.id)}">
        <td class="anemail-col-eng" title="${escapeHtml(item.eng)}">${escapeHtml(item.eng)}</td>
        <td class="anemail-col-kor">${escapeHtml(item.kor) || "-"}</td>
        <td class="anemail-col-email">${escapeHtml(item.email) || "-"}</td>
        <td class="anemail-col-btn"><button class="anemail-edit-btn" type="button" data-id="${escapeHtml(item.id)}">수정</button></td>
      </tr>
    `;
    const noteRow = hasNote ? `
      <tr class="${rowClass}" data-id="${escapeHtml(item.id)}">
        <td class="anemail-col-note" colspan="4">⚠️ ${escapeHtml(item.note)}</td>
      </tr>
    ` : "";
    return mainRow + noteRow;
  }).join("");

  const hasMore = visible.length < all.length;
  const moreHtml = hasMore
    ? `<button id="anemail-load-more" type="button" class="anemail-load-more-btn">더 보기 (${(all.length - visible.length).toLocaleString()}건 남음)</button>`
    : "";

  listEl.innerHTML = `<table class="anemail-table"><tbody>${rowsHtml}</tbody></table>${moreHtml}`;

  listEl.querySelectorAll(".anemail-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = all.find((x) => String(x.id) === String(btn.dataset.id));
      if (item) renderContactForm(item);
    });
  });

  const loadMoreBtn = document.getElementById("anemail-load-more");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      contactsRenderCount += CONTACTS_RENDER_PAGE_SIZE;
      renderContactList(); // 이미 캐시에 있는 데이터라 서버 호출 없이 바로 더 그려짐
    });
  }
}

function renderContactForm(item) {
  const isEdit = !!item;
  const formEl = document.getElementById("anemail-add-form");
  formEl.style.display = "block";
  formEl.innerHTML = `
    <div class="anemail-form-title">${isEdit ? "거래처 수정" : "새 거래처 등록"}</div>
    ${isEdit ? "" : `<div class="hint" style="margin:0 0 10px;">⚠️ 이미 등록된 업체인지 모를 수 있어요. 등록 전에 위 "🔄 새로고침"을 한 번 눌러서 최신 목록으로 확인해주세요.</div>`}
    <input id="af-eng" type="text" placeholder="영문상호 (필수)" value="${escapeHtml(item ? item.eng : "")}" />
    <input id="af-kor" type="text" placeholder="한글상호" value="${escapeHtml(item ? item.kor : "")}" />
    <input id="af-email" type="text" placeholder="이메일 (필수)" value="${escapeHtml(item ? item.email : "")}" />
    <input id="af-manager" type="text" placeholder="담당자" value="${escapeHtml(item ? item.manager : "")}" />
    <input id="af-note" type="text" placeholder="⚠️ 비고 (특이사항 있을 때만)" value="${escapeHtml(item ? item.note : "")}" />
    <div class="anemail-form-actions">
      <button id="af-save" type="button">${isEdit ? "수정 저장" : "등록"}</button>
      <button id="af-cancel" type="button">취소</button>
    </div>
    <div id="af-status"></div>
  `;

  document.getElementById("af-cancel").addEventListener("click", () => {
    formEl.style.display = "none";
    formEl.innerHTML = "";
  });

  document.getElementById("af-save").addEventListener("click", () => {
    const payload = {
      action: isEdit ? "update" : "add",
      id: isEdit ? item.id : undefined,
      eng: document.getElementById("af-eng").value.trim(),
      kor: document.getElementById("af-kor").value.trim(),
      email: document.getElementById("af-email").value.trim(),
      manager: document.getElementById("af-manager").value.trim(),
      note: document.getElementById("af-note").value.trim(),
    };

    if (!payload.eng || !payload.email) {
      document.getElementById("af-status").textContent = "영문상호와 이메일은 필수예요.";
      return;
    }

    document.getElementById("af-save").disabled = true;
    document.getElementById("af-status").textContent = "저장 중...";

    (async () => {
      try {
        await window.fbReady;
        const now = firebase.firestore.FieldValue.serverTimestamp();
        if (payload.action === "update") {
          await window.fbDb.collection(CONTACTS_COLLECTION).doc(payload.id).update({
            eng: payload.eng, kor: payload.kor, email: payload.email,
            manager: payload.manager, note: payload.note, updatedAt: now,
          });
        } else {
          await window.fbDb.collection(CONTACTS_COLLECTION).add({
            eng: payload.eng, kor: payload.kor, email: payload.email,
            manager: payload.manager, note: payload.note, updatedAt: now,
          });
        }
        formEl.style.display = "none";
        formEl.innerHTML = "";
        // 방금 등록/수정한 게 바로 보이도록 캐시를 새로 불러옴 (여기선 한 번 더 기다리는 게 맞음)
        loadAllContacts(true);
      } catch (err) {
        document.getElementById("af-status").textContent = "저장 실패: " + err;
        document.getElementById("af-save").disabled = false;
      }
    })();
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ===== 🔔 새 소식 알림 (다른 팀원이 등록/수정한 게 있으면 화면에 배너로 알려줌) =====
   구글시트 G열(수정시각)을 기준으로 판단해요 (contacts_apps_script.gs 참고) - 새로
   추가된 것뿐 아니라 기존 항목의 이메일만 살짝 고친 경우도 정확히 잡혀요.
   - 페이지 열자마자 백그라운드에서 항상 전체를 한 번 불러오기 때문에(위 DOMContentLoaded),
     탭을 안 열어봐도 알림이 뜸. */
const CONTACTS_SEEN_TS_KEY = "contacts_seen_ts_v2";

/* 최신 수정시각을 가진 "항목 하나"를 통째로 돌려줌 (알림에 어떤 업체인지 보여주기 위함) */
function getContactsMostRecentItem_() {
  if (!contactsAllItems || !contactsAllItems.length) return null;
  let best = null;
  contactsAllItems.forEach((item) => {
    if (item.updatedAt && (!best || new Date(item.updatedAt) > new Date(best.updatedAt))) best = item;
  });
  return best;
}

function checkContactsUpdatesForNotice() {
  const recent = getContactsMostRecentItem_();
  if (!recent) return; // updatedAt이 아직 없는 옛날 데이터만 있으면(초기화 전) 알림 안 띄움
  const maxUpdatedAt = recent.updatedAt;

  const seenRaw = localStorage.getItem(CONTACTS_SEEN_TS_KEY);
  if (seenRaw === null) {
    // 이 브라우저에서 처음 확인하는 거면 알림 없이 기준점만 저장
    localStorage.setItem(CONTACTS_SEEN_TS_KEY, maxUpdatedAt);
    return;
  }
  if (new Date(maxUpdatedAt) > new Date(seenRaw) && typeof pushSharedUpdateNotice === "function") {
    const label = recent.eng || recent.kor || "업체 정보";
    const emailPart = recent.email ? ` (${recent.email})` : "";
    pushSharedUpdateNotice(
      "contacts",
      `🔔 AN 연락처 갱신 - ${escapeHtml(label)}${escapeHtml(emailPart)} 확인해보세요`,
      () => { if (typeof switchMainTab === "function") switchMainTab("anemail"); }
    );
  }
  // 여기선 기준점을 안 건드리고, "확인"(탭 진입)했을 때만 갱신함
}

/* AN 연락처 탭에 실제로 들어왔을 때 호출 - 지금까지의 최신 수정시각을 "확인함"으로 처리 */
function markContactsUpdatesSeen() {
  const recent = getContactsMostRecentItem_();
  if (recent) localStorage.setItem(CONTACTS_SEEN_TS_KEY, recent.updatedAt);
  if (typeof dismissSharedUpdateNotice === "function") dismissSharedUpdateNotice("contacts");
}

// 연락처 탭이 클릭되어 화면에 나타날 때 초기화 (기존 탭 전환 로직에 맞춰 호출 위치 조정 필요)
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("an-anemail-tab")) {
    initContactsTab();
  }
});
