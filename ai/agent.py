"""
영통팬싸 자막/요약 에이전트.

실행: python agent.py dev

LiveKit Room 생성 시 자동 dispatch → agent는 이벤트 내내 Room에 상주.
인플루언서 트랙은 계속 유지, 팬만 교체됨.
팬 교체 시 인플루언서/팬 어댑터 둘 다 재시작.

한국-외국: DeepL Voice API (STT + 번역 + 자막)
한국-한국: Google STT (STT)

role 값은 users.role 컨벤션과 동일하게 대문자 사용 (INFLUENCER / FAN).
참가자 정보는 participant.attributes로 전달됨 (모든 값은 문자열).
user_id, call_session_id는 int()로 변환해 사용.

인플루언서 attributes:
  { "user_id": "20", "role": "INFLUENCER", "influencer_lang": "ko" }

팬 attributes - 팬 입장마다 생성:
  { "user_id": "123", "role": "FAN", "call_session_id": "456", "fan_lang": "en" }
"""
from dotenv import load_dotenv
load_dotenv()

import asyncio
import logging
import os
from dataclasses import dataclass, field
from db import queries
from db.connection import init_pool, close_pool, get_pool
from pipeline.summarizer import generate_and_save_summary

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
    user_id: int
    fan_identity: str
    fan_lang: str
    need_translation: bool
    processor: SubtitleProcessor
    fan_audio_task: asyncio.Task | None = None
    influencer_audio_task: asyncio.Task | None = None
    influencer_adapter: DeepLVoiceAdapter | GoogleSTTAdapter | None = None
    fan_adapter: DeepLVoiceAdapter | GoogleSTTAdapter | None = None
    sequence_counters: dict = field(default_factory=dict)


