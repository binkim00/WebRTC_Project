import { Track, Room, RoomEvent, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import { issueLiveKitTestToken, type LiveKitTestTokenResponse } from '../../api/livekitTest'
import { Badge } from '../../components/data-display'
import { AlertBanner } from '../../components/feedback'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/data-display/Card'
import { useTranslation } from '../../i18n'

export function LiveKitTestPage() {
  const { t } = useTranslation()
  const [identity, setIdentity] = useState('browser-user-1')
  const [displayName, setDisplayName] = useState(t('liveKitTestPage.t13'))
  const [tokenInfo, setTokenInfo] = useState<LiveKitTestTokenResponse>()
  const [status, setStatus] = useState(t('liveKitTestPage.t14'))
  const [error, setError] = useState<string>()
  const [connecting, setConnecting] = useState(false)
  const roomRef = useRef<Room | null>(null)
  const localVideoRef = useRef<HTMLDivElement>(null)
  const remoteVideoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect()
    }
  }, [])

  function clearTracks(container: HTMLDivElement | null) {
    if (!container) return
    container.replaceChildren()
  }

  async function join() {
    setConnecting(true)
    setError(undefined)
    setStatus(t('liveKitTestPage.t15'))
    clearTracks(localVideoRef.current)
    clearTracks(remoteVideoRef.current)
    roomRef.current?.disconnect()

    try {
      const info = await issueLiveKitTestToken(identity, displayName)
      setTokenInfo(info)
      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          remoteVideoRef.current.appendChild(track.attach())
        }
        if (track.kind === Track.Kind.Audio) {
          track.attach()
        }
      })
      room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach())
      room.on(RoomEvent.Disconnected, () => setStatus(t('liveKitTestPage.t16')))

      setStatus(t('liveKitTestPage.t17'))
      await room.connect(info.liveKitUrl, info.accessToken)
      await room.localParticipant.setCameraEnabled(true)
      await room.localParticipant.setMicrophoneEnabled(true)

      const cameraPublication = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (cameraPublication?.track && localVideoRef.current) {
        const video = cameraPublication.track.attach() as HTMLVideoElement
        video.muted = true
        video.autoplay = true
        video.playsInline = true
        localVideoRef.current.appendChild(video)
      }
      setStatus(t('liveKitTestPage.t21', { p0: info.roomName, p1: info.identity }))
    } catch (caught) {
      roomRef.current?.disconnect()
      roomRef.current = null
      setTokenInfo(undefined)
      setStatus(t('liveKitTestPage.t18'))
      setError(caught instanceof Error ? caught.message : t('liveKitTestPage.t19'))
    } finally {
      setConnecting(false)
    }
  }

  function leave() {
    roomRef.current?.disconnect()
    roomRef.current = null
    clearTracks(localVideoRef.current)
    clearTracks(remoteVideoRef.current)
    setTokenInfo(undefined)
    setStatus(t('liveKitTestPage.t20'))
  }

  // 공통 App이 main 랜드마크를 제공하므로 페이지 내부는 일반 컨테이너로 둔다.
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10">
      <header>
        <Badge variant="primary">RTC API TEST</Badge>
        <h1 className="mt-3 text-3xl font-black">{t('liveKitTestPage.t1')}</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">{t('liveKitTestPage.t2')}</p>
      </header>
      {error ? <AlertBanner title={t('liveKitTestPage.t3')} variant="error">{error}</AlertBanner> : null}
      <Card>
        <CardHeader><CardTitle>{t('liveKitTestPage.t4')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">{t('liveKitTestPage.t5')}<input className="rounded-xl border p-3" value={identity} onChange={(event) => setIdentity(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-semibold">{t('liveKitTestPage.t6')}<input className="rounded-xl border p-3" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Button loading={connecting} onClick={() => void join()}>{t('liveKitTestPage.t7')}</Button><Button disabled={!roomRef.current} onClick={leave} variant="secondary">{t('liveKitTestPage.t8')}</Button></div>
          <p className="text-sm text-[var(--color-text-secondary)] sm:col-span-2">{t('liveKitTestPage.t9')} {status}</p>
          {tokenInfo ? <dl className="grid gap-1 rounded-xl bg-[var(--color-surface-page)] p-4 text-xs sm:col-span-2"><div><dt className="inline text-[var(--color-text-secondary)]">roomName </dt><dd className="inline font-mono">{tokenInfo.roomName}</dd></div><div><dt className="inline text-[var(--color-text-secondary)]">liveKitUrl </dt><dd className="inline break-all font-mono">{tokenInfo.liveKitUrl}</dd></div></dl> : null}
        </CardContent>
      </Card>
      <section className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>{t('liveKitTestPage.t10')}</CardTitle></CardHeader><CardContent><div ref={localVideoRef} className="aspect-video overflow-hidden rounded-xl bg-slate-950 [&_video]:size-full [&_video]:object-cover" /></CardContent></Card>
        <Card><CardHeader><CardTitle>{t('liveKitTestPage.t11')}</CardTitle></CardHeader><CardContent><div ref={remoteVideoRef} className="aspect-video overflow-hidden rounded-xl bg-slate-950 [&_video]:size-full [&_video]:object-cover" /><p className="mt-3 text-sm text-[var(--color-text-secondary)]">{t('liveKitTestPage.t12')}</p></CardContent></Card>
      </section>
    </div>
  )
}
