"""
final STT 결과를 받아서:
  1. ai_subtitle INSERT (원문 먼저)
  2. 번역 (need_translation이면) → subtitle 업데이트 + Data Channel push
  3. 유해발언 감지 (백그라운드) → ai_moderation INSERT + Spring API 알림
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx
from livekit import rtc

from db import queries
from stt.base import FinalTranscript

logger = logging.getLogger(__name__)


class SubtitleProcessor:

    def __init__(
        self,
        *,
        call_session_id: int,
        need_translation: bool,
        local_participant: rtc.LocalParticipant,
        spring_internal_url: str,      # 예: "http://backend:8080"
        translate_fn: callable,        # async (text, src_lang, tgt_lang) -> str
        detect_fn: callable,           # async (text, lang) -> dict | None
        sequence_counters: dict,       # speaker_id -> int, 호출자가 관리
    ):
        self.call_session_id = call_session_id
        self.need_translation = need_translation
        self.local_participant = local_participant
        self.spring_url = spring_internal_url
        self._translate = translate_fn
        self._detect = detect_fn
        self._seq = sequence_counters
        self._http_client = httpx.AsyncClient(timeout=5.0)

    async def handle_final(
        self,
        transcript: FinalTranscript,
        speaker_id: str,
        speaker_role: str,      # "host" | "fan"
        target_lang: str,       # 상대방 언어
    ) -> None:
        """
        final 1건 처리. 번역과 감지는 병렬로 띄우되
        자막 push는 번역 완료 후, 감지 알림은 완전 백그라운드.
        """
        # 시퀀스 채번 — speaker별 단조 증가
        self._seq[speaker_id] = self._seq.get(speaker_id, 0) + 1
        seq = self._seq[speaker_id]

        # 1. ai_subtitle INSERT (번역 전 원문 먼저)
        subtitle_id = await queries.insert_subtitle(
            call_session_id=self.call_session_id,
            sequence=seq,
            speaker_id=speaker_id,
            speaker_role=speaker_role,
            spoken_at=transcript.spoken_at,
            original_text=transcript.text,
            original_lang=transcript.language,
        )

        # 2. 번역 + 자막 push (감지는 별도 태스크)
        asyncio.create_task(
            self._detect_and_notify(
                subtitle_id=subtitle_id,
                text=transcript.text,
                lang=transcript.language,
            )
        )

        if self.need_translation:
            translated = await self._translate_and_update(
                subtitle_id=subtitle_id,
                text=transcript.text,
                src_lang=transcript.language,
                tgt_lang=target_lang,
            )
        else:
            translated = None

        # 3. Data Channel push (호스트·팬 화면에 자막 표시)
        payload = json.dumps({
            "subtitle_id": subtitle_id,
            "speaker_role": speaker_role,
            "original_text": transcript.text,
            "original_lang": transcript.language,
            "translated_text": translated,
            "translated_lang": target_lang if translated else None,
        }, ensure_ascii=False)

        await self.local_participant.publish_data(
            payload,
            reliable=True,
            topic="subtitle",
            # destination_identities 미지정 → 방 전체 (호스트 + 팬)
            # 운영자가 방에 있다면 운영자도 수신하지만 자막은 보여줘도 무방
        )

    # ── 내부 메서드 ───────────────────────────────────────────────────────────

    async def _translate_and_update(
        self,
        *,
        subtitle_id: int,
        text: str,
        src_lang: str,
        tgt_lang: str,
    ) -> str | None:
        try:
            translated = await self._translate(text, src_lang, tgt_lang)
            await queries.update_subtitle_translation(
                subtitle_id=subtitle_id,
                translated_text=translated,
                translated_lang=tgt_lang,
            )
            return translated
        except Exception:
            # 번역 실패 → 원문 자막이라도 push되게 None 반환
            logger.exception("번역 실패 subtitle_id=%s", subtitle_id)
            return None

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
                return  # 정상 발화

            moderation_id = await queries.insert_moderation(
                call_session_id=self.call_session_id,
                subtitle_id=subtitle_id,
                risk_type=result["risk_type"],
                risk_level=result["risk_level"],
                reason=result["reason"],
                detected_at=datetime.now(timezone.utc),
            )

            # Spring 내부 API → STOMP → 운영자 브라우저
            await self._notify_spring(moderation_id, subtitle_id, result)

        except Exception:
            logger.exception("유해발언 감지/알림 실패 subtitle_id=%s", subtitle_id)
            # 감지 실패는 자막 흐름에 영향 없음

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
        """팬 퇴장 시 httpx 클라이언트 정리."""
        await self._http_client.aclose()
