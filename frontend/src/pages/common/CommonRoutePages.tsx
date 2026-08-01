import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarBlankIcon,
  ChartBarIcon,
  UserIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import heroJellies from '../../assets/main-hero-jellies.webp'
import eventSeoun from '../../assets/main-event-seoun.webp'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { fetchManagerMeetings } from '../../api/managerMeetings'
import {
  getFanMeetingStatistics,
  type FanMeetingStatisticsResponse,
} from '../../api/meetingManagement'
import {
  AlertBanner,
  Card,
  CardContent,
  IconButton,
  Spinner,
} from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

type FeaturedMeeting = {
  id: string
  eyebrow: string
  title: string
  influencer: string
  schedule: string
  status: string
  image: string
}

const featuredEyebrows = [
  '지금 만날 수 있어요',
  '이번 주에 만나요',
  '새로운 만남을 준비 중이에요',
] as const

function toStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'APPLICATION_OPEN':
      return '모집 중'
    case 'APPLICATION_CLOSED':
      return '모집 마감'
    case 'READY':
      return '진행 준비'
    case 'LIVE':
      return '진행 중'
    case 'ENDED':
    case 'COMPLETED':
      return '종료'
    case 'CANCELED':
      return '취소됨'
    default:
      return '오픈 예정'
  }
}

