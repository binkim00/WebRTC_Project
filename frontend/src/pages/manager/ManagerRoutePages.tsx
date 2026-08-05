import { ArrowLeft } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import {
  callDurationSecToMinutesInput,
  formatCallDuration,
  validateCallDurationSec,
} from './callDuration'
import { saveApplicationForm } from '../../api/applications'
import { attachmentContentUrl, uploadAttachment } from '../../api/attachments'
import { getAuthSession } from '../../api/authSession'
import { forceEndCallSession } from '../../api/callSessions'
import type { PageResponse } from '../../api/envelope'
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
import {
  createEvent,
  publishFanMeeting,
  updateFanMeeting,
  type FanMeetingForm,
} from '../../api/managerOperations'
import {
  getFanMeetingStatistics,
  type FanMeetingStatisticsResponse,
} from '../../api/meetingManagement'
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

/** 매니저 페이지의 제목, 설명, 선택적 뒤로가기 링크를 같은 형태로 표시한다. */
function PageHeader({ eyebrow, title, description, backTo }: { eyebrow?: string; title: string; description: string; backTo?: string }) {
  return (
    <header className="grid gap-2">
      {backTo ? <Link className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary-coral)]" to={backTo}><ArrowLeft size={17} /> 이전 화면으로 돌아가기</Link> : null}
      {eyebrow ? <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-primary-coral)]">{eyebrow}</p> : null}
      <h1 className="text-4xl font-black tracking-[-0.055em]">{title}</h1>
      <p className="text-[var(--color-text-secondary)]">{description}</p>
    </header>
  )
}

