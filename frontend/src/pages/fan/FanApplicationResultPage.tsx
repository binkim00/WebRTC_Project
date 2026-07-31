import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  ListNumbers,
  Wrench,
} from '@phosphor-icons/react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, CardContent } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

/*
 * TODO: API 연동 후 처리
 * 1. eventId로 응모 결과와 팬미팅 정보를 조회한다.
 * 2. 당첨·미당첨·결과 대기 상태별 화면을 분기한다.
 * 3. 로딩·오류 상태를 처리한다.
 */
const applicationResultMock = {
  eventTitle: 'Melly와의 봄날 팬미팅',
  influencerName: 'Melly',
  fanMeetingId: 1,
  resultStatus: 'WON',
  meetingAt: '2026.08.02 19:00',
  assignedOrder: 12,
} as const

export function FanApplicationResultPage() {
  const { eventId } = useParams()

  if (!eventId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 eventId 값이 없습니다. 응모한 이벤트 목록에서 다시 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent>
          <h1 className="text-2xl font-black tracking-[-0.035em]">
            {applicationResultMock.eventTitle}
          </h1>
          <p className="mt-2 text-sm font-semibold text-[var(--color-text-secondary)]">
            인플루언서 {applicationResultMock.influencerName}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <Badge className="w-fit" variant="success">
            당첨
          </Badge>

          <div className="mx-auto mt-8 grid max-w-4xl gap-8">
            <header className="grid justify-items-center gap-4 text-center">
              <CheckCircle
                aria-hidden
                className="text-[var(--color-success)]"
                size={52}
                weight="fill"
              />
              <div>
                <h2 className="text-3xl font-black tracking-[-0.04em]">축하합니다!</h2>
                <p className="mt-3 text-sm font-semibold text-[var(--color-text-secondary)]">
                  팬미팅에 당첨되었습니다.
                </p>
              </div>
            </header>

            <dl className="grid border-y border-[var(--color-divider)] py-6 sm:grid-cols-2">
              <div className="flex items-center gap-4 px-4 py-3 sm:border-r sm:border-[var(--color-divider)]">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
                  <CalendarBlank aria-hidden size={26} weight="duotone" />
                </span>
                <div>
                  <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                    팬미팅 일정
                  </dt>
                  <dd className="mt-1 text-xl font-black">
                    {applicationResultMock.meetingAt}
                  </dd>
                </div>
              </div>

              <div className="flex items-center gap-4 px-4 py-3">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
                  <ListNumbers aria-hidden size={26} weight="duotone" />
                </span>
                <div>
                  <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                    내 순번
                  </dt>
                  <dd className="mt-1 text-xl font-black">
                    {applicationResultMock.assignedOrder}번째
                  </dd>
                </div>
              </div>
            </dl>

            <div className="flex items-start gap-4 rounded-[var(--radius-panel)] bg-[var(--color-surface-page)] p-5">
              <Wrench
                aria-hidden
                className="mt-0.5 shrink-0 text-[var(--color-primary-coral)]"
                size={24}
                weight="bold"
              />
              <div>
                <h3 className="font-bold">입장 준비 안내</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                  팬미팅 시작 10분 전까지 장비 점검을 완료하고 대기 화면에 입장해
                  주세요.
                </p>
              </div>
            </div>

            <Link
              className="inline-flex min-h-[var(--control-height-final-cta)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-6 py-2.5 text-base font-semibold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)] active:bg-[var(--color-primary-coral-active)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
              to={`/fan-meetings/${applicationResultMock.fanMeetingId}/device-check`}
            >
              장비 점검하기
              <ArrowRight aria-hidden size={20} weight="bold" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
