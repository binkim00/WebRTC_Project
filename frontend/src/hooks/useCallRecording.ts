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

/**
 * 녹화 컨테이너 후보이며 앞에 있는 것부터 실제 지원 여부를 확인해 고른다.
 *
 * <p>mp4를 앞세우는 이유는 팬이 내려받은 파일을 휴대폰 사진첩이나 기본 재생기에서 바로
 * 열 수 있기 때문이다. mp4 녹화를 지원하지 않는 브라우저(Firefox 등)에서는 뒤에 둔
 * webm으로 자연히 내려간다. 코덱까지 적은 후보를 먼저 두는 것은 브라우저마다 받아들이는
 * 코덱 표기가 달라서이며, 백엔드 {@code RecordingMediaType}은 세미콜론 앞 기본 타입만
 * 보므로 어느 표기로 정해져도 업로드 검증을 통과한다.
 */
const MIME_TYPE_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const

/**
 * 이 브라우저가 만들 수 있다고 답한 형식만 순서대로 남긴다.
 *
 * <p>마지막의 undefined는 형식을 지정하지 않고 브라우저 기본값에 맡기는 시도다. 어떤 후보도
 * 통과하지 못했을 때 녹화를 포기하지 않기 위한 마지막 수단이다.
 *
 * @returns 시도할 MIME 타입 목록이며 마지막 원소는 형식 미지정을 뜻하는 undefined
 */
function supportedMimeTypes(): (string | undefined)[] {
  if (typeof MediaRecorder === 'undefined') return []

  const supported = MIME_TYPE_CANDIDATES.filter((candidate) => {
    try {
      return MediaRecorder.isTypeSupported(candidate)
    } catch {
      // isTypeSupported 미지원 브라우저면 이 후보는 건너뛰고 기본값 시도에 맡긴다.
      return false
    }
  })

  return [...supported, undefined]
}

/**
 * 후보를 앞에서부터 실제로 만들어 보고 처음 성공한 녹화기를 돌려준다.
 *
 * <p><b>지원한다는 답과 실제로 만들 수 있는지는 다르다.</b> {@code isTypeSupported}가 true여도
 * 기기에 쓸 수 있는 인코더가 없으면 생성이나 start에서 예외가 난다. mp4(H.264)는 하드웨어
 * 인코더 사정을 타서 특히 그렇다. 후보 하나에 전부를 걸면 그 순간 녹화가 통째로 사라지고
 * 팬은 다시보기도 기념 카드 사진도 받지 못하므로, 실패하면 다음 후보(webm)로 내려간다.
 *
 * <p>리스너 등록을 호출 측 콜백으로 받는 이유는 start 전에 붙여야 첫 조각을 놓치지 않기
 * 때문이다. 시도가 실패하면 그 녹화기는 리스너째 버려진다.
 *
 * @param stream 녹화할 스트림
 * @param timesliceMs 조각을 끊을 간격(밀리초)
 * @param prepare start 직전에 녹화기에 리스너를 붙이는 콜백
 * @returns 녹화를 시작한 MediaRecorder
 * @throws 모든 후보가 실패한 경우 마지막 오류
 */
export function startRecorderWithFallback(
  stream: MediaStream,
  timesliceMs: number,
  prepare: (recorder: MediaRecorder) => void,
): MediaRecorder {
  const candidates = supportedMimeTypes()
  let lastError: unknown = new Error('사용할 수 있는 녹화 형식이 없습니다.')

  for (const candidate of candidates) {
    try {
      const recorder = candidate
        ? new MediaRecorder(stream, { mimeType: candidate })
        : new MediaRecorder(stream)
      prepare(recorder)
      recorder.start(timesliceMs)
      return recorder
    } catch (error: unknown) {
      lastError = error
      console.warn(`녹화 형식 ${candidate ?? '(브라우저 기본)'}으로 시작하지 못했습니다.`, error)
    }
  }

  throw lastError
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

      chunksRef.current = []
      const recorder = startRecorderWithFallback(stream, 1_000, (candidate) => {
        // 앞 후보가 조각을 남기고 실패했을 수 있으므로 시도마다 비운다. 형식이 섞인 조각을
        // 이어 붙이면 재생할 수 없는 파일이 된다.
        chunksRef.current = []
        candidate.addEventListener('dataavailable', (event: BlobEvent) => {
          if (event.data.size > 0) chunksRef.current.push(event.data)
        })
        candidate.addEventListener('error', (event) => {
          updateState('failed', translate('useCallRecording.t9'))
          console.warn('통화 녹화 중 오류가 발생했습니다.', event)
        })
      })
      // 실제로 무엇을 만드는지는 recorder가 안다. 요청한 형식을 브라우저가 그대로 쓰지
      // 않을 수 있는데, 잘못 적으면 업로드 확장자와 내용이 어긋나 다시보기가 깨진다.
      mimeTypeRef.current = recorder.mimeType || 'video/webm'
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
