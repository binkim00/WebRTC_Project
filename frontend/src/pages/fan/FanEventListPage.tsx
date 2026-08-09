import type { FormEvent } from 'react'
import { parseServerDate } from '../../api/serverTime'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import moldEmptyImage from '../../assets/jelly-mold-empty.png'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  fetchPublicFanMeetings,
  prefetchPublicFanMeetingDetail,
  type PublicFanMeetingStatus,
  type PublicFanMeetingSummary,
} from '../../api/fanMeetings'
import { AlertBanner, Select, Spinner, TextField } from '../../components'
import { useTranslation, type TranslationKey } from '../../i18n'
import { fanMeetingStatusContent } from './fanMeetingStatus'

/**
 * 이 화면에 나열하는 팬미팅 범위다. 응모 시작 전(PUBLISHED)도 미리 보고 기다릴 수 있게 노출한다.
 * 진행/종료(LIVE/ENDED)는 다른 화면의 몫이고, 모집이 끝난(APPLICATION_CLOSED) 팬미팅은
 * 더 이상 팬이 할 수 있는 행동이 없어 목록에서 뺀다.
 */
const discoverableStatuses = [
  'PUBLISHED',
  'APPLICATION_OPEN',
  'READY',
] as const satisfies readonly PublicFanMeetingStatus[]

/**
 * 모집 상태 필터다. 라벨은 사전 키로 들고 있고 화면에서 현재 언어로 번역한다.
 * (모듈 상수라 훅을 쓸 수 없고 언어가 바뀔 때 다시 만들 수도 없다.)
 */
const statusFilterOptions = [
  { labelKey: 'fanEvents.status.all', value: 'ALL' },
  { labelKey: 'fanEvents.status.published', value: 'PUBLISHED' },
  { labelKey: 'fanEvents.status.open', value: 'APPLICATION_OPEN' },
  { labelKey: 'fanEvents.status.ready', value: 'READY' },
] as const satisfies readonly { labelKey: TranslationKey; value: string }[]

/**
 * dc.html의 날짜 필터는 "8월 1주차"처럼 특정 달에 고정된 데모용 값이라 그대로 쓸 수 없다.
 * 팬미팅은 며칠에서 몇 주 앞 일정이 대부분이라, 오늘 기준 상대 기간을
 * 일(오늘) · 주(이번 주/다음 주) · 월(이번 달/다음 달) 세 단위로 제공한다.
 */
const dateFilterOptions = [
  { labelKey: 'fanEvents.date.all', value: 'ALL' },
  { labelKey: 'fanEvents.date.today', value: 'TODAY' },
  { labelKey: 'fanEvents.date.thisWeek', value: 'THIS_WEEK' },
  { labelKey: 'fanEvents.date.nextWeek', value: 'NEXT_WEEK' },
  { labelKey: 'fanEvents.date.thisMonth', value: 'THIS_MONTH' },
  { labelKey: 'fanEvents.date.nextMonth', value: 'NEXT_MONTH' },
] as const satisfies readonly { labelKey: TranslationKey; value: string }[]

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** 오늘이 포함된 주의 일요일 0시를 기준으로 이번 주/다음 주 경계를 계산한다. */
function weekRange(weeksFromNow: number): { start: Date; end: Date } {
  const today = startOfDay(new Date())
  const sunday = new Date(today.getTime() - today.getDay() * DAY_MS)
  const start = new Date(sunday.getTime() + weeksFromNow * 7 * DAY_MS)
  const end = new Date(start.getTime() + 7 * DAY_MS)
  return { start, end }
}

/** 이번 달 1일 0시를 기준으로 이번 달/다음 달 경계를 계산한다. */
function monthRange(monthsFromNow: number): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + monthsFromNow, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + monthsFromNow + 1, 1)
  return { start, end }
}