/** 단계형 입력 폼에서 현재 단계와 완료 단계를 시각적으로 표시한다. */
function Stepper({ step, labels, onStepChange, disabled = false }: { step: number; labels: string[]; onStepChange: (step: number) => void; disabled?: boolean }) {
  return (
    <ol
      aria-label="팬미팅 생성 단계"
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
function FormActions({ onBack, nextLabel = '다음 단계', nextDisabled = false, nextLoading = false, disabledReason }: { onBack?: () => void; nextLabel?: string; nextDisabled?: boolean; nextLoading?: boolean; disabledReason?: string }) {
  return (
    <div className="border-t border-[var(--color-divider)] pt-5">
      <div className="flex flex-wrap justify-end gap-2">
          {onBack ? (
            <Button disabled={nextLoading} onClick={onBack} variant="outline">
              이전 단계
            </Button>
          ) : null}
          <Button disabled={nextDisabled} loading={nextLoading} type="submit">
            {nextLabel}
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
  const scheduledStart = new Date(form.scheduledStartAt)
  const queueOpen = new Date(form.operation.queueOpenAt)

  const minimumStart = new Date(Date.now() + 60_000)

  if (Number.isNaN(scheduledStart.getTime()) || scheduledStart <= minimumStart) {
    return '팬미팅 시작 일시는 현재 시각보다 1분 이상 이후로 입력해 주세요.'
  }

  return (
    getScheduleErrors(toScheduleInput(form))[0] ??
    (Number.isNaN(queueOpen.getTime())
      ? '대기열 오픈 일시를 입력해 주세요.'
      : undefined)
  )
}

/** 백엔드가 허용하는 응모 질문 최대 개수다. */
const MAX_DRAFT_QUESTIONS = 10

/** 생성 마법사의 단계 라벨과 각 단계의 제목이다. */
const STEP_LABELS = ['팬미팅 정보', '영상통화 운영', '이벤트 정보', '응모 설정', '미리보기']
const STEP_TITLES = [
  '팬미팅 정보',
  '영상통화 운영 설정',
  '이벤트 정보',
  '응모 조건과 응모 폼',
  '미리보기 및 발행',
]
const LAST_STEP = STEP_LABELS.length - 1
const LOCAL_DRAFT_SAVE_DELAY_MS = 500

/**
 * 팬미팅 한 건을 처음부터 끝까지 한 번에 등록하는 생성 마법사다.
 *
 * 백엔드에는 홍보·응모용 객체와 팬미팅 객체가 따로 없으므로 화면도 하나로 두고,
 * 팬미팅 정보 → 영상통화 운영 → 이벤트 정보 → 응모 설정·폼 → 최종 확인 순서로 값을 모아 저장한다.
 */
export function ManagerMeetingCreatePage() {
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

  const [createdMeetingId, setCreatedMeetingId] = useState<number | undefined>(
    restoredLocalDraft?.createdMeetingId,
  )
  const [createdMeetingStatus, setCreatedMeetingStatus] = useState<
    'DRAFT' | 'PUBLISHED' | undefined
  >(restoredLocalDraft?.createdMeetingId ? 'DRAFT' : undefined)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [errorTitle, setErrorTitle] = useState('입력 확인')
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
        setError(cause instanceof Error ? cause.message : '조직 인플루언서 목록을 불러오지 못했습니다.')
      })
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
  // 통화 시간은 선택형 UI로 초 단위 값을 직접 고르지만, 초안 폐기 시 표시값 복원을 위해
  // 분 단위 표시 문자열도 함께 유지한다.
  const [, setCallDurationMinutesInput] = useState(() =>
    callDurationSecToMinutesInput(form.operation.callDurationSec),
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
    setErrorTitle('입력 확인')
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
          `임시 초안에 연결된 팬미팅(ID ${linkedMeetingId})은 이미 초안 단계를 지났습니다. 덮어쓰지 않도록 연결을 끊었으니, 저장하면 새 팬미팅으로 만들어집니다.`,
        )
      })
      .catch(() => {
        if (controller.signal.aborted) return
        detachStaleLink(
          `임시 초안에 연결된 팬미팅(ID ${linkedMeetingId})을 찾을 수 없습니다. 삭제되었을 수 있어 연결을 끊었으니, 저장하면 새 팬미팅으로 만들어집니다.`,
        )
      })

    return () => controller.abort()
  }, [restoredLocalDraft?.createdMeetingId])
  const scheduleErrors = getScheduleErrors(toScheduleInput(form))
  const applicationEndError = scheduleErrors.find((message) =>
    message.startsWith('응모 마감'),
  )
  const resultAnnouncementError = scheduleErrors.find((message) =>
    message.startsWith('결과 발표'),
  )
  const queueOpenError = scheduleErrors.find((message) =>
    message.startsWith('대기열 오픈'),
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
      setErrorTitle('로그인 필요')
      setError('팬미팅을 등록하려면 먼저 로그인해 주세요.')
      return
    }

    if (
      form.application.enabled &&
      questions.some((question) => !question.questionText.trim())
    ) {
      setErrorTitle('입력 확인')
      setError('응모 질문 내용을 모두 입력하거나 빈 질문을 삭제해 주세요.')
      return
    }

    if (questions.length > MAX_DRAFT_QUESTIONS) {
      setErrorTitle('입력 확인')
      setError(`응모 질문은 최대 ${MAX_DRAFT_QUESTIONS}개까지 등록할 수 있습니다.`)
      return
    }

    if (!form.application.enabled) {
      setErrorTitle('참가자 등록 경로가 필요합니다')
      setError(
        '현재 참가자를 직접 등록할 수 없어 응모를 사용하지 않는 팬미팅은 진행할 수 없습니다. 응모를 사용해 주세요.',
      )
      return
    }

    const invalidPolicyValue = [
      form.operation.reconnectGraceSec,
      form.operation.maxRecallCount,
    ].some((value) => value != null && (!Number.isInteger(value) || value < 0))
    if (invalidPolicyValue) {
      setErrorTitle('입력 확인')
      setError('진행 정책 값은 비워 두거나 0 이상의 정수로 입력해 주세요.')
      return
    }

    const payload: FanMeetingForm = {
      ...form,
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
      setErrorTitle('입력 확인')
      setError('담당 인플루언서 ID를 입력해 주세요.')
      return
    }

    const scheduleError = validateMeetingSchedule(payload)
    if (scheduleError) {
      setErrorTitle('입력 확인')
      setError(scheduleError)
      return
    }

    const durationError = validateCallDurationSec(payload.operation.callDurationSec)
    if (durationError) {
      setErrorTitle('입력 확인')
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
      navigate(`/manager/fan-meetings/${meetingId}`)
    } catch (reason) {
      setErrorTitle('팬미팅 발행 실패')
      setError(
        reason instanceof Error
          ? reason.message
          : '팬미팅 발행에 실패했습니다.',
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
        setErrorTitle('입력 확인')
        setError('팬미팅명을 입력해 주세요.')
        return
      }
      if (
        step === 0 &&
        (!Number.isInteger(resolvedInfluencerId ?? form.influencerId) ||
          (resolvedInfluencerId ?? form.influencerId) <= 0)
      ) {
        setErrorTitle('입력 확인')
        setError('담당 인플루언서를 선택해 주세요.')
        return
      }
      if (step === 0 && !form.scheduledStartAt) {
        setErrorTitle('입력 확인')
        setError('팬미팅 일시를 입력해 주세요.')
        return
      }
      if (step === 1 && (!Number.isInteger(form.operation.callDurationSec) || form.operation.callDurationSec <= 0)) {
        setErrorTitle('입력 확인')
        setError('1인 통화 시간을 선택해 주세요.')
        return
      }
      if (step === 1 && !form.operation.queueOpenAt) {
        setErrorTitle('입력 확인')
        setError('대기열 오픈 일시를 입력해 주세요.')
        return
      }
      if (
        step === 1 &&
        [
          form.operation.reconnectGraceSec,
          form.operation.maxRecallCount,
        ].some((value) => value != null && (!Number.isInteger(value) || value < 0))
      ) {
        setErrorTitle('입력 확인')
        setError('진행 정책 값은 비워 두거나 0 이상의 정수로 입력해 주세요.')
        return
      }
      if (step === 1 && queueOpenError) {
        setErrorTitle('입력 확인')
        setError(queueOpenError)
        return
      }
      if (step === 3 && form.application.enabled && (!Number.isInteger(form.application.capacity) || form.application.capacity <= 0)) {
        setErrorTitle('입력 확인')
        setError('모집 인원을 1명 이상 입력해 주세요.')
        return
      }
      if (
        step === 3 &&
        form.application.enabled &&
        (!form.application.startAt ||
          !form.application.endAt ||
          !form.application.resultAnnouncementAt)
      ) {
        setErrorTitle('입력 확인')
        setError('응모 일정과 결과 발표 일시를 모두 입력해 주세요.')
        return
      }
      if (step === 3 && questions.some((question) => !question.questionText.trim())) {
        setErrorTitle('입력 확인')
        setError('응모 질문 내용을 모두 입력하거나 빈 질문을 삭제해 주세요.')
        return
      }
      if (step === 3 && scheduleErrors.length > 0) {
        setErrorTitle('입력 확인')
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
    Number.isInteger(form.operation.callDurationSec) &&
      form.operation.callDurationSec > 0 &&
      form.operation.queueOpenAt &&
      operationPoliciesValid &&
      !queueOpenError,
  )
  const questionsComplete = questions.every((question) => question.questionText.trim())
  const applicationScheduleComplete = Boolean(
    !form.application.enabled ||
      (Number.isInteger(form.application.capacity) &&
        form.application.capacity > 0 &&
        form.application.startAt &&
        form.application.endAt &&
        form.application.resultAnnouncementAt),
  )
  const applicationComplete =
    applicationScheduleComplete && scheduleErrors.length === 0 && questionsComplete
  const publishReady =
    basicInformationComplete &&
    operationComplete &&
    form.application.enabled &&
    applicationComplete &&
    readyToPublish
  return (
    <div className="pb-10">
      <Link
        className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        to="/manager/fan-meetings"
      >
        팬미팅 관리로 돌아가기
      </Link>
      <h1 className="mj-font-title mt-3.5 text-[var(--service-page-title-size)] leading-tight tracking-[-0.035em] text-[var(--color-text-primary)]">
        새 팬미팅 만들기
      </h1>
      <p className="mt-2 text-base font-medium text-[var(--color-text-muted)]">
        팬미팅을 만들면 팬에게 공개할 이벤트 정보와 응모까지 함께 생성됩니다.
      </p>

      <div className="mt-6.5">
        <Stepper labels={STEP_LABELS} onStepChange={setStep} step={step} />
      </div>
      {localDraftState !== 'idle' || localDraftBlocked ? (
        <div
          className="mt-5 flex flex-col gap-5 rounded-[var(--radius-control)] border border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] p-5 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div className="min-w-0">
            <strong className="block text-lg font-extrabold text-[var(--color-text-primary)]">
              {localDraftBlocked
                ? '저장 실패로 임시 저장을 중단했습니다'
                : localDraftState === 'error'
                  ? '브라우저 초안을 저장하지 못했습니다'
                  : '브라우저 초안을 이어서 작성 중입니다'}
            </strong>
            <span className="mt-1 block text-sm font-medium text-[var(--color-text-muted)]">
              {localDraftBlocked
                ? '화면의 입력값은 그대로이니 원인을 고쳐 다시 저장하면 임시 저장도 재개됩니다.'
                : localDraftState === 'error'
                  ? '브라우저 저장소를 사용할 수 있는지 확인해 주세요.'
                  : localDraftState === 'saving'
                    ? '이 기기에 자동 저장 중…'
                    : localDraftSavedAt
                      ? `이 기기에 자동 저장됨 ${formatDateTime(localDraftSavedAt)}`
                      : '입력을 시작하면 이 브라우저에 자동 저장됩니다.'}
            </span>
          </div>
          <Button onClick={() => setNewStartDialogOpen(true)} variant="outline">
            새로 시작
          </Button>
        </div>
      ) : null}

      {restoredLocalDraft ? (
        <AlertBanner className="mt-4" title="브라우저 임시 초안을 복구했습니다" variant="success">
          <p>
            {formatDateTime(restoredLocalDraft.savedAt)}에 저장한 STEP {restoredLocalDraft.step + 1}의
            입력을 이어서 표시합니다. 서버에 저장한 초안은 ‘초안 확인’에서 별도로 불러올 수 있습니다.
            {restoredLocalDraft.createdMeetingId
              ? ` 이 초안은 이미 만들어진 팬미팅(ID ${restoredLocalDraft.createdMeetingId})과 연결되어 있어, 저장하면 새로 만들지 않고 그 팬미팅을 수정합니다.`
              : ''}
          </p>
          {/* 초안을 버릴 수단이 없으면 복구된 createdMeetingId 때문에 새 팬미팅을 만들 수 없다. */}
          <div className="mt-3">
            <Button onClick={discardLocalDraft} size="sm" variant="secondary">
              초안 버리고 새로 만들기
            </Button>
          </div>
        </AlertBanner>
      ) : localDraftDiscarded ? (
        <AlertBanner className="mt-4" title="임시 초안을 버렸습니다" variant="info">
          빈 상태에서 새 팬미팅을 만들 수 있습니다.
        </AlertBanner>
      ) : null}

      {staleDraftLinkNotice ? (
        <AlertBanner className="mt-4" title="이전 팬미팅과의 연결을 끊었습니다" variant="warning">
          {staleDraftLinkNotice}
        </AlertBanner>
      ) : null}
      <form className="grid gap-5" onSubmit={submit}>
        <fieldset className="contents">
          <legend className="sr-only">팬미팅 생성 정보</legend>
        <section aria-labelledby={`meeting-create-step-${step}`} className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h2
                className="text-2xl font-extrabold tracking-[-0.032em] text-[var(--color-text-primary)]"
                id={`meeting-create-step-${step}`}
              >
                {STEP_TITLES[step] ?? '팬미팅 만들기'}
              </h2>
              <p className="mt-2 text-sm font-medium text-[var(--color-text-muted)]">
                {step === 0
                  ? '팬미팅 제목과 일정, 담당 인플루언서를 설정합니다.'
                  : step === 1
                    ? '팬미팅의 진행 시간, 대기열, 재입장 및 녹화 정책을 설정합니다.'
                    : step === 2
                      ? '팬에게 공개될 내용입니다. 발행하면 이벤트 목록에 노출됩니다.'
                      : step === 3
                        ? '응모 일정과 팬이 작성할 응모 폼을 함께 설정합니다.'
                        : '팬에게 보일 화면과 운영 설정을 확인한 뒤 발행하세요.'}
              </p>
            </div>
            {step === 0 ? (
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                <span className="font-extrabold text-[var(--color-primary-coral)]">*</span> 표시는 필수 입력 항목입니다.
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            {step === 0 ? (
              <div className="grid items-start gap-5 sm:grid-cols-2">
                <TextField label="팬미팅명" maxLength={200} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} helperText="팬에게 공개되는 홍보·응모 페이지의 제목입니다." />
                <TextField label="예정 팬미팅 일시" required type="datetime-local" value={form.scheduledStartAt} onChange={(event) => setForm({ ...form, scheduledStartAt: event.target.value })} />
                <div>
                  {isInfluencerAccount ? (
                    <div className="grid gap-2">
                      <span className="text-sm font-bold text-[var(--color-text-primary)]">담당 인플루언서 <span className="text-[var(--color-primary-coral)]">*</span></span>
                      <div className="flex min-h-[var(--control-height)] items-center justify-between gap-4 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-[var(--control-padding-inline)]">
                        <strong className="font-semibold text-[var(--color-text-primary)]">{influencerNickname}</strong>
                        <span className="text-sm font-bold text-[var(--color-success)]" role="status">
                          자동 연결
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[var(--color-text-muted)]">현재 로그인한 인플루언서 계정으로 자동 연결됩니다.</p>
                    </div>
                  ) : (
                    <Select
                      helperText={organizationInfluencers.length > 0 ? '현재 조직에 소속된 인플루언서만 선택할 수 있습니다.' : '소속 인플루언서가 없습니다. 조직 관리에서 먼저 초대를 수락했는지 확인해 주세요.'}
                      label="담당 인플루언서"
                      options={organizationInfluencers.map((member) => ({
                        value: String(member.userId),
                        label: `${member.nickname} (회원번호 ${member.userId})`,
                      }))}
                      placeholder="인플루언서를 선택해 주세요"
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
                  label="이벤트 상세 소개"
                  value={form.description ?? ''}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="팬에게 보여 줄 이벤트와 응모 안내를 입력해 주세요."
                />
                <TextField
                  containerClassName="sm:col-span-2"
                  helperText="외부에서 접근 가능한 이미지 URL을 입력해 주세요."
                  label="커버 이미지 URL"
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
                      팬미팅 진행 시간
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      팬 한 명과 통화하는 시간을 설정합니다.
                    </p>
                  </div>
                  <div className="grid items-start gap-5">
                    <Select
                      helperText="팬 한 명과 영상통화를 진행하는 시간입니다."
                      label="1명당 통화 시간"
                      options={[{ value: '120', label: '2분' }, { value: '180', label: '3분' }, { value: '300', label: '5분' }]}
                      value={String(form.operation.callDurationSec)}
                      onChange={(event) => setForm({ ...form, operation: { ...form.operation, callDurationSec: Number(event.target.value) } })}
                    />
                  </div>
                </section>

                <section aria-labelledby="queue-settings" className="grid gap-5 border-t border-[var(--color-divider)] pt-5">
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--color-text-primary)]" id="queue-settings">
                      대기열 운영
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      팬이 대기 화면에 들어올 수 있는 시작 시각을 설정합니다.
                    </p>
                  </div>
                  <div className="grid items-start gap-5 sm:grid-cols-2">
                    <TextField
                      error={queueOpenError}
                      helperText="팬이 대기 화면에 입장할 수 있는 날짜와 시간입니다."
                      label={
                        <span className="inline-flex items-center gap-2">
                          대기열 오픈 일시
                          <span className="rounded-[var(--radius-control)] bg-[var(--color-primary-coral-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-primary-coral)]">
                            필수
                          </span>
                        </span>
                      }
                      required
                      reserveMessageSpace
                      type="datetime-local"
                      value={form.operation.queueOpenAt}
                      onChange={(event) => setForm({ ...form, operation: { ...form.operation, queueOpenAt: event.target.value } })}
                    />
                  </div>
                </section>

                <section aria-labelledby="connection-settings" className="grid gap-5 border-t border-[var(--color-divider)] pt-5">
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--color-text-primary)]" id="connection-settings">
                      연결 및 재입장
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      연결이 끊기거나 입장 요청에 응답하지 않은 팬의 처리 기준을 설정합니다.
                    </p>
                  </div>
                  <div className="grid items-start gap-5 sm:grid-cols-2">
                    <TextField
                      className="pr-44"
                      endAdornment={<span className="whitespace-nowrap px-3 text-sm text-[var(--color-text-muted)]">초 동안 재입장 가능</span>}
                      helperText="통화 연결이 끊긴 팬이 다시 입장할 수 있는 시간을 설정합니다. 입력하지 않으면 서비스 기본값이 적용됩니다."
                      label="연결이 끊긴 후 재입장 가능 시간"
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
                      endAdornment={<span className="whitespace-nowrap px-3 text-sm text-[var(--color-text-muted)]">회까지 다시 호출</span>}
                      helperText="입장 요청에 응답하지 않은 팬을 다시 호출할 수 있는 최대 횟수입니다. 입력하지 않으면 서비스 기본값이 적용됩니다."
                      label="응답 없는 팬 다시 호출"
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
                      녹화 및 실시간 기능
                    </h3>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      통화 중 사용할 녹화와 번역 자막 기능을 선택합니다.
                    </p>
                  </div>
                  <div className="grid items-start gap-5 sm:grid-cols-2">
                    <Switch
                      checked={form.operation.recordingEnabled}
                      description="영상통화를 녹화합니다. 녹화 영상은 팬미팅 종료 후 5일 동안 보관된 뒤 삭제됩니다."
                      label="영상통화 녹화"
                      onCheckedChange={(checked) =>
                        setForm({
                          ...form,
                          operation: { ...form.operation, recordingEnabled: checked },
                        })
                      }
                    />
                    <Switch
                      checked={form.operation.translationEnabled}
                      description="통화 중 팬과 인플루언서에게 실시간 번역 자막을 제공합니다."
                      label="실시간 번역 자막"
                      onCheckedChange={(checked) =>
                        setForm({
                          ...form,
                          operation: { ...form.operation, translationEnabled: checked },
                        })
                      }
                    />
                  </div>
                </section>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-6">
                <div className="grid gap-5 border-t border-[var(--color-divider)] pt-5">
                  <Checkbox
                    checked={form.application.enabled}
                    description="응모를 사용하면 기간·결과 발표 일시·정원을 함께 전송합니다."
                    label="팬 응모를 진행합니다."
                    onChange={(event) => setForm({
                      ...form,
                      application: { ...form.application, enabled: event.target.checked },
                    })}
                  />
                  {form.application.enabled ? (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <TextField label="응모 시작 일시" required reserveMessageSpace type="datetime-local" value={form.application.startAt ?? ''} onChange={(event) => setForm({ ...form, application: { ...form.application, startAt: event.target.value } })} />
                      <TextField error={applicationEndError} label="응모 종료 일시" required reserveMessageSpace type="datetime-local" value={form.application.endAt ?? ''} onChange={(event) => setForm({ ...form, application: { ...form.application, endAt: event.target.value } })} />
                      <TextField error={resultAnnouncementError} label="결과 발표 일시" required reserveMessageSpace type="datetime-local" value={form.application.resultAnnouncementAt ?? ''} onChange={(event) => setForm({ ...form, application: { ...form.application, resultAnnouncementAt: event.target.value } })} />
                      <TextField label="응모 정원" min={1} required type="number" value={form.application.capacity} onChange={(event) => setForm({ ...form, application: { ...form.application, capacity: Number(event.target.value) } })} />
                    </div>
                  ) : (
                    <AlertBanner title="응모 없이 발행할 수 없습니다" variant="warning">
                      현재 참가자를 직접 등록할 수 없습니다. 응모를 끄면 참가자와 대기열을
                      구성할 수 없어 팬미팅을 진행할 수 없습니다.
                    </AlertBanner>
                  )}
                </div>

                <div className="grid gap-5 border-t border-[var(--color-divider)] pt-5">
                {form.application.enabled ? (
                  <>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      팬이 응모할 때 작성할 질문입니다. 단답형과 장문형을 사용할 수 있으며,
                      응모가 시작된 뒤에는 수정할 수 없습니다.
                    </p>
                    <Textarea
                      label="응모 폼 안내 문구"
                      onChange={(event) => setFormDescription(event.target.value)}
                      placeholder="응모자에게 보여 줄 안내 문구를 입력해 주세요."
                      rows={3}
                      value={formDescription}
                    />
                    {questions.length > 0 ? (
                      <div className="grid gap-4">
                        {questions.map((question, index) => (
                          <div className="grid gap-4 border-t border-[var(--color-divider)] pt-5" key={question.key}>
                            <div className="flex items-center justify-between gap-3">
                              <strong className="text-sm text-[var(--color-text-primary)]">질문 {index + 1}</strong>
                              <Button
                                onClick={() => setQuestionDeleteTarget(question.key)}
                                size="sm"
                                type="button"
                                variant="danger"
                              >
                                삭제
                              </Button>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                              <TextField
                                containerClassName="sm:col-span-2"
                                label="질문 내용"
                                onChange={(event) =>
                                  setQuestions((items) =>
                                    items.map((item) =>
                                      item.key === question.key ? { ...item, questionText: event.target.value } : item,
                                    ),
                                  )
                                }
                                placeholder="예: 이번 팬미팅에서 가장 나누고 싶은 이야기는 무엇인가요?"
                                value={question.questionText}
                              />
                              <Select
                                label="답변 형식"
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
                                  { value: 'SHORT_TEXT', label: '단답형' },
                                  { value: 'LONG_TEXT', label: '장문형' },
                                ]}
                                value={question.questionType}
                              />
                            </div>
                            <Checkbox
                              checked={question.required}
                              label="필수 응답 질문입니다."
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
                        질문 추가 ({questions.length}/{MAX_DRAFT_QUESTIONS})
                      </Button>
                      {questions.length >= MAX_DRAFT_QUESTIONS ? (
                        <p className="mt-2 text-sm font-medium text-[var(--color-text-muted)]">
                          응모 질문은 최대 {MAX_DRAFT_QUESTIONS}개까지 등록할 수 있습니다.
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    응모를 사용하지 않는 팬미팅이라 응모 폼을 만들지 않습니다. 다음 단계로 넘어가 주세요.
                  </p>
                )}
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="grid gap-6">
                <div className="grid gap-6 border-t border-[var(--color-divider)] pt-5 lg:grid-cols-[1.1fr_1fr] lg:gap-9">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-muted)]">팬에게 보이는 화면</p>
                    {form.coverImageUrl?.trim() ? (
                      <img
                        alt={`${form.title} 대표 이미지`}
                        className="mt-3 aspect-[16/10] w-full rounded-[var(--radius-panel)] border-b-2 border-[var(--color-primary-coral)] object-cover"
                        src={form.coverImageUrl}
                      />
                    ) : null}
                    <p className="mt-4 text-sm font-extrabold text-[var(--color-primary-coral)]" role="status">모집 중</p>
                    <h3 className="mj-font-title mt-2 text-2xl tracking-[-0.038em] text-[var(--color-text-primary)]">{form.title}</h3>
                    <p className="mt-2 text-base font-medium text-[var(--color-text-muted)]">
                      인플루언서 {isInfluencerAccount ? influencerNickname : `사용자 #${form.influencerId || '-'}`}
                    </p>
                    {form.description?.trim() ? (
                      <p className="mt-3 whitespace-pre-wrap text-base font-medium leading-[1.75] text-[var(--color-text-body)]">{form.description}</p>
                    ) : null}
                  </div>

                  <dl className="grid content-start">
                    {[
                      ['팬미팅 시작', formatDateTime(form.scheduledStartAt)],
                      ['1인 통화 시간', formatCallDuration(form.operation.callDurationSec)],
                      ['모집 인원', `${form.application.capacity}명`],
                      ['응모 시작', formatDateTime(form.application.startAt)],
                      ['응모 마감', formatDateTime(form.application.endAt)],
                      ['결과 발표', formatDateTime(form.application.resultAnnouncementAt)],
                      ['대기열 오픈', formatDateTime(form.operation.queueOpenAt)],
                      ['통화 녹화', form.operation.recordingEnabled ? '사용' : '사용 안 함'],
                      ['실시간 번역', form.operation.translationEnabled ? '사용' : '사용 안 함'],
                      ['재접속 허용', form.operation.reconnectGraceSec == null ? '서비스 기본값' : `${form.operation.reconnectGraceSec}초`],
                      ['최대 재호출', form.operation.maxRecallCount == null ? '서비스 기본값' : `${form.operation.maxRecallCount}회`],
                      ['응모 폼 안내', formDescription.trim() ? '등록' : '등록 안 함'],
                      ['응모 질문', questions.length > 0 ? '등록' : '등록 안 함'],
                    ].map(([label, value]) => (
                      <div className="flex items-baseline justify-between gap-5 border-b border-[var(--color-border-row)] py-3" key={label}>
                        <dt className="whitespace-nowrap text-sm font-semibold text-[var(--color-text-muted)]">{label}</dt>
                        <dd className="m-0 text-right text-base font-extrabold tabular-nums text-[var(--color-text-primary)]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <Checkbox
                  checked={readyToPublish}
                  description="발행하면 팬에게 즉시 공개되고 응모 시작 일시에 접수가 열립니다."
                  label="팬미팅 정보와 홍보·응모 설정을 모두 확인했습니다."
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
              ? '필수 입력 항목을 모두 입력해야 다음 단계로 이동할 수 있습니다.'
              : step === 1
                ? !Number.isInteger(form.operation.callDurationSec) || form.operation.callDurationSec <= 0
                  ? '1인 통화 시간을 선택해야 다음 단계로 이동할 수 있습니다.'
                  : !form.operation.queueOpenAt
                    ? '대기열 오픈 일시를 입력해야 다음 단계로 이동할 수 있습니다.'
                    : !operationPoliciesValid
                      ? '진행 정책 값은 비워 두거나 0 이상의 정수로 입력해야 합니다.'
                      : queueOpenError
                : step === 3
                  ? !questionsComplete
                    ? '빈 응모 질문을 작성하거나 삭제해야 다음 단계로 이동할 수 있습니다.'
                    : !applicationScheduleComplete
                      ? '응모 일정·결과 발표 일시·응모 정원을 모두 입력해야 다음 단계로 이동할 수 있습니다.'
                      : scheduleErrors[0]
                  : step === LAST_STEP
                    ? !basicInformationComplete
                      ? '팬미팅 정보의 필수 입력 항목을 모두 입력해야 발행할 수 있습니다.'
                      : !operationComplete
                        ? '영상통화 운영의 필수 설정을 모두 확인해야 발행할 수 있습니다.'
                        : !form.application.enabled
                          ? '응모를 사용하지 않으면 팬미팅을 발행할 수 없습니다.'
                          : !applicationComplete
                            ? '응모 일정과 응모 폼을 모두 확인해야 발행할 수 있습니다.'
                            : !readyToPublish
                              ? '팬미팅 정보 확인에 동의해야 발행할 수 있습니다.'
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
          nextLabel={step === LAST_STEP ? '팬미팅 발행' : '다음 단계'}
        />
        </fieldset>
      </form>
      <Dialog
        description="발행하면 팬에게 즉시 공개되고 응모 시작 일시에 접수가 열립니다."
        footer={
          <>
            <Button disabled={submitting} onClick={() => setPublishDialogOpen(false)} variant="outline">
              취소
            </Button>
            <Button
              loading={submitting}
              onClick={() => {
                setPublishDialogOpen(false)
                void saveMeeting()
              }}
            >
              팬미팅 발행
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!submitting) setPublishDialogOpen(open)
        }}
        open={publishDialogOpen}
        title="팬미팅을 발행할까요?"
      />
      <Dialog
        description="삭제한 질문과 입력한 내용은 복구할 수 없습니다."
        footer={
          <>
            <Button onClick={() => setQuestionDeleteTarget(undefined)} variant="outline">
              취소
            </Button>
            <Button
              onClick={() => {
                setQuestions((items) => items.filter((item) => item.key !== questionDeleteTarget))
                setQuestionDeleteTarget(undefined)
              }}
              variant="danger"
            >
              질문 삭제
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open) setQuestionDeleteTarget(undefined)
        }}
        open={questionDeleteTarget !== undefined}
        title="이 질문을 삭제할까요?"
      />
      <Dialog
        description="현재 브라우저에 자동 저장된 작성 내용이 삭제되며 복구할 수 없습니다."
        footer={
          <>
            <Button onClick={() => setNewStartDialogOpen(false)} variant="outline">
              취소
            </Button>
            <Button onClick={startNewMeeting} variant="danger">
              새로 시작
            </Button>
          </>
        }
        onOpenChange={setNewStartDialogOpen}
        open={newStartDialogOpen}
        title="새 팬미팅으로 다시 시작할까요?"
      />
      <Dialog
        description="현재 작성 내용은 이 브라우저에 자동 저장됩니다. 그래도 화면에서 나가시겠습니까?"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                if (navigationBlocker.state === 'blocked') navigationBlocker.reset()
              }}
              variant="outline"
            >
              계속 작성
            </Button>
            {/* 초안을 남기지 않고 나갈 수단이 없으면 다음 방문에서 또 복구되어 새로 만들 수 없다. */}
            <Button onClick={discardAndLeave} variant="ghost">
              초안 버리고 나가기
            </Button>
            <Button onClick={proceedBlockedNavigation} variant="danger">
              저장하지 않고 나가기
            </Button>
          </div>
        }
        onOpenChange={(open) => {
          if (!open && navigationBlocker.state === 'blocked') navigationBlocker.reset()
        }}
        open={navigationBlocker.state === 'blocked'}
        title="팬미팅 작성을 중단할까요?"
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          같은 계정과 브라우저로 돌아오면 첫 단계부터 이어서 작성할 수 있습니다.
        </p>
      </Dialog>
    </div>
  )
}

