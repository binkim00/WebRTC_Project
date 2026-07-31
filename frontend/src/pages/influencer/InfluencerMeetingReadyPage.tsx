import {
  ArrowRight,
  CalendarBlank,
  Camera,
  CheckCircle,
  ListChecks,
  NotePencil,
  VideoCamera,
} from '@phosphor-icons/react'
import {
  AlertBanner,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
} from '../../components'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import { fetchMeetingQueue } from '../../api/fanMeetingParticipants'


/* TODO: API 연동 후 아래 mock 데이터를 서버 응답 데이터로 교체 */
const meeting = {
  title: 'MELLY DAY 팬미팅',
  influencerName: 'Melly',
  scheduledAt: '2026.07.28 20:00',
  sessionDuration: '90초',
  expectedDuration: '30분',
  elapsedTime: '10분 30초',
  completedFanCount: 7,
  totalFanCount: 20,
  currentOrder: 8,
  currentFan: {
    id: 'fan-1',
    name: '김유진',
    participationCount: 2,
    memo:
      '지난 팬미팅에서 새 앨범 수록곡 이야기를 나눴어요. 이번에는 콘서트 준비 근황을 궁금해했어요.',
  },
  nextFan: {
    name: '김젤리',
    order: 9,
    participationCount: 1,
  },
}
const isDeviceChecked = true
const meetingStatus = 'in_progress'

