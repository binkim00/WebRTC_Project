import { createLocalTracks, Room, type LocalTrack } from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { translate } from '../i18n'

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
  speakers: MediaDeviceInfo[]
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
      message: translate('useMediaDeviceCheck.t1'),
    }
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        status: 'denied',
        message:
          translate('useMediaDeviceCheck.t2'),
      }
    case 'NotFoundError':
      return {
        status: 'no-device',
        message: translate('useMediaDeviceCheck.t3'),
      }
    case 'NotReadableError':
      return {
        status: 'error',
        message:
          translate('useMediaDeviceCheck.t4'),
      }
    case 'OverconstrainedError':
      return {
        status: 'error',
        message: translate('useMediaDeviceCheck.t5'),
      }
    default:
      return {
        status: 'error',
        message: translate('useMediaDeviceCheck.t6'),
      }
  }
}

export function useMediaDeviceCheck() {
  const [status, setStatus] = useState<MediaCheckStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('')
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string>()
  const localTracksRef = useRef<LocalTrack[]>([])
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)

  const readDevices = useCallback(async (): Promise<MediaDeviceLists> => {
    const [nextCameras, nextMicrophones, nextSpeakers] = await Promise.all([
      Room.getLocalDevices('videoinput', false),
      Room.getLocalDevices('audioinput', false),
      Room.getLocalDevices('audiooutput', false),
    ])

    if (mountedRef.current) {
      setCameras(nextCameras)
      setMicrophones(nextMicrophones)
      setSpeakers(nextSpeakers)
    }

    return {
      cameras: nextCameras,
      microphones: nextMicrophones,
      speakers: nextSpeakers,
    }
  }, [])

  const openStream = useCallback(
    async (cameraId = '', microphoneId = '') => {
      const mediaDevices = navigator.mediaDevices

      if (!mediaDevices?.getUserMedia || !mediaDevices.enumerateDevices) {
        setStatus('unsupported')
        setErrorMessage(
          translate('useMediaDeviceCheck.t7'),
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
          setErrorMessage(translate('useMediaDeviceCheck.t8'))
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
        setSelectedSpeakerId((currentId) => {
          const savedId = window.sessionStorage.getItem('melly-speaker-id') ?? ''
          const preferredId = currentId || savedId
          return deviceLists.speakers.some((device) => device.deviceId === preferredId)
            ? preferredId
            : (deviceLists.speakers[0]?.deviceId ?? 'default')
        })
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

  const selectSpeaker = useCallback((deviceId: string) => {
    setSelectedSpeakerId(deviceId)
    window.sessionStorage.setItem('melly-speaker-id', deviceId)
  }, [])

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

  useEffect(() => {
    const audioTrack = stream?.getAudioTracks()[0]

    if (!audioTrack) {
      setAudioLevel(0)
      return
    }

    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]))
    const samples = new Uint8Array(analyser.frequencyBinCount)
    let frameId = 0

    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser)

    const measure = () => {
      analyser.getByteFrequencyData(samples)
      const average = samples.reduce((total, sample) => total + sample, 0) / samples.length
      setAudioLevel(Math.min(1, average / 96))
      frameId = requestAnimationFrame(measure)
    }

    measure()

    return () => {
      cancelAnimationFrame(frameId)
      source.disconnect()
      void audioContext.close()
    }
  }, [stream])

  return {
    cameras,
    errorMessage,
    audioLevel,
    microphones,
    speakers,
    selectedCameraId,
    selectedMicrophoneId,
    selectedSpeakerId,
    selectCamera,
    selectMicrophone,
    selectSpeaker,
    start,
    status,
    stream,
  }
}
