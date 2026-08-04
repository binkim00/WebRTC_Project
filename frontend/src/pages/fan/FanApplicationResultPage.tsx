import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  HourglassMedium,
  ListNumbers,
  Wrench,
  XCircle,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  getMyApplication,
  type MyApplicationResponse,
} from '../../api/applications'
import {
  fetchPublicFanMeetingDetail,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import { AlertBanner, Badge, Card, CardContent, Spinner } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '일정 미정'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isResultPublished(detail: PublicFanMeetingDetail | undefined): boolean {
  return (
    detail?.meeting.status === 'READY' ||
    detail?.meeting.status === 'LIVE' ||
    detail?.meeting.status === 'ENDED'
  )
}

export function FanApplicationResultPage() {
  const { meetingId } = useParams()
  const [application, setApplication] = useState<MyApplicationResponse | null>()
  const [resultPublished, setResultPublished] = useState<boolean>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!meetingId?.trim()) return

    const controller = new AbortController()
    const session = getAuthSession()

    if (!session || session.role !== 'FAN') {
      setError('팬 계정으로 로그인한 뒤 응모 결과를 확인해 주세요.')
      return () => controller.abort()
    }

    setResultPublished(undefined)
    void getMyApplication(meetingId, session.accessToken, controller.signal)
      .then(async (result) => {
        setApplication(result)
        if (
          result &&
          (result.applicationStatus === 'SELECTED' ||
            result.applicationStatus === 'NOT_SELECTED')
        ) {
          try {
            const detail = await fetchPublicFanMeetingDetail(
              Number(meetingId),
              session.accessToken,
              controller.signal,
            )
            setResultPublished(isResultPublished(detail))
          } catch {
            if (controller.signal.aborted) return
            // 공개 여부를 확인하지 못하면 결과를 숨기는 쪽으로 처리한다.
            setResultPublished(false)
          }
        } else {
          setResultPublished(true)
        }
        setError(undefined)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : '응모 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        )
      })

    return () => controller.abort()
  }, [meetingId])

  if (!meetingId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 팬미팅 ID가 없습니다. 응모한 이벤트 목록에서 다시 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  if (error) {
    return (
      <AlertBanner title="응모 결과를 확인할 수 없습니다" variant="error">
        {error}
      </AlertBanner>
    )
  }

  if (application === undefined || resultPublished === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="응모 결과를 불러오는 중" />
      </div>
    )
  }

  if (application === null || application.applicationStatus === 'WITHDRAWN') {
    return (
      <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-control)] px-6 py-16 text-center">
        <h1 className="text-xl font-black tracking-[-0.03em]">
          {application === null ? '응모 내역이 없습니다' : '응모를 취소한 이벤트입니다'}
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          {application === null
            ? '이 이벤트에 응모한 기록을 찾을 수 없어요. 이벤트 상세에서 응모해 주세요.'
            : '응모를 취소해 결과를 확인할 수 없어요. 모집 중이라면 다시 응모할 수 있어요.'}
        </p>
        <Link
          className="mt-6 inline-flex min-h-[var(--control-height)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-6 py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
          to={`/fan/events/${meetingId}`}
        >
          이벤트 상세로 이동
          <ArrowRight aria-hidden size={18} weight="bold" />
        </Link>
      </div>
    )
  }

  const isSelected =
    resultPublished === true && application.applicationStatus === 'SELECTED'
  const isPending =
    resultPublished !== true || application.applicationStatus === 'SUBMITTED'
  // 결과 확인 후 상태에 맞는 목록으로 돌아가도록 연결한다.
  // 당첨자는 예정 팬미팅, 미당첨자는 응모 내역의 미당첨 필터로 이동한다.
  const resultListPath = isSelected
    ? '/fan/mypage/fan-meetings?status=upcoming'
    : `/fan/mypage/applications?status=${isPending ? 'SUBMITTED' : 'NOT_SELECTED'}`
  const resultListLabel = isSelected ? '예정 팬미팅으로 이동' : '응모 내역으로 돌아가기'

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent>
          <h1 className="text-2xl font-black tracking-[-0.035em]">
            {application.meetingTitle}
          </h1>
          <p className="mt-2 text-sm font-semibold text-[var(--color-text-secondary)]">
            인플루언서 {application.influencerName}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <Badge
            className="w-fit"
            variant={isSelected ? 'success' : isPending ? 'warning' : 'neutral'}
          >
            {isSelected ? '당첨' : isPending ? '발표 전' : '미당첨'}
          </Badge>

          <div className="mx-auto mt-8 grid max-w-4xl gap-8">
            <header className="grid justify-items-center gap-4 text-center">
              {isSelected ? (
                <CheckCircle
                  aria-hidden
                  className="text-[var(--color-success)]"
                  size={52}
                  weight="fill"
                />
              ) : isPending ? (
                <HourglassMedium
                  aria-hidden
                  className="text-[var(--color-warning)]"
                  size={52}
                  weight="fill"
                />
              ) : (
                <XCircle
                  aria-hidden
                  className="text-[var(--color-text-tertiary)]"
                  size={52}
                  weight="fill"
                />
              )}
              <div>
                <h2 className="text-3xl font-black tracking-[-0.04em]">
                  {isSelected
                    ? '축하합니다!'
                    : isPending
                      ? '결과 발표 전이에요'
                      : '아쉽지만 다음 기회에 만나요'}
                </h2>
                <p className="mt-3 text-sm font-semibold text-[var(--color-text-secondary)]">
                  {isSelected
                    ? '팬미팅에 당첨되었습니다.'
                    : isPending
                      ? '응모가 정상적으로 접수되었어요. 발표를 기다려 주세요.'
                      : '이번 팬미팅에는 당첨되지 않았습니다.'}
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
                    {formatDateTime(application.scheduledStartAt)}
                  </dd>
                </div>
              </div>

              <div className="flex items-center gap-4 px-4 py-3">
                <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
                  <ListNumbers aria-hidden size={26} weight="duotone" />
                </span>
                <div>
                  <dt className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                    {isSelected ? '내 순번' : '응모 일시'}
                  </dt>
                  <dd className="mt-1 text-xl font-black">
                    {isSelected
                      ? application.callOrder !== null
                        ? `${application.callOrder}번째`
                        : '배정 예정'
                      : formatDateTime(application.submittedAt)}
                  </dd>
                </div>
              </div>
            </dl>

            {isSelected ? (
              <>
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
                  to={`/fan-meetings/${application.meetingId}/device-check`}
                >
                  장비 점검하기
                  <ArrowRight aria-hidden size={20} weight="bold" />
                </Link>
              </>
            ) : (
              <Link
                className="inline-flex min-h-[var(--control-height)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-6 py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                aria-label={resultListLabel}
                to={resultListPath}
              >
                응모 내역으로 돌아가기
                <ArrowRight aria-hidden size={18} weight="bold" />
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
