import { Link } from 'react-router-dom'
import { Card, CardContent } from '../data-display'
import { Button } from '../ui/Button'
import type { MediaAction } from './types'
import { useTranslation } from '../../i18n'

type CallControlsProps = {
  meetingId: string
  isConnected: boolean
  isCameraEnabled: boolean
  isMicrophoneEnabled: boolean
  mediaAction?: MediaAction
  onToggleCamera: () => void
  onToggleMicrophone: () => void
  onRequestEnd: () => void
}

export function CallControls({
  meetingId,
  isConnected,
  isCameraEnabled,
  isMicrophoneEnabled,
  mediaAction,
  onToggleCamera,
  onToggleMicrophone,
  onRequestEnd,
}: CallControlsProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-center gap-3">
        <Button
          disabled={!isConnected}
          loading={mediaAction === 'camera'}
          onClick={onToggleCamera}
          variant={isCameraEnabled ? 'secondary' : 'outline'}
        >
          {isCameraEnabled ? t('callControls.t3') : t('callControls.t4')}
        </Button>
        <Button
          disabled={!isConnected}
          loading={mediaAction === 'microphone'}
          onClick={onToggleMicrophone}
          variant={isMicrophoneEnabled ? 'secondary' : 'outline'}
        >
          {isMicrophoneEnabled ? t('callControls.t5') : t('callControls.t6')}
        </Button>
        <Link
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          to={`/fan-meetings/${meetingId}/device-check`}
        >
          {t('callControls.t1')}
        </Link>
        <Button onClick={onRequestEnd} variant="danger">
          {t('callControls.t2')}
        </Button>
      </CardContent>
    </Card>
  )
}
