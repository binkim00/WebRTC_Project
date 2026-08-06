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
from collections.abc import Callable

import httpx
import websockets

from db.timeutil import now_kst
from stt.base import STTAdapter, FinalTranscript

logger = logging.getLogger(__name__)

DEEPL_SESSION_URL = "https://api.deepl.com/v3/voice/realtime"

# 이 시간(초) 동안 새 concluded가 안 오면 "문장 끝"으로 판단, 추후 테스트 후 수정하기
SENTENCE_TIMEOUT = 1.5

# 우리 언어 코드 → DeepL Voice 언어 코드.
# v3는 소문자 BCP-47을 쓰므로 대부분 그대로지만, 중국어만 간체/번체를 구분해야 한다.
# 매핑에 없는 코드는 그대로 넘겨 DeepL이 판단하게 둔다.
DEEPL_LANG_CODES = {
    "zh": "zh-Hans",
}


class DeepLVoiceAdapter(STTAdapter):

    def __init__(self, api_key: str, target_lang: str):
        self._api_key = api_key
        self._target_lang = target_lang
        self._ws = None
        self._stop = asyncio.Event()  # close() 시 set → 오디오 입력 종료 신호

    async def transcribe(
        self,
        audio_stream,
        language: str,
        on_final: Callable,
        on_interim: Callable | None = None,
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
                on_interim=on_interim,
                source_lang=source_lang,
            )
        )

        try:
            done, _ = await asyncio.wait(
                [send_task, recv_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            if recv_task in done:
                # 수신이 먼저 끝남(정상 종료/에러) → 송신 정리
                send_task.cancel()
            else:
                # 송신이 먼저 끝남(오디오 종료/close) → end_of_source_media가 나갔으니
                # 수신이 end_of_stream을 받아 '마지막 문장'을 flush할 시간을 준다.
                try:
                    await asyncio.wait_for(recv_task, timeout=SENTENCE_TIMEOUT + 2.0)
                except asyncio.TimeoutError:
                    recv_task.cancel()
        except asyncio.CancelledError:
            send_task.cancel()
            recv_task.cancel()
            raise
        finally:
            for t in (send_task, recv_task):
                if not t.done():
                    t.cancel()
            await asyncio.gather(send_task, recv_task, return_exceptions=True)
            if self._ws:
                try:
                    await self._ws.close()
                except Exception:
                    pass
                self._ws = None

    async def close(self) -> None:
        # 오디오 입력만 끊는다(_stop). _send_audio가 end_of_source_media를 보내면
        # DeepL이 '마지막 문장'을 flush하고 end_of_stream을 보내 수신부가 처리한다.
        # WS는 transcribe가 drain을 마친 뒤 닫는다.
        self._stop.set()

    # ── 내부 메서드 ───────────────────────────────────────────────────────────

    @staticmethod
    def _to_deepl_lang(lang: str) -> str:
        """우리 언어 코드 → DeepL 언어 코드 변환. 매핑에 없으면 그대로 사용한다."""
        return DEEPL_LANG_CODES.get(lang, lang)

    async def _create_session(self, source_lang: str) -> tuple[str, str]:
        """POST /v3/voice/realtime로 세션 생성. (streaming_url, token) 반환.

        DB·자막 push에는 우리 언어 코드를 그대로 쓰고, DeepL 코드 변환은 이 요청 경계에서만 한다.
        """
        body = {
            "source_language": self._to_deepl_lang(source_lang),
            "source_language_mode": "fixed",
            "target_languages": [self._to_deepl_lang(self._target_lang)],
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
        """AudioStream에서 청크를 모아서 WebSocket으로 전송. (200ms 버퍼링)

        close()가 self._stop을 set하면 다음 프레임을 기다리지 않고 입력을 끊고,
        남은 버퍼와 end_of_source_media(종료 신호)를 보내 DeepL이 '마지막 문장'을 flush하게 한다.
        """
        buffer = bytearray()
        CHUNK_SIZE = 19200  # 48000Hz × 2bytes × 200ms
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
                buffer.extend(audio_event.frame.data.tobytes())
                if len(buffer) >= CHUNK_SIZE:
                    await self._ws.send(json.dumps({
                        "source_media_chunk": {
                            "data": base64.b64encode(bytes(buffer)).decode(),
                        }
                    }))
                    buffer.clear()
        except (asyncio.CancelledError, websockets.exceptions.ConnectionClosed):
            pass
        finally:
            stop_task.cancel()
            # 남은 버퍼 + 종료 신호 (WS 열려 있으면) → 마지막 문장 flush 유도
            if self._ws:
                try:
                    if buffer:
                        await self._ws.send(json.dumps({
                            "source_media_chunk": {
                                "data": base64.b64encode(bytes(buffer)).decode(),
                            }
                        }))
                    await self._ws.send(json.dumps({"end_of_source_media": {}}))
                except Exception:
                    pass

    async def _receive_results(
        self,
        *,
        on_final: Callable,
        source_lang: str,
        on_interim: Callable | None = None,
    ) -> None:
        """
        WebSocket에서 concluded를 수신하고, 문장 단위로 모아서 on_final 호출.

        원문/번역 각각 텍스트 버퍼 + 침묵 타이머를 관리.
        타이머 만료 시 버퍼에 모인 텍스트를 하나의 문장으로 on_final에 전달.

        on_interim이 있으면 concluded 조각이 올 때마다 지금까지 누적된 부분 자막을
        같은 segment_id로 전달한다(문장 확정 전에도 자막이 뜨게 함). interim의 text는
        델타가 아니라 '지금까지의 문장 전체'다.
        """
        # 원문/번역 문장 버퍼
        source_buffer: list[str] = []
        target_buffer: list[str] = []

        # 문장(발화) 식별자. 새 문장이 시작될 때 채번하고, 그 문장의 interim들과 final이 공유한다.
        segment_seq = 0
        current_segment_id: int | None = None

        # 침묵 타이머
        flush_timer: asyncio.Task | None = None

        def ensure_segment() -> None:
            """버퍼가 비어 있던 상태에서 첫 조각이 오면 새 문장 id를 채번한다."""
            nonlocal segment_seq, current_segment_id
            if current_segment_id is None:
                segment_seq += 1
                current_segment_id = segment_seq

        async def emit_final() -> None:
            """버퍼에 모인 텍스트를 하나의 문장으로 on_final에 전달하고 버퍼·문장 id를 비운다."""
            nonlocal current_segment_id
            if source_buffer:
                source_text = "".join(source_buffer).strip()
                target_text = "".join(target_buffer).strip() if target_buffer else None
                if source_text:
                    transcript = FinalTranscript(
                        text=source_text,
                        language=source_lang,
                        spoken_at=now_kst(),
                        translated_text=target_text if target_text else None,
                        translated_lang=self._target_lang if target_text else None,
                        segment_id=current_segment_id or 0,
                    )
                    logger.info("문장 확정: %s → %s", source_text, target_text or "(번역 없음)")
                    await on_final(transcript)
            source_buffer.clear()
            target_buffer.clear()
            current_segment_id = None

        async def push_interim() -> None:
            """지금까지 누적된 부분 자막을 현재 문장 id로 전달(원문이 아직 없으면 생략)."""
            if on_interim is None:
                return
            source_text = "".join(source_buffer).strip()
            target_text = "".join(target_buffer).strip() or None
            if source_text:
                await on_interim(source_text, target_text, current_segment_id or 0)

        async def flush_sentence() -> None:
            """타이머 만료 시 호출 — 버퍼에 모인 텍스트로 on_final 호출."""
            nonlocal flush_timer
            await asyncio.sleep(SENTENCE_TIMEOUT)
            await emit_final()
            flush_timer = None

        def reset_timer() -> None:
            """새 concluded가 올 때마다 타이머 리셋."""
            nonlocal flush_timer
            if flush_timer and not flush_timer.done():
                flush_timer.cancel()
            flush_timer = asyncio.create_task(flush_sentence())

        try:
            # _stop에 즉시 break하지 않는다 — end_of_stream(마지막 문장 flush)까지 처리한다.
            async for raw_message in self._ws:
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
                            ensure_segment()
                            source_buffer.append(text)
                            reset_timer()
                            await push_interim()

                # 번역
                elif "target_transcript_update" in message:
                    update = message["target_transcript_update"]
                    for seg in update.get("concluded", []):
                        text = seg.get("text", "")
                        if text:
                            ensure_segment()
                            target_buffer.append(text)
                            reset_timer()
                            await push_interim()

                # 스트림 종료 — 남은 버퍼 즉시 flush
                elif "end_of_source_transcript" in message or "end_of_stream" in message:
                    if flush_timer and not flush_timer.done():
                        flush_timer.cancel()
                    await emit_final()
                    break

        except (asyncio.CancelledError, websockets.exceptions.ConnectionClosed):
            pass
        finally:
            # 정리: 타이머 취소
            if flush_timer and not flush_timer.done():
                flush_timer.cancel()