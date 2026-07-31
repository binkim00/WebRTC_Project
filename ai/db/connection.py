"""
DB 연결 풀 관리.
agent 프로세스 시작 시 init_pool() 한 번 호출, 종료 시 close_pool() 호출.
"""

import aiomysql
import os
from typing import Optional

_pool: Optional[aiomysql.Pool] = None

# MySQL 컨테이너가 UTC로 동작하므로 세션 시간대를 백엔드와 같은 KST로 고정한다.
# 이 설정이 없으면 SQL의 NOW() 계열이 UTC를 반환해 Spring이 저장한 값과 9시간 어긋난다.
# 한국은 서머타임이 없어 고정 오프셋으로 충분하다.
_SESSION_TIME_ZONE = "SET time_zone = '+09:00'"


async def init_pool() -> None:
    """DB 연결 풀을 만든다. 실패하면 부분 생성된 풀을 남기지 않는다."""
    global _pool
    pool = await aiomysql.create_pool(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 3306)),
        user=os.environ["DB_USERNAME"],
        password=os.environ["DB_PASSWORD"],
        db=os.environ["DB_NAME"],
        minsize=1,
        maxsize=5,       # agent 1 프로세스당 통화 1건이라 넉넉함
        autocommit=True,
        charset="utf8mb4",
        init_command=_SESSION_TIME_ZONE,
    )
    # 시간대 설정이 실제로 먹었는지 커넥션 하나로 확인한다.
    # 여기서 실패하면 잘못된 시각으로 저장하는 대신 기동을 중단시킨다.
    try:
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT @@session.time_zone")
                (session_time_zone,) = await cur.fetchone()
        if session_time_zone != "+09:00":
            raise RuntimeError(
                f"DB 세션 시간대가 +09:00이 아닙니다: {session_time_zone}"
            )
    except BaseException:
        pool.close()
        await pool.wait_closed()
        raise

    _pool = pool


async def close_pool() -> None:
    global _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        _pool = None


def get_pool() -> aiomysql.Pool:
    if _pool is None:
        raise RuntimeError("DB pool이 초기화되지 않았습니다. init_pool()을 먼저 호출하세요.")
    return _pool