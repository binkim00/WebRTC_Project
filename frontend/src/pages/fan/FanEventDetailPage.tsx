import { useEffect, useState } from 'react'
import { parseServerDate } from '../../api/serverTime'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import {
  getApplicationForm,
  submitApplication,
  withdrawApplication,
  type ApplicationAnswerRequest,
  type ApplicationFormQuestionResponse,
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
  Button,
  Checkbox,
  Dialog,
  EmailVerificationNotice,
  RadioGroup,
  Spinner,
  TextField,
  Textarea,
} from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { useTranslation, type TranslationKey } from '../../i18n'
import { fanMeetingStatusContent } from './fanMeetingStatus'

/** 응모 동의 항목이다. 라벨은 사전 키로 들고 있고 화면에서 현재 언어로 번역한다. */
const agreementItems = [
  { id: 'privacy', labelKey: 'fanEvent.agree.privacy' },
  { id: 'recording', labelKey: 'fanEvent.agree.recording' },
  { id: 'participation', labelKey: 'fanEvent.agree.participation' },
] as const satisfies readonly { id: string; labelKey: TranslationKey }[]

type AgreementId = (typeof agreementItems)[number]['id']

/** 질문에 실제로 답했는지 판정한다. 주관식은 공백만 남은 입력을 답변으로 보지 않는다. */
function isAnswered(
  question: ApplicationFormQuestionResponse,
  texts: Record<number, string>,
  choices: Record<number, number[]>,
): boolean {
  if (question.questionType === 'SINGLE_CHOICE' || question.questionType === 'MULTIPLE_CHOICE') {
    return (choices[question.questionId] ?? []).length > 0
  }
  return Boolean((texts[question.questionId] ?? '').trim())
}

/**
 * 응모 요청에 담을 답변을 만든다.
 *
 * 백엔드는 주관식이면 value만, 객관식이면 optionIds만 받는다. 답하지 않은 선택 질문은
 * 아예 보내지 않는다.
 */
function toAnswerRequests(
  questions: ApplicationFormQuestionResponse[],
  texts: Record<number, string>,
  choices: Record<number, number[]>,
): ApplicationAnswerRequest[] {
  return questions
    .filter((question) => isAnswered(question, texts, choices))
    .map((question) =>
      question.questionType === 'SINGLE_CHOICE' || question.questionType === 'MULTIPLE_CHOICE'
        ? { questionId: question.questionId, optionIds: choices[question.questionId] ?? [] }
        : { questionId: question.questionId, value: (texts[question.questionId] ?? '').trim() },
    )
}

function pad(part: number) {
  return String(part).padStart(2, '0')
}

