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
import base64  # 추가

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
        self._api_key = api_key        # DeepL API 키
        self._target_lang = target_lang # 번역 대상 언어
        self._ws = None                 # WebSocket 연결 (아직 없음)
        self._closed = False            # 종료 여부 플래그

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
        # 1. DeepL 세션 생성
        logger.info("DeepL 세션 생성 시작 source=%s target=%s", language, self._target_lang)
        streaming_url, token = await self._create_session(language)
        logger.info("DeepL 세션 생성 성공 url=%s", streaming_url)

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
        # 오디오를 deepL에 보냄
        send_task = asyncio.create_task(
            self._send_audio(audio_stream)
        )
        # 원문 stt와 번역 concluded(완성 문장)을 받음
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
    ## 전체 구조 이해 후 여기도 살펴보기
    
    async def _create_session(self, source_lang: str) -> tuple[str, str]:
        """POST /v3/voice/realtime로 세션 생성. (streaming_url, token) 반환."""
        body = {
                "source_language": source_lang,
                "target_languages": [self._target_lang],
                'source_media_content_type': 'audio/pcm;encoding=s16le;rate=48000',
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
        """AudioStream에서 청크를 모아서 WebSocket으로 전송."""
        try:
            buffer = bytearray()
            # 48000Hz * 2bytes * 200ms = 19200 bytes
            CHUNK_SIZE = 19200

            async for audio_event in audio_stream:
                if self._closed:
                    break
                frame = audio_event.frame
                buffer.extend(frame.data.tobytes())

                if len(buffer) >= CHUNK_SIZE:
                    message = json.dumps({
                        "source_media_chunk": {
                            "data": base64.b64encode(bytes(buffer)).decode(),
                        }
                    })
                    await self._ws.send(message)
                    buffer.clear()

        except (asyncio.CancelledError, websockets.exceptions.ConnectionClosed):
            pass
        finally:
            # 남은 버퍼 전송
            if buffer and self._ws and not self._closed:
                try:
                    message = json.dumps({
                        "source_media_chunk": {
                            "data": base64.b64encode(bytes(buffer)).decode(),
                        }
                    })
                    await self._ws.send(message)
                except Exception:
                    pass
            if self._ws and not self._closed:
                try:
                    await self._ws.send(json.dumps({"end_of_source_media": {}}))
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
                logger.info("DeepL 수신: %s", json.dumps(message, ensure_ascii=False))
                #msg_type = message.get("type")


                #type이 원문 스크립트일 때
                if "source_transcript_update" in message:
                    update = message["source_transcript_update"]
                    for seg in update.get("concluded", []):
                        idx = seg.get("index", len(source_concluded))
                        source_concluded[idx] = seg.get("text", "")

                #type이 번역 스크립트일 때
                elif "target_transcript_update" in message:
                    update = message["target_transcript_update"]
                    for seg in update.get("concluded", []):
                        idx = seg.get("index", len(target_concluded))
                        target_concluded[idx] = seg.get("text", "")


                #번역할 게 없을 때
                elif "end_of_source_transcript" in message or "end_of_stream" in message:
                    break

                # source와 target 매칭 확인
                # ex) 원문 0번, 번역 0번이 도착했는지 확인
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
