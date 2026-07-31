import {
  CalendarBlank,
  CalendarDots,
  Clock,
  ImageSquare,
  UsersThree,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  fetchPublicFanMeetingDetail,
  type FanMeetingDetailStatus,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Spinner,
} from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

const meetingStatusContent: Record<
  FanMeetingDetailStatus,
  {
    label: string
    variant: 'primary' | 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  }
> = {
  DRAFT: { label: '임시 저장', variant: 'neutral' },
  PUBLISHED: { label: '모집 예정', variant: 'info' },
  APPLICATION_OPEN: { label: '모집 중', variant: 'success' },
  APPLICATION_CLOSED: { label: '모집 마감', variant: 'neutral' },
  READY: { label: '결과 발표', variant: 'warning' },
  LIVE: { label: '모집 마감', variant: 'neutral' },
  ENDED: { label: '모집 마감', variant: 'neutral' },
  CANCELED: { label: '취소', variant: 'danger' },
}

const agreementItems = [
  { id: 'privacy', label: '개인정보 수집·이용 동의' },
  { id: 'recording', label: '영상통화 녹화 동의' },
  { id: 'participation', label: '응모 규칙 및 참여 조건 동의' },
] as const

type AgreementId = (typeof agreementItems)[number]['id']

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}.${month}.${day} ${hour}:${minute}`
}

function formatApplicationPeriod(
  startAt: string | null,
  endAt: string | null,
): string {
  if (!startAt || !endAt) return '-'
  return `${formatDateTime(startAt)} - ${formatDateTime(endAt)}`
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes === 0) return `${remainingSeconds}초`
  if (remainingSeconds === 0) return `${minutes}분`
  return `${minutes}분 ${remainingSeconds}초`
}

function getApplyButtonLabel(detail: PublicFanMeetingDetail): string {
  if (detail.viewer.applicationStatus === 'SUBMITTED') return '응모 완료'
  if (detail.viewer.applicationStatus === 'SELECTED') return '당첨'
  if (detail.viewer.applicationStatus === 'NOT_SELECTED') return '미당첨'
  if (!detail.meeting.application.enabled) return '응모 없음'
  if (!detail.viewer.canApply) return '응모 기간이 아닙니다'
  return '응모하기'
}

export function FanEventDetailPage() {
  const { eventId } = useParams()
  const meetingId = Number(eventId)
  const validMeetingId = Number.isInteger(meetingId) && meetingId > 0
  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  const [loading, setLoading] = useState(validMeetingId)
  const [error, setError] = useState<string>()
  const [agreements, setAgreements] = useState<Record<AgreementId, boolean>>({
    privacy: false,
    recording: false,
    participation: false,
  })

  useEffect(() => {
    if (!validMeetingId) return

    const controller = new AbortController()
    const authToken = getAuthSession()?.accessToken

    setLoading(true)
    setError(undefined)

    void fetchPublicFanMeetingDetail(
      meetingId,
      authToken,
      controller.signal,
    )
      .then(setDetail)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError
            ? reason.message
            : '팬미팅 상세 정보를 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [meetingId, validMeetingId])

  function handleAgreementChange(id: AgreementId, checked: boolean) {
    setAgreements((current) => ({ ...current, [id]: checked }))
  }

  if (!validMeetingId) {
    return (
      <InvalidRouteState
        message="올바른 팬미팅을 선택해 주세요."
        title="팬미팅 정보가 없습니다"
      />
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="팬미팅 상세 정보를 불러오는 중" size="lg" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <AlertBanner title="팬미팅 정보를 표시할 수 없습니다" variant="error">
        {error ?? '해당 팬미팅을 찾을 수 없습니다.'}
      </AlertBanner>
    )
  }

  const { meeting, influencer, viewer } = detail
  const allAgreed = agreementItems.every((item) => agreements[item.id])
  const canSubmitApplication = viewer.canApply && allAgreed
  const descriptionParagraphs = meeting.description
    .split(/\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const participationConditions = [
    `팬 1명당 통화 시간은 ${formatDuration(meeting.operation.callDurationSec)}입니다.`,
    `팬미팅 시작 ${meeting.operation.earlyStartMinutes}분 전부터 입장을 준비해 주세요.`,
    '입장 전에 카메라와 마이크 장비 점검을 완료해 주세요.',
  ]
  const notices = [
    meeting.operation.recordingEnabled
      ? '영상통화는 서비스 제공 및 다시보기를 위해 녹화됩니다.'
      : '이 팬미팅은 영상통화를 녹화하지 않습니다.',
    meeting.operation.translationEnabled
      ? '영상통화 중 번역 기능을 사용할 수 있습니다.'
      : '이 팬미팅은 번역 기능을 제공하지 않습니다.',
    `연결이 끊기면 ${meeting.operation.reconnectGraceSec}초 안에 재접속해 주세요.`,
  ]

  return (
    <div className="grid gap-10">
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        {meeting.coverImageUrl ? (
          <img
            alt={`${meeting.title} 대표 이미지`}
            className="aspect-[16/10] w-full rounded-[var(--radius-panel)] object-cover shadow-[var(--shadow-panel)]"
            src={meeting.coverImageUrl}
          />
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center rounded-[var(--radius-panel)] bg-[var(--color-surface-panel)] text-[var(--color-text-tertiary)] shadow-[var(--shadow-panel)]">
            <ImageSquare aria-hidden size={52} weight="duotone" />
            <span className="sr-only">등록된 대표 이미지가 없습니다</span>
          </div>
        )}

        <div className="grid content-start gap-8 py-5">
          <div className="grid gap-5">
            <Badge
              className="w-fit"
              variant={meetingStatusContent[meeting.status].variant}
            >
              {meetingStatusContent[meeting.status].label}
            </Badge>
            <div>
              <h1 className="text-3xl font-black tracking-[-0.04em]">
                {meeting.title}
              </h1>
              <p className="mt-3 text-sm font-semibold text-[var(--color-text-secondary)]">
                인플루언서 {influencer.name}
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
                <dd className="mt-1 text-sm font-bold">
                  {formatDateTime(meeting.scheduledStartAt)}
                </dd>
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
                <dd className="mt-1 text-sm font-bold">
                  {formatDuration(meeting.operation.callDurationSec)}
                </dd>
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
                  {formatApplicationPeriod(
                    meeting.application.startAt,
                    meeting.application.endAt,
                  )}
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
                <dd className="mt-1 text-sm font-bold">
                  {meeting.application.capacity}명
                </dd>
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
              {descriptionParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="border-b border-[var(--color-divider)] pb-8">
            <h2 className="text-2xl font-black tracking-[-0.03em]">참여 조건</h2>
            <ul className="mt-5 grid list-disc gap-3 pl-5 text-sm leading-7 text-[var(--color-text-secondary)]">
              {participationConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-black tracking-[-0.03em]">유의사항</h2>
            <ul className="mt-5 grid list-disc gap-3 pl-5 text-sm leading-7 text-[var(--color-text-secondary)]">
              {notices.map((notice) => (
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
                      disabled={!viewer.canApply}
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

              {/* TODO: 응모 생성 API 확정 후 현재 동의 상태와 meetingId를 전달한다. */}
              <Button
                className="w-full"
                disabled={!canSubmitApplication}
                size="lg"
              >
                {getApplyButtonLabel(detail)}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
