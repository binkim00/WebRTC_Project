"""
DB 연결 풀 관리.
agent 프로세스 시작 시 init_pool() 한 번 호출, 종료 시 close_pool() 호출.
"""

import aiomysql
import os
from typing import Optional

_pool: Optional[aiomysql.Pool] = None


async def init_pool() -> None:
    global _pool
    _pool = await aiomysql.create_pool(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 3306)),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        db=os.environ["DB_NAME"],
        minsize=1,
        maxsize=5,       # agent 1 프로세스당 통화 1건이라 넉넉함
        autocommit=True,
        charset="utf8mb4",
    )


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