function formatSchedule(scheduledStartAt: string): string {
  const date = new Date(scheduledStartAt)
  if (Number.isNaN(date.getTime())) return scheduledStartAt
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HomePage() {
  const [featuredMeetings, setFeaturedMeetings] = useState<FeaturedMeeting[]>()
  const [activeMeetingIndex, setActiveMeetingIndex] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const authToken = getAuthSession()?.accessToken ?? ''

    void fetchManagerMeetings({ page: 0, size: 3 }, authToken, controller.signal)
      .then((result) => {
        setFeaturedMeetings(
          result.content.map((meeting, index) => ({
            id: meeting.meetingId,
            eyebrow: featuredEyebrows[index] ?? '추천 팬미팅',
            title: meeting.title,
            influencer: meeting.influencerName,
            schedule: formatSchedule(meeting.scheduledStartAt),
            status: toStatusLabel(meeting.status),
            image: eventSeoun,
          })),
        )
      })
      .catch(() => {
        if (controller.signal.aborted) return
        // 홈 화면은 목록을 불러오지 못해도 오류 배너 없이 빈 상태만 보여준다.
        setFeaturedMeetings([])
      })

    return () => controller.abort()
  }, [])

  const activeMeeting = featuredMeetings?.[activeMeetingIndex]

  function moveMeeting(offset: number) {
    if (!featuredMeetings || featuredMeetings.length === 0) return
    setActiveMeetingIndex(
      (currentIndex) =>
        (currentIndex + offset + featuredMeetings.length) % featuredMeetings.length,
    )
  }

  return (
    <div className="grid gap-14">
      <section className="grid min-h-[440px] items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <div className="px-2 lg:pl-3">
          <p className="text-sm font-black tracking-[0.16em] text-[var(--color-text-secondary)]">
            MEETING × JELLY × MEMORY
          </p>
          <h1 className="mt-7 max-w-[580px] text-[46px] font-black leading-[1.18] tracking-[-0.055em] text-[var(--color-text-primary)] sm:text-[58px] lg:text-[60px]">
            기다림은 설렘으로,
            <br />
            만남은 기억으로.
          </h1>
          <p className="mt-7 text-lg text-[var(--color-text-secondary)]">
            좋아하는 인플루언서와 단둘이 만나는 1:1 영상 팬미팅.
          </p>
        </div>
        <div className="relative flex min-h-[330px] items-center justify-center overflow-hidden lg:min-h-[440px]">
          <img
            alt="서로 기대어 웃고 있는 코랄색과 보라색 젤리 캐릭터"
            className="h-full max-h-[510px] w-full object-cover object-center mix-blend-multiply"
            src={heroJellies}
          />
        </div>
      </section>

      {featuredMeetings === undefined ? (
        <section className="flex justify-center pb-8">
          <Spinner label="팬미팅 소식을 불러오는 중" />
        </section>
      ) : !activeMeeting ? (
        <section className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-control)] px-6 py-16 text-center">
          <h2 className="font-bold">아직 소개할 팬미팅이 없어요</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            새로운 팬미팅이 공개되면 이곳에서 가장 먼저 알려드릴게요.
          </p>
        </section>
      ) : (
        <section
          aria-labelledby="featured-meeting-title"
          className="relative grid items-center gap-8 pb-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12"
        >
          <IconButton
            aria-label="이전 팬미팅"
            className="absolute left-0 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_10px_30px_rgb(35_38_47_/_12%)] lg:inline-flex"
            icon={<ArrowLeftIcon aria-hidden="true" size={22} weight="bold" />}
            onClick={() => moveMeeting(-1)}
            size="lg"
            variant="secondary"
          />

          <div className="lg:pl-3">
            <p className="text-sm font-bold text-[var(--color-text-primary)]">
              {activeMeeting.eyebrow}
            </p>
            <h2
              className="mt-7 text-2xl font-black tracking-[-0.035em] sm:text-3xl"
              id="featured-meeting-title"
            >
              {activeMeeting.title}
            </h2>
            <dl className="mt-8 grid gap-4 text-[15px] text-[var(--color-text-secondary)]">
              <div className="flex items-center gap-3">
                <UserIcon aria-hidden="true" size={21} />
                <dt className="sr-only">인플루언서</dt>
                <dd>{activeMeeting.influencer}</dd>
              </div>
              <div className="flex items-center gap-3">
                <CalendarBlankIcon aria-hidden="true" size={21} />
                <dt className="sr-only">일정</dt>
                <dd>{activeMeeting.schedule}</dd>
              </div>
              <div className="flex items-center gap-3 font-bold text-[var(--color-primary-coral)]">
                <UsersThreeIcon aria-hidden="true" size={21} weight="fill" />
                <dt className="sr-only">모집 상태</dt>
                <dd>{activeMeeting.status}</dd>
              </div>
            </dl>
            <Link
              className="mt-8 inline-flex min-h-[var(--control-height)] items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] border border-transparent bg-[var(--color-primary-coral)] px-[var(--control-padding-inline)] py-2 text-sm font-semibold text-white shadow-[var(--shadow-control)] transition-colors hover:bg-[var(--color-primary-coral-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-coral)]"
              to={`/fan/events/${activeMeeting.id}`}
            >
              상세 보기
            </Link>
          </div>

          <div className="relative overflow-hidden rounded-[var(--radius-panel)]">
            <img
              alt={`${activeMeeting.influencer} 팬미팅 소개`}
              className="aspect-[16/5] w-full object-cover"
              src={activeMeeting.image}
            />
            <IconButton
              aria-label="다음 팬미팅"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/95 shadow-[0_10px_30px_rgb(35_38_47_/_14%)] lg:-right-0"
              icon={<ArrowRightIcon aria-hidden="true" size={22} weight="bold" />}
              onClick={() => moveMeeting(1)}
              size="lg"
              variant="secondary"
            />
          </div>

          <div
            aria-label={`${featuredMeetings.length}개 중 ${activeMeetingIndex + 1}번째 팬미팅`}
            className="flex justify-center gap-3 lg:col-start-2"
          >
            {featuredMeetings.map((meeting, index) => (
              <button
                aria-label={`${index + 1}번째 팬미팅 보기`}
                className={[
                  'size-3 rounded-full transition',
                  index === activeMeetingIndex
                    ? 'bg-[var(--color-primary-coral)]'
                    : 'bg-[var(--color-border-control)] hover:bg-[var(--color-text-tertiary)]',
                ].join(' ')}
                key={meeting.id}
                onClick={() => setActiveMeetingIndex(index)}
                type="button"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function formatDurationMinSec(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}분 ${String(seconds).padStart(2, '0')}초`
}

function formatTotalDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`
}

export function MeetingStatisticsPage() {
  const { fanMeetingId } = useParams()
  const [statistics, setStatistics] = useState<FanMeetingStatisticsResponse>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!fanMeetingId?.trim()) return

    const controller = new AbortController()
    const session = getAuthSession()

    if (!session) {
      setError('팬미팅 통계를 확인하려면 먼저 로그인해 주세요.')
      return () => controller.abort()
    }

    void getFanMeetingStatistics(fanMeetingId, session.accessToken, controller.signal)
      .then((result) => {
        setStatistics(result)
        setError(undefined)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError && reason.status === 403
            ? '팬미팅 통계를 조회할 권한이 없습니다.'
            : reason instanceof ApiError || reason instanceof TypeError
              ? reason.message
              : '팬미팅 통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        )
      })

    return () => controller.abort()
  }, [fanMeetingId])

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 fanMeetingId 값이 없습니다. 이전 화면에서 올바른 팬미팅을 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  const countItems = statistics
    ? [
        { label: '응모', value: statistics.applicationCount },
        { label: '당첨', value: statistics.selectedCount },
        { label: '참여', value: statistics.participantCount },
        { label: '완료 통화', value: statistics.completedCallCount },
        { label: '노쇼', value: statistics.noShowCount },
        { label: '실패 통화', value: statistics.failedCallCount },
      ]
    : []

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      <header>
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-secondary)]">
          <ChartBarIcon aria-hidden="true" size={18} weight="bold" />
          팬미팅 운영 결과
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">팬미팅 통계</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          응모부터 통화 완료까지 팬미팅 운영 결과를 확인하세요.
        </p>
      </header>

      {error ? (
        <AlertBanner title="팬미팅 통계를 확인할 수 없습니다" variant="error">
          {error}
        </AlertBanner>
      ) : !statistics ? (
        <div className="flex justify-center py-24">
          <Spinner label="팬미팅 통계를 불러오는 중" />
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {countItems.map((item) => (
              <Card key={item.label}>
                <CardContent>
                  <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                    {item.label}
                  </p>
                  <p className="mt-3 text-4xl font-black tracking-[-0.04em]">
                    {item.value.toLocaleString('ko-KR')}
                    <span className="ml-1 text-base font-bold text-[var(--color-text-tertiary)]">
                      명
                    </span>
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent>
                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                  평균 통화시간
                </p>
                <p className="mt-3 text-3xl font-black tracking-[-0.04em]">
                  {formatDurationMinSec(statistics.averageCallDurationSec)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                  총 진행시간
                </p>
                <p className="mt-3 text-3xl font-black tracking-[-0.04em]">
                  {formatTotalDuration(statistics.totalMeetingDurationSec)}
                </p>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
