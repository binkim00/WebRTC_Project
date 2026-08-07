import { ArrowLeft } from '@phosphor-icons/react'
import { parseServerDate } from '../../api/serverTime'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import {
  CALL_DURATION_MAX_MINUTES,
  CALL_DURATION_MIN_MINUTES,
  callDurationSecToMinutesInput,
  formatCallDuration,
  minutesInputToCallDurationSec,
  validateCallDurationSec,
} from './callDuration'
import { saveApplicationForm } from '../../api/applications'
import { attachmentContentUrl, uploadAttachment } from '../../api/attachments'
import { getAuthSession } from '../../api/authSession'
import { forceEndCallSession } from '../../api/callSessions'
import type { PageResponse } from '../../api/envelope'
import { downloadExternalParticipantCsvTemplate } from '../../api/externalParticipants'
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
import {
  createEvent,
  publishFanMeeting,
  updateFanMeeting,
  type FanMeetingForm,
  type ParticipantSelectionType,
} from '../../api/managerOperations'
import {
  createMeetingNotice,
  deleteMeetingNotice,
  getMeetingNotice,
  getMeetingNotices,
  updateMeetingNotice,
  NOTICE_ATTACHMENT_MAX_COUNT,
  type NoticeAttachmentResponse,
  type NoticeDetailResponse,
  type NoticeSummaryResponse,
} from '../../api/notices'
import { getMyOrganization, type OrganizationMember } from '../../api/organizations'
import { AlertBanner, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Dialog, Pagination, Select, Spinner, Switch, TextField, Textarea } from '../../components'
import {
  deriveScheduleDefaults,
  formatDateTime,
  getScheduleErrors,
  toApiLocalDateTime,
  toErrorMessage,
} from './meetingLifecycle'
import {
  createInitialMeetingForm,
  clearMeetingCreateLocalDraft,
  hasMeaningfulMeetingDraft,
  nextDraftQuestionKey,
  readMeetingCreateLocalDraft,
  writeMeetingCreateLocalDraft,
  type DraftFormQuestion,
  type MeetingCreateLocalDraft,
} from './managerMeetingCreateDraft'
import { translate, useTranslation } from '../../i18n'

/** 매니저 페이지의 제목, 설명, 선택적 뒤로가기 링크를 같은 형태로 표시한다. */
function PageHeader({ eyebrow, title, description, backTo }: { eyebrow?: string; title: string; description: string; backTo?: string }) {
  const { t } = useTranslation()
  return (
    <header className="grid gap-2">
      {backTo ? <Link className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary-coral)]" to={backTo}><ArrowLeft size={17} /> {t('managerRoutePages.t1')}</Link> : null}
      {eyebrow ? <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-primary-coral)]">{eyebrow}</p> : null}
      <h1 className="text-4xl font-black tracking-[-0.055em]">{title}</h1>
      <p className="text-[var(--color-text-secondary)]">{description}</p>
    </header>
  )
}

