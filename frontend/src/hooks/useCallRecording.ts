import { useCallback, useEffect, useRef } from 'react'
import { uploadRecording } from '../api/recordings'

export type UseCallRecordingOptions = {
  /** FAN 역할이면서 통화가 연결됐을 때만 true로 준다. */
  enabled: boolean
  callSessionId?: string
  authToken?: string
  /** 상대방(인플루언서) 카메라 MediaStreamTrack */
  remoteVideoTrack?: MediaStreamTrack
  /** 상대방 마이크 MediaStreamTrack */
  remoteAudioTrack?: MediaStreamTrack
  /** 내 마이크 MediaStreamTrack */
  localAudioTrack?: MediaStreamTrack
}

export type UseCallRecordingResult = {
  /**
   * 녹화를 멈추고 서버에 업로드한다. 실패해도 절대 throw 하지 않으므로
   * 통화 종료·페이지 이동 직전에 안심하고 await 할 수 있다.
   */
  stopAndUpload: () => Promise<void>
}

const MIME_TYPE_CANDIDATES = [
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') {
    return undefined
  }

  for (const candidate of MIME_TYPE_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate
      }
    } catch {
      // isTypeSupported 미지원 브라우저면 다음 후보를 확인한다.
    }
  }

  return undefined
}

/**
 * 팬 측 통화 녹화 훅이다. 상대 영상 트랙과 양쪽 오디오 트랙을 하나의
 * MediaStream으로 합쳐 MediaRecorder로 녹화하고, 통화 종료 시 업로드한다.
 * 녹화·업로드가 실패해도 통화 UI를 깨뜨리지 않도록 모든 오류를 삼키고
 * console.warn으로만 남긴다.
 */
export function useCallRecording({
  enabled,
  callSessionId,
  authToken,
  remoteVideoTrack,
  remoteAudioTrack,
  localAudioTrack,
}: UseCallRecordingOptions): UseCallRecordingResult {
  const recorderRef = useRef<MediaRecorder | undefined>(undefined)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('video/webm')
  const startedAtRef = useRef<number | undefined>(undefined)
  const audioContextRef = useRef<AudioContext | undefined>(undefined)
  const uploadStartedRef = useRef(false)
  const uploadArgsRef = useRef<{ callSessionId?: string; authToken?: string }>({})

  uploadArgsRef.current = { callSessionId, authToken }

  const stopAndUpload = useCallback(async () => {
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
    }

    const audioContext = audioContextRef.current
    audioContextRef.current = undefined

    if (audioContext) {
      try {
        void audioContext.close()
      } catch {
        // 오디오 믹싱 자원 정리 실패는 무시한다.
      }
    }

    if (!recorder || uploadStartedRef.current) {
      return
    }

    const { callSessionId: sessionId, authToken: token } = uploadArgsRef.current
    const chunks = chunksRef.current
    chunksRef.current = []

    if (!sessionId || !token || chunks.length === 0) {
      return
    }

    uploadStartedRef.current = true

    const startedAt = startedAtRef.current
    const durationSec =
      startedAt !== undefined
        ? Math.max(1, Math.round((Date.now() - startedAt) / 1000))
        : undefined

    try {
      const blob = new Blob(chunks, { type: mimeTypeRef.current })
      await uploadRecording(sessionId, blob, durationSec, token)
    } catch (error: unknown) {
      console.warn('통화 녹화 업로드에 실패했습니다.', error)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !callSessionId || !authToken || recorderRef.current) {
      return
    }

    if (!remoteVideoTrack) {
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      console.warn('이 브라우저는 MediaRecorder를 지원하지 않아 통화 녹화를 건너뜁니다.')
      return
    }

    try {
      const stream = new MediaStream()
      stream.addTrack(remoteVideoTrack)

      // 오디오는 AudioContext로 믹싱해 원격·로컬 음성을 한 트랙으로 합친다.
      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      const audioTracks = [remoteAudioTrack, localAudioTrack].filter(
        (track): track is MediaStreamTrack => Boolean(track),
      )

      if (AudioContextCtor && audioTracks.length > 0) {
        try {
          const audioContext = new AudioContextCtor()
          const destination = audioContext.createMediaStreamDestination()

          for (const track of audioTracks) {
            try {
              const source = audioContext.createMediaStreamSource(new MediaStream([track]))
              source.connect(destination)
            } catch (error: unknown) {
              console.warn('녹화용 오디오 트랙을 믹싱하지 못했습니다.', error)
            }
          }

          for (const track of destination.stream.getAudioTracks()) {
            stream.addTrack(track)
          }

          audioContextRef.current = audioContext
        } catch (error: unknown) {
          console.warn('녹화용 오디오 믹싱을 준비하지 못했습니다.', error)
        }
      } else if (audioTracks.length > 0) {
        // AudioContext가 없으면 원본 오디오 트랙을 그대로 붙인다.
        for (const track of audioTracks) {
          stream.addTrack(track)
        }
      }

      const mimeType = pickSupportedMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      mimeTypeRef.current = mimeType ?? 'video/webm'
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      recorder.onerror = (event) => {
        console.warn('통화 녹화 중 오류가 발생했습니다.', event)
      }
      recorder.start(1_000)
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
    } catch (error: unknown) {
      console.warn('통화 녹화를 시작하지 못했습니다.', error)
    }
  }, [enabled, callSessionId, authToken, remoteVideoTrack, remoteAudioTrack, localAudioTrack])

  // 언마운트 시에도 녹화를 멈추고 최선을 다해 업로드한다.
  useEffect(() => {
    return () => {
      void stopAndUpload()
    }
  }, [stopAndUpload])

  return { stopAndUpload }
}
