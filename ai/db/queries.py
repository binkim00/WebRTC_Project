import json
import aiomysql
from datetime import datetime

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
        
#요약 저장
async def insert_call_summary(
    pool,
    call_session_id: int,
    summary: str,
    keywords: list[str],
) -> int:
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO ai_call_summary
                    (call_session_id, summary, keywords)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    summary = VALUES(summary),
                    keywords = VALUES(keywords)
                """,
                (call_session_id, summary, json.dumps(keywords, ensure_ascii=False)),
            )
            await conn.commit()
            return cur.lastrowid