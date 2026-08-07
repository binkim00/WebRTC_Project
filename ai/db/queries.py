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
        
# 통화 세션에 고정 저장된 팬 언어 조회
# 백엔드가 팬 호출 시 call_sessions.fan_lang에 짧은 코드(ko/en/ja/zh/vi)로 굳혀 저장한다.
# (테이블명은 복수형 call_sessions다 — backend CallSession의 @Table 참고)
# 같은 값이 팬 토큰 attributes로도 오므로 보통은 Agent가 이미 들고 있고, 이 조회는
# 그 값을 넘겨받지 못했을 때의 폴백이다.
async def get_call_session_fan_lang(pool, call_session_id: int) -> str | None:
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT fan_lang
                FROM call_sessions
                WHERE call_session_id = %s
                """,
                (call_session_id,),
            )
            row = await cur.fetchone()
            return row[0] if row else None


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
                    card_candidates = NULL,
                    completed_at = NULL,
                    failure_reason = NULL,
                    created_at = new.created_at
                """,
                (call_session_id, now_kst()),
            )
            await conn.commit()


# 요약 생성 성공
# card_candidates는 팬이 기념 카드 문구를 고를 때 백엔드가 그대로 내려주는 후보 목록이다.
# 요약과 같은 모델 호출에서 함께 받으므로 여기서 한 번에 저장한다.
async def complete_call_summary(
    pool,
    call_session_id: int,
    summary: str,
    keywords: list[str],
    card_candidates: list[str] | None = None,
) -> None:
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE ai_call_summary
                   SET summary = %s,
                       keywords = %s,
                       card_candidates = %s,
                       status = 'COMPLETED',
                       completed_at = %s,
                       failure_reason = NULL
                 WHERE call_session_id = %s
                """,
                (summary, json.dumps(keywords, ensure_ascii=False),
                 json.dumps(card_candidates or [], ensure_ascii=False),
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
                    card_candidates = NULL,
                    completed_at = new.completed_at,
                    failure_reason = new.failure_reason
                """,
                (call_session_id, now_kst(), now_kst(), reason),
            )
            await conn.commit()