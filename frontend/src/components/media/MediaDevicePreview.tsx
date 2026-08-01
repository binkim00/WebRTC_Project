import { VideoCameraSlashIcon } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { cn } from '../ui/cn'

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
        aria-label="카메라 미리보기"
        autoPlay
        className={cn('size-full object-cover', !stream && 'hidden')}
        muted
        playsInline
        ref={videoRef}
      />
      {!stream && previewImage ? (
        <img alt="카메라 미리보기 샘플" className="size-full object-cover" src={previewImage} />
      ) : null}
      {!stream && !previewImage ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-slate-300">
          <VideoCameraSlashIcon aria-hidden="true" size={38} weight="light" />
          <p className="text-sm">장비 확인을 시작하면 카메라 화면이 여기에 표시됩니다.</p>
        </div>
      ) : null}
    </div>
  )
}
