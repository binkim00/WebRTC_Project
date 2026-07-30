import { ArrowRight, MagnifyingGlass } from '@phosphor-icons/react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, CardContent, Select, TextField } from '../../components'
import { fanEventsMock } from '../../mocks/fanEventsMock'

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

const recruitmentStatusContent = {
  RECRUITING: { label: '모집 중', variant: 'success' },
  ANNOUNCED: { label: '결과 발표', variant: 'warning' },
  CLOSED: { label: '마감', variant: 'neutral' },
} as const

type RecruitmentStatusFilter = 'all' | 'recruiting' | 'announced' | 'closed'
type DateFilter = 'all' | 'this-week' | 'this-month'

type EventFilters = {
  eventKeyword: string
  influencerKeyword: string
  status: RecruitmentStatusFilter
  date: DateFilter
}

const initialFilters: EventFilters = {
  eventKeyword: '',
  influencerKeyword: '',
  status: 'all',
  date: 'all',
}

const recruitmentStatusFilterMap = {
  recruiting: 'RECRUITING',
  announced: 'ANNOUNCED',
  closed: 'CLOSED',
} as const

function parseMeetingDate(meetingAt: string) {
  const [date, time] = meetingAt.split(' ')
  const [year, month, day] = date.split('.').map(Number)
  const [hour, minute] = time.split(':').map(Number)

  return new Date(year, month - 1, day, hour, minute)
}

function matchesDateFilter(meetingAt: string, dateFilter: DateFilter) {
  if (dateFilter === 'all') {
    return true
  }

  const now = new Date()
  const meetingDate = parseMeetingDate(meetingAt)

  if (dateFilter === 'this-month') {
    return (
      meetingDate.getFullYear() === now.getFullYear() &&
      meetingDate.getMonth() === now.getMonth()
    )
  }

  const startOfWeek = new Date(now)
  const daysSinceMonday = (now.getDay() + 6) % 7
  startOfWeek.setDate(now.getDate() - daysSinceMonday)
  startOfWeek.setHours(0, 0, 0, 0)

  const startOfNextWeek = new Date(startOfWeek)
  startOfNextWeek.setDate(startOfWeek.getDate() + 7)

  return meetingDate >= startOfWeek && meetingDate < startOfNextWeek
}

export function FanEventListPage() {
  const [filters, setFilters] = useState<EventFilters>(initialFilters)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    setFilters({
      eventKeyword: String(formData.get('eventKeyword') ?? '').trim(),
      influencerKeyword: String(formData.get('influencerKeyword') ?? '').trim(),
      status: String(formData.get('status') ?? 'all') as RecruitmentStatusFilter,
      date: String(formData.get('date') ?? 'all') as DateFilter,
    })
  }

  const normalizedEventKeyword = filters.eventKeyword.toLocaleLowerCase()
  const normalizedInfluencerKeyword = filters.influencerKeyword.toLocaleLowerCase()
  const filteredEvents = fanEventsMock.filter((event) => {
    const matchesEventKeyword = event.title
      .toLocaleLowerCase()
      .includes(normalizedEventKeyword)
    const matchesInfluencerKeyword = event.influencerName
      .toLocaleLowerCase()
      .includes(normalizedInfluencerKeyword)
    const matchesStatus =
      filters.status === 'all' ||
      event.recruitmentStatus === recruitmentStatusFilterMap[filters.status]

    return (
      matchesEventKeyword &&
      matchesInfluencerKeyword &&
      matchesStatus &&
      matchesDateFilter(event.meetingAt, filters.date)
    )
  })

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
                label="팬미팅 날짜"
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
          {filteredEvents.map((event) => (
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
        {filteredEvents.length > 0 ? (
          <p className="mt-8 border-t border-[var(--color-divider)] pt-8 text-center text-sm text-[var(--color-text-secondary)]">
            현재 확인할 수 있는 목록을 모두 불러왔어요.
          </p>
        ) : (
          <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-control)] px-6 py-16 text-center">
            <h2 className="font-bold">검색 결과가 없습니다</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              검색어 또는 필터 조건을 변경해 주세요.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
