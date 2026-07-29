import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarBlankIcon,
  UserIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import heroJellies from '../../assets/main-hero-jellies.webp'
import eventSeoun from '../../assets/main-event-seoun.webp'
import { IconButton } from '../../components'
import { ScreenPage } from '../../components/routing/ScreenPage'

const featuredMeetings = [
  {
    id: 'seoun-summer-story',
    eyebrow: '지금 만날 수 있어요',
    title: '서윤과 나누는 여름 이야기',
    influencer: '서윤',
    schedule: '2026.08.15 (토) 19:00',
    status: '모집 중',
    image: eventSeoun,
  },
  {
    id: 'seoun-secret-garden',
    eyebrow: '이번 주에 만나요',
    title: '서윤의 비밀 정원 팬미팅',
    influencer: '서윤',
    schedule: '2026.08.22 (토) 18:00',
    status: '신청 가능',
    image: eventSeoun,
  },
  {
    id: 'seoun-autumn-letter',
    eyebrow: '새로운 만남을 준비 중이에요',
    title: '우리에게 보내는 가을 편지',
    influencer: '서윤',
    schedule: '2026.09.05 (토) 20:00',
    status: '오픈 예정',
    image: eventSeoun,
  },
] as const

export function HomePage() {
  const [activeMeetingIndex, setActiveMeetingIndex] = useState(0)
  const activeMeeting = featuredMeetings[activeMeetingIndex]

  function moveMeeting(offset: number) {
    setActiveMeetingIndex(
      (currentIndex) =>
        (currentIndex + offset + featuredMeetings.length) % featuredMeetings.length,
    )
  }

  return (
    <div className="grid gap-14">
      <section className="grid min-h-[440px] items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <div className="px-2 lg:pl-3">
          <p className="text-sm font-black tracking-[0.16em] text-[var(--color-text-secondary)]">
            MEETING × JELLY × MEMORY
          </p>
          <h1 className="mt-7 max-w-[580px] text-[46px] font-black leading-[1.18] tracking-[-0.055em] text-[var(--color-text-primary)] sm:text-[58px] lg:text-[60px]">
            기다림은 설렘으로,
            <br />
            만남은 기억으로.
          </h1>
          <p className="mt-7 text-lg text-[var(--color-text-secondary)]">
            좋아하는 인플루언서와 단둘이 만나는 1:1 영상 팬미팅.
          </p>
        </div>
        <div className="relative flex min-h-[330px] items-center justify-center overflow-hidden lg:min-h-[440px]">
          <img
            alt="서로 기대어 웃고 있는 코랄색과 보라색 젤리 캐릭터"
            className="h-full max-h-[510px] w-full object-cover object-center mix-blend-multiply"
            src={heroJellies}
          />
        </div>
      </section>

      <section
        aria-labelledby="featured-meeting-title"
        className="relative grid items-center gap-8 pb-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12"
      >
        <IconButton
          aria-label="이전 팬미팅"
          className="absolute left-0 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_10px_30px_rgb(35_38_47_/_12%)] lg:inline-flex"
          icon={<ArrowLeftIcon aria-hidden="true" size={22} weight="bold" />}
          onClick={() => moveMeeting(-1)}
          size="lg"
          variant="secondary"
        />

        <div className="lg:pl-3">
          <p className="text-sm font-bold text-[var(--color-text-primary)]">{activeMeeting.eyebrow}</p>
          <h2
            className="mt-7 text-2xl font-black tracking-[-0.035em] sm:text-3xl"
            id="featured-meeting-title"
          >
            {activeMeeting.title}
          </h2>
          <dl className="mt-8 grid gap-4 text-[15px] text-[var(--color-text-secondary)]">
            <div className="flex items-center gap-3">
              <UserIcon aria-hidden="true" size={21} />
              <dt className="sr-only">인플루언서</dt>
              <dd>{activeMeeting.influencer}</dd>
            </div>
            <div className="flex items-center gap-3">
              <CalendarBlankIcon aria-hidden="true" size={21} />
              <dt className="sr-only">일정</dt>
              <dd>{activeMeeting.schedule}</dd>
            </div>
            <div className="flex items-center gap-3 font-bold text-[var(--color-primary-coral)]">
              <UsersThreeIcon aria-hidden="true" size={21} weight="fill" />
              <dt className="sr-only">모집 상태</dt>
              <dd>{activeMeeting.status}</dd>
            </div>
          </dl>
          <Link
            className="mt-8 inline-flex min-h-[var(--control-height)] items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] border border-transparent bg-[var(--color-primary-coral)] px-[var(--control-padding-inline)] py-2 text-sm font-semibold text-white shadow-[var(--shadow-control)] transition-colors hover:bg-[var(--color-primary-coral-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-coral)]"
            to={`/fan/events/${activeMeeting.id}`}
          >
            상세 보기
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-[var(--radius-panel)]">
          <img
            alt={`${activeMeeting.influencer} 팬미팅 소개`}
            className="aspect-[16/5] w-full object-cover"
            src={activeMeeting.image}
          />
          <IconButton
            aria-label="다음 팬미팅"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/95 shadow-[0_10px_30px_rgb(35_38_47_/_14%)] lg:-right-0"
            icon={<ArrowRightIcon aria-hidden="true" size={22} weight="bold" />}
            onClick={() => moveMeeting(1)}
            size="lg"
            variant="secondary"
          />
        </div>

        <div
          aria-label={`${featuredMeetings.length}개 중 ${activeMeetingIndex + 1}번째 팬미팅`}
          className="flex justify-center gap-3 lg:col-start-2"
        >
          {featuredMeetings.map((meeting, index) => (
            <button
              aria-label={`${index + 1}번째 팬미팅 보기`}
              className={[
                'size-3 rounded-full transition',
                index === activeMeetingIndex
                  ? 'bg-[var(--color-primary-coral)]'
                  : 'bg-[var(--color-border-control)] hover:bg-[var(--color-text-tertiary)]',
              ].join(' ')}
              key={meeting.id}
              onClick={() => setActiveMeetingIndex(index)}
              type="button"
            />
          ))}
        </div>
      </section>
    </div>
  )
}

export function MeetingFanListPage() {
  return (
    <ScreenPage
      description="특정 팬미팅에 참여하는 팬 목록을 확인하는 공통 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="CM-FN-ID-001"
      title="팬 리스트 화면"
    />
  )
}

export function MeetingStatisticsPage() {
  return (
    <ScreenPage
      description="특정 팬미팅의 통계를 확인하는 공통 화면입니다."
      requiredParams={['fanMeetingId']}
      screenId="CM-ID-MG-001"
      title="팬미팅 통계 화면"
    />
  )
}
