"""
영통팬싸 자막/요약 에이전트.

실행: python agent.py dev

백엔드가 생성한 subtitle-agent Dispatch로 배치 → agent는 이벤트 내내 Room에 상주.
인플루언서 트랙은 계속 유지, 팬만 교체됨.
팬 교체 시 인플루언서/팬 어댑터 둘 다 재시작.

인플루언서와 팬의 언어 조합으로 어댑터를 고른다(둘 다 ko·en·ja·zh·vi 중 하나).
  서로 다른 언어: DeepL Voice API (STT + 상대 언어로 번역 + 자막)
  같은 언어:     Google STT (STT만, 번역 없음 → translated_text=None)
어느 쪽이든 원문 자막은 항상 만든다. 통화 종료 후 요약·팬카드 문구가 ai_subtitle의
원문을 읽어 만들어지므로, 같은 언어라고 STT까지 끄면 그 기능이 함께 죽는다.

role 값은 users.role 컨벤션과 동일하게 대문자 사용 (INFLUENCER / FAN).
참가자 정보는 participant.attributes로 전달됨 (모든 값은 문자열).
user_id, call_session_id는 int()로 변환해 사용.

인플루언서 attributes:
  { "user_id": "20", "role": "INFLUENCER", "influencer_lang": "ko" }

Dispatch metadata(백엔드가 팬 호출 시 생성):
  { "callSessionId": 456, "host_lang": "ko" }
  host_lang은 인플루언서가 입장·발화하기 전에도 언어를 알 수 있는 유일한 경로라
  초기값으로 쓴다. 실제 participant attributes가 오면 그 값이 우선한다.

팬 attributes - 팬 입장마다 생성:
  { "user_id": "123", "role": "FAN", "call_session_id": "456", "fan_lang": "en" }
"""
from dotenv import load_dotenv
load_dotenv()

import asyncio
import json
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

# grpc(gRPC) DEBUG 노이즈 억제.
# 팬 퇴장 시 STT task를 cancel하면 grpc가 CancelledError 트레이스백을 DEBUG로 찍는데,
# 이는 정상적인 스트림 취소라 무해하다. dev 모드의 DEBUG 로그에서만 보이므로 조용히 시킨다.
logging.getLogger("grpc").setLevel(logging.INFO)
logging.getLogger("grpc.aio").setLevel(logging.INFO)

DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY")

# 백엔드가 Dispatch metadata에 담아 보내는 주최자(인플루언서) 언어 키.
# backend의 LiveKitAgentDispatchService.METADATA_HOST_LANGUAGE와 같은 문자열이어야 한다.
METADATA_HOST_LANG_KEY = "host_lang"

# 인플루언서 언어를 metadata·attributes 어느 쪽에서도 알아내지 못했을 때만 쓰는 최후 기본값.
DEFAULT_INFLUENCER_LANG = "ko"

# 이벤트 종료 시 진행 중인 요약을 기다리는 한도.
# 요약은 LLM 호출과 최대 3회 재시도를 포함하므로 여유를 둔다.
SUMMARY_WAIT_TIMEOUT_SECONDS = 90

# 통화 종료 시 STT가 '마지막 문장'을 flush하고 끝나길 기다리는 한도.
# 이 시간 안에 안 끝나면 그때 task를 cancel한다(안전장치).
STT_DRAIN_TIMEOUT_SECONDS = 5


# ── 팬 1명과의 통화 상태 ─────────────────────────────────────────────────────

