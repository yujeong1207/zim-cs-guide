/**
 * ===============================================
 * 📋 업무 절차(수출·수입 CS 매뉴얼) - 팀 DB(Firestore) 연동
 * ===============================================
 * guide_mail_templates_firestore.js 와 같은 이유·비슷한 구조예요.
 *
 * 예전에는 관리 화면에서 고친 업무 절차가 "고친 사람의 브라우저"(localStorage)에만 저장돼서
 * 다른 팀원 화면에는 반영되지 않았어요. 이제는 팀 DB에 저장해서, 누가 고쳐도 모두에게 바로 반영돼요.
 *
 * ===== 안전장치: 처음 한 번 "올리기"를 누르기 전까지는 예전 방식 그대로 =====
 * 팀 DB에 업무 절차가 일부만 올라간 상태로 모두의 화면이 바뀌면 안 되니까,
 * 관리 화면의 "⬆️ 이 컴퓨터의 업무 절차를 팀 DB로 올리기"를 눌러서 전체가 한꺼번에 올라갔을 때만
 * (표시용 문서 _meta 가 생겼을 때만) 팀 DB 방식으로 바뀌어요.
 *
 * ===== 데이터 구조 =====
 * Firestore 컬렉션: "procedures"
 *   · 절차 1개 = 문서 1개 { order, title, category, subItems[...], updatedAt, ... } (문서 ID = 절차 id)
 *   · _meta 문서 = "팀 DB로 옮겨졌다"는 표시 { seeded:true, seededAtIso, count }
 * 문서 1개는 최대 1MB라서, 첨부파일(이미지 등)이 너무 큰 절차는 올릴 수 없어요 (안내 메시지가 나와요).
 */
const PROCEDURES_COLLECTION = "procedures";
const PROCEDURES_META_ID = "_meta";
const PROCEDURES_MAX_BYTES = 900000;                       // Firestore 문서 한계(1MB)보다 조금 작게
const PROCEDURES_BACKUP_KEY = "procedures_before_team_db_v1"; // 팀 DB로 바뀌기 전, 이 브라우저에 있던 내용 (실수 대비 백업)

let PROCEDURES_DB_ACTIVE = false;     // true면 업무 절차가 팀 DB 기준으로 동작
let PROCEDURES_DB_ERROR = "";         // 팀 DB에 연결하지 못했을 때 이유
let PROCEDURES_DB_SEEDED_AT = "";
let proceduresUnsubscribe = null;

function proceduresSizeOf(obj) {
  const json = JSON.stringify(obj);
  return typeof Blob !== "undefined" ? new Blob([json]).size : json.length * 3;
}

function proceduresBackupExists() {
  try { return !!localStorage.getItem(PROCEDURES_BACKUP_KEY); } catch (e) { return false; }
}

/* 앱 시작 시 한 번 호출 → 이후 어떤 탭에 있든 업무 절차를 최신 상태로 유지해요 */
function initProceduresFirestoreSync() {
  if (!window.fbDb) { console.warn("Firestore가 아직 준비되지 않아 업무 절차는 이 브라우저 저장본으로 보여요."); return; }
  if (proceduresUnsubscribe) return; // 중복 구독 방지

  proceduresUnsubscribe = window.fbDb.collection(PROCEDURES_COLLECTION).onSnapshot(
    (snapshot) => {
      PROCEDURES_DB_ERROR = "";
      const meta = snapshot.docs.find((d) => d.id === PROCEDURES_META_ID);
      const wasActive = PROCEDURES_DB_ACTIVE;

      if (!meta) {
        // 아직 팀 DB로 옮기지 않은 상태 → 예전처럼 이 브라우저 저장본 그대로 사용
        PROCEDURES_DB_ACTIVE = false;
        proceduresAfterChange();
        return;
      }

      // 팀 DB로 바뀌기 직전에, 이 브라우저에 있던 내용을 한 번만 백업해둬요 (다른 사람이 먼저 올려서 내용이 바뀌는 실수 대비)
      if (!wasActive) {
        try {
          if (!localStorage.getItem(PROCEDURES_BACKUP_KEY)) {
            localStorage.setItem(PROCEDURES_BACKUP_KEY, JSON.stringify({ savedAtIso: new Date().toISOString(), procedures: PROCEDURES }));
          }
        } catch (e) { /* 저장 공간이 부족하면 백업만 건너뛰어요 */ }
      }

      const list = snapshot.docs
        .filter((d) => d.id !== PROCEDURES_META_ID)
        .map((d) => Object.assign({ id: d.id }, d.data()))
        .sort((a, b) => (typeof a.order === "number" ? a.order : 9999) - (typeof b.order === "number" ? b.order : 9999) || String(a.title || "").localeCompare(String(b.title || ""), "ko"));
      PROCEDURES = normalizeProcedures(list);
      PROCEDURES_DB_ACTIVE = true;
      PROCEDURES_DB_SEEDED_AT = (meta.data() || {}).seededAtIso || "";
      proceduresAfterChange();
    },
    (err) => {
      console.error("업무 절차(Firestore) 실시간 동기화 실패:", err);
      PROCEDURES_DB_ACTIVE = false;
      PROCEDURES_DB_ERROR = (err && err.code === "permission-denied") ? "권한이 없어요 (Firestore 규칙에 procedures 컬렉션이 추가됐는지 확인해 주세요)" : String((err && err.message) || err);
      if (typeof adminSection !== "undefined" && adminSection === "procedures" && typeof renderAdminList === "function") renderAdminList();
    }
  );
}

