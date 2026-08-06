import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/ApiError'
import {
  deletePendingRecording,
  getPendingRecording,
  savePendingRecording,
  type PendingRecording,
} from '../api/pendingRecordings'
import { uploadRecording } from '../api/recordings'
import { translate } from '../i18n'

export type UseCallRecordingOptions = {
  /** FAN 역할, 통화 연결, 팬미팅 녹화 설정이 모두 참일 때만 true다. */
  enabled: boolean
  meetingId?: string
  callSessionId?: string
  authToken?: string
  /** 상대방(인플루언서) 카메라 MediaStreamTrack */
  remoteVideoTrack?: MediaStreamTrack
  /** 상대방 마이크 MediaStreamTrack */
  remoteAudioTrack?: MediaStreamTrack
  /** 내 마이크 MediaStreamTrack */
  localAudioTrack?: MediaStreamTrack
}

export type CallRecordingState =
  | 'disabled'
  | 'waiting'
  | 'recording'
  | 'uploading'
  | 'uploaded'
  | 'failed'
  | 'unsupported'

export type UseCallRecordingResult = {
  /** 녹화를 멈추고 업로드한다. 서버 저장 성공 여부를 반환한다. */
  stopAndUpload: () => Promise<boolean>
  /** 메모리 또는 IndexedDB에 보관된 녹화 파일의 업로드를 다시 시도한다. */
  retryUpload: () => Promise<boolean>
  recordingState: CallRecordingState
  recordingError?: string
  hasPendingRecording: boolean
  pendingRecordingPersisted: boolean
}

const MIME_TYPE_CANDIDATES = [
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined

  for (const candidate of MIME_TYPE_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate
    } catch {
      // isTypeSupported 미지원 브라우저면 다음 후보를 확인한다.
    }
  }
  return undefined
}

function recordingErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'RECORDING_FILE_TOO_LARGE') {
      return translate('useCallRecording.t1')
    }
    if (error.status === 401) {
      return translate('useCallRecording.t2')
    }
    return error.message
  }
  return error instanceof Error
    ? error.message
    : translate('useCallRecording.t3')
}

/**
 * 팬 측 통화 녹화 훅이다. 상대 영상과 양쪽 음성을 하나의 파일로 만들고 통화 종료 시
 * 실제 녹화 API로 업로드한다. 업로드 전 Blob을 IndexedDB에 먼저 저장하므로 네트워크
 * 오류나 새로고침이 발생해도 같은 통화 화면에서 재시도할 수 있다.
 */