/** 단계형 입력 폼에서 현재 단계와 완료 단계를 시각적으로 표시한다. */
function Stepper({ step, labels, onStepChange, disabled = false }: { step: number; labels: string[]; onStepChange: (step: number) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <ol
      aria-label={t('managerRoutePages.t2')}
      className="grid grid-cols-2 gap-y-5 border-b border-[var(--color-divider)] pb-6 sm:grid-cols-5"
    >
      {labels.map((label, index) => {
        const active = index === step
        const done = index < step
        return (
          <li className="relative min-w-0" key={label}>
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={`absolute left-0 right-1/2 top-4 mr-5 hidden h-0.5 sm:block ${done || active ? 'bg-[var(--color-primary-coral)]' : 'bg-[var(--color-divider)]'}`}
              />
            ) : null}
            {index < labels.length - 1 ? (
              <span
                aria-hidden="true"
                className={`absolute left-1/2 right-0 top-4 ml-5 hidden h-0.5 sm:block ${done ? 'bg-[var(--color-primary-coral)]' : 'bg-[var(--color-divider)]'}`}
              />
            ) : null}
            <button
              aria-current={active ? 'step' : undefined}
              className="relative grid min-h-11 w-full justify-items-center gap-2.5 px-2"
              disabled={disabled}
              onClick={() => onStepChange(index)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`grid size-9 place-items-center rounded-full border-2 text-sm font-extrabold ${
                  done
                    ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white'
                    : active
                      ? 'border-[var(--color-primary-coral)] bg-[var(--color-surface-panel)] text-[var(--color-primary-coral)]'
                      : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-muted)]'
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`whitespace-nowrap text-sm ${active ? 'font-extrabold text-[var(--color-primary-coral)]' : done ? 'font-semibold text-[var(--color-text-primary)]' : 'font-semibold text-[var(--color-text-muted)]'}`}
              >
                {label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** 단계형 폼의 이전 단계와 다음 단계 버튼을 공통 배치한다. */
function FormActions({ onBack, nextLabel, nextDisabled = false, nextLoading = false, disabledReason }: { onBack?: () => void; nextLabel?: string; nextDisabled?: boolean; nextLoading?: boolean; disabledReason?: string }) {
  const { t } = useTranslation()
  // 파라미터 기본값은 훅보다 먼저 평가되므로 기본 문구는 본문에서 정한다.
  const nextLabelResolved = nextLabel ?? t('managerRoutePages.t144')
  return (
    <div className="border-t border-[var(--color-divider)] pt-5">
      <div className="flex flex-wrap justify-end gap-2">
          {onBack ? (
            <Button disabled={nextLoading} onClick={onBack} variant="outline">
              {t('managerRoutePages.t3')}
            </Button>
          ) : null}
          <Button disabled={nextDisabled} loading={nextLoading} type="submit">
            {nextLabelResolved}
          </Button>
      </div>
      {nextDisabled && disabledReason ? (
        <p className="mt-3 text-sm font-medium text-[var(--color-text-muted)]" role="status">
          {disabledReason}
        </p>
      ) : null}
    </div>
  )
}

/** 생성 폼 값을 공통 일정 검증 입력 형태로 바꾼다. */
function toScheduleInput(form: FanMeetingForm) {
  return {
    scheduledStartAt: form.scheduledStartAt,
    applicationEnabled: form.application.enabled,
    applicationStartAt: form.application.startAt,
    applicationEndAt: form.application.endAt,
    resultAnnouncementAt: form.application.resultAnnouncementAt,
    queueOpenAt: form.operation.queueOpenAt,
  }
}

/** 예정 팬미팅과 대기열 시작 시간의 선후 관계를 검사하고 오류 메시지를 반환한다. */
function validateMeetingSchedule(form: FanMeetingForm): string | undefined {
  const scheduledStart = parseServerDate(form.scheduledStartAt)
  const queueOpen = parseServerDate(form.operation.queueOpenAt)

  const minimumStart = new Date(Date.now() + 60_000)

  if (Number.isNaN(scheduledStart.getTime()) || scheduledStart <= minimumStart) {
    return translate('managerRoutePages.t292')
  }

  return (
    getScheduleErrors(toScheduleInput(form))[0] ??
    (Number.isNaN(queueOpen.getTime())
      ? translate('managerRoutePages.t293')
      : undefined)
  )
}

/** Date를 datetime-local 입력값(YYYY-MM-DDTHH:mm)으로 바꾼다. */
function toLocalInputValue(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 시작 일시 기준의 추천 시각을 한 번에 채우는 선택 버튼 줄이다.
 *
 * 생성 마법사에 날짜 입력이 다섯 곳(시작·대기열 오픈·응모 시작·마감·발표)이라 달력에서
 * 하나하나 고르기 번거롭다는 피드백을 반영했다. 값을 몰래 채우지 않고 "시작 30분 전" 같은
 * 버튼을 눌러 직접 고르게 한다. 시작 일시를 아직 정하지 않았으면 버튼을 잠근다.
 */
function SchedulePresetChips({
  options,
  disabled,
  disabledReason,
  onPick,
}: {
  options: readonly { label: string; value: string }[]
  disabled?: boolean
  disabledReason?: string
  onPick: (value: string) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {options.map((option) => (
        <button
          className="inline-flex min-h-8 items-center whitespace-nowrap rounded-full border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-3 text-[13px] font-bold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)] disabled:cursor-not-allowed disabled:border-[var(--color-divider)] disabled:text-[var(--color-text-tertiary)]"
          disabled={disabled}
          key={option.label}
          onClick={() => onPick(option.value)}
          title={disabled ? disabledReason : undefined}
          type="button"
        >
          {option.label}
        </button>
      ))}
      {disabled && disabledReason ? (
        <span className="text-[13px] font-medium text-[var(--color-text-muted)]">
          {disabledReason}
        </span>
      ) : null}
    </div>
  )
}

/** 백엔드가 허용하는 응모 질문 최대 개수다. */
const MAX_DRAFT_QUESTIONS = 10

/** 생성 마법사의 단계 라벨과 각 단계의 제목이다. */
const STEP_LABELS = () => [translate('managerRoutePages.t294'), translate('managerRoutePages.t295'), translate('managerRoutePages.t296'), translate('managerRoutePages.t297'), translate('managerRoutePages.t298')]
const STEP_TITLES = () => [
  translate('managerRoutePages.t299'),
  translate('managerRoutePages.t300'),
  translate('managerRoutePages.t301'),
  translate('managerRoutePages.t302'),
  translate('managerRoutePages.t303'),
]
const LAST_STEP = STEP_LABELS().length - 1
const LOCAL_DRAFT_SAVE_DELAY_MS = 500

/**
 * 팬미팅 한 건을 처음부터 끝까지 한 번에 등록하는 생성 마법사다.
 *
 * 백엔드에는 홍보·응모용 객체와 팬미팅 객체가 따로 없으므로 화면도 하나로 두고,
 * 팬미팅 정보 → 영상통화 운영 → 이벤트 정보 → 응모 설정·폼 → 최종 확인 순서로 값을 모아 저장한다.
 */
export function ManagerMeetingCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = getAuthSession()
  const isInfluencerAccount = session?.role === 'INFLUENCER' || session?.role === 'SOLO_INFLUENCER'
  const resolvedInfluencerId = isInfluencerAccount ? session?.userId : undefined
  const influencerNickname = isInfluencerAccount ? session?.nickname : undefined
  // 새로고침 직후 첫 렌더부터 로컬 초안을 사용해 빈 폼이 초안을 덮어쓰지 않게 한다.
  //
  // useRef의 인자는 첫 렌더에서만 쓰이지만 **매 렌더마다 평가**되므로, 여기서 직접
  // readMeetingCreateLocalDraft를 호출하면 렌더마다 localStorage 읽기·JSON 파싱이 반복되고
  // 손상된 초안일 때는 removeItem 부작용까지 매번 실행된다. 지연 초기화로 한 번만 읽는다.
  const restoredLocalDraftRef = useRef<MeetingCreateLocalDraft | undefined>(undefined)
  const restoredDraftLoadedRef = useRef(false)
  if (!restoredDraftLoadedRef.current) {
    restoredDraftLoadedRef.current = true
    restoredLocalDraftRef.current = readMeetingCreateLocalDraft(session?.userId)
  }
  const restoredLocalDraft = restoredLocalDraftRef.current
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FanMeetingForm>(() => {
    if (!restoredLocalDraft) return createInitialMeetingForm(resolvedInfluencerId)
    const restoredForm = {
      ...restoredLocalDraft.form,
      operation: { ...restoredLocalDraft.form.operation, earlyStartMinutes: null },
    }
    return isInfluencerAccount && resolvedInfluencerId
      ? { ...restoredForm, influencerId: resolvedInfluencerId }
      : restoredForm
  })
  // 참가자를 정하는 방식이며 이전 로컬 초안에는 없을 수 있어 기본값으로 채운다.
  const selectionType: ParticipantSelectionType = form.participantSelectionType ?? 'APPLICATION'

  // "시작 30분 전" 같은 추천 시각 버튼의 계산 기준이다. 시작 일시를 정하기 전에는 버튼을 잠근다.
  const scheduledStartDate = new Date(form.scheduledStartAt)
  const hasScheduledStart =
    Boolean(form.scheduledStartAt) && !Number.isNaN(scheduledStartDate.getTime())
  /**
   * 시작 일시에서 ms만큼 앞선 시각이다.
   *
   * 과거가 되면 "지금"이 아니라 10분 뒤로 끌어올린다. 정확히 현재 시각으로 채우면 남은
   * 단계를 작성하는 사이 과거가 되어 생성 요청이 거절되기 쉽다.
   */
  const presetBeforeStart = (ms: number) => {
    if (!hasScheduledStart) return ''
    const derived = new Date(scheduledStartDate.getTime() - ms)
    const floor = new Date(Date.now() + 10 * 60 * 1000)
    return toLocalInputValue(derived > floor ? derived : floor)
  }

  // 예정 일시를 입력하면 비어 있는 나머지 일정을 자동으로 채웠음을 알리는 안내다.
  const [scheduleAutoFilled, setScheduleAutoFilled] = useState(false)

  /**
   * 예정 일시가 바뀔 때 아직 비어 있는 일정(응모 시작·마감, 발표, 대기열 오픈)을
   * 추천값으로 채운다. 이미 값이 있는 필드는 절대 덮어쓰지 않으므로 직접 고른 시각은 유지된다.
   * 응모 관련 시각은 응모를 받는 방식일 때만 채운다.
   */
  const handleScheduledStartChange = (value: string) => {
    const defaults = deriveScheduleDefaults(value)
    if (!defaults) {
      setScheduleAutoFilled(false)
      setForm({ ...form, scheduledStartAt: value })
      return
    }

    let didFill = false
    const application = { ...form.application }
    if (form.application.enabled && selectionType === 'APPLICATION') {
      if (!application.startAt) {
        application.startAt = defaults.applicationStartAt
        didFill = true
      }
      if (!application.endAt) {
        application.endAt = defaults.applicationEndAt
        didFill = true
      }
      if (!application.resultAnnouncementAt) {
        application.resultAnnouncementAt = defaults.resultAnnouncementAt
        didFill = true
      }
    }
    const operation = { ...form.operation }
    if (!operation.queueOpenAt) {
      operation.queueOpenAt = defaults.queueOpenAt
      didFill = true
    }

    setScheduleAutoFilled(didFill)
    setForm({ ...form, scheduledStartAt: value, application, operation })
  }
  const [downloadingTemplate, setDownloadingTemplate] = useState(false)
  const [templateDownloadError, setTemplateDownloadError] = useState<string>()

  /** 명단 CSV 양식을 내려받아 브라우저 다운로드로 저장한다. 팬미팅 생성 전에도 받을 수 있다. */
  async function handleDownloadCsvTemplate() {
    const token = getAuthSession()?.accessToken
    if (!token || downloadingTemplate) return

    setDownloadingTemplate(true)
    setTemplateDownloadError(undefined)
    try {
      const { blob, fileName } = await downloadExternalParticipantCsvTemplate(token)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch (reason) {
      setTemplateDownloadError(
        reason instanceof Error ? reason.message : t('managerRoutePages.t145'),
      )
    } finally {
      setDownloadingTemplate(false)
    }
  }

  const [createdMeetingId, setCreatedMeetingId] = useState<number | undefined>(
    restoredLocalDraft?.createdMeetingId,
  )
  const [createdMeetingStatus, setCreatedMeetingStatus] = useState<
    'DRAFT' | 'PUBLISHED' | undefined
  >(restoredLocalDraft?.createdMeetingId ? 'DRAFT' : undefined)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [errorTitle, setErrorTitle] = useState(t('managerRoutePages.t146'))
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [readyToPublish, setReadyToPublish] = useState(false)
  const [questionDeleteTarget, setQuestionDeleteTarget] = useState<number>()
  const [newStartDialogOpen, setNewStartDialogOpen] = useState(false)
  const [organizationInfluencers, setOrganizationInfluencers] = useState<OrganizationMember[]>([])

  useEffect(() => {
    if (isInfluencerAccount || !session?.accessToken) return

    getMyOrganization(session.accessToken)
      .then((organization) => {
        setOrganizationInfluencers(
          organization?.members.filter((member) => member.userRole === 'INFLUENCER') ?? [],
        )
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : t('managerRoutePages.t147'))
      })
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInfluencerAccount, session?.accessToken])
  // 응모 폼은 팬미팅 생성 응답의 meetingId가 나온 뒤에야 저장할 수 있어 마법사 안에 상태로 들고 있는다.
  const [questions, setQuestions] = useState<DraftFormQuestion[]>(
    restoredLocalDraft?.questions ?? [],
  )
  const [formDescription, setFormDescription] = useState(
    restoredLocalDraft?.formDescription ?? '',
  )
  const nextQuestionKey = useRef(
    nextDraftQuestionKey(restoredLocalDraft?.questions ?? []),
  )
  const [localDraftState, setLocalDraftState] = useState<
    'idle' | 'restored' | 'saving' | 'saved' | 'error'
  >(restoredLocalDraft ? 'restored' : 'idle')
  const [localDraftSavedAt, setLocalDraftSavedAt] = useState<string | undefined>(
    restoredLocalDraft?.savedAt,
  )
  /**
   * 서버 저장이 실패한 뒤 브라우저 임시 저장을 중단한 상태다.
   *
   * 실패한 시도가 초안을 남기면 다음 방문에서 그 초안이 복구되고, 초안에 담긴 createdMeetingId
   * 때문에 새 팬미팅을 만들 수 없는 상태로 이어진다. 그래서 실패하면 저장된 초안을 지우고
   * 더 이상 기록하지 않는다. 화면의 입력값은 그대로 두어 바로 고쳐 다시 시도할 수 있다.
   */
  const [localDraftBlocked, setLocalDraftBlocked] = useState(false)
  /** 초안을 버린 직후 복구 배너를 숨기기 위한 표시다. */
  const [localDraftDiscarded, setLocalDraftDiscarded] = useState(false)
  /** 복구된 초안이 가리키던 팬미팅을 더 이상 수정할 수 없어 연결을 끊었을 때의 안내다. */
  const [staleDraftLinkNotice, setStaleDraftLinkNotice] = useState<string>()
  const allowNavigationRef = useRef(false)
  // 통화 시간은 분 단위로 입력받고 초로 저장한다. 입력 도중의 빈 문자열·소수점을
  // 초로 환산할 수 없으므로 표시용 문자열을 별도 상태로 둔다.
  const [callDurationMinutesInput, setCallDurationMinutesInput] = useState(() =>
    callDurationSecToMinutesInput(form.operation.callDurationSec),
  )
  const callDurationError = validateCallDurationSec(
    minutesInputToCallDurationSec(callDurationMinutesInput),
  )

  /**
   * 브라우저 임시 초안을 버리고 마법사를 처음 상태로 되돌린다.
   *
   * 복구된 초안에는 이미 만들어 둔 팬미팅의 createdMeetingId가 담길 수 있다. 그 값이 남아 있으면
   * 저장 시 createEvent(신규 생성) 대신 updateFanMeeting(기존 수정)으로 분기하므로,
   * 아무리 새로 입력해도 **새 팬미팅이 만들어지지 않는다.** 그래서 초안을 버릴 때는
   * createdMeetingId까지 반드시 함께 비워야 한다.
   *
   * 마법사가 들고 있는 초안 관련 상태를 하나도 남기지 않고 초기화한다.
   */
  function discardLocalDraft() {
    clearMeetingCreateLocalDraft(session?.userId)

    const emptyForm = createInitialMeetingForm(resolvedInfluencerId)
    setStep(0)
    setForm(emptyForm)
    setCallDurationMinutesInput(callDurationSecToMinutesInput(emptyForm.operation.callDurationSec))
    setQuestions([])
    setFormDescription('')
    nextQuestionKey.current = 1
    // 이 두 값을 비워야 다음 저장이 신규 생성으로 분기한다.
    setCreatedMeetingId(undefined)
    setCreatedMeetingStatus(undefined)
    setLocalDraftState('idle')
    setLocalDraftSavedAt(undefined)
    setLocalDraftBlocked(false)
    setLocalDraftDiscarded(true)
    setError(undefined)
    setErrorTitle(t('managerRoutePages.t148'))
    // 마운트 시 한 번 읽은 복구 초안도 비워 복구 배너가 남지 않게 한다.
    restoredLocalDraftRef.current = undefined
    setStaleDraftLinkNotice(undefined)
  }

  /**
   * 복구된 초안이 가리키는 팬미팅이 아직 이 마법사가 수정해도 되는 대상인지 확인한다.
   *
   * 초안에 담긴 createdMeetingId는 저장 분기를 createEvent(신규)에서 updateFanMeeting(수정)으로
   * 바꾼다. 그런데 그 팬미팅은 그동안 다른 화면에서 삭제되었거나 이미 발행·진행·종료되었을 수 있고,
   * 복구 시점에는 서버 상태를 확인하지 않고 무조건 'DRAFT'로 단정했다. 그 결과 두 가지 사고가 났다.
   *
   * 1. 삭제된 팬미팅을 계속 PATCH해 저장이 영구히 실패하는 교착
   * 2. 이미 팬에게 공개된 팬미팅을 새 팬미팅 내용으로 조용히 덮어쓰는 사고
   *    (응모 폼도 전체 교체되어 기존 질문이 사라진다)
   *
   * 편집 가능한 DRAFT가 아니면 연결을 끊어 다음 저장이 신규 생성으로 흐르게 한다.
   */
  useEffect(() => {
    const linkedMeetingId = restoredLocalDraft?.createdMeetingId
    if (!linkedMeetingId) return

    const token = getAuthSession()?.accessToken
    if (!token) return

    const controller = new AbortController()

    const detachStaleLink = (message: string) => {
      setCreatedMeetingId(undefined)
      setCreatedMeetingStatus(undefined)
      setStaleDraftLinkNotice(message)
    }

    void fetchPublicFanMeetingDetail(linkedMeetingId, token, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return
        // 아직 초안이면 원래 의도대로 그 초안을 이어서 수정한다.
        if (detail.meeting.status === 'DRAFT') return

        detachStaleLink(
          t('managerRoutePages.t304', { p0: linkedMeetingId }),
        )
      })
      .catch(() => {
        if (controller.signal.aborted) return
        detachStaleLink(
          t('managerRoutePages.t305', { p0: linkedMeetingId }),
        )
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 초안 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredLocalDraft?.createdMeetingId])

  const scheduleErrors = getScheduleErrors(toScheduleInput(form))
  const applicationEndError = scheduleErrors.find((message) =>
    message.startsWith(t('managerRoutePages.t149')),
  )
  const resultAnnouncementError = scheduleErrors.find((message) =>
    message.startsWith(t('managerRoutePages.t150')),
  )
  const queueOpenError = scheduleErrors.find((message) =>
    message.startsWith(t('managerRoutePages.t151')),
  )
  const hasLocalDraftContent = hasMeaningfulMeetingDraft(
    form,
    questions,
    formDescription,
    step,
    createdMeetingId,
  )
  const shouldWarnOnLeave = hasLocalDraftContent && createdMeetingStatus !== 'PUBLISHED'
  const shouldWarnOnLeaveRef = useRef(shouldWarnOnLeave)
  shouldWarnOnLeaveRef.current = shouldWarnOnLeave
  const navigationBlocker = useBlocker(
    useCallback(
      () => !allowNavigationRef.current && shouldWarnOnLeaveRef.current,
      [],
    ),
  )

  /** 작성 내용은 서버에 보내지 않고 현재 로그인 사용자의 브라우저에만 자동 저장한다. */
  useEffect(() => {
    if (createdMeetingStatus === 'PUBLISHED') return
    // 저장에 실패한 뒤에는 초안을 남기지 않는다. 실패한 시도가 남긴 초안이 다음 방문을 막는다.
    if (localDraftBlocked) return

    if (!hasLocalDraftContent) {
      clearMeetingCreateLocalDraft(session?.userId)
      setLocalDraftState('idle')
      setLocalDraftSavedAt(undefined)
      return
    }

    setLocalDraftState('saving')
    const timer = window.setTimeout(() => {
      const savedAt = writeMeetingCreateLocalDraft(session?.userId, {
        step,
        form,
        questions,
        formDescription,
        createdMeetingId,
      })

      setLocalDraftState(savedAt ? 'saved' : 'error')
      if (savedAt) setLocalDraftSavedAt(savedAt)
    }, LOCAL_DRAFT_SAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [
    createdMeetingId,
    createdMeetingStatus,
    form,
    formDescription,
    hasLocalDraftContent,
    localDraftBlocked,
    questions,
    session?.userId,
    step,
  ])

  /** 브라우저 새로고침·탭 닫기에서도 작성 중임을 한 번 더 알린다. */
  useEffect(() => {
    if (!shouldWarnOnLeave) return

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // 일부 브라우저는 returnValue 지정이 있어야 기본 이탈 확인 창을 표시한다.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [shouldWarnOnLeave])

  /**
   * 팬미팅을 생성하거나 기존 초안을 갱신하고, 이어서 응모 폼까지 저장한다.
   *
   * 응모 폼은 별도 엔드포인트(`PUT /application-form`)라서 팬미팅 저장 뒤에 한 번 더 호출한다.
   */
  async function saveMeeting() {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setErrorTitle(t('managerRoutePages.t152'))
      setError(t('managerRoutePages.t153'))
      return
    }

    if (
      form.application.enabled &&
      questions.some((question) => !question.questionText.trim())
    ) {
      setErrorTitle(t('managerRoutePages.t154'))
      setError(t('managerRoutePages.t155'))
      return
    }

    if (questions.length > MAX_DRAFT_QUESTIONS) {
      setErrorTitle(t('managerRoutePages.t156'))
      setError(t('managerRoutePages.t306', { p0: MAX_DRAFT_QUESTIONS }))
      return
    }

    if (
      !form.application.enabled &&
      !(selectionType === 'EXTERNAL_SELECTION' &&
        Number.isInteger(form.application.capacity) &&
        form.application.capacity > 0)
    ) {
      setErrorTitle(t('managerRoutePages.t157'))
      setError(
        selectionType === 'EXTERNAL_SELECTION'
          ? t('managerRoutePages.t158')
          : t('managerRoutePages.t159'),
      )
      return
    }

    const invalidPolicyValue = [
      form.operation.reconnectGraceSec,
      form.operation.maxRecallCount,
    ].some((value) => value != null && (!Number.isInteger(value) || value < 0))
    if (invalidPolicyValue) {
      setErrorTitle(t('managerRoutePages.t160'))
      setError(t('managerRoutePages.t161'))
      return
    }

    const payload: FanMeetingForm = {
      ...form,
      participantSelectionType: selectionType,
      influencerId: resolvedInfluencerId ?? form.influencerId,
      description: form.description?.trim() || null,
      coverImageUrl: form.coverImageUrl?.trim() || null,
      scheduledStartAt: toApiLocalDateTime(form.scheduledStartAt),
      application: {
        ...form.application,
        startAt: form.application.enabled && form.application.startAt
          ? toApiLocalDateTime(form.application.startAt)
          : null,
        endAt: form.application.enabled && form.application.endAt
          ? toApiLocalDateTime(form.application.endAt)
          : null,
        resultAnnouncementAt:
          form.application.enabled && form.application.resultAnnouncementAt
            ? toApiLocalDateTime(form.application.resultAnnouncementAt)
            : null,
      },
      operation: {
        ...form.operation,
        queueOpenAt: toApiLocalDateTime(form.operation.queueOpenAt),
        earlyStartMinutes: null,
      },
    }

    if (!Number.isInteger(payload.influencerId) || payload.influencerId <= 0) {
      setErrorTitle(t('managerRoutePages.t162'))
      setError(t('managerRoutePages.t163'))
      return
    }

    const scheduleError = validateMeetingSchedule(payload)
    if (scheduleError) {
      setErrorTitle(t('managerRoutePages.t164'))
      setError(scheduleError)
      return
    }

    const durationError = validateCallDurationSec(payload.operation.callDurationSec)
    if (durationError) {
      setErrorTitle(t('managerRoutePages.t165'))
      setError(durationError)
      return
    }

    setSubmitting(true)
    setError(undefined)
    try {
      let meetingId = createdMeetingId

      if (!meetingId) {
        const created = await createEvent(payload, token)
        meetingId = created.meetingId
        setCreatedMeetingId(meetingId)
        setCreatedMeetingStatus('DRAFT')
      } else {
        await updateFanMeeting(meetingId, payload, token)
        setCreatedMeetingStatus('DRAFT')
      }

      // 저장이 성공했으므로 실패로 중단했던 임시 저장을 다시 켠다.
      setLocalDraftBlocked(false)

      // 응모를 사용할 때만 폼을 저장한다. 질문이 없어도 안내 문구는 남길 수 있다.
      if (form.application.enabled) {
        await saveApplicationForm(
          meetingId,
          {
            formDescription: formDescription.trim() || null,
            questions: questions.map((question, index) => ({
              questionId: question.questionId ?? null,
              questionText: question.questionText.trim(),
              questionType: question.questionType,
              required: question.required,
              displayOrder: index + 1,
            })),
          },
          token,
        )
      }

      await publishFanMeeting(meetingId, token)
      clearMeetingCreateLocalDraft(session?.userId)
      allowNavigationRef.current = true
      setCreatedMeetingStatus('PUBLISHED')
      // CSV 직접 등록은 발행 직후에만 명단을 올릴 수 있어(팬미팅이 PUBLISHED 상태일 때만
      // 허용) 일반 상세 화면 대신 명단 등록 화면으로 바로 보낸다.
      navigate(
        selectionType === 'EXTERNAL_SELECTION'
          ? `/manager/fan-meetings/${meetingId}/external-participants`
          : `/manager/fan-meetings/${meetingId}`,
      )
    } catch (reason) {
      setErrorTitle(t('managerRoutePages.t166'))
      setError(
        reason instanceof Error
          ? reason.message
          : t('managerRoutePages.t167'),
      )
      // 실패한 시도는 브라우저에 초안을 남기지 않는다. 남겨 두면 다음 방문에서 자동 복구되고,
      // 초안에 담긴 createdMeetingId 때문에 새 팬미팅을 만들 수 없는 상태가 된다.
      // 화면의 입력값은 유지하므로 값을 고쳐 바로 다시 시도할 수 있다.
      clearMeetingCreateLocalDraft(session?.userId)
      setLocalDraftBlocked(true)
      setLocalDraftState('idle')
      setLocalDraftSavedAt(undefined)
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * 앞 단계에서는 화면만 이동하고, 마지막 단계의 기본 제출은 저장 후 즉시 발행한다.
   */
  async function submit(event: React.FormEvent) {
    event.preventDefault()

    if (step < LAST_STEP) {
      if (step === 0 && !form.title.trim()) {
        setErrorTitle(t('managerRoutePages.t168'))
        setError(t('managerRoutePages.t169'))
        return
      }
      if (
        step === 0 &&
        (!Number.isInteger(resolvedInfluencerId ?? form.influencerId) ||
          (resolvedInfluencerId ?? form.influencerId) <= 0)
      ) {
        setErrorTitle(t('managerRoutePages.t170'))
        setError(t('managerRoutePages.t171'))
        return
      }
      if (step === 0 && !form.scheduledStartAt) {
        setErrorTitle(t('managerRoutePages.t172'))
        setError(t('managerRoutePages.t173'))
        return
      }
      if (step === 1 && callDurationError) {
        setErrorTitle(t('managerRoutePages.t174'))
        setError(callDurationError)
        return
      }
      if (step === 1 && !form.operation.queueOpenAt) {
        setErrorTitle(t('managerRoutePages.t175'))
        setError(t('managerRoutePages.t176'))
        return
      }
      if (
        step === 1 &&
        [
          form.operation.reconnectGraceSec,
          form.operation.maxRecallCount,
        ].some((value) => value != null && (!Number.isInteger(value) || value < 0))
      ) {
        setErrorTitle(t('managerRoutePages.t177'))
        setError(t('managerRoutePages.t178'))
        return
      }
      if (step === 1 && queueOpenError) {
        setErrorTitle(t('managerRoutePages.t179'))
        setError(queueOpenError)
        return
      }
      if (
        step === 3 &&
        selectionType === 'EXTERNAL_SELECTION' &&
        (!Number.isInteger(form.application.capacity) || form.application.capacity <= 0)
      ) {
        setErrorTitle(t('managerRoutePages.t180'))
        setError(t('managerRoutePages.t181'))
        return
      }
      if (step === 3 && selectionType === 'APPLICATION' && (!Number.isInteger(form.application.capacity) || form.application.capacity <= 0)) {
        setErrorTitle(t('managerRoutePages.t182'))
        setError(t('managerRoutePages.t183'))
        return
      }
      if (
        step === 3 &&
        selectionType === 'APPLICATION' &&
        (!form.application.startAt ||
          !form.application.endAt ||
          !form.application.resultAnnouncementAt)
      ) {
        setErrorTitle(t('managerRoutePages.t184'))
        setError(t('managerRoutePages.t185'))
        return
      }
      if (step === 3 && selectionType === 'APPLICATION' && questions.some((question) => !question.questionText.trim())) {
        setErrorTitle(t('managerRoutePages.t186'))
        setError(t('managerRoutePages.t187'))
        return
      }
      if (step === 3 && selectionType === 'APPLICATION' && scheduleErrors.length > 0) {
        setErrorTitle(t('managerRoutePages.t188'))
        setError(scheduleErrors[0])
        return
      }

      setError(undefined)
      setStep(step + 1)
      return
    }

    setPublishDialogOpen(true)
  }

  /** 새로 시작을 확인한 뒤 현재 작성 상태를 초기값으로 되돌린다. */
  function startNewMeeting() {
    clearMeetingCreateLocalDraft(session?.userId)
    setForm(createInitialMeetingForm(resolvedInfluencerId))
    setQuestions([])
    nextQuestionKey.current = 1
    setFormDescription('')
    setCreatedMeetingId(undefined)
    setCreatedMeetingStatus(undefined)
    setReadyToPublish(false)
    setLocalDraftSavedAt(undefined)
    setLocalDraftState('idle')
    setLocalDraftBlocked(false)
    setLocalDraftDiscarded(false)
    setStaleDraftLinkNotice(undefined)
    restoredLocalDraftRef.current = undefined
    setError(undefined)
    setStep(0)
    setNewStartDialogOpen(false)
  }

  /** 저장하지 않고 나가기를 확인하면 사용자가 선택한 이동을 계속한다. */
  function proceedBlockedNavigation() {
    if (navigationBlocker.state !== 'blocked') return

    // 저장 실패로 임시 저장을 중단한 상태라면 이탈할 때도 초안을 남기지 않는다.
    if (!localDraftBlocked) {
      writeMeetingCreateLocalDraft(session?.userId, {
        step,
        form,
        questions,
        formDescription,
        createdMeetingId,
      })
    }
    allowNavigationRef.current = true
    navigationBlocker.proceed()
  }

  /** 초안을 남기지 않고 이탈한다. 이렇게 나가면 다음 방문에서 빈 상태로 시작한다. */
  function discardAndLeave() {
    if (navigationBlocker.state !== 'blocked') return

    clearMeetingCreateLocalDraft(session?.userId)
    allowNavigationRef.current = true
    navigationBlocker.proceed()
  }

  const effectiveInfluencerId = resolvedInfluencerId ?? form.influencerId
  const basicInformationComplete = Boolean(
    form.title.trim() &&
      form.scheduledStartAt &&
      Number.isInteger(effectiveInfluencerId) &&
      effectiveInfluencerId > 0,
  )
  const operationPoliciesValid = [
    form.operation.reconnectGraceSec,
    form.operation.maxRecallCount,
  ].every((value) => value == null || (Number.isInteger(value) && value >= 0))
  const operationComplete = Boolean(
    !callDurationError &&
      form.operation.queueOpenAt &&
      operationPoliciesValid &&
      !queueOpenError,
  )
  const questionsComplete = questions.every((question) => question.questionText.trim())
  const capacityValid =
    Number.isInteger(form.application.capacity) && form.application.capacity > 0
  const applicationScheduleComplete = Boolean(
    capacityValid &&
      form.application.startAt &&
      form.application.endAt &&
      form.application.resultAnnouncementAt,
  )
  const externalSelectionComplete = capacityValid
  const applicationComplete =
    selectionType === 'EXTERNAL_SELECTION'
      ? externalSelectionComplete
      : applicationScheduleComplete && scheduleErrors.length === 0 && questionsComplete
  const publishReady =
    basicInformationComplete && operationComplete && applicationComplete && readyToPublish
  return (
    <div className="pb-10">
      <Link
        className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        to="/manager/fan-meetings"
      >
        {t('managerRoutePages.t4')}
      </Link>
      <h1 className="mj-font-title mt-3.5 text-[var(--service-page-title-size)] leading-tight tracking-[-0.035em] text-[var(--color-text-primary)]">
        {t('managerRoutePages.t5')}
      </h1>
      <p className="mt-2 text-base font-medium text-[var(--color-text-muted)]">
        {t('managerRoutePages.t6')}
      </p>

      <div className="mt-6.5">
        <Stepper labels={STEP_LABELS()} onStepChange={setStep} step={step} />
      </div>
      {localDraftState !== 'idle' || localDraftBlocked ? (
        <div
          className="mt-5 flex flex-col gap-5 rounded-[var(--radius-control)] border border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] p-5 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div className="min-w-0">
            <strong className="block text-lg font-extrabold text-[var(--color-text-primary)]">
              {localDraftBlocked
                ? t('managerRoutePages.t189')
                : localDraftState === 'error'
                  ? t('managerRoutePages.t190')
                  : t('managerRoutePages.t191')}
            </strong>
            <span className="mt-1 block text-sm font-medium text-[var(--color-text-muted)]">
              {localDraftBlocked
                ? t('managerRoutePages.t192')
                : localDraftState === 'error'
                  ? t('managerRoutePages.t193')
                  : localDraftState === 'saving'
                    ? t('managerRoutePages.t194')
                    : localDraftSavedAt
                      ? t('managerRoutePages.t307', { p0: formatDateTime(localDraftSavedAt) })
                      : t('managerRoutePages.t195')}
            </span>
          </div>
          <Button onClick={() => setNewStartDialogOpen(true)} variant="outline">
            {t('managerRoutePages.t7')}
          </Button>
        </div>
      ) : null}

      {restoredLocalDraft ? (
        <AlertBanner className="mt-4" title={t('managerRoutePages.t8')} variant="success">
          <p>
            {formatDateTime(restoredLocalDraft.savedAt)}{t('managerRoutePages.t9')} {restoredLocalDraft.step + 1}{t('managerRoutePages.t10')}
            {restoredLocalDraft.createdMeetingId
              ? t('managerRoutePages.t308', { p0: restoredLocalDraft.createdMeetingId })
              : ''}
          </p>
          {/* 초안을 버릴 수단이 없으면 복구된 createdMeetingId 때문에 새 팬미팅을 만들 수 없다. */}
          <div className="mt-3">
            <Button onClick={discardLocalDraft} size="sm" variant="secondary">
              {t('managerRoutePages.t11')}
            </Button>
          </div>
        </AlertBanner>
      ) : localDraftDiscarded ? (
        <AlertBanner className="mt-4" title={t('managerRoutePages.t12')} variant="info">
          {t('managerRoutePages.t13')}
        </AlertBanner>
      ) : null}

      {staleDraftLinkNotice ? (
        <AlertBanner className="mt-4" title={t('managerRoutePages.t14')} variant="warning">
          {staleDraftLinkNotice}
        </AlertBanner>
      ) : null}
      <form className="grid gap-5" onSubmit={submit}>
        <fieldset className="contents">
          <legend className="sr-only">{t('managerRoutePages.t15')}</legend>
        <section aria-labelledby={`meeting-create-step-${step}`} className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h2
                className="text-2xl font-extrabold tracking-[-0.032em] text-[var(--color-text-primary)]"
                id={`meeting-create-step-${step}`}
              >
                {STEP_TITLES()[step] ?? t('managerRoutePages.t196')}
              </h2>
              <p className="mt-2 text-sm font-medium text-[var(--color-text-muted)]">
                {step === 0
                  ? t('managerRoutePages.t197')
                  : step === 1
                    ? t('managerRoutePages.t198')
                    : step === 2
                      ? t('managerRoutePages.t199')
                      : step === 3
                        ? t('managerRoutePages.t200')
                        : t('managerRoutePages.t201')}
              </p>
            </div>
            {step === 0 ? (
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                <span className="font-extrabold text-[var(--color-primary-coral)]">*</span> {t('managerRoutePages.t16')}
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            {step === 0 ? (
              <div className="grid items-start gap-5 sm:grid-cols-2">
                <TextField label={t('managerRoutePages.t17')} maxLength={200} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} helperText={t('managerRoutePages.t18')} />
                <div>
                  <TextField
                    label={t('managerRoutePages.t19')}
                    required
                    type="datetime-local"
                    value={form.scheduledStartAt}
                    onChange={(event) => handleScheduledStartChange(event.target.value)}
                  />
                  {scheduleAutoFilled ? (
                    <p className="mt-2 text-sm font-medium text-[var(--color-success)]" role="status">
                      {t('managerCreate.autoFill.notice')}
                    </p>
                  ) : null}
                </div>
                <div>
                  {isInfluencerAccount ? (
                    <div className="grid gap-2">
                      <span className="text-sm font-bold text-[var(--color-text-primary)]">{t('managerRoutePages.t20')} <span className="text-[var(--color-primary-coral)]">*</span></span>
                      <div className="flex min-h-[var(--control-height)] items-center justify-between gap-4 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-[var(--control-padding-inline)]">
                        <strong className="font-semibold text-[var(--color-text-primary)]">{influencerNickname}</strong>
                        <span className="text-sm font-bold text-[var(--color-success)]" role="status">
                          {t('managerRoutePages.t21')}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[var(--color-text-muted)]">{t('managerRoutePages.t22')}</p>
                    </div>
                  ) : (
                    <Select
                      helperText={organizationInfluencers.length > 0 ? t('managerRoutePages.t202') : t('managerRoutePages.t203')}
                      label={t('managerRoutePages.t23')}
                      options={organizationInfluencers.map((member) => ({
                        value: String(member.userId),
                        label: t('managerRoutePages.t309', { p0: member.nickname, p1: member.userId }),
                      }))}
                      placeholder={t('managerRoutePages.t24')}
                      required
                      value={form.influencerId ? String(form.influencerId) : ''}
                      onChange={(event) => setForm({ ...form, influencerId: Number(event.target.value) })}
                    />
                  )}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <Textarea
                  containerClassName="sm:col-span-2"
                  label={t('managerRoutePages.t25')}
                  value={form.description ?? ''}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder={t('managerRoutePages.t26')}
                />
                <TextField
                  containerClassName="sm:col-span-2"
                  helperText={t('managerRoutePages.t27')}
                  label={t('managerRoutePages.t28')}
                  maxLength={2048}
                  type="url"
                  value={form.coverImageUrl ?? ''}
                  onChange={(event) => setForm({ ...form, coverImageUrl: event.target.value })}
                  placeholder="https://example.com/cover.jpg"
                />
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-7">
                <section aria-labelledby="meeting-time-settings" className="grid gap-5">
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--color-text-primary)]" id="meeting-time-settings">
                      {t('managerRoutePages.t29')}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {t('managerRoutePages.t30')}
                    </p>
                  </div>
                  <div className="grid items-start gap-5">
                    <TextField
                      endAdornment={
                        <span className="pr-3 text-sm text-[var(--color-text-muted)]">{t('managerRoutePages.t31')}</span>
                      }
                      error={callDurationError}
                      helperText={t('managerRoutePages.t310', { p0: CALL_DURATION_MIN_MINUTES, p1: CALL_DURATION_MAX_MINUTES })}
                      label={t('managerRoutePages.t32')}
                      max={CALL_DURATION_MAX_MINUTES}
                      min={CALL_DURATION_MIN_MINUTES}
                      required
                      step={1}
                      type="number"
                      value={callDurationMinutesInput}
                      onChange={(event) => {
                        // 입력 중 빈 문자열을 초로 되돌릴 수 없으므로 표시용 문자열을 따로 들고 있는다.
                        setCallDurationMinutesInput(event.target.value)
                        const seconds = minutesInputToCallDurationSec(event.target.value)
                        if (seconds !== undefined) {
                          setForm({
                            ...form,
                            operation: { ...form.operation, callDurationSec: seconds },
                          })
                        }
                      }}
                    />
                  </div>
                </section>

                <section aria-labelledby="queue-settings" className="grid gap-5 border-t border-[var(--color-divider)] pt-5">
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--color-text-primary)]" id="queue-settings">
                      {t('managerRoutePages.t33')}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {t('managerRoutePages.t34')}
                    </p>
                  </div>
                  <div className="grid items-start gap-5 sm:grid-cols-2">
                    <div>
                      <TextField
                        error={queueOpenError}
                        helperText={t('managerRoutePages.t35')}
                        label={
                          <span className="inline-flex items-center gap-2">
                            {t('managerRoutePages.t36')}
                            <span className="rounded-[var(--radius-control)] bg-[var(--color-primary-coral-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-primary-coral)]">
                              {t('managerRoutePages.t37')}
                            </span>
                          </span>
                        }
                        required
                        reserveMessageSpace
                        type="datetime-local"
                        value={form.operation.queueOpenAt}
                        onChange={(event) => setForm({ ...form, operation: { ...form.operation, queueOpenAt: event.target.value } })}
                      />
                      <SchedulePresetChips
                        disabled={!hasScheduledStart}
                        disabledReason={t('managerCreate.preset.needStart')}
                        onPick={(value) =>
                          setForm({ ...form, operation: { ...form.operation, queueOpenAt: value } })
                        }
                        options={[
                          { label: t('managerCreate.preset.minutesBefore', { p0: 30 }), value: presetBeforeStart(30 * 60 * 1000) },
                          { label: t('managerCreate.preset.hoursBefore', { p0: 1 }), value: presetBeforeStart(60 * 60 * 1000) },
                          { label: t('managerCreate.preset.hoursBefore', { p0: 2 }), value: presetBeforeStart(2 * 60 * 60 * 1000) },
                        ]}
                      />
                    </div>
                  </div>
                </section>

                <section aria-labelledby="connection-settings" className="grid gap-5 border-t border-[var(--color-divider)] pt-5">
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--color-text-primary)]" id="connection-settings">
                      {t('managerRoutePages.t38')}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {t('managerRoutePages.t39')}
                    </p>
                  </div>
                  <div className="grid items-start gap-5 sm:grid-cols-2">
                    <TextField
                      className="pr-44"
                      endAdornment={<span className="whitespace-nowrap px-3 text-sm text-[var(--color-text-muted)]">{t('managerRoutePages.t40')}</span>}
                      helperText={t('managerRoutePages.t41')}
                      label={t('managerRoutePages.t42')}
                      min={0}
                      onChange={(event) => setForm({
                        ...form,
                        operation: {
                          ...form.operation,
                          reconnectGraceSec: event.target.value === '' ? null : Number(event.target.value),
                        },
                      })}
                      step={1}
                      type="number"
                      value={form.operation.reconnectGraceSec ?? ''}
                    />
                    <TextField
                      className="pr-40"
                      endAdornment={<span className="whitespace-nowrap px-3 text-sm text-[var(--color-text-muted)]">{t('managerRoutePages.t43')}</span>}
                      helperText={t('managerRoutePages.t44')}
                      label={t('managerRoutePages.t45')}
                      min={0}
                      onChange={(event) => setForm({
                        ...form,
                        operation: {
                          ...form.operation,
                          maxRecallCount: event.target.value === '' ? null : Number(event.target.value),
                        },
                      })}
                      step={1}
                      type="number"
                      value={form.operation.maxRecallCount ?? ''}
                    />
                  </div>
                </section>

                <section aria-labelledby="media-settings" className="grid gap-5 border-t border-[var(--color-divider)] pt-5">
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--color-text-primary)]" id="media-settings">
                      {t('managerRoutePages.t46')}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {t('managerRoutePages.t47')}
                    </p>
                  </div>
                  <div className="grid items-start gap-5 sm:grid-cols-2">
                    <Switch
                      checked={form.operation.recordingEnabled}
                      description={t('managerRoutePages.t48')}
                      label={t('managerRoutePages.t49')}
                      onCheckedChange={(checked) =>
                        setForm({
                          ...form,
                          operation: { ...form.operation, recordingEnabled: checked },
                        })
                      }
                    />
                    {/*
                      번역 자막 토글은 두지 않는다. 자막은 AI 워커가 참가자 언어를 보고 알아서
                      제공하고 화면 표시 여부도 통화 화면이 결정하므로, 팬미팅 단위로 미리 끌
                      이유가 없다. API가 요구하는 translationEnabled는 항상 true로 보낸다.
                      (managerMeetingCreateDraft의 기본값)
                    */}
                  </div>
                </section>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-6">
                <div className="grid gap-5 border-t border-[var(--color-divider)] pt-5">
                  {/* 참가자 선별 방식 선택(40a80d7)을 유지하고 문구만 번역 키로 바꾼다. */}
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--color-text-primary)]">
                      {t('managerCreate.selection.title')}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {t('managerCreate.selection.note')}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      className={`rounded-[var(--radius-panel)] border p-5 text-left transition-colors ${
                        selectionType === 'APPLICATION'
                          ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)]'
                          : 'border-[var(--color-divider)] hover:border-[var(--color-text-muted)]'
                      }`}
                      onClick={() =>
                        setForm({
                          ...form,
                          participantSelectionType: 'APPLICATION',
                          application: { ...form.application, enabled: true },
                        })
                      }
                      type="button"
                    >
                      <strong className="block text-base font-extrabold text-[var(--color-text-primary)]">
                        {t('managerCreate.selection.application')}
                      </strong>
                      <span className="mt-1.5 block text-sm text-[var(--color-text-secondary)]">
                        {t('managerCreate.selection.applicationDesc')}
                      </span>
                    </button>
                    <button
                      className={`rounded-[var(--radius-panel)] border p-5 text-left transition-colors ${
                        selectionType === 'EXTERNAL_SELECTION'
                          ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)]'
                          : 'border-[var(--color-divider)] hover:border-[var(--color-text-muted)]'
                      }`}
                      onClick={() =>
                        setForm({
                          ...form,
                          participantSelectionType: 'EXTERNAL_SELECTION',
                          application: {
                            enabled: false,
                            startAt: null,
                            endAt: null,
                            resultAnnouncementAt: null,
                            capacity: form.application.capacity || 1,
                          },
                        })
                      }
                      type="button"
                    >
                      <strong className="block text-base font-extrabold text-[var(--color-primary-coral)]">
                        {t('managerCreate.selection.external')}
                      </strong>
                      <span className="mt-1.5 block text-sm text-[var(--color-text-secondary)]">
                        {t('managerCreate.selection.externalDesc')}
                      </span>
                    </button>
                  </div>

                  {selectionType === 'APPLICATION' ? (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <TextField label={t('managerRoutePages.t54')} required reserveMessageSpace type="datetime-local" value={form.application.startAt ?? ''} onChange={(event) => setForm({ ...form, application: { ...form.application, startAt: event.target.value } })} />
                        {/*
                          "지금"은 두지 않는다. 남은 단계를 작성하는 사이 시각이 과거가 되어
                          생성이 거절되기 쉽다. 여유를 둔 가까운 미래만 제안한다.
                        */}
                        <SchedulePresetChips
                          onPick={(value) =>
                            setForm({ ...form, application: { ...form.application, startAt: value } })
                          }
                          options={[
                            { label: t('managerCreate.preset.inMinutes', { p0: 10 }), value: toLocalInputValue(new Date(Date.now() + 10 * 60 * 1000)) },
                            { label: t('managerCreate.preset.inHours', { p0: 1 }), value: toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)) },
                          ]}
                        />
                      </div>
                      <div>
                        <TextField error={applicationEndError} label={t('managerRoutePages.t55')} required reserveMessageSpace type="datetime-local" value={form.application.endAt ?? ''} onChange={(event) => setForm({ ...form, application: { ...form.application, endAt: event.target.value } })} />
                        <SchedulePresetChips
                          disabled={!hasScheduledStart}
                          disabledReason={t('managerCreate.preset.needStart')}
                          onPick={(value) =>
                            setForm({ ...form, application: { ...form.application, endAt: value } })
                          }
                          options={[
                            { label: t('managerCreate.preset.daysBefore', { p0: 1 }), value: presetBeforeStart(24 * 60 * 60 * 1000) },
                            { label: t('managerCreate.preset.daysBefore', { p0: 2 }), value: presetBeforeStart(2 * 24 * 60 * 60 * 1000) },
                            { label: t('managerCreate.preset.daysBefore', { p0: 3 }), value: presetBeforeStart(3 * 24 * 60 * 60 * 1000) },
                          ]}
                        />
                      </div>
                      <div>
                        <TextField error={resultAnnouncementError} label={t('managerRoutePages.t56')} required reserveMessageSpace type="datetime-local" value={form.application.resultAnnouncementAt ?? ''} onChange={(event) => setForm({ ...form, application: { ...form.application, resultAnnouncementAt: event.target.value } })} />
                        <SchedulePresetChips
                          disabled={!hasScheduledStart}
                          disabledReason={t('managerCreate.preset.needStart')}
                          onPick={(value) =>
                            setForm({
                              ...form,
                              application: { ...form.application, resultAnnouncementAt: value },
                            })
                          }
                          options={[
                            { label: t('managerCreate.preset.hoursBefore', { p0: 12 }), value: presetBeforeStart(12 * 60 * 60 * 1000) },
                            { label: t('managerCreate.preset.daysBefore', { p0: 1 }), value: presetBeforeStart(24 * 60 * 60 * 1000) },
                          ]}
                        />
                      </div>
                      <TextField label={t('managerRoutePages.t57')} min={1} required type="number" value={form.application.capacity} onChange={(event) => setForm({ ...form, application: { ...form.application, capacity: Number(event.target.value) } })} />
                    </div>
                  ) : (
                    <div className="grid gap-5">
                      <TextField
                        containerClassName="sm:max-w-[280px]"
                        helperText={t('managerCreate.csv.capacityHelper')}
                        label={t('managerCreate.csv.capacityLabel')}
                        min={1}
                        required
                        type="number"
                        value={form.application.capacity}
                        onChange={(event) => setForm({ ...form, application: { ...form.application, capacity: Number(event.target.value) } })}
                      />
                      <div className="rounded-[var(--radius-panel)] border border-[var(--color-divider)] p-5">
                        <h4 className="text-sm font-extrabold text-[var(--color-text-primary)]">
                          {t('managerCreate.csv.formatTitle')}
                        </h4>
                        {/*
                          "이메일"·"대기 순번"을 굵게 강조하는 문장이다. 문장 중간의 마크업은 언어별
                          어순을 막으므로, 설명은 한 문장으로 두고 강조는 아래 예시 표가 대신한다.
                        */}
                        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
                          {t('managerCreate.csv.formatDesc')}
                        </p>
                        <div className="mt-3.5 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-divider)]">
                          <div className="grid grid-cols-2 border-b border-[var(--color-divider)] bg-[var(--color-surface-page)] px-4 py-2.5 text-sm font-bold">
                            <span>{t('managerCreate.csv.columnEmail')}</span>
                            <span>{t('managerCreate.csv.columnPosition')}</span>
                          </div>
                          <div className="grid grid-cols-2 border-b border-[var(--color-border-row)] px-4 py-2.5 text-sm">
                            <span>fan1@example.com</span>
                            <span>1</span>
                          </div>
                          <div className="grid grid-cols-2 px-4 py-2.5 text-sm">
                            <span>fan2@example.com</span>
                            <span>2</span>
                          </div>
                        </div>
                        <div className="mt-3.5">
                          <Button
                            loading={downloadingTemplate}
                            onClick={() => void handleDownloadCsvTemplate()}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {t('managerCreate.csv.downloadTemplate')}
                          </Button>
                        </div>
                        {templateDownloadError ? (
                          <p className="mt-2 text-sm font-medium text-[var(--color-error)]" role="alert">
                            {templateDownloadError}
                          </p>
                        ) : null}
                      </div>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {t('managerCreate.csv.uploadLater')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid gap-5 border-t border-[var(--color-divider)] pt-5">
                {form.application.enabled ? (
                  <>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {t('managerRoutePages.t60')}
                    </p>
                    <Textarea
                      label={t('managerRoutePages.t61')}
                      onChange={(event) => setFormDescription(event.target.value)}
                      placeholder={t('managerRoutePages.t62')}
                      rows={3}
                      value={formDescription}
                    />
                    {questions.length > 0 ? (
                      <div className="grid gap-4">
                        {questions.map((question, index) => (
                          <div className="grid gap-4 border-t border-[var(--color-divider)] pt-5" key={question.key}>
                            <div className="flex items-center justify-between gap-3">
                              <strong className="text-sm text-[var(--color-text-primary)]">{t('managerRoutePages.t63')} {index + 1}</strong>
                              <Button
                                onClick={() => setQuestionDeleteTarget(question.key)}
                                size="sm"
                                type="button"
                                variant="danger"
                              >
                                {t('managerRoutePages.t64')}
                              </Button>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                              <TextField
                                containerClassName="sm:col-span-2"
                                label={t('managerRoutePages.t65')}
                                onChange={(event) =>
                                  setQuestions((items) =>
                                    items.map((item) =>
                                      item.key === question.key ? { ...item, questionText: event.target.value } : item,
                                    ),
                                  )
                                }
                                placeholder={t('managerRoutePages.t66')}
                                value={question.questionText}
                              />
                              <Select
                                label={t('managerRoutePages.t67')}
                                onChange={(event) =>
                                  setQuestions((items) =>
                                    items.map((item) =>
                                      item.key === question.key
                                        ? {
                                            ...item,
                                            questionType:
                                              event.target.value === 'LONG_TEXT' ? 'LONG_TEXT' : 'SHORT_TEXT',
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                options={[
                                  { value: 'SHORT_TEXT', label: t('managerRoutePages.t204') },
                                  { value: 'LONG_TEXT', label: t('managerRoutePages.t205') },
                                ]}
                                value={question.questionType}
                              />
                            </div>
                            <Checkbox
                              checked={question.required}
                              label={t('managerRoutePages.t68')}
                              onChange={(event) =>
                                setQuestions((items) =>
                                  items.map((item) =>
                                    item.key === question.key ? { ...item, required: event.target.checked } : item,
                                  ),
                                )
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div>
                      <Button
                        disabled={questions.length >= MAX_DRAFT_QUESTIONS}
                        onClick={() =>
                          setQuestions((items) => [
                            ...items,
                            {
                              key: nextQuestionKey.current++,
                              questionText: '',
                              questionType: 'SHORT_TEXT',
                              required: true,
                            },
                          ])
                        }
                        type="button"
                        variant="outline"
                      >
                        {t('managerRoutePages.t69')}{questions.length}/{MAX_DRAFT_QUESTIONS})
                      </Button>
                      {questions.length >= MAX_DRAFT_QUESTIONS ? (
                        <p className="mt-2 text-sm font-medium text-[var(--color-text-muted)]">
                          {t('managerRoutePages.t70')} {MAX_DRAFT_QUESTIONS}{t('managerRoutePages.t71')}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {t('managerCreate.form.skipForExternal')}
                  </p>
                )}
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="grid gap-6">
                <div className="grid gap-6 border-t border-[var(--color-divider)] pt-5 lg:grid-cols-[1.1fr_1fr] lg:gap-9">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-muted)]">{t('managerRoutePages.t73')}</p>
                    {form.coverImageUrl?.trim() ? (
                      <img
                        alt={t('managerRoutePages.t311', { p0: form.title })}
                        className="mt-3 aspect-[16/10] w-full rounded-[var(--radius-panel)] border-b-2 border-[var(--color-primary-coral)] object-cover"
                        src={form.coverImageUrl}
                      />
                    ) : null}
                    {/* 선별 방식에 따라 미리보기 배지 문구가 달라진다(40a80d7). */}
                    <p className="mt-4 text-sm font-extrabold text-[var(--color-primary-coral)]" role="status">
                      {selectionType === 'EXTERNAL_SELECTION'
                        ? t('managerCreate.preview.badgeExternal')
                        : t('managerCreate.preview.badgeApplication')}
                    </p>
                    <h3 className="mj-font-title mt-2 text-2xl tracking-[-0.038em] text-[var(--color-text-primary)]">{form.title}</h3>
                    <p className="mt-2 text-base font-medium text-[var(--color-text-muted)]">
                      {t('managerRoutePages.t75')} {isInfluencerAccount ? influencerNickname : t('managerRoutePages.t312', { p0: form.influencerId || '-' })}
                    </p>
                    {form.description?.trim() ? (
                      <p className="mt-3 whitespace-pre-wrap text-base font-medium leading-[1.75] text-[var(--color-text-body)]">{form.description}</p>
                    ) : null}
                  </div>

                  <dl className="grid content-start">
                    {[
                      [t('managerRoutePages.t206'), formatDateTime(form.scheduledStartAt)],
                      [t('managerRoutePages.t207'), formatCallDuration(form.operation.callDurationSec)],
                      [t('managerRoutePages.t208'), selectionType === 'EXTERNAL_SELECTION' ? t('managerRoutePages.t209') : t('managerRoutePages.t210')],
                      selectionType === 'EXTERNAL_SELECTION'
                        ? [t('managerRoutePages.t211'), t('managerRoutePages.t313', { p0: form.application.capacity })]
                        : [t('managerRoutePages.t212'), t('managerRoutePages.t314', { p0: form.application.capacity })],
                      ...(selectionType === 'APPLICATION'
                        ? [
                            [t('managerRoutePages.t213'), formatDateTime(form.application.startAt)],
                            [t('managerRoutePages.t214'), formatDateTime(form.application.endAt)],
                            [t('managerRoutePages.t215'), formatDateTime(form.application.resultAnnouncementAt)],
                          ]
                        : []),
                      [t('managerRoutePages.t216'), formatDateTime(form.operation.queueOpenAt)],
                      [t('managerRoutePages.t217'), form.operation.recordingEnabled ? t('managerRoutePages.t218') : t('managerRoutePages.t219')],
                      [t('managerRoutePages.t223'), form.operation.reconnectGraceSec == null ? t('managerRoutePages.t224') : t('managerRoutePages.t315', { p0: form.operation.reconnectGraceSec })],
                      [t('managerRoutePages.t225'), form.operation.maxRecallCount == null ? t('managerRoutePages.t226') : t('managerRoutePages.t316', { p0: form.operation.maxRecallCount })],
                      ...(selectionType === 'APPLICATION'
                        ? [
                            [t('managerRoutePages.t227'), formDescription.trim() ? t('managerRoutePages.t228') : t('managerRoutePages.t229')],
                            [t('managerRoutePages.t230'), questions.length > 0 ? t('managerRoutePages.t231') : t('managerRoutePages.t232')],
                          ]
                        : []),
                    ].map(([label, value]) => (
                      <div className="flex items-baseline justify-between gap-5 border-b border-[var(--color-border-row)] py-3" key={label}>
                        <dt className="whitespace-nowrap text-sm font-semibold text-[var(--color-text-muted)]">{label}</dt>
                        <dd className="m-0 text-right text-base font-extrabold tabular-nums text-[var(--color-text-primary)]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                {/* 발행 후 흐름이 선별 방식에 따라 달라 설명 문구도 갈린다(40a80d7). */}
                <Checkbox
                  checked={readyToPublish}
                  description={
                    selectionType === 'EXTERNAL_SELECTION'
                      ? t('managerCreate.publish.confirmExternal')
                      : t('managerCreate.publish.confirmApplication')
                  }
                  label={t('managerCreate.publish.confirmLabel')}
                  onChange={(event) => setReadyToPublish(event.target.checked)}
                />
              </div>
            ) : null}
          </div>
        </section>

        {error ? <AlertBanner title={errorTitle} variant="error">{error}</AlertBanner> : null}
        <FormActions
          disabledReason={
            step === 0
              ? t('managerRoutePages.t233')
              : step === 1
                ? callDurationError
                  ? callDurationError
                  : !form.operation.queueOpenAt
                    ? t('managerRoutePages.t234')
                    : !operationPoliciesValid
                      ? t('managerRoutePages.t235')
                      : queueOpenError
                : step === 3
                  ? selectionType === 'EXTERNAL_SELECTION'
                    ? !externalSelectionComplete
                      ? t('managerRoutePages.t236')
                      : undefined
                    : !questionsComplete
                      ? t('managerRoutePages.t237')
                      : !applicationScheduleComplete
                        ? t('managerRoutePages.t238')
                        : scheduleErrors[0]
                  : step === LAST_STEP
                    ? !basicInformationComplete
                      ? t('managerRoutePages.t239')
                      : !operationComplete
                        ? t('managerRoutePages.t240')
                        : !applicationComplete
                          ? selectionType === 'EXTERNAL_SELECTION'
                            ? t('managerRoutePages.t241')
                            : t('managerRoutePages.t242')
                          : !readyToPublish
                            ? t('managerRoutePages.t243')
                            : undefined
                    : undefined
          }
          nextDisabled={
            createdMeetingStatus === 'PUBLISHED' ||
            (step === 0 && !basicInformationComplete) ||
            (step === 1 && !operationComplete) ||
            (step === 3 && !applicationComplete) ||
            (step === LAST_STEP && !publishReady)
          }
          nextLoading={submitting}
          onBack={step > 0 ? () => setStep(step - 1) : undefined}
          nextLabel={step === LAST_STEP ? t('managerRoutePages.t244') : t('managerRoutePages.t245')}
        />
        </fieldset>
      </form>
      <Dialog
        description={t('managerRoutePages.t78')}
        footer={
          <>
            <Button disabled={submitting} onClick={() => setPublishDialogOpen(false)} variant="outline">
              {t('managerRoutePages.t79')}
            </Button>
            <Button
              loading={submitting}
              onClick={() => {
                setPublishDialogOpen(false)
                void saveMeeting()
              }}
            >
              {t('managerRoutePages.t80')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!submitting) setPublishDialogOpen(open)
        }}
        open={publishDialogOpen}
        title={t('managerRoutePages.t81')}
      />
      <Dialog
        description={t('managerRoutePages.t82')}
        footer={
          <>
            <Button onClick={() => setQuestionDeleteTarget(undefined)} variant="outline">
              {t('managerRoutePages.t83')}
            </Button>
            <Button
              onClick={() => {
                setQuestions((items) => items.filter((item) => item.key !== questionDeleteTarget))
                setQuestionDeleteTarget(undefined)
              }}
              variant="danger"
            >
              {t('managerRoutePages.t84')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open) setQuestionDeleteTarget(undefined)
        }}
        open={questionDeleteTarget !== undefined}
        title={t('managerRoutePages.t85')}
      />
      <Dialog
        description={t('managerRoutePages.t86')}
        footer={
          <>
            <Button onClick={() => setNewStartDialogOpen(false)} variant="outline">
              {t('managerRoutePages.t87')}
            </Button>
            <Button onClick={startNewMeeting} variant="danger">
              {t('managerRoutePages.t88')}
            </Button>
          </>
        }
        onOpenChange={setNewStartDialogOpen}
        open={newStartDialogOpen}
        title={t('managerRoutePages.t89')}
      />
      <Dialog
        description={t('managerRoutePages.t90')}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                if (navigationBlocker.state === 'blocked') navigationBlocker.reset()
              }}
              variant="outline"
            >
              {t('managerRoutePages.t91')}
            </Button>
            {/* 초안을 남기지 않고 나갈 수단이 없으면 다음 방문에서 또 복구되어 새로 만들 수 없다. */}
            <Button onClick={discardAndLeave} variant="ghost">
              {t('managerRoutePages.t92')}
            </Button>
            <Button onClick={proceedBlockedNavigation} variant="danger">
              {t('managerRoutePages.t93')}
            </Button>
          </div>
        }
        onOpenChange={(open) => {
          if (!open && navigationBlocker.state === 'blocked') navigationBlocker.reset()
        }}
        open={navigationBlocker.state === 'blocked'}
        title={t('managerRoutePages.t94')}
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('managerRoutePages.t95')}
        </p>
      </Dialog>
    </div>
  )
}

/** 팬미팅 공지를 실제 API로 조회·작성·수정·삭제하는 관리 페이지다. */
export function ManagerNoticesPage() {
  const { t } = useTranslation()
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const [meetingTitle, setMeetingTitle] = useState(t('managerRoutePages.t246'))
  const [pageData, setPageData] = useState<PageResponse<NoticeSummaryResponse>>()
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number>()
  const [detail, setDetail] = useState<NoticeDetailResponse>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  // 프로토타입처럼 목록 옆에서 바로 작성·수정하되 기존 공지 API 필드는 그대로 유지한다.
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number>()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<NoticeDetailResponse>()
  const [deleting, setDeleting] = useState(false)
  // 첨부는 저장 전에 먼저 업로드해 식별자를 받아 두고, 저장 시 그 목록을 공지에 연결한다.
  const [attachments, setAttachments] = useState<NoticeAttachmentResponse[]>([])
  const [uploading, setUploading] = useState(false)
  // 보고 있던 공지를 수정했을 때 selectedId가 그대로여서 상세가 다시 조회되지 않는 문제를 푼다.
  const [detailReloadKey, setDetailReloadKey] = useState(0)

  useEffect(() => {
    if (!meetingId) return
    const controller = new AbortController()
    const token = getAuthSession()?.accessToken
    fetchPublicFanMeetingDetail(Number(meetingId), token, controller.signal)
      .then((result) => setMeetingTitle(result.meeting.title))
      .catch(() => undefined)
    return () => controller.abort()
  }, [meetingId])

  const loadList = useCallback(async () => {
    if (!meetingId) {
      setError(t('managerRoutePages.t247'))
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await getMeetingNotices(meetingId, { page, size: 10 })
      setPageData(result)
      setSelectedId((current) =>
        current !== undefined && result.content.some((notice) => notice.noticeId === current)
          ? current
          : result.content[0]?.noticeId,
      )
      setError(undefined)
    } catch (cause) {
      setError(toErrorMessage(cause, t('managerRoutePages.t248')))
    } finally {
      setLoading(false)
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, page])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    if (!meetingId || selectedId === undefined) {
      setDetail(undefined)
      setDetailLoading(false)
      return
    }

    const controller = new AbortController()
    setDetailLoading(true)
    getMeetingNotice(meetingId, selectedId, controller.signal)
      .then(setDetail)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(toErrorMessage(cause, t('managerRoutePages.t249')))
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailReloadKey, meetingId, selectedId])

  useEffect(() => {
    if (!detail || creating || detail.noticeId !== selectedId) return
    setEditingId(detail.noticeId)
    setTitle(detail.title)
    setContent(detail.content)
    setAttachments(detail.attachments)
    setEditorError(undefined)
  }, [creating, detail, selectedId])

  /** 목록 선택을 해제하고 빈 인라인 편집기를 연다. */
  function openNewNotice() {
    setCreating(true)
    setEditingId(undefined)
    setSelectedId(undefined)
    setDetail(undefined)
    setTitle('')
    setContent('')
    setAttachments([])
    setEditorError(undefined)
  }

  /** 선택한 파일을 순서대로 업로드하고 공지에 연결할 첨부 목록에 추가한다. */
  async function uploadFiles(fileList: FileList | null) {
    const files = fileList ? [...fileList] : []
    if (!files.length) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setEditorError(t('managerRoutePages.t250'))
      return
    }

    const room = NOTICE_ATTACHMENT_MAX_COUNT - attachments.length
    if (room <= 0) {
      setEditorError(t('managerRoutePages.t317', { p0: NOTICE_ATTACHMENT_MAX_COUNT }))
      return
    }

    setUploading(true)
    setEditorError(undefined)
    try {
      // 서버가 개수를 거절하지 않도록 남은 자리만큼만 올린다.
      for (const file of files.slice(0, room)) {
        const uploaded = await uploadAttachment(file, 'NOTICE', token)
        setAttachments((current) => [...current, uploaded])
      }
      if (files.length > room) {
        setEditorError(
          t('managerRoutePages.t318', { p0: NOTICE_ATTACHMENT_MAX_COUNT, p1: files.length - room }),
        )
      }
    } catch (cause) {
      setEditorError(toErrorMessage(cause, t('managerRoutePages.t251')))
    } finally {
      setUploading(false)
    }
  }

  async function submitNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const token = getAuthSession()?.accessToken
    if (!token) {
      setEditorError(t('managerRoutePages.t252'))
      return
    }

    if (!title.trim() || !content.trim()) {
      setEditorError(t('managerRoutePages.t253'))
      return
    }

    setSaving(true)
    setEditorError(undefined)
    try {
      // 수정에서도 목록을 항상 보내 화면에서 지운 첨부가 그대로 남지 않게 한다.
      const attachmentIds = attachments.map((attachment) => attachment.attachmentId)
      if (editingId !== undefined) {
        await updateMeetingNotice(
          meetingId,
          editingId,
          { title: title.trim(), content: content.trim(), attachmentIds },
          token,
        )
        setMessage(t('managerRoutePages.t254'))
        setSelectedId(editingId)
        // 같은 공지를 계속 보고 있으면 selectedId가 그대로라 상세가 다시 조회되지 않는다.
        // 첨부 변경을 화면에 반영하려면 재조회를 명시적으로 요청해야 한다.
        setDetailReloadKey((key) => key + 1)
      } else {
        const created = await createMeetingNotice(
          meetingId,
          { title: title.trim(), content: content.trim(), attachmentIds },
          token,
        )
        setMessage(t('managerRoutePages.t255'))
        setSelectedId(created.noticeId)
      }
      setCreating(false)
      await loadList()
    } catch (cause) {
      setEditorError(toErrorMessage(cause, t('managerRoutePages.t256')))
    } finally {
      setSaving(false)
    }
  }

  async function removeNotice(target: NoticeDetailResponse) {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('managerRoutePages.t257'))
      return
    }

    setDeleting(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await deleteMeetingNotice(meetingId, target.noticeId, token)
      setMessage(t('managerRoutePages.t258'))
      setSelectedId(undefined)
      setDetail(undefined)
      setDeleteTarget(undefined)
      await loadList()
    } catch (cause) {
      setError(toErrorMessage(cause, t('managerRoutePages.t259')))
    } finally {
      setDeleting(false)
    }
  }

  const selectedStatus = creating ? t('managerRoutePages.t260') : detail?.pinned ? t('managerRoutePages.t261') : t('managerRoutePages.t262')
  const selectedStatusClass = creating || !detail?.pinned
    ? creating
      ? 'text-[var(--color-text-secondary)]'
      : 'text-[var(--color-success)]'
    : 'text-[var(--color-primary-coral)]'
  const canEdit = creating || detail?.canEdit === true
  const requiredFieldsReady = title.trim().length > 0 && content.trim().length > 0
  const canSave = canEdit && requiredFieldsReady && !saving && !uploading
  const saveHint = !canEdit
    ? t('managerRoutePages.t263')
    : !requiredFieldsReady
      ? t('managerRoutePages.t264')
      : uploading
        ? t('managerRoutePages.t265')
        : creating
          ? t('managerRoutePages.t266')
          : t('managerRoutePages.t267')

  return (
    <div className="pb-10">
      <Link
        className="text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        to={`/manager/fan-meetings/${meetingId}/monitor`}
      >
        {t('managerRoutePages.t96')}
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-black tracking-[-0.035em]">{t('managerRoutePages.t97')}</h1>
        <p className="mt-2 text-sm font-medium text-[var(--color-text-secondary)]">
          {meetingTitle} {t('managerRoutePages.t98')}
        </p>
      </header>

      <div className="mt-6 grid gap-3">
        {error ? <AlertBanner title={t('managerRoutePages.t99')} variant="error">{error}</AlertBanner> : null}
        {message ? <AlertBanner onDismiss={() => setMessage(undefined)} title={t('managerRoutePages.t100')} variant="success">{message}</AlertBanner> : null}
      </div>

      <div className="mt-6 grid items-start gap-7 border-t border-[var(--color-divider)] pt-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label={t('managerRoutePages.t101')} className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-extrabold">
              {t('managerRoutePages.t102')}{' '}
              <span className="font-semibold tabular-nums text-[var(--color-text-secondary)]">
                {pageData ? t('managerRoutePages.t319', { p0: pageData.totalElements }) : '-'}
              </span>
            </h2>
            <Button onClick={openNewNotice} size="sm" variant="outline">{t('managerRoutePages.t103')}</Button>
          </div>

          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <Spinner label={t('managerRoutePages.t104')} />
            </div>
          ) : !pageData || pageData.content.length === 0 ? (
            <div className="mt-5 rounded-[var(--radius-control)] border border-dashed border-[var(--color-border-control)] px-5 py-10 text-center" role="status">
              <strong className="block text-base font-extrabold">{t('managerRoutePages.t105')}</strong>
              <span className="mt-2 block text-sm font-medium leading-6 text-[var(--color-text-secondary)]">
                {t('managerRoutePages.t106')}
              </span>
              <Button className="mt-4" onClick={openNewNotice}>{t('managerRoutePages.t107')}</Button>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-2">
                {pageData.content.map((notice) => (
                  <button
                    aria-current={selectedId === notice.noticeId ? 'true' : undefined}
                    className={`w-full rounded-[var(--radius-control)] border px-4 py-3 text-left hover:border-[var(--color-text-secondary)] ${selectedId === notice.noticeId ? 'border-[var(--color-primary-coral)] bg-[var(--color-surface-page)]' : 'border-[var(--color-divider)] bg-[var(--color-surface-panel)]'}`}
                    key={notice.noticeId}
                    onClick={() => {
                      setCreating(false)
                      setSelectedId(notice.noticeId)
                    }}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className={`whitespace-nowrap text-xs font-extrabold ${notice.pinned ? 'text-[var(--color-primary-coral)]' : 'text-[var(--color-success)]'}`}>
                        {notice.pinned ? t('managerRoutePages.t268') : t('managerRoutePages.t269')}
                      </span>
                      <span className="text-xs font-medium tabular-nums text-[var(--color-text-secondary)]">
                        {formatDateTime(notice.createdAt)}
                      </span>
                    </span>
                    <strong className={`mt-2 block text-base leading-6 ${selectedId === notice.noticeId ? 'font-extrabold' : 'font-bold'}`}>
                      {notice.title}
                    </strong>
                  </button>
                ))}
              </div>
              {pageData.totalPages > 1 ? (
                <Pagination className="border-t border-[var(--color-divider)] py-3" currentPage={page + 1} onPageChange={(next) => setPage(next - 1)} totalPages={pageData.totalPages} />
              ) : null}
            </>
          )}
        </nav>

        <section aria-label={t('managerRoutePages.t108')} className="min-w-0">
          {detailLoading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Spinner label={t('managerRoutePages.t109')} />
            </div>
          ) : creating || detail ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-extrabold tracking-[-0.03em]">
                  {creating ? t('managerRoutePages.t270') : t('managerRoutePages.t271')}
                </h2>
                <span className={`whitespace-nowrap text-sm font-extrabold ${selectedStatusClass}`}>
                  {selectedStatus}
                </span>
              </div>

              <form className="mt-5 grid gap-4" id="manager-notice-form" onSubmit={submitNotice}>
                <TextField
                  disabled={!canEdit}
                  label={t('managerRoutePages.t110')}
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t('managerRoutePages.t111')}
                  required
                  value={title}
                />
                <Textarea
                  disabled={!canEdit}
                  label={t('managerRoutePages.t112')}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={t('managerRoutePages.t113')}
                  required
                  rows={7}
                  value={content}
                />

                <fieldset className="grid gap-3">
                  <legend className="text-sm font-bold text-[var(--color-text-secondary)]">
                    {t('managerRoutePages.t114')}{' '}
                    <span className="font-medium tabular-nums">
                      ({attachments.length}/{NOTICE_ATTACHMENT_MAX_COUNT})
                    </span>
                  </legend>
                  <input
                    accept="image/*,.pdf"
                    className="block w-full text-sm"
                    disabled={!canEdit || uploading || attachments.length >= NOTICE_ATTACHMENT_MAX_COUNT}
                    multiple
                    onChange={(event) => {
                      void uploadFiles(event.target.files)
                      event.target.value = ''
                    }}
                    type="file"
                  />
                  {uploading ? <p className="text-sm text-[var(--color-text-secondary)]">{t('managerRoutePages.t115')}</p> : null}
                  {attachments.length ? (
                    <ul className="grid gap-2">
                      {attachments.map((attachment) => (
                        <li className="flex items-center justify-between gap-3 border-b border-[var(--color-divider)] py-2 text-sm" key={attachment.attachmentId}>
                          <a
                            className="min-w-0 flex-1 truncate font-semibold hover:underline"
                            href={attachmentContentUrl(attachment.attachmentId)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {attachment.originalFileName}
                          </a>
                          {canEdit ? (
                            <Button
                              onClick={() =>
                                setAttachments((current) =>
                                  current.filter((item) => item.attachmentId !== attachment.attachmentId),
                                )
                              }
                              size="sm"
                              variant="ghost"
                            >
                              {t('managerRoutePages.t116')}
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </fieldset>

                {editorError ? <AlertBanner title={t('managerRoutePages.t117')} variant="error">{editorError}</AlertBanner> : null}

                <div className="mt-1 flex flex-wrap gap-3 border-t border-[var(--color-divider)] pt-5">
                  <Button
                    disabled={!canSave}
                    loading={saving}
                    title={!canSave ? saveHint : undefined}
                    type="submit"
                  >
                    {creating ? t('managerRoutePages.t272') : canEdit ? t('managerRoutePages.t273') : t('managerRoutePages.t274')}
                  </Button>
                  {!creating && detail?.canDelete ? (
                    <Button className="ml-auto" onClick={() => setDeleteTarget(detail)} variant="danger">
                      {t('managerRoutePages.t118')}
                    </Button>
                  ) : null}
                </div>
                <p className="text-sm font-medium leading-6 text-[var(--color-text-secondary)]">
                  {saveHint}
                </p>
              </form>
            </>
          ) : null}
        </section>
      </div>

      <Dialog
        description={t('managerRoutePages.t119')}
        footer={
          <>
            <Button disabled={deleting} onClick={() => setDeleteTarget(undefined)} variant="outline">{t('managerRoutePages.t120')}</Button>
            <Button
              disabled={deleting}
              loading={deleting}
              onClick={() => deleteTarget && void removeNotice(deleteTarget)}
              variant="danger"
            >
              {t('managerRoutePages.t121')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(undefined)
        }}
        open={deleteTarget !== undefined}
        title={t('managerRoutePages.t122')}
      />
    </div>
  )
}

/** 위험 감지 통화 세션을 확인하고 필요하면 강제 종료하는 처리 페이지다. */
export function ManagerRiskIncidentPage() {
  const { t } = useTranslation()
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? 'demo-meeting'
  const [params] = useSearchParams()
  const callSessionId = params.get('callSessionId')?.trim()
  const [reason, setReason] = useState(t('managerRoutePages.t286'))
  const [submitting, setSubmitting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<string>()

  /** URL로 전달된 통화 세션 ID를 사용해 백엔드 강제 종료 API를 호출한다. */
  async function forceEnd() {
    if (!callSessionId) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('managerRoutePages.t287'))
      return
    }

    setSubmitting(true)
    setError(undefined)
    try {
      await forceEndCallSession(callSessionId, { reason }, { authToken: token })
      setEnded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('managerRoutePages.t288'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader eyebrow="CALL OPERATION" title={t('managerRoutePages.t131')} description={t('managerRoutePages.t132')} backTo={`/manager/fan-meetings/${meetingId}/monitor`} />
      <AlertBanner title={t('managerRoutePages.t133')} variant="warning">
        {t('managerRoutePages.t134')}
      </AlertBanner>
      {!callSessionId ? (
        <AlertBanner title={t('managerRoutePages.t135')} variant="error">
          {t('managerRoutePages.t136')} <code>callSessionId</code>{t('managerRoutePages.t137')}
        </AlertBanner>
      ) : (
        <Card>
          <CardHeader>
            <Badge variant="danger">{t('managerRoutePages.t138')} {callSessionId}</Badge>
            <CardTitle as="h2" className="mt-3">{t('managerRoutePages.t139')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            {/* 백엔드 ForceEndCallRequest의 255자 제한을 입력 단계에서 동일하게 적용한다. */}
            <Textarea label={t('managerRoutePages.t140')} maxLength={255} required rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />
            <Button disabled={submitting || ended || !reason.trim()} onClick={forceEnd} variant="danger">
              {ended ? t('managerRoutePages.t289') : submitting ? t('managerRoutePages.t290') : t('managerRoutePages.t291')}
            </Button>
            {error ? <AlertBanner title={t('managerRoutePages.t141')} variant="error">{error}</AlertBanner> : null}
            {ended ? <AlertBanner title={t('managerRoutePages.t142')} variant="success">{t('managerRoutePages.t143')}</AlertBanner> : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
