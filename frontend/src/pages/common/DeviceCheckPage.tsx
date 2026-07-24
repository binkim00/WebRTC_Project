import { useParams } from 'react-router-dom'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  MediaDevicePreview,
  Select,
} from '../../components'
import type { FeedbackVariant } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import {
  useMediaDeviceCheck,
  type MediaCheckStatus,
} from '../../hooks/useMediaDeviceCheck'

const statusContent: Record<
  MediaCheckStatus,
  { title: string; message: string; variant: FeedbackVariant }
> = {
  idle: {
    title: '장비 사용 전 안내',
    message: '아래 버튼을 누르면 브라우저가 카메라와 마이크 사용 권한을 요청합니다.',
    variant: 'info',
  },
  requesting: {
    title: '권한 확인 중',
    message: '브라우저의 권한 요청 창에서 카메라와 마이크 사용을 허용해 주세요.',
    variant: 'warning',
  },
  ready: {
    title: '장비 준비 완료',
    message: '카메라 미리보기와 선택한 마이크가 정상적으로 연결되었습니다.',
    variant: 'success',
  },
  denied: {
    title: '장비 권한이 필요합니다',
    message: '',
    variant: 'error',
  },
  'no-device': {
    title: '장치를 찾을 수 없습니다',
    message: '',
    variant: 'error',
  },
  unsupported: {
    title: '지원하지 않는 환경입니다',
    message: '',
    variant: 'error',
  },
  error: {
    title: '장비를 시작하지 못했습니다',
    message: '',
    variant: 'error',
  },
}

function createDeviceOptions(devices: readonly MediaDeviceInfo[], fallbackLabel: string) {
  return devices.map((device, index) => ({
    label: device.label || `${fallbackLabel} ${index + 1}`,
    value: device.deviceId,
  }))
}

export function DeviceCheckPage() {
  const { fanMeetingId } = useParams()
  const {
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
  } = useMediaDeviceCheck()

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 fanMeetingId 값이 없습니다. 이전 화면에서 올바른 팬미팅을 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  const currentStatus = statusContent[status]
  const isRequesting = status === 'requesting'
  const isReady = status === 'ready'
  const cameraOptions = createDeviceOptions(cameras, '카메라')
  const microphoneOptions = createDeviceOptions(microphones, '마이크')
  const videoTrackReady = stream?.getVideoTracks().some((track) => track.readyState === 'live')
  const audioTrackReady = stream?.getAudioTracks().some((track) => track.readyState === 'live')

  return (
    <div className="grid gap-6">
      <header>
        <div className="flex flex-wrap gap-2">
          <Badge variant="primary">CM-FN-ID-002</Badge>
          <Badge variant="success">LiveKit 장비 API</Badge>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight !text-slate-950">장비 점검</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          팬미팅 입장 전에 카메라 화면과 사용할 마이크를 확인해 주세요.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          팬미팅 ID: <span className="font-mono text-slate-700">{fanMeetingId}</span>
        </p>
      </header>

      <AlertBanner title={currentStatus.title} variant={currentStatus.variant}>
        {errorMessage ?? currentStatus.message}
      </AlertBanner>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>카메라 미리보기</CardTitle>
          </CardHeader>
          <CardContent>
            <MediaDevicePreview stream={stream} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>사용할 장치</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Select
              disabled={!isReady || cameraOptions.length === 0}
              label="카메라"
              onChange={(event) => void selectCamera(event.target.value)}
              options={cameraOptions}
              value={selectedCameraId}
            />
            <Select
              disabled={!isReady || microphoneOptions.length === 0}
              label="마이크"
              onChange={(event) => void selectMicrophone(event.target.value)}
              options={microphoneOptions}
              value={selectedMicrophoneId}
            />

            <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-600">카메라 상태</dt>
                <dd className={videoTrackReady ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                  {videoTrackReady ? '연결됨' : '확인 필요'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-600">마이크 상태</dt>
                <dd className={audioTrackReady ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                  {audioTrackReady ? '연결됨' : '확인 필요'}
                </dd>
              </div>
            </dl>

            <Button
              className="w-full"
              loading={isRequesting}
              onClick={() => void start()}
              size="lg"
            >
              {status === 'idle' ? '카메라와 마이크 확인 시작' : '장비 다시 확인'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm leading-6 text-slate-500">
          LiveKit이 만든 로컬 트랙으로 장비를 점검합니다. 다른 화면으로 이동하면 점검용 트랙을
          종료하고, 영상통화 입장 시 선택한 장치를 새 LiveKit Room 연결에 적용합니다.
      </p>
    </div>
  )
}
