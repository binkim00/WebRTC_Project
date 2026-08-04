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
import {
  getApplicationForm,
  submitApplication,
  withdrawApplication,
  type ApplicationFormResponse,
} from '../../api/applications'
import { getAuthSession } from '../../api/authSession'
import {
  fetchPublicFanMeetingDetail,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import { getMyProfile } from '../../api/users'
import { isEmailVerificationEnabled } from '../../config/features'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  EmailVerificationNotice,
  Spinner,
  TextField,
  Textarea,
} from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { fanMeetingStatusContent } from './fanMeetingStatus'

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
  if (detail.viewer.applicationStatus === 'WITHDRAWN') return '다시 응모하기'
  return '응모하기'
}

/**
 * 응모를 취소할 수 있는 상태인지 확인한다.
 *
 * 백엔드는 응모 접수 중이고 응모 기간 안일 때만 취소를 허용하므로 같은 조건으로 버튼을 노출한다.
 */
function canWithdrawApplication(detail: PublicFanMeetingDetail): boolean {
  if (detail.viewer.applicationStatus !== 'SUBMITTED') return false
  if (detail.meeting.status !== 'APPLICATION_OPEN') return false

  const { startAt, endAt } = detail.meeting.application
  if (!startAt || !endAt) return false

  const now = Date.now()
  return now >= new Date(startAt).getTime() && now < new Date(endAt).getTime()
}

