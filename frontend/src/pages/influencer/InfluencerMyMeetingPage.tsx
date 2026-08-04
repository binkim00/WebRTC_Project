import { CalendarBlank, VideoCamera } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertBanner, Badge, Button, Card } from '../../components'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { fetchMyMeetings, type ManagerMeetingSummary } from '../../api/managerMeetings'

/** 팬미팅 시작 일시가 오늘(로컬 기준)인지 확인한다. */
function isScheduledToday(value: string): boolean {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

/** 팬미팅 시작 일시를 "2026. 07. 31. 19:00" 형태로 표시한다. */
function formatScheduledAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/** 인플루언서가 오늘 진행할 팬미팅을 확인하고 장비 점검으로 이동하는 페이지다. */
export function InfluencerMyMeetingPage() {
  const navigate = useNavigate()
  const [meetingSummaries, setMeetingSummaries] = useState<ManagerMeetingSummary[]>([])
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)

  // 내 팬미팅 전체 페이지에서 오늘 진행할 팬미팅을 찾는다. 첫 페이지만 조회하면 오래된 계정의 일정이 누락될 수 있다.
  useEffect(() => {
    const controller = new AbortController()
    const session = getAuthSession()

    if (!session || (session.role !== 'INFLUENCER' && session.role !== 'SOLO_INFLUENCER')) {
      setError('인플루언서 계정으로 로그인해 주세요.')
      setLoading(false)
      return () => controller.abort()
    }

    void (async () => {
      const firstPage = await fetchMyMeetings(
        { page: 0, size: 50 },
        session.accessToken,
        controller.signal,
      )
      const allMeetings = [...firstPage.content]

      for (let page = 1; page < firstPage.totalPages; page += 1) {
        const nextPage = await fetchMyMeetings(
          { page, size: 50 },
          session.accessToken,
          controller.signal,
        )
        allMeetings.push(...nextPage.content)
      }

      return allMeetings
    })()
      .then((allMeetings) => {
        const activeMeetings = allMeetings
          .filter(
            (item) =>
              item.status === 'LIVE' ||
              (item.status !== 'ENDED' &&
                item.status !== 'CANCELED' &&
                isScheduledToday(item.scheduledStartAt)),
          )
          .sort((left, right) => {
            if (left.status === 'LIVE' && right.status !== 'LIVE') return -1
            if (right.status === 'LIVE' && left.status !== 'LIVE') return 1
            return (
              new Date(left.scheduledStartAt).getTime() -
              new Date(right.scheduledStartAt).getTime()
            )
          })

        setMeetingSummaries(activeMeetings)
        setError(activeMeetings.length > 0 ? undefined : '오늘 진행할 팬미팅이 없습니다.')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : '내 팬미팅을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  /** 오늘의 팬미팅 장비 점검 화면으로 이동한다. */
  function handleOpenDeviceCheck(meetingSummary: ManagerMeetingSummary) {
    navigate(`/influencer/fan-meetings/${meetingSummary.meetingId}/device-check`)
  }

  return (
    <div className="grid gap-12 pb-8">
      {error ? (
        <AlertBanner title="팬미팅을 선택할 수 없습니다" variant="error">
          {error}
        </AlertBanner>
      ) : null}

      <header className="grid gap-3">
        <h1 className="text-4xl font-black leading-tight tracking-[-0.04em]">
          나의 팬미팅
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          오늘 진행할 팬미팅을 확인하고 장비 점검 후 입장하세요.
        </p>
      </header>

      {/* 오늘의 팬미팅: 팬미팅명과 시작 일시, 장비 점검 이동 버튼만 표시한다 */}
      <section aria-labelledby="today-meeting-title" className="grid gap-5">
        <h2
          className="text-2xl font-extrabold tracking-[-0.025em]"
          id="today-meeting-title"
        >
          오늘의 팬미팅
        </h2>

        {loading ? (
          <Card className="p-8 text-center text-[var(--color-text-secondary)]">
            오늘의 팬미팅을 불러오는 중입니다.
          </Card>
        ) : meetingSummaries.length > 0 ? (
          meetingSummaries.map((meetingSummary) => (
            <Card className="overflow-hidden" key={meetingSummary.meetingId}>
              <div className="grid gap-8 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:p-8">
                <div className="grid gap-5">
                  <Badge
                    className="w-fit"
                    variant={meetingSummary.status === 'LIVE' ? 'primary' : 'success'}
                  >
                    {meetingSummary.status === 'LIVE' ? '진행 중' : '오늘 진행'}
                  </Badge>
                  <h3 className="text-3xl font-black tracking-[-0.04em]">
                    {meetingSummary.title}
                  </h3>
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
                    <CalendarBlank aria-hidden size={20} weight="bold" />
                    {formatScheduledAt(meetingSummary.scheduledStartAt)}
                  </p>
                </div>

                <Button
                  className="w-full shadow-[var(--shadow-final-cta)] sm:w-auto"
                  leadingIcon={<VideoCamera aria-hidden size={21} weight="bold" />}
                  onClick={() => handleOpenDeviceCheck(meetingSummary)}
                  size="lg"
                >
                  장비 점검 후 입장
                </Button>
              </div>
            </Card>
          ))
        ) : (
          <Card className="p-8 text-center text-[var(--color-text-secondary)]">
            오늘 진행할 팬미팅이 없습니다.
          </Card>
        )}
      </section>
    </div>
  )
}
