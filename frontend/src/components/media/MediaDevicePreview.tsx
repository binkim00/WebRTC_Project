import { VideoCameraSlashIcon } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { cn } from '../ui/cn'
import { useTranslation } from '../../i18n'

export type MediaDevicePreviewProps = {
  stream: MediaStream | null
  previewImage?: string
  className?: string
}

export function MediaDevicePreview({
  stream,
  previewImage,
  className,
}: MediaDevicePreviewProps) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current

    if (!video) {
      return
    }

    video.srcObject = stream

    return () => {
      video.srcObject = null
    }
  }, [stream])

  return (
    <div
      className={cn(
        'relative aspect-video overflow-hidden rounded-2xl bg-slate-950 shadow-inner',
        className,
      )}
    >
      <video
        aria-label={t('mediaDevicePreview.t1')}
        autoPlay
        className={cn('size-full object-cover', !stream && 'hidden')}
        muted
        playsInline
        ref={videoRef}
      />
      {!stream && previewImage ? (
        <img alt={t('mediaDevicePreview.t2')} className="size-full object-cover" decoding="async" src={previewImage} />
      ) : null}
      {!stream && !previewImage ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-slate-300">
          <VideoCameraSlashIcon aria-hidden="true" size={38} weight="light" />
          <p className="text-sm">{t('mediaDevicePreview.t3')}</p>
        </div>
      ) : null}
    </div>
  )
}
