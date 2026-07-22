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
    speaker_role: str,
    spoken_at: datetime,
    original_text: str,
    original_lang: str,
    translated_text: str | None = None,
    translated_lang: str | None = None,
) -> int:
    """
    발화 문장 1건 저장. 생성된 subtitle_id를 반환.
    DeepL 사용 시 translated_text가 이미 들어있고,
    Google STT 사용 시 None.
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


# ── ai_moderation ─────────────────────────────────────────────────────────────

async def insert_moderation(
    *,
    call_session_id: int,
    subtitle_id: int,
    risk_type: str,
    risk_level: str,
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
    UNIQUE(call_session_id)라 중복 INSERT 시 에러.
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
    """요약이 이미 있는지 확인."""
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
    """통역 세션 시작 시 기록."""
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
    status: str,
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
    """
    통화 종료 후 요약 LLM에 넘길 자막 조회.
    translated_text 포함 — 한국-외국이면 원문+번역, 한국-한국이면 원문만(NULL).
    """
    sql = """
        SELECT speaker_role, original_text, translated_text, spoken_at
        FROM ai_subtitle
        WHERE call_session_id = %s
        ORDER BY sequence ASC
    """
    async with get_pool().acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, (call_session_id,))
            return await cur.fetchall()