/** 팬미팅 공지를 실제 API로 조회·작성·수정·삭제하는 관리 페이지다. */
export function ManagerNoticesPage() {
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const [meetingTitle, setMeetingTitle] = useState('팬미팅')
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
      setError('팬미팅 식별자가 없습니다.')
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
      setError(toErrorMessage(cause, '공지 목록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
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
        if (!controller.signal.aborted) setError(toErrorMessage(cause, '공지 내용을 불러오지 못했습니다.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })

    return () => controller.abort()
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
      setEditorError('첨부파일을 올리려면 먼저 로그인해 주세요.')
      return
    }

    const room = NOTICE_ATTACHMENT_MAX_COUNT - attachments.length
    if (room <= 0) {
      setEditorError(`첨부파일은 최대 ${NOTICE_ATTACHMENT_MAX_COUNT}개까지 연결할 수 있습니다.`)
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
          `첨부파일은 최대 ${NOTICE_ATTACHMENT_MAX_COUNT}개까지 연결할 수 있어 ${files.length - room}개는 제외했습니다.`,
        )
      }
    } catch (cause) {
      setEditorError(toErrorMessage(cause, '첨부파일을 올리지 못했습니다.'))
    } finally {
      setUploading(false)
    }
  }

  async function submitNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const token = getAuthSession()?.accessToken
    if (!token) {
      setEditorError('공지를 저장하려면 먼저 로그인해 주세요.')
      return
    }

    if (!title.trim() || !content.trim()) {
      setEditorError('제목과 내용을 모두 입력해 주세요.')
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
        setMessage('공지를 수정했습니다.')
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
        setMessage('공지를 등록했습니다.')
        setSelectedId(created.noticeId)
      }
      setCreating(false)
      await loadList()
    } catch (cause) {
      setEditorError(toErrorMessage(cause, '공지를 저장하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  async function removeNotice(target: NoticeDetailResponse) {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('공지를 삭제하려면 먼저 로그인해 주세요.')
      return
    }

    setDeleting(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await deleteMeetingNotice(meetingId, target.noticeId, token)
      setMessage('공지를 삭제했습니다.')
      setSelectedId(undefined)
      setDetail(undefined)
      setDeleteTarget(undefined)
      await loadList()
    } catch (cause) {
      setError(toErrorMessage(cause, '공지를 삭제하지 못했습니다.'))
    } finally {
      setDeleting(false)
    }
  }

  const selectedStatus = creating ? '초안' : detail?.pinned ? '고정' : '게시'
  const selectedStatusClass = creating || !detail?.pinned
    ? creating
      ? 'text-[var(--color-text-secondary)]'
      : 'text-[var(--color-success)]'
    : 'text-[var(--color-primary-coral)]'
  const canEdit = creating || detail?.canEdit === true
  const requiredFieldsReady = title.trim().length > 0 && content.trim().length > 0
  const canSave = canEdit && requiredFieldsReady && !saving && !uploading
  const saveHint = !canEdit
    ? '이 공지는 수정할 수 없습니다.'
    : !requiredFieldsReady
      ? '제목과 내용을 모두 입력해야 저장할 수 있습니다.'
      : uploading
        ? '첨부파일 업로드가 끝나면 저장할 수 있습니다.'
        : creating
          ? '저장하면 참가자가 공지를 확인할 수 있습니다.'
          : '변경한 내용을 저장합니다.'

  return (
    <div className="pb-10">
      <Link
        className="text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        to={`/manager/fan-meetings/${meetingId}/monitor`}
      >
        ← 모니터링으로 돌아가기
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-black tracking-[-0.035em]">공지 관리</h1>
        <p className="mt-2 text-sm font-medium text-[var(--color-text-secondary)]">
          {meetingTitle} · 참가자에게 전달할 안내를 관리하세요.
        </p>
      </header>

      <div className="mt-6 grid gap-3">
        {error ? <AlertBanner title="공지 관리 요청 실패" variant="error">{error}</AlertBanner> : null}
        {message ? <AlertBanner onDismiss={() => setMessage(undefined)} title="처리 완료" variant="success">{message}</AlertBanner> : null}
      </div>

      <div className="mt-6 grid items-start gap-7 border-t border-[var(--color-divider)] pt-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="공지 목록" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-extrabold">
              공지 목록{' '}
              <span className="font-semibold tabular-nums text-[var(--color-text-secondary)]">
                {pageData ? `${pageData.totalElements}개` : '-'}
              </span>
            </h2>
            <Button onClick={openNewNotice} size="sm" variant="outline">새 공지</Button>
          </div>

          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <Spinner label="공지 목록을 불러오는 중" />
            </div>
          ) : !pageData || pageData.content.length === 0 ? (
            <div className="mt-5 rounded-[var(--radius-control)] border border-dashed border-[var(--color-border-control)] px-5 py-10 text-center" role="status">
              <strong className="block text-base font-extrabold">등록된 공지가 없습니다</strong>
              <span className="mt-2 block text-sm font-medium leading-6 text-[var(--color-text-secondary)]">
                팬미팅 운영 안내를 새 공지로 작성해 주세요.
              </span>
              <Button className="mt-4" onClick={openNewNotice}>새 공지 작성</Button>
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
                        {notice.pinned ? '고정' : '게시'}
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

        <section aria-label="공지 편집" className="min-w-0">
          {detailLoading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Spinner label="공지 내용을 불러오는 중" />
            </div>
          ) : creating || detail ? (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-extrabold tracking-[-0.03em]">
                  {creating ? '새 공지 작성' : '공지 편집'}
                </h2>
                <span className={`whitespace-nowrap text-sm font-extrabold ${selectedStatusClass}`}>
                  {selectedStatus}
                </span>
              </div>

              <form className="mt-5 grid gap-4" id="manager-notice-form" onSubmit={submitNotice}>
                <TextField
                  disabled={!canEdit}
                  label="제목"
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="공지 제목을 입력하세요"
                  required
                  value={title}
                />
                <Textarea
                  disabled={!canEdit}
                  label="내용"
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="참가자에게 전달할 내용을 입력하세요"
                  required
                  rows={7}
                  value={content}
                />

                <fieldset className="grid gap-3">
                  <legend className="text-sm font-bold text-[var(--color-text-secondary)]">
                    첨부파일{' '}
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
                  {uploading ? <p className="text-sm text-[var(--color-text-secondary)]">첨부파일을 올리는 중입니다.</p> : null}
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
                              제거
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </fieldset>

                {editorError ? <AlertBanner title="저장 실패" variant="error">{editorError}</AlertBanner> : null}

                <div className="mt-1 flex flex-wrap gap-3 border-t border-[var(--color-divider)] pt-5">
                  <Button
                    disabled={!canSave}
                    loading={saving}
                    title={!canSave ? saveHint : undefined}
                    type="submit"
                  >
                    {creating ? '공지 등록' : canEdit ? '수정 저장' : '수정 불가'}
                  </Button>
                  {!creating && detail?.canDelete ? (
                    <Button className="ml-auto" onClick={() => setDeleteTarget(detail)} variant="danger">
                      삭제
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
        description="삭제하면 되돌릴 수 없습니다."
        footer={
          <>
            <Button disabled={deleting} onClick={() => setDeleteTarget(undefined)} variant="outline">취소</Button>
            <Button
              disabled={deleting}
              loading={deleting}
              onClick={() => deleteTarget && void removeNotice(deleteTarget)}
              variant="danger"
            >
              삭제
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(undefined)
        }}
        open={deleteTarget !== undefined}
        title="이 공지를 삭제할까요?"
      />
    </div>
  )
}

/** 초 단위를 mm:ss 문자열로 표시한다. */
function formatMinuteSecond(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** 초 단위를 시간·분 단위의 한국어 문구로 표시한다. */
function formatLongDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return `${hours}시간 ${minutes}분`
  if (minutes > 0) return `${minutes}분 ${rest}초`
  return `${rest}초`
}

/** 팬미팅 운영 결과 지표를 실제 통계 API로 보여주는 페이지다. */
export function ManagerStatisticsPage() {
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const [stats, setStats] = useState<FanMeetingStatisticsResponse>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!meetingId) {
      setError('팬미팅 식별자가 없습니다.')
      setLoading(false)
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('통계를 조회하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    const controller = new AbortController()
    getFanMeetingStatistics(meetingId, token, controller.signal)
      .then(setStats)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(toErrorMessage(cause, '팬미팅 통계를 불러오지 못했습니다.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [meetingId])

  const completionPercent = stats && stats.participantCount > 0
    ? Math.round((stats.completedCallCount / stats.participantCount) * 100)
    : 0

  const metrics: Array<[string, string]> = stats
    ? [
        ['응모자', `${stats.applicationCount}명`],
        ['당첨자', `${stats.selectedCount}명`],
        ['참가자', `${stats.participantCount}명`],
        ['완료 통화', `${stats.completedCallCount}건`],
        ['노쇼', `${stats.noShowCount}명`],
        ['실패 통화', `${stats.failedCallCount}건`],
        ['평균 통화 시간', formatMinuteSecond(stats.averageCallDurationSec)],
        ['총 진행 시간', formatLongDuration(stats.totalMeetingDurationSec)],
      ]
    : []

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader title="팬미팅 통계" description="팬미팅 진행률과 통화 운영 결과를 한눈에 확인하세요." backTo={`/manager/fan-meetings/${meetingId}/monitor`} />
      {error ? <AlertBanner title="통계 조회 실패" variant="error">{error}</AlertBanner> : null}
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center"><Spinner label="팬미팅 통계를 불러오는 중" /></div>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(([label, value]) => (
              <Card className="p-5" key={label}>
                <p className="text-sm text-[var(--color-text-secondary)]">{label}</p>
                <p className="mt-3 text-3xl font-black">{value}</p>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle as="h2">통화 완료 현황</CardTitle></CardHeader>
            <CardContent className="grid gap-5">
              <div className="flex items-center justify-between text-sm">
                <span>완료 {stats.completedCallCount}건 / 참가자 {stats.participantCount}명</span>
                <strong className="text-[var(--color-primary-coral)]">{completionPercent}%</strong>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-[var(--color-surface-page)]">
                <div className="h-full rounded-full bg-[var(--color-primary-coral)]" style={{ width: `${Math.min(100, completionPercent)}%` }} />
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

/** 위험 감지 통화 세션을 확인하고 필요하면 강제 종료하는 처리 페이지다. */
export function ManagerRiskIncidentPage() {
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? 'demo-meeting'
  const [params] = useSearchParams()
  const callSessionId = params.get('callSessionId')?.trim()
  const [reason, setReason] = useState('운영자 판단에 따른 강제 종료')
  const [submitting, setSubmitting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<string>()

  /** URL로 전달된 통화 세션 ID를 사용해 백엔드 강제 종료 API를 호출한다. */
  async function forceEnd() {
    if (!callSessionId) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('강제 종료하려면 먼저 로그인해 주세요.')
      return
    }

    setSubmitting(true)
    setError(undefined)
    try {
      await forceEndCallSession(callSessionId, { reason }, { authToken: token })
      setEnded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '통화 강제 종료에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader eyebrow="CALL OPERATION" title="위험 상황 처리" description="현재 통화 세션을 확인하고 필요한 경우 강제로 종료하세요." backTo={`/manager/fan-meetings/${meetingId}/monitor`} />
      <AlertBanner title="AI 위험 감지 API는 아직 구현되지 않았습니다" variant="warning">
        감지 유형·신뢰도·판단 저장 기능은 표시하지 않습니다. 현재 백엔드에서 지원하는 통화 강제 종료만 사용할 수 있습니다.
      </AlertBanner>
      {!callSessionId ? (
        <AlertBanner title="통화 세션 정보가 필요합니다" variant="error">
          모니터링 화면의 현재 통화에서 진입하거나 URL에 <code>callSessionId</code>를 전달해 주세요.
        </AlertBanner>
      ) : (
        <Card>
          <CardHeader>
            <Badge variant="danger">세션 {callSessionId}</Badge>
            <CardTitle as="h2" className="mt-3">현재 영상통화 강제 종료</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            {/* 백엔드 ForceEndCallRequest의 255자 제한을 입력 단계에서 동일하게 적용한다. */}
            <Textarea label="강제 종료 사유" maxLength={255} required rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />
            <Button disabled={submitting || ended || !reason.trim()} onClick={forceEnd} variant="danger">
              {ended ? '강제 종료 완료' : submitting ? '종료 처리 중…' : '현재 통화 강제 종료'}
            </Button>
            {error ? <AlertBanner title="강제 종료 실패" variant="error">{error}</AlertBanner> : null}
            {ended ? <AlertBanner title="통화를 종료했습니다" variant="success">서버에서 강제 종료 결과를 확인했습니다.</AlertBanner> : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
