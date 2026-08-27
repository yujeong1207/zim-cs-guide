#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_terminals.py가 만들어둔 terminal_data.json을 읽어서, 가이드 페이지가 쓰는
Firestore의 port_schedule 컬렉션에 그대로 반영하는 스크립트예요.

가이드 페이지(guide_desks_portschedule.js)의 raw 업로드 로직과 최대한 똑같이 동작하게 만들었어요:
  - 문서 ID = "선박코드__항차__터미널" (특수문자는 _로 치환) → 같은 배가 여러 터미널에 걸쳐도 안 겹침
  - 이미 있는 문서면 merge로 갱신 (마감자, 적하목록 제출일처럼 사람이 직접 입력해둔 값은 안 건드림)
  - 빈 선명/코드인 행은 건너뜀

Firebase 서비스 계정 키(JSON)는 GitHub Actions의 Secret으로 저장해두고, 환경변수로
그 내용을 통째로 받아서 씀 (레포지토리에 키 파일 자체를 올리면 안 돼요 - 보안 문제).
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
        s = re.sub(r"[^A-Za-z0-9]", "_", str(s or "").strip().upper())
        return s

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

    written = 0
    skipped = 0
    batch = db.batch()
    batch_count = 0

    for terminal_name, entries in results.items():
        for entry in entries:
            vessel_name = (entry.get("vesselName") or "").strip()
            if not vessel_name:
                skipped += 1
                continue

            doc_id = make_doc_id(entry.get("vesselCode"), entry.get("voyage"), entry.get("terminal") or terminal_name)
            doc_ref = collection.document(doc_id)

            fields = {
                "vesselName": vessel_name,
                "vesselCode": (entry.get("vesselCode") or "").strip(),
                "voyage": (entry.get("voyage") or "").strip(),
                "arrivalDate": entry.get("arrivalDate") or "",
                "departureDate": entry.get("departureDate") or "",
                "terminal": entry.get("terminal") or terminal_name,
                "line": (entry.get("line") or "").strip(),
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "updatedBy": "auto_fetch",  # 자동화가 갱신했다는 걸 구분할 수 있게 표시
            }
            # merge=True로 저장 - 마감자/적하목록 제출일/AN발송예정일처럼 사람이 직접 입력해둔
            # 필드는 여기서 아예 안 건드리니까 그대로 남아있음
            batch.set(doc_ref, fields, merge=True)
            batch_count += 1
            written += 1

            # Firestore 배치는 최대 500건까지만 담을 수 있어서, 그 전에 끊어서 커밋
            if batch_count >= 400:
                batch.commit()
                log(f"  ...{written}건 커밋 진행중")
                batch = db.batch()
                batch_count = 0

    if batch_count > 0:
        batch.commit()

    log(f"✅ Firestore 반영 완료: {written}건 저장, {skipped}건 건너뜀(선명 없음)")


if __name__ == "__main__":
    main()
