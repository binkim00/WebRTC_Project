import { ArrowLeft, ArrowRight, CalendarBlank } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  getAllMyApplications,
  type ApplicationStatus,
  type MyApplicationSummaryResponse,
} from '../../api/applications'
import {
  fetchPublicFanMeetingDetail,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import {
  AlertBanner,
  Badge,
  Card,
  CardContent,
  Pagination,
  Spinner,
} from '../../components'

const PAGE_SIZE = 6

function isResultPublished(detail: PublicFanMeetingDetail | undefined): boolean {
  // 추첨 직후에는 응모 상태가 SELECTED/NOT_SELECTED로 바뀌지만,
  // 운영자가 결과를 공개하면 팬미팅 상태가 READY로 전환된다.
  return (
    detail?.meeting.status === 'READY' ||
    detail?.meeting.status === 'LIVE' ||
    detail?.meeting.status === 'ENDED'
  )
}

type StatusFilter = 'all' | ApplicationStatus

function isStatusFilter(value: string | null): value is StatusFilter {
  return value === 'all' || value === 'SUBMITTED' || value === 'SELECTED' || value === 'NOT_SELECTED' || value === 'WITHDRAWN'
}

const statusFilterItems: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'SUBMITTED', label: '발표 전' },
  { value: 'SELECTED', label: '당첨' },
  { value: 'NOT_SELECTED', label: '미당첨' },
  { value: 'WITHDRAWN', label: '응모 취소' },
]

const applicationStatusContent: Record<
  ApplicationStatus,
  { label: string; variant: 'success' | 'warning' | 'neutral' | 'primary' }