/* 목록이 바뀌었을 때 화면을 다시 그려요 */
function proceduresAfterChange() {
  try { if (typeof saveData === "function") saveData(); } catch (e) { /* 저장 공간 부족 등은 무시 (팀 DB가 진짜 저장소) */ }
  if (typeof adminSection !== "undefined" && adminSection === "procedures" && typeof renderAdminList === "function") renderAdminList();
  if (typeof refreshCurrentTab === "function") refreshCurrentTab();
}

/* 절차 1개 저장 (관리 화면 "저장"). 새 절차면 id를 만들어 줘요. 저장한 id를 돌려줘요 */
async function saveProcedureToFirestore(item) {
  const data = JSON.parse(JSON.stringify(item));
  const id = data.id || genId("proc");
  delete data.id;
  data.updatedAt = todayStr();
  const size = proceduresSizeOf(data);
  if (size > PROCEDURES_MAX_BYTES) {
    throw new Error("이 절차는 용량이 " + (size / 1024 / 1024).toFixed(1) + "MB라서 팀 DB(한 절차 최대 약 0.9MB)에 저장할 수 없어요. 첨부파일(이미지 등)을 줄이거나, 큰 파일은 SharePoint에 두고 링크로 바꿔 주세요.");
  }
  const existing = PROCEDURES.find((p) => p.id === id);
  if (existing && typeof existing.order === "number") data.order = existing.order;
  else data.order = PROCEDURES.reduce((max, p) => Math.max(max, typeof p.order === "number" ? p.order : 0), -1) + 1;
  await window.fbDb.collection(PROCEDURES_COLLECTION).doc(id).set(data);
  return id;
}

async function deleteProcedureFromFirestore(id) {
  await window.fbDb.collection(PROCEDURES_COLLECTION).doc(id).delete();
}

/* 전체를 통째로 팀 DB에 올리기 (처음 "올리기" / 가져오기에서 사용)
   - 너무 큰 절차가 하나라도 있으면 아무것도 올리지 않고 멈춰요 (일부만 올라가는 일이 없게)
   - 새 내용을 먼저 다 쓰고 → 빠진 것만 지우고 → 마지막에 _meta 를 써요 (다른 팀원 화면이 빈 목록으로 깜빡이지 않게) */