/** 날짜 필터 값을 [시작, 끝) 경계로 바꾼다. 전체면 undefined다. */
function dateRangeOf(value: string): { start: Date; end: Date } | undefined {
  if (value === 'TODAY') {
    const start = startOfDay(new Date())
    return { start, end: new Date(start.getTime() + DAY_MS) }
  }
  if (value === 'THIS_WEEK') return weekRange(0)
  if (value === 'NEXT_WEEK') return weekRange(1)
  if (value === 'THIS_MONTH') return monthRange(0)
  if (value === 'NEXT_MONTH') return monthRange(1)
  return undefined
}

function formatDateTime(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}.${month}.${day} ${hour}:${minute}`
}

/** "응모 마감 MM.DD" 표기용으로 연도 없이 월.일만 남긴다. */
function formatMonthDay(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}.${day}`
}

function daysUntil(value: string): number {
  const target = startOfDay(parseServerDate(value))
  const today = startOfDay(new Date())
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

type AppliedFilters = {
  keyword: string
  status: string
  date: string
  influencerName: string
}

/**
 * 목록 정렬 기준이다. 응모 마감 임박순(기본) 외에 최신 등록순과 팬미팅 일정순을 제공한다.
 * 요약 응답에 생성 시각이 없어 최신 등록순은 meetingId 내림차순(생성 순서)으로 근사한다.
 */
type SortOption = 'DEADLINE' | 'NEWEST' | 'SCHEDULE'

const sortOptions = [
  { labelKey: 'fanEvents.sort.deadline', value: 'DEADLINE' },
  { labelKey: 'fanEvents.sort.newest', value: 'NEWEST' },
  { labelKey: 'fanEvents.sort.schedule', value: 'SCHEDULE' },
] as const satisfies readonly { labelKey: TranslationKey; value: SortOption }[]

/** 정렬 기준에 맞는 비교 함수를 돌려준다. */
function compareMeetings(
  sortBy: SortOption,
): (left: PublicFanMeetingSummary, right: PublicFanMeetingSummary) => number {
  if (sortBy === 'NEWEST') {
    return (left, right) => right.meetingId - left.meetingId
  }
  if (sortBy === 'SCHEDULE') {
    return (left, right) =>
      parseServerDate(left.scheduledStartAt).getTime() -
      parseServerDate(right.scheduledStartAt).getTime()
  }
  // 응모 마감이 가까운 순서로 보여준다. 응모 기간이 없는 항목은 뒤로 보낸다.
  return (left, right) => {
    if (!left.applicationEndAt && !right.applicationEndAt) return 0
    if (!left.applicationEndAt) return 1
    if (!right.applicationEndAt) return -1
    return (
      parseServerDate(left.applicationEndAt).getTime() -
      parseServerDate(right.applicationEndAt).getTime()
    )
  }
}

const initialFilters: AppliedFilters = {
  keyword: '',
  status: 'ALL',
  date: 'ALL',
  influencerName: '',
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof ApiError || reason instanceof TypeError
    ? reason.message
    : fallback
}

export function FanEventListPage() {
  const { t } = useTranslation()
  // 필터 옵션은 사전 키로 정의돼 있어 현재 언어로 번역해 Select에 넘긴다.
  const translatedStatusOptions = statusFilterOptions.map((option) => ({
    label: t(option.labelKey),
    value: option.value,
  }))
  const translatedDateOptions = dateFilterOptions.map((option) => ({
    label: t(option.labelKey),
    value: option.value,
  }))
  const [meetings, setMeetings] = useState<PublicFanMeetingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [filters, setFilters] = useState<AppliedFilters>(initialFilters)
  // 정렬은 결과를 다시 조회할 필요가 없어 검색 폼과 달리 고르는 즉시 반영한다.
  const [sortBy, setSortBy] = useState<SortOption>('DEADLINE')

  useEffect(() => {
    const controller = new AbortController()
    const authToken = getAuthSession()?.accessToken

    setLoading(true)
    setError(undefined)

    void fetchPublicFanMeetings(
      { keyword: filters.keyword, page: 0, size: 100 },
      authToken,
      controller.signal,
    )
      .then((result) => {
        setMeetings(result.content)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 목록 재조회를
        // 유발하므로 제외한다. 이미 표시된 오류 문구는 다음 조회 때 새 언어로 바뀐다.
        setError(errorMessage(reason, t('fanEvents.loadFailed')))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // t는 위 주석대로 의존성에서 제외한다. 언어 전환이 목록 재조회를 유발하지 않게 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.keyword])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setFilters({
      keyword: String(formData.get('keyword') ?? '').trim(),
      status: String(formData.get('status') ?? 'ALL'),
      date: String(formData.get('date') ?? 'ALL'),
      influencerName: String(formData.get('influencerName') ?? '').trim(),
    })
  }

  const dateBounds = dateRangeOf(filters.date)
  const influencerQuery = filters.influencerName.toLowerCase()

  const visibleMeetings = meetings
    .filter((meeting) => discoverableStatuses.some((status) => status === meeting.status))
    .filter((meeting) => filters.status === 'ALL' || meeting.status === filters.status)
    .filter(
      (meeting) =>
        !influencerQuery || meeting.influencerName.toLowerCase().includes(influencerQuery),
    )
    .filter((meeting) => {
      if (!dateBounds) return true
      const scheduled = parseServerDate(meeting.scheduledStartAt)
      return scheduled >= dateBounds.start && scheduled < dateBounds.end
    })
    .sort(compareMeetings(sortBy))

  const soonestOpenMeetingId = visibleMeetings.find(
    (meeting) => meeting.status === 'APPLICATION_OPEN' && meeting.applicationEndAt,
  )?.meetingId

  return (
    <div>
      <h1 className="text-[30px] font-black tracking-[-0.04em]">{t('fanEvents.heading')}</h1>
      <p className="mt-[9px] text-[17px] font-medium text-[var(--color-text-body)]">
        {t('fanEvents.lead')}
      </p>

      <form
        className="mt-[22px] grid grid-cols-1 items-end gap-3 border-b border-[var(--color-divider)] pb-[22px] sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]"
        onSubmit={handleSearch}
        role="search"
      >
        <TextField
          containerClassName="sm:col-span-2 lg:col-span-1"
          defaultValue={filters.keyword}
          label={t('fanEvents.search.label')}
          name="keyword"
          placeholder={t('fanEvents.search.placeholder')}
          type="search"
        />
        <Select
          defaultValue={filters.status}
          label={t('fanEvents.status.label')}
          name="status"
          options={translatedStatusOptions}
        />
        <Select
          defaultValue={filters.date}
          label={t('fanEvents.date.label')}
          name="date"
          options={translatedDateOptions}
        />
        <TextField
          defaultValue={filters.influencerName}
          label={t('fanEvents.influencer.label')}
          name="influencerName"
          placeholder={t('fanEvents.influencer.placeholder')}
          type="search"
        />
        <button
          className="mj-font-emphasis min-h-[46px] whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-[22px] text-[15px] text-white hover:bg-[var(--color-primary-coral-hover)]"
          type="submit"
        >
          {t('fanEvents.search.submit')}
        </button>
      </form>

      {error ? (
        <AlertBanner className="mt-6" title={t('fanEvents.error.title')} variant="error">
          {error}
        </AlertBanner>
      ) : loading ? (
        <div className="flex min-h-80 items-center justify-center">
          <Spinner label={t('fanEvents.loading')} />
        </div>
      ) : visibleMeetings.length === 0 ? (
        <div aria-live="polite" className="grid place-items-center px-6 py-[76px] text-center">
          <img alt="" className="size-24 object-contain opacity-60" decoding="async" loading="lazy" src={moldEmptyImage} />
          <strong className="mt-4 text-[19px] font-extrabold tracking-[-0.03em]">
            {t('fanEvents.empty.title')}
          </strong>
          <span className="mt-2 text-base font-medium text-[var(--color-text-muted)]">
            {t('fanEvents.empty.description')}
          </span>
        </div>
      ) : (
        <>
          <div className="mt-[22px] flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] font-extrabold tabular-nums">
              {t('fanEvents.count', { count: visibleMeetings.length })}
            </p>
            <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
              {t('fanEvents.sort.label')}
              <select
                className="min-h-9 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-2.5 text-sm font-bold text-[var(--color-text-primary)]"
                onChange={(event) => setSortBy(event.target.value as SortOption)}
                value={sortBy}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3.5 grid grid-cols-1 gap-x-[26px] gap-y-[30px] sm:grid-cols-2 lg:grid-cols-3">
            {visibleMeetings.map((meeting) => {
              const statusLabel = fanMeetingStatusContent()[meeting.status].label
              const isOpen = meeting.status === 'APPLICATION_OPEN'
              const isUpcoming = meeting.status === 'PUBLISHED'
              const statusColor = isOpen
                ? 'text-[var(--color-primary-coral)]'
                : isUpcoming
                  ? 'text-[var(--color-text-muted)]'
                  : 'text-[var(--color-success)]'
              const dday = isOpen && meeting.applicationEndAt ? daysUntil(meeting.applicationEndAt) : undefined
              const ddayUrgent = dday !== undefined && dday <= 7
              const showSeam = meeting.meetingId === soonestOpenMeetingId

              return (
                <article className="min-w-0" key={meeting.meetingId}>
                  <Link
                    className="block text-inherit no-underline"
                    onFocus={() => void prefetchPublicFanMeetingDetail(meeting.meetingId, getAuthSession()?.accessToken)}
                    onMouseEnter={() => void prefetchPublicFanMeetingDetail(meeting.meetingId, getAuthSession()?.accessToken)}
                    onTouchStart={() => void prefetchPublicFanMeetingDetail(meeting.meetingId, getAuthSession()?.accessToken)}
                    to={`/fan/events/${meeting.meetingId}`}
                  >
                    <figure className="relative m-0 overflow-hidden rounded-[10px] bg-[var(--color-surface-muted)]">
                      {meeting.coverImageUrl ? (
                        <img
                          alt=""
                          className="block aspect-[16/10] w-full object-cover"
                          decoding="async"
                          loading="lazy"
                          src={meeting.coverImageUrl}
                        />
                      ) : (
                        <div
                          aria-label={t('fanEvents.card.noImageAria')}
                          className="grid aspect-[16/10] w-full place-items-center"
                          role="img"
                        >
                          <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                            {t('fanEvents.card.noImage')}
                          </span>
                        </div>
                      )}
                      {showSeam ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-0 h-[3px]"
                          style={{
                            background:
                              'linear-gradient(90deg, rgba(232,97,92,0) 0%, rgba(217,66,63,0.95) 50%, rgba(232,97,92,0) 100%)',
                          }}
                        />
                      ) : null}
                    </figure>
                    <div className="mt-3.5 flex items-baseline justify-between gap-3">
                      <p className={`text-[13px] font-extrabold ${statusColor}`}>{statusLabel}</p>
                      {dday !== undefined ? (
                        <p
                          className={`whitespace-nowrap text-[13px] font-extrabold ${ddayUrgent ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]'}`}
                        >
                          {t('fanEvents.card.dday', { days: dday })}
                        </p>
                      ) : null}
                    </div>
                    <h2 className="mt-[7px] text-[19px] font-extrabold tracking-[-0.03em]">
                      {meeting.title}
                    </h2>
                    <p className="mt-1.5 text-[15px] font-medium text-[var(--color-text-muted)]">
                      {t('fanEvents.card.influencer', { name: meeting.influencerName })}
                    </p>
                    <p className="mt-3 border-t border-[var(--color-divider)] pt-3 text-base font-extrabold tabular-nums">
                      {formatDateTime(meeting.scheduledStartAt)}
                    </p>
                    {isUpcoming && meeting.applicationStartAt ? (
                      <p className="mt-[5px] text-sm font-medium tabular-nums text-[var(--color-text-muted)]">
                        {t('fanEvents.card.applyStart', {
                          date: formatMonthDay(meeting.applicationStartAt),
                        })}
                      </p>
                    ) : meeting.applicationEndAt ? (
                      <p className="mt-[5px] text-sm font-medium tabular-nums text-[var(--color-text-muted)]">
                        {t('fanEvents.card.applyEnd', {
                          date: formatMonthDay(meeting.applicationEndAt),
                        })}
                      </p>
                    ) : null}
                  </Link>
                </article>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
