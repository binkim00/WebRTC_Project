import {
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  useTranscriptions,
} from '@livekit/components-react'
import { UserCircleIcon } from '@phosphor-icons/react'
import { ConnectionState, Track } from 'livekit-client'
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
import { EndCallDialog } from './EndCallDialog'
import type { MediaAction, VideoCallRoomProps } from './types'
import { useRemainingTime } from './useRemainingTime'

type ConnectedCallRoomProps = VideoCallRoomProps & {
  sessionStatus: CallSessionStatusResponse
  recordingEnabled: boolean
  recordingPolicyError?: string
  /** 팬미팅 운영 설정의 1인당 통화 시간(초)이며 상세를 못 읽었으면 undefined다. */
  callDurationSec?: number
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
}: ConnectedCallRoomProps) {
  const navigate = useNavigate()
  const room = useRoomContext()
  const connectionState = useConnectionState()
  const participants = useParticipants()
  const cameraTracks = useTracks([Track.Source.Camera])
  const microphoneTracks = useTracks([Track.Source.Microphone])
  const transcriptions = useTranscriptions()
  const { isCameraEnabled, isMicrophoneEnabled, localParticipant } = useLocalParticipant()
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const [captionEnabled, setCaptionEnabled] = useState(true)
  const [mediaAction, setMediaAction] = useState<MediaAction>()
  const [mediaError, setMediaError] = useState<string>()
  const [departurePending, setDeparturePending] = useState(false)
  // 자동 종료가 폴링·틱마다 반복 실행되지 않도록 한 번만 통과시킨다.
  const autoEndStartedRef = useRef(false)
  const isConnected = connectionState === ConnectionState.Connected
  const isReconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  const remaining = useRemainingTime(sessionStatus, callDurationSec)
  const remoteParticipants = participants.filter((participant) => !participant.isLocal)
  const remoteParticipant = remoteParticipants[0]
  const remoteCameraTrack = cameraTracks.find((track) => !track.participant.isLocal)
  const localCameraTrack = cameraTracks.find((track) => track.participant.isLocal)
  const remoteMicrophoneTrack = microphoneTracks.find((track) => !track.participant.isLocal)
  const localMicrophoneTrack = microphoneTracks.find((track) => track.participant.isLocal)
  const remoteName =
    remoteParticipant?.name ||
    remoteParticipant?.identity ||
    participantLabel.replace(/\s*영상$/, '')

  /**
   * 자막 스트림을 화자 이름이 붙은 최근 대사 목록으로 만든다.
   *
   * LiveKit은 같은 발화를 갱신하며 여러 번 보내므로 스트림 식별자로 마지막 값만 남긴다.
   * 마지막 한 줄만 쓰면 이전 대사가 즉시 사라져 읽을 시간이 없으므로 최근 세 줄을 유지한다.
   */
  const captionLines = useMemo(() => {
    const byStream = new Map<string, { speaker: string; text: string }>()
    for (const transcription of transcriptions) {
      const text = transcription.text.trim()
      if (!text) continue

      const { identity } = transcription.participantInfo
      const speaker =
        identity === localParticipant.identity
          ? '나'
          : participants.find((participant) => participant.identity === identity)?.name
            || remoteName
      byStream.set(transcription.streamInfo.id, { speaker, text })
    }

    return [...byStream.values()].slice(-3)
  }, [localParticipant.identity, participants, remoteName, transcriptions])

  // 백엔드 업로드 권한(FAN)과 팬미팅의 실제 녹화 설정이 모두 맞을 때만 녹화한다.
  const [authSession] = useState(() => getAuthSession())
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

      await room.disconnect()
      if (!recordingSaved) {
        setDeparturePending(true)
        return
      }
      navigate(endTo)
    },
    [authSession, callSessionId, endTo, forceEndOnLeave, navigate, room, stopAndUpload],
  )

  async function handleRecordingRetry() {
    const uploaded = await retryUpload()
    if (uploaded && departurePending) navigate(endTo)
  }

  useEffect(() => {
    // 카운트다운이 0이 되면 팬은 더 이상 통화할 수 없으므로 바로 통화를 마무리한다.
    // 서버 스케줄러가 1초 주기로 같은 세션을 TIMEOUT으로 마감하므로 종료 API는 호출하지 않고,
    // 종료 사유를 NORMAL로 덮어쓰지 않은 채 화면만 먼저 정리한다.
    if (!remaining.expired || sessionStatus.status !== 'ACTIVE') return
    if (authSession?.role !== 'FAN') return
    if (autoEndStartedRef.current) return

    autoEndStartedRef.current = true
    void finishCall(false)
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

    void stopAndUpload().then(async (recordingSaved) => {
      await room.disconnect()
      if (recordingSaved) {
        navigate(endTo, { replace: true })
      } else {
        setDeparturePending(true)
      }
    })
  }, [endTo, navigate, room, sessionStatus.status, stopAndUpload])

  let connectionLabel = '연결 중'

  if (isConnected && remoteParticipants.length > 0) {
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
      <p className="text-sm">상대방의 입장 또는 카메라 연결을 기다리고 있습니다.</p>
    </div>
  )

  const localVideo =
    localCameraTrack && isCameraEnabled ? (
      <VideoTrack
        aria-label="내 카메라"
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
        captionLines={captionLines}
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

      {authSession?.role === 'FAN' && recordingPolicyError ? (
        <AlertBanner title="녹화 설정 확인 실패" variant="warning">
          {recordingPolicyError}
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && !recordingPolicyError && !recordingEnabled ? (
        <AlertBanner title="녹화하지 않는 팬미팅" variant="info">
          이 통화는 팬미팅 운영 설정에 따라 녹화되지 않습니다.
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && recordingState === 'recording' ? (
        <AlertBanner title="통화 녹화 중" variant="info">
          팬미팅 설정에 따라 이 통화가 녹화되고 있습니다.
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && recordingState === 'uploading' ? (
        <AlertBanner title="녹화 영상 저장 중" variant="info">
          업로드가 끝날 때까지 이 화면을 닫지 말아 주세요.
        </AlertBanner>
      ) : null}

      {authSession?.role === 'FAN' && recordingEnabled && recordingState === 'failed' ? (
        <AlertBanner title="녹화 영상을 아직 저장하지 못했습니다" variant="error">
          <p>{recordingError ?? '브라우저에 임시 보관했으며 다시 업로드할 수 있습니다.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-[var(--radius-control)] border border-current px-3 py-2 font-semibold"
              onClick={() => void handleRecordingRetry()}
              type="button"
            >
              업로드 다시 시도
            </button>
            {departurePending && pendingRecordingPersisted ? (
              <button
                className="rounded-[var(--radius-control)] border border-current px-3 py-2 font-semibold"
                onClick={continueWithPendingRecording}
                type="button"
              >
                완료 화면에서 재시도
              </button>
            ) : null}
          </div>
        </AlertBanner>
      ) : null}

      <EndCallDialog
        onConfirm={() => void finishCall(true)}
        onOpenChange={setEndDialogOpen}
        open={endDialogOpen}
      />
      </div>

      {sidePanel}
      </div>
    </div>
  )
}
