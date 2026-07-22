"""
ai_subtitle / ai_moderation / ai_call_summary / ai_translation INSERT 담당.
Spring이 UPDATE하는 컬럼(reviewed_* 등)은 여기서 건드리지 않음.
"""

import json
from datetime import datetime

import aiomysql

from db.connection import get_pool


# ── ai_subtitle ──────────────────────────────────────────────────────────────

async def insert_subtitle(
    *,
    call_session_id: int,
    sequence: int,
    speaker_id: str,
    speaker_role: str,          # "host" | "fan"
    spoken_at: datetime,
    original_text: str,
    original_lang: str,
    translated_text: str | None = None,
    translated_lang: str | None = None,
) -> int:
    """
    발화 문장 1건 저장. 생성된 subtitle_id를 반환.
    번역이 아직 안 됐으면 translated_text=None으로 먼저 INSERT 후
    번역 완료 시 update_subtitle_translation()으로 채움.
    """
    sql = """
        INSERT INTO ai_subtitle
            (call_session_id, sequence, speaker_id, speaker_role,
             spoken_at, original_text, original_lang,
             translated_text, translated_lang)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    async with get_pool().acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (
                call_session_id, sequence, speaker_id, speaker_role,
                spoken_at, original_text, original_lang,
                translated_text, translated_lang,
            ))
            return cur.lastrowid


async def update_subtitle_translation(
    *,
    subtitle_id: int,
    translated_text: str,
    translated_lang: str,
) -> None:
    """번역 결과를 나중에 채울 때 사용."""
    sql = """
        UPDATE ai_subtitle
        SET translated_text = %s, translated_lang = %s
        WHERE subtitle_id = %s
    """
    async with get_pool().acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (translated_text, translated_lang, subtitle_id))


# ── ai_moderation ─────────────────────────────────────────────────────────────

async def insert_moderation(
    *,
    call_session_id: int,
    subtitle_id: int,
    risk_type: str,     # PROFANITY | SEXUAL | HARASSMENT | THREAT | PERSONAL_INFO
    risk_level: str,    # LOW | MEDIUM | HIGH  (임계값 미정 — 추후 확정)
    reason: str,
    detected_at: datetime,
) -> int:
    """감지 결과 저장. reviewed_* 컬럼은 Spring이 UPDATE."""
    sql = """
        INSERT INTO ai_moderation
            (call_session_id, subtitle_id, risk_type, risk_level, reason, detected_at)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    async with get_pool().acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (
                call_session_id, subtitle_id,
                risk_type, risk_level, reason, detected_at,
            ))
            return cur.lastrowid


# ── ai_call_summary ───────────────────────────────────────────────────────────

async def insert_call_summary(
    *,
    call_session_id: int,
    summary: str,
    keywords: list[str],
) -> None:
    """
    통화 종료 후 요약 저장.
    UNIQUE(call_session_id)라 중복 INSERT 시 에러 — 호출 전 존재 여부 확인 권장.
    keywords는 JSON 배열로 직렬화해서 저장.
    """
    sql = """
        INSERT INTO ai_call_summary (call_session_id, summary, keywords, created_at)
        VALUES (%s, %s, %s, %s)
    """
    async with get_pool().acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (
                call_session_id,
                summary,
                json.dumps(keywords, ensure_ascii=False),
                datetime.utcnow(),
            ))


async def summary_exists(call_session_id: int) -> bool:
    """요약이 이미 있는지 확인 (shutdown 재시도 중복 방지)."""
    sql = "SELECT 1 FROM ai_call_summary WHERE call_session_id = %s LIMIT 1"
    async with get_pool().acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (call_session_id,))
            return await cur.fetchone() is not None


# ── ai_translation ────────────────────────────────────────────────────────────

async def insert_translation_session(
    *,
    call_session_id: int,
    source_language: str,
    target_language: str,
    model_name: str,
    started_at: datetime,
) -> int:
    """통역 세션 시작 시 기록. translation_id 반환."""
    sql = """
        INSERT INTO ai_translation
            (call_session_id, status, source_language, target_language,
             model_name, started_at, created_at, updated_at)
        VALUES (%s, 'RUNNING', %s, %s, %s, %s, NOW(), NOW())
    """
    async with get_pool().acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (
                call_session_id, source_language, target_language,
                model_name, started_at,
            ))
            return cur.lastrowid


async def update_translation_session(
    *,
    translation_id: int,
    status: str,            # COMPLETED | FAILED
    ended_at: datetime,
    error_message: str | None = None,
) -> None:
    sql = """
        UPDATE ai_translation
        SET status = %s, ended_at = %s, error_message = %s, updated_at = NOW()
        WHERE translation_id = %s
    """
    async with get_pool().acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, (status, ended_at, error_message, translation_id))


# ── ai_subtitle SELECT (요약용) ───────────────────────────────────────────────

async def fetch_subtitles_for_summary(call_session_id: int) -> list[dict]:
    """통화 종료 후 요약 LLM에 넘길 전체 자막 조회."""
    sql = """
        SELECT speaker_role, original_text, spoken_at
        FROM ai_subtitle
        WHERE call_session_id = %s
        ORDER BY sequence ASC
    """
    async with get_pool().acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, (call_session_id,))
            return await cur.fetchall()