export function FanEventDetailPage() {
  // 팬 화면 경로는 '이벤트'라고 부르지만 실제 식별자는 팬미팅 ID다.
  const meetingId = Number(useParams().meetingId)
  const validMeetingId = Number.isInteger(meetingId) && meetingId > 0
  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  const [loading, setLoading] = useState(validMeetingId)
  const [error, setError] = useState<string>()
  const [agreements, setAgreements] = useState<Record<AgreementId, boolean>>({
    privacy: false,
    recording: false,
    participation: false,
  })
  const [applicationForm, setApplicationForm] = useState<ApplicationFormResponse>()
  const [formLoading, setFormLoading] = useState(validMeetingId)
  const [formError, setFormError] = useState<string>()
  const [formReloadKey, setFormReloadKey] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const [submitMessage, setSubmitMessage] = useState<string>()
  // undefined는 판단 불가(비로그인·구버전 백엔드·조회 실패)를 뜻하며 이때는 게이트를 켜지 않는다.
  const [emailVerified, setEmailVerified] = useState<boolean>()
  const [viewerEmail, setViewerEmail] = useState<string>()

  // 응모 전 이메일 인증 게이트에 쓸 내 프로필을 읽는다. 팬 세션일 때만 의미가 있다.
  useEffect(() => {
    const session = getAuthSession()
    if (session?.role !== 'FAN') return

    const controller = new AbortController()
    void getMyProfile(session.accessToken, controller.signal)
      .then((profile) => {
        if (controller.signal.aborted) return
        setViewerEmail(profile.email)
        // 이메일 인증 기능이 없는 백엔드는 필드가 없어 undefined로 남고 게이트가 열리지 않는다.
        setEmailVerified(profile.emailVerified)
      })
      .catch(() => {
        // 게이트는 안내용이므로 조회 실패 시 서버 검증(403)에 맡긴다.
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!validMeetingId) return

    const controller = new AbortController()
    setFormLoading(true)
    setFormError(undefined)
    setApplicationForm(undefined)

    // 404는 등록된 질문이 없는 정상 상태다. 그 외 오류는 질문 누락 제출을 막기 위해 별도로 보존한다.
    void getApplicationForm(meetingId, controller.signal)
      .then(setApplicationForm)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        if (reason instanceof ApiError && reason.status === 404) {
          setApplicationForm(undefined)
          return
        }

        setFormError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : '응모 질문을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setFormLoading(false)
      })

    return () => controller.abort()
  }, [formReloadKey, meetingId, validMeetingId])

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
            : '이벤트 상세 정보를 불러오지 못했습니다.',
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

  /** 상세를 다시 불러와 viewer 응모 상태를 최신으로 맞춘다. */
  async function reloadDetail() {
    const authToken = getAuthSession()?.accessToken
    try {
      setDetail(await fetchPublicFanMeetingDetail(meetingId, authToken))
    } catch {
      // 갱신 실패는 치명적이지 않으므로 화면 상태를 유지한다.
    }
  }

  async function handleSubmitApplication() {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setSubmitError('응모하려면 먼저 로그인해 주세요.')
      return
    }

    // 질문 조회가 끝나기 전이거나 실패한 상태에서는 빈 답변으로 잘못 접수하지 않는다.
    if (formLoading || formError) {
      setSubmitError('응모 질문을 확인한 뒤 다시 시도해 주세요.')
      return
    }

    const questions = applicationForm?.questions ?? []
    const missingRequired = questions.filter(
      (question) => question.required && !(answers[question.questionId] ?? '').trim(),
    )
    if (missingRequired.length > 0) {
      setSubmitError(`필수 질문에 답변해 주세요: ${missingRequired.map((question) => question.questionText).join(', ')}`)
      return
    }

    setSubmitting(true)
    setSubmitError(undefined)
    setSubmitMessage(undefined)
    try {
      await submitApplication(
        meetingId,
        {
          // 현재 백엔드 ApplicationSubmitRequest는 개인정보 동의만 저장한다.
          // 녹화·참여 동의는 UI에서 필수 확인하지만 지원되지 않는 필드를 임의 전송하지 않는다.
          personalInformationConsent: agreements.privacy,
          answers: questions
            .map((question) => ({
              questionId: question.questionId,
              value: (answers[question.questionId] ?? '').trim(),
            }))
            .filter((answer) => answer.value),
        },
        token,
      )
      setSubmitMessage('응모가 완료되었습니다. 결과 발표를 기다려 주세요.')
      await reloadDetail()
    } catch (reason) {
      if (reason instanceof ApiError) {
        // 인증 미완료는 화면 상태가 오래된 경우이므로 오류 문구와 함께 인증 안내로 전환한다.
        if (reason.code === 'EMAIL_VERIFICATION_REQUIRED') {
          setEmailVerified(false)
          setSubmitError('이메일 인증을 완료한 뒤 응모할 수 있어요.')
          return
        }
        setSubmitError(
          reason.status === 401
            ? '로그인이 만료되었습니다. 다시 로그인해 주세요.'
            : reason.status === 403
              ? '팬 계정으로 로그인해야 응모할 수 있습니다.'
              : reason.code === 'DEVICE_DUPLICATE_APPLICATION'
                ? '같은 환경에서 다른 계정의 응모 이력이 확인되어 접수할 수 없습니다. 본인 계정이 맞다면 운영팀에 문의해 주세요.'
                : reason.status === 409
                  ? '이미 응모한 이벤트입니다.'
                  : reason.status === 429
                    ? '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
                    : reason.message,
        )
      } else {
        setSubmitError('응모 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  /** 접수된 응모를 취소한다. 취소 후에도 응모 기간 안이면 다시 응모할 수 있다. */
  async function handleWithdrawApplication() {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setSubmitError('응모를 취소하려면 먼저 로그인해 주세요.')
      return
    }
    if (!window.confirm('응모를 취소할까요? 응모 기간 안에는 다시 응모할 수 있어요.')) return

    setSubmitting(true)
    setSubmitError(undefined)
    setSubmitMessage(undefined)
    try {
      await withdrawApplication(meetingId, token)
      setAnswers({})
      setAgreements({ privacy: false, recording: false, participation: false })
      setSubmitMessage('응모를 취소했습니다.')
      await reloadDetail()
    } catch (reason) {
      if (reason instanceof ApiError) {
        setSubmitError(
          reason.status === 401
            ? '로그인이 만료되었습니다. 다시 로그인해 주세요.'
            : reason.status === 409
              ? '지금은 응모를 취소할 수 있는 기간이 아닙니다.'
              : reason.message,
        )
      } else {
        setSubmitError('응모 취소 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!validMeetingId) {
    return (
      <InvalidRouteState
        message="올바른 이벤트를 선택해 주세요."
        title="이벤트 정보가 없습니다"
      />
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="이벤트 상세 정보를 불러오는 중" size="lg" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <AlertBanner title="이벤트 정보를 표시할 수 없습니다" variant="error">
        {error ?? '해당 이벤트를 찾을 수 없습니다.'}
      </AlertBanner>
    )
  }

  const { meeting, influencer, viewer } = detail
  // 녹화를 사용하지 않는 팬미팅에는 모순되는 녹화 동의 항목을 노출하지 않는다.
  const visibleAgreementItems = agreementItems.filter(
    (item) => item.id !== 'recording' || meeting.operation.recordingEnabled,
  )
  const allAgreed = visibleAgreementItems.every((item) => agreements[item.id])
  const canSubmitApplication =
    viewer.canApply && allAgreed && !formLoading && !formError
  const canWithdraw = canWithdrawApplication(detail)
  const descriptionParagraphs = (meeting.description ?? '')
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
              variant={fanMeetingStatusContent[meeting.status].variant}
            >
              {fanMeetingStatusContent[meeting.status].label}
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
            {/* 응모 가능 기간에 미인증이 확인된 팬에게는 폼 대신 인증 안내를 보여 준다. */}
            {isEmailVerificationEnabled && emailVerified === false && viewer.canApply ? (
              <CardContent className="grid gap-5">
                {submitError ? (
                  <AlertBanner title="응모 불가" variant="error">{submitError}</AlertBanner>
                ) : null}
                <EmailVerificationNotice
                  email={viewerEmail}
                  onVerified={() => {
                    setEmailVerified(true)
                    setSubmitError(undefined)
                    setSubmitMessage('이메일 인증이 완료되었어요. 이제 응모할 수 있습니다.')
                  }}
                />
              </CardContent>
            ) : (
            <CardContent className="grid gap-5">
              <h2 className="text-2xl font-black tracking-[-0.03em]">응모 동의</h2>
              <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                아래 필수 항목을 모두 확인해 주세요.
              </p>

              {formLoading ? (
                <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                  <Spinner label="응모 질문을 불러오는 중" size="sm" />
                  <span>응모 질문을 불러오는 중입니다.</span>
                </div>
              ) : null}

              {formError ? (
                <AlertBanner title="응모 질문을 불러오지 못했습니다" variant="error">
                  <p>{formError}</p>
                  <Button
                    className="mt-3"
                    onClick={() => setFormReloadKey((key) => key + 1)}
                    size="sm"
                    variant="secondary"
                  >
                    질문 다시 불러오기
                  </Button>
                </AlertBanner>
              ) : null}

              {!formLoading && !formError && applicationForm && applicationForm.questions.length > 0 ? (
                <div className="grid gap-4">
                  {applicationForm.formDescription ? (
                    <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{applicationForm.formDescription}</p>
                  ) : null}
                  {[...applicationForm.questions]
                    .sort((a, b) => a.displayOrder - b.displayOrder)
                    .map((question) =>
                      question.questionType === 'LONG_TEXT' ? (
                        <Textarea
                          disabled={!viewer.canApply}
                          key={question.questionId}
                          label={`${question.questionText}${question.required ? ' (필수)' : ''}`}
                          rows={4}
                          value={answers[question.questionId] ?? ''}
                          onChange={(event) => setAnswers((current) => ({ ...current, [question.questionId]: event.target.value }))}
                        />
                      ) : (
                        <TextField
                          disabled={!viewer.canApply}
                          key={question.questionId}
                          label={`${question.questionText}${question.required ? ' (필수)' : ''}`}
                          value={answers[question.questionId] ?? ''}
                          onChange={(event) => setAnswers((current) => ({ ...current, [question.questionId]: event.target.value }))}
                        />
                      ),
                    )}
                </div>
              ) : null}

              <div className="grid gap-3">
                {visibleAgreementItems.map((item) => (
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

              {submitError ? (
                <AlertBanner title="요청 실패" variant="error">{submitError}</AlertBanner>
              ) : null}
              {submitMessage ? (
                <AlertBanner title="처리 완료" variant="success">{submitMessage}</AlertBanner>
              ) : null}

              <Button
                className="w-full"
                disabled={!canSubmitApplication || submitting}
                loading={submitting}
                size="lg"
                onClick={() => void handleSubmitApplication()}
              >
                {getApplyButtonLabel(detail)}
              </Button>

              {canWithdraw ? (
                <Button
                  className="w-full"
                  disabled={submitting}
                  onClick={() => void handleWithdrawApplication()}
                  variant="secondary"
                >
                  응모 취소
                </Button>
              ) : null}
            </CardContent>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}
