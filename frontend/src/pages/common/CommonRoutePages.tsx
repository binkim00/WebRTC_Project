import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarBlankIcon,
  UserIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import heroJellies from '../../assets/main-hero-jellies.webp'
import eventSeoun from '../../assets/main-event-seoun.webp'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  fetchPublicFanMeetingDetail,
  fetchPublicFanMeetings,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import {
  downloadFanMeetingStatisticsCsv,
  getFanMeetingStatistics,
  type FanMeetingStatisticsResponse,
} from '../../api/meetingManagement'
import { AlertBanner, IconButton, Skeleton, Spinner } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

type FeaturedMeeting = {
  id: number
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

    void fetchPublicFanMeetings({ page: 0, size: 3 }, undefined, controller.signal)
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

function formatScheduleDot(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 분모가 0이면 계산 자체가 의미 없으므로 0%로 두지 않고 대시로 남긴다. */
function ratioPercent(numerator: number, denominator: number): string | undefined {
  if (denominator <= 0) return undefined
  return String(Math.round((numerator / denominator) * 100))
}

type StatisticsMetric = {
  key: string
  label: string
  value?: string
  unit: string
  supporting: string
  description: string
  valueColor: string
}

export function MeetingStatisticsPage() {
  const { fanMeetingId } = useParams()
  const authSession = getAuthSession()
  const authToken = authSession?.accessToken
  const isManager = authSession?.role === 'MANAGER'
  // CSV 내보내기는 소유 운영자 권한이라 1인 인플루언서도 자기 팬미팅에서 쓸 수 있다.
  const canOperateExport = isManager || authSession?.role === 'SOLO_INFLUENCER'
  const roleLabel = isManager ? '매니저 보기' : '인플루언서 보기'

  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  const [statistics, setStatistics] = useState<FanMeetingStatisticsResponse>()
  const [error, setError] = useState<string>()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string>()

  /** 참가자별 운영 결과 CSV를 받아 브라우저 다운로드로 저장한다. */
  async function handleExport() {
    if (!fanMeetingId || !authToken || exporting) return

    setExporting(true)
    setExportError(undefined)
    try {
      const { blob, fileName } = await downloadFanMeetingStatisticsCsv(fanMeetingId, authToken)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch (reason) {
      setExportError(
        reason instanceof Error ? reason.message : '결과 파일을 내려받지 못했습니다.',
      )
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (!fanMeetingId?.trim()) return

    if (!authToken) {
      setError('팬미팅 통계를 확인하려면 먼저 로그인해 주세요.')
      return
    }

    const controller = new AbortController()

    void Promise.all([
      fetchPublicFanMeetingDetail(Number(fanMeetingId), authToken, controller.signal),
      getFanMeetingStatistics(fanMeetingId, authToken, controller.signal),
    ])
      .then(([detailResult, statisticsResult]) => {
        setDetail(detailResult)
        setStatistics(statisticsResult)
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
  }, [authToken, fanMeetingId])

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 fanMeetingId 값이 없습니다. 이전 화면에서 올바른 팬미팅을 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  const loaded = detail && statistics
  // 팬미팅이 아직 끝나지 않았으면 결과가 계속 바뀌는 중이고, 끝났는데 완료된 세션이
  // 하나도 없으면 애초에 집계할 것이 없다. 그 외에는 정상적으로 결과를 보여준다.
  const stage: 'ready' | 'collecting' | 'empty' = !loaded
    ? 'collecting'
    : detail.meeting.status !== 'ENDED'
      ? 'collecting'
      : statistics.completedCallCount === 0
        ? 'empty'
        : 'ready'
  const canExport = canOperateExport && stage === 'ready'

  const metrics: StatisticsMetric[] = statistics
    ? [
        {
          key: 'participation',
          label: '참여율',
          value: ratioPercent(statistics.participantCount, statistics.selectedCount),
          unit: '%',
          supporting: `${statistics.participantCount}명 / ${statistics.selectedCount}명`,
          description: '전체 참가자 중 실제 팬미팅에 참여한 팬의 비율입니다.',
          valueColor: 'text-[var(--color-text-primary)]',
        },
        {
          key: 'completion',
          label: '정상 완료율',
          value: ratioPercent(statistics.completedCallCount, statistics.selectedCount),
          unit: '%',
          supporting: `${statistics.completedCallCount}개 세션 정상 종료`,
          description: '연결 실패, 노쇼, 강제 종료 없이 완료된 세션 비율입니다.',
          valueColor: 'text-[var(--color-success)]',
        },
        {
          // 백엔드가 팬미팅 간 재참여 이력을 아직 내려주지 않아 실제 값을 계산할 수 없다.
          // 값을 지어내는 대신 대시로 비워 두고 사유를 그대로 보여준다.
          key: 'returning',
          label: '재참여 팬 비율',
          value: undefined,
          unit: '',
          supporting: '집계 데이터 없음',
          description: '이전 팬미팅에도 참여한 이력이 있는 팬의 비율입니다.',
          valueColor: 'text-[var(--color-text-primary)]',
        },
        {
          key: 'duration',
          label: '평균 통화 시간',
          value: formatDurationMinSec(statistics.averageCallDurationSec),
          unit: '',
          supporting: '완료 세션 기준',
          description: '정상적으로 완료된 세션의 실제 평균 통화 시간입니다.',
          valueColor: 'text-[var(--color-text-primary)]',
        },
      ]
    : []

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-bold text-[var(--color-text-muted)]">종료된 팬미팅</p>
          <h1 className="mt-[9px] text-[25px] font-black tracking-[-0.035em]">팬미팅 통계</h1>
          <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-muted)]">
            실제 1:1 영상통화 팬미팅의 핵심 운영 결과를 확인하세요.
          </p>
        </div>
        <p className="whitespace-nowrap text-sm font-bold text-[var(--color-text-muted)]">
          {roleLabel}
        </p>
      </div>

      {error ? (
        <AlertBanner className="mt-6" title="팬미팅 통계를 확인할 수 없습니다" variant="error">
          {error}
        </AlertBanner>
      ) : !loaded ? (
        <div className="flex justify-center py-24">
          <Spinner label="팬미팅 통계를 불러오는 중" />
        </div>
      ) : (
        <>
          <section
            aria-label="팬미팅 정보"
            className="mt-6 grid grid-cols-2 border-y border-[var(--color-divider)] sm:grid-cols-4"
          >
            {[
              ['팬미팅명', detail.meeting.title],
              ['진행 일자', formatScheduleDot(detail.meeting.scheduledStartAt)],
              ['인플루언서', detail.influencer.name],
              ['전체 참가자', `${statistics.selectedCount}명`],
            ].map(([label, value], index) => (
              <div
                className={index ? 'border-l border-[var(--color-divider)] px-5 py-[17px]' : 'py-[17px] pr-5'}
                key={label}
              >
                <p className="text-[13px] font-bold text-[var(--color-text-muted)]">{label}</p>
                <p className="mt-1.5 truncate text-[17px] font-extrabold tabular-nums">{value}</p>
              </div>
            ))}
          </section>

          <div className="mt-8">
            <h2 className="text-xl font-extrabold tracking-[-0.03em]">핵심 결과</h2>
            <p className="mt-1.5 text-[15px] font-medium text-[var(--color-text-muted)]">
              완료된 세션을 기준으로 집계한 운영 결과입니다.
            </p>
          </div>

          {stage === 'empty' ? (
            <div
              className="mt-5 grid place-items-center rounded-[10px] border border-dashed border-[var(--color-divider)] px-6 py-[72px] text-center"
              role="status"
            >
              <strong className="text-[19px] font-extrabold tracking-[-0.03em]">
                집계할 수 있는 세션이 없습니다
              </strong>
              <span className="mt-[9px] max-w-[420px] text-base font-medium leading-[1.6] text-[var(--color-text-muted)]">
                정상적으로 완료된 세션이 없어 핵심 결과 지표를 표시할 수 없습니다.
              </span>
            </div>
          ) : null}

          {stage === 'collecting' ? (
            <div
              className="mt-5 rounded-[10px] border border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] px-[18px] py-4"
              role="status"
            >
              <strong className="block text-base font-extrabold text-[var(--color-warning)]">
                팬미팅 결과를 집계하고 있습니다
              </strong>
              <p className="mt-1.5 text-[15px] font-medium leading-[1.55] text-[var(--color-warning)]">
                완료된 세션을 확인한 뒤 통계와 결과 파일을 준비합니다.
              </p>
            </div>
          ) : null}

          {stage !== 'empty' ? (
            <div className="mt-5 grid grid-cols-2 border-t border-[var(--color-divider)] sm:grid-cols-4">
              {metrics.map((metric, index) => (
                <article
                  className={`min-w-0 border-b border-[var(--color-divider)] py-[22px] pr-[22px] ${index ? 'border-l border-[var(--color-divider)] pl-[22px]' : ''}`}
                  key={metric.key}
                >
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">{metric.label}</p>
                  {stage === 'collecting' ? (
                    <Skeleton aria-label={`${metric.label} 집계 중`} className="mt-3" lines={3} />
                  ) : (
                    <>
                      <p className="mt-2.5 flex items-baseline gap-[3px]">
                        <strong
                          className={`text-[38px] font-black leading-none tracking-[-0.045em] tabular-nums ${metric.valueColor}`}
                        >
                          {metric.value ?? '–'}
                        </strong>
                        {metric.value && metric.unit ? (
                          <span className={`text-[22px] font-extrabold ${metric.valueColor}`}>
                            {metric.unit}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-[11px] text-[15px] font-bold tabular-nums">
                        {metric.supporting}
                      </p>
                      <p className="mt-[9px] text-sm font-medium leading-[1.6] text-[var(--color-text-muted)]">
                        {metric.description}
                      </p>
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : null}

          <section
            aria-label="팬미팅 결과"
            className="mt-[34px] flex flex-col items-stretch justify-between gap-4 border-t border-[var(--color-divider)] pt-[26px] sm:flex-row sm:items-end"
          >
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-[-0.028em]">팬미팅 결과 상세</h2>
              <p className="mt-1.5 text-[15px] font-medium leading-[1.6] text-[var(--color-text-muted)]">
                {canOperateExport
                  ? '참가자별 상태를 확인하거나 운영 결과 파일을 준비할 수 있습니다.'
                  : '참가자별 상태를 확인할 수 있습니다.'}
              </p>
            </div>
            <div className="flex flex-none flex-wrap gap-2.5">
              <Link
                className="mj-font-emphasis inline-flex min-h-[50px] items-center whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-5 text-base text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                to={`/fan-meetings/${encodeURIComponent(fanMeetingId)}/fans`}
              >
                팬 리스트 보기
              </Link>
              {canOperateExport ? (
                <button
                  className={`mj-font-label inline-flex min-h-[50px] items-center whitespace-nowrap rounded-[var(--radius-control)] border px-5 text-base ${
                    canExport && !exporting
                      ? 'border-[var(--color-border-control)] text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)]'
                      : 'cursor-not-allowed border-[var(--color-divider)] text-[var(--color-text-muted)]'
                  }`}
                  disabled={!canExport || exporting}
                  onClick={() => void handleExport()}
                  type="button"
                >
                  {exporting ? '내보내는 중…' : '결과 내보내기'}
                </button>
              ) : null}
            </div>
          </section>
          {canOperateExport && !canExport ? (
            <p className="mt-[11px] text-sm font-medium text-[var(--color-text-muted)]">
              {stage === 'collecting'
                ? '집계가 끝나면 결과 파일을 내보낼 수 있어요.'
                : '집계된 세션이 없어 내보낼 결과가 없습니다.'}
            </p>
          ) : null}
          {exportError ? (
            <p className="mt-[11px] text-sm font-bold text-[var(--color-error)]" role="alert">
              {exportError}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
