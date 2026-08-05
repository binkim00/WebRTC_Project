import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import moldEmptyImage from '../../assets/jelly-mold-empty.png'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  fetchPublicFanMeetings,
  type PublicFanMeetingStatus,
  type PublicFanMeetingSummary,
} from '../../api/fanMeetings'
import { AlertBanner, Select, Spinner, TextField } from '../../components'
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

const statusFilterOptions = [
  { label: '전체', value: 'ALL' },
  { label: '모집 예정', value: 'PUBLISHED' },
  { label: '모집 중', value: 'APPLICATION_OPEN' },
  { label: '결과 발표', value: 'READY' },
] as const

/**
 * dc.html의 날짜 필터는 "8월 1주차"처럼 특정 달에 고정된 데모용 값이라 그대로 쓸 수 없다.
 * 팬미팅은 며칠에서 몇 주 앞 일정이 대부분이라, 오늘 기준 상대 기간을
 * 일(오늘) · 주(이번 주/다음 주) · 월(이번 달/다음 달) 세 단위로 제공한다.
 */
const dateFilterOptions = [
  { label: '전체 날짜', value: 'ALL' },
  { label: '오늘', value: 'TODAY' },
  { label: '이번 주', value: 'THIS_WEEK' },
  { label: '다음 주', value: 'NEXT_WEEK' },
  { label: '이번 달', value: 'THIS_MONTH' },
  { label: '다음 달', value: 'NEXT_MONTH' },
] as const

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
  const date = new Date(value)
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
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}.${day}`
}

function daysUntil(value: string): number {
  const target = startOfDay(new Date(value))
  const today = startOfDay(new Date())
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

type AppliedFilters = {
  keyword: string
  status: string
  date: string
  influencerName: string
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
  const [meetings, setMeetings] = useState<PublicFanMeetingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [filters, setFilters] = useState<AppliedFilters>(initialFilters)

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
        setError(errorMessage(reason, '팬미팅 목록을 불러오지 못했습니다.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
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
      const scheduled = new Date(meeting.scheduledStartAt)
      return scheduled >= dateBounds.start && scheduled < dateBounds.end
    })
    .sort((left, right) => {
      // 응모 마감이 가까운 순서로 보여준다. 응모 기간이 없는 항목은 뒤로 보낸다.
      if (!left.applicationEndAt && !right.applicationEndAt) return 0
      if (!left.applicationEndAt) return 1
      if (!right.applicationEndAt) return -1
      return new Date(left.applicationEndAt).getTime() - new Date(right.applicationEndAt).getTime()
    })

  const soonestOpenMeetingId = visibleMeetings.find(
    (meeting) => meeting.status === 'APPLICATION_OPEN' && meeting.applicationEndAt,
  )?.meetingId

  return (
    <div>
      <h1 className="text-[30px] font-black tracking-[-0.04em]">열려 있는 이벤트</h1>
      <p className="mt-[9px] text-[17px] font-medium text-[var(--color-text-body)]">
        응모 마감이 가까운 순서로 보여드려요.
      </p>

      <form
        className="mt-[22px] grid grid-cols-1 items-end gap-3 border-b border-[var(--color-divider)] pb-[22px] sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]"
        onSubmit={handleSearch}
        role="search"
      >
        <TextField
          containerClassName="sm:col-span-2 lg:col-span-1"
          defaultValue={filters.keyword}
          label="검색"
          name="keyword"
          placeholder="이벤트명 또는 인플루언서명"
          type="search"
        />
        <Select
          defaultValue={filters.status}
          label="모집 상태"
          name="status"
          options={statusFilterOptions}
        />
        <Select
          defaultValue={filters.date}
          label="날짜"
          name="date"
          options={dateFilterOptions}
        />
        <TextField
          defaultValue={filters.influencerName}
          label="인플루언서"
          name="influencerName"
          placeholder="인플루언서명"
          type="search"
        />
        <button
          className="mj-font-emphasis min-h-[46px] whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-[22px] text-[15px] text-white hover:bg-[var(--color-primary-coral-hover)]"
          type="submit"
        >
          검색
        </button>
      </form>

      {error ? (
        <AlertBanner className="mt-6" title="팬미팅 목록을 표시할 수 없습니다" variant="error">
          {error}
        </AlertBanner>
      ) : loading ? (
        <div className="flex min-h-80 items-center justify-center">
          <Spinner label="팬미팅 목록을 불러오는 중" />
        </div>
      ) : visibleMeetings.length === 0 ? (
        <div aria-live="polite" className="grid place-items-center px-6 py-[76px] text-center">
          <img alt="" className="size-24 object-contain opacity-60" src={moldEmptyImage} />
          <strong className="mt-4 text-[19px] font-extrabold tracking-[-0.03em]">
            조건에 맞는 팬미팅이 없어요
          </strong>
          <span className="mt-2 text-base font-medium text-[var(--color-text-muted)]">
            검색 조건을 바꾸면 다른 팬미팅을 볼 수 있어요.
          </span>
        </div>
      ) : (
        <>
          <p className="mt-[22px] text-[15px] font-extrabold tabular-nums">
            {visibleMeetings.length}개
          </p>

          <div className="mt-3.5 grid grid-cols-1 gap-x-[26px] gap-y-[30px] sm:grid-cols-2 lg:grid-cols-3">
            {visibleMeetings.map((meeting) => {
              const statusLabel = fanMeetingStatusContent[meeting.status].label
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
                  <Link className="block text-inherit no-underline" to={`/fan/events/${meeting.meetingId}`}>
                    <figure className="relative m-0 overflow-hidden rounded-[10px] bg-[var(--color-surface-muted)]">
                      {meeting.coverImageUrl ? (
                        <img
                          alt=""
                          className="block aspect-[16/10] w-full object-cover"
                          src={meeting.coverImageUrl}
                        />
                      ) : (
                        <div
                          aria-label="대표 이미지가 등록되지 않은 이벤트"
                          className="grid aspect-[16/10] w-full place-items-center"
                          role="img"
                        >
                          <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                            이미지 없음
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
                          마감 D-{dday}
                        </p>
                      ) : null}
                    </div>
                    <h2 className="mt-[7px] text-[19px] font-extrabold tracking-[-0.03em]">
                      {meeting.title}
                    </h2>
                    <p className="mt-1.5 text-[15px] font-medium text-[var(--color-text-muted)]">
                      인플루언서 {meeting.influencerName}
                    </p>
                    <p className="mt-3 border-t border-[var(--color-divider)] pt-3 text-base font-extrabold tabular-nums">
                      {formatDateTime(meeting.scheduledStartAt)}
                    </p>
                    {isUpcoming && meeting.applicationStartAt ? (
                      <p className="mt-[5px] text-sm font-medium tabular-nums text-[var(--color-text-muted)]">
                        응모 시작 {formatMonthDay(meeting.applicationStartAt)}
                      </p>
                    ) : meeting.applicationEndAt ? (
                      <p className="mt-[5px] text-sm font-medium tabular-nums text-[var(--color-text-muted)]">
                        응모 마감 {formatMonthDay(meeting.applicationEndAt)}
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
