#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_terminals.py가 만들어둔 terminal_data.json을 읽어서, Firestore의 port_schedule
컬렉션에 반영하는 스크립트예요.

⚠️⚠️⚠️ 2026-08-27 설계 수정 ⚠️⚠️⚠️
처음 버전은 "터미널에서 받아온 배는 다 Firestore에 올린다"는 방식이었는데, 이게 완전히
잘못된 설계였어요. 실제 운영 방식은 이래요:

  - port_schedule 컬렉션 = "이번 달에 실제로 관리하기로 확정한 배 목록" (노션에 그대로 나가는 최종본)
  - 이 목록은 매달 말에 사람이 직접 터미널 사이트에서 골라서 만들어두는 것
  - 중간에 배가 추가/제외되는 것도 사람이 직접 결정해서 처리
  - 자동화가 할 일은 딱 하나: "이미 이 목록에 있는 배"의 입항일/출항일이 바뀌었으면
    그것만 최신으로 갱신하는 것 (그 이상도 이하도 아님)

그래서 이 스크립트는 절대로:
  - 새 배를 추가하지 않아요 (raw에 없는 배는 터미널에서 나왔어도 그냥 무시)
  - 배를 삭제하지 않아요
  - vesselName/vesselCode/voyage/terminal/line 같은 "정체성" 필드를 건드리지 않아요
    (이것도 사람이 정한 값이니까요)

오직 이미 존재하는 문서를 찾아서, arrivalDate/departureDate 두 필드만 갱신해요.
매칭은 "선박코드 + 항차 + 터미널"이 정확히 같은 문서를 찾는 방식이고 (기존 문서 ID
규칙과 동일), 못 찾으면 그냥 건너뛰어요 (터미널 스케줄에서 사라졌거나 아직 안 나온 것일
수 있어서 - 이것도 사람이 확인할 일이지 자동화가 판단할 일이 아니에요).
"""

import os
import re
import json
import sys
import datetime

import firebase_admin
from firebase_admin import credentials, firestore


def log(msg):
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def make_doc_id(vessel_code, voyage, terminal):
    """guide_desks_portschedule.js의 portScheduleDocId()와 동일한 규칙."""
    def clean(s):
        return re.sub(r"[^A-Za-z0-9]", "_", str(s or "").strip().upper())

    safe_code = clean(vessel_code) or "CODE"
    safe_voyage = clean(voyage) or "VOY"
    safe_terminal = clean(terminal) or "TERM"
    return f"{safe_code}__{safe_voyage}__{safe_terminal}"


def init_firestore():
    key_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if not key_json:
        raise RuntimeError(
            "환경변수 FIREBASE_SERVICE_ACCOUNT_KEY가 없어요. "
            "GitHub 저장소 Settings → Secrets and variables → Actions 에서 등록해주세요."
        )
    key_dict = json.loads(key_json)
    cred = credentials.Certificate(key_dict)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def main():
    dry_run = "--dry-run" in sys.argv  # 미리보기만 하고 싶을 때 사용

    if not os.path.exists("terminal_data.json"):
        log("terminal_data.json이 없어요. fetch_terminals.py를 먼저 실행해야 해요.")
        sys.exit(1)

    with open("terminal_data.json", encoding="utf-8") as f:
        data = json.load(f)

    results = data.get("results", {})
    total_entries = sum(len(v) for v in results.values())
    if total_entries == 0:
        log("반영할 데이터가 0건이에요 (모든 터미널이 실패했거나 빈 응답). 종료해요.")
        sys.exit(1)

    db = init_firestore()
    collection = db.collection("port_schedule")

    # 이번에 터미널에서 받아온 항목들을 doc_id 기준으로 정리
    fetched_by_doc_id = {}
    for terminal_name, entries in results.items():
        for entry in entries:
            vessel_name = (entry.get("vesselName") or "").strip()
            if not vessel_name:
                continue
            doc_id = make_doc_id(entry.get("vesselCode"), entry.get("voyage"), entry.get("terminal") or terminal_name)
            fetched_by_doc_id[doc_id] = entry

    log(f"터미널에서 받아온 항목: {len(fetched_by_doc_id)}건 (이 중 이미 raw에 등록된 것만 갱신 대상)")

    updated = 0
    skipped_not_in_raw = 0
    unchanged = 0
    batch = db.batch()
    batch_count = 0

    for doc_id, entry in fetched_by_doc_id.items():
        doc_ref = collection.document(doc_id)
        existing = doc_ref.get()

        if not existing.exists:
            # ⚠️ 핵심 - raw에 없는 배는 절대 새로 만들지 않고 그냥 건너뜀
            skipped_not_in_raw += 1
            continue

        existing_data = existing.to_dict() or {}
        new_arrival = entry.get("arrivalDate") or ""
        new_departure = entry.get("departureDate") or ""

        # 날짜가 실제로 달라졌을 때만 갱신 (같으면 굳이 쓰기 요청을 안 보내서 Firestore 쓰기 비용도 아낌)
        if existing_data.get("arrivalDate") == new_arrival and existing_data.get("departureDate") == new_departure:
            unchanged += 1
            continue

        fields = {
            "updatedAt": firestore.SERVER_TIMESTAMP,
            "updatedBy": "auto_fetch",
        }
        if new_arrival:
            fields["arrivalDate"] = new_arrival
        if new_departure:
            fields["departureDate"] = new_departure

        if dry_run:
            log(
                f"  [미리보기] {existing_data.get('vesselName')} ({doc_id}): "
                f"입항 {existing_data.get('arrivalDate')} → {new_arrival or '(변경없음)'}, "
                f"출항 {existing_data.get('departureDate')} → {new_departure or '(변경없음)'}"
            )
        else:
            batch.update(doc_ref, fields)
            batch_count += 1

        updated += 1

        if batch_count >= 400:
            batch.commit()
            log(f"  ...{updated}건 커밋 진행중")
            batch = db.batch()
            batch_count = 0

    if not dry_run and batch_count > 0:
        batch.commit()

    log(
        f"✅ 완료: 날짜 갱신 {updated}건 / 변경사항 없음 {unchanged}건 / "
        f"raw에 없어서 건너뜀(신규 추가 안 함) {skipped_not_in_raw}건"
    )
    if dry_run:
        log("⚠️ --dry-run 모드라 실제로는 아무것도 안 바뀌었어요. 실제 반영하려면 --dry-run 없이 실행하세요.")


if __name__ == "__main__":
    main()
