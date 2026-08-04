"""
Google STT 어댑터.
한국-한국 통화에서 사용. STT만 처리, 번역 없음.
translated_text는 항상 None.
"""

import asyncio
import logging
import os
from collections.abc import Callable

from google.oauth2 import service_account
from google.cloud import speech_v1 as speech

from db.timeutil import now_kst
from stt.base import STTAdapter, FinalTranscript

logger = logging.getLogger(__name__)

# 한국인 인플 - 한국인 팬 용 오디오->텍스트용 STT
class GoogleSTTAdapter(STTAdapter):

    def __init__(self):
        credentials = service_account.Credentials.from_service_account_file(
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"],
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        self._client = speech.SpeechAsyncClient(credentials=credentials)
        self._stop = asyncio.Event()  # close() 시 set → 오디오 입력 종료 신호

    async def transcribe(
        self,
        audio_stream, #구독 중인 오디오
        language: str, #사용하는 언어
        on_final: Callable, #전체 문장이면 call
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
            model="latest_long",       # 긴 대화용 최신 모델
            use_enhanced=True,         # enhanced 모델 사용
            #     speech_contexts=[
            #     speech.SpeechContext(
            #         phrases=["팬미팅", "사인회", "영통", "인플루언서"],
            #         boost=10.0,
            #     )
            # ],
            
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
            # 이후: 오디오 청크.
            # close()가 self._stop을 set하면 다음 프레임을 기다리지 않고 즉시 입력을 끊는다.
            # (그래야 Google이 남은 오디오로 '마지막 final'을 방출하고 스트림을 닫는다)
            aiter = audio_stream.__aiter__()
            stop_task = asyncio.ensure_future(self._stop.wait())
            try:
                while True:
                    frame_task = asyncio.ensure_future(aiter.__anext__())
                    done, _ = await asyncio.wait(
                        {frame_task, stop_task},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if stop_task in done:
                        frame_task.cancel()
                        break
                    try:
                        audio_event = frame_task.result()
                    except StopAsyncIteration:
                        break
                    #LiveKit 오디오 프레임 → Google STT 요청
                    yield speech.StreamingRecognizeRequest(
                        audio_content=audio_event.frame.data.tobytes()
                    )
            finally:
                stop_task.cancel()

        try:
            responses = await self._client.streaming_recognize(
                requests=request_generator()
            )

            # self._stop에 즉시 break하지 않는다 — 입력이 끊긴 뒤 Google이 내보내는
            # '마지막 final'까지 모두 읽어 저장한다(마지막 문장 유실 방지).
            async for response in responses:
                for result in response.results:
                    if result.is_final:
                        text = result.alternatives[0].transcript
                        if text.strip(): #.strip() 공백제거
                            transcript = FinalTranscript(
                                text=text,
                                language=language,
                                spoken_at=now_kst(),
                                translated_text=None, # 한-한 미팅인 경우 번역 필요 없음
                                translated_lang=None,
                            )
                            await on_final(transcript)

        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Google STT 에러")

    async def close(self) -> None:
        # 오디오 입력만 끊는다. 응답(마지막 final) drain은 transcribe가 계속 처리한다.
        self._stop.set()

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
