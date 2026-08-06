"""
final(concluded) STT 결과를 받아서:
  1. ai_subtitle INSERT (원문 + 번역 한 번에)
  2. 유해발언 감지 (백그라운드) → ai_moderation INSERT + Spring API 알림
  3. Data Channel push (자막)

번역은 STT 어댑터(DeepL)가 이미 처리해서 FinalTranscript에 담겨옴.
"""

import asyncio
import json
import logging
from collections.abc import Callable

import httpx
from livekit import rtc

from db import queries
from db.timeutil import now_kst
from stt.base import FinalTranscript

logger = logging.getLogger(__name__)


class SubtitleProcessor:

    def __init__(
        self,
        *,
        call_session_id: int,
        local_participant: rtc.LocalParticipant,
        pool,
        spring_internal_url: str | None = None,
        detect_fn: Callable | None = None,         # async (text, lang) -> dict | None
        sequence_counters: dict,
    ):
        self.call_session_id = call_session_id
        self.local_participant = local_participant
        self.pool = pool
        self.spring_url = spring_internal_url
        self._detect = detect_fn
        self._seq = sequence_counters
        self._http_client = httpx.AsyncClient(timeout=5.0)

    async def handle_final(
        self,
        transcript: FinalTranscript,
        speaker_id: str,
        speaker_role: str,      # "INFLUENCER" | "FAN"
        target_lang: str,       # 상대방 언어 (push용)
    ) -> None:
        """
        concluded 1건 처리.
        번역은 이미 transcript에 들어있으니 INSERT 한 번으로 끝.
        """
        # 시퀀스 채번 — call_session 단위로 화자 구분 없이 1씩 증가
        # (DB unique key가 (call_session_id, sequence)라 화자별로 나누면 충돌)
        self._seq["sequence"] = self._seq.get("sequence", 0) + 1
        seq = self._seq["sequence"]

        # 1. ai_subtitle INSERT (원문 + 번역 한 번에)
        subtitle_id = await queries.insert_subtitle(
            pool=self.pool,
            call_session_id=self.call_session_id,
            sequence=seq,
            speaker_id=speaker_id,
            speaker_role=speaker_role,
            spoken_at=transcript.spoken_at,
            original_text=transcript.text,
            original_lang=transcript.language,
            translated_text=transcript.translated_text,
            translated_lang=transcript.translated_lang,
        )

        # 2. 감지 (백그라운드) — detect_fn이 설정된 경우에만
        if self._detect is not None:
            asyncio.create_task(
                self._detect_and_notify(
                    subtitle_id=subtitle_id,
                    text=transcript.text,
                    lang=transcript.language,
                )
            )

        # 3. Data Channel push (확정본)
        payload = json.dumps({
            "subtitle_id": subtitle_id,
            "segment_id": transcript.segment_id,
            "is_final": True,
            "speaker_role": speaker_role,
            "original_text": transcript.text,
            "original_lang": transcript.language,
            "translated_text": transcript.translated_text,
            "translated_lang": transcript.translated_lang,
        }, ensure_ascii=False)

        await self.local_participant.publish_data(
            payload,
            reliable=True,
            topic="subtitle",
        )

    async def push_interim(
        self,
        *,
        speaker_role: str,               # "INFLUENCER" | "FAN"
        segment_id: int,
        text: str,                       # 지금까지 누적된 원문 전체(델타 아님)
        original_lang: str,
        translated_text: str | None,
        translated_lang: str | None,
    ) -> None:
        """
        확정 전 부분 자막을 Data Channel로만 push (DB 저장 안 함).

        같은 segment_id의 확정본이 handle_final로 나오면 프론트가 이 줄을 교체한다.
        순서가 보장되는 방식으로 보낸다. lossy로 보내면 조각들이 뒤바뀌어 도착할 수 있고, 그때
        짧은 조각이 나중에 도착해 자막 글자가 거꾸로 줄어든다. payload에는 어느 쪽이 최신인지
        가릴 정보가 없어 화면이 판단할 수 없다. 자막 한 건은 작아서 비용 차이가 거의 없다.
        """
        payload = json.dumps({
            "subtitle_id": None,
            "segment_id": segment_id,
            "is_final": False,
            "speaker_role": speaker_role,
            "original_text": text,
            "original_lang": original_lang,
            "translated_text": translated_text,
            "translated_lang": translated_lang,
        }, ensure_ascii=False)

        await self.local_participant.publish_data(
            payload,
            reliable=True,   # 순서 보장 — 뒤바뀌면 자막이 거꾸로 줄어든다
            topic="subtitle",
        )

    # ── 내부 메서드 ───────────────────────────────────────────────────────────

    async def _detect_and_notify(
        self,
        *,
        subtitle_id: int,
        text: str,
        lang: str,
    ) -> None:
        try:
            result = await self._detect(text, lang)
            if result is None:
                return

            moderation_id = await queries.insert_moderation(
                call_session_id=self.call_session_id,
                subtitle_id=subtitle_id,
                risk_type=result["risk_type"],
                risk_level=result["risk_level"],
                reason=result["reason"],
                detected_at=now_kst(),
            )

            await self._notify_spring(moderation_id, subtitle_id, result)

        except Exception:
            logger.exception("유해발언 감지/알림 실패 subtitle_id=%s", subtitle_id)

    async def _notify_spring(
        self,
        moderation_id: int,
        subtitle_id: int,
        result: dict,
    ) -> None:
        body = {
            "moderation_id": moderation_id,
            "call_session_id": self.call_session_id,
            "subtitle_id": subtitle_id,
            "risk_type": result["risk_type"],
            "risk_level": result["risk_level"],
            "reason": result["reason"],
        }
        resp = await self._http_client.post(
            f"{self.spring_url}/internal/ai/moderation",
            json=body,
        )
        resp.raise_for_status()

    async def close(self) -> None:
        await self._http_client.aclose()
