#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
매일 아침 자동으로 PNIT / BPT / HPNT / BCT / 한진인천, 5개 터미널 사이트에서
선박 스케줄(raw 데이터)을 가져와서 Firestore(port_schedule 컬렉션)에 반영하는 스크립트예요.

⚠️ 실제로 터미널 사이트에 접속해서 확인한 요청 방식을 그대로 코드로 옮긴 거라,
   터미널 쪽에서 사이트 구조를 바꾸면 이 스크립트도 같이 고쳐야 해요.
   각 함수 위에 "실제로 F12로 확인한 내용"을 주석으로 남겨뒀으니, 나중에
   뭔가 안 되면 그 주석과 실제 사이트를 다시 비교해보면 원인을 찾기 쉬워요.

전체 흐름:
  1. 터미널 5곳에서 각각 오늘 기준 앞으로 2주 정도의 스케줄을 받아옴
  2. 터미널마다 컬럼 이름이 다 달라서, 공통 형식(vesselName/vesselCode/voyage/arrivalDate/...)으로 통일
  3. 기존 가이드 페이지 로직과 똑같은 규칙으로 Firestore에 반영:
     - 문서 ID = 선박코드 + 항차 + 터미널 (겹침 방지)
     - 이미 있는 문서면 merge(마감자 등 수동 입력값은 안 건드림)
     - "같은 달에 같은 배가 여러 번" 상황은 이 자동화에서는 발생하지 않음
       (raw 전체 업로드라서 코드+항차+터미널로 정확히 구분되기 때문 - 이건 "터미널 갱신용"
       업로드에서만 생기는 문제였어요)
