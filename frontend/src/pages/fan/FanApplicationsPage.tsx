import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Pagination,
  Select,
  TextField,
} from '../../components'
import localPreviewImage from '../../assets/call-preview-local.jpg'
import remotePreviewImage from '../../assets/call-preview-remote.jpg'

type ApplicationStatus = 'WON' | 'PENDING' | 'RECRUITING' | 'NOT_SELECTED'

type EventApplication = {
  applicationId: number
  eventId: number
  title: string
  influencerName: string
  thumbnailUrl: string
  meetingAt: string
  status: ApplicationStatus
}

/*
 * TODO: API 연동 후 처리
 * 1. 검색·필터·페이지 조건으로 응모 이벤트 목록을 조회한다.
 * 2. 로딩·오류·빈 목록 상태를 처리한다.
 * 3. API 페이지 정보로 총 개수와 페이지네이션을 교체한다.
 */
const eventApplicationsMock: EventApplication[] = [
  {
    applicationId: 1,
    eventId: 1,
    title: 'Melly와의 봄날 팬미팅',
    influencerName: 'Melly',
    thumbnailUrl: remotePreviewImage,
    meetingAt: '2026.08.02 19:00',
    status: 'WON',
  },
  {
    applicationId: 2,
    eventId: 2,
    title: '서윤의 여름밤 팬미팅',
    influencerName: '서윤',
    thumbnailUrl: localPreviewImage,
    meetingAt: '2026.08.15 20:00',
    status: 'PENDING',
  },
  {
    applicationId: 3,
    eventId: 3,
    title: '민과 다시 만나는 오후',
    influencerName: '민',
    thumbnailUrl: remotePreviewImage,
    meetingAt: '2026.08.17 17:00',
    status: 'RECRUITING',
  },
  {
    applicationId: 4,
    eventId: 4,
    title: '하나와 첫 온라인 팬사인회',
    influencerName: '하나',
    thumbnailUrl: localPreviewImage,
    meetingAt: '2026.07.24 19:30',
    status: 'NOT_SELECTED',
  },
]

const applicationStatusContent = {
  WON: { label: '당첨', variant: 'success' },
  PENDING: { label: '발표 전', variant: 'warning' },
  RECRUITING: { label: '모집 중', variant: 'primary' },
  NOT_SELECTED: { label: '비당첨', variant: 'neutral' },
} as const

const recruitmentStatusOptions = [
  { label: '전체 상태', value: 'all' },
  { label: '모집 중', value: 'recruiting' },
  { label: '발표 전', value: 'pending' },
  { label: '당첨', value: 'won' },
  { label: '비당첨', value: 'not-selected' },
]

const dateOptions = [
  { label: '전체 날짜', value: 'all' },
  { label: '이번 주', value: 'this-week' },
  { label: '이번 달', value: 'this-month' },
]

const influencerOptions = [
  { label: '전체', value: 'all' },
  { label: 'Melly', value: 'melly' },
  { label: '서윤', value: 'seoyun' },
  { label: '민', value: 'min' },
  { label: '하나', value: 'hana' },
]

const totalPagesMock = 2

export function FanApplicationsPage() {
  const [currentPage, setCurrentPage] = useState(1)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // TODO: 검색·필터 조건 반영 후 첫 페이지부터 조회
    setCurrentPage(1)
  }

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
            총 {eventApplicationsMock.length}개
          </p>
        </div>

        <Card className="mt-6">
          <CardContent>
            <form
              className="grid items-end gap-3 md:grid-cols-2 lg:grid-cols-[minmax(220px,2fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto]"
              onSubmit={handleSubmit}
            >
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
                placeholder="이벤트명 또는 인플루언서명"
                type="search"
              />
              <Select
                defaultValue="all"
                label="모집 상태"
                name="status"
                options={recruitmentStatusOptions}
              />
              <Select
                defaultValue="all"
                label="날짜"
                name="date"
                options={dateOptions}
              />
              <Select
                defaultValue="all"
                label="인플루언서"
                name="influencer"
                options={influencerOptions}
              />
              <Button
                leadingIcon={<MagnifyingGlass aria-hidden size={18} weight="bold" />}
                type="submit"
              >
                검색
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {eventApplicationsMock.map((application) => {
            const statusContent = applicationStatusContent[application.status]

            return (
              <Card className="overflow-hidden" key={application.applicationId}>
                <div className="relative">
                  <img
                    alt={`${application.title} 썸네일`}
                    className="aspect-[16/5.5] w-full object-cover"
                    src={application.thumbnailUrl}
                  />
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
                    {application.title}
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
                      <p className="mt-1 text-sm font-bold">{application.meetingAt}</p>
                    </div>
                    <Link
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                      to={`/fan/events/${application.eventId}`}
                    >
                      상세히 보기
                      <ArrowRight aria-hidden size={18} weight="bold" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Pagination
          className="mt-8"
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          totalPages={totalPagesMock}
        />
      </section>
    </div>
  )
}
