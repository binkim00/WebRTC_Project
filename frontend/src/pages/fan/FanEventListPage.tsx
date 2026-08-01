import {
  ArrowRight,
  ImageSquare,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  fetchPublicFanMeetings,
  type FanMeetingApplicationStatus,
  type PublicFanMeetingSummary,
  type PublicFanMeetingStatus,
} from '../../api/fanMeetings'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Pagination,
  Select,
  Spinner,
  TextField,
} from '../../components'

const meetingStatusOptions = [
  { label: '전체', value: 'all' },
  { label: '모집 예정', value: 'PUBLISHED' },
  { label: '모집 중', value: 'APPLICATION_OPEN' },
  { label: '모집 마감', value: 'CLOSED' },
  { label: '결과 발표', value: 'READY' },
]

const meetingStatusContent = {
  PUBLISHED: { label: '모집 예정', variant: 'info' },
  APPLICATION_OPEN: { label: '모집 중', variant: 'success' },
  APPLICATION_CLOSED: { label: '모집 마감', variant: 'neutral' },
  READY: { label: '결과 발표', variant: 'warning' },
  LIVE: { label: '모집 마감', variant: 'neutral' },
  ENDED: { label: '모집 마감', variant: 'neutral' },
} as const

const applicationStatusContent: Record<
  FanMeetingApplicationStatus,
  { label: string; variant: 'primary' | 'neutral' | 'success' | 'danger' }
> = {
  SUBMITTED: { label: '응모 완료', variant: 'primary' },
  WITHDRAWN: { label: '응모 취소', variant: 'neutral' },
  SELECTED: { label: '당첨', variant: 'success' },
  NOT_SELECTED: { label: '미당첨', variant: 'danger' },
}

type EventFilters = {
  keyword: string
  status?: RecruitmentStatusFilter
}

const initialFilters: EventFilters = {
  keyword: '',
}

const promotionMeetingStatuses = [
  'PUBLISHED',
  'APPLICATION_OPEN',
  'APPLICATION_CLOSED',
  'READY',
  'LIVE',
  'ENDED',
] as const satisfies readonly PublicFanMeetingStatus[]

type RecruitmentStatusFilter =
  | 'PUBLISHED'
  | 'APPLICATION_OPEN'
  | 'CLOSED'
  | 'READY'

function matchesRecruitmentStatus(
  meetingStatus: PublicFanMeetingStatus,
  filter?: RecruitmentStatusFilter,
): boolean {
  if (!filter) return true
  if (filter === 'CLOSED') {
    return ['APPLICATION_CLOSED', 'LIVE', 'ENDED'].includes(meetingStatus)
  }
  return meetingStatus === filter
}

const meetingsPerPage = 6

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

function formatDate(value: string | null): string {
  if (!value) return '-'
  return formatDateTime(value).split(' ')[0]
}

