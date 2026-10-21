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

  - ⚠️ 매칭 기준은 "선박코드+항차"가 아니라 "선명(vesselName)"이에요.
    회사에서 raw에 적어두는 "코드"·"항차"는 터미널이 매번 새로 붙이는 임시 항차번호라
    조회할 때마다 달라지고(예: 어떤 조회에선 코드 YVE/항차 11E, 다른 조회에선 코드
    MKUE/항차 GE633E), 터미널마다 표기 방식도 다 달라요. 유일하게 안정적인 건 선명뿐이라,
    "선명이 같으면 같은 배"로 보고 매칭해요.

  - ⚠️⚠️⚠️ 2026-09-15 추가 수정 ⚠️⚠️⚠️
    선명만으로 매칭하면 문제가 하나 더 있어요 — AS CASPRIA처럼 같은 배가 부산(BPT)이랑
    인천(HJIT)을 둘 다 콜링하는 경우, raw에는 같은 선명으로 된 문서가 2건(터미널만 다름)
    있게 돼요. 그러면 "같은 선명이 raw에 여러 건"이라는 안전장치에 걸려서 둘 다 통째로
    건너뛰어져 버려요 (BPT/한진인천 배들이 자동 갱신이 안 된다고 느껴졌던 원인). 그래서
    최종 매칭은 "선명 + 터미널" 조합으로 해요 — 선명이 같아도 터미널까지 같아야 같은
    문서로 보고, 선명은 같은데 터미널이 다르면 각자 따로 갱신해요.

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


def minus_days(date_str, days):
    """'YYYY-MM-DD'에서 days일 전 날짜를 'YYYY-MM-DD'로. 형식이 이상하면 빈 문자열.
    (가이드 페이지의 subtractDaysFromDateStr 와 같은 규칙: AN 발송 예정일 = 입항일 - 2일)"""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(date_str or ""))
    if not m:
        return ""
    d = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return (d - datetime.timedelta(days=days)).isoformat()


def decide_an_send_date(old_an, old_arrival, new_arrival):
    """입항일이 바뀌었을 때 AN 발송 예정일을 어떻게 할지 정해요.
    돌려주는 값: (새 AN 발송 예정일 또는 None, 사람이 직접 정한 값이라 그대로 뒀는지)

    - 입항일이 안 바뀌었으면 건드리지 않아요 (None)
    - 지금 AN 발송 예정일이 비어 있거나, '예전 입항일 - 2일'이라서 자동으로 채워진 값이면
      → 새 입항일 - 2일로 같이 바꿔요
    - 그 외(사람이 일부러 다른 날짜로 적어둔 값)는 덮어쓰지 않고 그대로 둬요
    """
    if not new_arrival or new_arrival == old_arrival:
        return None, False
    auto_value = minus_days(new_arrival, 2)
    if not auto_value:
        return None, False
    if not old_an or old_an == minus_days(old_arrival, 2):
        return auto_value, False
    return None, True


def decide_date(fetched, current, manual, last_auto):
    """입항일/출항일 하나를 어떻게 할지 정해요. (터미널이 준 값 fetched, 지금 저장된 값 current,
    사람이 직접 고친 값인지 manual, 터미널이 지난번에 준 값 last_auto)

    돌려주는 dict (없는 키는 '건드리지 않음'):
      value  : 새로 저장할 날짜
      auto   : "터미널이 마지막으로 준 값"으로 기록할 값
      manual : 직접 고침 표시를 바꿀 때만 (True/False)
      note   : 'followed'(직접 고친 값을 터미널의 새 값으로 바꿈) | 'kept'(직접 고친 값 유지)

    ⚠️ 기준은 "내가 고친 값과 터미널 값이 같은지"가 아니라 "터미널이 지난번과 다른 값을 줬는지"예요.
       배가 당겨졌다 늦춰졌다 해도 터미널이 값을 바꿀 때마다 그걸 따라가고,
       터미널이 같은 값(틀린 값)을 계속 줄 때만 직접 고친 값을 지켜요.
    """
    res = {}
    if not fetched:
        return res  # 터미널이 이번에 값을 안 줬으면 아무것도 안 함
    if fetched != last_auto:
        res["auto"] = fetched
    if not manual:
        if fetched != current:
            res["value"] = fetched
        return res
    # 사람이 직접 고쳐둔 값
    terminal_moved = bool(last_auto) and fetched != last_auto
    if terminal_moved:
        if fetched != current:
            res["value"] = fetched
        res["manual"] = False
        res["note"] = "followed"
    elif fetched == current:
        res["manual"] = False  # 터미널도 같은 값이 됐으니 직접 고침 표시는 필요 없어요
    else:
        res["note"] = "kept"
    return res


