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
    # 한 발화(문장) 식별자. 같은 문장의 interim push들과 이 final이 같은 값을 갖는다.
    # 프론트가 (speaker_role, segment_id)로 라이브 자막 줄을 묶어 interim→final 교체에 쓴다.
    segment_id: int = 0


class STTAdapter(ABC):

    @abstractmethod
    async def transcribe(
        self,
        audio_stream,                        # LiveKit AudioStream
        language: str,                       # 사전 지정 언어 ("ko" | "en")
        on_final: Callable,                  # async def on_final(transcript: FinalTranscript)
        on_interim: Callable | None = None,  # async def on_interim(text, translated_text, segment_id)
    ) -> None:
        """
        오디오 스트림을 STT에 흘려보내고,
        concluded 확정 시마다 on_final 콜백을 호출.
        tentative는 이 메서드 내부에서 소비 후 폐기.

        on_interim이 주어지면, 문장이 확정되기 전에도 지금까지 누적된 부분 자막을
        여러 번 전달한다(번역 자막 지연 감소용). DeepL만 지원하고 Google은 무시한다.
        interim의 text는 델타가 아니라 '지금까지의 문장 전체'이며, segment_id는 그 문장이
        확정될 때 on_final로 오는 FinalTranscript.segment_id와 같다.
        """
        ...

    @abstractmethod
    async def close(self) -> None:
        """세션/연결 정리."""
        ...
