import {
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react'
import { UserCircleIcon } from '@phosphor-icons/react'
import { ConnectionState, ParticipantKind, Track } from 'livekit-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useNavigate } from 'react-router-dom'
import {
  endCallSessionByFan,
  forceEndCallSession,
  getCallSessionStatus,
  isCallSessionEnded,
  type CallSessionStatusResponse,
} from '../../api/callSessions'
import { getAuthSession } from '../../api/auth'
import { useCallPhotoCapture } from '../../hooks/useCallPhotoCapture'
import { useCallRecording } from '../../hooks/useCallRecording'
import { AlertBanner } from '../feedback'
import { CallStage, type FloatingReaction } from './CallStage'
import { CallSummaryPanel } from './CallSummaryPanel'
import {
  CALL_CONTROL_DATA_TOPIC,
  encodeCallEndedSignal,
  parseCallEndedSignal,
} from './callControlChannel'
import { EndCallDialog } from './EndCallDialog'
import {
  REACTION_DATA_TOPIC,
  REACTION_EMOJIS,
  encodeReaction,
  isReactionEmoji,
  parseReaction,
} from './reactionChannel'
import {
  SUBTITLE_DATA_TOPIC,
  appendSubtitleLine,
  parseSubtitlePayload,
  shouldStartWithCaption,
  type SubtitleLine,
} from './subtitleChannel'
import type { MediaAction, VideoCallRoomProps } from './types'
import { useRemainingTime } from './useRemainingTime'
import { translate, useTranslation } from '../../i18n'

/**
 * 종료 시각을 넘긴 뒤 서버 status=ENDED를 기다려 주는 시간이다.
 *
 * 정상 흐름에서는 서버 스케줄러가 이 시간 안에 세션을 마감하므로 쓰이지 않는다.
 * 스케줄러가 멈춘 경우에만 팬 화면이 스스로 정리되도록 하는 안전망 값이다.
 */
const SERVER_END_GRACE_MS = 15_000

/**
 * 방금 끝난 통화의 길이를 "12분 34초" 형태로 만든다. 계산할 수 없으면 undefined다.
 *
 * `startedAt`·`endedAt`은 타임존 표기가 없는 KST LocalDateTime 문자열이다. 두 값의 **차이**만
 * 쓰므로 브라우저 타임존에 따른 해석 오차가 서로 상쇄된다.
 * (useRemainingTime의 diffMs와 같은 이유이며, 절대 시각 비교에는 쓰지 않는다.)
 */
function formatCallDuration(
  startedAt: string | null,
  endedAt: string | null,
): string | undefined {
  if (!startedAt || !endedAt) return undefined

  const startMs = Date.parse(startedAt)
  const endMs = Date.parse(endedAt)
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return undefined

  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000))
  if (totalSeconds === 0) return undefined

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return translate('connectedCallRoom.t46', { p0: seconds })
  return seconds > 0 ? translate('connectedCallRoom.t47', { p0: minutes, p1: seconds }) : translate('connectedCallRoom.t48', { p0: minutes })
}

/** 자막·이름 계산에 필요한 참가자 정보만 좁혀 받는다. (Participant·TrackReference 모두 이 형태를 만족한다) */
type ParticipantLike = {
  kind?: ParticipantKind
  identity?: string
  name?: string
  attributes?: Record<string, string>
}

/**
 * 참가자의 통화 역할을 읽는다.
 *
 * 백엔드가 LiveKit 토큰 attributes에 `role`을 FAN·INFLUENCER로 넣어 준다
 * (LiveKitAccessTokenService). 자막 AI 워커도 같은 attribute로 화자를 구분하므로,
 * 프론트도 identity 문자열을 추측하지 않고 이 값을 그대로 쓴다.
 */
function participantRole(participant: ParticipantLike): 'FAN' | 'INFLUENCER' | undefined {
  const role = participant.attributes?.role
  return role === 'FAN' || role === 'INFLUENCER' ? role : undefined
}

/**
 * 자막·상대 이름 계산에서 제외할 참가자인지 판단한다.
 *
 * 자막 AI 워커도 LiveKit Room의 참가자로 들어온다. 그래서 "첫 번째 원격 참가자"를 상대로
 * 삼으면 에이전트가 먼저 잡혀 상대 이름이 `agent`로 표시될 수 있다.
 *
 * 판정 순서는 확실한 근거부터다.
 * 1. role attribute가 FAN·INFLUENCER면 백엔드가 발급한 사람 토큰이다.
 * 2. LiveKit이 알려 주는 참가자 종류(kind). AI 워커는 livekit-agents 프레임워크로 붙어 AGENT다.
 * 3. 위 두 정보가 모두 없을 때만 이름·identity의 agent 표기를 본다.
 */
function isHumanParticipant(participant: ParticipantLike) {
  if (participantRole(participant)) return true
  if (participant.kind === ParticipantKind.AGENT) return false
  return !/agent|bot|subtitle/i.test(`${participant.identity ?? ''} ${participant.name ?? ''}`)
}

