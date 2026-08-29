#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_terminals.py가 만들어둔 terminal_data.json을 읽어서, Firestore의 port_schedule
컬렉션에 반영하는 스크립트예요.

⚠️⚠️⚠️ 2026-08-27 설계 수정 (2차) ⚠️⚠️⚠️
실제 운영 방식:
  - port_schedule 컬렉션 = "이번 달에 실제로 관리하기로 확정한 배 목록" (노션에 그대로 나가는 최종본)
  - 이 목록은 매달 말에 사람이 직접 터미널 사이트에서 골라서 만들어두는 것
  - 자동화가 할 일은 딱 하나: 이미 이 목록에 있는 배의 입항일/출항일이 바뀌었으면 갱신하는 것

  - ⚠️ 매칭 기준은 "선박코드+항차+터미널"이 아니라 "선명(vesselName)"이에요.
    회사에서 raw에 적어두는 "코드"·"항차"는 터미널이 매번 새로 붙이는 임시 항차번호라
    조회할 때마다 달라지고(예: 어떤 조회에선 코드 YVE/항차 11E, 다른 조회에선 코드
    MKUE/항차 GE633E), 터미널마다 표기 방식도 다 달라요. 유일하게 안정적인 건 선명뿐이라,
    "선명이 같으면 같은 배"로 보고 매칭해요.

이 스크립트는 절대로:
  - 새 배를 추가하지 않아요 (raw에 없는 선명은 터미널에서 나왔어도 그냥 무시)
  - 배를 삭제하지 않아요
  - vesselName/vesselCode/voyage/terminal/line 같은 "정체성" 필드를 건드리지 않아요

오직 이미 존재하는 문서(선명으로 매칭)를 찾아서, arrivalDate/departureDate 두 필드만
갱신해요. 그리고 이번에 뭐가 바뀌었는지 별도 "오늘 갱신 내역" 문서에도 남겨서, 가이드
페이지에서 팀원들이 볼 수 있게 해요.
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


