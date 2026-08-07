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
import { translate, type TranslationKey, useTranslation } from '../../i18n'
import { parseServerDate } from '../../api/serverTime'

type FeaturedMeeting = {
  id: number
  eyebrow: string
  title: string
  influencer: string
  schedule: string
  status: string
  image: string
}

/**
 * 추천 카드 위에 붙는 짧은 문구다. 카드 순서에 따라 돌려 쓴다.
 *
 * 모듈 로드 시점에 만들어지는 배열이므로 문장 대신 **사전 키**를 둔다.
 */
const featuredEyebrowKeys = [
  'commonRoutePages.eyebrow.now',
  'commonRoutePages.eyebrow.thisWeek',
  'commonRoutePages.eyebrow.preparing',
] as const satisfies readonly TranslationKey[]

function toStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'APPLICATION_OPEN':
      return translate('commonRoutePages.t58')
    case 'APPLICATION_CLOSED':
      return translate('commonRoutePages.t59')
    case 'READY':
      return translate('commonRoutePages.t60')
    case 'LIVE':
      return translate('commonRoutePages.t61')
    case 'ENDED':
    case 'COMPLETED':
      return translate('commonRoutePages.t62')
    case 'CANCELED':
      return translate('commonRoutePages.t63')
    default:
      return translate('commonRoutePages.t64')
  }
}