@dataclass
class CallState:
    """팬 1명과의 통화에 필요한 상태. 팬 교체 시 새로 생성."""
    call_session_id: int
    user_id: int
    fan_identity: str
    fan_lang: str
    # 이 통화를 시작할 때 확정되어 있던 인플루언서 언어.
    # 어댑터의 STT 언어와 번역 방향은 이 값으로 굳으므로, 뒤늦게 다른 값을 알게 되면
    # 진단할 수 있도록 함께 보관한다.
    assumed_influencer_lang: str
    need_translation: bool
    processor: SubtitleProcessor
    fan_audio_task: asyncio.Task | None = None
    influencer_audio_task: asyncio.Task | None = None
    influencer_adapter: DeepLVoiceAdapter | GoogleSTTAdapter | None = None
    fan_adapter: DeepLVoiceAdapter | GoogleSTTAdapter | None = None
    sequence_counters: dict = field(default_factory=dict)


# ── Dispatch metadata 읽기 ───────────────────────────────────────────────────

def _read_host_lang_from_metadata(ctx: JobContext) -> str | None:
    """Dispatch metadata에서 주최자(인플루언서) 언어를 읽는다.

    백엔드는 팬을 호출할 때 Dispatch를 만들며 host_lang을 넣어 주므로, Room에 연결하기도
    전에 인플루언서 언어를 알 수 있다. 참가자 입장이나 트랙 구독을 기다리지 않아도 되는
    가장 이른 경로다.

    metadata는 수동 Dispatch나 형식 변경으로 비어 있을 수 있고, 여기서 예외가 나면
    에이전트 자체가 뜨지 못하므로 어떤 실패든 None으로 흘려 attributes·기본값에 맡긴다.

    :param ctx: 배치된 Job의 컨텍스트
    :return: metadata에 담긴 언어 코드, 읽을 수 없으면 None
    """
    try:
        raw = getattr(ctx.job, "metadata", None)
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        value = parsed.get(METADATA_HOST_LANG_KEY)
        if isinstance(value, str) and value.strip():
            return value.strip()
        return None
    except Exception:
        logger.warning("Dispatch metadata에서 host_lang을 읽지 못했다", exc_info=True)
        return None


