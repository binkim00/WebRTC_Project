import {
  ArrowRight,
  CalendarBlank,
  Gear,
  MagnifyingGlass,
  Plus,
  UsersThree,
  VideoCamera,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  type ManagerMeetingPage,
  type ManagerMeetingSummary,
} from '../../api/managerMeetings'
import { AlertBanner, Button, Card, EmptyState, Pagination, Spinner } from '../../components'

const previewMeetings: ManagerMeetingSummary[] = [
  { meetingId: 'meeting-1', title: 'MELLY DAY 팬미팅', influencerName: 'Melly', scheduledStartAt: '2026-07-28T20:00:00', status: 'SCHEDULED' },
  { meetingId: 'meeting-2', title: '서윤의 여름밤 팬미팅', influencerName: '서윤', scheduledStartAt: '2026-08-15T20:00:00', status: 'SCHEDULED' },
  { meetingId: 'meeting-3', title: 'Weekend Fan Talk', influencerName: 'Sora', scheduledStartAt: '2026-08-22T19:30:00', status: 'SCHEDULED' },
  { meetingId: 'meeting-4', title: 'Hello Again 팬미팅', influencerName: 'Min', scheduledStartAt: '2026-09-05T18:00:00', status: 'SCHEDULED' },
  { meetingId: 'meeting-5', title: '첫 만남 온라인 팬사인회', influencerName: 'Hana', scheduledStartAt: '2026-09-19T20:00:00', status: 'SCHEDULED' },
]

const emptyPage: ManagerMeetingPage = {
  content: [],
  page: 0,
  size: 5,
  totalElements: 0,
  totalPages: 1,
  hasNext: false,
}

function formatMeetingDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}.${month}.${day} ${hour}:${minute}`
}

export function ManagerMeetingListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [meetingPage, setMeetingPage] = useState<ManagerMeetingPage>(emptyPage)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!isPreview) {
      setLoading(false)
      return
    }

    const normalizedKeyword = keyword.trim().toLocaleLowerCase()
    const filteredMeetings = normalizedKeyword
      ? previewMeetings.filter((meeting) =>
          `${meeting.title} ${meeting.influencerName}`
            .toLocaleLowerCase()
            .includes(normalizedKeyword),
        )
      : previewMeetings
    setMeetingPage({
      content: filteredMeetings,
      page: 0,
      size: 5,
      totalElements: filteredMeetings.length,
      totalPages: normalizedKeyword ? 1 : 2,
      hasNext: !normalizedKeyword && page < 2,
    })
    setError(undefined)
    setLoading(false)
  }, [isPreview, keyword, page])

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setKeyword(keywordInput)
  }

  if (!isPreview) {
    return (
      <div className="grid min-w-0 gap-7 pb-10">
        <header>
          <h1 className="text-4xl font-black tracking-[-0.05em]">팬미팅 관리</h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">팬미팅을 새로 등록하거나 운영 화면으로 이동하세요.</p>
        </header>
        <AlertBanner title="팬미팅 목록 API가 아직 구현되지 않았습니다" variant="warning">
          첨부된 API 구현 현황 기준으로 <code>GET /api/v1/fan-meetings</code>를 사용할 수 없습니다.
          현재 등록 API는 홍보·응모 이벤트 생성에 사용하므로 이벤트 생성 화면에서 먼저 응모를 진행해 주세요.
        </AlertBanner>
        <div>
          <Button leadingIcon={<Plus size={20} weight="bold" />} onClick={() => navigate('/manager/events/new')}>
            새 이벤트 등록
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-7 pb-10">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.05em]">팬미팅 관리</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          생성된 1:1 영상통화 팬미팅의 일정과 참가자 정보를 확인하세요.
        </p>
      </header>

      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-col gap-5 border-b border-[var(--color-divider)] p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <form className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-2xl sm:flex-row sm:items-end" onSubmit={handleSearch} role="search">
            <label className="grid min-w-0 flex-1 gap-2 text-sm font-bold">
              <span>팬미팅명 검색</span>
              <span className="flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-white px-4 focus-within:border-[var(--color-focus-indigo)]">
                <MagnifyingGlass aria-hidden="true" className="shrink-0 text-[var(--color-text-tertiary)]" size={21} />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-tertiary)]"
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder="팬미팅명을 입력하세요"
                  type="search"
                  value={keywordInput}
                />
              </span>
            </label>
            <Button className="min-h-12 px-8" type="submit" variant="secondary">
              검색
            </Button>
          </form>
          <Button
            className="min-h-12 self-start px-6 lg:self-auto"
            leadingIcon={<Plus size={20} weight="bold" />}
            onClick={() => navigate('/manager/events/new')}
          >
            새 이벤트
          </Button>
        </div>

        {error ? (
          <div className="p-5 sm:p-7">
            <AlertBanner title="팬미팅 목록을 표시할 수 없습니다" variant="error">
              {error}
            </AlertBanner>
          </div>
        ) : loading ? (
          <div className="flex min-h-80 items-center justify-center">
            <Spinner label="팬미팅 목록을 불러오는 중" />
          </div>
        ) : meetingPage.content.length === 0 ? (
          <EmptyState
            action={<Button onClick={() => navigate('/manager/events/new')}>새 이벤트 만들기</Button>}
            description="검색 조건에 맞는 팬미팅이 없습니다."
            title="팬미팅을 찾을 수 없습니다"
          />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(260px,1.35fr)_minmax(140px,.7fr)_minmax(190px,.9fr)_minmax(175px,.8fr)_minmax(120px,.55fr)] gap-4 border-b border-[var(--color-divider)] bg-[var(--color-surface-page)] px-7 py-4 text-xs font-bold text-[var(--color-text-secondary)] lg:grid">
              <span>팬미팅명</span>
              <span>인플루언서명</span>
              <span>일정</span>
              <span>팬 정보</span>
              <span>관리</span>
            </div>
            <div className="divide-y divide-[var(--color-divider)]">
              {meetingPage.content.map((meeting) => (
                <MeetingRow key={meeting.meetingId} meeting={meeting} />
              ))}
            </div>
            <div className="border-t border-[var(--color-divider)] p-5">
              <Pagination
                currentPage={page}
                onPageChange={setPage}
                totalPages={meetingPage.totalPages}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function MeetingRow({ meeting }: { meeting: ManagerMeetingSummary }) {
  return (
    <article className="grid gap-5 px-5 py-5 transition-colors hover:bg-[var(--color-surface-page)] sm:px-7 lg:grid-cols-[minmax(260px,1.35fr)_minmax(140px,.7fr)_minmax(190px,.9fr)_minmax(175px,.8fr)_minmax(120px,.55fr)] lg:items-center lg:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
          <VideoCamera aria-hidden="true" size={21} weight="fill" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-extrabold">{meeting.title}</h2>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">1:1 영상통화 팬미팅</p>
        </div>
      </div>
      <div>
        <p className="text-xs text-[var(--color-text-tertiary)] lg:hidden">인플루언서</p>
        <p className="mt-1 font-bold lg:mt-0">{meeting.influencerName}</p>
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
        <CalendarBlank aria-hidden="true" size={19} />
        <time dateTime={meeting.scheduledStartAt}>
          {formatMeetingDate(meeting.scheduledStartAt)}
        </time>
      </div>
      <Link
        className="inline-flex min-h-10 items-center gap-2 font-bold hover:text-[var(--color-primary-coral)]"
        to={`/manager/fan-meetings/${encodeURIComponent(meeting.meetingId)}/fans`}
      >
        <UsersThree aria-hidden="true" size={20} weight="bold" />
        확정 팬리스트
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
      <Link
        className="inline-flex min-h-10 items-center gap-2 font-bold hover:text-[var(--color-primary-coral)]"
        to={`/manager/fan-meetings/${encodeURIComponent(meeting.meetingId)}/edit`}
      >
        <Gear aria-hidden="true" size={20} weight="bold" />
        설정
        <ArrowRight aria-hidden="true" size={17} />
      </Link>
    </article>
  )
}
