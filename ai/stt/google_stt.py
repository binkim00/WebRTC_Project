"""
Google STT 어댑터.
한국-한국 통화에서 사용. STT만 처리, 번역 없음.
translated_text는 항상 None.
"""

import asyncio
import logging
from datetime import datetime, timezone

from google.cloud import speech_v1 as speech

from stt.base import STTAdapter, FinalTranscript

logger = logging.getLogger(__name__)


class GoogleSTTAdapter(STTAdapter):

    def __init__(self):
        self._client = speech.SpeechAsyncClient()
        self._closed = False

    async def transcribe(
        self,
        audio_stream,
        language: str,
        on_final: callable,
    ) -> None:
        """
        AudioStream → Google STT streaming API → concluded 시 on_final 콜백.
        """
        # Google STT 설정
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=48000,
            language_code=self._to_google_lang(language),
            enable_automatic_punctuation=True,
        )
        streaming_config = speech.StreamingRecognitionConfig(
            config=config,
            interim_results=False,  # final만 받음
        )

        async def request_generator():
            # 첫 요청: 설정
            yield speech.StreamingRecognizeRequest(
                streaming_config=streaming_config
            )
            # 이후: 오디오 청크
            async for audio_event in audio_stream:
                if self._closed:
                    break
                frame = audio_event.frame
                pcm_data = frame.data.tobytes()
                yield speech.StreamingRecognizeRequest(
                    audio_content=pcm_data
                )

        try:
            responses = await self._client.streaming_recognize(
                requests=request_generator()
            )

            async for response in responses:
                if self._closed:
                    break
                for result in response.results:
                    if result.is_final:
                        text = result.alternatives[0].transcript
                        if text.strip():
                            transcript = FinalTranscript(
                                text=text,
                                language=language,
                                spoken_at=datetime.now(timezone.utc),
                                translated_text=None,
                                translated_lang=None,
                            )
                            await on_final(transcript)

        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Google STT 에러")

    async def close(self) -> None:
        self._closed = True

    @staticmethod
    def _to_google_lang(lang: str) -> str:
        """우리 언어 코드 → Google 언어 코드 변환."""
        mapping = {
            "ko": "ko-KR",
            "en": "en-US",
            "ja": "ja-JP",
            "zh": "zh-CN",
        }
        return mapping.get(lang, lang)
