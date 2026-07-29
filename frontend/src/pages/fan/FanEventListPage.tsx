import { ArrowRight, MagnifyingGlass } from '@phosphor-icons/react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, CardContent, Select, TextField } from '../../components'
import localPreviewImage from '../../assets/call-preview-local.jpg'
import remotePreviewImage from '../../assets/call-preview-remote.jpg'

const recruitmentStatusOptions = [
  { label: '전체', value: 'all' },
  { label: '모집 중', value: 'recruiting' },
  { label: '결과 발표', value: 'announced' },
  { label: '마감', value: 'closed' },
]

const dateOptions = [
  { label: '전체 날짜', value: 'all' },
  { label: '이번 주', value: 'this-week' },
  { label: '이번 달', value: 'this-month' },
]

type EventItem = {
  eventId: number
  title: string
  influencerName: string
  recruitmentStatus: 'RECRUITING' | 'ANNOUNCED' | 'CLOSED'
  thumbnailUrl: string
  meetingAt: string
  applicationDeadline: string
}

const eventListMock: EventItem[] = [
  {
    eventId: 1,
    title: 'Melly와의 봄날 팬미팅',
    influencerName: 'Melly',
    recruitmentStatus: 'RECRUITING',
    thumbnailUrl: remotePreviewImage,
    meetingAt: '2026.08.02 19:00',
    applicationDeadline: '2026.07.25',
  },
  {
    eventId: 2,
    title: '여름밤 라이브 콜',
    influencerName: 'Hana',
    recruitmentStatus: 'ANNOUNCED',
    thumbnailUrl: localPreviewImage,
    meetingAt: '2026.08.05 20:00',
    applicationDeadline: '2026.07.28',
  },
  {
    eventId: 3,
    title: '첫 만남 온라인 팬사인회',
    influencerName: 'Hana',
    recruitmentStatus: 'RECRUITING',
    thumbnailUrl: localPreviewImage,
    meetingAt: '2026.08.10 19:30',
    applicationDeadline: '2026.08.01',
  },
  {
    eventId: 4,
    title: 'Melly Special Call',
    influencerName: 'Melly',
    recruitmentStatus: 'CLOSED',
    thumbnailUrl: remotePreviewImage,
    meetingAt: '2026.08.12 16:00',
    applicationDeadline: '2026.08.03',
  },
  {
    eventId: 5,
    title: 'Weekend Fan Talk',
    influencerName: 'Sora',
    recruitmentStatus: 'ANNOUNCED',
    thumbnailUrl: localPreviewImage,
    meetingAt: '2026.08.15 21:00',
    applicationDeadline: '2026.08.05',
  },
  {
    eventId: 6,
    title: 'Hello Again 팬미팅',
    influencerName: 'Min',
    recruitmentStatus: 'CLOSED',
    thumbnailUrl: remotePreviewImage,
    meetingAt: '2026.08.17 20:00',
    applicationDeadline: '2026.08.08',
  },
]

const recruitmentStatusContent = {
  RECRUITING: { label: '모집 중', variant: 'success' },
  ANNOUNCED: { label: '결과 발표', variant: 'warning' },
  CLOSED: { label: '마감', variant: 'neutral' },
} as const

export function FanEventListPage() {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // TODO: 검색 및 필터 조건으로 이벤트 목록 조회
  }

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
                label="이벤트"
                name="eventKeyword"
                placeholder="이벤트명 입력"
                type="search"
              />

              <TextField
                endAdornment={
                  <MagnifyingGlass
                    aria-hidden
                    className="mr-3 text-[var(--color-text-tertiary)]"
                    size={18}
                  />
                }
                label="인플루언서"
                name="influencerKeyword"
                placeholder="인플루언서명 입력"
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
        <div className="grid gap-6 sm:grid-cols-2">
          {eventListMock.map((event) => (
            <Card className="overflow-hidden" key={event.eventId}>
              <img
                alt={`${event.title} 썸네일`}
                className="aspect-[16/7] w-full object-cover"
                src={event.thumbnailUrl}
              />
              <CardContent>
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-bold">{event.title}</h2>
                  <Badge variant={recruitmentStatusContent[event.recruitmentStatus].variant}>
                    {recruitmentStatusContent[event.recruitmentStatus].label}
                  </Badge>
                </div>
                <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                  인플루언서 {event.influencerName}
                </p>

                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--color-divider)] pt-4">
                  <div>
                    <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                      팬미팅 일정
                    </dt>
                    <dd className="mt-1 text-sm font-bold">{event.meetingAt}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                      응모 마감일
                    </dt>
                    <dd className="mt-1 text-sm font-bold">
                      {event.applicationDeadline}
                    </dd>
                  </div>
                </dl>

                <Link
                  className="mt-5 inline-flex min-h-[var(--control-height)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-[var(--control-padding-inline)] py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                  to={`/fan/events/${event.eventId}`}
                >
                  상세히 보기
                  <ArrowRight aria-hidden size={18} weight="bold" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-8 border-t border-[var(--color-divider)] pt-8 text-center text-sm text-[var(--color-text-secondary)]">
          현재 확인할 수 있는 목록을 모두 불러왔어요.
        </p>
      </section>
    </div>
  )
}
