"""
영통팬싸 자막 에이전트.

실행: python agent.py dev

LiveKit Server에 "subtitle-agent"로 등록 후 대기.
백엔드(Spring)가 이벤트 시작 시 dispatch → agent는 이벤트 내내 Room에 상주.
인플루언서 트랙은 계속 유지, 팬만 교체됨.

metadata (JSON) — 이벤트 단위:
  {
    "host_lang": "ko",
    "fan_lang": "en"
  }

팬 토큰 attributes:
  {
    "role": "fan",
    "call_session_id": "456"
  }
"""

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone

from livekit import agents, rtc
from livekit.agents import AutoSubscribe, JobContext

from db.connection import init_pool, close_pool
from db import queries
from pipeline.processor import SubtitleProcessor
from pipeline.summarizer import generate_and_save_summary
from stt.base import FinalTranscript

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SPRING_URL = os.environ.get("SPRING_INTERNAL_URL", "http://backend:8080")


# ── 번역/감지/요약 구현체 (벤더 미정 — 여기만 교체하면 됨) ─────────────────

async def translate(text: str, src_lang: str, tgt_lang: str) -> str:
    """TODO: 번역 벤더 결정 후 구현."""
    raise NotImplementedError("번역 벤더 미결정")


async def detect(text: str, lang: str) -> dict | None:
    """TODO: 유해발언 감지 구현."""
    raise NotImplementedError("감지 모델 미결정")


async def summarize(subtitles: list[dict]) -> dict:
    """TODO: 요약 LLM 구현."""
    raise NotImplementedError("요약 LLM 미결정")


# ── 팬 1명과의 통화 상태 ─────────────────────────────────────────────────────

@dataclass
class CallState:
    """팬 1명과의 통화에 필요한 상태. 팬 교체 시 새로 생성."""
    call_session_id: int
    fan_identity: str
    processor: SubtitleProcessor
    translation_id: int | None = None
    fan_audio_task: asyncio.Task | None = None
    sequence_counters: dict = field(default_factory=dict)


# ── 진입점 ────────────────────────────────────────────────────────────────────

