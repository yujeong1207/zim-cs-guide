/**
 * ===============================================
 * AN 연락처 탭 - 프론트엔드
 * ===============================================
 * guide_script.js 랑 분리된 별도 파일이에요.
 * index.html 에 아래 한 줄만 추가하면 됩니다 (guide_script.js 불러오는 줄 근처):
 *
 *   <script src="contacts_script.js"></script>
 *
 * 그리고 연락처 탭이 들어갈 자리에 아래 HTML을 넣어주세요
 * (contacts_tab.html 파일에 똑같은 내용 있어요):
 *
 *   <div id="an-contacts-tab">...</div>
 *
 * 아래 URL만 채우면 바로 작동합니다.
 */

const CONTACT_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbz7qB6NXJ421ynHQ3J8I30Sha2CvzYfWZPO54FuZoe44-nFFL5mN-x7k4jvqz6Z1T87vA/exec";

const CONTACTS_PAGE_SIZE = 200; // 한 번에 불러올 개수 ("더 보기" 누를 때마다 이만큼씩)

let contactsSearchTimer = null;
let contactsState = { query: "", offset: 0, total: 0, items: [] };
let contactsRequestSeq = 0; // 늦게 도착한 응답이 최신 상태를 덮어쓰지 못하게 막는 토큰

function initContactsTab() {
  const root = document.getElementById("an-contacts-tab");
  if (!root) return;

  root.innerHTML = `
    <div class="contacts-wrap">
      <div class="contacts-search-row">
        <input id="contacts-search-input" type="text"
          placeholder="영문상호·한글상호·비고(포워더명 등)로 검색... (비워두면 전체 목록)" autocomplete="off" />
        <button id="contacts-add-btn" type="button">+ 새 거래처 등록</button>
      </div>
      <div id="contacts-add-form" class="contacts-form" style="display:none;"></div>
      <div id="contacts-count" class="contacts-count"></div>
      <div id="contacts-list"></div>
    </div>
  `;

  document.getElementById("contacts-search-input").addEventListener("input", (e) => {
    clearTimeout(contactsSearchTimer);
    const q = e.target.value;
    contactsSearchTimer = setTimeout(() => fetchContacts(q, true), 400); // 400ms 디바운스
  });

  document.getElementById("contacts-add-btn").addEventListener("click", () => {
    renderContactForm(null);
  });

  fetchContacts("", true); // 처음 열었을 때 원본 순서대로 전체 목록 첫 페이지
}

function fetchContacts(query, reset) {
  if (reset) {
    contactsState = { query: query || "", offset: 0, total: 0, items: [] };
  }

  contactsRequestSeq += 1;
  const myRequestId = contactsRequestSeq; // 이 요청만의 고유 번호

  const listEl = document.getElementById("contacts-list");
  if (reset) {
    listEl.innerHTML = `<div class="contacts-loading">불러오는 중...</div>`;
  }

  if (!CONTACT_SHEET_API_URL) {
    listEl.innerHTML = `<div class="contacts-empty">CONTACT_SHEET_API_URL이 아직 설정되지 않았어요.</div>`;
    return;
  }

  const requestedQuery = contactsState.query;
  const requestedOffset = contactsState.offset;
  const url = CONTACT_SHEET_API_URL
    + "?q=" + encodeURIComponent(requestedQuery)
    + "&offset=" + requestedOffset
    + "&limit=" + CONTACTS_PAGE_SIZE;

  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      // 이 응답이 도착하는 사이에 더 최신 검색이 시작됐으면, 이 응답은 버림 (경합 조건 방지)
      if (myRequestId !== contactsRequestSeq) return;
      // 검색어가 그 사이 또 바뀌었으면 (드문 케이스) 이것도 버림
      if (requestedQuery !== contactsState.query || requestedOffset !== contactsState.offset) return;

      if (!data.ok) {
        listEl.innerHTML = `<div class="contacts-empty">오류: ${escapeHtml(data.error || "알 수 없는 오류")}</div>`;
        return;
      }
      contactsState.items = contactsState.items.concat(data.list);
      contactsState.total = data.total;
      contactsState.offset = contactsState.items.length;
      renderContactList();
    })
    .catch((err) => {
      if (myRequestId !== contactsRequestSeq) return;
      listEl.innerHTML = `<div class="contacts-empty">불러오기 실패: ${escapeHtml(String(err))}</div>`;
    });
}

