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
  type CallSessionStatusResponse,
} from '../../api/callSessions'
import { getAuthSession } from '../../api/auth'
import { useCallRecording } from '../../hooks/useCallRecording'
import { AlertBanner } from '../feedback'
import { CallStage } from './CallStage'
import { CallSummaryPanel } from './CallSummaryPanel'
import {
  CALL_CONTROL_DATA_TOPIC,
  encodeCallEndedSignal,
  parseCallEndedSignal,
} from './callControlChannel'
import { EndCallDialog } from './EndCallDialog'
import {
  SUBTITLE_DATA_TOPIC,
  appendSubtitleLine,
  parseSubtitlePayload,
  type SubtitleLine,
} from './subtitleChannel'
import type { MediaAction, VideoCallRoomProps } from './types'
import { useRemainingTime } from './useRemainingTime'
import { useTranslation } from '../../i18n'

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
  if (minutes === 0) return `${seconds}초`
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`
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
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const participants = useParticipants()
  const cameraTracks = useTracks([Track.Source.Camera])
  const microphoneTracks = useTracks([Track.Source.Microphone])
  const { isCameraEnabled, isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [captionEnabled, setCaptionEnabled] = useState(true)
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
      influencer: nameOf('INFLUENCER') || '인플루언서',
      fan: nameOf('FAN') || '팬',
    }
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

  useEffect(() => {
    // 팬이 교체되면 이전 팬의 대사를 비운다.
    // 호스트는 팬미팅 내내 같은 방에 머물기 때문에 화면이 저절로 초기화되지 않아,
    // 통화 세션이 바뀔 때 직접 지워야 이전 팬의 자막이 새 통화에 남지 않는다.
    setSubtitleLines([])
    // 마무리 화면에 쓰는 상대 이름도 함께 비운다. 이전 팬 이름이 새 통화에 남으면 안 된다.
    setLastRemoteName(undefined)
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
      setMediaError(error instanceof Error ? error.message : '카메라 상태를 변경하지 못했습니다.')
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
      setMediaError(error instanceof Error ? error.message : '마이크 상태를 변경하지 못했습니다.')
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
              { reason: '영상통화 종료' },
              { authToken },
            )
          }
        } catch (error: unknown) {
          // 다른 경로에서 이미 종료된 경우에는 성공으로 간주하고, 그 외 실패는 화면에 남아 재시도하게 한다.
          const latestStatus = await getCallSessionStatus(callSessionId, { authToken })
            .catch(() => undefined)
          if (latestStatus?.status !== 'ENDED') {
            setMediaError(
              error instanceof Error
                ? error.message
                : '통화 종료 상태를 서버에 반영하지 못했습니다.',
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
      navigate(endTo)
    },
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
    navigate(endTo)
  }, [endTo, navigate, room])

  async function handleRecordingRetry() {
    const uploaded = await retryUpload()
    if (uploaded && departurePending) navigate(endTo)
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
        ? { pendingRecordingSessionId: callSessionId }
        : undefined,
    })
  }

  useEffect(() => {
    if (sessionStatus.status !== 'ENDED') {
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
        navigate(endTo, { replace: true })
      } else {
        setDeparturePending(true)
      }
    })
  }, [
    announceCallEnded,
    callSessionId,
    endTo,
    hostStaysConnected,
    navigate,
    room,
    sessionStatus.status,
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
  const waitingForNextFan = Boolean(hostStaysConnected) && sessionStatus.status === 'ENDED'
  /** 방금 끝난 통화의 길이다. 서버가 시각을 주지 않았으면 표시하지 않는다. */
  const finishedDurationLabel = formatCallDuration(sessionStatus.startedAt, sessionStatus.endedAt)

  let connectionLabel = '연결 중'

  if (waitingForNextFan) {
    connectionLabel = '다음 팬 대기 중'
  } else if (isConnected && remoteParticipants.length > 0) {
    connectionLabel = '연결 완료'
  } else if (isConnected) {
    connectionLabel = '입장 대기'
  } else if (isReconnecting) {
    connectionLabel = '연결 끊김'
  } else if (connectionState === ConnectionState.Disconnected) {
    connectionLabel = '연결 종료'
  }

  // dc.html의 connecting·disconnected 오버레이. 연결이 정상이면 아무것도 덮지 않는다.
  const overlay = isReconnecting
    ? {
        title: '연결이 끊어졌어요',
        description: '현재 화면을 유지한 채 연결 상태를 확인하고 있습니다.',
        showLink: true,
      }
    : connectionState === ConnectionState.Connecting
      ? {
          title: '영상통화를 연결하고 있어요',
          description: '잠시만 기다려 주세요.',
          showLink: true,
        }
      : connectionState === ConnectionState.Disconnected && !departurePending
        ? {
            title: '연결이 끊어졌어요',
            description: '현재 팬 정보는 그대로 유지됩니다.',
            showLink: false,
            actionLabel: '다시 연결',
            // LiveKit 자동 복구가 끝내 실패한 상태라, 토큰 발급부터 다시 시작한다.
            onAction: () => window.location.reload(),
          }
        : undefined

  // dc.html의 device-error — 통화를 가리지 않고 상단 배너로 원인과 복구 행동을 준다.
  const deviceAlert = mediaError
    ? {
        title: '장치를 확인해 주세요',
        description: mediaError,
        actionLabel: '장치 재확인',
        onAction: () => {
          setMediaError(undefined)
          void localParticipant.setCameraEnabled(true).catch(() => undefined)
          void localParticipant.setMicrophoneEnabled(true).catch(() => undefined)
        },
      }
    : undefined

  const footNote = mediaError
    ? '장치 문제가 계속되면 팬미팅을 나간 뒤 장비 점검을 다시 진행해 주세요.'
    : isReconnecting
      ? '통화 시간은 연결이 복구된 뒤부터 다시 계산됩니다.'
      : authSession?.role === 'FAN' && recordingEnabled
        ? '통화가 끝나면 녹화 영상이 저장되고, 남긴 말과 함께 기록에 보관됩니다.'
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
        connected={isConnected}
        connectionLabel={connectionLabel}
        deviceAlert={deviceAlert}
        localVideo={localVideo}
        mediaAction={mediaAction}
        microphoneEnabled={isMicrophoneEnabled}
        onCameraToggle={() => void toggleCamera()}
        onCaptionToggle={() => setCaptionEnabled((enabled) => !enabled)}
        onLeave={() => setEndDialogOpen(true)}
        onMicrophoneToggle={() => void toggleMicrophone()}
        overlay={overlay}
        participantLabel={participantLabel}
        remoteName={remoteName}
        remoteVideo={remoteVideo}
        // 통화 시작 전에는 아직 줄어들 남은 시간이 없으므로 설정된 통화 시간임을 밝힌다.
        timeLabel={remaining.counting ? '남은 시간' : '통화 시간'}
        // 종료 직전에는 타이머가 경고색으로 바뀌어 마무리를 준비하게 한다.
        timeUrgent={remaining.counting && remaining.label <= '00:05'}
        timeValue={remaining.label}
      />

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
                ? `${lastRemoteName}님과의 통화가 끝났어요`
                : '통화가 끝났어요'}
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
          <p>{recordingError ?? '브라우저에 임시 보관했으며 다시 업로드할 수 있습니다.'}</p>
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
