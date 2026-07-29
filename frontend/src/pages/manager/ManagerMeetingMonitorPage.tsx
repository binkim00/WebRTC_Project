import {
  ArrowsClockwise,
  Bell,
  CheckCircle,
  Clock,
  Eye,
  Microphone,
  MonitorPlay,
  SquaresFour,
  UserCircle,
  VideoCamera,
  Warning,
  WifiHigh,
  Wrench,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/auth'
import {
  fetchMeetingDetail,
  fetchMeetingQueue,
  fetchParticipants,
  type FanMeetingParticipant,
  type MeetingDetail,
  type MeetingQueue,
} from '../../api/fanMeetingParticipants'
import remotePreviewImage from '../../assets/call-preview-remote.jpg'
import localPreviewImage from '../../assets/call-preview-local.jpg'
import { AlertBanner, Badge, Button, Card, Spinner } from '../../components'

const previewImages = [remotePreviewImage, localPreviewImage, remotePreviewImage, localPreviewImage]

export function ManagerMeetingMonitorPage() {
  const { fanMeetingId } = useParams<{ fanMeetingId: string }>()
  const [searchParams] = useSearchParams()
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [participants, setParticipants] = useState<FanMeetingParticipant[]>([])
  const [queue, setQueue] = useState<MeetingQueue>({ entries: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fanMeetingId) {
      setError('팬미팅 식별자가 없습니다.')
      setLoading(false)
      return
    }

    if (isPreview) {
      setMeeting({
        meetingId: fanMeetingId,
        title: 'MELLY DAY 팬미팅',
        status: 'IN_PROGRESS',
        influencer: { influencerId: 'melly', influencerName: 'Melly' },
        application: { capacity: 30 },
      })
      setParticipants([
        { participantId: 'p-1', fanId: 'f-1', nickname: '별하늘', callOrder: 1, participantStatus: 'ACTIVE', queueStatus: 'IN_CALL', cameraOk: true, microphoneOk: true, profileImageUrl: previewImages[0] },
        { participantId: 'p-2', fanId: 'f-2', nickname: '몽글이', callOrder: 2, participantStatus: 'ACTIVE', queueStatus: 'IN_CALL', cameraOk: true, microphoneOk: true, profileImageUrl: previewImages[1] },
        { participantId: 'p-3', fanId: 'f-3', nickname: '바람처럼', callOrder: 3, participantStatus: 'ACTIVE', queueStatus: 'WAITING', cameraOk: true, microphoneOk: false, profileImageUrl: previewImages[2] },
        { participantId: 'p-4', fanId: 'f-4', nickname: '소다빛', callOrder: 4, participantStatus: 'ACTIVE', queueStatus: 'CALLED', cameraOk: false, microphoneOk: true, profileImageUrl: previewImages[3] },
      ])
      setQueue({
        entries: ['푸른달', '별사탕', '햇살가득', '노을빛', '우주여행', '소프트민트', '디어멜리'].map((nickname, index) => ({
          queueEntryId: `q-${index + 1}`,
          participantId: `p-${index + 1}`,
          fanId: `f-${index + 1}`,
          nickname,
          position: index + 1,
          status: index === 5 ? 'CALLED' : 'WAITING',
          callAttemptCount: 0,
        })),
      })
      setLoading(false)
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('로그인 후 영상 모니터링 화면을 이용할 수 있습니다.')
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    Promise.all([
      fetchMeetingDetail(fanMeetingId, token, controller.signal),
      fetchParticipants(fanMeetingId, { page: 0, size: 4 }, token, controller.signal),
      fetchMeetingQueue(fanMeetingId, token, controller.signal),
    ])
      .then(([meetingData, participantData, queueData]) => {
        setMeeting(meetingData)
        setParticipants(participantData.content)
        setQueue(queueData)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof ApiError ? reason.message : '모니터링 데이터를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [fanMeetingId, isPreview])

  const inCallCount = useMemo(() => participants.filter((item) => item.queueStatus === 'IN_CALL').length, [participants])
  const completedCount = useMemo(() => queue.entries.filter((item) => item.status === 'COMPLETED').length, [queue.entries])
  const waitingCount = queue.entries.filter((item) => item.status === 'WAITING').length
  const deviceCheckCount = participants.filter((item) => item.cameraOk === false || item.microphoneOk === false).length
  const capacity = meeting?.application?.capacity ?? Math.max(queue.entries.length, 1)
  const progress = Math.min(100, ((completedCount + inCallCount) / capacity) * 100)

  if (loading) return <div className="flex min-h-[420px] items-center justify-center"><Spinner label="모니터링 정보를 불러오는 중" /></div>
  if (error || !meeting) return <AlertBanner title="모니터링 화면을 표시할 수 없습니다" variant="error">{error ?? '팬미팅 정보를 찾을 수 없습니다.'}</AlertBanner>

  return (
    <div className="grid min-w-0 max-w-full gap-5 overflow-x-hidden pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary-coral)]">팬미팅 관리</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">영상 모니터링</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2 text-sm text-[var(--color-text-secondary)] sm:gap-3">
          <Button variant="secondary" leadingIcon={<SquaresFour size={18} weight="bold" />}>화면 레이아웃</Button>
          <Button variant="ghost" leadingIcon={<ArrowsClockwise size={18} weight="bold" />}>새로고침</Button>
          <span className="inline-flex items-center gap-2 border-l border-[var(--color-divider)] pl-3"><span className="size-2 rounded-full bg-emerald-500" />자동 갱신: 5초</span>
        </div>
      </header>

      <div className="grid min-w-0 gap-5 min-[1400px]:grid-cols-[minmax(0,1.75fr)_minmax(390px,0.95fr)]">
        <Card className="min-w-0 overflow-hidden p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {participants.map((participant) => <ParticipantTile key={participant.participantId} participant={participant} />)}
          </div>
        </Card>

        <Card className="grid min-w-0 content-start gap-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">현재 팬미팅</p><h2 className="mt-2 text-2xl font-black">{meeting.title}</h2></div><Bell className="text-[var(--color-primary-coral)]" size={23} weight="fill" /></div>
          <div className="border-y border-[var(--color-divider)] py-4"><div className="flex items-center justify-between text-sm"><span className="font-semibold">세션 진행 상황</span><span className="text-[var(--color-text-secondary)]">진행 시간 01:32:45</span></div><div className="mt-3 flex items-center gap-3"><div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--color-primary-coral)]" style={{ width: `${progress}%` }} /></div><strong className="text-sm text-[var(--color-primary-coral)]">{completedCount + inCallCount} / {capacity}명</strong></div></div>
          <div><h3 className="font-extrabold">대기열 요약</h3><div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4 min-[1400px]:grid-cols-2"><SummaryTile icon={<Clock size={18} />} label="대기 인원" value={waitingCount} /><SummaryTile icon={<MonitorPlay size={18} />} label="통화 중" value={inCallCount} accent /><SummaryTile icon={<Wrench size={18} />} label="장비 확인" value={deviceCheckCount} /><SummaryTile icon={<CheckCircle size={18} />} label="완료" value={completedCount} /></div></div>
          <div><div className="flex items-center justify-between"><h3 className="font-extrabold">알림</h3><button className="text-xs font-bold text-[var(--color-text-secondary)]" type="button">모두 읽음 처리</button></div><div className="mt-3 grid gap-2"><AlertRow icon={<Warning size={20} weight="fill" />} title="위험 감지" detail="실시간 위험 감지 API 연결 후 표시됩니다." tone="danger" /><AlertRow icon={<WifiHigh size={20} weight="bold" />} title="연결 상태" detail="참가자 네트워크 상태를 확인하세요." tone="warning" /><AlertRow icon={<Wrench size={20} weight="bold" />} title="장비 확인 대기" detail={`${deviceCheckCount}명의 장비 확인이 필요합니다.`} tone="info" /></div></div>
          <div className="grid grid-cols-2 gap-3"><Button variant="secondary" leadingIcon={<Eye size={18} weight="bold" />}>참가자 상세 보기</Button><Link className="inline-flex min-h-[var(--control-height)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-transparent bg-[var(--color-primary-coral)] px-[var(--control-padding-inline)] text-sm font-semibold text-white hover:bg-[var(--color-primary-coral-hover)]" to={`/manager/fan-meetings/${encodeURIComponent(fanMeetingId ?? 'demo-meeting')}/monitor/risk`}><Warning size={18} weight="bold" />위험 상황 검토</Link></div>
        </Card>
      </div>

      <Card className="p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">대기열 <span className="font-normal text-[var(--color-text-secondary)]">(참가 순서)</span></h2><span className="text-sm text-[var(--color-text-secondary)]">총 {waitingCount}명 대기 중</span></div><div className="mt-4 flex gap-3 overflow-x-auto pb-1">{queue.entries.map((entry) => <div className="min-w-[160px] rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-page)] p-3" key={entry.queueEntryId}><div className="flex items-center justify-between gap-2"><span className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-xs font-black">{entry.position}</span><Badge variant={entry.status === 'IN_CALL' ? 'primary' : entry.status === 'COMPLETED' ? 'success' : 'neutral'}>{entry.status === 'IN_CALL' ? '통화 중' : entry.status === 'COMPLETED' ? '완료' : '대기'}</Badge></div><p className="mt-3 truncate font-bold">{entry.nickname}</p></div>)}</div></Card>
    </div>
  )
}

function ParticipantTile({ participant }: { participant: FanMeetingParticipant }) {
  const inCall = participant.queueStatus === 'IN_CALL'
  const deviceReady = participant.cameraOk !== false && participant.microphoneOk !== false
  return <div className="relative aspect-video overflow-hidden rounded-[var(--radius-control)] bg-slate-800">{participant.profileImageUrl ? <img alt={`${participant.nickname} 영상`} className="size-full object-cover" src={participant.profileImageUrl} /> : <div className="flex size-full items-center justify-center text-6xl font-black text-white/25"><UserCircle size={76} weight="thin" /></div>}<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10" /><span className={`absolute left-4 top-4 rounded-lg px-3 py-1.5 text-sm font-bold ${inCall ? 'bg-[var(--color-primary-coral)] text-white' : 'bg-slate-500/80 text-white'}`}>{inCall ? '통화 중' : participant.queueStatus === 'WAITING' ? '대기' : '장비 확인'}</span><div className="absolute right-4 top-4 flex items-center gap-1 text-emerald-300"><span className="sr-only">장비 상태</span><WifiHigh size={23} weight="bold" /></div><div className="absolute inset-x-4 bottom-4 flex items-end justify-between text-white"><div><p className="text-xl font-black">{participant.nickname}</p><p className="mt-1 text-xs text-white/75">{inCall ? '팬미팅 참가자' : '다음 순서 참가자'}</p></div><div className="flex items-center gap-2"><span className={`rounded-lg border border-white/30 bg-black/30 p-2 ${participant.microphoneOk === false ? 'text-red-300' : ''}`}><Microphone size={20} weight="bold" /></span><span className={`rounded-lg border border-white/30 bg-black/30 p-2 ${participant.cameraOk === false ? 'text-red-300' : ''}`}><VideoCamera size={20} weight="bold" /></span><span className={`absolute right-0 top-[-28px] size-2 rounded-full ${deviceReady ? 'bg-emerald-400' : 'bg-amber-400'}`} /></div></div></div>
}

function SummaryTile({ icon, label, value, accent = false }: { icon: ReactNode; label: string; value: number; accent?: boolean }) { return <div className={`grid min-h-24 min-w-0 grid-rows-[2rem_1fr] rounded-lg border p-3 ${accent ? 'border-red-200 bg-red-50' : 'border-[var(--color-border-control)]'}`}><div className="flex min-w-0 items-start gap-1.5 text-xs leading-4 text-[var(--color-text-secondary)]"><span className="mt-px shrink-0">{icon}</span><span className="break-keep">{label}</span></div><p className={`self-end text-xl font-black leading-none ${accent ? 'text-[var(--color-primary-coral)]' : ''}`}>{value}<span className="ml-0.5 text-xs font-semibold">명</span></p></div> }

function AlertRow({ icon, title, detail, tone }: { icon: ReactNode; title: string; detail: string; tone: 'danger' | 'warning' | 'info' }) { const styles = { danger: 'border-red-200 bg-red-50 text-red-600', warning: 'border-amber-200 bg-amber-50 text-amber-600', info: 'border-blue-200 bg-blue-50 text-blue-600' }[tone]; return <div className={`flex items-start gap-3 rounded-lg border p-3 ${styles}`}><span>{icon}</span><div className="min-w-0"><p className="font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{detail}</p></div></div> }
