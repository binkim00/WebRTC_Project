"""
final(concluded) STT 결과를 받아서 Data Channel push (자막)만 수행.

번역은 STT 어댑터(DeepL)가 이미 처리해서 FinalTranscript에 담겨옴.
DB 저장, 유해발언 감지/알림은 현재 비활성화 상태 (재설계 예정).
"""

import json
import logging

from livekit import rtc

from stt.base import FinalTranscript

logger = logging.getLogger(__name__)


class SubtitleProcessor:

    def __init__(
        self,
        *,
        call_session_id: int,
        local_participant: rtc.LocalParticipant,
        sequence_counters: dict,
    ):
        self.call_session_id = call_session_id
        self.local_participant = local_participant
        self._seq = sequence_counters

    async def handle_final(
        self,
        transcript: FinalTranscript,
        speaker_id: str,
        speaker_role: str,      # "host" | "fan"
        target_lang: str,       # 상대방 언어 (push용)
    ) -> None:
        """concluded 1건 처리. Data Channel push만 수행."""
        # 시퀀스 채번
        self._seq[speaker_id] = self._seq.get(speaker_id, 0) + 1
        seq = self._seq[speaker_id]
        subtitle_id = seq

        # Data Channel push
        payload = json.dumps({
            "subtitle_id": subtitle_id,
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
