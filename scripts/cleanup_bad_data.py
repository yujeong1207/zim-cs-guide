#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
2026-08-27 사고 복구용 스크립트예요.

BPT/HPNT 파싱 컬럼이 검증 없이 잘못 짜여있어서(선명 자리에 항차 코드 같은 게 들어감),
port_schedule 컬렉션에 잘못된 문서가 대량으로 쌓였어요. 이 스크립트는:

1. updatedBy가 "auto_fetch"인 문서들만(=이 자동화가 만든 것들만) 찾아서
2. terminal이 "BPT" 또는 "HPNT"인 것만 (오염된 게 이 두 터미널이라서)
3. 삭제 여부를 먼저 "미리보기"로 보여주고
4. 사장님이 확인 후 --confirm 옵션을 붙여서 실행해야 진짜로 삭제됨 (실수로 다 지우는 거 방지)

⚠️ 이 스크립트는 "auto_fetch"가 만든 것만 지워요. 사람이 원래 직접 입력해뒀던 BPT/HPNT
   문서는 updatedBy 필드 자체가 없거나 다른 값이라 안 건드려요. 다만 예전에 이미 정상적으로
   자동 반영됐던 BPT/HPNT 문서(이번 사고 전, 있었다면)도 같이 지워질 수 있으니, 실행 전에
   미리보기 결과를 사장님이 한 번 봐주시는 게 안전해요.
"""

import os
import sys
import json

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter


def init_firestore():
    key_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    if not key_json:
        raise RuntimeError("환경변수 FIREBASE_SERVICE_ACCOUNT_KEY가 없어요.")
    key_dict = json.loads(key_json)
    cred = credentials.Certificate(key_dict)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def main():
    confirm = "--confirm" in sys.argv

    db = init_firestore()
    collection = db.collection("port_schedule")

    # updatedBy == "auto_fetch" 이면서 terminal이 BPT 또는 HPNT인 문서만 대상으로 함
    target_docs = []
    for terminal in ["BPT", "HPNT"]:
        query = collection.where(filter=FieldFilter("terminal", "==", terminal)).where(filter=FieldFilter("updatedBy", "==", "auto_fetch"))
        for doc in query.stream():
            target_docs.append(doc)

    print(f"삭제 대상: 총 {len(target_docs)}건 (BPT + HPNT, 자동화가 만든 것만)")
    print()
    print("=== 미리보기 (최대 20건) ===")
    for doc in target_docs[:20]:
        d = doc.to_dict()
        print(f"  - {d.get('vesselName')} | 코드:{d.get('vesselCode')} | 항차:{d.get('voyage')} | 터미널:{d.get('terminal')}")
    if len(target_docs) > 20:
        print(f"  ... 외 {len(target_docs) - 20}건 더")
    print()

    if not confirm:
        print("⚠️ 미리보기만 했어요. 실제로 삭제하려면 이 스크립트를 --confirm 옵션과 함께 다시 실행하세요.")
        print("   예: python scripts/cleanup_bad_data.py --confirm")
        return

    print("삭제를 진행합니다...")
    batch = db.batch()
    count = 0
    for doc in target_docs:
        batch.delete(doc.reference)
        count += 1
        if count % 400 == 0:
            batch.commit()
            batch = db.batch()
            print(f"  ...{count}건 삭제 진행중")
    batch.commit()
    print(f"✅ 삭제 완료: 총 {count}건")


if __name__ == "__main__":
    main()