function formatSchedule(scheduledStartAt: string): string {
  const date = parseServerDate(scheduledStartAt)
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
  const { t } = useTranslation()
  const [featuredMeetings, setFeaturedMeetings] = useState<FeaturedMeeting[]>()
  const [activeMeetingIndex, setActiveMeetingIndex] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    void fetchPublicFanMeetings({ page: 0, size: 3 }, undefined, controller.signal)
      .then((result) => {
        setFeaturedMeetings(
          result.content.map((meeting, index) => ({
            id: meeting.meetingId,
            eyebrow: t(featuredEyebrowKeys[index] ?? 'commonRoutePages.t31'),
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
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            {t('commonRoutePages.t1')}
            <br />
            {t('commonRoutePages.t2')}
          </h1>
          <p className="mt-7 text-lg text-[var(--color-text-secondary)]">
            {t('commonRoutePages.t3')}
          </p>
        </div>
        <div className="relative flex min-h-[330px] items-center justify-center overflow-hidden lg:min-h-[440px]">
          <img
            alt={t('commonRoutePages.t4')}
            className="h-full max-h-[510px] w-full object-cover object-center mix-blend-multiply"
            src={heroJellies}
          />
        </div>
      </section>

      {featuredMeetings === undefined ? (
        <section className="flex justify-center pb-8">
          <Spinner label={t('commonRoutePages.t5')} />
        </section>
      ) : !activeMeeting ? (
        <section className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-control)] px-6 py-16 text-center">
          <h2 className="font-bold">{t('commonRoutePages.t6')}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {t('commonRoutePages.t7')}
          </p>
        </section>
      ) : (
        <section
          aria-labelledby="featured-meeting-title"
          className="relative grid items-center gap-8 pb-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12"
        >
          <IconButton
            aria-label={t('commonRoutePages.t8')}
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
                <dt className="sr-only">{t('commonRoutePages.t9')}</dt>
                <dd>{activeMeeting.influencer}</dd>
              </div>
              <div className="flex items-center gap-3">
                <CalendarBlankIcon aria-hidden="true" size={21} />
                <dt className="sr-only">{t('commonRoutePages.t10')}</dt>
                <dd>{activeMeeting.schedule}</dd>
              </div>
              <div className="flex items-center gap-3 font-bold text-[var(--color-primary-coral)]">
                <UsersThreeIcon aria-hidden="true" size={21} weight="fill" />
                <dt className="sr-only">{t('commonRoutePages.t11')}</dt>
                <dd>{activeMeeting.status}</dd>
              </div>
            </dl>
            <Link
              className="mt-8 inline-flex min-h-[var(--control-height)] items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] border border-transparent bg-[var(--color-primary-coral)] px-[var(--control-padding-inline)] py-2 text-sm font-semibold text-white shadow-[var(--shadow-control)] transition-colors hover:bg-[var(--color-primary-coral-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-coral)]"
              to={`/fan/events/${activeMeeting.id}`}
            >
              {t('commonRoutePages.t12')}
            </Link>
          </div>

          <div className="relative overflow-hidden rounded-[var(--radius-panel)]">
            <img
              alt={t('commonRoutePages.t65', { p0: activeMeeting.influencer })}
              className="aspect-[16/5] w-full object-cover"
              src={activeMeeting.image}
            />
            <IconButton
              aria-label={t('commonRoutePages.t13')}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/95 shadow-[0_10px_30px_rgb(35_38_47_/_14%)] lg:-right-0"
              icon={<ArrowRightIcon aria-hidden="true" size={22} weight="bold" />}
              onClick={() => moveMeeting(1)}
              size="lg"
              variant="secondary"
            />
          </div>

          <div
            aria-label={t('commonRoutePages.t66', { p0: featuredMeetings.length, p1: activeMeetingIndex + 1 })}
            className="flex justify-center gap-3 lg:col-start-2"
          >
            {featuredMeetings.map((meeting, index) => (
              <button
                aria-label={t('commonRoutePages.t67', { p0: index + 1 })}
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
  return translate('commonRoutePages.t68', { p0: minutes, p1: String(seconds).padStart(2, '0') })
}

function formatScheduleDot(value: string): string {
  const date = parseServerDate(value)
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
  const { t } = useTranslation()
  const { fanMeetingId } = useParams()
  const authSession = getAuthSession()
  const authToken = authSession?.accessToken
  const isManager = authSession?.role === 'MANAGER'
  // CSV 내보내기는 소유 운영자 권한이라 1인 인플루언서도 자기 팬미팅에서 쓸 수 있다.
  const canOperateExport = isManager || authSession?.role === 'SOLO_INFLUENCER'
  const roleLabel = isManager ? t('commonRoutePages.t32') : t('commonRoutePages.t33')

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
        reason instanceof Error ? reason.message : t('commonRoutePages.t34'),
      )
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (!fanMeetingId?.trim()) return

    if (!authToken) {
      setError(t('commonRoutePages.t35'))
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
            ? t('commonRoutePages.t36')
            : reason instanceof ApiError || reason instanceof TypeError
              ? reason.message
              : t('commonRoutePages.t37'),
        )
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, fanMeetingId])

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message={t('commonRoutePages.t14')}
        title={t('commonRoutePages.t15')}
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
          label: t('commonRoutePages.t38'),
          value: ratioPercent(statistics.participantCount, statistics.selectedCount),
          unit: '%',
          supporting: t('commonRoutePages.t69', { p0: statistics.participantCount, p1: statistics.selectedCount }),
          description: t('commonRoutePages.t39'),
          valueColor: 'text-[var(--color-text-primary)]',
        },
        {
          key: 'completion',
          label: t('commonRoutePages.t40'),
          value: ratioPercent(statistics.completedCallCount, statistics.selectedCount),
          unit: '%',
          supporting: t('commonRoutePages.t70', { p0: statistics.completedCallCount }),
          description: t('commonRoutePages.t41'),
          valueColor: 'text-[var(--color-success)]',
        },
        {
          // 백엔드가 팬미팅 간 재참여 이력을 아직 내려주지 않아 실제 값을 계산할 수 없다.
          // 값을 지어내는 대신 대시로 비워 두고 사유를 그대로 보여준다.
          key: 'returning',
          label: t('commonRoutePages.t42'),
          value: undefined,
          unit: '',
          supporting: t('commonRoutePages.t43'),
          description: t('commonRoutePages.t44'),
          valueColor: 'text-[var(--color-text-primary)]',
        },
        {
          key: 'duration',
          label: t('commonRoutePages.t45'),
          value: formatDurationMinSec(statistics.averageCallDurationSec),
          unit: '',
          supporting: t('commonRoutePages.t46'),
          description: t('commonRoutePages.t47'),
          valueColor: 'text-[var(--color-text-primary)]',
        },
      ]
    : []

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('commonRoutePages.t16')}</p>
          <h1 className="mt-[9px] text-[25px] font-black tracking-[-0.035em]">{t('commonRoutePages.t17')}</h1>
          <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-muted)]">
            {t('commonRoutePages.t18')}
          </p>
        </div>
        <p className="whitespace-nowrap text-sm font-bold text-[var(--color-text-muted)]">
          {roleLabel}
        </p>
      </div>

      {error ? (
        <AlertBanner className="mt-6" title={t('commonRoutePages.t19')} variant="error">
          {error}
        </AlertBanner>
      ) : !loaded ? (
        <div className="flex justify-center py-24">
          <Spinner label={t('commonRoutePages.t20')} />
        </div>
      ) : (
        <>
          <section
            aria-label={t('commonRoutePages.t21')}
            className="mt-6 grid grid-cols-2 border-y border-[var(--color-divider)] sm:grid-cols-4"
          >
            {[
              [t('commonRoutePages.t48'), detail.meeting.title],
              [t('commonRoutePages.t49'), formatScheduleDot(detail.meeting.scheduledStartAt)],
              [t('commonRoutePages.t50'), detail.influencer.name],
              [t('commonRoutePages.t51'), t('commonRoutePages.t71', { p0: statistics.selectedCount })],
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
            <h2 className="text-xl font-extrabold tracking-[-0.03em]">{t('commonRoutePages.t22')}</h2>
            <p className="mt-1.5 text-[15px] font-medium text-[var(--color-text-muted)]">
              {t('commonRoutePages.t23')}
            </p>
          </div>

          {stage === 'empty' ? (
            <div
              className="mt-5 grid place-items-center rounded-[10px] border border-dashed border-[var(--color-divider)] px-6 py-[72px] text-center"
              role="status"
            >
              <strong className="text-[19px] font-extrabold tracking-[-0.03em]">
                {t('commonRoutePages.t24')}
              </strong>
              <span className="mt-[9px] max-w-[420px] text-base font-medium leading-[1.6] text-[var(--color-text-muted)]">
                {t('commonRoutePages.t25')}
              </span>
            </div>
          ) : null}

          {stage === 'collecting' ? (
            <div
              className="mt-5 rounded-[10px] border border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] px-[18px] py-4"
              role="status"
            >
              <strong className="block text-base font-extrabold text-[var(--color-warning)]">
                {t('commonRoutePages.t26')}
              </strong>
              <p className="mt-1.5 text-[15px] font-medium leading-[1.55] text-[var(--color-warning)]">
                {t('commonRoutePages.t27')}
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
                    <Skeleton aria-label={t('commonRoutePages.t72', { p0: metric.label })} className="mt-3" lines={3} />
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
            aria-label={t('commonRoutePages.t28')}
            className="mt-[34px] flex flex-col items-stretch justify-between gap-4 border-t border-[var(--color-divider)] pt-[26px] sm:flex-row sm:items-end"
          >
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-[-0.028em]">{t('commonRoutePages.t29')}</h2>
              <p className="mt-1.5 text-[15px] font-medium leading-[1.6] text-[var(--color-text-muted)]">
                {canOperateExport
                  ? t('commonRoutePages.t52')
                  : t('commonRoutePages.t53')}
              </p>
            </div>
            <div className="flex flex-none flex-wrap gap-2.5">
              <Link
                className="mj-font-emphasis inline-flex min-h-[50px] items-center whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-5 text-base text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                to={`/fan-meetings/${encodeURIComponent(fanMeetingId)}/fans`}
              >
                {t('commonRoutePages.t30')}
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
                  {exporting ? t('commonRoutePages.t54') : t('commonRoutePages.t55')}
                </button>
              ) : null}
            </div>
          </section>
          {canOperateExport && !canExport ? (
            <p className="mt-[11px] text-sm font-medium text-[var(--color-text-muted)]">
              {stage === 'collecting'
                ? t('commonRoutePages.t56')
                : t('commonRoutePages.t57')}
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
