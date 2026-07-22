"""
DeepL Voice API 어댑터.
한국-외국 통화에서 사용. STT + 번역을 동시에 처리.

흐름:
  POST /v3/voice/realtime → streaming_url + token
  → WebSocket 연결
  → 오디오 청크 송신 / transcript 수신 병렬
  → concluded 결과 → FinalTranscript로 on_final 콜백 호출
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx
import websockets

from stt.base import STTAdapter, FinalTranscript

logger = logging.getLogger(__name__)

DEEPL_SESSION_URL = "https://api.deepl.com/v3/voice/realtime"


class DeepLVoiceAdapter(STTAdapter):

    def __init__(self, api_key: str, target_lang: str):
        """
        Args:
            api_key: DeepL API 키
            target_lang: 번역 대상 언어 ("ko", "en" 등)
        """
        self._api_key = api_key
        self._target_lang = target_lang
        self._ws = None
        self._closed = False

    async def transcribe(
        self,
        audio_stream,
        language: str,
        on_final: callable,
    ) -> None:
        """
        1. DeepL 세션 생성 (POST)
        2. WebSocket 연결
        3. 오디오 송신 + 결과 수신 병렬 실행
        """
        # 1. 세션 생성
        streaming_url, token = await self._create_session(language)

        # 2. WebSocket 연결
        ws_url = f"{streaming_url}?token={token}"
        self._ws = await websockets.connect(ws_url)
        logger.info("DeepL Voice 세션 연결 완료 source=%s target=%s", language, self._target_lang)

        # concluded 결과를 매칭하기 위한 버퍼
        # source_concluded[index] = text, target_concluded[index] = text
        source_concluded: dict[int, str] = {}
        target_concluded: dict[int, str] = {}
        source_lang = language

        # 3. 송신/수신 병렬 실행
        send_task = asyncio.create_task(
            self._send_audio(audio_stream)
        )
        recv_task = asyncio.create_task(
            self._receive_results(
                on_final=on_final,
                source_lang=source_lang,
                source_concluded=source_concluded,
                target_concluded=target_concluded,
            )
        )

        try:
            # 둘 중 하나가 끝나면 (연결 종료, 에러 등) 나머지도 정리
            done, pending = await asyncio.wait(
                [send_task, recv_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
        except asyncio.CancelledError:
            send_task.cancel()
            recv_task.cancel()

    async def close(self) -> None:
        """WebSocket 연결 종료."""
        self._closed = True
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

    # ── 내부 메서드 ───────────────────────────────────────────────────────────

    async def _create_session(self, source_lang: str) -> tuple[str, str]:
        """POST /v3/voice/realtime로 세션 생성. (streaming_url, token) 반환."""
        body = {
            "source_lang": source_lang,
            "target_langs": [self._target_lang],
            "source_media": {
                "format": "audio/pcm",
                "sample_rate": 48000,
                "channels": 1,
            },
        }
        headers = {
            "Authorization": f"DeepL-Auth-Key {self._api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(DEEPL_SESSION_URL, json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        return data["streaming_url"], data["token"]

    async def _send_audio(self, audio_stream) -> None:
        """AudioStream에서 청크를 읽어서 WebSocket으로 계속 전송."""
        try:
            async for audio_event in audio_stream:
                if self._closed:
                    break
                # LiveKit AudioFrame → PCM 바이트
                frame = audio_event.frame
                pcm_data = frame.data.tobytes()

                message = json.dumps({
                    "type": "source_media_chunk",
                    "data": pcm_data.hex(),  # hex 인코딩
                })
                await self._ws.send(message)
        except (asyncio.CancelledError, websockets.exceptions.ConnectionClosed):
            pass
        finally:
            # 오디오 끝 → DeepL에 종료 알림
            if self._ws and not self._closed:
                try:
                    await self._ws.send(json.dumps({"type": "end_of_source_media"}))
                except Exception:
                    pass

    async def _receive_results(
        self,
        *,
        on_final: callable,
        source_lang: str,
        source_concluded: dict,
        target_concluded: dict,
    ) -> None:
        """WebSocket에서 transcript 결과를 수신하고 concluded만 처리."""
        concluded_index = 0  # 다음에 처리할 concluded 세그먼트 인덱스

        try:
            async for raw_message in self._ws:
                if self._closed:
                    break

                message = json.loads(raw_message)
                msg_type = message.get("type")

                if msg_type == "source_transcript_update":
                    # concluded 세그먼트 추출
                    for seg in message.get("concluded_segments", []):
                        idx = seg.get("index", len(source_concluded))
                        source_concluded[idx] = seg.get("text", "")

                elif msg_type == "target_transcript_update":
                    # concluded 세그먼트 추출
                    for seg in message.get("concluded_segments", []):
                        idx = seg.get("index", len(target_concluded))
                        target_concluded[idx] = seg.get("text", "")

                elif msg_type in ("end_of_source_transcript", "end_of_stream"):
                    break

                # source와 target 매칭 확인
                while (
                    concluded_index in source_concluded
                    and concluded_index in target_concluded
                ):
                    transcript = FinalTranscript(
                        text=source_concluded[concluded_index],
                        language=source_lang,
                        spoken_at=datetime.now(timezone.utc),
                        translated_text=target_concluded[concluded_index],
                        translated_lang=self._target_lang,
                    )
                    await on_final(transcript)

                    # 버퍼 정리
                    del source_concluded[concluded_index]
                    del target_concluded[concluded_index]
                    concluded_index += 1

        except (asyncio.CancelledError, websockets.exceptions.ConnectionClosed):
            pass
