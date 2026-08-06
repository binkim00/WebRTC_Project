import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getCapturedPhotos,
  saveCapturedPhotos,
  MAX_CAPTURED_PHOTOS,
} from '../api/capturedPhotos'
import { translate } from '../i18n'

export type UseCallPhotoCaptureOptions = {
  /** 사진을 묶어 둘 통화 세션 식별자 */
  callSessionId?: string
  /** 상대방(인플루언서) 카메라 MediaStreamTrack */
  remoteVideoTrack?: MediaStreamTrack
}

export type UseCallPhotoCaptureResult = {
  /** 지금 화면을 한 장 찍어 브라우저에 보관한다. */
  capture: () => Promise<void>
  /** 지금까지 찍은 장수 */
  photoCount: number
  /** 찍을 수 있는 최대 장수 */
  maxPhotoCount: number
  /** 마지막 촬영이 실패한 이유 */
  captureError?: string
  /** 셔터를 누를 수 있는 상태인지 */
  canCapture: boolean
  /** 저장 중이라 셔터가 잠깐 잠긴 상태인지 */
  capturing: boolean
}

/**
 * 통화 화면에서 팬이 누른 셔터로 상대 영상의 정지 프레임을 남기는 훅이다.
 *
 * <p>LiveKit이 준 MediaStreamTrack은 같은 출처의 스트림이라 canvas가 오염되지 않는다.
 * 그래서 그린 프레임을 그대로 PNG로 뽑을 수 있고, 기념 카드에 합성할 때도 제약이 없다.
 *
 * <p>사진은 서버에 올리지 않고 IndexedDB에만 둔다. 통화 화면을 떠난 뒤 완료 화면에서
 * 같은 통화 세션 식별자로 다시 찾아 카드로 만든다.
 *
 * @param options 통화 세션 식별자와 상대 영상 트랙
 * @returns 셔터 동작과 촬영 상태
 */
export function useCallPhotoCapture({
  callSessionId,
  remoteVideoTrack,
}: UseCallPhotoCaptureOptions): UseCallPhotoCaptureResult {
  const videoRef = useRef<HTMLVideoElement | undefined>(undefined)
  const canvasRef = useRef<HTMLCanvasElement | undefined>(undefined)
  const photosRef = useRef<Blob[]>([])
  const mountedRef = useRef(true)
  const [photoCount, setPhotoCount] = useState(0)
  const [captureError, setCaptureError] = useState<string>()
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 새로고침으로 훅이 다시 뜨면 이미 찍어 둔 사진을 이어받아 장수가 0으로 돌아가지 않게 한다.
  useEffect(() => {
    if (!callSessionId) {
      photosRef.current = []
      setPhotoCount(0)
      return
    }

    let active = true
    getCapturedPhotos(callSessionId)
      .then((stored) => {
        if (!active || !mountedRef.current) return
        photosRef.current = stored?.photos ?? []
        setPhotoCount(photosRef.current.length)
      })
      .catch(() => {
        // 복구 실패는 새 촬영을 막지 않는다. 이 세션에서는 빈 상태로 시작한다.
        if (!active || !mountedRef.current) return
        photosRef.current = []
        setPhotoCount(0)
      })

    return () => {
      active = false
    }
  }, [callSessionId])

  // 트랙에서 프레임을 읽으려면 재생 중인 video가 필요하다. 화면에 붙이지 않고 메모리에만 둔다.
  useEffect(() => {
    if (!remoteVideoTrack) {
      videoRef.current?.pause()
      videoRef.current = undefined
      return
    }

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = new MediaStream([remoteVideoTrack])
    // 자동재생 정책에 막혀도 셔터를 누를 때 readyState로 다시 걸러 내므로 여기서는 무시한다.
    void video.play().catch(() => undefined)
    videoRef.current = video

    return () => {
      video.pause()
      video.srcObject = null
      if (videoRef.current === video) videoRef.current = undefined
    }
  }, [remoteVideoTrack])

  const canCapture = Boolean(
    callSessionId && remoteVideoTrack && photoCount < MAX_CAPTURED_PHOTOS,
  )

  /**
   * 현재 프레임을 PNG로 뽑아 IndexedDB에 누적 저장한다.
   *
   * <p>상대 영상이 아직 도착하지 않았거나 장수를 다 채웠으면 저장하지 않고 이유만 남긴다.
   */
  const capture = useCallback(async () => {
    if (!callSessionId) {
      setCaptureError(translate('useCallPhotoCapture.t1'))
      return
    }
    if (photosRef.current.length >= MAX_CAPTURED_PHOTOS) {
      setCaptureError(translate('useCallPhotoCapture.t2', { p0: MAX_CAPTURED_PHOTOS }))
      return
    }

    const video = videoRef.current
    // readyState가 HAVE_CURRENT_DATA 미만이면 그릴 프레임이 아직 없어 빈 사진이 나온다.
    if (!video || video.readyState < 2) {
      setCaptureError(translate('useCallPhotoCapture.t3'))
      return
    }

    const settings = remoteVideoTrack?.getSettings()
    const width = settings?.width ?? video.videoWidth
    const height = settings?.height ?? video.videoHeight
    if (!width || !height) {
      setCaptureError(translate('useCallPhotoCapture.t4'))
      return
    }

    setCapturing(true)
    setCaptureError(undefined)

    try {
      const canvas = canvasRef.current ?? document.createElement('canvas')
      canvasRef.current = canvas
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error(translate('useCallPhotoCapture.t5'))
      }
      ctx.drawImage(video, 0, 0, width, height)

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png')
      })
      if (!blob) {
        throw new Error(translate('useCallPhotoCapture.t6'))
      }

      const photos = [...photosRef.current, blob]
      await saveCapturedPhotos({
        callSessionId,
        photos,
        capturedAt: new Date().toISOString(),
      })

      photosRef.current = photos
      if (mountedRef.current) setPhotoCount(photos.length)
    } catch (error: unknown) {
      if (mountedRef.current) {
        setCaptureError(
          error instanceof Error ? error.message : translate('useCallPhotoCapture.t7'),
        )
      }
    } finally {
      if (mountedRef.current) setCapturing(false)
    }
  }, [callSessionId, remoteVideoTrack])

  return {
    capture,
    photoCount,
    maxPhotoCount: MAX_CAPTURED_PHOTOS,
    captureError,
    canCapture,
    capturing,
  }
}
