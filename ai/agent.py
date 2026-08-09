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

# 팬 연결이 끊긴 뒤 실제 종료로 확정하기까지 기다리는 최대 시간의 기본값(초).
#
# LiveKit은 순간적인 네트워크 끊김에도 participant_disconnected를 보내고, 팬은 보통 1~2초 안에
# 같은 통화로 돌아온다. 곧바로 종료하면 그 통화의 요약이 재접속 전후로 두 번 만들어지고
# 자막도 끊긴다.
#
# 실제로는 통화마다 백엔드의 meeting_operation_settings.reconnect_grace_sec 를 읽어 쓴다.
# 백엔드가 "아직 재접속할 수 있는 통화"로 보고 있는데 Agent가 먼저 끝내 요약을 만들어 버리면
# 두 서비스의 판단이 어긋나기 때문이다. 이 상수는 그 값을 읽지 못했을 때만 쓰는 폴백이며
# backend MeetingOperationSetting.DEFAULT_RECONNECT_GRACE_SEC 와 같은 값이다.
DEFAULT_RECONNECT_GRACE_SECONDS = 60

# 유예를 기다리는 동안 백엔드의 통화 상태를 다시 확인하는 간격(초).
# 인플루언서가 통화를 끝내면 백엔드가 곧바로 세션을 ENDED로 바꾸므로, 유예를 끝까지 기다리지
# 않고 이 주기로 알아채 요약을 시작한다. 백엔드 만료 스케줄러도 1초 주기로 돈다.
BACKEND_STATE_POLL_SECONDS = 2