async function replaceAllProceduresInFirestore(list) {
  const col = window.fbDb.collection(PROCEDURES_COLLECTION);
  const prepared = (list || []).map((p, i) => {
    const data = JSON.parse(JSON.stringify(p));
    const id = data.id || genId("proc");
    delete data.id;
    data.order = i;
    if (!data.updatedAt) data.updatedAt = todayStr();
    return { id, data, size: proceduresSizeOf(data), title: data.title || id };
  });
  const tooBig = prepared.filter((x) => x.size > PROCEDURES_MAX_BYTES);
  if (tooBig.length) {
    throw new Error("용량이 큰 절차가 있어서 올리지 않았어요: " + tooBig.map((x) => '"' + x.title + '" (' + (x.size / 1024 / 1024).toFixed(1) + "MB)").join(", ")
      + ". 팀 DB는 한 절차가 약 0.9MB까지만 저장돼요. 첨부파일(이미지 등)을 줄이거나 SharePoint 링크로 바꾼 뒤 다시 올려 주세요.");
  }
  const batchSize = 400;
  for (let i = 0; i < prepared.length; i += batchSize) {
    const batch = window.fbDb.batch();
    prepared.slice(i, i + batchSize).forEach((x) => batch.set(col.doc(x.id), x.data));
    await batch.commit();
  }
  const keep = new Set(prepared.map((x) => x.id));
  keep.add(PROCEDURES_META_ID);
  const existing = await col.get();
  const extras = existing.docs.filter((d) => !keep.has(d.id));
  for (let i = 0; i < extras.length; i += batchSize) {
    const batch = window.fbDb.batch();
    extras.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await col.doc(PROCEDURES_META_ID).set({ seeded: true, seededAtIso: new Date().toISOString(), count: prepared.length });
}

/* 관리 화면의 "⬆️ 올리기" 버튼 */
async function seedProceduresToTeamDb() {
  const n = PROCEDURES.length;
  if (!confirm("이 컴퓨터(브라우저)에 있는 업무 절차 " + n + "개를 팀 DB로 올릴까요?\n\n"
    + "· 올리면 이 내용이 팀 모두의 기준이 돼요. 다른 팀원 화면의 업무 절차도 이 내용으로 바뀌어요.\n"
    + "· 올린 뒤에는 누가 고쳐도 모두에게 바로 반영돼요.\n\n"
    + "고쳐둔 내용이 있는 컴퓨터가 맞는지 확인하셨나요? (올리기 전에 '🧩 선택 내보내기'로 업무 절차를 백업해 두면 안전해요)")) return;
  try {
    await replaceAllProceduresInFirestore(PROCEDURES);
    alert("✅ 업무 절차 " + n + "개를 팀 DB로 올렸어요. 이제부터 누가 고쳐도 모두에게 바로 반영돼요.");
  } catch (err) {
    console.error("업무 절차 올리기 실패:", err);
    alert("올리기에 실패했어요: " + (err && err.message ? err.message : err));
  }
}

/* 팀 DB로 바뀌기 전에 이 브라우저에 있던 내용을 파일로 받기 (선택 가져오기 → 업무 절차로 되돌릴 수 있는 형식) */
function downloadProceduresBackup() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(PROCEDURES_BACKUP_KEY) || "null"); } catch (e) { /* 무시 */ }
  if (!raw || !Array.isArray(raw.procedures)) { alert("이 컴퓨터에 남아 있는 예전 내용이 없어요."); return; }
  const blob = new Blob([JSON.stringify({ procedures: raw.procedures }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cs_guide_procedures_before_team_db.json";
  a.click();
  URL.revokeObjectURL(url);
}

/* 관리 화면 > 업무 절차 맨 위에 보여주는 안내 상자 */
function renderProceduresDbBox(body) {
  const box = document.createElement("div");
  box.className = "proc-db-box";
  box.style.cssText = "margin:10px 0;padding:12px 14px;border-radius:10px;border:1px solid " + (PROCEDURES_DB_ACTIVE ? "#86efac" : "#fcd34d") + ";background:" + (PROCEDURES_DB_ACTIVE ? "#f0fdf4" : "#fffbeb") + ";font-size:13.5px;line-height:1.6;";
  const esc = typeof escapeHtml === "function" ? escapeHtml : (s) => String(s);
  if (PROCEDURES_DB_ACTIVE) {
    const when = PROCEDURES_DB_SEEDED_AT ? " (올린 날: " + esc(PROCEDURES_DB_SEEDED_AT.slice(0, 10)) + ")" : "";
    box.innerHTML = "<b>✅ 업무 절차는 팀 DB에 저장돼요</b> — 누가 고쳐도 모두에게 바로 반영돼요 (" + PROCEDURES.length + "개)" + when
      + "<br><span style=\"color:#4b5563;\">절차를 삭제하면 팀 모두에게서 사라져요. 실수로 지웠을 때를 대비해 가끔 '🧩 선택 내보내기'로 백업해 두세요.</span>";
    if (proceduresBackupExists()) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn secondary-btn";
      b.style.marginTop = "8px";
      b.textContent = "📦 팀 DB로 바뀌기 전, 이 컴퓨터에 있던 내용 파일로 받기";
      b.onclick = downloadProceduresBackup;
      const wrap = document.createElement("div");
      wrap.appendChild(b);
      box.appendChild(wrap);
    }
  } else {
    box.innerHTML = "<b>⚠️ 업무 절차는 아직 이 브라우저에만 저장돼요</b> — 여기서 고쳐도 다른 팀원 화면에는 안 보여요."
      + (PROCEDURES_DB_ERROR ? "<br><span style=\"color:#b91c1c;\">팀 DB에 연결하지 못했어요: " + esc(PROCEDURES_DB_ERROR) + "</span>" : "")
      + "<br><span style=\"color:#4b5563;\">고쳐둔 내용이 있는 컴퓨터에서 아래 버튼을 한 번 누르면, 지금 이 컴퓨터의 업무 절차 " + PROCEDURES.length + "개가 팀 기준이 되고 그 뒤로는 누가 고쳐도 모두에게 바로 반영돼요. 올리기 전에 '🧩 선택 내보내기'로 업무 절차만 백업해 두면 안전해요.</span>";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn generate-btn";
    b.style.marginTop = "8px";
    b.textContent = "⬆️ 이 컴퓨터의 업무 절차를 팀 DB로 올리기 (처음 한 번)";
    b.onclick = seedProceduresToTeamDb;
    const wrap = document.createElement("div");
    wrap.appendChild(b);
    box.appendChild(wrap);
  }
  body.appendChild(box);
}