def normalize_name(name):
    """선명 비교용 - 앞뒤 공백 지우고 대문자로 통일 (터미널마다 대소문자/공백이 다를 수 있어서)."""
    return re.sub(r"\s+", " ", str(name or "").strip()).upper()


# raw에 예전 방식(예: "한진인천", "한진(인천)")으로 저장된 낡은 기록도 최신 코드("HJIT")와
# 같은 터미널로 인식되도록 해두는 별칭표예요. 새로 들어오는 값은 이미 통일된 코드라
# 대부분 안 거쳐도 되지만, raw 쪽 과거 데이터를 위한 안전장치예요.
_TERMINAL_ALIASES = {
    "한진인천": "HJIT",
    "한진(인천)": "HJIT",
    "인천": "HJIT",
}


def normalize_terminal(terminal):
    """터미널 비교용 - 공백 지우고 대문자로 통일, 옛날 표기는 별칭표로 최신 코드로 맞춤."""
    t = re.sub(r"\s+", "", str(terminal or "")).upper()
    # raw에는 "BPT감만", "BPT신선대"처럼 부두 이름을 붙여 적은 것도 있는데, 터미널 사이트(BPT)에서는
    # 신선대/감만이 한 표에 같이 나와요. 그래서 BPT로 시작하면 모두 같은 "BPT"로 봐요.
    # (안 그러면 "BPT감만"으로 적힌 배는 자동 갱신 대상에서 통째로 빠져요)
    if t.startswith("BPT"):
        return "BPT"
    return _TERMINAL_ALIASES.get(t, t)


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

    # 터미널에서 받아온 항목도 선명 기준으로 정리.
    # ⚠️ 2026-09-15 수정: 예전엔 같은 선명이 여러 터미널 결과에 겹치면 "마지막 것으로
    # 덮어씀"이었는데, 이러면 AS CASPRIA처럼 BPT/한진인천을 둘 다 콜링하는 배는 둘 중
    # 하나의 터미널 데이터가 통째로 사라져버려요. 그래서 이제 덮어쓰지 않고 리스트로
    # 다 모아뒀다가, 아래 매칭 단계에서 터미널까지 같이 봐서 하나씩 짝지어요.
    fetched_by_name = {}
    for terminal_name, entries in results.items():
        for entry in entries:
            vessel_name = (entry.get("vesselName") or "").strip()
            if not vessel_name:
                continue
            key = normalize_name(vessel_name)
            resolved_terminal = entry.get("terminal") or terminal_name
            fetched_by_name.setdefault(key, []).append((resolved_terminal, entry))

    fetched_entry_count = sum(len(v) for v in fetched_by_name.values())
    log(
        f"터미널에서 받아온 배: {len(fetched_by_name)}종 / {fetched_entry_count}건 "
        f"(이 중 raw에 이미 있는 선명+터미널만 갱신 대상)"
    )

    updated = 0
    skipped_not_in_raw = 0
    skipped_ambiguous = 0  # 같은 선명이 raw에 여러 건이면(예: 같은 배가 다른 항차로 두 번) 자동 판단 안 함
    unchanged = 0
    changes_for_today = []  # "오늘 갱신 내역"에 남길 목록
    kept_for_today = []     # 직접 고친 값이라 터미널 값으로 안 바꾼 것(터미널은 같은 값을 계속 줌)

    batch = db.batch()
    batch_count = 0

    for name_key, fetched_list in fetched_by_name.items():
        matches = raw_by_name.get(name_key)
        if not matches:
            # ⚠️ 핵심 - raw에 없는 선명은 절대 새로 만들지 않고 그냥 건너뜀
            skipped_not_in_raw += len(fetched_list)
            continue

        for resolved_terminal, entry in fetched_list:
            # ⚠️ 2026-09-15 수정 - 선명이 같은 raw 후보들 중에서, 터미널까지 같은 것만 골라냄.
            # 예전엔 "선명이 raw에 여러 건"이면 무조건 다 건너뛰었는데, AS CASPRIA처럼
            # BPT/한진인천을 둘 다 콜링하는 배는 이 방식이면 항상 둘 다 스킵되어버려서
            # 실제로는 안전장치가 아니라 "절대 갱신 안 되는 배"를 만드는 버그였음.
            entry_terminal = normalize_terminal(resolved_terminal)
            terminal_matches = [
                m for m in matches
                if normalize_terminal(m[1].get("terminal")) == entry_terminal
            ]

            if not terminal_matches:
                # 선명은 raw에 있지만, 이 터미널로 등록된 건 없음 (신규 콜링 등) - 새로 안 만들고 건너뜀
                skipped_not_in_raw += 1
                continue

            if len(terminal_matches) > 1:
                # 같은 선명 + 같은 터미널로 raw에 여러 건 있으면(같은 배가 같은 터미널을
                # 이번 달에 두 번 콜링 등) 자동으로 어느 쪽인지 확신할 수 없어서 건너뜀 -
                # 사람이 직접 확인해야 함
                skipped_ambiguous += 1
                continue

            doc_ref, existing_data = terminal_matches[0]
            new_arrival = entry.get("arrivalDate") or ""
            new_departure = entry.get("departureDate") or ""
            old_arrival = existing_data.get("arrivalDate") or ""
            old_departure = existing_data.get("departureDate") or ""
            old_an = existing_data.get("anSendDate") or ""

            arr = decide_date(new_arrival, old_arrival, bool(existing_data.get("arrivalManual")), existing_data.get("arrivalAuto") or "")
            dep = decide_date(new_departure, old_departure, bool(existing_data.get("departureManual")), existing_data.get("departureAuto") or "")

            # 터미널이 마지막으로 준 값 / 직접 고침 표시는 날짜가 안 바뀌어도 조용히 기록해 둬요
            # (다음에 터미널이 값을 "바꿨는지" 알아보려면 이 기록이 필요해요)
            quiet = {}
            for prefix, d in (("arrival", arr), ("departure", dep)):
                if "auto" in d:
                    quiet[prefix + "Auto"] = d["auto"]
                if "manual" in d:
                    quiet[prefix + "Manual"] = d["manual"]

            changed_arrival = arr.get("value")
            changed_departure = dep.get("value")

            # AN 발송 예정일(입항일 - 2일)도 입항일이 실제로 바뀌면 같이 맞춰요
            new_an, an_kept_manual = decide_an_send_date(old_an, old_arrival, changed_arrival or "")

            if not changed_arrival and not changed_departure and not arr.get("note") and not dep.get("note"):
                if quiet and not dry_run:
                    batch.update(doc_ref, quiet)
                    batch_count += 1
                unchanged += 1
                continue

            fields = dict(quiet)
            if changed_arrival or changed_departure:
                fields["updatedAt"] = firestore.SERVER_TIMESTAMP
                fields["updatedBy"] = "auto_fetch"
            if changed_arrival:
                fields["arrivalDate"] = changed_arrival
            if changed_departure:
                fields["departureDate"] = changed_departure
            if new_an:
                fields["anSendDate"] = new_an

            change_record = {
                "vesselName": existing_data.get("vesselName", ""),
                "terminal": existing_data.get("terminal", ""),
                "oldArrivalDate": old_arrival,
                "newArrivalDate": changed_arrival or old_arrival,
                "oldDepartureDate": old_departure,
                "newDepartureDate": changed_departure or old_departure,
                "oldAnSendDate": old_an,
                "newAnSendDate": new_an or old_an,
                "anKeptManual": an_kept_manual,  # 사람이 직접 정한 AN 발송 예정일이라 안 바꿨다는 표시
                # followed = 터미널이 일정을 바꿔서 직접 고친 값을 새 값으로 교체 / kept = 직접 고친 값 유지(터미널은 같은 값을 계속 줌)
                "arrivalNote": arr.get("note", ""),
                "departureNote": dep.get("note", ""),
                "terminalArrivalDate": new_arrival,
                "terminalDepartureDate": new_departure,
            }
            if changed_arrival or changed_departure or arr.get("note") == "followed" or dep.get("note") == "followed":
                changes_for_today.append(change_record)
            else:
                kept_for_today.append(change_record)

            if dry_run:
                log(
                    f"  [미리보기] {existing_data.get('vesselName')} ({existing_data.get('terminal')}): "
                    f"입항 {old_arrival} → {changed_arrival or '(변경없음)'}{' [직접 고친 값 유지]' if arr.get('note') == 'kept' else ''}"
                    f"{' [직접 고친 값을 터미널 새 값으로]' if arr.get('note') == 'followed' else ''}, "
                    f"출항 {old_departure} → {changed_departure or '(변경없음)'}{' [직접 고친 값 유지]' if dep.get('note') == 'kept' else ''}"
                    f"{' [직접 고친 값을 터미널 새 값으로]' if dep.get('note') == 'followed' else ''}, "
                    f"AN발송 {old_an or '-'} → {new_an or ('(직접 정한 값이라 유지)' if an_kept_manual else '(변경없음)')}"
                )
            else:
                batch.update(doc_ref, fields)
                batch_count += 1

            if changed_arrival or changed_departure:
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
            "keptManual": kept_for_today,
        })
        log(f"'오늘 자동 갱신 내역' 기록 완료 (port_schedule_updates/latest, {len(changes_for_today)}건)")
    else:
        log("⚠️ --dry-run 모드라 실제로는 아무것도 안 바뀌었고, 갱신 내역도 기록 안 됨.")


if __name__ == "__main__":
    main()
