"""
DeepL Voice API 어댑터.
한국-외국 통화에서 사용. STT + 번역을 동시에 처리.

흐름:
  POST /v3/voice/realtime → streaming_url + token
  → WebSocket 연결
  → 오디오 청크 송신 / transcript 수신 병렬
  → concluded 구절들을 문장 단위로 모아서 on_final 콜백 호출
"""

import asyncio
import json
import logging
import base64
from datetime import datetime, timezone

import httpx
import websockets

from stt.base import STTAdapter, FinalTranscript

logger = logging.getLogger(__name__)

DEEPL_SESSION_URL = "https://api.deepl.com/v3/voice/realtime"

# 이 시간(초) 동안 새 concluded가 안 오면 "문장 끝"으로 판단, 추후 테스트 후 수정하기
SENTENCE_TIMEOUT = 1.5


class DeepLVoiceAdapter(STTAdapter):

    def __init__(self, api_key: str, target_lang: str):
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
        # 1. 세션 생성
        streaming_url, token = await self._create_session(language)

        # 2. WebSocket 연결
        ws_url = f"{streaming_url}?token={token}"
        self._ws = await websockets.connect(ws_url)
        logger.info("DeepL Voice 세션 연결 완료 source=%s target=%s", language, self._target_lang)

        source_lang = language

        # 3. 송신/수신 병렬 실행
        send_task = asyncio.create_task(
            self._send_audio(audio_stream)
        )
        recv_task = asyncio.create_task(
            self._receive_results(
                on_final=on_final,
                source_lang=source_lang,
            )
        )

        try:
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
            "source_language": source_lang,
            "target_languages": [self._target_lang],
            "source_media_content_type": "audio/pcm;encoding=s16le;rate=48000",
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
        """AudioStream에서 청크를 모아서 WebSocket으로 전송. (200ms 버퍼링)"""
        try:
            buffer = bytearray()
            CHUNK_SIZE = 19200  # 48000Hz × 2bytes × 200ms

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
            # 종료 신호
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
    ) -> None:
        """
        WebSocket에서 concluded를 수신하고, 문장 단위로 모아서 on_final 호출.

        원문/번역 각각 텍스트 버퍼 + 침묵 타이머를 관리.
        타이머 만료 시 버퍼에 모인 텍스트를 하나의 문장으로 on_final에 전달.
        """
        # 원문/번역 문장 버퍼
        source_buffer: list[str] = []
        target_buffer: list[str] = []

        # 침묵 타이머
        flush_timer: asyncio.Task | None = None

        async def flush_sentence():
            """타이머 만료 시 호출 — 버퍼에 모인 텍스트로 on_final 호출."""
            nonlocal flush_timer

            # 타이머 대기
            await asyncio.sleep(SENTENCE_TIMEOUT)

            # 원문이 있으면 문장 확정
            if source_buffer:
                source_text = "".join(source_buffer).strip()
                target_text = "".join(target_buffer).strip() if target_buffer else None

                if source_text:
                    transcript = FinalTranscript(
                        text=source_text,
                        language=source_lang,
                        spoken_at=datetime.now(timezone.utc),
                        translated_text=target_text if target_text else None,
                        translated_lang=self._target_lang if target_text else None,
                    )
                    logger.info(
                        "문장 확정: %s → %s",
                        source_text,
                        target_text or "(번역 없음)",
                    )
                    await on_final(transcript)

                # 버퍼 비움
                source_buffer.clear()
                target_buffer.clear()

            flush_timer = None

        def reset_timer():
            """새 concluded가 올 때마다 타이머 리셋."""
            nonlocal flush_timer
            if flush_timer and not flush_timer.done():
                flush_timer.cancel()
            flush_timer = asyncio.create_task(flush_sentence())

        try:
            async for raw_message in self._ws:
                if self._closed:
                    break

                message = json.loads(raw_message)

                # 에러 처리
                if "error" in message:
                    logger.error("DeepL 에러: %s", json.dumps(message["error"], ensure_ascii=False))
                    continue

                # 원문 STT
                if "source_transcript_update" in message:
                    update = message["source_transcript_update"]
                    for seg in update.get("concluded", []):
                        text = seg.get("text", "")
                        if text:
                            source_buffer.append(text)
                            reset_timer()

                # 번역
                elif "target_transcript_update" in message:
                    update = message["target_transcript_update"]
                    for seg in update.get("concluded", []):
                        text = seg.get("text", "")
                        if text:
                            target_buffer.append(text)
                            reset_timer()

                # 스트림 종료 — 남은 버퍼 즉시 flush
                elif "end_of_source_transcript" in message or "end_of_stream" in message:
                    if flush_timer and not flush_timer.done():
                        flush_timer.cancel()
                    # 남은 버퍼가 있으면 마지막 문장으로 처리
                    if source_buffer:
                        source_text = "".join(source_buffer).strip()
                        target_text = "".join(target_buffer).strip() if target_buffer else None
                        if source_text:
                            transcript = FinalTranscript(
                                text=source_text,
                                language=source_lang,
                                spoken_at=datetime.now(timezone.utc),
                                translated_text=target_text if target_text else None,
                                translated_lang=self._target_lang if target_text else None,
                            )
                            logger.info("스트림 종료 — 마지막 문장: %s → %s", source_text, target_text or "(번역 없음)")
                            await on_final(transcript)
                        source_buffer.clear()
                        target_buffer.clear()
                    break

        except (asyncio.CancelledError, websockets.exceptions.ConnectionClosed):
            pass
        finally:
            # 정리: 타이머 취소
            if flush_timer and not flush_timer.done():
                flush_timer.cancel()