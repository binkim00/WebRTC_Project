import {
  ArrowRight,
  CalendarBlank,
  ChartBar,
  MagnifyingGlass,
  UsersThree,
  VideoCamera,
} from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Pagination,
  Spinner,
  TextField,
} from '../../components'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  fetchMyMeetings,
  type ManagerMeetingSummary,
} from '../../api/managerMeetings'

const statusContent: Record<string, { label: string; variant: 'neutral' | 'primary' | 'success' | 'danger' }> = {
  DRAFT: { label: '작성 중', variant: 'neutral' },
  PUBLISHED: { label: '공개', variant: 'neutral' },
  APPLICATION_OPEN: { label: '신청 접수 중', variant: 'primary' },
  APPLICATION_CLOSED: { label: '신청 마감', variant: 'neutral' },
  READY: { label: '진행 준비', variant: 'primary' },
  LIVE: { label: '진행 중', variant: 'primary' },
  ENDED: { label: '종료', variant: 'success' },
  CANCELED: { label: '취소', variant: 'danger' },
}

const pageSize = 5

function formatScheduledAt(value: string) {
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

export function InfluencerMeetingHistoryPage() {
  const authToken = getAuthSession()?.accessToken

  const [keyword, setKeyword] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [meetings, setMeetings] = useState<ManagerMeetingSummary[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()

  useEffect(() => {
    if (!authToken) {
      setLoadError('로그인 정보가 없습니다. 로그인 후 다시 시도해 주세요.')
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setLoadError(undefined)

    void fetchMyMeetings(
      { keyword, status: 'ENDED', page: currentPage - 1, size: pageSize },
      authToken,
      controller.signal,
    )
      .then((result) => {
        setMeetings(result.content)
        setTotalPages(result.totalPages)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : '팬미팅 이력을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [authToken, currentPage, keyword])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setKeyword(String(formData.get('meeting-title') ?? '').trim())
    setCurrentPage(1)
  }

  function statusOf(meeting: ManagerMeetingSummary) {
    return statusContent[meeting.status ?? 'ENDED'] ?? statusContent.ENDED
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.045em]">나의 팬미팅 이력</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          생성하거나 진행한 1:1 영상통화 팬미팅을 확인하세요.
        </p>
      </header>

      {loadError ? (
        <AlertBanner title="팬미팅 이력을 불러오지 못했습니다" variant="error">
          {loadError}
        </AlertBanner>
      ) : null}

      <Card className="overflow-hidden">
        {/* 팬미팅명 키워드로 이력을 검색한다 */}
        <div className="border-b border-[var(--color-divider)] p-5 sm:p-6">
          <form
            className="flex w-full flex-col items-end gap-3 sm:flex-row lg:max-w-2xl"
            onSubmit={handleSearch}
            role="search"
          >
            <TextField
              containerClassName="w-full"
              endAdornment={
                <MagnifyingGlass
                  aria-hidden
                  className="mr-3 text-[var(--color-text-tertiary)]"
                  size={19}
                />
              }
              label="팬미팅 검색"
              name="meeting-title"
              placeholder="팬미팅명을 입력하세요"
              type="search"
            />
            <Button className="w-full sm:w-auto" type="submit" variant="secondary">
              검색
            </Button>
          </form>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <Spinner label="팬미팅 이력을 불러오는 중" />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[920px] w-full text-left text-sm">
                <caption className="sr-only">인플루언서 팬미팅 이력</caption>
                <thead className="bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
                  <tr>
                    <th className="px-6 py-4 font-bold" scope="col">
                      팬미팅
                    </th>
                    <th className="px-6 py-4 font-bold" scope="col">
                      일정
                    </th>
                    <th className="px-6 py-4 font-bold" scope="col">
                      상태
                    </th>
                    <th className="px-6 py-4 font-bold" scope="col">
                      팬 정보
                    </th>
                    <th className="px-6 py-4 font-bold" scope="col">
                      보고서
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-divider)]">
                  {meetings.map((meeting) => {
                    const status = statusOf(meeting)

                    return (
                      <tr
                        className="transition-colors hover:bg-[var(--color-surface-page)]"
                        key={meeting.meetingId}
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
                              <VideoCamera aria-hidden size={22} weight="fill" />
                            </span>
                            <span>
                              <strong className="block text-base">{meeting.title}</strong>
                              <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">
                                1:1 영상통화 팬미팅 · {meeting.influencerName}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-5">
                          <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-text-secondary)]">
                            <CalendarBlank aria-hidden size={19} weight="bold" />
                            {formatScheduledAt(meeting.scheduledStartAt)}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                        <td className="px-6 py-5">
                          <Link
                            className="inline-flex items-center gap-2 font-bold transition-colors hover:text-[var(--color-primary-coral)]"
                            to={`/fan-meetings/${meeting.meetingId}/fans`}
                          >
                            <UsersThree aria-hidden size={20} weight="bold" />
                            확정 팬리스트
                            <ArrowRight aria-hidden size={18} weight="bold" />
                          </Link>
                        </td>
                        <td className="px-6 py-5">
                          {(meeting.status ?? 'ENDED') === 'ENDED' ? (
                            <Link
                              className="inline-flex items-center gap-2 font-bold transition-colors hover:text-[var(--color-primary-coral)]"
                              to={`/fan-meetings/${meeting.meetingId}/statistics`}
                            >
                              <ChartBar aria-hidden size={20} weight="bold" />
                              통계 보고서
                              <ArrowRight aria-hidden size={18} weight="bold" />
                            </Link>
                          ) : (
                            <span className="text-[var(--color-text-tertiary)]">
                              종료 후 제공
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-[var(--color-divider)] md:hidden">
              {meetings.map((meeting) => {
                const status = statusOf(meeting)

                return (
                  <article className="grid gap-5 p-5" key={meeting.meetingId}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-extrabold">{meeting.title}</h2>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          1:1 영상통화 팬미팅 · {meeting.influencerName}
                        </p>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
                      <CalendarBlank aria-hidden size={18} weight="bold" />
                      {formatScheduledAt(meeting.scheduledStartAt)}
                    </p>
                    <div className="flex flex-wrap gap-4 border-t border-[var(--color-divider)] pt-4 text-sm">
                      <Link
                        className="inline-flex items-center gap-1.5 font-bold"
                        to={`/fan-meetings/${meeting.meetingId}/fans`}
                      >
                        <UsersThree aria-hidden size={18} weight="bold" />
                        확정 팬리스트
                      </Link>
                      {(meeting.status ?? 'ENDED') === 'ENDED' ? (
                        <Link
                          className="inline-flex items-center gap-1.5 font-bold"
                          to={`/fan-meetings/${meeting.meetingId}/statistics`}
                        >
                          <ChartBar aria-hidden size={18} weight="bold" />
                          통계 보고서
                        </Link>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>

            {meetings.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-[var(--color-text-secondary)]">
                {keyword
                  ? '검색 결과가 없습니다.'
                  : '종료된 팬미팅 이력이 없습니다.'}
              </div>
            ) : (
              <Pagination
                className="border-t border-[var(--color-divider)] px-6 py-5"
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                totalPages={totalPages}
              />
            )}
          </>
        )}
      </Card>
    </div>
  )
}
