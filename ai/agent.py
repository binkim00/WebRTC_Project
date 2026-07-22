"""
영통팬싸 자막 에이전트.

실행: python agent.py dev

이벤트 시작 시 dispatch → agent는 이벤트 내내 Room에 상주.
인플루언서 트랙은 계속 유지, 팬만 교체됨.
팬 교체 시 호스트/팬 어댑터 둘 다 재시작 (DeepL 세션의 target_lang 변경 불가).

한국-외국: DeepL Voice API (STT + 번역 + 자막 + 감지)
한국-한국: Google STT (STT + 감지만)

metadata (JSON) — 이벤트 단위:
  { "host_lang": "ko" }

팬 토큰 attributes:
  { "role": "fan", "call_session_id": "456", "fan_lang": "en" }
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
from stt.deepl_voice import DeepLVoiceAdapter
from stt.google_stt import GoogleSTTAdapter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SPRING_URL = os.environ.get("SPRING_INTERNAL_URL", "http://backend:8080")
DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY")


# ── TODO: 감지/요약 구현체 (벤더 미정) ────────────────────────────────────────

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
    fan_lang: str
    need_translation: bool
    processor: SubtitleProcessor
    translation_id: int | None = None
    fan_audio_task: asyncio.Task | None = None
    host_audio_task: asyncio.Task | None = None
    host_adapter: DeepLVoiceAdapter | GoogleSTTAdapter | None = None
    fan_adapter: DeepLVoiceAdapter | GoogleSTTAdapter | None = None
    sequence_counters: dict = field(default_factory=dict)


# ── 진입점 ────────────────────────────────────────────────────────────────────

@agents.AgentServer.default.rtc_session()
async def my_agent(ctx: JobContext) -> None:

    # 1. metadata 파싱 (이벤트 단위)
    metadata = json.loads(ctx.job.metadata)
    host_lang: str = metadata["host_lang"]

    logger.info("에이전트 시작 host_lang=%s", host_lang)

    # 2. DB 풀 초기화
    await init_pool()

    # 3. 현재 통화 상태
    current_call: CallState | None = None

    # 4. 호스트 트랙 저장용 (팬 입장 전에 트랙만 보관)
    host_track: rtc.Track | None = None
    host_participant: rtc.RemoteParticipant | None = None

    # ── 팬 입장 처리 ──────────────────────────────────────────────────────

    async def start_fan_call(participant: rtc.RemoteParticipant) -> None:
        nonlocal current_call

        call_session_id = int(participant.attributes.get("call_session_id"))
        fan_lang = participant.attributes.get("fan_lang")
        need_translation = (host_lang != fan_lang)

        logger.info(
            "팬 입장 fan=%s call_session_id=%s fan_lang=%s need_translation=%s",
            participant.identity, call_session_id, fan_lang, need_translation,
        )

        # 시퀀스 카운터
        seq_counters: dict[str, int] = {}

        # 프로세서 생성
        processor = SubtitleProcessor(
            call_session_id=call_session_id,
            local_participant=ctx.room.local_participant,
            spring_internal_url=SPRING_URL,
            detect_fn=detect,
            sequence_counters=seq_counters,
        )

        # 어댑터 생성 (언어 조합에 따라 분기)
        if need_translation:
            fan_adapter = DeepLVoiceAdapter(api_key=DEEPL_API_KEY, target_lang=host_lang)
            host_adapter = DeepLVoiceAdapter(api_key=DEEPL_API_KEY, target_lang=fan_lang)
        else:
            fan_adapter = GoogleSTTAdapter()
            host_adapter = GoogleSTTAdapter()

        # ai_translation 세션 기록 (번역 있을 때만)
        translation_id = None
        if need_translation:
            translation_id = await queries.insert_translation_session(
                call_session_id=call_session_id,
                source_language=host_lang,
                target_language=fan_lang,
                model_name="deepl-voice",
                started_at=datetime.now(timezone.utc),
            )

        current_call = CallState(
            call_session_id=call_session_id,
            fan_identity=participant.identity,
            fan_lang=fan_lang,
            need_translation=need_translation,
            processor=processor,
            translation_id=translation_id,
            host_adapter=host_adapter,
            fan_adapter=fan_adapter,
            sequence_counters=seq_counters,
        )

        # 호스트 트랙이 이미 있으면 호스트 STT 시작
        if host_track is not None:
            current_call.host_audio_task = asyncio.create_task(
                _run_host_stt()
            )

    # ── 팬 퇴장 처리 ──────────────────────────────────────────────────────

    async def end_fan_call() -> None:
        nonlocal current_call
        if current_call is None:
            return

        call = current_call
        current_call = None

        logger.info(
            "팬 퇴장 처리 fan=%s call_session_id=%s",
            call.fan_identity, call.call_session_id,
        )

        # 오디오 태스크 정리
        if call.fan_audio_task and not call.fan_audio_task.done():
            call.fan_audio_task.cancel()
        if call.host_audio_task and not call.host_audio_task.done():
            call.host_audio_task.cancel()

        # 어댑터 정리
        if call.fan_adapter:
            await call.fan_adapter.close()
        if call.host_adapter:
            await call.host_adapter.close()

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

        # 프로세서 정리
        await call.processor.close()

    # ── 호스트 STT 루프 ───────────────────────────────────────────────────

    async def _run_host_stt() -> None:
        """호스트 트랙으로 STT 시작. 팬 교체 시 재시작됨."""
        if current_call is None or host_track is None:
            return

        audio_stream = rtc.AudioStream(host_track)

        async def on_final(transcript: FinalTranscript) -> None:
            if current_call is None:
                return
            await current_call.processor.handle_final(
                transcript=transcript,
                speaker_id=host_participant.identity,
                speaker_role="host",
                target_lang=current_call.fan_lang,
            )

        await current_call.host_adapter.transcribe(
            audio_stream=audio_stream,
            language=host_lang,
            on_final=on_final,
        )

    # ── 트랙 구독 핸들러 ──────────────────────────────────────────────────
    # 새로운 사용자(인플루언서, 팬)이 입장하면 드러왔다고 알려주는 함수.
    # LiveKit 프레임워크가 자동 호출해줌
    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        # nonlocal: 밖에 있는 변수 사용하겠다는 말
        nonlocal host_track, host_participant

        #오디오 트랙만 구독
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return

        role = participant.attributes.get("role")
        if role not in ("host", "fan"):
            return

        if role == "host":
            # 호스트 트랙 저장만. STT는 팬 입장 시 시작. 왜냐면 fan_lang을 모르니까
            host_track = track
            host_participant = participant
            logger.info("호스트 트랙 저장 participant=%s", participant.identity)

        elif role == "fan":
            # 팬 입장 → 통화 상태 생성 후 STT 시작
            async def fan_stt_loop() -> None:
                # start_fan_call()이 팬 attributes에서 call_session_id, fan_lang 읽고, 어댑터 생성하고, CallState 만듬
                await start_fan_call(participant)

                if current_call is None:
                    return

                audio_stream = rtc.AudioStream(track)

                async def on_final(transcript: FinalTranscript) -> None:
                    if current_call and current_call.fan_identity == participant.identity:
                        await current_call.processor.handle_final(
                            transcript=transcript,
                            speaker_id=participant.identity,
                            speaker_role="fan",
                            target_lang=host_lang,
                        )

                await current_call.fan_adapter.transcribe(
                    audio_stream=audio_stream,
                    language=current_call.fan_lang,
                    on_final=on_final,
                )

            task = asyncio.create_task(fan_stt_loop())
            # fan_audio_task는 start_fan_call 이후에 설정
            asyncio.create_task(_set_fan_task(task))
            logger.info("팬 오디오 처리 시작 participant=%s", participant.identity)

    async def _set_fan_task(task: asyncio.Task) -> None:
        """start_fan_call이 current_call을 만든 후 fan_audio_task 설정."""
        await asyncio.sleep(0)  # start_fan_call이 먼저 실행되게 양보
        if current_call:
            current_call.fan_audio_task = task

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
        await end_fan_call()
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
