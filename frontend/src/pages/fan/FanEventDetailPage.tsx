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
import eventPreviewImage from '../../assets/call-preview-remote.jpg'

const eventDetailMock = {
  title: 'Melly와의 봄날 팬미팅',
  influencerName: 'Melly',
  recruitmentStatus: '모집 중',
  thumbnailUrl: eventPreviewImage,
  meetingAt: '2026.08.02 19:00',
  callDuration: '02:00',
  applicationPeriod: '2026.07.15 - 2026.07.25',
  capacity: 30,
  description: [
    'Melly와 함께 1:1 영상통화로 만나는 온라인 팬미팅입니다.',
    '행사 운영을 위해 응모 정보와 참여 기록이 사용됩니다.',
  ],
  participationConditions: [
    '본인 명의 계정으로 응모해 주세요.',
    '팬미팅 시작 전에 장비 점검을 완료해 주세요.',
    '안내된 시간에 대기실에 입장해 주세요.',
  ],
  notices: [
    '영상통화는 행사 운영 및 안전 관리를 위해 녹화될 수 있습니다.',
    '부적절한 상황이 발생하면 운영자가 통화를 종료할 수 있습니다.',
    '당첨자 본인이 아닌 경우 팬미팅 참여가 제한됩니다.',
  ],
}

const agreementItems = [
  { id: 'privacy', label: '개인정보 수집·이용 동의' },
  { id: 'recording', label: '영상통화 녹화 동의' },
  { id: 'participation', label: '응모 규칙 및 참여 조건 동의' },
] as const

type AgreementId = (typeof agreementItems)[number]['id']

export function FanEventDetailPage() {
  const { eventId } = useParams()
  const [agreements, setAgreements] = useState<Record<AgreementId, boolean>>({
    privacy: false,
    recording: false,
    participation: false,
  })
  const allAgreed = agreementItems.every((item) => agreements[item.id])

  function handleAgreementChange(id: AgreementId, checked: boolean) {
    setAgreements((current) => ({ ...current, [id]: checked }))
  }

  if (!eventId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 eventId 값이 없습니다. 이벤트 목록에서 다시 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  return (
    <div className="grid gap-10">
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <img
          alt={`${eventDetailMock.title} 대표 이미지`}
          className="aspect-[16/10] w-full rounded-[var(--radius-panel)] object-cover shadow-[var(--shadow-panel)]"
          src={eventDetailMock.thumbnailUrl}
        />

        <div className="grid content-start gap-8 py-5">
          <div className="grid gap-5">
            <Badge className="w-fit" variant="success">
              {eventDetailMock.recruitmentStatus}
            </Badge>
            <div>
              <h1 className="text-3xl font-black tracking-[-0.04em]">
                {eventDetailMock.title}
              </h1>
              <p className="mt-3 text-sm font-semibold text-[var(--color-text-secondary)]">
                인플루언서 {eventDetailMock.influencerName}
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
                <dd className="mt-1 text-sm font-bold">{eventDetailMock.meetingAt}</dd>
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
                <dd className="mt-1 text-sm font-bold">{eventDetailMock.callDuration}</dd>
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
                  {eventDetailMock.applicationPeriod}
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
                <dd className="mt-1 text-sm font-bold">{eventDetailMock.capacity}명</dd>
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
              {eventDetailMock.description.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="border-b border-[var(--color-divider)] pb-8">
            <h2 className="text-2xl font-black tracking-[-0.03em]">참여 조건</h2>
            <ul className="mt-5 grid list-disc gap-3 pl-5 text-sm leading-7 text-[var(--color-text-secondary)]">
              {eventDetailMock.participationConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-black tracking-[-0.03em]">유의사항</h2>
            <ul className="mt-5 grid list-disc gap-3 pl-5 text-sm leading-7 text-[var(--color-text-secondary)]">
              {eventDetailMock.notices.map((notice) => (
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

              {/* TODO: 응모 API 호출 및 응모 결과 화면 이동 */}
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
