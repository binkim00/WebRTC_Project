import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Clock,
  ListChecks,
  NotePencil,
  VideoCamera,
} from '@phosphor-icons/react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Avatar,
  Badge,
  Button,
  Card,
  LinearProgress,
} from '../../components'

/* TODO: API 연동 후 아래 mock 데이터를 서버 응답 데이터로 교체 */
const meeting = {
  id: '1',
  title: 'MELLY DAY 팬미팅',
  date: '2026년 7월 26일',
  startTime: '오늘 19:00 시작',
  completedSessionCount: 7,
  totalSessionCount: 20,
  currentFan: {
    name: '김유진',
    participationCount: 2,
    hasMemo: true,
  },
  currentOrder: 8,
}

export function InfluencerMyMeetingPage() {
  const navigate = useNavigate()
  const progress = Math.round(
    (meeting.completedSessionCount / meeting.totalSessionCount) * 100,
  )

  return (
    <div className="grid gap-12 pb-8">
      <header className="grid gap-3">
        <h1 className="text-4xl font-black leading-tight tracking-[-0.04em]">
          나의 팬미팅
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          오늘 진행할 팬미팅과 현재 순서를 확인하세요.
        </p>
      </header>

      <section aria-labelledby="today-meeting-title" className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            className="text-2xl font-extrabold tracking-[-0.025em]"
            id="today-meeting-title"
          >
            오늘의 팬미팅
          </h2>
          <time
            className="text-sm font-semibold text-[var(--color-text-tertiary)]"
            dateTime="2026-07-26"
          >
            {meeting.date}
          </time>
        </div>

        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.8fr)]">
            <div className="grid content-center gap-5 p-6 lg:border-r lg:border-[var(--color-divider)] lg:p-8">
              <Badge className="w-fit" variant="success">
                오늘 진행
              </Badge>
              <h3 className="text-3xl font-black tracking-[-0.04em]">
                {meeting.title}
              </h3>
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
                <CalendarBlank aria-hidden size={20} weight="bold" />
                {meeting.startTime}
              </p>
            </div>

            <div className="grid gap-8 border-t border-[var(--color-divider)] p-6 sm:grid-cols-[minmax(0,1fr)_180px] lg:border-t-0 lg:p-8">
              <div className="grid content-center gap-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                      완료 세션
                    </p>
                    <p className="mt-2 text-3xl font-black">
                      {meeting.completedSessionCount}
                      <span className="ml-1 text-base text-[var(--color-text-tertiary)]">
                        /{meeting.totalSessionCount}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                      진행률
                    </p>
                    <p className="mt-2 text-3xl font-black">{progress}%</p>
                  </div>
                </div>
                <LinearProgress
                  className="[&>div:first-child]:sr-only"
                  label="팬미팅 진행률"
                  showValue={false}
                  value={progress}
                />
              </div>

              <div className="flex items-center gap-3 border-t border-[var(--color-divider)] pt-6 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
                <Clock
                  aria-hidden
                  className="text-[var(--color-primary-coral)]"
                  size={28}
                  weight="bold"
                />
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                    현재 상태
                  </p>
                  <p className="mt-1 text-xl font-extrabold">진행 중</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid border-t border-[var(--color-divider)] lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="grid gap-5 p-6 lg:border-r lg:border-[var(--color-divider)]">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                    현재 팬
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {meeting.currentFan.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                    현재 순번
                  </p>
                  <p className="mt-2 text-xl font-black text-[var(--color-primary-coral)]">
                    {meeting.currentOrder}번째
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="flex flex-wrap items-center gap-6">
                  <Avatar
                    className="size-16 rounded-[var(--radius-panel)]"
                    name={meeting.currentFan.name}
                    size="lg"
                  />
                  <dl className="flex flex-wrap gap-8">
                    <div>
                      <dt className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                        참여 횟수
                      </dt>
                      <dd className="mt-1 text-lg font-extrabold">
                        {meeting.currentFan.participationCount}회
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                        최근 메모
                      </dt>
                      <dd className="mt-1 flex items-center gap-1.5 text-lg font-extrabold">
                        <NotePencil aria-hidden size={20} weight="bold" />
                        {meeting.currentFan.hasMemo ? '있음' : '없음'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <Button
                  className="w-fit"
                  leadingIcon={<ListChecks aria-hidden size={20} weight="bold" />}
                  onClick={() =>
                    navigate(`/influencer/fan-meetings/${meeting.id}/fans`)
                  }
                  trailingIcon={<ArrowRight aria-hidden size={18} weight="bold" />}
                  variant="secondary"
                >
                  팬 리스트 확인하기
                </Button>
              </div>
            </div>

            <div className="grid content-center gap-5 border-t border-[var(--color-divider)] bg-[var(--color-surface-page)] p-6 lg:border-t-0">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-success-soft)] text-[var(--color-success)]">
                  <CheckCircle aria-hidden size={23} weight="fill" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-tertiary)]">
                    장비 상태
                  </p>
                  <p className="mt-1 font-extrabold">점검 완료</p>
                </div>
              </div>
              <div className="border-t border-[var(--color-divider)] pt-5">
                <Button
                  className="w-full shadow-[var(--shadow-final-cta)]"
                  leadingIcon={<VideoCamera aria-hidden size={21} weight="bold" />}
                  onClick={() =>
                    navigate(`/influencer/fan-meetings/${meeting.id}/ready`)
                  }
                  size="lg"
                >
                  팬미팅 입장
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <Link
        className="flex w-full items-center justify-between gap-6 border-y border-[var(--color-divider)] px-2 py-5 text-left transition-colors hover:bg-[var(--color-surface-panel)] motion-reduce:transition-none"
        to="/influencer/mypage/fan-meetings"
      >
        <span>
          <span className="block font-extrabold">나의 팬미팅 이력</span>
          <span className="mt-1 block text-sm text-[var(--color-text-secondary)]">
            이전 팬미팅과 참여 기록을 확인하세요.
          </span>
        </span>
        <ArrowRight
          aria-hidden
          className="shrink-0 text-[var(--color-text-secondary)]"
          size={24}
          weight="bold"
        />
      </Link>
    </div>
  )
}