export function InfluencerMeetingReadyPage() {
  const navigate = useNavigate()
  const { fanMeetingId } = useParams()
  const [callSessionId, setCallSessionId] = useState<string>()
  const [queueError, setQueueError] = useState<string>()

  useEffect(() => {
    if (!fanMeetingId) return
    const authToken = getAuthSession()?.accessToken
    if (!authToken) {
      setQueueError('로그인 정보가 없습니다. 다시 로그인해 주세요.')
      return
    }

    let active = true
    const refresh = async () => {
      try {
        const queue = await fetchMeetingQueue(fanMeetingId, authToken)
        if (!active) return
        setCallSessionId(queue.currentCall?.callSessionId)
        setQueueError(undefined)
      } catch (error: unknown) {
        if (active) setQueueError(error instanceof Error ? error.message : '현재 호출 정보를 조회하지 못했습니다.')
      }
    }
    void refresh()
    const intervalId = window.setInterval(() => void refresh(), 2000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [fanMeetingId])

  const handleOpenMemo = () => {
    if (!fanMeetingId) { return }
    navigate(
      `/influencer/fan-meetings/${fanMeetingId}/fans/${meeting.currentFan.id}/records?tab=memo`
    )
  }

  const handleOpenFanList = () => {
    if (!fanMeetingId) { return }
    navigate(
      `/fan-meetings/${fanMeetingId}/fans`
    )
  }

  const handleEnterCall = () => {
    if (!fanMeetingId || !callSessionId) { return }
    if(!isDeviceChecked || meetingStatus !== 'in_progress') { return }
    navigate(
      `/influencer/fan-meetings/${fanMeetingId}/calls/${callSessionId}`
    )
  }

  return (
    <div className="grid gap-8 pb-8">
      <header className="grid gap-3">
        <h1 className="text-4xl font-black leading-tight tracking-[-0.04em]">
          팬미팅 진행
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          화면과 팬 정보를 확인한 뒤 영상 통화에 입장하세요.
        </p>
      </header>

      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(300px,1fr)_minmax(0,1.75fr)]">
          <div className="grid gap-5 p-6 lg:border-r lg:border-[var(--color-divider)] lg:p-8">
            <Badge className="w-fit" variant="primary">
              오늘 진행
            </Badge>
            <h2 className="text-3xl font-black tracking-[-0.04em]">
              {meeting.title}
            </h2>
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  인플루언서
                </dt>
                <dd className="mt-2 font-extrabold">{meeting.influencerName}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  진행 일시
                </dt>
                <dd className="mt-2 flex items-center gap-2 font-extrabold">
                  <CalendarBlank aria-hidden size={20} weight="bold" />
                  {meeting.scheduledAt}
                </dd>
              </div>
            </dl>
          </div>

          <dl className="grid border-t border-[var(--color-divider)] sm:grid-cols-3 lg:border-t-0">
            <div className="grid content-center gap-3 p-6 sm:border-r sm:border-[var(--color-divider)] lg:p-8">
              <dt className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                팬 1명당 세션 시간
              </dt>
              <dd className="text-2xl font-black">{meeting.sessionDuration}</dd>
            </div>
            <div className="grid content-center gap-3 border-t border-[var(--color-divider)] p-6 sm:border-r sm:border-t-0 lg:p-8">
              <dt className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                예상 총 소요 시간
              </dt>
              <dd className="text-2xl font-black">{meeting.expectedDuration}</dd>
            </div>
            <div className="grid content-center gap-3 border-t border-[var(--color-divider)] p-6 sm:border-t-0 lg:p-8">
              <dt className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                현재까지 진행 시간
              </dt>
              <dd className="text-2xl font-black">{meeting.elapsedTime}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_420px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <VideoCamera aria-hidden size={22} weight="fill" />
              현재 화면
            </h2>
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-success-soft)] text-[var(--color-success)]">
                <CheckCircle aria-hidden size={22} weight="fill" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-[var(--color-text-tertiary)]">
                  장비 상태
                </span>
                <span className="mt-1 block font-extrabold">점검 완료</span>
              </span>
            </div>
          </CardHeader>

          <div className="relative flex aspect-[4/3] min-h-80 items-center justify-center bg-slate-900 text-slate-200">
            {/* TODO: 장비 점검에서 획득한 MediaStream을 실제 video 요소에 연결 */}
            <div className="grid max-w-sm justify-items-center gap-4 px-6 text-center">
              <Camera aria-hidden size={48} weight="duotone" />
              <div>
                <p className="font-bold">카메라 미리보기</p>
                <p className="mt-2 text-sm text-slate-400">
                  장비 점검에서 확인한 카메라 화면이 여기에 표시됩니다.
                </p>
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent p-6 pt-16">
              <p className="text-lg font-extrabold text-white">{meeting.influencerName}</p>
              <p className="mt-1 text-sm text-slate-300">카메라 미리보기</p>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex items-center justify-between gap-4">
            <h2 className="font-extrabold">팬 진행 순서</h2>
            <p className="text-2xl font-black text-[var(--color-primary-coral)]">
              {meeting.completedFanCount}
              <span className="ml-1 text-sm text-[var(--color-text-tertiary)]">
                / {meeting.totalFanCount}명
              </span>
            </p>
          </CardHeader>

          <CardContent className="grid gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-[var(--color-primary-coral)]">
                  현재 팬
                </p>
                <p className="mt-2 text-2xl font-black">{meeting.currentFan.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  현재 순번
                </p>
                <p className="mt-2 text-xl font-black text-[var(--color-primary-coral)]">
                  {meeting.currentOrder}번째
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Avatar
                className="size-16 rounded-[var(--radius-panel)]"
                name={meeting.currentFan.name}
                size="lg"
              />
              <dl className="flex gap-8">
                <div>
                  <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                    참여 횟수
                  </dt>
                  <dd className="mt-1 font-extrabold">
                    {meeting.currentFan.participationCount}회
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                    최근 메모
                  </dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-extrabold">
                    <NotePencil aria-hidden size={18} weight="bold" />
                    있음
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-[var(--radius-panel)] bg-[var(--color-surface-page)] p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-extrabold">기존 메모</p>
                <button
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-primary-coral)]"
                  onClick={handleOpenMemo}
                  type="button"
                >
                  <NotePencil aria-hidden size={17} weight="bold" />
                  메모 확인하기
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                {meeting.currentFan.memo}
              </p>
            </div>
          </CardContent>

          <div className="border-t border-[var(--color-divider)] p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <Avatar name={meeting.nextFan.name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  다음 팬
                </p>
                <p className="mt-1 font-extrabold">{meeting.nextFan.name}</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {meeting.nextFan.order}번째 순서
                </p>
              </div>
              <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                참여 {meeting.nextFan.participationCount}회
              </p>
            </div>
          </div>

          <div className="grid gap-4 border-t border-[var(--color-divider)] p-5 sm:p-6">
            <Button
              leadingIcon={<ListChecks aria-hidden size={20} weight="bold" />}
              onClick={handleOpenFanList}
              trailingIcon={<ArrowRight aria-hidden size={18} weight="bold" />}
              variant="secondary"
            >
              팬 리스트 확인하기
            </Button>

            <AlertBanner title="팬미팅 시작 시간이 변경되었습니다" variant="warning">
              운영 일정에 따라 시작 시간이 20:00으로 조정되었습니다.
            </AlertBanner>

            {queueError ? (
              <AlertBanner title="호출 정보 연결 실패" variant="error">{queueError}</AlertBanner>
            ) : null}

            <Button
              className="w-full shadow-[var(--shadow-final-cta)]"
              disabled={!callSessionId}
              leadingIcon={<VideoCamera aria-hidden size={21} weight="bold" />}
              onClick={handleEnterCall}
              size="lg"
            >
              {callSessionId ? '영상 통화 입장' : '팬 호출 대기 중'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