> = {
  SUBMITTED: { label: '발표 전', variant: 'warning' },
  SELECTED: { label: '당첨', variant: 'success' },
  NOT_SELECTED: { label: '미당첨', variant: 'neutral' },
  WITHDRAWN: { label: '응모 취소', variant: 'neutral' },
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FanApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedStatus = searchParams.get('status')
  const statusFilter: StatusFilter = isStatusFilter(requestedStatus)
    ? requestedStatus
    : 'all'
  const [page, setPage] = useState(0)
  const [applications, setApplications] = useState<MyApplicationSummaryResponse[]>()
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    const session = getAuthSession()

    if (!session || session.role !== 'FAN') {
      setError('팬 계정으로 로그인한 뒤 응모 내역을 확인해 주세요.')
      setApplications([])
      return () => controller.abort()
    }

    void getAllMyApplications({}, session.accessToken, controller.signal)
      .then(async (allApplications) => {
        const checkedApplications = await Promise.all(
          allApplications.map(async (application) => {
            if (
              application.applicationStatus !== 'SELECTED' &&
              application.applicationStatus !== 'NOT_SELECTED'
            ) {
              return { application, resultPublished: true }
            }

            try {
              const detail = await fetchPublicFanMeetingDetail(
                application.meetingId,
                session.accessToken,
                controller.signal,
              )
              return { application, resultPublished: isResultPublished(detail) }
            } catch (reason: unknown) {
              if (controller.signal.aborted) throw reason
              // 결과 공개 여부를 확인하지 못한 응모는 상태를 노출하지 않는다.
              return { application, resultPublished: false }
            }
          }),
        )
        const filteredApplications = checkedApplications
          .filter(({ application, resultPublished }) =>
            resultPublished &&
            (statusFilter === 'all' || application.applicationStatus === statusFilter),
          )
          .map(({ application }) => application)
        const nextTotalPages = Math.max(1, Math.ceil(filteredApplications.length / PAGE_SIZE))
        const nextPage = Math.min(page, nextTotalPages - 1)

        setApplications(filteredApplications.slice(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE))
        setTotalPages(nextTotalPages)
        setTotalElements(filteredApplications.length)
        if (nextPage !== page) setPage(nextPage)
        setError(undefined)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : '응모 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        )
      })

    return () => controller.abort()
  }, [statusFilter, page])

  const isLoading = applications === undefined && !error

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      <header>
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary-coral)]"
          to="/fan/mypage/profile"
        >
          <ArrowLeft aria-hidden size={18} weight="bold" />
          프로필로 돌아가기
        </Link>
        <h1 className="mt-5 text-4xl font-black tracking-[-0.045em]">마이페이지</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          내 정보와 참여 내역을 관리하세요.
        </p>
      </header>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-[-0.035em]">응모한 이벤트</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              응모한 이벤트와 결과를 확인하세요.
            </p>
          </div>
          <p className="text-sm font-bold text-[var(--color-text-secondary)]">
            총 {totalElements}개
          </p>
        </div>

        <div aria-label="응모 상태 필터" className="mt-6 flex flex-wrap gap-2" role="group">
          {statusFilterItems.map((item) => (
            <button
              aria-pressed={statusFilter === item.value}
              className={[
                'rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]',
                statusFilter === item.value
                  ? 'border-transparent bg-[var(--color-primary-coral)] text-white'
                  : 'border-[var(--color-border-control)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]',
              ].join(' ')}
              key={item.value}
              onClick={() => {
                setSearchParams(item.value === 'all' ? {} : { status: item.value })
                setPage(0)
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? (
          <AlertBanner className="mt-6" title="응모 내역을 확인할 수 없습니다" variant="error">
            {error}
          </AlertBanner>
        ) : null}

        {isLoading ? (
          <div className="flex justify-center py-24">
            <Spinner label="응모 내역을 불러오는 중" />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {(applications ?? []).map((application) => {
                const statusContent =
                  applicationStatusContent[application.applicationStatus]
                const resultDecided = application.resultDecidedAt !== null

                return (
                  <Card className="overflow-hidden" key={application.applicationId}>
                    <div className="relative">
                      {application.coverImageUrl ? (
                        <img
                          alt={`${application.meetingTitle} 썸네일`}
                          className="aspect-[16/5.5] w-full object-cover"
                          src={application.coverImageUrl}
                        />
                      ) : (
                        <div className="flex aspect-[16/5.5] w-full items-center justify-center bg-[var(--color-divider)] text-sm text-[var(--color-text-secondary)]">
                          이미지 준비 중
                        </div>
                      )}
                      <Badge
                        className="absolute right-4 top-4"
                        variant={statusContent.variant}
                      >
                        {statusContent.label}
                      </Badge>
                    </div>

                    <CardContent>
                      <p className="text-xs font-bold text-[var(--color-primary-coral)]">
                        응모 이벤트
                      </p>
                      <h3 className="mt-2 text-xl font-black tracking-[-0.025em]">
                        {application.meetingTitle}
                      </h3>
                      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                        인플루언서 {application.influencerName}
                      </p>

                      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-[var(--color-divider)] pt-5">
                        <div>
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-tertiary)]">
                            <CalendarBlank aria-hidden size={16} />
                            팬미팅 일정
                          </p>
                          <p className="mt-1 text-sm font-bold">
                            {formatDateTime(application.scheduledStartAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                            to={`/fan/events/${application.meetingId}`}
                          >
                            상세히 보기
                          </Link>
                          {resultDecided &&
                          statusFilter !== 'SELECTED' &&
                          statusFilter !== 'NOT_SELECTED' ? (
                            <Link
                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                              to={`/fan/events/${application.meetingId}/application-result`}
                            >
                              결과 확인
                              <ArrowRight aria-hidden size={18} weight="bold" />
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {(applications ?? []).length > 0 ? (
              <Pagination
                className="mt-8"
                currentPage={page + 1}
                onPageChange={(nextPage) => setPage(nextPage - 1)}
                totalPages={Math.max(1, totalPages)}
              />
            ) : !error ? (
              <div className="mt-6 rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-control)] px-6 py-16 text-center">
                <h3 className="font-bold">응모 내역이 없습니다</h3>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  이벤트 목록에서 마음에 드는 팬미팅에 응모해 보세요.
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