def normalize_name(name):
    """선명 비교용 - 앞뒤 공백 지우고 대문자로 통일 (터미널마다 대소문자/공백이 다를 수 있어서)."""
    return re.sub(r"\s+", " ", str(name or "").strip()).upper()


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

    # ⚠️⚠️⚠️ 2026-08-29 추가 수정 ⚠️⚠️⚠️
    # 선명만으로 매칭하다 보니, raw에 남아있는 "작년/지난달 같은 배의 예전 항차 기록"까지
    # 걸려서 오늘 날짜로 덮어써버리는 사고가 있었어요 (예: Msc Juliette 2025-07-11 →
    # 2026-08-28로 잘못 갱신됨). 입항 캘린더가 "오늘 기준 2주치"만 관리하는 거니까,
    # 갱신 대상도 딱 그 범위 근처(여유 있게 오늘 기준 앞뒤 14일)에 있는 항차로만 한정해야 해요.
    # 그 범위를 벗어난 낡은 기록은 애초에 매칭 후보에도 안 넣어서, 다시는 안 건드리게 함.
    today = datetime.date.today()
    window_start = (today - datetime.timedelta(days=14)).isoformat()
    window_end = (today + datetime.timedelta(days=14)).isoformat()

    def in_active_window(arrival_date):
        if not arrival_date:
            return False  # 입항일 자체가 비어있으면 "최근 항차인지" 판단이 안 되니 안전하게 제외
        return window_start <= arrival_date <= window_end

    # raw 전체를 한 번 읽어서, 선명(정규화한 값) 기준으로 딕셔너리를 만들어둠.
    #    문서 ID로 바로 찾을 수가 없어서(코드/항차가 raw 저장 시점과 터미널 조회 시점에
    #    서로 다르게 나올 수 있어서) 어쩔 수 없이 전체를 한 번 읽어야 해요. raw 자체가
    #    "이번 달 확정 목록"이라 몇백 건 수준일 거라 이 정도는 Firestore 읽기 비용 부담이
    #    크지 않아요.
    raw_docs = list(collection.stream())
    raw_by_name = {}
    skipped_old_record = 0
    for doc in raw_docs:
        d = doc.to_dict() or {}
        key = normalize_name(d.get("vesselName"))
        if not key:
            continue
        if not in_active_window(d.get("arrivalDate")):
            # 오늘 기준 ±14일 범위 밖의 낡은 기록은 매칭 후보에서 아예 제외 (다시는 안 건드림)
            skipped_old_record += 1
            continue
        raw_by_name.setdefault(key, []).append((doc.reference, d))

    log(
        f"raw에 등록된 배: {len(raw_docs)}건 / 그중 최근 항차(±14일) {len(raw_docs) - skipped_old_record}건, "
        f"낡은 기록이라 제외 {skipped_old_record}건 (선명 기준 {len(raw_by_name)}종)"
    )

    # 터미널에서 받아온 항목도 선명 기준으로 정리 (같은 배가 여러 터미널 결과에 겹칠 수 있어서 마지막 것으로 덮어씀)
    fetched_by_name = {}
    for terminal_name, entries in results.items():
        for entry in entries:
            vessel_name = (entry.get("vesselName") or "").strip()
            if not vessel_name:
                continue
            key = normalize_name(vessel_name)
            fetched_by_name[key] = entry

    log(f"터미널에서 받아온 배: {len(fetched_by_name)}종 (이 중 raw에 이미 있는 선명만 갱신 대상)")

    updated = 0
    skipped_not_in_raw = 0
    skipped_ambiguous = 0  # 같은 선명이 raw에 여러 건이면(예: 같은 배가 다른 항차로 두 번) 자동 판단 안 함
    unchanged = 0
    changes_for_today = []  # "오늘 갱신 내역"에 남길 목록

    batch = db.batch()
    batch_count = 0

    for name_key, entry in fetched_by_name.items():
        matches = raw_by_name.get(name_key)
        if not matches:
            # ⚠️ 핵심 - raw에 없는 선명은 절대 새로 만들지 않고 그냥 건너뜀
            skipped_not_in_raw += 1
            continue

        if len(matches) > 1:
            # 같은 선명이 raw에 여러 건 있으면(같은 배가 이번 달에 두 번 입항 등) 자동으로
            # 어느 쪽 날짜를 갱신해야 할지 확신할 수 없어서 건너뜀 - 사람이 직접 확인해야 함
            skipped_ambiguous += 1
            continue

        doc_ref, existing_data = matches[0]
        new_arrival = entry.get("arrivalDate") or ""
        new_departure = entry.get("departureDate") or ""
        old_arrival = existing_data.get("arrivalDate") or ""
        old_departure = existing_data.get("departureDate") or ""

        if old_arrival == new_arrival and old_departure == new_departure:
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

        change_record = {
            "vesselName": existing_data.get("vesselName", ""),
            "terminal": existing_data.get("terminal", ""),
            "oldArrivalDate": old_arrival,
            "newArrivalDate": new_arrival or old_arrival,
            "oldDepartureDate": old_departure,
            "newDepartureDate": new_departure or old_departure,
        }
        changes_for_today.append(change_record)

        if dry_run:
            log(
                f"  [미리보기] {existing_data.get('vesselName')}: "
                f"입항 {old_arrival} → {new_arrival or '(변경없음)'}, "
                f"출항 {old_departure} → {new_departure or '(변경없음)'}"
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
        f"raw에 없어서 건너뜀(신규 추가 안 함) {skipped_not_in_raw}건 / "
        f"같은 선명이 raw에 여러 건이라 건너뜀 {skipped_ambiguous}건"
    )

    # "오늘 자동 갱신 내역"을 별도 문서(port_schedule_updates/latest)에 저장 -
    # 가이드 페이지가 이 문서 하나만 보고 배너로 보여줄 수 있게 함
    if not dry_run:
        summary_ref = db.collection("port_schedule_updates").document("latest")
        summary_ref.set({
            "ranAt": firestore.SERVER_TIMESTAMP,
            "ranAtIso": datetime.datetime.now().isoformat(),
            "totalUpdated": updated,
            "changes": changes_for_today,
        })
        log(f"'오늘 자동 갱신 내역' 기록 완료 (port_schedule_updates/latest, {len(changes_for_today)}건)")
    else:
        log("⚠️ --dry-run 모드라 실제로는 아무것도 안 바뀌었고, 갱신 내역도 기록 안 됨.")


if __name__ == "__main__":
    main()