@agents.AgentServer.default.rtc_session()
async def my_agent(ctx: JobContext) -> None:

    # 1. metadata 파싱 (이벤트 단위 — call_session_id 없음)
    metadata = json.loads(ctx.job.metadata)
    host_lang: str = metadata["host_lang"]
    fan_lang: str = metadata["fan_lang"]
    need_translation: bool = (host_lang != fan_lang)

    logger.info("에이전트 시작 host_lang=%s fan_lang=%s", host_lang, fan_lang)

    # 2. DB 풀 초기화
    await init_pool()

    # 3. STT 어댑터 — 벤더 결정 후 교체
    stt_adapter = None  # TODO

    # 4. 현재 통화 상태 (팬 교체 시 갱신)
    current_call: CallState | None = None
    host_audio_task: asyncio.Task | None = None

    # ── 팬 입장 처리 ──────────────────────────────────────────────────────

    async def start_fan_call(participant: rtc.RemoteParticipant) -> None:
        nonlocal current_call

        call_session_id = int(participant.attributes.get("call_session_id"))
        logger.info(
            "팬 입장 fan=%s call_session_id=%s",
            participant.identity, call_session_id,
        )

        # 시퀀스 카운터 — 이 통화 내에서 speaker별 단조 증가
        seq_counters: dict[str, int] = {}

        # 프로세서 생성
        processor = SubtitleProcessor(
            call_session_id=call_session_id,
            need_translation=need_translation,
            local_participant=ctx.room.local_participant,
            spring_internal_url=SPRING_URL,
            translate_fn=translate,
            detect_fn=detect,
            sequence_counters=seq_counters,
        )

        # ai_translation 세션 기록
        translation_id = None
        if need_translation:
            translation_id = await queries.insert_translation_session(
                call_session_id=call_session_id,
                source_language=host_lang,
                target_language=fan_lang,
                model_name="TODO:벤더결정후",
                started_at=datetime.now(timezone.utc),
            )

        current_call = CallState(
            call_session_id=call_session_id,
            fan_identity=participant.identity,
            processor=processor,
            translation_id=translation_id,
            sequence_counters=seq_counters,
        )

    # ── 팬 퇴장 처리 ──────────────────────────────────────────────────────

    async def end_fan_call() -> None:
        nonlocal current_call
        if current_call is None:
            return

        call = current_call
        current_call = None     # 먼저 비워서 호스트 발화가 빈 상태에 쓰이지 않게

        logger.info(
            "팬 퇴장 처리 fan=%s call_session_id=%s",
            call.fan_identity, call.call_session_id,
        )

        # 팬 오디오 태스크 정리
        if call.fan_audio_task and not call.fan_audio_task.done():
            call.fan_audio_task.cancel()

        # ai_translation 상태 업데이트
        if call.translation_id is not None:
            try:
                await queries.update_translation_session(
                    translation_id=call.translation_id,
                    status="COMPLETED",
                    ended_at=datetime.now(timezone.utc),
                )
            except Exception:
                logger.exception("translation 상태 업데이트 실패")

        # 요약 생성
        try:
            await generate_and_save_summary(
                call_session_id=call.call_session_id,
                summarize_fn=summarize,
            )
        except Exception:
            logger.exception("요약 생성 실패 call_session_id=%s", call.call_session_id)

        # 프로세서 정리 (httpx 클라이언트)
        await call.processor.close()

    # ── 호스트 오디오 final 콜백 ──────────────────────────────────────────

    async def host_on_final(transcript: FinalTranscript, speaker_id: str) -> None:
        """호스트 발화는 현재 팬과의 call_session_id에 묶임."""
        if current_call is None:
            # 팬이 없는 사이의 발화 → 무시
            return
        await current_call.processor.handle_final(
            transcript=transcript,
            speaker_id=speaker_id,
            speaker_role="host",
            target_lang=fan_lang,
        )

    # ── 트랙 구독 핸들러 ──────────────────────────────────────────────────

    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        nonlocal host_audio_task

        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return

        role = participant.attributes.get("role")
        if role not in ("host", "fan"):
            return

        audio_stream = rtc.AudioStream(track)

        if role == "host":
            # 호스트 트랙은 이벤트 내내 1번만 구독
            async def host_stt_loop() -> None:
                async def on_final(transcript: FinalTranscript) -> None:
                    await host_on_final(transcript, participant.identity)
                await stt_adapter.transcribe(
                    audio_stream=audio_stream,
                    language=host_lang,
                    on_final=on_final,
                )

            host_audio_task = asyncio.create_task(host_stt_loop())
            logger.info("호스트 오디오 처리 시작 participant=%s", participant.identity)

        elif role == "fan":
            # 팬 입장 → 통화 상태 생성 후 STT 시작
            async def fan_stt_loop() -> None:
                await start_fan_call(participant)

                async def on_final(transcript: FinalTranscript) -> None:
                    if current_call and current_call.fan_identity == participant.identity:
                        await current_call.processor.handle_final(
                            transcript=transcript,
                            speaker_id=participant.identity,
                            speaker_role="fan",
                            target_lang=host_lang,
                        )

                await stt_adapter.transcribe(
                    audio_stream=audio_stream,
                    language=fan_lang,
                    on_final=on_final,
                )

            task = asyncio.create_task(fan_stt_loop())
            if current_call:
                current_call.fan_audio_task = task
            logger.info("팬 오디오 처리 시작 participant=%s", participant.identity)

    ctx.room.on("track_subscribed", on_track_subscribed)

    # ── 팬 퇴장 이벤트 ────────────────────────────────────────────────────

    def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
        role = participant.attributes.get("role")
        if role == "fan" and current_call and current_call.fan_identity == participant.identity:
            asyncio.create_task(end_fan_call())

    ctx.room.on("participant_disconnected", on_participant_disconnected)

    # ── shutdown hook — 이벤트 종료 시 ────────────────────────────────────

    async def on_shutdown() -> None:
        logger.info("이벤트 종료 — shutdown 시작")

        # 마지막 팬 통화가 남아있으면 정리
        await end_fan_call()

        # 호스트 오디오 태스크 정리
        if host_audio_task and not host_audio_task.done():
            host_audio_task.cancel()

        await close_pool()

    ctx.add_shutdown_callback(on_shutdown)

    # ── Room 연결 ─────────────────────────────────────────────────────────

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("Room 연결 완료 room=%s", ctx.room.name)


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=my_agent,
            agent_name="subtitle-agent",
        )
    )
