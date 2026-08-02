import {
  ArrowRight,
  CalendarBlank,
  ChartBar,
  MagnifyingGlass,
  Plus,
  UsersThree,
  VideoCamera,
} from '@phosphor-icons/react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  Pagination,
  TextField,
} from '../../components'

type MeetingStatus = 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED'

type MeetingHistory = {
  id: number
  title: string
  scheduledAt: string
  status: MeetingStatus
}

/*
 * TODO: API 연동 후 처리
 * 1. 검색어와 페이지 조건으로 팬미팅 이력을 조회한다.
 * 2. 로딩·오류·빈 목록 상태를 처리한다.
 * 3. 팬미팅 생성 화면과 통계 보고서 제공 조건을 연결한다.
 */
const meetingHistoryMock: MeetingHistory[] = [
  {
    id: 1,
    title: 'MELLY DAY 겨울 팬미팅',
    scheduledAt: '2026.12.20 20:00',
    status: 'UPCOMING',
  },
  {
    id: 2,
    title: '여름밤 라이브 콜',
    scheduledAt: '2026.07.26 20:00',
    status: 'IN_PROGRESS',
  },
  {
    id: 3,
    title: 'Melly와의 봄날 팬미팅',
    scheduledAt: '2026.04.18 19:00',
    status: 'COMPLETED',
  },
  {
    id: 4,
    title: '새해 첫 목소리',
    scheduledAt: '2026.01.17 18:30',
    status: 'COMPLETED',
  },
  {
    id: 5,
    title: 'WINTER VOICE',
    scheduledAt: '2025.12.20 20:00',
    status: 'COMPLETED',
  },
  {
    id: 6,
    title: '가을밤 이야기',
    scheduledAt: '2025.10.11 19:30',
    status: 'COMPLETED',
  },
  {
    id: 7,
    title: 'MELLY SPECIAL CALL',
    scheduledAt: '2025.08.02 20:00',
    status: 'COMPLETED',
  },
]

const statusContent = {
  UPCOMING: { label: '시작 전', variant: 'neutral' },
  IN_PROGRESS: { label: '진행 중', variant: 'primary' },
  COMPLETED: { label: '종료', variant: 'success' },
} as const

const pageSize = 5

export function InfluencerMeetingHistoryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const filteredMeetings = useMemo(
    () =>
      meetingHistoryMock.filter((meeting) =>
        meeting.title.toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase()),
      ),
    [searchQuery],
  )

  const totalPages = Math.max(1, Math.ceil(filteredMeetings.length / pageSize))
  const visibleMeetings = filteredMeetings.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSearchQuery(String(formData.get('meeting-title') ?? '').trim())
    setCurrentPage(1)
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.045em]">나의 팬미팅 이력</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          생성하거나 진행한 1:1 영상통화 팬미팅을 확인하세요.
        </p>
      </header>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 border-b border-[var(--color-divider)] p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
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

          {/* TODO: 새 팬미팅 생성 화면 연결 */}
          <Button
            className="w-full lg:w-auto"
            leadingIcon={<Plus aria-hidden size={20} weight="bold" />}
          >
            새 팬미팅
          </Button>
        </div>

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
              {visibleMeetings.map((meeting) => {
                const status = statusContent[meeting.status]

                return (
                  <tr
                    className="transition-colors hover:bg-[var(--color-surface-page)]"
                    key={meeting.id}
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
                          <VideoCamera aria-hidden size={22} weight="fill" />
                        </span>
                        <span>
                          <strong className="block text-base">{meeting.title}</strong>
                          <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">
                            1:1 영상통화 팬미팅
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-5">
                      <span className="inline-flex items-center gap-2 font-semibold text-[var(--color-text-secondary)]">
                        <CalendarBlank aria-hidden size={19} weight="bold" />
                        {meeting.scheduledAt}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="px-6 py-5">
                      <Link
                        className="inline-flex items-center gap-2 font-bold transition-colors hover:text-[var(--color-primary-coral)]"
                        to={`/fan-meetings/${meeting.id}/fans`}
                      >
                        <UsersThree aria-hidden size={20} weight="bold" />
                        확정 팬리스트
                        <ArrowRight aria-hidden size={18} weight="bold" />
                      </Link>
                    </td>
                    <td className="px-6 py-5">
                      {meeting.status === 'COMPLETED' ? (
                        <Link
                          className="inline-flex items-center gap-2 font-bold transition-colors hover:text-[var(--color-primary-coral)]"
                          to={`/fan-meetings/${meeting.id}/statistics`}
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
          {visibleMeetings.map((meeting) => {
            const status = statusContent[meeting.status]

            return (
              <article className="grid gap-5 p-5" key={meeting.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-extrabold">{meeting.title}</h2>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      1:1 영상통화 팬미팅
                    </p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
                  <CalendarBlank aria-hidden size={18} weight="bold" />
                  {meeting.scheduledAt}
                </p>
                <div className="flex flex-wrap gap-4 border-t border-[var(--color-divider)] pt-4 text-sm">
                  <Link
                    className="inline-flex items-center gap-1.5 font-bold"
                    to={`/fan-meetings/${meeting.id}/fans`}
                  >
                    <UsersThree aria-hidden size={18} weight="bold" />
                    확정 팬리스트
                  </Link>
                  {meeting.status === 'COMPLETED' ? (
                    <Link
                      className="inline-flex items-center gap-1.5 font-bold"
                      to={`/fan-meetings/${meeting.id}/statistics`}
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

        {visibleMeetings.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-[var(--color-text-secondary)]">
            검색 결과가 없습니다.
          </div>
        ) : (
          <Pagination
            className="border-t border-[var(--color-divider)] px-6 py-5"
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            totalPages={totalPages}
          />
        )}
      </Card>
    </div>
  )
}
