"""
영통팬싸 자막 에이전트.

실행: python agent.py dev

이벤트 시작 시 dispatch → agent는 이벤트 내내 Room에 상주.
인플루언서 트랙은 계속 유지, 팬만 교체됨.
팬 교체 시 호스트/팬 어댑터 둘 다 재시작.

한국-외국: DeepL Voice API (STT + 번역 + 자막)
한국-한국: Google STT (STT)

호스트 토큰 metadata (JSON) — 이벤트 단위:
  { "host_lang": "ko" }

팬 토큰 metada (JSON) - 팬 입장마다 생성
  { "role": "fan", "call_session_id": "456", "fan_lang": "en" }
"""
from dotenv import load_dotenv
load_dotenv()

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from db.connection import init_pool, close_pool, get_pool
from pipeline import queries
from pipeline.summarizer import generate_summary  # {summary, keywords} 반환하는 그 함수

from livekit import agents, rtc
from livekit.agents import AutoSubscribe, JobContext

from pipeline.processor import SubtitleProcessor
from stt.base import FinalTranscript
from stt.deepl_voice import DeepLVoiceAdapter
from stt.google_stt import GoogleSTTAdapter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY")


# ── 팬 1명과의 통화 상태 ─────────────────────────────────────────────────────

@dataclass
class CallState:
    """팬 1명과의 통화에 필요한 상태. 팬 교체 시 새로 생성."""
    call_session_id: int
    fan_identity: str
    fan_lang: str
    need_translation: bool
    processor: SubtitleProcessor
    fan_audio_task: asyncio.Task | None = None
    host_audio_task: asyncio.Task | None = None
    host_adapter: DeepLVoiceAdapter | GoogleSTTAdapter | None = None
    fan_adapter: DeepLVoiceAdapter | GoogleSTTAdapter | None = None
    sequence_counters: dict = field(default_factory=dict)


# ── 진입점 ────────────────────────────────────────────────────────────────────
#백엔드에서 영상통화 세션을 만들고 dispatch하면 my_agent를 실행
async def my_agent(ctx: JobContext) -> None:

    # 1. metadata 파싱 (이벤트 단위)
    metadata = json.loads(ctx.job.metadata or "{}")
    host_lang: str = metadata.get("host_lang", "ko")

    logger.info("에이전트 시작 host_lang=%s", host_lang)
    
    # 1.5 DB pool 초기화 — 이벤트 단위로 1개
    await init_pool()
    pool = get_pool()
    logger.info("DB pool 초기화 완료")


    # 현재 통화 상태
    current_call: CallState | None = None

    # 4. 호스트 트랙 저장용 (팬 입장 전에 트랙만 보관)
    host_track: rtc.Track | None = None
    host_participant: rtc.RemoteParticipant | None = None

    # ── 팬 입장 처리 ──────────────────────────────────────────────────────

    async def start_fan_call(participant: rtc.RemoteParticipant) -> None:
        nonlocal current_call

        meta = json.loads(participant.metadata)
        call_session_id = int(meta.get("call_session_id"))
        fan_lang = meta.get("fan_lang")
        need_translation = (host_lang != fan_lang)

        logger.info(
            "팬 입장 fan=%s call_session_id=%s fan_lang=%s need_translation=%s",
            participant.identity, call_session_id, fan_lang, need_translation,
        )

        # 시퀀스 카운터
        seq_counters: dict[str, int] = {}

        # 프로세서 생성
        # 프로세서: 자막 표시
        processor = SubtitleProcessor(
            call_session_id=call_session_id,
            local_participant=ctx.room.local_participant,
            pool = pool,
        )

        # 어댑터 생성 (언어 조합에 따라 분기)
        if need_translation:
            fan_adapter = DeepLVoiceAdapter(api_key=DEEPL_API_KEY, target_lang=host_lang)
            host_adapter = DeepLVoiceAdapter(api_key=DEEPL_API_KEY, target_lang=fan_lang)
        else:
            fan_adapter = GoogleSTTAdapter()
            host_adapter = GoogleSTTAdapter()

        current_call = CallState(
            call_session_id=call_session_id,
            fan_identity=participant.identity,
            fan_lang=fan_lang,
            need_translation=need_translation,
            processor=processor,
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
            
        asyncio.create_task(_trigger_summary(call.call_session_id))
    
    async def _trigger_summary(call_session_id: int) -> None:
        try:
            subtitles = await queries.get_subtitles_by_call(pool, call_session_id)
            if not subtitles:
                logger.warning("자막 없음 — 요약 스킵 call_session_id=%s", call_session_id)
                return
            await generate_and_save_summary(pool, call_session_id, subtitles)
        except Exception:
            logger.exception("요약 트리거 실패 call_session_id=%s", call_session_id)

    # ── 호스트 STT 루프 ───────────────────────────────────────────────────

    async def _run_host_stt() -> None:
        """호스트 트랙으로 STT 시작. 팬 교체 시 재시작됨."""
        if current_call is None or host_track is None:
            return

        audio_stream = rtc.AudioStream(host_track)

        #문장 확정되면 이거 실행
        async def on_final(transcript: FinalTranscript) -> None:
            if current_call is None:
                return
            await current_call.processor.handle_final(
                transcript=transcript,
                speaker_id=host_participant.identity,
                speaker_role="host",
                target_lang=current_call.fan_lang,
            )

        #어댑터에게 시킬일, 어댑터가 on_final의 상태를 결정함
        await current_call.host_adapter.transcribe(
            audio_stream=audio_stream,
            language=host_lang,
            # 문장이 확정되면 on_final을 처리하라는 뜻
            on_final=on_final,
        )

    # ── 트랙 구독 핸들러 ──────────────────────────────────────────────────
    # 새로운 사용자(인플루언서, 팬)이 입장하면 들어왔다고 알려주는 함수.
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

        meta = json.loads(participant.metadata or "{}")
        role = meta.get("role")
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
                await start_fan_call(participant) # 여기서 _run_host_stt()도 실행됨

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
        meta = json.loads(participant.metadata or "{}")
        role = meta.get("role")
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