# ── 진입점 ────────────────────────────────────────────────────────────────────
# LiveKit이 새 Room에 자동 dispatch하면 my_agent를 실행
async def my_agent(ctx: JobContext) -> None:

    # 1. 인플루언서 언어 — INFLUENCER participant 입장 시 token metadata에서 읽어 채운다.
    #    (팬보다 인플루언서가 먼저 입장하므로 팬 통화 시작 전에 값이 채워짐)
    influencer_lang: str = "ko"

    logger.info("에이전트 시작")
    
    # 1.5 DB pool 초기화 — 이벤트 단위로 1개
    await init_pool()
    pool = get_pool()
    logger.info("DB pool 초기화 완료")


    # 현재 통화 상태
    current_call: CallState | None = None

    # 진행 중인 요약 task 모음 — 이벤트 종료 시 전부 완료를 기다린 뒤 pool을 닫기 위함
    pending_summaries: set[asyncio.Task] = set()

    # 4. 인플루언서 트랙 저장용 (팬 입장 전에 트랙만 보관)
    influencer_track: rtc.Track | None = None
    influencer_participant: rtc.RemoteParticipant | None = None
    influencer_user_id: int = 0

    # ── 팬 입장 처리 ──────────────────────────────────────────────────────

    async def start_fan_call(participant: rtc.RemoteParticipant) -> None:
        nonlocal current_call

        attributes = participant.attributes
        try:
            user_id = int(attributes["user_id"])
            call_session_id = int(attributes["call_session_id"])
            fan_lang = attributes["fan_lang"]
        except (KeyError, TypeError, ValueError):
            logger.exception(
                "팬 attributes 오류 participant=%s attributes=%s",
                participant.identity, attributes,
            )
            return
        need_translation = (influencer_lang != fan_lang)

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
            pool=pool,
            sequence_counters=seq_counters,
        )

        # 어댑터 생성 (언어 조합에 따라 분기)
        if need_translation:
            fan_adapter = DeepLVoiceAdapter(api_key=DEEPL_API_KEY, target_lang=influencer_lang)
            influencer_adapter = DeepLVoiceAdapter(api_key=DEEPL_API_KEY, target_lang=fan_lang)
        else:
            fan_adapter = GoogleSTTAdapter()
            influencer_adapter = GoogleSTTAdapter()

        current_call = CallState(
            call_session_id=call_session_id,
            user_id=user_id,
            fan_identity=participant.identity,
            fan_lang=fan_lang,
            need_translation=need_translation,
            processor=processor,
            influencer_adapter=influencer_adapter,
            fan_adapter=fan_adapter,
            sequence_counters=seq_counters,
        )

        # 인플루언서 트랙이 이미 있으면 인플루언서 STT 시작
        if influencer_track is not None:
            current_call.influencer_audio_task = asyncio.create_task(
                _run_influencer_stt()
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

        # 오디오 태스크 정리 — cancel 후 완전히 끝날 때까지 대기.
        # (마지막 자막 insert가 끝나기 전에 요약이 조회되는 경쟁 조건 방지)
        stt_tasks = [
            t for t in (call.fan_audio_task, call.influencer_audio_task)
            if t and not t.done()
        ]
        for t in stt_tasks:
            t.cancel()
        if stt_tasks:
            await asyncio.gather(*stt_tasks, return_exceptions=True)

        # 어댑터 정리
        if call.fan_adapter:
            await call.fan_adapter.close()
        if call.influencer_adapter:
            await call.influencer_adapter.close()

        # 프로세서 정리 (httpx.AsyncClient close)
        await call.processor.close()

        task = asyncio.create_task(_trigger_summary(call.call_session_id))
        pending_summaries.add(task)
        task.add_done_callback(pending_summaries.discard)
    
    async def _trigger_summary(call_session_id: int) -> None:
        try:
            subtitles = await queries.get_subtitles_by_call(pool, call_session_id)
            if not subtitles:
                logger.warning("자막 없음 — 요약 스킵 call_session_id=%s", call_session_id)
                return
            await generate_and_save_summary(pool, call_session_id, subtitles)
        except Exception:
            logger.exception("요약 트리거 실패 call_session_id=%s", call_session_id)

    # ── 인플루언서 STT 루프 ───────────────────────────────────────────────

    async def _run_influencer_stt() -> None:
        """인플루언서 트랙으로 STT 시작. 팬 교체 시 재시작됨."""
        if current_call is None or influencer_track is None:
            return

        audio_stream = rtc.AudioStream(influencer_track)

        #문장 확정되면 이거 실행
        async def on_final(transcript: FinalTranscript) -> None:
            if current_call is None:
                return
            await current_call.processor.handle_final(
                transcript=transcript,
                speaker_id=influencer_user_id,
                speaker_role="INFLUENCER",
                target_lang=current_call.fan_lang,
            )

        #어댑터에게 시킬일, 어댑터가 on_final의 상태를 결정함
        await current_call.influencer_adapter.transcribe(
            audio_stream=audio_stream,
            language=influencer_lang,
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
        nonlocal influencer_track, influencer_participant, influencer_lang, influencer_user_id

        #오디오 트랙만 구독
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return

        attributes = participant.attributes
        role = attributes.get("role")
        if role not in ("INFLUENCER", "FAN"):
            return

        if role == "INFLUENCER":
            # 인플루언서 트랙 저장만. STT는 팬 입장 시 시작. 왜냐면 fan_lang을 모르니까
            influencer_user_id = int(attributes["user_id"])
            influencer_lang = attributes.get("influencer_lang", "ko")
            influencer_track = track
            influencer_participant = participant
            logger.info(
                "인플루언서 트랙 저장 participant=%s influencer_lang=%s",
                participant.identity, influencer_lang,
            )

        elif role == "FAN":
            # 팬 입장 → 통화 상태 생성 후 STT 시작
            async def fan_stt_loop() -> None:
                # start_fan_call()이 팬 attributes에서 call_session_id, fan_lang 읽고, 어댑터 생성하고, CallState 만듬
                await start_fan_call(participant) # 여기서 _run_influencer_stt()도 실행됨

                if current_call is None:
                    return

                audio_stream = rtc.AudioStream(track)

                async def on_final(transcript: FinalTranscript) -> None:
                    if current_call and current_call.fan_identity == participant.identity:
                        await current_call.processor.handle_final(
                            transcript=transcript,
                            speaker_id=current_call.user_id,
                            speaker_role="FAN",
                            target_lang=influencer_lang,
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
        attributes = participant.attributes
        role = attributes.get("role")
        if role == "FAN" and current_call and current_call.fan_identity == participant.identity:
            asyncio.create_task(end_fan_call())

    ctx.room.on("participant_disconnected", on_participant_disconnected)

    # ── shutdown hook — 이벤트 종료 시 ────────────────────────────────────

    async def on_shutdown() -> None:
        logger.info("이벤트 종료 — shutdown 시작")
        await end_fan_call()
        # 진행 중인 요약(방금 트리거된 것 포함)이 끝날 때까지 기다린 뒤 pool 종료.
        # 최대 30초까지만 기다리고, 넘으면 유실을 감수하고 pool을 닫는다.
        if pending_summaries:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*pending_summaries, return_exceptions=True),
                    timeout=30,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "요약 완료 대기 30초 초과 — 미완료 요약 %d건 남기고 pool 종료",
                    len(pending_summaries),
                )
        await close_pool()

    ctx.add_shutdown_callback(on_shutdown)

    # ── Room 연결 ─────────────────────────────────────────────────────────

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("Room 연결 완료 room=%s", ctx.room.name)


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=my_agent,
        )
    )
