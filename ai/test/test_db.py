"""
목표:
1. insert_subtitle로 자막이 실제 DB(ai_subtitle)에 저장되는지 확인
2. get_subtitles_by_call로 발화시간순 조회가 되는지 확인
3. 조회한 자막을 summarizer.generate_summary에 그대로 넘겨 요약이 나오는지 확인
4. 요약 결과가 ai_call_summary에 저장되는지, 재조회로 확인

전제:
- DB, 테이블은 이미 존재 (CREATE TABLE 안 함)
- call_sessions에 테스트로 쓸 row가 이미 있음 -> TEST_CALL_SESSION_ID에 채워 넣을 것
- summarizer.py의 _format_subtitles는 .upper() == "HOST" 비교로 수정된 상태
- 환경변수 GMS_API_KEY 필요 (실제 LLM 호출, 비용 발생)
"""

from dotenv import load_dotenv
load_dotenv()  # 다른 모든 import보다 먼저

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta

import aiomysql
from db.connection import init_pool, close_pool, get_pool
from db.queries import insert_subtitle, get_subtitles_by_call, insert_call_summary

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PROJECT_ROOT)

from pipeline.summarizer import generate_summary

TEST_CALL_SESSION_ID = 1
GMS_API_KEY = os.environ['GMS_API_KEY']


async def insert_subtitle(
    pool, call_session_id, sequence_no, speaker_id, speaker_role,
    spoken_at, original_text, original_lang,
    translated_text=None, translated_lang=None,
) -> int:
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO ai_subtitle
                    (call_session_id, sequence_no, speaker_id, speaker_role, spoken_at,
                     original_text, original_lang, translated_text, translated_lang)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (call_session_id, sequence_no, speaker_id, speaker_role, spoken_at,
                 original_text, original_lang, translated_text, translated_lang),
            )
            await conn.commit()
            return cur.lastrowid


async def get_subtitles_by_call(pool, call_session_id) -> list[dict]:
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                """
                SELECT sequence_no, speaker_id, speaker_role, spoken_at,
                       original_text, original_lang, translated_text, translated_lang
                FROM ai_subtitle
                WHERE call_session_id = %s
                ORDER BY spoken_at ASC
                """,
                (call_session_id,),
            )
            return await cur.fetchall()


async def insert_call_summary(pool, call_session_id, summary, keywords) -> int:
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


async def get_call_summary(pool, call_session_id) -> dict | None:
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(
                "SELECT summary, keywords FROM ai_call_summary WHERE call_session_id = %s",
                (call_session_id,),
            )
            return await cur.fetchone()


async def cleanup_previous_run(pool, call_session_id):
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM ai_subtitle WHERE call_session_id = %s", (call_session_id,))
            await cur.execute("DELETE FROM ai_call_summary WHERE call_session_id = %s", (call_session_id,))
            await conn.commit()


async def main():
    
    await init_pool()
    pool = get_pool()
    
    if TEST_CALL_SESSION_ID == 0:
        print("⚠️ TEST_CALL_SESSION_ID를 실제 call_sessions row의 id로 채워주세요.")
        return
    if not os.environ.get("GMS_API_KEY"):
        print("⚠️ GMS_API_KEY가 설정되어 있지 않습니다.")
        return

    try:
        print("[0] 이전 실행 데이터 정리...")
        await cleanup_previous_run(pool, TEST_CALL_SESSION_ID)

        print("[1] 자막 insert (insert 순서와 spoken_at 순서를 일부러 다르게)...")
        now = datetime.now()
        # FAN 발화를 먼저 insert하지만 spoken_at은 더 늦게 -> 정렬 테스트용
        await insert_subtitle(
            pool, TEST_CALL_SESSION_ID, sequence_no=2, speaker_id=2, speaker_role="FAN",
            spoken_at=now + timedelta(seconds=5),
            original_text="저 이번에 취업했어요!", original_lang="ko",
        )
        await insert_subtitle(
            pool, TEST_CALL_SESSION_ID, sequence_no=1, speaker_id=1, speaker_role="HOST",
            spoken_at=now,
            original_text="안녕하세요! 오늘 와주셔서 감사해요", original_lang="ko",
        )
        await insert_subtitle(
            pool, TEST_CALL_SESSION_ID, sequence_no=3, speaker_id=1, speaker_role="HOST",
            spoken_at=now + timedelta(seconds=10),
            original_text="우와 축하드려요! 어디 취업하신 거예요?", original_lang="ko",
        )
        print("    -> insert 완료")

        print("[2] get_subtitles_by_call로 조회 (spoken_at 순 정렬 확인)...")
        subtitles = await get_subtitles_by_call(pool, TEST_CALL_SESSION_ID)
        for s in subtitles:
            print(f"    spoken_at={s['spoken_at']} role={s['speaker_role']} text={s['original_text']}")

        print("[3] summarizer.generate_summary 호출...")
        result = await generate_summary(subtitles)
        if result is None:
            print("    -> ❌ 요약 생성 실패")
            return
        print(f"    -> summary: {result.get('summary')}")
        print(f"    -> keywords: {result.get('keywords')}")

        print("[4] 요약 결과 DB 저장...")
        await insert_call_summary(
            pool, TEST_CALL_SESSION_ID,
            summary=result.get("summary", ""),
            keywords=result.get("keywords", []),
        )

        print("[5] 저장 확인을 위한 재조회...")
        saved = await get_call_summary(pool, TEST_CALL_SESSION_ID)
        print(f"    -> DB에 저장된 값: {saved}")

        print("\n✅ 전체 테스트 완료")

    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())