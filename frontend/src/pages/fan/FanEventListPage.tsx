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
import { getInfluencers, type InfluencerSummaryResponse } from '../../api/influencers'
import { AlertBanner, Select, Spinner, TextField } from '../../components'
import { fanMeetingStatusContent } from './fanMeetingStatus'

/**
 * 이 화면에 나열하는 팬미팅 범위다. 모집 전(PUBLISHED)·진행/종료(LIVE/ENDED)는 다른 화면의 몫이고,
 * 모집이 끝난(APPLICATION_CLOSED) 팬미팅은 더 이상 팬이 할 수 있는 행동이 없어 목록에서 뺀다.
 */
const discoverableStatuses = [
  'APPLICATION_OPEN',
  'READY',
] as const satisfies readonly PublicFanMeetingStatus[]

const statusFilterOptions = [
  { label: '전체', value: 'ALL' },
  { label: '모집 중', value: 'APPLICATION_OPEN' },
  { label: '결과 발표', value: 'READY' },
] as const

/**
 * dc.html의 날짜 필터는 "8월 1주차"처럼 특정 달에 고정된 데모용 값이라 그대로 쓸 수 없다.
 * 오늘 기준 상대 주차(이번 주/다음 주)로 바꿔 실제 일정에도 맞게 했다.
 */
const dateFilterOptions = [
  { label: '전체 날짜', value: 'ALL' },
  { label: '이번 주', value: 'THIS_WEEK' },
  { label: '다음 주', value: 'NEXT_WEEK' },
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
  influencerId: string
}

const initialFilters: AppliedFilters = {
  keyword: '',
  status: 'ALL',
  date: 'ALL',
  influencerId: 'ALL',
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof ApiError || reason instanceof TypeError
    ? reason.message
    : fallback
}

export function FanEventListPage() {
  const [influencers, setInfluencers] = useState<InfluencerSummaryResponse[]>([])
  const [meetings, setMeetings] = useState<PublicFanMeetingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [filters, setFilters] = useState<AppliedFilters>(initialFilters)

  useEffect(() => {
    const controller = new AbortController()
    void getInfluencers({ page: 0, size: 100 }, undefined, controller.signal)
      .then((result) => setInfluencers(result.content))
      .catch(() => {
        // 인플루언서 필터 목록을 못 받아도 팬미팅 목록 자체는 볼 수 있어야 한다.
      })
    return () => controller.abort()
  }, [])

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
      influencerId: String(formData.get('influencerId') ?? 'ALL'),
    })
  }

  const dateBounds = filters.date === 'ALL' ? undefined : weekRange(filters.date === 'NEXT_WEEK' ? 1 : 0)

  const visibleMeetings = meetings
    .filter((meeting) => discoverableStatuses.some((status) => status === meeting.status))
    .filter((meeting) => filters.status === 'ALL' || meeting.status === filters.status)
    .filter(
      (meeting) =>
        filters.influencerId === 'ALL' ||
        String(meeting.influencerName) ===
          influencers.find((influencer) => String(influencer.influencerId) === filters.influencerId)
            ?.influencerName,
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
        <Select
          defaultValue={filters.influencerId}
          label="인플루언서"
          name="influencerId"
          options={[
            { label: '전체', value: 'ALL' },
            ...influencers.map((influencer) => ({
              label: influencer.influencerName,
              value: String(influencer.influencerId),
            })),
          ]}
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
              const statusColor = isOpen
                ? 'text-[var(--color-primary-coral)]'
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
                    {meeting.applicationEndAt ? (
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