# ── 진입점 ────────────────────────────────────────────────────────────────────
# 백엔드가 생성한 subtitle-agent Dispatch로 배치되면 my_agent를 실행
async def my_agent(ctx: JobContext) -> None:

    # 1. 인플루언서 언어 — 팬 통화가 시작되기 전에 실제 값으로 확정되어 있어야 한다.
    #    STT 언어와 번역 방향이 이 값으로 정해지고, 어댑터는 팬 입장 시점에 굳기 때문이다.
    #
    #    이전에는 인플루언서 '오디오 트랙 구독' 시점에만 채웠다. 인플루언서가 한국어로
    #    고정이던 때는 기본값이 늘 정답이라 문제가 없었지만, 다국어를 지원하면서는
    #    트랙이 늦게 오면(마이크를 늦게 켜거나 구독이 밀리면) 기본값 ko가 그대로 쓰여
    #    같은 언어인데 번역을 하거나, 다른 언어인데 번역을 건너뛰는 문제가 생긴다.
    #
    #    그래서 트랙과 무관하게 얻을 수 있는 경로에서 먼저 읽는다.
    #      1) Dispatch metadata의 host_lang — Room 연결 전부터 알 수 있다(여기).
    #      2) 인플루언서 participant attributes의 influencer_lang — 입장 시점부터 읽을 수 있고
    #         재접속 시 재발급된 토큰을 반영하므로 더 신선하다(apply_influencer_language).
    influencer_lang: str = _read_host_lang_from_metadata(ctx) or DEFAULT_INFLUENCER_LANG

    logger.info("에이전트 시작 influencer_lang=%s (Dispatch metadata 기준)", influencer_lang)

    # 1.5 DB pool 초기화 — 이벤트 단위로 1개
    # shutdown 훅은 아래에서 등록되므로, 여기서 실패하면 직접 정리하고 중단한다.
    try:
        await init_pool()
        pool = get_pool()
    except BaseException:
        logger.exception("DB pool 초기화 실패 — 에이전트를 중단한다")
        await close_pool()
        raise
    logger.info("DB pool 초기화 완료")


    # 현재 통화 상태
    current_call: CallState | None = None

    # 진행 중인 요약 task — 이벤트 종료 시 전부 완료를 기다린 뒤 pool을 닫기 위함.
    # 대기 시간을 초과한 통화는 상태를 실패로 남겨야 하므로 통화 식별자를 함께 보관한다.
    pending_summaries: dict[asyncio.Task, int] = {}

    # 4. 인플루언서 트랙 저장용 (팬 입장 전에 트랙만 보관)
    influencer_track: rtc.Track | None = None
    influencer_participant: rtc.RemoteParticipant | None = None
    influencer_user_id: int = 0

    # ── 인플루언서 언어 확정 ──────────────────────────────────────────────

    def apply_influencer_language(participant: rtc.RemoteParticipant) -> None:
        """인플루언서 participant의 attributes에서 언어를 읽어 반영한다.

        트랙 구독을 기다리지 않는다. attributes는 참가자 입장 시점부터 읽을 수 있으므로
        마이크를 늦게 켜거나 트랙 구독이 밀려도 팬 통화 시작 전에 언어를 확정할 수 있다.

        인플루언서가 아닌 참가자, attributes가 빈 경우에는 아무것도 바꾸지 않는다.
        여러 경로(입장 이벤트·기존 참가자 순회·트랙 구독)에서 중복 호출되어도 안전하다.

        이미 진행 중인 통화의 어댑터는 바꾸지 않는다. 통화 중간에 STT 세션을 재생성하면
        정상 통화까지 끊길 위험이 있어, 값이 어긋난 경우 경고만 남기고 다음 팬 통화부터
        올바른 값이 적용되게 둔다.

        :param participant: 언어를 읽을 대상 참가자
        """
        nonlocal influencer_lang

        attributes = participant.attributes
        if attributes.get("role") != "INFLUENCER":
            return

        value = attributes.get("influencer_lang")
        if not isinstance(value, str) or not value.strip():
            # 백엔드가 인플루언서 토큰에 반드시 넣는 값이다. 없으면 토큰 발급 쪽 문제이므로
            # 조용히 기본값으로 넘어가지 않고 남긴다(자막 언어가 어긋난 원인 추적용).
            logger.warning(
                "인플루언서 attributes에 influencer_lang이 없다 — 기존 값 %s를 유지한다 "
                "participant=%s attributes=%s",
                influencer_lang, participant.identity, attributes,
            )
            return

        resolved = value.strip()
        if resolved == influencer_lang:
            return

        previous = influencer_lang
        influencer_lang = resolved
        logger.info(
            "인플루언서 언어 갱신 %s -> %s participant=%s",
            previous, resolved, participant.identity,
        )

        if current_call is not None and current_call.assumed_influencer_lang != resolved:
            logger.warning(
                "진행 중인 통화가 가정한 인플루언서 언어와 다르다 — 이 통화의 자막 번역 방향은 "
                "그대로 두고 다음 통화부터 반영한다 call_session_id=%s assumed=%s actual=%s",
                current_call.call_session_id,
                current_call.assumed_influencer_lang,
                resolved,
            )

    # ── 팬 입장 처리 ──────────────────────────────────────────────────────

    async def start_fan_call(participant: rtc.RemoteParticipant) -> None:
        nonlocal current_call

        # 퇴장 이벤트가 새 팬 입장보다 늦게 도착하면 이전 통화가 정리되지 않은 채 덮여
        # 어댑터·STT task가 누수되고 그 통화의 요약도 트리거되지 않는다.
        if current_call is not None:
            logger.warning(
                "이전 통화가 정리되지 않은 상태에서 새 팬 입장 — 먼저 정리한다 prev_call_session_id=%s",
                current_call.call_session_id,
            )
            await end_fan_call()

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
        # 이 통화 동안 쓸 인플루언서 언어를 여기서 한 번 고정한다.
        # 아래 need_translation 판정과 어댑터의 번역 방향이 모두 같은 값을 봐야 하며,
        # 어댑터는 생성 시점 값을 그대로 굳히므로 나중에 influencer_lang이 바뀌어도
        # 이 통화의 판정과 어긋나지 않게 한다.
        assumed_influencer_lang = influencer_lang
        need_translation = (assumed_influencer_lang != fan_lang)

        logger.info(
            "팬 입장 fan=%s call_session_id=%s fan_lang=%s influencer_lang=%s need_translation=%s",
            participant.identity, call_session_id, fan_lang,
            assumed_influencer_lang, need_translation,
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
            fan_adapter = DeepLVoiceAdapter(
                api_key=DEEPL_API_KEY, target_lang=assumed_influencer_lang)
            influencer_adapter = DeepLVoiceAdapter(api_key=DEEPL_API_KEY, target_lang=fan_lang)
        else:
            fan_adapter = GoogleSTTAdapter()
            influencer_adapter = GoogleSTTAdapter()

        current_call = CallState(
            call_session_id=call_session_id,
            user_id=user_id,
            fan_identity=participant.identity,
            fan_lang=fan_lang,
            assumed_influencer_lang=assumed_influencer_lang,
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

        # STT 정리 — 마지막 문장까지 flush되도록 "우아하게" 종료한다.
        # (기존처럼 곧바로 cancel하면 STT가 마지막 final을 내보내기 전에 끊겨 유실됨)
        # 1) 어댑터에 종료 신호: 오디오 입력을 끊어 STT가 마지막 final을 방출하도록 유도.
        for adapter in (call.fan_adapter, call.influencer_adapter):
            if adapter:
                try:
                    await adapter.close()
                except Exception:
                    logger.exception("STT 어댑터 close 실패")

        # 2) STT task가 남은 final(=마지막 문장)까지 처리하고 스스로 끝나길 기다린다.
        #    제한 시간 안에 안 끝나면 그때 cancel(안전장치).
        stt_tasks = [
            t for t in (call.fan_audio_task, call.influencer_audio_task)
            if t and not t.done()
        ]
        if stt_tasks:
            _, pending = await asyncio.wait(stt_tasks, timeout=STT_DRAIN_TIMEOUT_SECONDS)
            for t in pending:
                t.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)

        # 3) 프로세서 정리 (httpx.AsyncClient close)
        await call.processor.close()

        task = asyncio.create_task(_trigger_summary(call.call_session_id))
        pending_summaries[task] = call.call_session_id
        task.add_done_callback(pending_summaries.pop)

    async def _trigger_summary(call_session_id: int) -> None:
        try:
            subtitles = await queries.get_subtitles_by_call(pool, call_session_id)
            if not subtitles:
                # STT가 아무것도 인식하지 못한 경우다. 조회 API가 "생성 중"과 구분할 수 있도록
                # 조용히 끝내지 않고 실패 사유를 남긴다.
                logger.warning("자막 없음 — 요약 스킵 call_session_id=%s", call_session_id)
                await queries.fail_call_summary(pool, call_session_id, "NO_SUBTITLE")
                return
            await generate_and_save_summary(pool, call_session_id, subtitles)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("요약 트리거 실패 call_session_id=%s", call_session_id)
            await _mark_summary_failed(call_session_id, "TRIGGER_ERROR")

    async def _mark_summary_failed(call_session_id: int, reason: str) -> None:
        """요약 상태를 실패로 남긴다. 이 기록마저 실패하면 로그만 남기고 넘어간다."""
        try:
            await queries.fail_call_summary(pool, call_session_id, reason)
        except Exception:
            logger.exception(
                "요약 실패 상태 기록 실패 call_session_id=%s reason=%s",
                call_session_id, reason,
            )

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

        # STT 원문 언어는 어댑터를 만들 때 고정한 값을 그대로 쓴다.
        # 최신 influencer_lang을 쓰면, 어댑터가 이미 그 언어를 번역 대상으로 잡고 있을 때
        # 원문과 번역 대상이 같아진 요청을 DeepL에 보내 자막이 통째로 실패할 수 있다.
        assumed_lang = current_call.assumed_influencer_lang

        # 예외를 잡지 않으면 task가 조용히 죽어 자막이 멈춘 이유를 알 수 없다.
        try:
            #어댑터에게 시킬일, 어댑터가 on_final의 상태를 결정함
            await current_call.influencer_adapter.transcribe(
                audio_stream=audio_stream,
                language=assumed_lang,
                # 문장이 확정되면 on_final을 처리하라는 뜻
                on_final=on_final,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("인플루언서 STT 중단 influencer_lang=%s", assumed_lang)

    # ── 트랙 구독 핸들러 ──────────────────────────────────────────────────
    # 새로운 사용자(인플루언서, 팬)이 입장하면 들어왔다고 알려주는 함수.
    # LiveKit 프레임워크가 자동 호출해줌
    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        # nonlocal: 밖에 있는 변수 사용하겠다는 말
        # (influencer_lang은 apply_influencer_language가 갱신하므로 여기서는 읽기만 한다)
        nonlocal influencer_track, influencer_participant, influencer_user_id

        #오디오 트랙만 구독
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return

        attributes = participant.attributes
        role = attributes.get("role")
        if role not in ("INFLUENCER", "FAN"):
            return

        if role == "INFLUENCER":
            # 팬이 아직 없으면 fan_lang을 모르니 트랙만 저장하고 STT는 팬 입장 시 시작한다.
            # 이미 통화가 시작된 뒤 트랙이 도착했으면 아래에서 곧바로 STT를 시작한다.
            try:
                influencer_user_id = int(attributes["user_id"])
            except (KeyError, TypeError, ValueError):
                logger.exception(
                    "인플루언서 attributes 오류 participant=%s attributes=%s",
                    participant.identity, attributes,
                )
                return
            # 언어는 참가자 입장 시점에 이미 확정됐지만, 트랙만 먼저 도착하는 순서도 있어
            # 여기서 한 번 더 반영한다(같은 값이면 아무 일도 하지 않는다).
            # attributes에 값이 없을 때 ko로 덮지 않는 것이 중요하다. metadata로 이미 알아낸
            # 올바른 언어를 기본값으로 되돌려 버리면 처음의 문제가 그대로 되살아난다.
            apply_influencer_language(participant)
            influencer_track = track
            influencer_participant = participant
            logger.info(
                "인플루언서 트랙 저장 participant=%s influencer_lang=%s",
                participant.identity, influencer_lang,
            )

            # 팬이 인플루언서보다 먼저 입장한 경우: start_fan_call 시점엔 트랙이 없어
            # 인플루언서 STT가 시작되지 못했다. 활성 통화가 있고 STT가 아직 없으면 여기서 한 번만 시작.
            if current_call and (
                current_call.influencer_audio_task is None
                or current_call.influencer_audio_task.done()
            ):
                current_call.influencer_audio_task = asyncio.create_task(
                    _run_influencer_stt()
                )
                logger.info("인플루언서 STT 지연 시작 (팬 먼저 입장 케이스)")

        elif role == "FAN":
            # 팬 입장 → 통화 상태 생성 후 STT 시작
            async def fan_stt_loop() -> None:
                # start_fan_call()이 팬 attributes에서 call_session_id, fan_lang 읽고, 어댑터 생성하고, CallState 만듬
                # 예외를 잡지 않으면 이 task가 조용히 죽어 자막이 하나도 안 나온 이유를 알 수 없다.
                # (예: 같은 언어 통화에서 쓰는 Google STT 자격증명 파일을 읽지 못한 경우)
                try:
                    await start_fan_call(participant) # 여기서 _run_influencer_stt()도 실행됨
                except Exception:
                    logger.exception(
                        "팬 통화 시작 실패 — 이 팬의 자막을 만들 수 없다 participant=%s",
                        participant.identity,
                    )
                    return

                if current_call is None:
                    return

                # 실행 중인 자기 자신을 등록한다.
                # 별도 task에서 나중에 넣으면 start_fan_call의 await 지점에 따라 누락될 수 있다.
                current_call.fan_audio_task = asyncio.current_task()

                audio_stream = rtc.AudioStream(track)

                async def on_final(transcript: FinalTranscript) -> None:
                    if current_call and current_call.fan_identity == participant.identity:
                        await current_call.processor.handle_final(
                            transcript=transcript,
                            speaker_id=current_call.user_id,
                            speaker_role="FAN",
                            target_lang=current_call.assumed_influencer_lang,
                        )

                # 예외를 잡지 않으면 task가 조용히 죽어 자막이 멈춘 이유를 알 수 없다.
                try:
                    await current_call.fan_adapter.transcribe(
                        audio_stream=audio_stream,
                        language=current_call.fan_lang,
                        on_final=on_final,
                    )
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("팬 STT 중단 participant=%s", participant.identity)

            asyncio.create_task(fan_stt_loop())
            logger.info("팬 오디오 처리 시작 participant=%s", participant.identity)

    ctx.room.on("track_subscribed", on_track_subscribed)

    # ── 참가자 입장 이벤트 ────────────────────────────────────────────────
    # 트랙보다 먼저 오는 신호다. 인플루언서가 마이크를 늦게 켜도 이 시점에 언어가 확정되므로
    # 팬 통화가 잘못된 기본값으로 시작되지 않는다.

    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        apply_influencer_language(participant)

    ctx.room.on("participant_connected", on_participant_connected)

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
        if pending_summaries:
            # 순회 중 done_callback이 dict를 변경하므로 스냅샷을 뜬다.
            tasks = list(pending_summaries.keys())
            try:
                await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=SUMMARY_WAIT_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                # 여기서 그냥 닫으면 행이 GENERATING으로 남아 조회 API가 계속 202를 반환한다.
                # pool을 닫기 전에 남은 요약을 실패로 확정한다.
                unfinished = {
                    task: call_session_id
                    for task, call_session_id in pending_summaries.items()
                    if not task.done()
                }
                logger.warning(
                    "요약 완료 대기 %d초 초과 — 미완료 요약 %d건을 실패로 기록한다",
                    SUMMARY_WAIT_TIMEOUT_SECONDS, len(unfinished),
                )
                for task in unfinished:
                    task.cancel()
                for call_session_id in unfinished.values():
                    await _mark_summary_failed(call_session_id, "SHUTDOWN_TIMEOUT")
        await close_pool()

    ctx.add_shutdown_callback(on_shutdown)

    # ── Room 연결 ─────────────────────────────────────────────────────────

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info("Room 연결 완료 room=%s", ctx.room.name)

    # Agent는 팬 호출 시점에 배치되므로 인플루언서가 이미 방에 있는 경우가 많다.
    # 그때는 participant_connected가 오지 않으니 지금 있는 참가자를 한 번 훑어 언어를 확정한다.
    # 여기서 실패해도 통화는 계속돼야 하므로 예외를 삼키고 로그만 남긴다.
    try:
        for participant in list(ctx.room.remote_participants.values()):
            apply_influencer_language(participant)
    except Exception:
        logger.exception("기존 참가자에서 인플루언서 언어를 확정하지 못했다")

    logger.info("인플루언서 언어 확정 결과 influencer_lang=%s", influencer_lang)


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=my_agent,
            # 백엔드가 createDispatch("subtitle-agent")로 명시 배치하므로 worker 등록 이름을
            # 같게 맞춘다. 이름을 지정하면 자동 dispatch는 비활성화되고 이 이름의 Dispatch만 받는다.
            agent_name="subtitle-agent",
        )
    )
