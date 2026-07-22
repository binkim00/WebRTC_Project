"""
STT 어댑터 인터페이스.
벤더(Clova / Google / Deepgram 등)가 결정되면
이 클래스를 상속해서 구현체만 추가하면 됨.
agent.py는 이 인터페이스만 바라봄.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class FinalTranscript:
    """STT final 이벤트 결과. interim은 agent에서 소비 후 폐기."""
    text: str
    language: str       # "ko" | "en" 등
    spoken_at: datetime


class STTAdapter(ABC):

    @abstractmethod
    async def transcribe(
        self,
        audio_stream,           # LiveKit AudioStream
        language: str,          # 사전 지정 언어 ("ko" | "en")
        on_final: callable,     # async def on_final(transcript: FinalTranscript)
    ) -> None:
        """
        오디오 스트림을 STT에 흘려보내고,
        final 확정 시마다 on_final 콜백을 호출.
        interim은 이 메서드 내부에서 소비 후 폐기 — 밖으로 노출하지 않음.
        """
        ...
