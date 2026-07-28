import { createLocalTracks, Room, type LocalTrack } from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'

export type MediaCheckStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'no-device'
  | 'unsupported'
  | 'error'

type MediaDeviceLists = {
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
}

type MediaErrorState = {
  status: Exclude<MediaCheckStatus, 'idle' | 'requesting' | 'ready'>
  message: string
}

function stopLocalTracks(tracks: readonly LocalTrack[]) {
  tracks.forEach((track) => track.stop())
}

function getMediaErrorState(error: unknown): MediaErrorState {
  if (!(error instanceof DOMException)) {
    return {
      status: 'error',
      message: '장비를 확인하는 중 알 수 없는 문제가 발생했습니다. 다시 시도해 주세요.',
    }
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        status: 'denied',
        message:
          '카메라 또는 마이크 권한이 거부되었습니다. 브라우저 주소창의 사이트 권한에서 카메라와 마이크를 허용해 주세요.',
      }
    case 'NotFoundError':
      return {
        status: 'no-device',
        message: '사용할 수 있는 카메라 또는 마이크를 찾을 수 없습니다. 장치 연결을 확인해 주세요.',
      }
    case 'NotReadableError':
      return {
        status: 'error',
        message:
          '카메라 또는 마이크를 열 수 없습니다. 다른 프로그램이 장치를 사용 중인지 확인해 주세요.',
      }
    case 'OverconstrainedError':
      return {
        status: 'error',
        message: '선택한 장치를 사용할 수 없습니다. 장치를 다시 연결하거나 다른 장치를 선택해 주세요.',
      }
    default:
      return {
        status: 'error',
        message: '카메라와 마이크를 시작하지 못했습니다. 장치와 브라우저 설정을 확인해 주세요.',
      }
  }
}

export function useMediaDeviceCheck() {
  const [status, setStatus] = useState<MediaCheckStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('')
  const [errorMessage, setErrorMessage] = useState<string>()
  const localTracksRef = useRef<LocalTrack[]>([])
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)

  const readDevices = useCallback(async (): Promise<MediaDeviceLists> => {
    const [nextCameras, nextMicrophones] = await Promise.all([
      Room.getLocalDevices('videoinput', false),
      Room.getLocalDevices('audioinput', false),
    ])

    if (mountedRef.current) {
      setCameras(nextCameras)
      setMicrophones(nextMicrophones)
    }

    return {
      cameras: nextCameras,
      microphones: nextMicrophones,
    }
  }, [])

  const openStream = useCallback(
    async (cameraId = '', microphoneId = '') => {
      const mediaDevices = navigator.mediaDevices

      if (!mediaDevices?.getUserMedia || !mediaDevices.enumerateDevices) {
        setStatus('unsupported')
        setErrorMessage(
          '현재 브라우저 환경에서는 카메라와 마이크를 사용할 수 없습니다. HTTPS 또는 localhost 환경인지 확인해 주세요.',
        )
        return
      }

      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      setStatus('requesting')
      setErrorMessage(undefined)

      try {
        const nextTracks = await createLocalTracks({
          video: cameraId
            ? { deviceId: { exact: cameraId } }
            : { facingMode: 'user', resolution: { width: 1280, height: 720 } },
          audio: microphoneId
            ? { deviceId: { exact: microphoneId } }
            : { echoCancellation: true, noiseSuppression: true },
        })
        const nextStream = new MediaStream(nextTracks.map((track) => track.mediaStreamTrack))

        const deviceLists = await readDevices()

        if (!mountedRef.current || requestId !== requestIdRef.current) {
          stopLocalTracks(nextTracks)
          return
        }

        if (deviceLists.cameras.length === 0 || deviceLists.microphones.length === 0) {
          stopLocalTracks(nextTracks)
          setStatus('no-device')
          setErrorMessage('카메라 또는 마이크 장치가 없습니다. 장치를 연결한 후 다시 시도해 주세요.')
          return
        }

        const activeCameraId = nextStream.getVideoTracks()[0]?.getSettings().deviceId
        const activeMicrophoneId = nextStream.getAudioTracks()[0]?.getSettings().deviceId

        stopLocalTracks(localTracksRef.current)
        localTracksRef.current = nextTracks
        setStream(nextStream)
        setSelectedCameraId(
          deviceLists.cameras.some((device) => device.deviceId === activeCameraId)
            ? (activeCameraId ?? '')
            : (deviceLists.cameras[0]?.deviceId ?? ''),
        )
        setSelectedMicrophoneId(
          deviceLists.microphones.some((device) => device.deviceId === activeMicrophoneId)
            ? (activeMicrophoneId ?? '')
            : (deviceLists.microphones[0]?.deviceId ?? ''),
        )
        window.sessionStorage.setItem('melly-camera-id', activeCameraId ?? '')
        window.sessionStorage.setItem('melly-microphone-id', activeMicrophoneId ?? '')
        setStatus('ready')
      } catch (error: unknown) {
        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return
        }

        const errorState = getMediaErrorState(error)
        setStatus(errorState.status)
        setErrorMessage(errorState.message)
      }
    },
    [readDevices],
  )

  const start = useCallback(() => openStream(), [openStream])

  const selectCamera = useCallback(
    async (deviceId: string) => {
      setSelectedCameraId(deviceId)
      await openStream(deviceId, selectedMicrophoneId)
    },
    [openStream, selectedMicrophoneId],
  )

  const selectMicrophone = useCallback(
    async (deviceId: string) => {
      setSelectedMicrophoneId(deviceId)
      await openStream(selectedCameraId, deviceId)
    },
    [openStream, selectedCameraId],
  )

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
      stopLocalTracks(localTracksRef.current)
      localTracksRef.current = []
    }
  }, [])

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices

    if (!mediaDevices?.addEventListener) {
      return
    }

    const handleDeviceChange = () => {
      if (localTracksRef.current.length > 0) {
        void readDevices()
      }
    }

    mediaDevices.addEventListener('devicechange', handleDeviceChange)

    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [readDevices])

  return {
    cameras,
    errorMessage,
    microphones,
    selectedCameraId,
    selectedMicrophoneId,
    selectCamera,
    selectMicrophone,
    start,
    status,
    stream,
  }
}