type ConnectedCallRoomProps = VideoCallRoomProps & {
  sessionStatus: CallSessionStatusResponse
  recordingEnabled: boolean
  recordingPolicyError?: string
  /** 팬미팅 운영 설정의 1인당 통화 시간(초)이며 상세를 못 읽었으면 undefined다. */
  callDurationSec?: number
  /**
   * 의도치 않게 연결이 끊겨 새 토큰으로 다시 입장해야 할 때 호출한다.
   *
   * 호스트는 팬미팅 내내 한 토큰으로 머무는데 LiveKit 토큰 TTL은 15분이다.
   * 긴 팬미팅에서 연결이 끊기면 만료된 토큰으로는 재입장할 수 없어 재발급이 필요하다.
   */
  onReconnectNeeded?: () => void
  /**
   * 상대가 통화를 끝냈다고 알려 왔을 때 호출한다.
   *
   * 알림 자체를 종료 근거로 쓰지 않고, 통화 상태를 즉시 재조회하게 만드는 신호로만 쓴다.
   * 이것으로 양쪽 화면 전환 시점이 폴링 주기가 아니라 1회 왕복 지연으로 맞춰진다.
   */
  onPeerCallEnded?: () => void
}

export function ConnectedCallRoom({
  meetingId,
  callSessionId,
    participantLabel,
    endTo,
    sessionStatus,
    forceEndOnLeave,
    recordingEnabled,
    recordingPolicyError,
    callDurationSec,
    sidePanel,
    hostStaysConnected,
    onReconnectNeeded,
    onPeerCallEnded,
}: ConnectedCallRoomProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  /**
   * 통화 화면을 떠날 때 완료 화면에 함께 넘기는 값이다.
   *
   * 통화가 끝나면 대기열 스냅샷의 callSessionId가 null로 바뀌어(CALLED·IN_CALL에서만 채워진다)
   * 완료 화면이 세션을 다시 찾을 방법이 없다. 기념 카드는 통화 세션 단위라 이 값이 필요하므로
   * 화면을 떠나는 시점에 함께 넘긴다.
   */
  const endNavigationState = useMemo(
    () => (callSessionId ? { callSessionId } : undefined),
    [callSessionId],
  )
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const participants = useParticipants()
  const cameraTracks = useTracks([Track.Source.Camera])
  const microphoneTracks = useTracks([Track.Source.Microphone])
  const { isCameraEnabled, isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  /**
   * 이번 통화에서 자막을 켠 상태로 시작할지다. 양쪽 언어가 같으면 꺼진 상태로 시작한다.
   *
   * 언어는 통화 상태 응답에서 읽는다. LiveKit 토큰 attributes에는 자기 쪽 언어만 담겨 있어
   * 상대 언어를 알 수 없고, 상대 참가자 attributes를 기다리면 상대가 입장할 때까지 판단을
   * 미뤄야 해서 자막이 잠깐 보이다 사라진다. 상태 응답은 통화 화면을 그리기 전에 이미
   * 받아 두므로(VideoCallRoom) 첫 렌더부터 올바른 값으로 시작할 수 있다.
   */
  const captionDefaultEnabled = shouldStartWithCaption(
    sessionStatus.fanLanguage,
    sessionStatus.influencerLanguage,
  )
  const [captionEnabled, setCaptionEnabled] = useState(captionDefaultEnabled)
  const [mediaAction, setMediaAction] = useState<MediaAction>()
  const [mediaError, setMediaError] = useState<string>()
  const [departurePending, setDeparturePending] = useState(false)
  // 자동 종료가 폴링·틱마다 반복 실행되지 않도록 한 번만 통과시킨다.
  const autoEndStartedRef = useRef(false)
  // 통화 종료 알림을 보낸 세션이며, 같은 세션에 알림이 반복 발행되지 않게 막는다.
  const announcedEndForRef = useRef<string>(undefined)
  // 한 번이라도 연결된 뒤에 끊긴 경우만 재입장 대상으로 본다. 최초 연결 전 Disconnected와 구분한다.
  const wasConnectedRef = useRef(false)
  // 우리가 의도적으로 방을 떠나는 중이면 재입장하지 않는다.
  const leavingRef = useRef(false)
  const isConnected = connectionState === ConnectionState.Connected
  const isReconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  const remaining = useRemainingTime(sessionStatus, callDurationSec)
  // 자막 AI 에이전트도 Room 참가자로 들어온다. 에이전트를 제외한 '사람' 참가자만 상대로 봐야
  // 상대 이름·자막 화자 이름이 `agent`로 표시되지 않고, 연결 상태도 실제 상대 입장을 반영한다.
  const remoteParticipants = participants.filter(
    (participant) => !participant.isLocal && isHumanParticipant(participant),
  )
  const remoteParticipant = remoteParticipants[0]
  // 트랙도 같은 기준으로 고른다. 에이전트가 트랙을 올리지 않는 것이 정상이지만,
  // 올리더라도 상대 영상·오디오 자리를 차지하지 않게 한다.
  const remoteCameraTrack = cameraTracks.find(
    (track) => !track.participant.isLocal && isHumanParticipant(track.participant),
  )
  const localCameraTrack = cameraTracks.find((track) => track.participant.isLocal)
  const remoteMicrophoneTrack = microphoneTracks.find(
    (track) => !track.participant.isLocal && isHumanParticipant(track.participant),
  )
  const localMicrophoneTrack = microphoneTracks.find((track) => track.participant.isLocal)
  // 표시 이름은 LiveKit participant name을 우선한다. name이 없으면 identity 같은 내부 식별자를
  // 노출하지 않고 화면 라벨('팬 영상' → '팬')로 대체한다.
  const remoteName = remoteParticipant?.name || participantLabel.replace(/\s*영상$/, '')

  /**
   * 자막 AI가 데이터 채널로 보내는 대사를 모은다.
   *
   * 자막은 LiveKit 기본 transcription API로 오지 않는다. AI 워커가
   * `publish_data(topic="subtitle")`로 직접 만든 JSON을 보내므로 그 토픽을 구독해야 한다.
   * (이전에는 `useTranscriptions()`를 썼는데, 워커가 그 경로로 아무것도 publish하지 않아
   *  에이전트가 정상 동작해도 자막이 영원히 비어 있었다.)
   */
  const [subtitleLines, setSubtitleLines] = useState<SubtitleLine[]>([])

  // 백엔드 업로드 권한(FAN)과 팬미팅의 실제 녹화 설정이 모두 맞을 때만 녹화한다.
  const [authSession] = useState(() => getAuthSession())

  /**
   * 자막 앞에 붙일 역할별 표시 이름이다.
   *
   * 자막 payload의 `speaker_role`로 화자를 구분하므로 역할 → 이름 대응이 필요하다.
   * 데이터 채널의 sender는 AI 에이전트라 sender identity를 이름으로 쓰면 `agent`가 나온다.
   * 그래서 **role attribute가 일치하는 participant의 name**을 쓴다. 백엔드가 토큰에
   * `role`(FAN·INFLUENCER)과 `name`(회원 닉네임)을 함께 실어 주므로 추측이 필요 없다.
   * 아직 입장하지 않아 이름을 알 수 없으면 역할 기본 라벨('팬'·'인플루언서')로 둔다.
   */
  const subtitleSpeakerNames = useMemo(() => {
    const nameOf = (role: 'FAN' | 'INFLUENCER') =>
      participants.find((participant) => participantRole(participant) === role)?.name?.trim()

    return {
      influencer: nameOf('INFLUENCER') || t('connectedCallRoom.t18'),
      fan: nameOf('FAN') || t('connectedCallRoom.t19'),
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants])

  // 핸들러 identity가 바뀌면 데이터 채널 구독이 다시 걸릴 수 있고, 그 틈에 도착한 자막을
  // 놓칠 수 있다. 하필 그 시점이 상대 이름이 채워지는 통화 시작 직후여서 첫 대사가 사라진다.
  // 최신 값은 ref로 읽어 콜백 identity를 영구히 고정한다.
  const viewerRoleRef = useRef(authSession?.role)
  viewerRoleRef.current = authSession?.role
  const subtitleSpeakerNamesRef = useRef(subtitleSpeakerNames)
  subtitleSpeakerNamesRef.current = subtitleSpeakerNames

  const handleSubtitleMessage = useCallback((message: { payload: Uint8Array }) => {
    const payload = parseSubtitlePayload(message.payload)
    if (!payload) return

    setSubtitleLines((current) =>
      appendSubtitleLine(
        current,
        payload,
        viewerRoleRef.current,
        subtitleSpeakerNamesRef.current,
      ),
    )
  }, [])

  useDataChannel(SUBTITLE_DATA_TOPIC, handleSubtitleMessage)

  // 상대가 통화를 끝냈다는 알림을 받는다. 최신 콜백·세션 값은 ref로 읽어 구독이 다시 걸리지 않게 한다.
  // (구독이 재설정되는 틈에 알림이 도착하면 전환이 다시 폴링 주기만큼 늦어진다.)
  const onPeerCallEndedRef = useRef(onPeerCallEnded)
  onPeerCallEndedRef.current = onPeerCallEnded
  const callSessionIdRef = useRef(callSessionId)
  callSessionIdRef.current = callSessionId

  const handleCallControlMessage = useCallback((message: { payload: Uint8Array }) => {
    const signal = parseCallEndedSignal(message.payload)
    if (!signal) return
    // 팬이 교체되는 팬미팅에서는 이전 통화의 알림이 뒤늦게 도착할 수 있어 세션을 확인한다.
    if (signal.callSessionId !== callSessionIdRef.current) return

    // 알림을 종료 근거로 쓰지 않는다. 서버 상태를 즉시 다시 읽어 그 결과로만 화면을 정리한다.
    onPeerCallEndedRef.current?.()
  }, [])

  useDataChannel(CALL_CONTROL_DATA_TOPIC, handleCallControlMessage)

  /**
   * 화면에 떠오르는 중인 리액션이다.
   *
   * 표시 전용이라 서버에 남기지 않는다. 애니메이션이 끝나는 시간에 맞춰 스스로 사라지게 해
   * 목록이 무한정 자라지 않도록 한다.
   */
  const [floatingReactions, setFloatingReactions] = useState<readonly FloatingReaction[]>([])
  /** 리액션마다 고유 id를 만든다. 같은 이모지를 연달아 눌러도 React key가 겹치지 않아야 한다. */
  const reactionSeqRef = useRef(0)
  /** 정리해야 할 타이머들이다. 통화 화면을 떠날 때 남은 타이머를 모두 끊는다. */
  const reactionTimersRef = useRef<number[]>([])

  const showReaction = useCallback((emoji: string) => {
    const id = `reaction-${++reactionSeqRef.current}`
    // 가로 위치를 흩뿌려 연속으로 눌렀을 때 한 줄에 겹쳐 보이지 않게 한다.
    const leftPercent = 12 + Math.random() * 26
    setFloatingReactions((current) => [...current, { id, emoji, leftPercent }])

    // CSS 애니메이션(2200ms)이 끝난 뒤 목록에서 지운다.
    const timerId = window.setTimeout(() => {
      setFloatingReactions((current) => current.filter((item) => item.id !== id))
      reactionTimersRef.current = reactionTimersRef.current.filter((value) => value !== timerId)
    }, 2_400)
    reactionTimersRef.current.push(timerId)
  }, [])

  useEffect(
    () => () => {
      for (const timerId of reactionTimersRef.current) window.clearTimeout(timerId)
      reactionTimersRef.current = []
    },
    [],
  )

  /**
   * 팬이 대기실에서 적어 둔 "하고 싶은 말" 메모다.
   *
   * 대기실이 sessionStorage(`melly-fan-note:{meetingId}`)에 저장하고 "통화 화면에 함께
   * 표시됩니다"라고 안내하므로, 통화 중에 실제로 보여 줘야 한다. 같은 탭에서 대기실 → 통화로
   * 이동하므로 sessionStorage가 그대로 이어진다. 통화 중에는 바뀌지 않는 값이라 한 번만 읽는다.
   */
  const [fanMemo] = useState(() => {
    try {
      return window.sessionStorage.getItem(`melly-fan-note:${meetingId}`)?.trim() ?? ''
    } catch {
      return ''
    }
  })

  // 기념 사진은 팬만 남긴다. 녹화 설정과 무관하게 쓸 수 있어야 하므로 recordingEnabled를 보지 않는다.
  const {
    capture,
    photoCount,
    maxPhotoCount,
    captureError,
    canCapture,
    capturing,
  } = useCallPhotoCapture({
    callSessionId,
    remoteVideoTrack: remoteCameraTrack?.publication?.track?.mediaStreamTrack,
    // 내 카메라가 켜져 있으면 상대와 나란히 함께 찍힌다. 꺼져 있으면 상대만 찍힌다.
    localVideoTrack: isCameraEnabled
      ? localCameraTrack?.publication?.track?.mediaStreamTrack
      : undefined,
  })
  const photoCaptureVisible = authSession?.role === 'FAN' && isConnected

  const handleReactionMessage = useCallback(
    (message: { payload: Uint8Array }) => {
      const signal = parseReaction(message.payload)
      if (!signal) return
      showReaction(signal.emoji)
    },
    [showReaction],
  )

  useDataChannel(REACTION_DATA_TOPIC, handleReactionMessage)

  /**
   * 리액션을 보낸다.
   *
   * `publishData`는 보낸 사람에게 되돌아오지 않으므로 내 화면에도 직접 띄운다. 전송이 실패해도
   * 내 화면에는 보이게 해서, 표현이 씹힌 것처럼 느껴지지 않게 한다.
   */
  const sendReaction = useCallback(
    (emoji: string) => {
      if (!isReactionEmoji(emoji)) return
      showReaction(emoji)
      void localParticipant
        .publishData(encodeReaction(emoji), { reliable: true, topic: REACTION_DATA_TOPIC })
        .catch(() => undefined)
    },
    [localParticipant, showReaction],
  )

  /**
   * 통화가 끝났음을 같은 방의 다른 참가자에게 알린다.
   *
   * 실패해도 무시한다. 이 알림은 상대의 폴링을 앞당기는 힌트일 뿐이고, 못 보내면 상대는
   * 원래대로 다음 폴링에서 종료를 확인한다. 방을 떠나기 **전에** 보내야 전달된다.
   */
  const announceCallEnded = useCallback(async () => {
    if (!callSessionId) return
    try {
      await localParticipant.publishData(encodeCallEndedSignal(callSessionId), {
        reliable: true,
        topic: CALL_CONTROL_DATA_TOPIC,
      })
    } catch {
      // 힌트 전달 실패는 통화 종료 흐름을 막지 않는다.
    }
  }, [callSessionId, localParticipant])

  // 자막 초기값을 이미 적용한 통화 세션이다. 세션당 한 번만 적용해 사용자의 토글을 덮지 않는다.
  const captionDefaultAppliedForRef = useRef<number>(undefined)

  useEffect(() => {
    // 호스트는 팬미팅 내내 같은 화면에 머물러 팬만 교체되므로, 새 통화의 언어 조합으로
    // 자막 초기값을 다시 잡아야 한다. 기준은 **상태 응답이 말하는 세션**이다.
    // 활성 세션 ID를 기준으로 삼으면, 상태 폴링이 아직 이전 세션을 가리키는 순간에
    // 이전 통화의 언어로 잘못 판단할 수 있다.
    //
    // 같은 세션에서는 다시 실행되지 않으므로 사용자가 켠 자막은 통화가 끝날 때까지 유지된다.
    const statusSessionId = sessionStatus.callSessionId
    if (captionDefaultAppliedForRef.current === statusSessionId) return

    captionDefaultAppliedForRef.current = statusSessionId
    setCaptionEnabled(captionDefaultEnabled)
  }, [captionDefaultEnabled, sessionStatus.callSessionId])

  useEffect(() => {
    // 팬이 교체되면 이전 팬의 대사를 비운다.
    // 호스트는 팬미팅 내내 같은 방에 머물기 때문에 화면이 저절로 초기화되지 않아,
    // 통화 세션이 바뀔 때 직접 지워야 이전 팬의 자막이 새 통화에 남지 않는다.
    setSubtitleLines([])
    // 마무리 화면에 쓰는 상대 이름도 함께 비운다. 이전 팬 이름이 새 통화에 남으면 안 된다.
    setLastRemoteName(undefined)
    // 게이지 분모도 통화마다 다시 잰다. 이전 통화의 최댓값을 물려받으면 비율이 어긋난다.
    timeRatioBaseRef.current = 0
  }, [callSessionId])

  // 통화가 끝나면 상대가 방을 떠나 이름을 알 수 없게 된다. 마무리 화면에서 "○○님과의 통화가
  // 끝났어요"를 보여 주려면 통화 중에 이름을 기억해 두어야 한다.
  const [lastRemoteName, setLastRemoteName] = useState<string>()
  useEffect(() => {
    const name = remoteParticipant?.name?.trim()
    if (name) setLastRemoteName(name)
  }, [remoteParticipant?.name])
  const {
    stopAndUpload,
    retryUpload,
    recordingState,
    recordingError,
    hasPendingRecording,
    pendingRecordingPersisted,
  } = useCallRecording({
    enabled: authSession?.role === 'FAN' && recordingEnabled && isConnected,
    meetingId,
    callSessionId,
    authToken: authSession?.accessToken,
    remoteVideoTrack: remoteCameraTrack?.publication?.track?.mediaStreamTrack,
    remoteAudioTrack: remoteMicrophoneTrack?.publication?.track?.mediaStreamTrack,
    localAudioTrack: localMicrophoneTrack?.publication?.track?.mediaStreamTrack,
  })

  async function toggleCamera() {
    setMediaAction('camera')
    setMediaError(undefined)

    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled)
    } catch (error: unknown) {
      setMediaError(error instanceof Error ? error.message : t('connectedCallRoom.t20'))
    } finally {
      setMediaAction(undefined)
    }
  }

  async function toggleMicrophone() {
    setMediaAction('microphone')
    setMediaError(undefined)

    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
    } catch (error: unknown) {
      setMediaError(error instanceof Error ? error.message : t('connectedCallRoom.t21'))
    } finally {
      setMediaAction(undefined)
    }
  }

  /**
   * 녹화를 마무리하고 Room에서 나간 뒤 종료 화면으로 이동한다.
   *
   * @param notifyServer 서버 세션도 함께 종료할지 여부이며, 제한 시간이 지나 서버가 이미
   *   TIMEOUT으로 마감하는 경우에는 false로 넘겨 종료 사유를 덮어쓰지 않는다.
   */
  const finishCall = useCallback(
    async (notifyServer: boolean) => {
      // 녹화 업로드가 실패하면 파일을 보존한 채 이 화면에서 즉시 재시도할 수 있게 한다.
      const recordingSaved = await stopAndUpload()

      if (notifyServer && callSessionId && (forceEndOnLeave || authSession?.role === 'FAN')) {
        const authToken = authSession?.accessToken
        try {
          if (authSession?.role === 'FAN') {
            // FAN 전용 정상 종료 API를 연결해 LiveKit 연결뿐 아니라 서버 세션도 즉시 종료한다.
            await endCallSessionByFan(callSessionId, { authToken })
          } else {
            await forceEndCallSession(
              callSessionId,
              { reason: t('connectedCallRoom.t22') },
              { authToken },
            )
          }
        } catch (error: unknown) {
          // 다른 경로에서 이미 종료된 경우에는 성공으로 간주하고, 그 외 실패는 화면에 남아 재시도하게 한다.
          const latestStatus = await getCallSessionStatus(callSessionId, { authToken })
            .catch(() => undefined)
          if (!latestStatus || !isCallSessionEnded(latestStatus)) {
            setMediaError(
              error instanceof Error
                ? error.message
                : t('connectedCallRoom.t23'),
            )
            return
          }
        }
      }

      // 방을 떠나기 전에 상대에게 종료를 알린다. 그래야 상대가 다음 폴링을 기다리지 않고
      // 곧바로 상태를 다시 읽어 양쪽 화면이 거의 같은 시점에 전환된다.
      await announceCallEnded()

      // 호스트는 팬미팅 내내 같은 방을 쓴다. 통화만 끝내고 방에 머물러 다음 팬을 기다린다.
      // 상태 폴링이 ENDED를 확인하면 화면이 대기 상태로 바뀐다.
      if (hostStaysConnected) return

      await room.disconnect()
      if (!recordingSaved) {
        setDeparturePending(true)
        return
      }
      navigate(endTo, { state: endNavigationState })
    },
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 콜백을 다시 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      announceCallEnded,
      authSession,
      callSessionId,
      endTo,
      forceEndOnLeave,
      hostStaysConnected,
      navigate,
      room,
      stopAndUpload,
    ],
  )

  /**
   * 방을 완전히 떠난다.
   *
   * 호스트는 통화 종료(finishCall)와 팬미팅 진행 종료를 구분해야 하므로 별도 경로로 둔다.
   */
  const leaveRoom = useCallback(async () => {
    leavingRef.current = true
    await room.disconnect()
    navigate(endTo, { state: endNavigationState })
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endTo, navigate, room])

  async function handleRecordingRetry() {
    const uploaded = await retryUpload()
    if (uploaded && departurePending) navigate(endTo, { state: endNavigationState })
  }

  useEffect(() => {
    // 카운트다운이 0이 되어도 **프론트가 먼저 통화를 끊지 않는다.**
    //
    // 이전에는 팬이 remaining.expired 즉시 통화를 마무리했다. 그러면 팬은 로컬 타이머 기준으로
    // 바로 끊기고 인플루언서는 상태 폴링이 ENDED를 읽을 때까지 남아, 양쪽 화면 전환 시점이
    // 어긋났다. 이제 타이머는 표시용이고 실제 종료·화면 정리는 서버 status=ENDED가 기준이다.
    // (아래 sessionStatus.status === 'ENDED' 효과가 정리를 담당한다.)
    //
    // 여기 남은 것은 **안전망**이다. 서버 스케줄러가 세션을 마감하지 못하면 통화가 무한정
    // 열려 있게 되므로, 종료 시각을 한참 넘겨도 ACTIVE면 팬 쪽에서 화면을 정리한다.
    // 종료 사유를 NORMAL로 덮어쓰지 않도록 서버 종료 API는 호출하지 않는다(notifyServer=false).
    // 백엔드가 call_ended 이벤트를 추가하면 이 안전망도 함께 정리할 수 있다.
    if (!remaining.expired || sessionStatus.status !== 'ACTIVE') return
    if (authSession?.role !== 'FAN') return
    if (autoEndStartedRef.current) return

    const timer = window.setTimeout(() => {
      autoEndStartedRef.current = true
      void finishCall(false)
    }, SERVER_END_GRACE_MS)

    // 그 사이 서버가 ENDED로 바뀌면 이 효과가 정리되며 타이머도 함께 취소된다.
    return () => window.clearTimeout(timer)
  }, [authSession?.role, finishCall, remaining.expired, sessionStatus.status])

  function continueWithPendingRecording() {
    // IndexedDB에 보관한 세션 ID를 완료 화면에 전달해 그곳에서도 재시도할 수 있게 한다.
    navigate(endTo, {
      state: hasPendingRecording && pendingRecordingPersisted && callSessionId
        ? { ...endNavigationState, pendingRecordingSessionId: callSessionId }
        : endNavigationState,
    })
  }

  // 서버가 세션을 마감했는지다. status 문자열이 'ENDED'가 아니어도 endedAt이 있으면 끝난 것으로
  // 본다. 문자열 하나에만 묶어 두면 서버가 다른 상태 값으로 마감했을 때 팬이 방에서 못 나간다.
  const sessionEnded = isCallSessionEnded(sessionStatus)

  useEffect(() => {
    if (!sessionEnded) {
      return
    }

    // 서버 종료를 내가 먼저 확인했으면 상대에게도 알려, 상대가 남은 폴링 주기를 기다리지 않게 한다.
    // (시간 만료처럼 어느 쪽도 종료 버튼을 누르지 않은 경우에 특히 필요하다.)
    // 양쪽이 동시에 보내도 수신 측은 상태 재조회만 하므로 문제가 없다.
    //
    // 통화 세션당 한 번만 보낸다. 이 효과는 localParticipant 참조가 바뀔 때도 다시 실행되는데,
    // 호스트는 ENDED 상태로 다음 팬을 기다리며 머물기 때문에 가드가 없으면 알림이 반복 발행된다.
    if (callSessionId && announcedEndForRef.current !== callSessionId) {
      announcedEndForRef.current = callSessionId
      void announceCallEnded()
    }

    // 호스트는 팬이 교체될 때마다 세션이 ENDED가 된다. 여기서 방을 나가고 화면을 이탈하면
    // 차례가 넘어갈 때마다 통화 화면에서 튕겨 나가므로, 방을 유지한 채 다음 팬을 기다린다.
    if (hostStaysConnected) {
      return
    }

    void stopAndUpload().then(async (recordingSaved) => {
      await room.disconnect()
      if (recordingSaved) {
        navigate(endTo, { replace: true, state: endNavigationState })
      } else {
        setDeparturePending(true)
      }
    })
  }, [
    announceCallEnded,
    callSessionId,
    // callSessionId에서만 파생되는 값이라 이 목록에 넣어도 효과가 더 자주 실행되지 않는다.
    endNavigationState,
    endTo,
    hostStaysConnected,
    navigate,
    room,
    sessionEnded,
    stopAndUpload,
  ])

  useEffect(() => {
    if (isConnected) wasConnectedRef.current = true
  }, [isConnected])

  useEffect(() => {
    if (!hostStaysConnected || !onReconnectNeeded) return
    if (connectionState !== ConnectionState.Disconnected) return
    // 최초 연결 전이거나 우리가 나가는 중이면 재입장 대상이 아니다.
    if (!wasConnectedRef.current || leavingRef.current) return

    // 토큰 TTL(15분)이 지나면 기존 토큰으로는 다시 못 붙으므로 새로 발급받아 재입장한다.
    wasConnectedRef.current = false
    onReconnectNeeded()
  }, [connectionState, hostStaysConnected, onReconnectNeeded])

  /** 호스트가 방에 머문 채 다음 팬 배정을 기다리는 상태다. */
  /**
   * 남은 시간 게이지의 분모다. 지금까지 본 가장 큰 남은 시간을 100%로 잡는다.
   *
   * 팬미팅 운영 설정의 `callDurationSec`을 쓰면 가장 정확하지만, 그 값은 통화 진입 시 **별도
   * 상세 조회**로 받아 오므로 그 요청이 실패하면 undefined로 남는다. 게이지는 보조 표현일 뿐인데
   * 그 때문에 통째로 사라지면 안 되므로, 값을 못 받은 경우에는 카운트다운에서 관측한 최댓값을
   * 분모로 쓴다. 서버가 준 남은 시간만으로도 비율을 만들 수 있다.
   */
  const timeRatioBaseRef = useRef(0)
  if (remaining.counting) {
    timeRatioBaseRef.current = Math.max(
      timeRatioBaseRef.current,
      remaining.seconds,
      callDurationSec ?? 0,
    )
  }
  const timeRatioBase = timeRatioBaseRef.current

  const waitingForNextFan = Boolean(hostStaysConnected) && sessionEnded
  /** 방금 끝난 통화의 길이다. 서버가 시각을 주지 않았으면 표시하지 않는다. */
  const finishedDurationLabel = formatCallDuration(sessionStatus.startedAt, sessionStatus.endedAt)

  let connectionLabel = t('connectedCallRoom.t24')

  if (waitingForNextFan) {
    connectionLabel = t('connectedCallRoom.t25')
  } else if (isConnected && remoteParticipants.length > 0) {
    connectionLabel = t('connectedCallRoom.t26')
  } else if (isConnected) {
    connectionLabel = t('connectedCallRoom.t27')
  } else if (isReconnecting) {
    connectionLabel = t('connectedCallRoom.t28')
  } else if (connectionState === ConnectionState.Disconnected) {
    connectionLabel = t('connectedCallRoom.t29')
  }

  // dc.html의 connecting·disconnected 오버레이. 연결이 정상이면 아무것도 덮지 않는다.
  const overlay = isReconnecting
    ? {
        title: t('connectedCallRoom.t30'),
        description: t('connectedCallRoom.t31'),
        showLink: true,
      }
    : connectionState === ConnectionState.Connecting
      ? {
          title: t('connectedCallRoom.t32'),
          description: t('connectedCallRoom.t33'),
          showLink: true,
        }
      : connectionState === ConnectionState.Disconnected && !departurePending
        ? {
            title: t('connectedCallRoom.t34'),
            description: t('connectedCallRoom.t35'),
            showLink: false,
            actionLabel: t('connectedCallRoom.t36'),
            // LiveKit 자동 복구가 끝내 실패한 상태라, 토큰 발급부터 다시 시작한다.
            onAction: () => window.location.reload(),
          }
        : undefined

  // dc.html의 device-error — 통화를 가리지 않고 상단 배너로 원인과 복구 행동을 준다.
  const deviceAlert = mediaError
    ? {
        title: t('connectedCallRoom.t37'),
        description: mediaError,
        actionLabel: t('connectedCallRoom.t38'),
        onAction: () => {
          setMediaError(undefined)
          void localParticipant.setCameraEnabled(true).catch(() => undefined)
          void localParticipant.setMicrophoneEnabled(true).catch(() => undefined)
        },
      }
    : undefined

  // 방금 누른 조작의 결과(사진 저장 실패)를 다른 안내보다 먼저 알린다.
  // 통화를 막는 오류가 아니므로 배너가 아니라 같은 자리의 보조 문구로 둔다.
  const footNote = captureError
    ? captureError
    : mediaError
    ? t('connectedCallRoom.t39')
    : isReconnecting
      ? t('connectedCallRoom.t40')
      : authSession?.role === 'FAN' && recordingEnabled
        ? t('connectedCallRoom.t41')
        : undefined

  const remoteVideo = remoteCameraTrack ? (
    <VideoTrack
      aria-label={participantLabel}
      className="size-full object-cover"
      trackRef={remoteCameraTrack}
    />
  ) : (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-[#23242a] px-6 text-center text-white/70">
      <UserCircleIcon aria-hidden="true" size={64} weight="thin" />
      <p className="font-semibold text-white">{remoteName}</p>
      <p className="text-sm">{t('connectedCallRoom.t1')}</p>
    </div>
  )

  const localVideo =
    localCameraTrack && isCameraEnabled ? (
      <VideoTrack
        aria-label={t('connectedCallRoom.t2')}
        className="size-full -scale-x-100 object-cover"
        trackRef={localCameraTrack}
      />
    ) : (
      <div className="flex size-full items-center justify-center bg-[#23242a] text-white/70">
        <UserCircleIcon aria-hidden="true" size={48} weight="thin" />
      </div>
    )

  return (
    // 어두운 콘솔 — 헤더 아래를 통째로 다크 면으로 칠한다. (강도 1, 코랄 0회)
    <div className="-mx-3 -my-5 min-h-[calc(100dvh-var(--service-header-height))] bg-[var(--color-surface-dark)] px-4 pb-8 pt-[22px] sm:-mx-6 sm:px-6 lg:-mx-10 lg:-my-6 lg:px-10">
      <div
        className={`mx-auto grid w-full items-start gap-[22px] ${sidePanel ? 'max-w-[1320px] min-[941px]:grid-cols-[minmax(0,1fr)_260px]' : 'max-w-[1240px]'}`}
      >
      <div className="grid min-w-0 gap-4">
      <RoomAudioRenderer />
      <CallStage
        cameraEnabled={isCameraEnabled}
        captionEnabled={captionEnabled}
        captionLines={subtitleLines}
        captureDisabled={!canCapture || capturing}
        captureLabel={
          capturing
            ? t('connectedCallRoom.capturing')
            : t('connectedCallRoom.captureCount', { p0: photoCount, p1: maxPhotoCount })
        }
        connected={isConnected}
        connectionLabel={connectionLabel}
        deviceAlert={deviceAlert}
        floatingReactions={floatingReactions}
        localVideo={localVideo}
        mediaAction={mediaAction}
        microphoneEnabled={isMicrophoneEnabled}
        onCameraToggle={() => void toggleCamera()}
        onCaptionToggle={() => setCaptionEnabled((enabled) => !enabled)}
        onCapture={photoCaptureVisible ? () => void capture() : undefined}
        onLeave={() => setEndDialogOpen(true)}
        onMicrophoneToggle={() => void toggleMicrophone()}
        onReactionSend={sendReaction}
        overlay={overlay}
        participantLabel={participantLabel}
        reactionEmojis={REACTION_EMOJIS}
        remoteName={remoteName}
        remoteVideo={remoteVideo}
        // 통화 시작 전에는 아직 줄어들 남은 시간이 없으므로 설정된 통화 시간임을 밝힌다.
        timeLabel={remaining.counting ? t('connectedCallRoom.t42') : t('connectedCallRoom.t43')}
        /*
          남은 시간 게이지 — 카운트다운이 실제로 진행 중일 때만 그린다.
          시작 전에는 줄어들 남은 시간이 없어 게이지가 항상 꽉 찬 채로 오해를 만든다.
        */
        timeRatio={
          remaining.counting && timeRatioBase > 0
            ? remaining.seconds / timeRatioBase
            : undefined
        }
        // 종료 직전에는 타이머가 경고색으로 바뀌어 마무리를 준비하게 한다.
        timeUrgent={remaining.counting && remaining.label <= '00:05'}
        timeValue={remaining.label}
      />

      {/* 대기실에서 적어 둔 메모 — 통화 중 하고 싶은 말을 잊지 않게 화면에 함께 둔다. */}
      {authSession?.role === 'FAN' && fanMemo ? (
        <div className="rounded-[10px] bg-white/[0.08] px-[18px] py-3.5">
          <p className="text-[13px] font-bold text-white/60">{t('connectedCallRoom.memo.title')}</p>
          <p className="mt-1 whitespace-pre-line text-[15px] font-medium leading-[1.6] text-white/90">
            “{fanMemo}”
          </p>
        </div>
      ) : null}

      {footNote ? (
        <p className="text-[15px] font-medium leading-[1.6] text-white/65">{footNote}</p>
      ) : null}

      {/*
        통화 마무리 — 통화가 끝나고 다음 팬을 기다리는 동안의 화면이다.
        이전에는 "다음 팬을 기다리고 있습니다" 안내 배너 한 줄뿐이어서, 방금 통화가 어땠는지
        돌아볼 것이 없고 다음 차례로 넘어가는 감각도 없었다. 방금 통화의 요약(상대·시간)과
        AI 대화 요약을 여기에 모아 마무리 단계를 만든다.
      */}
      {waitingForNextFan ? (
        <section aria-label={t('connectedCallRoom.t3')} className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
            <h2 className="text-[22px] font-black tracking-[-0.032em] text-white">
              {lastRemoteName
                ? t('connectedCallRoom.t49', { p0: lastRemoteName })
                : t('connectedCallRoom.t44')}
            </h2>
            {finishedDurationLabel ? (
              <p className="text-[15px] font-bold tabular-nums text-white/70">
                {t('connectedCallRoom.t4')} {finishedDurationLabel}
              </p>
            ) : null}
          </div>
          <p className="text-[15px] font-medium leading-[1.6] text-white/65">
            {t('connectedCallRoom.t5')}
          </p>

          {/*
            AI 대화 요약. 이미 만들어져 있었지만 어디에도 연결되어 있지 않던 패널이다.
            요약 조회는 인플루언서·운영자 권한이라 팬 화면에서는 호출하지 않는다(백엔드 403).
            패널 내부가 밝은 배경 기준으로 만들어져 있어 어두운 통화 콘솔 위에 흰 패널로 감싼다.
          */}
          {callSessionId && authSession?.role !== 'FAN' ? (
            <div className="overflow-hidden rounded-[var(--radius-panel)] bg-[var(--color-surface-panel)]">
              <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-divider)] px-6 py-4">
                <h3 className="text-[17px] font-extrabold tracking-[-0.03em]">{t('connectedCallRoom.t6')}</h3>
                <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                  {t('connectedCallRoom.t7')}
                </span>
              </div>
              <CallSummaryPanel callSessionId={callSessionId} />
            </div>
          ) : null}
        </section>
      ) : null}

      {authSession?.role === 'FAN' && recordingPolicyError ? (
        <AlertBanner title={t('connectedCallRoom.t8')} variant="warning">
          {recordingPolicyError}
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && !recordingPolicyError && !recordingEnabled ? (
        <AlertBanner title={t('connectedCallRoom.t9')} variant="info">
          {t('connectedCallRoom.t10')}
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && recordingState === 'recording' ? (
        <AlertBanner title={t('connectedCallRoom.t11')} variant="info">
          {t('connectedCallRoom.t12')}
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && recordingState === 'uploading' ? (
        <AlertBanner title={t('connectedCallRoom.t13')} variant="info">
          {t('connectedCallRoom.t14')}
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && recordingState === 'failed' ? (
        <AlertBanner title={t('connectedCallRoom.t15')} variant="error">
          <p>{recordingError ?? t('connectedCallRoom.t45')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-[var(--radius-control)] border border-current px-3 py-2 font-semibold"
              onClick={() => void handleRecordingRetry()}
              type="button"
            >
              {t('connectedCallRoom.t16')}
            </button>
            {departurePending && pendingRecordingPersisted ? (
              <button
                className="rounded-[var(--radius-control)] border border-current px-3 py-2 font-semibold"
                onClick={continueWithPendingRecording}
                type="button"
              >
                {t('connectedCallRoom.t17')}
              </button>
            ) : null}
          </div>
        </AlertBanner>
      ) : null}

      <EndCallDialog
        onConfirm={() => {
          setEndDialogOpen(false)
          void finishCall(true)
        }}
        onLeaveRoom={hostStaysConnected ? () => void leaveRoom() : undefined}
        onOpenChange={setEndDialogOpen}
        open={endDialogOpen}
      />
      </div>

      {sidePanel}
      </div>
    </div>
  )
}