/** 2026.08.02 19:00 */
function formatDateTime(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 07.27 18:00 — 같은 해 안의 가까운 일정에 쓰는 짧은 표기다. */
function formatShortDateTime(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 07.25 — 배지의 마감 표기다. */
function formatMonthDay(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/** 1:1 영상통화 02:00 표기용 mm:ss다. */
function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`
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
  return now >= new Date(startAt).getTime() && now < parseServerDate(endAt).getTime()
}

/** 이미지와 정보 열이 만나는 경계 굴절이다. 데스크톱은 수직, ≤1080px에서는 하단 수평으로 회전한다. */
function HeroSeam({ glowOpacity, lineOpacity, animate }: {
  glowOpacity: number
  lineOpacity: number
  animate: boolean
}) {
  return (
    <>
      {/* ≥1081px — 수직 경계 (우측 88px 번짐 + 3px 선) */}
      <span
        aria-hidden="true"
        className={`mj-seam-glow absolute inset-y-0 right-0 hidden w-[88px] transition-opacity duration-[420ms] min-[1081px]:block ${animate ? 'motion-safe:animate-[mj-seam-shift_1400ms_cubic-bezier(0.16,1,0.3,1)_both]' : ''}`}
        style={{
          opacity: glowOpacity,
          background:
            'linear-gradient(90deg, rgba(232,97,92,0) 0%, rgba(232,97,92,0.16) 62%, rgba(217,66,63,0.34) 100%)',
        }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-0 hidden w-[3px] transition-opacity duration-[420ms] min-[1081px]:block"
        style={{
          opacity: lineOpacity,
          background:
            'linear-gradient(180deg, rgba(232,97,92,0.25) 0%, rgba(217,66,63,0.95) 42%, rgba(232,97,92,0.35) 100%)',
        }}
      />
      {/* ≤1080px — 수평 경계 (하단 72px 번짐 + 4px 선). 단일 열에서는 굴절 모션을 정지한다. */}
      <span
        aria-hidden="true"
        className="mj-seam-glow absolute inset-x-0 bottom-0 h-[72px] min-[1081px]:hidden"
        style={{
          opacity: glowOpacity,
          background: 'linear-gradient(180deg, rgba(232,97,92,0) 0%, rgba(217,66,63,0.3) 100%)',
        }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[4px] min-[1081px]:hidden"
        style={{
          opacity: lineOpacity,
          background:
            'linear-gradient(90deg, rgba(232,97,92,0) 0%, rgba(217,66,63,0.95) 50%, rgba(232,97,92,0) 100%)',
        }}
      />
    </>
  )
}

/** 객관식 질문의 라벨과 선택 방식 안내를 한 덩어리로 묶어 legend 안에 넣는다. */
function ChoiceLegend({ label, hint }: { label: string; hint: string }) {
  return (
    <>
      {label}
      <span className="mt-1 block text-xs font-normal text-[var(--color-text-muted)]">{hint}</span>
    </>
  )
}

/**
 * 선택지가 없는 객관식 질문 자리에 놓는 안내다.
 *
 * 서버가 선택지 2개 이상을 강제하므로 정상 경로에서는 나오지 않지만, 고를 수단이 없는 질문이
 * 조용히 사라져 응모 버튼만 계속 잠기는 상황을 막으려고 이유를 보여 준다.
 */
function MissingOptionsNotice({ label }: { label: string }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-1">
      <p className="mj-font-label text-sm text-[var(--color-text-primary)]">{label}</p>
      <p className="text-xs text-[var(--color-error)]">{t('fanEvent.form.noOptions')}</p>
    </div>
  )
}

export function FanEventDetailPage() {
  const { t } = useTranslation()
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
  // 객관식 답변은 질문마다 고른 선택지 식별자 목록으로 들고 있다. 단일 선택도 길이 1의 배열이다.
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number[]>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  // undefined는 판단 불가(비로그인·구버전 백엔드·조회 실패)를 뜻하며 이때는 게이트를 켜지 않는다.
  const [emailVerified, setEmailVerified] = useState<boolean>()
  const [viewerEmail, setViewerEmail] = useState<string>()

  // 응모 전 이메일 인증 게이트에 쓸 내 프로필을 읽는다. 팬 세션이고 인증 기능이 켜져 있을 때만 의미가 있다.
  useEffect(() => {
    if (!isEmailVerificationEnabled) return
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
            : t('fanEvent.form.error.load'),
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setFormLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발하므로 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formReloadKey, meetingId, validMeetingId])

  useEffect(() => {
    if (!validMeetingId) return

    const controller = new AbortController()
    const authToken = getAuthSession()?.accessToken

    setLoading(true)
    setError(undefined)

    void fetchPublicFanMeetingDetail(meetingId, authToken, controller.signal)
      .then(setDetail)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError
            ? reason.message
            : t('fanEvent.error.detailLoad'),
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // 위와 같은 이유로 t는 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, validMeetingId])

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
      setSubmitError(t('fanEvent.submit.needLogin'))
      return
    }

    // 질문 조회가 끝나기 전이거나 실패한 상태에서는 빈 답변으로 잘못 접수하지 않는다.
    if (formLoading || formError) {
      setSubmitError(t('fanEvent.submit.checkForm'))
      return
    }

    const questions = applicationForm?.questions ?? []
    // 버튼이 이미 막고 있지만, 오류 패널의 재시도 경로로도 들어오므로 여기서도 한 번 더 본다.
    const missingRequired = questions.filter(
      (question) => question.required && !isAnswered(question, answers, selectedOptions),
    )
    if (missingRequired.length > 0) {
      setSubmitError(
        t('fanEvent.submit.missingRequired', {
          questions: missingRequired.map((question) => question.questionText).join(', '),
        }),
      )
      return
    }

    setSubmitting(true)
    setSubmitError(undefined)
    try {
      await submitApplication(
        meetingId,
        {
          personalInformationConsent: agreements.privacy,
          // 녹화 동의는 녹화를 쓰는 팬미팅에서만 화면에 나오고 서버도 그때만 요구한다.
          recordingConsent: agreements.recording,
          participationConsent: agreements.participation,
          answers: toAnswerRequests(questions, answers, selectedOptions),
        },
        token,
      )
      await reloadDetail()
    } catch (reason) {
      if (reason instanceof ApiError) {
        // 인증 미완료는 화면 상태가 오래된 경우이므로 오류 문구와 함께 인증 안내로 전환한다.
        if (reason.code === 'EMAIL_VERIFICATION_REQUIRED') {
          setEmailVerified(false)
          setSubmitError(t('fanEvent.submit.needEmailVerify'))
          return
        }
        setSubmitError(
          reason.code === 'APPLICATION_PARTICIPATION_CONSENT_REQUIRED' ||
          reason.code === 'APPLICATION_RECORDING_CONSENT_REQUIRED'
            ? t('fanEvent.submit.needConsent')
            : reason.status === 401
            ? t('fanEvent.submit.sessionExpired')
            : reason.status === 403
              ? t('fanEvent.submit.fanOnly')
              : reason.code === 'DEVICE_DUPLICATE_APPLICATION'
                ? t('fanEvent.submit.deviceDuplicate')
                : reason.status === 409
                  ? t('fanEvent.submit.alreadyApplied')
                  : reason.status === 429
                    ? t('fanEvent.submit.tooManyRequests')
                    : reason.message,
        )
      } else {
        setSubmitError(t('fanEvent.submit.failed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  /** 접수된 응모를 취소한다. 취소 후에도 응모 기간 안이면 다시 응모할 수 있다. */
  async function handleWithdrawApplication() {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setSubmitError(t('fanEvent.withdraw.needLogin'))
      return
    }
    if (!window.confirm(t('fanEvent.withdraw.confirm'))) return

    setSubmitting(true)
    setSubmitError(undefined)
    try {
      await withdrawApplication(meetingId, token)
      setAnswers({})
      setSelectedOptions({})
      setAgreements({ privacy: false, recording: false, participation: false })
      await reloadDetail()
    } catch (reason) {
      if (reason instanceof ApiError) {
        setSubmitError(
          reason.status === 401
            ? t('fanEvent.submit.sessionExpired')
            : reason.status === 409
              ? t('fanEvent.withdraw.notAllowed')
              : reason.message,
        )
      } else {
        setSubmitError(t('fanEvent.withdraw.failed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!validMeetingId) {
    return (
      <InvalidRouteState
        message={t('fanEvent.invalid.message')}
        title={t('fanEvent.invalid.title')}
      />
    )
  }

  // dc.html의 로딩 스켈레톤 — 히어로 밴드 자리 그대로 회색 블록을 놓는다.
  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label={t('fanEvent.loading')}
        className="-mx-4 -mt-8 grid h-[640px] sm:-mx-6 lg:-mx-10 lg:-mt-10 min-[1081px]:grid-cols-[1fr_400px]"
      >
        <div className="bg-[var(--color-surface-muted)]" />
        <div className="hidden content-start gap-4 py-11 pl-9 min-[1081px]:grid">
          <div className="h-[22px] w-[130px] rounded-md bg-[var(--color-surface-muted)]" />
          <div className="h-11 w-[88%] rounded-lg bg-[var(--color-surface-muted)]" />
          <div className="h-11 w-[56%] rounded-lg bg-[var(--color-surface-muted)]" />
          <div className="mt-5 h-[200px] rounded-lg bg-[var(--color-surface-muted)]" />
        </div>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <AlertBanner title={t('fanEvent.error.title')} variant="error">
        {error ?? t('fanEvent.error.notFound')}
      </AlertBanner>
    )
  }

  const { meeting, influencer, viewer } = detail
  // 녹화를 사용하지 않는 팬미팅에는 모순되는 녹화 동의 항목을 노출하지 않는다.
  const visibleAgreementItems = agreementItems.filter(
    (item) => item.id !== 'recording' || meeting.operation.recordingEnabled,
  )
  const allAgreed = visibleAgreementItems.every((item) => agreements[item.id])
  const canWithdraw = canWithdrawApplication(detail)
  const applicationEndAt = meeting.application.endAt
  const resultAt = meeting.application.resultAnnouncementAt

  // dc.html의 4상태(open/applied/closed/error)에 실제 데이터를 대응시킨다.
  const isApplied = viewer.applicationStatus === 'SUBMITTED'
  const panel: 'applied' | 'error' | 'open' | 'closed' | 'none' = !meeting.application.enabled
    ? 'none'
    : isApplied
      ? 'applied'
      : submitError
        ? 'error'
        : meeting.status === 'APPLICATION_OPEN' || meeting.status === 'PUBLISHED'
          ? 'open'
          : 'closed'
  const showEmailGate =
    isEmailVerificationEnabled && panel === 'open' && emailVerified === false && viewer.canApply

  const questions = [...(applicationForm?.questions ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  )
  // 필수 질문도 동의 항목과 똑같이 다룬다. 누른 뒤 오류를 띄우지 않고 버튼 자체를 막는다.
  const missingRequiredQuestions = questions.filter(
    (question) => question.required && !isAnswered(question, answers, selectedOptions),
  )

  const ctaDisabled =
    !viewer.canApply ||
    !allAgreed ||
    missingRequiredQuestions.length > 0 ||
    formLoading ||
    Boolean(formError) ||
    submitting
  // 비활성 사유를 우선순위대로 하나만 보여 준다. aria-live로 상태 변화를 함께 알린다.
  const helperText = !viewer.canApply
    ? t('fanEvent.helper.notOpen')
    : formLoading
      ? t('fanEvent.helper.formLoading')
      : formError
        ? t('fanEvent.helper.formError')
        : missingRequiredQuestions.length > 0
          ? t('fanEvent.helper.needAnswer', { count: missingRequiredQuestions.length })
          : allAgreed
            ? t('fanEvent.helper.allAgreed')
            : t('fanEvent.helper.needAgree', { count: visibleAgreementItems.length })

  const badge =
    panel === 'applied'
      ? { label: t('fanEvent.badge.applied'), coral: true }
      : panel === 'closed'
        ? { label: t('fanEvent.badge.closed'), coral: false }
        : meeting.status === 'APPLICATION_OPEN' && applicationEndAt
          ? {
              label: t('fanEvent.badge.open', { date: formatMonthDay(applicationEndAt) }),
              coral: true,
            }
          : { label: fanMeetingStatusContent()[meeting.status].label, coral: true }

  const seam =
    panel === 'closed'
      ? { glow: 0.16, line: 0.3, animate: false }
      : panel === 'applied'
        ? { glow: 0.92, line: 0.9, animate: true }
        : { glow: 0.55, line: 0.9, animate: false }

  const descriptionParagraphs = (meeting.description ?? '')
    .split(/\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const participationConditions = [
    t('fanEvent.condition.identity'),
    t('fanEvent.condition.waitingRoom'),
  ]
  const cautions = [
    meeting.operation.recordingEnabled
      ? t('fanEvent.caution.recordingKept')
      : t('fanEvent.caution.noRecording'),
    t('fanEvent.caution.moderation'),
  ]

  return (
    <div className="-mx-4 -mt-8 sm:-mx-6 lg:-mx-10 lg:-mt-10">
      <section
        aria-label={t('fanEvent.sectionAria')}
        className="grid items-stretch border-b border-[var(--color-divider)] min-[1081px]:grid-cols-[minmax(0,1fr)_444px]"
      >
        <div className="relative min-h-[min(52vw,420px)] overflow-hidden bg-[var(--color-surface-muted)] min-[1081px]:min-h-[640px]">
          {meeting.coverImageUrl ? (
            <img
              alt={t('fanEvent.coverAlt', { title: meeting.title })}
              className={`absolute inset-0 size-full object-cover ${panel === 'closed' ? 'saturate-[0.68] brightness-[1.03]' : ''}`}
              src={meeting.coverImageUrl}
            />
          ) : (
            <div
              aria-label={t('fanEvent.noImageAria')}
              className="absolute inset-0 grid place-items-center"
              role="img"
            >
              <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                {t('fanEvent.noImage')}
              </span>
            </div>
          )}
          <HeroSeam animate={seam.animate} glowOpacity={seam.glow} lineOpacity={seam.line} />
        </div>

        <div className="flex flex-col px-5 pb-8 pt-[26px] sm:px-[26px] sm:pb-9 sm:pt-[30px] min-[1081px]:pb-11 min-[1081px]:pl-10 min-[1081px]:pr-11 min-[1081px]:pt-[46px]">
          <p
            className={`text-sm font-bold ${badge.coral ? 'text-[var(--color-primary-coral)]' : 'text-[var(--color-text-muted)]'}`}
          >
            {badge.label}
          </p>
          <h1 className="mt-3.5 text-[clamp(30px,3vw,40px)] font-black leading-[1.14] tracking-[-0.048em] [text-wrap:balance]">
            {meeting.title}
          </h1>
          <p className="mt-4 text-[17px] font-semibold text-[var(--color-text-body)]">
            {t('fanEvent.influencer', { name: influencer.name })}
          </p>
          <p className="mt-1.5 text-[17px] font-medium tabular-nums text-[var(--color-text-muted)]">
            {t('fanEvent.schedule', {
              date: formatDateTime(meeting.scheduledStartAt),
              duration: formatCallDuration(meeting.operation.callDurationSec),
            })}
          </p>

          {showEmailGate ? (
            <div className="mt-[34px] border-t border-[var(--color-divider)] pt-[26px]">
              <EmailVerificationNotice
                email={viewerEmail}
                onVerified={() => {
                  setEmailVerified(true)
                  setSubmitError(undefined)
                }}
              />
            </div>
          ) : panel === 'open' ? (
            <div className="mt-[34px] border-t border-[var(--color-divider)] pt-[26px]">
              {formError ? (
                <AlertBanner className="mb-5" title={t('fanEvent.form.error.title')} variant="error">
                  <p>{formError}</p>
                  <Button
                    className="mt-3"
                    onClick={() => setFormReloadKey((key) => key + 1)}
                    size="sm"
                    variant="secondary"
                  >
                    {t('fanEvent.form.reload')}
                  </Button>
                </AlertBanner>
              ) : formLoading ? (
                <div className="mb-5 flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
                  <Spinner label={t('fanEvent.form.loading')} size="sm" />
                  <span>{t('fanEvent.form.loadingText')}</span>
                </div>
              ) : (
                <>
                  {/*
                    운영자가 남긴 응모 안내문이다. 질문 목록과 **독립적으로** 보여 준다.
                    이전에는 `questions.length > 0` 분기 안에만 있어서, 질문 없이 안내문만 작성한
                    팬미팅에서는 팬에게 전혀 보이지 않았다. 또 질문 라벨 사이에 옅은 본문으로 섞여
                    있어 안내문으로 읽히지도 않았으므로 별도 블록으로 올린다.
                    운영자가 줄바꿈으로 항목을 나눠 적는 경우가 많아 whitespace-pre-wrap으로 살린다.
                  */}
                  {applicationForm?.formDescription ? (
                    <div className="mb-5 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] px-4 py-3.5">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-body)]">
                        {applicationForm.formDescription}
                      </p>
                    </div>
                  ) : null}
                  {questions.length > 0 ? (
                    <div className="mb-6 grid gap-4">
                      {questions.map((question) => {
                        const label = `${question.questionText}${question.required ? t('fanEvent.form.required') : ''}`
                        const selected = selectedOptions[question.questionId] ?? []

                        if (question.questionType === 'SINGLE_CHOICE') {
                          return question.options.length > 0 ? (
                            <RadioGroup
                              disabled={!viewer.canApply}
                              key={question.questionId}
                              legend={
                                <ChoiceLegend hint={t('fanEvent.form.chooseOne')} label={label} />
                              }
                              name={`application-question-${question.questionId}`}
                              onValueChange={(value) =>
                                setSelectedOptions((current) => ({
                                  ...current,
                                  [question.questionId]: [Number(value)],
                                }))
                              }
                              options={question.options.map((option) => ({
                                label: option.optionText,
                                value: String(option.optionId),
                              }))}
                              value={selected.length > 0 ? String(selected[0]) : ''}
                            />
                          ) : (
                            <MissingOptionsNotice key={question.questionId} label={label} />
                          )
                        }

                        if (question.questionType === 'MULTIPLE_CHOICE') {
                          return question.options.length > 0 ? (
                            <fieldset className="grid gap-3" key={question.questionId}>
                              <legend className="mj-font-label text-sm text-[var(--color-text-primary)]">
                                <ChoiceLegend hint={t('fanEvent.form.chooseMany')} label={label} />
                              </legend>
                              {question.options.map((option) => (
                                <Checkbox
                                  checked={selected.includes(option.optionId)}
                                  disabled={!viewer.canApply}
                                  key={option.optionId}
                                  label={option.optionText}
                                  onChange={(event) =>
                                    setSelectedOptions((current) => {
                                      const previous = current[question.questionId] ?? []
                                      return {
                                        ...current,
                                        [question.questionId]: event.target.checked
                                          ? [...previous, option.optionId]
                                          : previous.filter((id) => id !== option.optionId),
                                      }
                                    })
                                  }
                                />
                              ))}
                            </fieldset>
                          ) : (
                            <MissingOptionsNotice key={question.questionId} label={label} />
                          )
                        }

                        return question.questionType === 'LONG_TEXT' ? (
                          <Textarea
                            disabled={!viewer.canApply}
                            key={question.questionId}
                            label={label}
                            rows={4}
                            value={answers[question.questionId] ?? ''}
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [question.questionId]: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          <TextField
                            disabled={!viewer.canApply}
                            key={question.questionId}
                            label={label}
                            value={answers[question.questionId] ?? ''}
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [question.questionId]: event.target.value,
                              }))
                            }
                          />
                        )
                      })}
                    </div>
                  ) : null}
                </>
              )}

              <h2 className="text-[17px] font-extrabold tracking-[-0.03em]">{t('fanEvent.agree.title')}</h2>
              <div className="mt-2.5">
                {visibleAgreementItems.map((item, index) => (
                  <label
                    className={`flex min-h-[50px] cursor-pointer items-center gap-3 ${index < visibleAgreementItems.length - 1 ? 'border-b border-[var(--color-border-row)]' : ''}`}
                    key={item.id}
                  >
                    <input
                      checked={agreements[item.id]}
                      className="m-0 size-[21px] flex-none cursor-pointer accent-[var(--color-primary-coral)]"
                      disabled={!viewer.canApply}
                      onChange={(event) =>
                        setAgreements((current) => ({
                          ...current,
                          [item.id]: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    <span className="text-base font-semibold">{t(item.labelKey)}</span>
                    <span className="ml-auto text-[13px] font-semibold text-[var(--color-text-muted)]">
                      {t('fanEvent.agree.requiredBadge')}
                    </span>
                  </label>
                ))}
              </div>
              <button
                className={`mj-font-emphasis mt-[22px] min-h-14 w-full rounded-[10px] border text-[17px] transition-[background-color,transform] duration-150 motion-reduce:transition-none ${
                  ctaDisabled
                    ? 'cursor-not-allowed border-[var(--color-border-control)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
                    : 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white shadow-[var(--shadow-final-cta)] hover:-translate-y-px hover:bg-[var(--color-primary-coral-hover)] active:translate-y-px motion-reduce:transform-none'
                }`}
                disabled={ctaDisabled}
                onClick={() => setConfirmOpen(true)}
                type="button"
              >
                {t('fanEvent.submit')}
              </button>
              <p
                aria-live="polite"
                className="mt-3 text-sm font-semibold leading-[1.55] text-[var(--color-text-muted)]"
              >
                {helperText}
              </p>
            </div>
          ) : panel === 'applied' ? (
            <div className="mt-[34px] border-t border-[var(--color-divider)] pt-[26px] motion-safe:animate-[mj-settle-in_420ms_cubic-bezier(0.16,1,0.3,1)_both]">
              <h2 className="text-2xl font-black tracking-[-0.038em] text-[var(--color-primary-coral)]">
                {t('fanEvent.applied.title')}
              </h2>
              <p className="mt-3 text-base font-medium leading-[1.7] text-[var(--color-text-body)]">
                {resultAt
                  ? t('fanEvent.applied.withResult', {
                      date: formatShortDateTime(resultAt),
                    })
                  : t('fanEvent.applied.withoutResult')}
              </p>
              {applicationEndAt ? (
                <>
                  <p className="mt-[18px] text-sm font-bold text-[var(--color-text-muted)]">
                    {t('fanEvent.applied.withdrawDeadline')}
                  </p>
                  <p className="mt-[5px] text-[17px] font-extrabold tabular-nums">
                    {formatDateTime(applicationEndAt)}
                  </p>
                </>
              ) : null}
              <Link
                className="mj-font-emphasis mt-6 flex min-h-[54px] items-center justify-center rounded-[10px] bg-[var(--color-primary-coral)] text-base text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                to="/fan/mypage/applications"
              >
                {t('fanEvent.applied.myApplications')}
              </Link>
              {canWithdraw ? (
                <button
                  className="mj-font-label mt-1.5 min-h-11 w-full text-[15px] text-[var(--color-text-muted)] hover:text-[var(--color-primary-coral)]"
                  disabled={submitting}
                  onClick={() => void handleWithdrawApplication()}
                  type="button"
                >
                  {t('fanEvent.applied.withdraw')}
                </button>
              ) : null}
            </div>
          ) : panel === 'error' ? (
            <div className="mt-[34px] border-t border-[var(--color-divider)] pt-[26px]" role="alert">
              <h2 className="text-2xl font-black tracking-[-0.038em] text-[var(--color-error)]">
                {t('fanEvent.failed.title')}
              </h2>
              <p className="mt-3 text-base font-medium leading-[1.7] text-[var(--color-text-body)]">
                {submitError}
              </p>
              <button
                className="mj-font-emphasis mt-6 min-h-14 w-full rounded-[10px] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-[17px] text-white transition-colors hover:bg-[var(--color-primary-coral-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting}
                onClick={() => void handleSubmitApplication()}
                type="button"
              >
                {t('fanEvent.failed.retry')}
              </button>
            </div>
          ) : panel === 'closed' ? (
            <div className="mt-[34px] border-t border-[var(--color-divider)] pt-[26px]">
              <h2 className="text-2xl font-black tracking-[-0.038em]">{t('fanEvent.closed.title')}</h2>
              <p className="mt-3 text-base font-medium leading-[1.7] text-[var(--color-text-body)]">
                {t('fanEvent.closed.description')}
              </p>
              <button
                className="mj-font-emphasis mt-6 min-h-14 w-full cursor-not-allowed rounded-[10px] border border-[var(--color-border-control)] bg-[var(--color-surface-subtle)] text-[17px] text-[var(--color-text-muted)]"
                disabled
                type="button"
              >
                {t('fanEvent.closed.cta')}
              </button>
              <Link
                className="mj-font-label mt-4 block text-center text-[15px] text-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral-hover)]"
                to="/fan/events"
              >
                {t('fanEvent.closed.next')}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto w-[min(100%-40px,1240px)] pb-[72px] pt-14 min-[1081px]:w-[min(100%-88px,1240px)]">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_460px] lg:gap-[72px]">
          <section>
            <h2 className="text-[22px] font-extrabold tracking-[-0.032em]">{t('fanEvent.about')}</h2>
            <div className="mt-4 grid gap-3">
              {descriptionParagraphs.map((paragraph) => (
                <p
                  className="max-w-[56ch] text-lg font-medium leading-[1.8] text-[var(--color-text-body)] [text-wrap:pretty]"
                  key={paragraph}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
          <section aria-label={t('fanEvent.scheduleAria')}>
            <div className="border-t-2 border-[var(--color-text-primary)] pt-[18px]">
              <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('fanEvent.applicationEnd')}</p>
              <p className="mt-1.5 text-[26px] font-black tracking-[-0.035em] tabular-nums">
                {applicationEndAt ? formatDateTime(applicationEndAt) : '-'}
              </p>
            </div>
            <div className="mt-[22px] border-t border-[var(--color-divider)] pt-[18px]">
              <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('fanEvent.resultAnnounce')}</p>
              <p className="mt-1.5 text-[26px] font-black tracking-[-0.035em] tabular-nums">
                {resultAt ? formatDateTime(resultAt) : '-'}
              </p>
            </div>
            <p className="mt-[22px] border-t border-[var(--color-divider)] pt-4 text-base font-medium tabular-nums text-[var(--color-text-muted)]">
              {t('fanEvent.capacity', { count: meeting.application.capacity })}
            </p>
          </section>
        </div>

        <div className="mt-14 grid items-start gap-10 border-t border-[var(--color-divider)] pt-9 lg:grid-cols-[1fr_460px] lg:gap-[72px]">
          <section>
            <h2 className="text-base font-extrabold tracking-[-0.025em]">{t('fanEvent.conditions')}</h2>
            <ul className="mt-3 list-disc pl-[18px] text-base font-medium leading-[1.85] text-[var(--color-text-muted)]">
              {participationConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-base font-extrabold tracking-[-0.025em]">{t('fanEvent.cautions')}</h2>
            <ul className="mt-3 list-disc pl-[18px] text-base font-medium leading-[1.85] text-[var(--color-text-muted)]">
              {cautions.map((caution) => (
                <li key={caution}>{caution}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <Dialog
        description={
          applicationEndAt
            ? t('fanEvent.confirm.description', {
                date: formatShortDateTime(applicationEndAt),
              })
            : undefined
        }
        footer={
          <>
            <Button disabled={submitting} onClick={() => setConfirmOpen(false)} variant="secondary">
              {t('fanEvent.confirm.cancel')}
            </Button>
            <Button
              loading={submitting}
              onClick={() => {
                void handleSubmitApplication().finally(() => setConfirmOpen(false))
              }}
            >
              {t('fanEvent.confirm.ok')}
            </Button>
          </>
        }
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={t('fanEvent.confirm.title')}
      />
    </div>
  )
}
