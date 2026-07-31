import json
import aiomysql
from datetime import datetime

from db.timeutil import now_kst

#자막, 번역 저장하는 쿼리
async def insert_subtitle(
    pool,
    call_session_id: int,
    sequence: int,
    speaker_id: int,
    speaker_role: str,        # "INFLUENCER" or "FAN"
    spoken_at: datetime,
    original_text: str,
    original_lang: str,
    translated_text: str | None = None,
    translated_lang: str | None = None,
) -> int:
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO ai_subtitle
                    (call_session_id, sequence, speaker_id, speaker_role, spoken_at,
                     original_text, original_lang, translated_text, translated_lang)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (call_session_id, sequence, speaker_id, speaker_role, spoken_at,
                 original_text, original_lang, translated_text, translated_lang),
            )
            await conn.commit()
            return cur.lastrowid
        
        
#메모 생성 시 자막 가져오는 쿼리
async def get_subtitles_by_call(pool, call_session_id: int) -> list[dict]:
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                """
                SELECT sequence, speaker_id, speaker_role, spoken_at,
                       original_text, original_lang, translated_text, translated_lang
                FROM ai_subtitle
                WHERE call_session_id = %s
                ORDER BY spoken_at ASC
                """,
                (call_session_id,),
            )
            return await cur.fetchall()
        
# 요약 생성 시작 표시
# 백엔드가 "생성 중"과 "실패"를 구분하려면 성공 후가 아니라 시작 시점에 행이 있어야 한다.
async def start_call_summary(pool, call_session_id: int) -> None:
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO ai_call_summary
                    (call_session_id, status, created_at)
                VALUES (%s, 'GENERATING', %s) AS new
                ON DUPLICATE KEY UPDATE
                    status = 'GENERATING',
                    summary = NULL,
                    keywords = NULL,
                    completed_at = NULL,
                    failure_reason = NULL,
                    created_at = new.created_at
                """,
                (call_session_id, now_kst()),
            )
            await conn.commit()


# 요약 생성 성공
async def complete_call_summary(
    pool,
    call_session_id: int,
    summary: str,
    keywords: list[str],
) -> None:
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE ai_call_summary
                   SET summary = %s,
                       keywords = %s,
                       status = 'COMPLETED',
                       completed_at = %s,
                       failure_reason = NULL
                 WHERE call_session_id = %s
                """,
                (summary, json.dumps(keywords, ensure_ascii=False),
                 now_kst(), call_session_id),
            )
            await conn.commit()


# 요약 생성 최종 실패
# reason은 운영 진단용이며 백엔드 응답에는 노출되지 않는다.
# 백엔드가 FAILED를 조회 불가(404)로 처리하므로, 읽히지 않을 본문은 남기지 않는다.
async def fail_call_summary(pool, call_session_id: int, reason: str) -> None:
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO ai_call_summary
                    (call_session_id, status, created_at, completed_at, failure_reason)
                VALUES (%s, 'FAILED', %s, %s, %s) AS new
                ON DUPLICATE KEY UPDATE
                    status = 'FAILED',
                    summary = NULL,
                    keywords = NULL,
                    completed_at = new.completed_at,
                    failure_reason = new.failure_reason
                """,
                (call_session_id, now_kst(), now_kst(), reason),
            )
            await conn.commit()