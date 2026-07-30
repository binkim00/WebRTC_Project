import {
  CalendarBlank,
  CalendarDots,
  Clock,
  UsersThree,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge, Button, Card, CardContent, Checkbox } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { fanEventsMock } from '../../mocks/fanEventsMock'

const recruitmentStatusContent = {
  RECRUITING: { label: '모집 중', variant: 'success' },
  ANNOUNCED: { label: '결과 발표', variant: 'warning' },
  CLOSED: { label: '마감', variant: 'neutral' },
} as const

const agreementItems = [
  { id: 'privacy', label: '개인정보 수집·이용 동의' },
  { id: 'recording', label: '영상통화 녹화 동의' },
  { id: 'participation', label: '응모 규칙 및 참여 조건 동의' },
] as const

type AgreementId = (typeof agreementItems)[number]['id']

export function FanEventDetailPage() {
  const { eventId } = useParams()
  const event = fanEventsMock.find((item) => item.eventId === Number(eventId))
  const [agreements, setAgreements] = useState<Record<AgreementId, boolean>>({
    privacy: false,
    recording: false,
    participation: false,
  })
  const allAgreed = agreementItems.every((item) => agreements[item.id])

  function handleAgreementChange(id: AgreementId, checked: boolean) {
    setAgreements((current) => ({ ...current, [id]: checked }))
  }

  if (!eventId?.trim() || !event) {
    return (
      <InvalidRouteState
        message="해당 이벤트를 찾을 수 없습니다. 이벤트 목록에서 다시 선택해 주세요."
        title="이벤트 정보가 없습니다"
      />
    )
  }

  return (
    <div className="grid gap-10">
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <img
          alt={`${event.title} 대표 이미지`}
          className="aspect-[16/10] w-full rounded-[var(--radius-panel)] object-cover shadow-[var(--shadow-panel)]"
          src={event.thumbnailUrl}
        />

        <div className="grid content-start gap-8 py-5">
          <div className="grid gap-5">
            <Badge
              className="w-fit"
              variant={recruitmentStatusContent[event.recruitmentStatus].variant}
            >
              {recruitmentStatusContent[event.recruitmentStatus].label}
            </Badge>
            <div>
              <h1 className="text-3xl font-black tracking-[-0.04em]">
                {event.title}
              </h1>
              <p className="mt-3 text-sm font-semibold text-[var(--color-text-secondary)]">
                인플루언서 {event.influencerName}
              </p>
            </div>
          </div>

          <dl className="grid gap-6 border-t border-[var(--color-divider)] pt-8 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)]">
                <CalendarBlank aria-hidden size={22} weight="duotone" />
              </span>
              <div>
                <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  팬미팅 일정
                </dt>
                <dd className="mt-1 text-sm font-bold">{event.meetingAt}</dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)]">
                <Clock aria-hidden size={22} weight="duotone" />
              </span>
              <div>
                <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  통화 시간
                </dt>
                <dd className="mt-1 text-sm font-bold">{event.callDuration}</dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)]">
                <CalendarDots aria-hidden size={22} weight="duotone" />
              </span>
              <div>
                <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  응모 기간
                </dt>
                <dd className="mt-1 text-sm font-bold">
                  {event.applicationPeriod}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)]">
                <UsersThree aria-hidden size={22} weight="duotone" />
              </span>
              <div>
                <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                  모집 인원
                </dt>
                <dd className="mt-1 text-sm font-bold">{event.capacity}명</dd>
              </div>
            </div>
          </dl>
        </div>
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <article className="grid gap-8">
          <section className="border-b border-[var(--color-divider)] pb-8">
            <h2 className="text-2xl font-black tracking-[-0.03em]">상세 소개</h2>
            <div className="mt-5 grid gap-3 text-sm leading-7 text-[var(--color-text-secondary)]">
              {event.description.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="border-b border-[var(--color-divider)] pb-8">
            <h2 className="text-2xl font-black tracking-[-0.03em]">참여 조건</h2>
            <ul className="mt-5 grid list-disc gap-3 pl-5 text-sm leading-7 text-[var(--color-text-secondary)]">
              {event.participationConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-black tracking-[-0.03em]">유의사항</h2>
            <ul className="mt-5 grid list-disc gap-3 pl-5 text-sm leading-7 text-[var(--color-text-secondary)]">
              {event.notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          </section>
        </article>

        <aside>
          <Card>
            <CardContent className="grid gap-5">
              <h2 className="text-2xl font-black tracking-[-0.03em]">응모 동의</h2>
              <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                아래 필수 항목을 모두 확인해 주세요.
              </p>

              <div className="grid gap-3">
                {agreementItems.map((item) => (
                  <div
                    className="rounded-[var(--radius-control)] border border-[var(--color-border-control)] p-4"
                    key={item.id}
                  >
                    <Checkbox
                      checked={agreements[item.id]}
                      label={item.label}
                      onChange={(event) =>
                        handleAgreementChange(item.id, event.target.checked)
                      }
                    />
                  </div>
                ))}
              </div>

              <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
                모든 항목에 동의해야 응모할 수 있어요.
              </p>

              {/* TODO: API 연동 후 현재 사용자의 응모 여부·상태에 따라 화면을 분기하고, 미응모 시 응모 API 호출 */}
              <Button className="w-full" disabled={!allAgreed} size="lg">
                응모하기
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