"""

import os
import re
import sys
import json
import time
import datetime
import traceback

import requests

# BCT만 자바스크립트를 실제로 실행해야 세션이 생기는 구조라, 이 터미널만 가상 브라우저(Playwright)를
# 써요. 혹시 playwright 설치가 안 됐거나 실패해도 나머지 4개 터미널은 정상 진행되도록,
# import 자체를 try로 감싸고 fetch_bct() 안에서 없으면 명확한 에러를 냄.
try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

# ============================================================
# 공통 설정
# ============================================================

TODAY = datetime.date.today()
FROM_DATE = TODAY
TO_DATE = TODAY + datetime.timedelta(days=13)  # 앞으로 2주치

HEADERS_COMMON = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}

RESULTS = {}   # { "PNIT": [entry, ...], "BPT": [...], ... }
ERRORS = {}    # { "PNIT": "에러 메시지", ... } - 실패한 터미널만 기록


def log(msg):
    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def parse_date_loose(value):
    """엑셀/텍스트에서 온 날짜 비슷한 문자열을 최대한 'YYYY-MM-DD'로 통일.
    실패하면 빈 문자열을 돌려줌 (가이드 페이지의 parsePortScheduleDate와 같은 역할)."""
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    # "2026-08-30 13:00", "2026-08-30", "2026/08/30" 등
    m = re.match(r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})", s)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return ""


def clean_vessel_name(raw):
    """'DONGJIN CONTINENTAL(IHP)'처럼 끝에 괄호로 항로/서비스 코드가 붙은 경우 떼어냄
    (가이드 페이지 splitCombinedVesselCell / vesselName 정리 로직과 동일한 규칙)."""
    if not raw:
        return ""
    s = str(raw).strip()
    s = re.sub(r"\s*\([^()]*\)\s*$", "", s).strip()
    return s


# ============================================================
# 1. PNIT - 로그인 없이 GET, 표가 HTML에 그대로 들어있음
#    실제 확인한 내용: https://www.pnitl.com/infoservice/vessel/vslScheduleList.jsp
#    페이지 하나 요청하면 "선석/선사/모선항차/선사항차/.../모선명/ROUTE/.../접안(예정)일시/출항(예정)일시/..." 표가
#    그대로 HTML 안에 있음. 날짜 범위를 직접 지정하는 폼 파라미터가 안 보여서, 일단은
#    "기본으로 보여주는 기간"을 그대로 받아옴 (보통 최근~향후 스케줄이 기본으로 뜨는 편).
# ============================================================
def fetch_pnit():
    url = "https://www.pnitl.com/infoservice/vessel/vslScheduleList.jsp"
    resp = requests.get(url, headers=HEADERS_COMMON, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"
    html = resp.text

    # 표의 각 행(<tr>...</tr>)에서 셀(<td>...</td>) 내용을 뽑아냄.
    # 페이지 구조가 살짝 바뀌어도 견디게, "각 줄에 셀이 15개 안팎"인 것만 데이터 행으로 취급.
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)
    entries = []
    for row_html in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.S)
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        cells = [re.sub(r"&nbsp;|\xa0", " ", c).strip() for c in cells]
        # PNIT 표 컬럼 순서(실제 확인함):
        # 0선석 1선사 2모선항차 3선사항차 4Head(Bridge)Stern 5선명 6ROUTE
        # 7반입마감시한 8접안(예정)일시 9출항(예정)일시 10양하 11적하 12Shift 13AMP 14상태
        if len(cells) < 10:
            continue
        vessel_name = clean_vessel_name(cells[5]) if len(cells) > 5 else ""
        if not vessel_name:
            continue
        # "모선항차" 컬럼(예: "MBEI002")에서 앞 3~4글자가 보통 선사+코드 조합이라 코드 추출이 애매해서,
        # PNIT는 vesselCode를 "모선항차" 그대로 두고, voyage는 "선사항차"(예: HR632R)를 씀.
        entries.append({
            "vesselName": vessel_name,
            "vesselCode": cells[2].strip() if len(cells) > 2 else "",
            "voyage": cells[3].strip() if len(cells) > 3 else "",
            "arrivalDate": parse_date_loose(cells[8]) if len(cells) > 8 else "",
            "departureDate": parse_date_loose(cells[9]) if len(cells) > 9 else "",
            "terminal": "PNIT",
            "line": cells[1].strip() if len(cells) > 1 else "",
        })
    return entries


# ============================================================
# 2. BPT - POST, v_time=week 로 최근 1주일치를 받아옴 (사장님이 확인해주신 옵션)
#    실제 확인한 내용:
#      URL: https://info.bptc.co.kr/Berth_status_text_servlet_sw_kr
#      Method: POST
#      Body: v_time=week&ROCD=ALL&v_oper_cd=&ORDER=item1&v_gu=A
#    응답이 EUC-KR 인코딩이라 디코딩을 맞춰줘야 함.
# ============================================================
def fetch_bpt():
    url = "https://info.bptc.co.kr/Berth_status_text_servlet_sw_kr"
    payload = "v_time=week&ROCD=ALL&v_oper_cd=&ORDER=item1&v_gu=A"
    headers = dict(HEADERS_COMMON)
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    resp = requests.post(url, data=payload.encode("euc-kr"), headers=headers, timeout=30)
    resp.raise_for_status()
    resp.encoding = "euc-kr"
    html = resp.text

    # ⚠️ 2026-08-27 사고 원인: 이전 버전은 컬럼 순서를 실제로 확인 안 하고 추측으로
    #    (선석/선사/모선항차/입항/출항 순서일 거라고) 짜뒀는데, 실제로는 순서가 달라서
    #    항차 코드 같은 게 선명 자리에 들어가며 잘못된 데이터가 대량으로 쌓였어요.
    #    다시는 이런 일이 없도록, 이제 헤더 행(<th> 또는 첫 <tr>)에서 "선명"이 몇 번째
    #    칸인지 실제로 찾아서 그 위치의 값만 신뢰하는 방식으로 바꿨어요. 헤더를 못 찾으면
    #    (즉 뭘 기준으로 뽑아야 할지 모르면) 추측하지 않고 그냥 에러로 멈춰요 - 틀린 데이터를
    #    쌓느니 아무것도 안 쌓는 게 안전하니까요.
    header_row = re.search(r"<tr[^>]*>(.*?)</tr>", html, re.S)
    if not header_row:
        raise RuntimeError("BPT 응답에서 표(<tr>)를 하나도 못 찾았어요.")

    header_cells_raw = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", header_row.group(1), re.S)
    header_cells = [re.sub(r"<[^>]+>", "", c).strip() for c in header_cells_raw]
    header_cells = [re.sub(r"&nbsp;|\xa0", " ", c).strip() for c in header_cells]

    def find_col(*keywords):
        for i, h in enumerate(header_cells):
            if any(k in h for k in keywords):
                return i
        return -1

    idx_vessel = find_col("선명", "모선명", "Vessel")
    idx_voyage = find_col("항차", "Voyage")
    idx_line = find_col("선사", "Line")
    idx_arrival = find_col("접안", "입항", "ETB", "ATB")
    idx_departure = find_col("출항", "ETD", "ATD")

    if idx_vessel < 0:
        raise RuntimeError(
            f"BPT 표에서 '선명' 컬럼을 못 찾았어요 - 잘못된 자리에서 값을 뽑을 위험이 있어서 멈춰요. "
            f"실제 헤더: {header_cells}"
        )

    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)[1:]  # 첫 줄(헤더)은 건너뜀
    entries = []
    for row_html in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.S)
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        cells = [re.sub(r"&nbsp;|\xa0", " ", c).strip() for c in cells]
        if len(cells) <= idx_vessel:
            continue

        vessel_name = clean_vessel_name(cells[idx_vessel])
        if not vessel_name:
            continue
        entries.append({
            "vesselName": vessel_name,
            "vesselCode": "",  # BPT 표에 선박코드가 별도로 안 보여서 일단 비워둠 (선명으로만 식별)
            "voyage": cells[idx_voyage].strip() if idx_voyage >= 0 and len(cells) > idx_voyage else "",
            "arrivalDate": parse_date_loose(cells[idx_arrival]) if idx_arrival >= 0 and len(cells) > idx_arrival else "",
            "departureDate": parse_date_loose(cells[idx_departure]) if idx_departure >= 0 and len(cells) > idx_departure else "",
            "terminal": "BPT",
            "line": cells[idx_line].strip() if idx_line >= 0 and len(cells) > idx_line else "",
        })
    return entries


# ============================================================
# 3. HPNT - POST + CSRF 토큰 필요
#    실제 확인한 내용:
#      1) GET https://www.hpnt.co.kr/infoservice/vessel/vslScheduleList.jsp 로 먼저 접속해서
#         페이지 안에 숨어있는 CSRF_TOKEN 값을 찾음
#      2) POST 같은 주소로 아래 값들을 담아서 요청:
#         isSearch=Y&page=1&URI=&userID=&groupID=U999&tmnCod=H&
#         strdStDate=2026-08-26&strdEdDate=2026-09-01&route=&CSRF_TOKEN=...
# ============================================================
def fetch_hpnt():
    url = "https://www.hpnt.co.kr/infoservice/vessel/vslScheduleList.jsp"
    session = requests.Session()
    session.headers.update(HEADERS_COMMON)

    # 1단계: 페이지 열어서 CSRF 토큰 획득
    resp1 = session.get(url, timeout=30)
    resp1.raise_for_status()
    resp1.encoding = "utf-8"

    # ⚠️ 실제 확인된 구조(GitHub Actions 로그로 확인): CSRF_TOKEN이 완성된 HTML 태그가 아니라
    #    자바스크립트 코드 안에서 동적으로 만들어지고 있었어요:
    #      $('<input/>', {name: 'CSRF_TOKEN', value:'d527b04c-...'})
    #    그래서 HTML 태그를 찾는 방식 대신, 이 자바스크립트 패턴 자체를 먼저 찾도록 순서를 바꿈.
    csrf_token = None
    js_match = re.search(r"name:\s*['\"]CSRF_TOKEN['\"]\s*,\s*value\s*:\s*['\"]([a-zA-Z0-9-]{10,})['\"]", resp1.text, re.I)
    if js_match:
        csrf_token = js_match.group(1)
    if not csrf_token:
        # 순서가 반대(value 먼저, name 나중)인 경우도 시도
        js_match2 = re.search(r"value\s*:\s*['\"]([a-zA-Z0-9-]{10,})['\"]\s*,\s*name\s*:\s*['\"]CSRF_TOKEN['\"]", resp1.text, re.I)
        if js_match2:
            csrf_token = js_match2.group(1)
    if not csrf_token:
        # 혹시 완성된 HTML 태그로 내려주는 경우도 대비해서 그대로 남겨둠
        tag_match = re.search(r'<input\b[^>]*\bCSRF_TOKEN\b[^>]*>', resp1.text, re.I)
        if tag_match:
            value_match = re.search(r'value=["\']([^"\']+)["\']', tag_match.group(0), re.I)
            if value_match:
                csrf_token = value_match.group(1)
    if not csrf_token:
        # ⚠️ 진단용 - "CSRF_TOKEN" 문자열 주변 실제 텍스트를 그대로 보여줘서, 정확히 어떤 형태로
        #    박혀있는지(속성 순서, 태그 종류 등) 다음 시도 때 바로 알 수 있게 함.
        idx = resp1.text.upper().find("CSRF_TOKEN")
        surrounding = resp1.text[max(0, idx - 100):idx + 200] if idx >= 0 else "(문자열 자체를 못 찾음)"
        raise RuntimeError(
            "HPNT 페이지에서 CSRF_TOKEN을 못 찾았어요 (사이트 구조가 바뀌었을 수 있어요). "
            f"'CSRF_TOKEN' 주변 실제 텍스트: {surrounding}"
        )

    # 2단계: 실제 조회 요청
    payload = {
        "isSearch": "Y",
        "page": "1",
        "URI": "",
        "userID": "",
        "groupID": "U999",
        "tmnCod": "H",
        "strdStDate": FROM_DATE.strftime("%Y-%m-%d"),
        "strdEdDate": TO_DATE.strftime("%Y-%m-%d"),
        "route": "",
        "CSRF_TOKEN": csrf_token,
    }
    resp2 = session.post(url, data=payload, timeout=30)
    resp2.raise_for_status()
    resp2.encoding = "utf-8"
    html = resp2.text

    # ⚠️ 2026-08-27 사고 원인: BPT와 마찬가지로 이 함수도 컬럼 순서를 실제로 검증 안 하고
    #    "PNIT랑 비슷할 것"이라고 추측만 하고 넘어갔었는데, 실제로는 안 맞아서 잘못된 데이터가
    #    쌓였어요. 이제 헤더 행에서 "선명" 컬럼 위치를 직접 찾아서 그 자리 값만 신뢰하고,
    #    못 찾으면 추측하지 않고 에러로 멈추도록 바꿨어요.
    header_row = re.search(r"<tr[^>]*>(.*?)</tr>", html, re.S)
    if not header_row:
        raise RuntimeError("HPNT 응답에서 표(<tr>)를 하나도 못 찾았어요.")

    header_cells_raw = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", header_row.group(1), re.S)
    header_cells = [re.sub(r"<[^>]+>", "", c).strip() for c in header_cells_raw]
    header_cells = [re.sub(r"&nbsp;|\xa0", " ", c).strip() for c in header_cells]

    def find_col(*keywords):
        for i, h in enumerate(header_cells):
            if any(k in h for k in keywords):
                return i
        return -1

    idx_vessel = find_col("선명", "모선명", "Vessel")
    idx_code = find_col("모선항차", "선박코드", "코드")
    idx_voyage = find_col("항차", "Voyage")
    idx_line = find_col("선사", "Line")
    idx_arrival = find_col("접안", "입항", "ETB", "ATB")
    idx_departure = find_col("출항", "ETD", "ATD")

    if idx_vessel < 0:
        raise RuntimeError(
            f"HPNT 표에서 '선명' 컬럼을 못 찾았어요 - 잘못된 자리에서 값을 뽑을 위험이 있어서 멈춰요. "
            f"실제 헤더: {header_cells}"
        )

    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)[1:]  # 첫 줄(헤더)은 건너뜀
    entries = []
    for row_html in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.S)
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        cells = [re.sub(r"&nbsp;|\xa0", " ", c).strip() for c in cells]
        if len(cells) <= idx_vessel:
            continue

        vessel_name = clean_vessel_name(cells[idx_vessel])
        if not vessel_name:
            continue
        entries.append({
            "vesselName": vessel_name,
            "vesselCode": cells[idx_code].strip() if idx_code >= 0 and len(cells) > idx_code else "",
            "voyage": cells[idx_voyage].strip() if idx_voyage >= 0 and len(cells) > idx_voyage else "",
            "arrivalDate": parse_date_loose(cells[idx_arrival]) if idx_arrival >= 0 and len(cells) > idx_arrival else "",
            "departureDate": parse_date_loose(cells[idx_departure]) if idx_departure >= 0 and len(cells) > idx_departure else "",
            "terminal": "HPNT",
            "line": cells[idx_line].strip() if idx_line >= 0 and len(cells) > idx_line else "",
        })
    return entries


# ============================================================
# 4. BCT - POST, XML 요청 → Nexacro 자체 포맷 응답 (일반 JSON/XML 아님!)
#    실제 확인한 내용:
#      URL: https://info.bct2-4.com/nxCtr.do?version=1.0.0
#      Method: POST, Content-Type: text/xml
#      Body(XML): sqlId=ist_010Qry.selectVslVoyList, istFrdate=YYYYMMDD, istTodate=YYYYMMDD
#
#    응답은 "Dataset:CELL_RowType_Column0:...N1style...(S)style6MSC..." 같은 독자 포맷이라
#    일반 파서가 없음. 실제 확인해보니 데이터가 이런 패턴으로 나열됨:
#      style<번호>[상태태그](선석) style6[값] ... (컬럼 18개가 이어붙어 있고 style로 구분)
#    이 스크립트는 "style숫자" 뒤에 오는 텍스트를 순서대로 잘라내는 방식으로 파싱함.
#    ⚠️ 이 부분이 5개 중 실패 가능성이 제일 높아요 - 안 되면 로그(원본 응답 앞부분)를 같이
#       보여주시면 파싱 규칙을 다시 맞춰드릴게요.
# ============================================================
def get_bct_session_cookies():
    """가상 브라우저(Playwright)로 BCT 페이지를 실제로 한 번 열어서, 자바스크립트가 실행되며
    생기는 세션 쿠키(WMONID 등)를 낚아채옴. 데이터 자체는 여기서 안 긁고, 쿠키만 챙겨서
    가벼운 requests 요청에 그대로 실어 쓰는 방식 - 매번 브라우저를 띄우는 것보다 훨씬 빠르고
    안정적이에요."""
    if not PLAYWRIGHT_AVAILABLE:
        raise RuntimeError(
            "playwright가 설치되어 있지 않아요. requirements.txt에 playwright를 추가하고, "
            "GitHub Actions 워크플로에 'playwright install --with-deps chromium' 단계가 있는지 확인해주세요."
        )

    captured_urls = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=HEADERS_COMMON["User-Agent"])
        page = context.new_page()
        page.on("request", lambda req: captured_urls.append(req.url))

        # ⚠️ 처음엔 "networkidle"(네트워크 요청이 완전히 멈출 때까지 대기)로 기다렸는데 타임아웃났어요.
        #    Nexacro 프레임워크는 백그라운드에서 계속 폴링성 요청을 보내는 경우가 많아서, 네트워크가
        #    "완전히" 잠잠해지는 순간이 아예 안 올 수 있어요. 그래서 조건을 "DOM이 다 만들어지는
        #    시점"(domcontentloaded, 훨씬 가벼운 기준)으로 낮추고, 타임아웃도 60초로 늘렸어요.
        #    그 대신 그 뒤에 자바스크립트가 세션을 만들 시간을 좀 더 넉넉하게(5초) 기다려줘요.
        try:
            page.goto("https://info.bct2-4.com/infoservice/index.html", wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            browser.close()
            raise RuntimeError(f"BCT 페이지 접속 자체가 실패했어요: {e}")
        page.wait_for_timeout(5000)

        cookies = context.cookies()
        page_url_after = page.url
        page_title = page.title()
        browser.close()

    wmonid = ""
    for c in cookies:
        if c.get("name") == "WMONID":
            wmonid = c.get("value", "")
            break

    if not wmonid:
        # 쿠키에 없으면, 로딩 중에 실제로 오간 요청 URL들 중에 WMONID=값 형태가 있는지 찾아봄
        for url in captured_urls:
            m = re.search(r"WMONID=([A-Za-z0-9]+)", url)
            if m:
                wmonid = m.group(1)
                break

    if not wmonid:
        raise RuntimeError(
            f"가상 브라우저로 접속했는데도 WMONID를 못 찾았어요. "
            f"현재 URL: {page_url_after} / 페이지 제목: {page_title} / "
            f"받은 쿠키 이름들: {[c.get('name') for c in cookies]} / "
            f"로딩 중 관찰된 요청 수: {len(captured_urls)}건"
        )

    return wmonid, cookies


def fetch_bct():
    # ⚠️ 실제 확인된 구조(GitHub Actions 로그 + 페이지 소스로 확인):
    #    "https://info.bct2-4.com/infoservice/index.html"는 Nexacro 프레임워크 자바스크립트
    #    라이브러리를 잔뜩 불러오기만 하는 "틀"이고, 실제 화면(및 세션 발급)은 그 안에서
    #    자바스크립트가 실행되면서 "infoservice.xadl.js" 앱을 구동시켜야 만들어짐.
    #    이건 단순 HTTP 요청(requests)만으로는 못 따라가는 부분이라, 이 터미널만 예외적으로
    #    가상 브라우저(Playwright)를 한 번 띄워서 세션 쿠키(WMONID)만 얻어온 다음,
    #    실제 데이터 요청은 기존처럼 가벼운 requests로 처리함.
    api_url = "https://info.bct2-4.com/nxCtr.do?version=1.0.0"

    wmonid, browser_cookies = get_bct_session_cookies()

    session = requests.Session()
    session.headers.update(HEADERS_COMMON)
    for c in browser_cookies:
        session.cookies.set(c.get("name"), c.get("value"), domain=c.get("domain", "").lstrip("."))

    xml_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.nexacroplatform.com/platform/dataset">
    <Parameters>
        <Parameter id="WMONID">{wmonid}</Parameter>
        <Parameter id="styZoncd">1510SP</Parameter>
        <Parameter id="method">getList</Parameter>
        <Parameter id="sqlId">ist_010Qry.selectVslVoyList</Parameter>
        <Parameter id="useIudSql" />
        <Parameter id="dao" />
    </Parameters>
    <Dataset id="input1">
        <ColumnInfo>
            <Column id="istFrdate" type="STRING" size="256" />
            <Column id="istTodate" type="STRING" size="256" />
            <Column id="istRoute" type="STRING" size="256" />
            <Column id="istOper" type="STRING" size="256" />
        </ColumnInfo>
        <Rows>
            <Row>
                <Col id="istFrdate">{FROM_DATE.strftime('%Y%m%d')}</Col>
                <Col id="istTodate">{TO_DATE.strftime('%Y%m%d')}</Col>
            </Row>
        </Rows>
    </Dataset>
</Root>"""
    headers = {"Content-Type": "text/xml; charset=UTF-8"}
    resp = session.post(api_url, data=xml_body.encode("utf-8"), headers=headers, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"
    text = resp.text

    # ⚠️ 처음엔 "ErrorCode"라는 글자만 있으면 무조건 실패로 판단했는데, 알고 보니 성공 응답에도
    #    항상 "ErrorCode: 0"이 찍혀있어서(0 = 정상, 그 외 숫자 = 진짜 에러) 성공한 응답을 실패로
    #    오해하고 있었어요. 이제 ErrorCode 값 자체를 확인해서, 0이 아닌 진짜 에러일 때만 실패 처리함.
    error_code_match = re.search(r'"ErrorCode"[^>]*>(-?\d+)<', text)
    if error_code_match and error_code_match.group(1) != "0":
        raise RuntimeError(f"BCT가 에러코드 {error_code_match.group(1)}을 응답했어요. 응답: {text[:400]}")

    # ✅ 실제 확인 완료(GitHub Actions 로그로 확인): 표준 XML로 옴!
    #    <Dataset id="output1"><Rows><Row><Col id="컬럼이름">값</Col>...</Row>...</Rows></Dataset>
    #    이 형태면 굳이 직접 문자열을 쪼갤 필요 없이, 파이썬 표준 XML 파서로 안전하게 읽을 수 있어요.
    #    (예전엔 "style숫자" 문자열을 직접 쪼개는 방식이었는데, 그건 다른 요청 방식(엑셀 내보내기용)
    #    응답이었고, 지금 이 조회 요청은 이렇게 훨씬 다루기 쉬운 표준 XML로 와요.)
    #
    #    확인된 컬럼: plvVsl(선명 앞부분 코드) plvVslvoy(모선/항차 전체) plvEvoyin(입항항차)
    #    plvEvoyout(출항항차) plvAtb(접안예정/ATB) plvAtd(출항예정/ATD) cdvName(선명) cdvOperator(선사)
    #    plvStatus(상태) 등
    import xml.etree.ElementTree as ElementTree

    try:
        root = ElementTree.fromstring(text)
    except ElementTree.ParseError as e:
        raise RuntimeError(f"BCT 응답이 XML로 안 읽혀요: {e}. 응답 앞부분: {text[:500]}")

    ns = {"ds": "http://www.nexacroplatform.com/platform/dataset"}
    rows = root.findall(".//ds:Dataset[@id='output1']/ds:Rows/ds:Row", ns)
    if not rows:
        # 네임스페이스 없이 올 수도 있어서 한 번 더 시도
        rows = root.findall(".//Dataset[@id='output1']/Rows/Row")

    entries = []
    for row in rows:
        cols = {}
        for col in row:
            tag = col.tag.split("}")[-1]  # 네임스페이스 붙어있으면 떼어냄 ({...}Col → Col)
            if tag == "Col":
                cols[col.get("id")] = (col.text or "").strip()

        vessel_name = clean_vessel_name(cols.get("cdvName", ""))
        if not vessel_name:
            continue
        entries.append({
            "vesselName": vessel_name,
            "vesselCode": cols.get("plvVsl", ""),
            "voyage": cols.get("plvEvoyin", "") or cols.get("plvVslvoy", ""),
            "arrivalDate": parse_date_loose(cols.get("plvAtb", "")),
            "departureDate": parse_date_loose(cols.get("plvAtd", "")),
            "terminal": "BCT",
            "line": cols.get("cdvOperator", ""),
        })
    return entries


# ============================================================
# 5. 한진인천 - POST + CSRF 토큰 필요 (JSON 응답)
#    실제 확인한 내용:
#      1) GET https://esvc2.hjit.co.kr/HJIT/esvc/vessel/berthScheduleT 로 먼저 접속해서
#         페이지 meta 태그 안 _csrf 값을 찾음 (meta-_csrf, meta-_csrf_header: X-CSRF-TOKEN)
#      2) POST https://esvc2.hjit.co.kr/HJIT/berth/vesselSchedule 로 JSON 요청:
#         {"fromDate": "YYYYMMDD", "toDate": "YYYYMMDD", "vessel": "", "voyage": ""}
#         헤더에 X-CSRF-TOKEN: <위에서 받은 값> 을 실어서 보내야 함
# ============================================================
def fetch_hanjin_incheon():
    page_url = "https://esvc2.hjit.co.kr/HJIT/esvc/vessel/berthScheduleT"
    api_url = "https://esvc2.hjit.co.kr/HJIT/berth/vesselSchedule"

    session = requests.Session()
    session.headers.update(HEADERS_COMMON)

    resp1 = session.get(page_url, timeout=30)
    resp1.raise_for_status()
    resp1.encoding = "utf-8"

    m = re.search(r'name=["\']_csrf["\']\s+content=["\']([a-f0-9-]{20,})["\']', resp1.text, re.I)
    if not m:
        m = re.search(r'_csrf["\']?\s*[:=]\s*["\']([a-f0-9-]{20,})["\']', resp1.text, re.I)
    if not m:
        raise RuntimeError("한진인천 페이지에서 _csrf 토큰을 못 찾았어요 (사이트 구조가 바뀌었을 수 있어요).")
    csrf_token = m.group(1)

    payload = {
        "fromDate": FROM_DATE.strftime("%Y%m%d"),
        "toDate": TO_DATE.strftime("%Y%m%d"),
        "vessel": "",
        "voyage": "",
    }
    headers = {"X-CSRF-TOKEN": csrf_token, "Content-Type": "application/json"}
    resp2 = session.post(api_url, json=payload, headers=headers, timeout=30)
    resp2.raise_for_status()

    try:
        data = resp2.json()
    except ValueError:
        raise RuntimeError(f"한진인천 응답이 JSON이 아니에요: {resp2.text[:300]}")

    # 실제 응답 구조 확인됨 (GitHub Actions 로그로 확인): { "requestId": ..., "searchedCount": 57,
    #   "vesselSchedules": [ { "vesselCode": "MMTT", "voyageYear": "2026", "voyageSeq": "002",
    #     "eta": "2026-08-26 11:00:00", "etb": "2026-08-26 13:00:00", "etd": "2026-08-27 04:00:00",
    #     "status": "Departured", ... }, ... ] }
    # ⚠️ "vesselName"에 해당하는 필드가 안 보였는데, 대신 vesselCode만 있음 - 한진인천은 선사코드
    #    기준으로만 응답을 주는 것 같아서, vesselName 대신 vesselCode를 그대로 이름 자리에도 써둠
    #    (나중에 실제 선명이 필요하면 vesselCode→선명 매핑표를 따로 만들어야 할 수도 있어요).
    rows = None
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        for key in ("vesselSchedules", "list", "data", "rows", "resultList", "items"):
            if key in data and isinstance(data[key], list):
                rows = data[key]
                break
    if rows is None:
        raise RuntimeError(f"한진인천 응답 구조를 못 알아봤어요. 응답 앞부분: {json.dumps(data, ensure_ascii=False)[:500]}")

    entries = []
    for row in rows:
        if not isinstance(row, dict):
            continue

        def pick(*keys):
            for k in keys:
                if k in row and row[k]:
                    return str(row[k]).strip()
            return ""

        vessel_code = pick("vesselCode", "vslCd", "vsl_cd")
        vessel_name = clean_vessel_name(pick("vesselName", "vslNm", "vsl_nm", "shipName")) or vessel_code
        if not vessel_name:
            continue
        # voyage는 "voyageYear" + "voyageSeq"를 합쳐서 하나의 항차 표기로 만듦 (예: "2026" + "002" → "2026-002")
        voyage_year = pick("voyageYear")
        voyage_seq = pick("voyageSeq")
        voyage = f"{voyage_year}-{voyage_seq}" if voyage_year and voyage_seq else pick("voyage", "voyNo", "voy_no")
        entries.append({
            "vesselName": vessel_name,
            "vesselCode": vessel_code,
            "voyage": voyage,
            "arrivalDate": parse_date_loose(pick("etb", "eta", "arrivalDate", "berthDate")),
            "departureDate": parse_date_loose(pick("etd", "departureDate", "unberthDate")),
            "terminal": "한진인천",
            "line": pick("line", "opCd", "carrier"),
        })
    return entries


# ============================================================
# 실행부 - 5개 터미널을 하나씩 시도하고, 하나가 실패해도 나머지는 계속 진행
# ============================================================

TERMINAL_FETCHERS = {
    "PNIT": fetch_pnit,
    "BPT": fetch_bpt,
    "HPNT": fetch_hpnt,
    "BCT": fetch_bct,
    "한진인천": fetch_hanjin_incheon,
}


def run_all():
    for name, fn in TERMINAL_FETCHERS.items():
        log(f"[{name}] 수집 시작...")
        try:
            entries = fn()
            if not entries:
                log(f"[{name}] ⚠️ 응답은 받았는데 파싱된 데이터가 0건이에요 - 사이트 구조가 바뀌었을 수 있어요.")
                ERRORS[name] = "0건 파싱됨 (구조 변경 의심)"
            else:
                log(f"[{name}] ✅ {len(entries)}건 수집 완료")
                RESULTS[name] = entries
        except Exception as e:
            log(f"[{name}] ❌ 실패: {e}")
            traceback.print_exc()
            ERRORS[name] = str(e)
        time.sleep(1)  # 터미널 서버에 너무 빠르게 연달아 요청 안 하려고 살짝 텀을 둠


def save_raw_json():
    """디버깅용 - 이번 수집 결과를 그대로 파일로 남겨서, 실패 시 GitHub Actions 로그/아티팩트에서
    바로 확인할 수 있게 함."""
    out = {
        "collectedAt": datetime.datetime.now().isoformat(),
        "results": RESULTS,
        "errors": ERRORS,
    }
    with open("terminal_data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    log("terminal_data.json 저장 완료")


if __name__ == "__main__":
    run_all()
    save_raw_json()

    total = sum(len(v) for v in RESULTS.values())
    log(f"=== 전체 결과: 성공 {len(RESULTS)}개 터미널, 실패 {len(ERRORS)}개 터미널, 총 {total}건 수집 ===")
    if ERRORS:
        log(f"실패한 터미널: {list(ERRORS.keys())}")

    # 하나라도 성공했으면 종료 코드 0(성공)으로 끝내서, 다음 단계(Firestore 반영)가 이어서 실행되게 함.
    # 5개 다 실패한 경우에만 실패로 처리해서 GitHub Actions가 "실패"로 표시하게 함.
    if not RESULTS:
        log("모든 터미널 수집에 실패했어요.")
        sys.exit(1)
    sys.exit(0)