function renderContactList() {
  const listEl = document.getElementById("contacts-list");
  const countEl = document.getElementById("contacts-count");
  const list = contactsState.items;

  if (!list || list.length === 0) {
    countEl.textContent = "";
    listEl.innerHTML = `<div class="contacts-empty">
      ${contactsState.query ? "검색 결과가 없어요. 새로 등록해보세요." : "등록된 연락처가 없어요."}
    </div>`;
    return;
  }

  countEl.textContent = `${list.length.toLocaleString()} / ${contactsState.total.toLocaleString()}건`;

  const rowsHtml = list.map((item) => {
    const hasNote = item.note && item.note.trim();
    return `
      <div class="contacts-row ${hasNote ? "contacts-row-warning" : ""}" data-id="${escapeHtml(item.id)}">
        <div class="contacts-col-eng">${escapeHtml(item.eng)}</div>
        <div class="contacts-col-kor">${escapeHtml(item.kor || "-")}</div>
        <div class="contacts-col-email">${escapeHtml(item.email)}</div>
        ${hasNote ? `<div class="contacts-col-note">⚠️ ${escapeHtml(item.note)}</div>` : ""}
        <button class="contacts-edit-btn" type="button" data-id="${escapeHtml(item.id)}">수정</button>
      </div>
    `;
  }).join("");

  const hasMore = list.length < contactsState.total;
  const moreHtml = hasMore
    ? `<button id="contacts-load-more" type="button" class="contacts-load-more-btn">더 보기 (${(contactsState.total - list.length).toLocaleString()}건 남음)</button>`
    : "";

  listEl.innerHTML = `<div class="contacts-table">${rowsHtml}</div>${moreHtml}`;

  listEl.querySelectorAll(".contacts-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = list.find((x) => String(x.id) === String(btn.dataset.id));
      if (item) renderContactForm(item);
    });
  });

  const loadMoreBtn = document.getElementById("contacts-load-more");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      loadMoreBtn.textContent = "불러오는 중...";
      loadMoreBtn.disabled = true;
      fetchContacts(contactsState.query, false);
    });
  }
}

function renderContactForm(item) {
  const isEdit = !!item;
  const formEl = document.getElementById("contacts-add-form");
  formEl.style.display = "block";
  formEl.innerHTML = `
    <div class="contacts-form-title">${isEdit ? "거래처 수정" : "새 거래처 등록"}</div>
    <input id="cf-eng" type="text" placeholder="영문상호 (필수)" value="${escapeHtml(item ? item.eng : "")}" />
    <input id="cf-kor" type="text" placeholder="한글상호" value="${escapeHtml(item ? item.kor : "")}" />
    <input id="cf-email" type="text" placeholder="이메일 (필수)" value="${escapeHtml(item ? item.email : "")}" />
    <input id="cf-manager" type="text" placeholder="담당자" value="${escapeHtml(item ? item.manager : "")}" />
    <input id="cf-note" type="text" placeholder="⚠️ 비고 (특이사항 있을 때만)" value="${escapeHtml(item ? item.note : "")}" />
    <div class="contacts-form-actions">
      <button id="cf-save" type="button">${isEdit ? "수정 저장" : "등록"}</button>
      <button id="cf-cancel" type="button">취소</button>
    </div>
    <div id="cf-status"></div>
  `;

  document.getElementById("cf-cancel").addEventListener("click", () => {
    formEl.style.display = "none";
    formEl.innerHTML = "";
  });

  document.getElementById("cf-save").addEventListener("click", () => {
    const payload = {
      action: isEdit ? "update" : "add",
      id: isEdit ? item.id : undefined,
      eng: document.getElementById("cf-eng").value.trim(),
      kor: document.getElementById("cf-kor").value.trim(),
      email: document.getElementById("cf-email").value.trim(),
      manager: document.getElementById("cf-manager").value.trim(),
      note: document.getElementById("cf-note").value.trim(),
    };

    if (!payload.eng || !payload.email) {
      document.getElementById("cf-status").textContent = "영문상호와 이메일은 필수예요.";
      return;
    }

    document.getElementById("cf-save").disabled = true;
    document.getElementById("cf-status").textContent = "저장 중...";

    fetch(CONTACT_SHEET_API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          document.getElementById("cf-status").textContent = "오류: " + data.error;
          document.getElementById("cf-save").disabled = false;
          return;
        }
        formEl.style.display = "none";
        formEl.innerHTML = "";
        fetchContacts(contactsState.query, true);
      })
      .catch((err) => {
        document.getElementById("cf-status").textContent = "저장 실패: " + err;
        document.getElementById("cf-save").disabled = false;
      });
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

// 연락처 탭이 클릭되어 화면에 나타날 때 초기화 (기존 탭 전환 로직에 맞춰 호출 위치 조정 필요)
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("an-contacts-tab")) {
    initContactsTab();
  }
});