# 백엔드 유예가 만료된 뒤 백엔드가 실제로 통화를 끝낼 때까지 더 기다려 주는 여유(초).
# 백엔드는 만료 스케줄러가 도는 시점에 세션을 끝내므로 유예 시각보다 조금 늦다. 이 여유가
# 없으면 Agent가 근소하게 먼저 요약을 만들고, 그 사이 팬이 돌아오면 마지막 대화가 요약에서
# 빠진다. 백엔드가 끝내 응답하지 않을 때를 대비해 무한정 기다리지는 않는다.
BACKEND_END_MARGIN_SECONDS = 5


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
    # 이 통화가 속한 팬미팅의 재접속 유예시간(초). 백엔드 운영 설정에서 읽어 굳힌다.
    reconnect_grace_sec: int = DEFAULT_RECONNECT_GRACE_SECONDS
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

    # 재접속 유예 중인 종료 예약이며 (통화 식별자, task) 형태다.
    # 같은 팬이 유예 안에 돌아오면 취소하고, 유예를 넘기면 그때 실제 종료를 진행한다.
    pending_end: tuple[int, asyncio.Task] | None = None

    # 팬 입장 이벤트와 오디오 트랙 구독이 각각 통화 등록을 시도한다. 둘이 동시에 들어오면
    # 같은 통화의 상태가 두 벌 만들어져 프로세서가 새는데, 이 잠금으로 등록을 직렬화한다.
    call_setup_lock = asyncio.Lock()

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

    def _create_adapter(target_lang: str, need_translation: bool):
        """언어 조합에 맞는 STT 어댑터를 만든다.

        :param target_lang: 번역할 상대 언어 코드
        :param need_translation: 두 참가자의 언어가 달라 번역이 필요한지 여부
        :return: 번역이 필요하면 DeepL, 아니면 Google STT 어댑터
        """
        if need_translation:
            return DeepLVoiceAdapter(api_key=DEEPL_API_KEY, target_lang=target_lang)
        return GoogleSTTAdapter()

    async def _load_reconnect_grace_sec(call_session_id: int) -> int:
        """이 통화가 속한 팬미팅의 재접속 유예시간을 백엔드 설정에서 읽는다.

        읽지 못하면 기본값으로 돌아간다. 유예를 몰라 통화를 시작조차 못 하는 것보다는
        백엔드 기본값과 같은 값으로 진행하는 편이 낫다.

        :param call_session_id: 통화 세션 식별자
        :return: 재접속 유예시간(초)
        """
        try:
            value = await queries.get_reconnect_grace_sec(pool, call_session_id)
        except Exception:
            logger.exception(
                "재접속 유예시간 조회 실패 — 기본값 %s초를 쓴다 call_session_id=%s",
                DEFAULT_RECONNECT_GRACE_SECONDS, call_session_id,
            )
            return DEFAULT_RECONNECT_GRACE_SECONDS

        if not isinstance(value, int) or value <= 0:
            return DEFAULT_RECONNECT_GRACE_SECONDS
        return value

    async def ensure_fan_call(participant: rtc.RemoteParticipant) -> CallState | None:
        """팬 통화 상태를 등록하고 반환한다. 이미 같은 통화가 있으면 그대로 쓴다.

        **오디오 트랙을 기다리지 않는다.** 통화 세션 등록은 팬이 입장한 시점의 attributes만으로
        가능하고, 팬이 마이크를 켜지 않아 트랙 구독이 오지 않아도 통화는 진행되기 때문이다.
        예전에는 트랙 구독 시점에만 상태를 만들어, 마이크를 켜지 않은 팬은 통화 상태가 아예
        등록되지 않았고 종료 시 요약 흐름도 돌지 않았다.

        STT는 여기서 시작하지 않는다. 실제 오디오 트랙이 도착했을 때 start_fan_stt가 건다.

        :param participant: 입장한 팬 참가자
        :return: 등록된 통화 상태이며 attributes가 올바르지 않으면 None
        """
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
            return None

        # 팬이 (다시) 들어왔으므로 예약해 둔 종료를 되돌린다.
        cancel_pending_end("팬 입장")

        async with call_setup_lock:
            if current_call is not None:
                if current_call.call_session_id == call_session_id:
                    # 같은 통화다. 입장 이벤트와 트랙 구독이 각각 부르므로 여기로 자주 들어온다.
                    # 이미 만들어 둔 프로세서·시퀀스를 유지해야 자막 번호가 이어지고, 요약도
                    # 한 번만 만들어진다.
                    current_call.fan_identity = participant.identity
                    return current_call

                # 퇴장 이벤트가 새 팬 입장보다 늦게 도착하면 이전 통화가 정리되지 않은 채 덮여
                # 어댑터·STT task가 누수되고 그 통화의 요약도 트리거되지 않는다.
                logger.warning(
                    "이전 통화가 정리되지 않은 상태에서 새 팬 입장 — 먼저 정리한다 "
                    "prev_call_session_id=%s",
                    current_call.call_session_id,
                )
                await end_fan_call()

            # 이 통화 동안 쓸 인플루언서 언어를 여기서 한 번 고정한다.
            # 아래 need_translation 판정과 어댑터의 번역 방향이 모두 같은 값을 봐야 하며,
            # 어댑터는 생성 시점 값을 그대로 굳히므로 나중에 influencer_lang이 바뀌어도
            # 이 통화의 판정과 어긋나지 않게 한다.
            assumed_influencer_lang = influencer_lang
            need_translation = (assumed_influencer_lang != fan_lang)
            reconnect_grace_sec = await _load_reconnect_grace_sec(call_session_id)

            logger.info(
                "팬 입장 fan=%s call_session_id=%s fan_lang=%s influencer_lang=%s "
                "need_translation=%s reconnect_grace_sec=%s",
                participant.identity, call_session_id, fan_lang,
                assumed_influencer_lang, need_translation, reconnect_grace_sec,
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

            current_call = CallState(
                call_session_id=call_session_id,
                user_id=user_id,
                fan_identity=participant.identity,
                fan_lang=fan_lang,
                assumed_influencer_lang=assumed_influencer_lang,
                need_translation=need_translation,
                processor=processor,
                reconnect_grace_sec=reconnect_grace_sec,
                influencer_adapter=_create_adapter(fan_lang, need_translation),
                fan_adapter=None,
                sequence_counters=seq_counters,
            )

            # 인플루언서 트랙이 이미 있으면 인플루언서 STT 시작
            if influencer_track is not None:
                current_call.influencer_audio_task = asyncio.create_task(
                    _run_influencer_stt()
                )

            return current_call

    async def register_fan_call(participant: rtc.RemoteParticipant) -> None:
        """입장 이벤트에서 통화 상태만 등록한다.

        여기서 실패해도 트랙 구독 경로가 다시 등록을 시도하므로 예외를 삼키고 남기기만 한다.

        :param participant: 입장한 팬 참가자
        """
        try:
            await ensure_fan_call(participant)
        except Exception:
            logger.exception("팬 통화 등록 실패 participant=%s", participant.identity)

    # ── 팬 퇴장 처리 ──────────────────────────────────────────────────────

    def cancel_pending_end(reason: str) -> None:
        """예약해 둔 종료를 취소한다. 예약이 없으면 아무것도 하지 않는다.

        :param reason: 취소 사유이며 로그에만 쓴다
        """
        nonlocal pending_end
        if pending_end is None:
            return

        call_session_id, task = pending_end
        pending_end = None
        task.cancel()
        logger.info(
            "재접속 유예 취소(%s) call_session_id=%s", reason, call_session_id
        )

    async def _backend_call_finished(call_session_id: int) -> bool:
        """백엔드가 이 통화를 이미 끝냈는지 확인한다.

        조회에 실패하면 아직 끝나지 않은 것으로 본다. 통화가 살아 있는데 끝났다고 단정해
        요약을 먼저 만들어 버리는 쪽이 더 나쁘기 때문이다.

        :param call_session_id: 통화 세션 식별자
        :return: 통화 세션이 ENDED 또는 FAILED면 True
        """
        try:
            status = await queries.get_call_session_status(pool, call_session_id)
        except Exception:
            logger.exception(
                "통화 상태 조회 실패 — 유예를 계속 기다린다 call_session_id=%s", call_session_id
            )
            return False
        return status in ("ENDED", "FAILED")

    def schedule_end_after_grace(call_session_id: int, grace_seconds: int) -> None:
        """재접속 유예가 지나도 팬이 돌아오지 않으면 통화를 종료하도록 예약한다.

        유예를 그냥 세고만 있지 않는다. 백엔드가 통화를 끝냈으면(인플루언서가 종료했거나
        통화 시간이 다 됐거나 백엔드 쪽 유예가 만료된 경우) 더 기다릴 이유가 없으므로
        그 시점에 곧바로 마무리한다. 덕분에 정상 종료의 요약이 유예만큼 늦어지지 않는다.

        :param call_session_id: 연결이 끊긴 통화의 식별자
        :param grace_seconds: 이 팬미팅의 재접속 유예시간(초)
        """
        nonlocal pending_end
        if pending_end is not None:
            # 같은 통화에 퇴장 이벤트가 여러 번 와도 예약은 하나만 둔다.
            return

        async def end_after_grace() -> None:
            nonlocal pending_end
            # 백엔드가 유예 만료를 확정할 시간까지 조금 더 기다린다. 판단은 백엔드가 먼저 하고
            # Agent는 그 결과를 따라가야 두 서비스가 어긋나지 않는다.
            limit = grace_seconds + BACKEND_END_MARGIN_SECONDS
            waited = 0
            while waited < limit:
                step = min(BACKEND_STATE_POLL_SECONDS, limit - waited)
                await asyncio.sleep(step)
                waited += step
                if await _backend_call_finished(call_session_id):
                    logger.info(
                        "백엔드가 통화를 종료했다 — 유예를 더 기다리지 않는다 call_session_id=%s",
                        call_session_id,
                    )
                    break
            else:
                logger.warning(
                    "재접속 유예 %s초가 지나도 백엔드가 통화를 끝내지 않았다 — "
                    "Agent 쪽에서 마무리한다 call_session_id=%s",
                    limit, call_session_id,
                )

            # 여기서부터는 취소되지 않아야 한다. 유예가 끝난 뒤 팬이 돌아와도 정리는 그대로
            # 마치고, 새 입장은 다음 통화로 다뤄야 요약이 빠지지 않는다.
            pending_end = None
            if current_call is None or current_call.call_session_id != call_session_id:
                # 유예 중에 통화가 이미 정리됐거나 다른 팬으로 교체됐다.
                return
            await end_fan_call()

        pending_end = (call_session_id, asyncio.create_task(end_after_grace()))
        logger.info(
            "팬 연결 끊김 — 최대 %s초 재접속 유예 후 종료한다 call_session_id=%s",
            grace_seconds, call_session_id,
        )

    async def end_fan_call() -> None:
        """진행 중인 팬 통화를 정리하고 요약 생성을 예약한다.

        재접속은 여기까지 오지 않는다. 같은 통화로 다시 붙은 경우 ensure_fan_call이 기존
        상태를 그대로 쓰므로, 이 함수는 통화가 실제로 끝났을 때만 불린다.
        """
        nonlocal current_call
        if current_call is None:
            return

        call = current_call
        current_call = None

        logger.info(
            "팬 통화 정리 fan=%s call_session_id=%s",
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

        # 같은 통화의 요약이 이미 돌고 있으면 다시 걸지 않는다. 재접속처럼 종료 경로가 여러 번
        # 밟히는 상황에서 같은 call_session_id의 요약이 동시에 두 번 실행되는 것을 막는다.
        if call.call_session_id in pending_summaries.values():
            logger.info(
                "이미 진행 중인 요약이 있어 건너뛴다 call_session_id=%s",
                call.call_session_id,
            )
            return

        # 이 통화에서 실제로 쓰던 언어를 그대로 넘긴다. 메모 초안은 인플루언서 언어로,
        # 팬 카드 문구는 팬 언어로 나와야 하는데 요약 시점에는 팬이 이미 나가서
        # attributes를 다시 읽을 수 없다.
        task = asyncio.create_task(
            _trigger_summary(
                call.call_session_id, call.fan_lang, call.assumed_influencer_lang
            )
        )
        pending_summaries[task] = call.call_session_id
        task.add_done_callback(pending_summaries.pop)

    async def _trigger_summary(
        call_session_id: int, fan_lang: str, influencer_lang: str
    ) -> None:
        try:
            subtitles = await queries.get_subtitles_by_call(pool, call_session_id)
            if not subtitles:
                # STT가 아무것도 인식하지 못한 경우다. 조회 API가 "생성 중"과 구분할 수 있도록
                # 조용히 끝내지 않고 실패 사유를 남긴다.
                logger.warning("자막 없음 — 요약 스킵 call_session_id=%s", call_session_id)
                await queries.fail_call_summary(pool, call_session_id, "NO_SUBTITLE")
                return
            await generate_and_save_summary(
                pool, call_session_id, subtitles, fan_lang, influencer_lang
            )
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

    # ── 팬 STT 루프 ───────────────────────────────────────────────────────

    async def start_fan_stt(participant: rtc.RemoteParticipant, track: rtc.Track) -> None:
        """등록된 팬 통화에 실제 오디오 트랙을 붙여 STT를 시작한다.

        통화 상태 등록(ensure_fan_call)과 분리돼 있다. 팬이 마이크를 켜지 않으면 이 함수는
        아예 불리지 않지만, 통화 자체는 등록된 채로 진행되고 종료 시 요약 흐름도 돈다.

        재접속으로 새 트랙이 오면 죽은 트랙에 물려 있던 이전 어댑터와 task를 먼저 정리하고
        새 어댑터로 다시 건다. 프로세서와 시퀀스 카운터는 통화 것이므로 그대로 유지된다.

        :param participant: 오디오를 발행한 팬 참가자
        :param track: 구독된 팬 오디오 트랙
        """
        try:
            call = await ensure_fan_call(participant)
        except Exception:
            logger.exception(
                "팬 통화 시작 실패 — 이 팬의 자막을 만들 수 없다 participant=%s",
                participant.identity,
            )
            return

        if call is None:
            return

        # 재접속처럼 이전 트랙의 STT가 남아 있으면 먼저 끊는다. 죽은 오디오 스트림을 붙잡은
        # 채로 두면 task가 계속 살아 있고, 어댑터도 정리되지 않는다.
        previous_task = call.fan_audio_task
        if previous_task is not None and not previous_task.done():
            logger.info(
                "이전 팬 STT를 정리하고 새 트랙으로 다시 시작한다 call_session_id=%s",
                call.call_session_id,
            )
            if call.fan_adapter is not None:
                try:
                    await call.fan_adapter.close()
                except Exception:
                    logger.exception("이전 팬 STT 어댑터 close 실패")
            previous_task.cancel()

        adapter = _create_adapter(call.assumed_influencer_lang, call.need_translation)
        call.fan_adapter = adapter
        # 실행 중인 자기 자신을 등록한다.
        # 별도 task에서 나중에 넣으면 ensure_fan_call의 await 지점에 따라 누락될 수 있다.
        call.fan_audio_task = asyncio.current_task()

        audio_stream = rtc.AudioStream(track)

        async def on_final(transcript: FinalTranscript) -> None:
            if current_call is call:
                await call.processor.handle_final(
                    transcript=transcript,
                    speaker_id=call.user_id,
                    speaker_role="FAN",
                    target_lang=call.assumed_influencer_lang,
                )

        # 확정 전 부분 자막(번역 지연 감소용). DeepL만 호출하고 Google은 무시한다.
        async def on_interim(text: str, translated_text: str | None, segment_id: int) -> None:
            if current_call is call:
                await call.processor.push_interim(
                    speaker_role="FAN",
                    segment_id=segment_id,
                    text=text,
                    original_lang=call.fan_lang,
                    translated_text=translated_text,
                    translated_lang=call.assumed_influencer_lang,
                )

        # 예외를 잡지 않으면 task가 조용히 죽어 자막이 멈춘 이유를 알 수 없다.
        try:
            await adapter.transcribe(
                audio_stream=audio_stream,
                language=call.fan_lang,
                on_final=on_final,
                on_interim=on_interim,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("팬 STT 중단 participant=%s", participant.identity)

    # ── 인플루언서 STT 루프 ───────────────────────────────────────────────

    async def _run_influencer_stt() -> None:
        """인플루언서 트랙으로 STT 시작. 팬 교체 시 재시작됨.

        시작 시점의 통화를 call에 붙잡아 두고 콜백에서도 그 값만 쓴다. current_call을
        콜백 실행 시점에 읽으면 통화 경계에서 자막이 엉뚱한 세션으로 넘어간다.
        end_fan_call은 current_call을 None으로 만든 뒤 STT가 마지막 문장을 flush하도록
        최대 STT_DRAIN_TIMEOUT_SECONDS초를 기다리는데, 그 사이에 확정되는 문장은
        (a) 새 팬이 아직 없으면 current_call이 None이라 그대로 버려지고,
        (b) 새 팬이 들어왔으면 이전 통화의 발화가 새 세션 자막으로 저장된다.
        붙잡아 둔 통화를 쓰면 드레인의 원래 목적대로 마지막 문장이 제 통화에 남는다.
        (처리 순서상 processor.close()는 드레인이 끝난 뒤라 여기서 닫힌 프로세서를
        쓰게 되는 일은 없다)
        """
        call = current_call
        if call is None or influencer_track is None:
            return

        audio_stream = rtc.AudioStream(influencer_track)

        #문장 확정되면 이거 실행
        async def on_final(transcript: FinalTranscript) -> None:
            await call.processor.handle_final(
                transcript=transcript,
                speaker_id=influencer_user_id,
                speaker_role="INFLUENCER",
                target_lang=call.fan_lang,
            )

        # 확정 전 부분 자막(번역 지연 감소용). DeepL만 호출하고 Google은 무시한다.
        async def on_interim(text: str, translated_text: str | None, segment_id: int) -> None:
            await call.processor.push_interim(
                speaker_role="INFLUENCER",
                segment_id=segment_id,
                text=text,
                original_lang=call.assumed_influencer_lang,
                translated_text=translated_text,
                translated_lang=call.fan_lang,
            )

        # STT 원문 언어는 어댑터를 만들 때 고정한 값을 그대로 쓴다.
        # 최신 influencer_lang을 쓰면, 어댑터가 이미 그 언어를 번역 대상으로 잡고 있을 때
        # 원문과 번역 대상이 같아진 요청을 DeepL에 보내 자막이 통째로 실패할 수 있다.
        assumed_lang = call.assumed_influencer_lang

        # 예외를 잡지 않으면 task가 조용히 죽어 자막이 멈춘 이유를 알 수 없다.
        try:
            #어댑터에게 시킬일, 어댑터가 on_final의 상태를 결정함
            await call.influencer_adapter.transcribe(
                audio_stream=audio_stream,
                language=assumed_lang,
                # 문장이 확정되면 on_final을, 확정 전엔 on_interim을 처리하라는 뜻
                on_final=on_final,
                on_interim=on_interim,
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

            # 팬이 인플루언서보다 먼저 입장한 경우: ensure_fan_call 시점엔 트랙이 없어
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
            # 통화 상태는 입장 이벤트에서 이미 등록됐을 수 있다. 여기서는 그 상태에
            # 실제 오디오를 붙여 STT만 시작한다. (입장 이벤트를 놓쳤다면 여기서 등록된다)
            asyncio.create_task(start_fan_stt(participant, track))
            logger.info("팬 오디오 처리 시작 participant=%s", participant.identity)

    ctx.room.on("track_subscribed", on_track_subscribed)

    # ── 참가자 입장 이벤트 ────────────────────────────────────────────────
    # 트랙보다 먼저 오는 신호다. 인플루언서가 마이크를 늦게 켜도 이 시점에 언어가 확정되므로
    # 팬 통화가 잘못된 기본값으로 시작되지 않는다.

    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        apply_influencer_language(participant)
        # 팬은 마이크를 켜지 않을 수도 있고 트랙 구독이 늦게 올 수도 있다. 통화 등록을
        # 트랙에 걸어 두면 그런 팬은 통화 상태가 만들어지지 않아 종료 시 요약도 돌지 않는다.
        # attributes만으로 등록할 수 있으므로 여기서 먼저 등록하고, STT는 트랙이 올 때 건다.
        if participant.attributes.get("role") == "FAN":
            asyncio.create_task(register_fan_call(participant))

    ctx.room.on("participant_connected", on_participant_connected)

    # ── 팬 퇴장 이벤트 ────────────────────────────────────────────────────

    def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
        attributes = participant.attributes
        role = attributes.get("role")
        if role == "FAN" and current_call and current_call.fan_identity == participant.identity:
            # 곧바로 끝내지 않는다. 순간적인 네트워크 끊김과 실제 퇴장을 여기서는 구분할 수
            # 없으므로, 유예 시간 안에 같은 팬이 돌아오면 ensure_fan_call이 이 예약을 취소한다.
            # 유예 길이는 백엔드 운영 설정을 그대로 따른다.
            schedule_end_after_grace(
                current_call.call_session_id, current_call.reconnect_grace_sec
            )

    ctx.room.on("participant_disconnected", on_participant_disconnected)

    # ── shutdown hook — 이벤트 종료 시 ────────────────────────────────────

    async def on_shutdown() -> None:
        logger.info("이벤트 종료 — shutdown 시작")
        # 이벤트가 끝나면 팬이 돌아올 자리가 없다. 유예를 기다리지 않고 지금 확정한다.
        cancel_pending_end("이벤트 종료")
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

    # Agent는 팬 호출 시점에 배치되므로 인플루언서와 팬이 이미 방에 있는 경우가 많다.
    # 그때는 participant_connected가 오지 않으니 지금 있는 참가자를 한 번 훑는다.
    # 인플루언서는 언어를 확정하고, 팬은 통화 상태를 등록한다(마이크를 켜지 않아 트랙 구독이
    # 오지 않는 팬도 이 경로로 등록된다).
    # 여기서 실패해도 통화는 계속돼야 하므로 예외를 삼키고 로그만 남긴다.
    try:
        for participant in list(ctx.room.remote_participants.values()):
            apply_influencer_language(participant)
            if participant.attributes.get("role") == "FAN":
                await register_fan_call(participant)
    except Exception:
        logger.exception("기존 참가자를 확인하지 못했다")

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
