"""
STT 어댑터 인터페이스.
DeepL Voice / Google STT 등 벤더가 이 인터페이스를 상속해서 구현.
agent.py는 이 인터페이스만 바라봄.
"""

from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime


@dataclass
class FinalTranscript:
    """
    STT concluded(확정) 결과.
    DeepL Voice는 translated_text를 같이 줌.
    Google STT는 translated_text=None.
    """
    text: str                               # 원문 텍스트
    language: str                           # 원문 언어 ("ko", "en" 등)
    spoken_at: datetime                     # 발화 시각
    translated_text: str | None = None      # 번역 텍스트 (번역 없으면 None)
    translated_lang: str | None = None      # 번역 언어 (번역 없으면 None)


class STTAdapter(ABC):

    @abstractmethod
    async def transcribe(
        self,
        audio_stream,           # LiveKit AudioStream
        language: str,          # 사전 지정 언어 ("ko" | "en")
        on_final: Callable,     # async def on_final(transcript: FinalTranscript)
    ) -> None:
        """
        오디오 스트림을 STT에 흘려보내고,
        concluded 확정 시마다 on_final 콜백을 호출.
        tentative는 이 메서드 내부에서 소비 후 폐기.
        """
        ...

    @abstractmethod
    async def close(self) -> None:
        """세션/연결 정리."""
        ...
