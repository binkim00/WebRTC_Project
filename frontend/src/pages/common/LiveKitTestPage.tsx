import { Track, Room, RoomEvent, type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant } from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import { issueLiveKitTestToken, type LiveKitTestTokenResponse } from '../../api/livekitTest'
import { Badge } from '../../components/data-display'
import { AlertBanner } from '../../components/feedback'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/data-display/Card'

export function LiveKitTestPage() {
  const [identity, setIdentity] = useState('browser-user-1')
  const [displayName, setDisplayName] = useState('브라우저 테스트 사용자')
  const [tokenInfo, setTokenInfo] = useState<LiveKitTestTokenResponse>()
  const [status, setStatus] = useState('백엔드 토큰 발급을 기다리는 중입니다.')
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
    setStatus('POST /api/v1/livekit/test-token 요청 중입니다.')
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
      room.on(RoomEvent.Disconnected, () => setStatus('LiveKit 방에서 나갔습니다.'))

      setStatus('LiveKit 방에 연결 중입니다.')
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
      setStatus(`연결 완료 · ${info.roomName} · ${info.identity}`)
    } catch (caught) {
      roomRef.current?.disconnect()
      roomRef.current = null
      setTokenInfo(undefined)
      setStatus('연결하지 못했습니다.')
      setError(caught instanceof Error ? caught.message : 'LiveKit 테스트 연결에 실패했습니다.')
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
    setStatus('연결이 종료되었습니다.')
  }

  // 공통 App이 main 랜드마크를 제공하므로 페이지 내부는 일반 컨테이너로 둔다.
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10">
      <header>
        <Badge variant="primary">RTC API TEST</Badge>
        <h1 className="mt-3 text-3xl font-black">LiveKit 연결 테스트</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">백엔드의 테스트 토큰 API와 LiveKit 방 연결을 한 화면에서 확인합니다.</p>
      </header>
      {error ? <AlertBanner title="테스트 실패" variant="error">{error}</AlertBanner> : null}
      <Card>
        <CardHeader><CardTitle>1. 테스트 토큰 발급</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">참가자 ID<input className="rounded-xl border p-3" value={identity} onChange={(event) => setIdentity(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-semibold">표시 이름<input className="rounded-xl border p-3" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Button loading={connecting} onClick={() => void join()}>토큰 발급 및 입장</Button><Button disabled={!roomRef.current} onClick={leave} variant="secondary">나가기</Button></div>
          <p className="text-sm text-[var(--color-text-secondary)] sm:col-span-2">상태: {status}</p>
          {tokenInfo ? <dl className="grid gap-1 rounded-xl bg-[var(--color-surface-page)] p-4 text-xs sm:col-span-2"><div><dt className="inline text-[var(--color-text-secondary)]">roomName </dt><dd className="inline font-mono">{tokenInfo.roomName}</dd></div><div><dt className="inline text-[var(--color-text-secondary)]">liveKitUrl </dt><dd className="inline break-all font-mono">{tokenInfo.liveKitUrl}</dd></div></dl> : null}
        </CardContent>
      </Card>
      <section className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>내 카메라</CardTitle></CardHeader><CardContent><div ref={localVideoRef} className="aspect-video overflow-hidden rounded-xl bg-slate-950 [&_video]:size-full [&_video]:object-cover" /></CardContent></Card>
        <Card><CardHeader><CardTitle>상대 참가자</CardTitle></CardHeader><CardContent><div ref={remoteVideoRef} className="aspect-video overflow-hidden rounded-xl bg-slate-950 [&_video]:size-full [&_video]:object-cover" /><p className="mt-3 text-sm text-[var(--color-text-secondary)]">같은 `test-room`에 다른 브라우저로 입장하면 상대 영상이 표시됩니다.</p></CardContent></Card>
      </section>
    </div>
  )
}