export function useCallRecording({
  enabled,
  meetingId,
  callSessionId,
  authToken,
  remoteVideoTrack,
  remoteAudioTrack,
  localAudioTrack,
}: UseCallRecordingOptions): UseCallRecordingResult {
  const recorderRef = useRef<MediaRecorder | undefined>(undefined)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef('video/webm')
  const startedAtRef = useRef<number | undefined>(undefined)
  const audioContextRef = useRef<AudioContext | undefined>(undefined)
  const pendingRef = useRef<PendingRecording | undefined>(undefined)
  const pendingPersistedRef = useRef(false)
  const uploadPromiseRef = useRef<Promise<boolean> | undefined>(undefined)
  const stopPromiseRef = useRef<Promise<boolean> | undefined>(undefined)
  const uploadArgsRef = useRef<{ callSessionId?: string; authToken?: string }>({})
  const mountedRef = useRef(true)
  const [recoveryChecked, setRecoveryChecked] = useState(false)
  const [recordingState, setRecordingState] = useState<CallRecordingState>(
    enabled ? 'waiting' : 'disabled',
  )
  const [recordingError, setRecordingError] = useState<string>()
  const [hasPendingRecording, setHasPendingRecording] = useState(false)
  const [pendingRecordingPersisted, setPendingRecordingPersisted] = useState(false)

  uploadArgsRef.current = { callSessionId, authToken }

  const updateState = useCallback((state: CallRecordingState, error?: string) => {
    if (!mountedRef.current) return
    setRecordingState(state)
    setRecordingError(error)
  }, [])

  const retryUpload = useCallback(async (): Promise<boolean> => {
    if (uploadPromiseRef.current) return uploadPromiseRef.current

    const uploadPromise = (async () => {
      const { callSessionId: sessionId, authToken: token } = uploadArgsRef.current
      if (!sessionId || !token) {
        updateState('failed', translate('useCallRecording.t4'))
        return false
      }

      let pending = pendingRef.current
      if (!pending) {
        try {
          pending = await getPendingRecording(sessionId)
          pendingRef.current = pending
        } catch (error: unknown) {
          console.warn('임시 보관된 녹화 영상을 읽지 못했습니다.', error)
        }
      }

      if (!pending) {
        pendingPersistedRef.current = false
        if (mountedRef.current) {
          setHasPendingRecording(false)
          setPendingRecordingPersisted(false)
        }
        return true
      }

      updateState('uploading')
      try {
        await uploadRecording(
          sessionId,
          pending.blob,
          pending.durationSec ?? undefined,
          token,
        )
        try {
          await deletePendingRecording(sessionId)
        } catch (error: unknown) {
          // 서버 저장은 끝났으므로 로컬 정리 실패가 성공 결과를 뒤집지는 않는다.
          console.warn('업로드된 임시 녹화 데이터를 정리하지 못했습니다.', error)
        }
        pendingRef.current = undefined
        pendingPersistedRef.current = false
        chunksRef.current = []
        if (mountedRef.current) {
          setHasPendingRecording(false)
          setPendingRecordingPersisted(false)
        }
        updateState('uploaded')
        return true
      } catch (error: unknown) {
        // 중복 응답은 이전 시도에서 이미 서버 저장까지 끝난 것으로 간주해 로컬 사본을 정리한다.
        if (error instanceof ApiError && error.code === 'RECORDING_ALREADY_EXISTS') {
          try {
            await deletePendingRecording(sessionId)
          } catch (cleanupError: unknown) {
            console.warn('중복 업로드의 임시 녹화 데이터를 정리하지 못했습니다.', cleanupError)
          }
          pendingRef.current = undefined
          pendingPersistedRef.current = false
          chunksRef.current = []
          if (mountedRef.current) {
            setHasPendingRecording(false)
            setPendingRecordingPersisted(false)
          }
          updateState('uploaded')
          return true
        }

        if (mountedRef.current) setHasPendingRecording(true)
        const recoveryHint = pendingPersistedRef.current
          ? translate('useCallRecording.t5')
          : translate('useCallRecording.t6')
        updateState('failed', `${recordingErrorMessage(error)}${recoveryHint}`)
        console.warn('통화 녹화 업로드에 실패해 브라우저에 임시 보관했습니다.', error)
        return false
      }
    })()

    uploadPromiseRef.current = uploadPromise
    try {
      return await uploadPromise
    } finally {
      uploadPromiseRef.current = undefined
    }
  }, [updateState])

  const stopAndUpload = useCallback((): Promise<boolean> => {
    if (stopPromiseRef.current) return stopPromiseRef.current

    const stopPromise = (async () => {
      const recorder = recorderRef.current
      recorderRef.current = undefined

      if (recorder) {
        try {
          if (recorder.state !== 'inactive') {
            await new Promise<void>((resolve) => {
              recorder.addEventListener('stop', () => resolve(), { once: true })
              try {
                recorder.stop()
              } catch {
                resolve()
              }
            })
          }
        } catch (error: unknown) {
          console.warn('통화 녹화를 종료하지 못했습니다.', error)
        }

        const audioContext = audioContextRef.current
        audioContextRef.current = undefined
        if (audioContext) {
          try {
            await audioContext.close()
          } catch {
            // 오디오 믹싱 자원 정리 실패는 업로드 결과에 영향을 주지 않는다.
          }
        }

        const { callSessionId: sessionId } = uploadArgsRef.current
        if (sessionId && chunksRef.current.length > 0) {
          const startedAt = startedAtRef.current
          const pending: PendingRecording = {
            callSessionId: sessionId,
            meetingId,
            blob: new Blob(chunksRef.current, { type: mimeTypeRef.current }),
            durationSec:
              startedAt === undefined
                ? null
                : Math.max(1, Math.round((Date.now() - startedAt) / 1_000)),
            savedAt: Date.now(),
          }
          pendingRef.current = pending
          if (mountedRef.current) setHasPendingRecording(true)

          // 업로드 전에 먼저 보관해 페이지가 닫혀도 재시도 가능한 사본을 남긴다.
          try {
            await savePendingRecording(pending)
            pendingPersistedRef.current = true
            if (mountedRef.current) setPendingRecordingPersisted(true)
          } catch (error: unknown) {
            pendingPersistedRef.current = false
            if (mountedRef.current) setPendingRecordingPersisted(false)
            console.warn('녹화 영상을 브라우저 임시 저장소에 보관하지 못했습니다.', error)
          }
        }
      }

      return retryUpload()
    })()

    stopPromiseRef.current = stopPromise
    void stopPromise.finally(() => {
      if (stopPromiseRef.current === stopPromise) stopPromiseRef.current = undefined
    })
    return stopPromise
  }, [meetingId, retryUpload])

  // 새로고침 등으로 남은 같은 통화의 미전송 파일을 먼저 복구한다.
  useEffect(() => {
    let active = true
    setRecoveryChecked(false)

    if (!callSessionId) {
      setRecoveryChecked(true)
      return () => {
        active = false
      }
    }

    void getPendingRecording(callSessionId)
      .then((pending) => {
        if (!active) return
        if (!pending) {
          pendingPersistedRef.current = false
          setPendingRecordingPersisted(false)
          return
        }
        pendingRef.current = pending
        pendingPersistedRef.current = true
        setHasPendingRecording(true)
        setPendingRecordingPersisted(true)
        updateState('failed', translate('useCallRecording.t7'))
      })
      .catch((error: unknown) => {
        // IndexedDB 미지원이어도 현재 통화의 메모리 녹화는 계속할 수 있다.
        console.warn('임시 녹화 복구 여부를 확인하지 못했습니다.', error)
      })
      .finally(() => {
        if (active) setRecoveryChecked(true)
      })

    return () => {
      active = false
    }
  }, [callSessionId, updateState])

  useEffect(() => {
    if (!enabled) {
      if (!recorderRef.current && !pendingRef.current) updateState('disabled')
      return
    }
    if (!recoveryChecked || pendingRef.current || recorderRef.current) return
    if (!callSessionId || !authToken || !remoteVideoTrack) {
      updateState('waiting')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      updateState('unsupported', translate('useCallRecording.t8'))
      return
    }

    try {
      const stream = new MediaStream([remoteVideoTrack])
      const AudioContextConstructor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      const audioTracks = [remoteAudioTrack, localAudioTrack].filter(
        (track): track is MediaStreamTrack => Boolean(track),
      )

      if (AudioContextConstructor && audioTracks.length > 0) {
        try {
          const audioContext = new AudioContextConstructor()
          const destination = audioContext.createMediaStreamDestination()
          for (const track of audioTracks) {
            const source = audioContext.createMediaStreamSource(new MediaStream([track]))
            source.connect(destination)
          }
          for (const track of destination.stream.getAudioTracks()) stream.addTrack(track)
          audioContextRef.current = audioContext
        } catch (error: unknown) {
          console.warn('녹화용 오디오 트랙을 믹싱하지 못했습니다.', error)
          for (const track of audioTracks) stream.addTrack(track)
        }
      } else {
        for (const track of audioTracks) stream.addTrack(track)
      }

      const mimeType = pickSupportedMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mimeTypeRef.current = mimeType ?? (recorder.mimeType || 'video/webm')
      chunksRef.current = []
      recorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      })
      recorder.addEventListener('error', (event) => {
        updateState('failed', translate('useCallRecording.t9'))
        console.warn('통화 녹화 중 오류가 발생했습니다.', event)
      })
      recorder.start(1_000)
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      updateState('recording')
    } catch (error: unknown) {
      updateState('failed', recordingErrorMessage(error))
      console.warn('통화 녹화를 시작하지 못했습니다.', error)
    }
  }, [
    authToken,
    callSessionId,
    enabled,
    localAudioTrack,
    recoveryChecked,
    remoteAudioTrack,
    remoteVideoTrack,
    updateState,
  ])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void stopAndUpload()
    }
  }, [stopAndUpload])

  return {
    stopAndUpload,
    retryUpload,
    recordingState,
    recordingError,
    hasPendingRecording,
    pendingRecordingPersisted,
  }
}