export function FanEventListPage() {
  const [page, setPage] = useState(1)
  const [meetings, setMeetings] = useState<PublicFanMeetingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [filters, setFilters] = useState<EventFilters>(initialFilters)

  useEffect(() => {
    const controller = new AbortController()
    const authToken = getAuthSession()?.accessToken

    setLoading(true)
    setError(undefined)

    void fetchPublicFanMeetings(
      {
        keyword: filters.keyword,
        page: 0,
        size: 100,
      },
      authToken,
      controller.signal,
    )
      .then((meetingPage) => {
        const nextMeetings = meetingPage.content
          .filter(
            (meeting) =>
              promotionMeetingStatuses.includes(
                meeting.status,
              ) &&
              matchesRecruitmentStatus(meeting.status, filters.status),
          )
          .sort(
            (left, right) =>
              new Date(left.scheduledStartAt).getTime() -
              new Date(right.scheduledStartAt).getTime(),
          )
        setMeetings(nextMeetings)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError
            ? reason.message
            : '팬미팅 목록을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [filters])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const status = String(formData.get('status') ?? 'all')

    setFilters({
      keyword: String(formData.get('keyword') ?? '').trim(),
      status:
        status === 'all' ? undefined : (status as RecruitmentStatusFilter),
    })
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(meetings.length / meetingsPerPage))
  const firstMeetingIndex = (page - 1) * meetingsPerPage
  const paginatedMeetings = meetings.slice(
    firstMeetingIndex,
    firstMeetingIndex + meetingsPerPage,
  )

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside>
        <Card>
          <CardContent>
            <form className="grid gap-5" onSubmit={handleSubmit}>
              <TextField
                endAdornment={
                  <MagnifyingGlass
                    aria-hidden
                    className="mr-3 text-[var(--color-text-tertiary)]"
                    size={18}
                  />
                }
                label="검색"
                name="keyword"
                placeholder="팬미팅명 또는 인플루언서명"
                type="search"
              />

              <Select
                defaultValue="all"
                label="모집 상태"
                name="status"
                options={meetingStatusOptions}
              />

              <Button
                className="w-full"
                leadingIcon={<MagnifyingGlass aria-hidden size={18} weight="bold" />}
                type="submit"
              >
                검색
              </Button>
            </form>
          </CardContent>
        </Card>
      </aside>

      <section>
        {error ? (
          <AlertBanner title="팬미팅 목록을 표시할 수 없습니다" variant="error">
            {error}
          </AlertBanner>
        ) : loading ? (
          <div className="flex min-h-80 items-center justify-center">
            <Spinner label="팬미팅 목록을 불러오는 중" size="lg" />
          </div>
        ) : meetings.length === 0 ? (
          <EmptyState
            description="검색어 또는 상태 조건을 변경해 주세요."
            title="검색 결과가 없습니다"
          />
        ) : (
          <>
            <p className="mb-4 text-right text-sm font-bold text-[var(--color-text-secondary)]">
              총 {meetings.length}개
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              {paginatedMeetings.map((meeting) => {
                const statusContent = meetingStatusContent[meeting.status]
                const applicationContent = meeting.applicationStatus
                  ? applicationStatusContent[meeting.applicationStatus]
                  : null

                return (
                  <Card className="overflow-hidden" key={meeting.meetingId}>
                    {meeting.coverImageUrl ? (
                      <img
                        alt={`${meeting.title} 썸네일`}
                        className="aspect-[16/7] w-full object-cover"
                        src={meeting.coverImageUrl}
                      />
                    ) : (
                      <div className="flex aspect-[16/7] items-center justify-center bg-[var(--color-surface-page)] text-[var(--color-text-tertiary)]">
                        <ImageSquare aria-hidden size={40} weight="duotone" />
                        <span className="sr-only">등록된 썸네일이 없습니다</span>
                      </div>
                    )}
                    <CardContent>
                      <div className="flex items-start justify-between gap-4">
                        <h2 className="font-bold">{meeting.title}</h2>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                          {applicationContent ? (
                            <Badge variant={applicationContent.variant}>
                              {applicationContent.label}
                            </Badge>
                          ) : null}
                          <Badge variant={statusContent.variant}>
                            {statusContent.label}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                        인플루언서 {meeting.influencerName}
                      </p>

                      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--color-divider)] pt-4">
                        <div>
                          <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                            팬미팅 일정
                          </dt>
                          <dd className="mt-1 text-sm font-bold">
                            {formatDateTime(meeting.scheduledStartAt)}
                          </dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                            응모 마감일
                          </dt>
                          <dd className="mt-1 text-sm font-bold">
                            {formatDate(meeting.applicationEndAt)}
                          </dd>
                        </div>
                      </dl>

                      <Link
                        className="mt-5 inline-flex min-h-[var(--control-height)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-[var(--control-padding-inline)] py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                        to={`/fan/events/${meeting.meetingId}`}
                      >
                        상세히 보기
                        <ArrowRight aria-hidden size={18} weight="bold" />
                      </Link>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {totalPages > 1 ? (
              <Pagination
                className="mt-8 border-t border-[var(--color-divider)] pt-8"
                currentPage={page}
                onPageChange={setPage}
                totalPages={totalPages}
              />
            ) : (
              <p className="mt-8 border-t border-[var(--color-divider)] pt-8 text-center text-sm text-[var(--color-text-secondary)]">
                현재 확인할 수 있는 목록을 모두 불러왔어요.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
