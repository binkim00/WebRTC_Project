"""
DB에 저장할 시각 생성 유틸.

백엔드(Spring)는 LocalDateTime을 KST 벽시계 그대로 저장하는데,
MySQL 컨테이너는 UTC로 동작한다. 그래서 파이썬에서 UTC datetime을 넘기면
같은 컬럼에 9시간 차이가 나는 값이 섞여 들어간다.

DB에 넣는 시각은 항상 이 모듈의 now_kst()로 만든다.
"""

from datetime import datetime, timedelta, timezone

# zoneinfo("Asia/Seoul") 대신 고정 오프셋을 쓴다.
# 한국은 서머타임이 없어 결과가 같고, tzdata 패키지나 OS 시간대 DB에 의존하지 않는다.
# (Windows venv에는 tzdata가 없어 zoneinfo가 import 시점에 실패한다)
KST = timezone(timedelta(hours=9))


def now_kst() -> datetime:
    """
    백엔드가 저장하는 벽시계(KST)와 같은 기준의 naive datetime을 만든다.

    드라이버는 tzinfo를 무시하고 벽시계 값만 문자열로 만들기 때문에,
    tzinfo를 제거해 의도를 분명히 남긴다.
    """
    return datetime.now(KST).replace(tzinfo=None)
