#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
하루 4번(9시, 12시, 14시, 16시) BCT 사이트에서 앞으로 2주치 전체 스케줄을 미리 긁어서
Firestore(bct_schedule_cache 컬렉션)에 저장해두는 스크립트예요.

⚠️ 왜 이렇게 따로 만들었나:
   모선일정 탭의 "🔄 자동조회"는 PNIT/HPNT/BPT/한진인천/E1은 Apps Script가 그 자리에서
   바로 터미널에 물어봐서 몇 초 안에 결과를 주는데, BCT는 사이트 특성상 진짜 브라우저(자바스크립트
   실행)가 있어야만 접속이 되는 걸 확인했어요(fetch_terminals.py의 get_bct_session_cookies 참고).
   Apps Script는 자바스크립트를 실행할 방법이 없어서, "그 자리에서 바로" 방식으로는 BCT를
   추가할 수가 없었어요.

   그래서 BCT만 다른 방식을 씀: 이 스크립트가 하루 4번 GitHub Actions에서 미리 전체 스케줄을
   긁어서 Firestore에 저장해두고, 가이드 페이지는 "자동조회" 버튼 눌렀을 때 BCT 소스에 대해서는
   Apps Script를 거치지 않고 Firestore의 이 캐시를 직접 읽어서 그 안에서 선명을 검색해요.
   (Firestore 읽기는 빠르니까, 사람이 버튼 눌렀을 때는 여전히 즉시 결과가 나와요 - 다만
   데이터 자체는 최대 2~3시간 전 기준일 수 있어요.)

이 스크립트는 fetch_terminals.py의 검증된 BCT 크롤링 로직(get_bct_session_cookies, fetch_bct)을
그대로 재사용해요 - 로직 자체를 복붙한 게 아니라 import해서 쓰는 거라, 나중에 BCT 사이트 구조가
바뀌어서 fetch_terminals.py 쪽을 고치면 이 스크립트도 자동으로 같이 고쳐져요.
"""

import os
import json
import sys
import datetime

import firebase_admin
from firebase_admin import credentials, firestore

# fetch_terminals.py에 있는 검증된 BCT 크롤링 함수를 그대로 재사용
from fetch_terminals import fetch_bct


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


def main():
    log("BCT 스케줄 수집 시작...")
    try:
        entries = fetch_bct()
    except Exception as e:
        log(f"❌ BCT 수집 실패: {e}")
        sys.exit(1)

    if not entries:
        log("⚠️ BCT에서 0건 수집됐어요 (사이트 구조가 바뀌었을 수 있어요). 캐시는 갱신 안 함.")
        sys.exit(1)

    log(f"✅ {len(entries)}건 수집 완료")

    db = init_firestore()
    # 캐시는 문서 하나에 배열 전체를 통째로 저장 (검색은 가이드 페이지 쪽에서 배열을 훑으며 처리 -
    # 어차피 2주치라 많아야 몇백 건 수준이라 이 방식이 제일 간단하고 저렴함)
    db.collection("bct_schedule_cache").document("latest").set({
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "updatedAtIso": datetime.datetime.now().isoformat(),
        "count": len(entries),
        "entries": entries,
    })
    log(f"Firestore(bct_schedule_cache/latest)에 {len(entries)}건 저장 완료")


if __name__ == "__main__":
    main()
