"""
통화 종료 후 ai_subtitle 전체 조회 → LLM 요약 → ai_call_summary INSERT.
shutdown hook에서 호출. 실패 시 최대 3회 재시도.
"""

import asyncio
import logging

from db import queries

logger = logging.getLogger(__name__)

# 요약 LLM은 벤더 미정 — translate_fn과 동일하게 주입 방식으로 교체 가능
# 지금은 인터페이스만 잡아둠


async def generate_and_save_summary(
    *,
    call_session_id: int,
    summarize_fn: callable,     # async (subtitles: list[dict]) -> dict(summary, keywords)
    max_retries: int = 3,
) -> None:
    """
    shutdown hook에서 호출.
    UNIQUE 제약으로 중복 저장은 막히지만, 누락은 여기서 못 막음.
    → 백엔드에 "요약 없으면 재트리거" 안전망 필요 (백엔드 팀과 협의 필요).
    """
    # 이미 요약이 있으면 종료 (재시도 중복 방지)
    if await queries.summary_exists(call_session_id):
        logger.info("요약 이미 존재 call_session_id=%s", call_session_id)
        return

    subtitles = await queries.fetch_subtitles_for_summary(call_session_id)
    if not subtitles:
        logger.warning("자막 없음 — 요약 생략 call_session_id=%s", call_session_id)
        return

    for attempt in range(1, max_retries + 1):
        try:
            result = await summarize_fn(subtitles)
            await queries.insert_call_summary(
                call_session_id=call_session_id,
                summary=result["summary"],
                keywords=result["keywords"],
            )
            logger.info("요약 저장 완료 call_session_id=%s", call_session_id)
            return
        except Exception:
            logger.exception("요약 실패 attempt=%s/%s", attempt, max_retries)
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)   # 2초, 4초 backoff

    logger.error("요약 최종 실패 call_session_id=%s", call_session_id)
