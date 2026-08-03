import {
  ArrowLeft,
  ArrowRight,
  Check,
  FloppyDisk,
  Key,
  PencilSimple,
  Plus,
  Trash,
  VideoCamera,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ApiError } from '../../api/ApiError'
import { getApplicationForm, saveApplicationForm } from '../../api/applications'
import { getAuthSession, replaceAuthSession } from '../../api/authSession'
import { forceEndCallSession } from '../../api/callSessions'
import type { PageResponse } from '../../api/envelope'
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
import {
  fetchOwnedMeetings,
  type ManagerMeetingSummary,
} from '../../api/managerMeetings'
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
  type NoticeDetailResponse,
  type NoticeSummaryResponse,
} from '../../api/notices'
import {
  getMyProfile,
  updateMyProfile,
  type UserProfile,
} from '../../api/users'
import { getMyOrganization, type OrganizationMember } from '../../api/organizations'
import { AlertBanner, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Dialog, Pagination, Select, Spinner, TextField, Textarea } from '../../components'
import {
  formatDateTime,
  getScheduleErrors,
  toApiLocalDateTime,
  toDateTimeLocalValue,
  toErrorMessage,
} from './meetingLifecycle'
import {
  clearMeetingCreateLocalDraft,
  createInitialMeetingForm,
  hasMeaningfulMeetingDraft,
  nextDraftQuestionKey,
  readMeetingCreateLocalDraft,
  writeMeetingCreateLocalDraft,
  type DraftFormQuestion,
} from './managerMeetingCreateDraft'

const DRAFT_PAGE_SIZE = 5

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
function Stepper({ step, labels = ['기본 정보', '응모 설정', '미리보기'] }: { step: number; labels?: string[] }) {
  return <ol className="mx-auto grid w-full max-w-4xl gap-0 px-5 py-8 sm:px-12 sm:py-10" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
    {labels.map((label, index) => <li className="relative text-center" key={label}>
      {index < labels.length - 1 ? <span className={`absolute left-1/2 right-[-50%] top-8 h-px ${index < step ? 'bg-gradient-to-r from-[var(--color-primary-coral)] to-[var(--color-success)]' : 'bg-[var(--color-divider)]'}`} /> : null}
      <span className="relative z-10 mx-auto block size-16">
        {index <= step ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 sm:size-52"
            style={{
              background: index < step
                ? 'radial-gradient(circle, rgba(52, 211, 153, 0.5) 0%, rgba(52, 211, 153, 0.16) 42%, rgba(52, 211, 153, 0) 72%)'
                : 'radial-gradient(circle, rgba(255, 92, 138, 0.58) 0%, rgba(255, 126, 103, 0.2) 40%, rgba(255, 126, 103, 0) 72%)',
              filter: 'blur(34px)',
            }}
          />
        ) : null}
        <span className={`relative z-10 mx-auto flex size-14 items-center justify-center rounded-full border text-sm font-black transition-shadow duration-300 ${index < step ? 'border-emerald-300 bg-[var(--color-success)] text-white shadow-[0_0_0_7px_rgba(16,185,129,0.08)]' : index === step ? 'border-orange-200 bg-[var(--color-primary-coral)] text-white shadow-[0_0_0_8px_rgba(255,126,103,0.10)]' : 'border-[var(--color-border-control)] bg-white text-[var(--color-text-tertiary)] shadow-sm'}`}>{index < step ? <Check size={19} weight="bold" /> : index + 1}</span>
      </span>
      <span className={`mt-4 block text-sm font-bold ${index === step ? 'text-[var(--color-primary-coral)]' : 'text-[var(--color-text-secondary)]'}`}>{label}</span>
    </li>)}
  </ol>
}

/** 단계형 폼의 임시 저장, 이전 단계, 다음 단계 버튼을 공통 배치한다. */
function FormActions({ onBack, onSave, saveLabel = '임시 저장', nextLabel = '다음 단계', nextDisabled = false, nextLoading = false }: { onBack?: () => void; onSave?: () => void; saveLabel?: string; nextLabel?: string; nextDisabled?: boolean; nextLoading?: boolean }) {
  return <div className="flex flex-wrap items-center justify-end gap-3">{onSave ? <Button disabled={nextLoading} leadingIcon={<FloppyDisk size={18} />} onClick={onSave} variant="secondary">{saveLabel}</Button> : null}<div className="flex gap-2">{onBack ? <Button disabled={nextLoading} leadingIcon={<ArrowLeft size={18} />} onClick={onBack} variant="secondary">이전 단계</Button> : null}<Button disabled={nextDisabled} loading={nextLoading} trailingIcon={<ArrowRight size={18} />} type="submit">{nextLabel}</Button></div></div>
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

/** 로컬 자동 저장이 너무 잦은 디스크 쓰기를 만들지 않도록 입력 종료를 기다리는 시간이다. */
const LOCAL_DRAFT_SAVE_DELAY_MS = 500

/** 생성 마법사의 단계 라벨과 각 단계의 제목이다. */
const STEP_LABELS = ['기본 정보', '응모·운영 설정', '응모 폼', '최종 확인']
const STEP_TITLES = [
  '팬미팅 기본 정보',
  '응모 조건과 영상통화 운영 설정',
  '팬이 작성할 응모 폼',
  '등록 내용 최종 확인',
]
const LAST_STEP = STEP_LABELS.length - 1

/**
 * 팬미팅 한 건을 처음부터 끝까지 한 번에 등록하는 생성 마법사다.
 *
 * 백엔드에는 홍보·응모용 객체와 팬미팅 객체가 따로 없으므로 화면도 하나로 두고,
 * 기본 정보 → 응모·운영 설정 → 응모 폼 → 최종 확인 순서로 값을 모아 저장한다.
 */
export function ManagerMeetingCreatePage() {
  const navigate = useNavigate()
  const session = getAuthSession()
  const isInfluencerAccount = session?.role === 'INFLUENCER' || session?.role === 'SOLO_INFLUENCER'
  const resolvedInfluencerId = isInfluencerAccount ? session?.userId : undefined
  const influencerNickname = isInfluencerAccount ? session?.nickname : undefined
  // 새로고침 직후 첫 렌더부터 로컬 초안을 사용해 빈 폼이 초안을 덮어쓰지 않게 한다.
  const restoredLocalDraftRef = useRef(readMeetingCreateLocalDraft(session?.userId))
  const restoredLocalDraft = restoredLocalDraftRef.current
  const [step, setStep] = useState(restoredLocalDraft?.step ?? 0)
  const [form, setForm] = useState<FanMeetingForm>(() => {
    const restoredForm = restoredLocalDraft?.form
    if (!restoredForm) return createInitialMeetingForm(resolvedInfluencerId)

    return isInfluencerAccount && resolvedInfluencerId
      ? { ...restoredForm, influencerId: resolvedInfluencerId }
      : restoredForm
  })

  function applyRecommendedSchedule() {
    const scheduled = new Date(form.scheduledStartAt)
    if (Number.isNaN(scheduled.getTime())) return
    const localValue = (date: Date) => {
      const pad = (value: number) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    }
    const applicationStart = new Date(scheduled.getTime() - 7 * 24 * 60 * 60_000)
    const applicationEnd = new Date(scheduled.getTime() - 24 * 60 * 60_000)
    const resultAnnouncement = new Date(scheduled.getTime() - 12 * 60 * 60_000)
    const queueOpen = new Date(scheduled.getTime() - 30 * 60_000)
    const minimumStart = new Date(Date.now() + 5 * 60_000)
    const safeApplicationStart = applicationStart < minimumStart ? minimumStart : applicationStart
    setForm((current) => ({
      ...current,
      application: {
        ...current.application,
        startAt: localValue(safeApplicationStart),
        endAt: localValue(applicationEnd),
        resultAnnouncementAt: localValue(resultAnnouncement),
      },
      operation: { ...current.operation, queueOpenAt: localValue(queueOpen) },
    }))
  }
  const [createdMeetingId, setCreatedMeetingId] = useState<number | undefined>(
    restoredLocalDraft?.createdMeetingId,
  )
  const [createdMeetingStatus, setCreatedMeetingStatus] = useState<
    'DRAFT' | 'PUBLISHED' | undefined
  >(restoredLocalDraft?.createdMeetingId ? 'DRAFT' : undefined)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [errorTitle, setErrorTitle] = useState('입력 확인')
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
  const [draftDialogOpen, setDraftDialogOpen] = useState(false)
  const [draftMeetings, setDraftMeetings] = useState<
    ManagerMeetingSummary[]
  >([])
  const [draftPage, setDraftPage] = useState(1)
  const [draftTotalPages, setDraftTotalPages] = useState(1)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string>()
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
  const allowNavigationRef = useRef(false)
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

  /** 각 단계 입력을 브라우저에 자동 저장해 새로고침이나 탭 종료 뒤에도 복구한다. */
  useEffect(() => {
    if (createdMeetingStatus === 'PUBLISHED') return

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

  async function openDraftDialog() {
    setDraftDialogOpen(true)
    setDraftPage(1)
    await loadDraftMeetings(1)
  }

  async function loadDraftMeetings(page: number) {
    setDraftLoading(true)
    setDraftError(undefined)

    const token = getAuthSession()?.accessToken
    if (!token) {
      setDraftError('초안을 확인하려면 먼저 로그인해 주세요.')
      setDraftLoading(false)
      return
    }

    try {
      const result = await fetchOwnedMeetings(
        {
          status: 'DRAFT',
          page: page - 1,
          size: DRAFT_PAGE_SIZE,
        },
        token,
      )
      setDraftMeetings(result.content)
      setDraftPage(result.page + 1)
      setDraftTotalPages(result.totalPages)
    } catch (reason) {
      setDraftError(
        reason instanceof Error
          ? reason.message
          : '초안 목록을 불러오지 못했습니다.',
      )
    } finally {
      setDraftLoading(false)
    }
  }

  async function loadDraftDetail(meetingId: string) {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setDraftError('초안을 확인하려면 먼저 로그인해 주세요.')
      return
    }

    const numericMeetingId = Number(meetingId)
    if (!Number.isInteger(numericMeetingId) || numericMeetingId <= 0) {
      setDraftError('초안 ID가 올바르지 않습니다.')
      return
    }

    setDraftLoading(true)
    setDraftError(undefined)
    try {
      const detail = await fetchPublicFanMeetingDetail(
        numericMeetingId,
        token,
      )
      const { meeting } = detail
      let loadedFormDescription = ''
      let loadedQuestions: DraftFormQuestion[] = []

      if (meeting.application.enabled) {
        try {
          // 팬미팅 본문과 별도인 응모 폼 API도 함께 복구해야 저장 시 기존 질문을 잃지 않는다.
          const applicationForm = await getApplicationForm(
            numericMeetingId,
            undefined,
            token,
          )
          loadedFormDescription = applicationForm.formDescription ?? ''
          loadedQuestions = applicationForm.questions
            .slice()
            .sort((left, right) => left.displayOrder - right.displayOrder)
            .map((question) => ({
              key: nextQuestionKey.current++,
              questionId: question.questionId,
              questionText: question.questionText,
              questionType:
                question.questionType === 'LONG_TEXT' ? 'LONG_TEXT' : 'SHORT_TEXT',
              required: question.required,
            }))
        } catch (reason) {
          // 아직 응모 폼을 저장하지 않은 서버 초안은 빈 폼으로 계속 편집할 수 있다.
          if (!(reason instanceof ApiError && reason.status === 404)) throw reason
        }
      }

      setForm({
        influencerId: meeting.influencerId,
        title: meeting.title,
        description: meeting.description,
        coverImageUrl: meeting.coverImageUrl,
        scheduledStartAt: toDateTimeLocalValue(meeting.scheduledStartAt),
        application: {
          enabled: meeting.application.enabled,
          startAt: meeting.application.startAt
            ? toDateTimeLocalValue(meeting.application.startAt)
            : null,
          endAt: meeting.application.endAt
            ? toDateTimeLocalValue(meeting.application.endAt)
            : null,
          resultAnnouncementAt: meeting.application.resultAnnouncementAt
            ? toDateTimeLocalValue(
                meeting.application.resultAnnouncementAt,
              )
            : null,
          capacity: meeting.application.capacity,
        },
        operation: {
          queueOpenAt: toDateTimeLocalValue(meeting.operation.queueOpenAt),
          callDurationSec: meeting.operation.callDurationSec,
          recordingEnabled: meeting.operation.recordingEnabled,
          translationEnabled: meeting.operation.translationEnabled,
          reconnectGraceSec: meeting.operation.reconnectGraceSec,
          earlyStartMinutes: meeting.operation.earlyStartMinutes,
          maxRecallCount: meeting.operation.maxRecallCount,
        },
      })
      setFormDescription(loadedFormDescription)
      setQuestions(loadedQuestions)
      setCreatedMeetingId(meeting.meetingId)
      setCreatedMeetingStatus('DRAFT')
      setStep(0)
      setError(undefined)
      setLocalDraftState('saving')
      setDraftDialogOpen(false)
    } catch (reason) {
      setDraftError(
        reason instanceof Error
          ? reason.message
          : '초안 상세 정보를 불러오지 못했습니다.',
      )
    } finally {
      setDraftLoading(false)
    }
  }

  /**
   * 팬미팅을 생성하거나 기존 초안을 갱신하고, 이어서 응모 폼까지 저장한다.
   *
   * 응모 폼은 별도 엔드포인트(`PUT /application-form`)라서 팬미팅 저장 뒤에 한 번 더 호출한다.
   */
  async function saveMeeting(publishAfterCreate: boolean) {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setErrorTitle('로그인 필요')
      setError('팬미팅을 등록하려면 먼저 로그인해 주세요.')
      return
    }

    if (form.application.enabled && questions.some((question) => !question.questionText.trim())) {
      setErrorTitle('입력 확인')
      setError('응모 질문 내용을 모두 입력하거나 빈 질문을 삭제해 주세요.')
      return
    }

    if (questions.length > MAX_DRAFT_QUESTIONS) {
      setErrorTitle('입력 확인')
      setError(`응모 질문은 최대 ${MAX_DRAFT_QUESTIONS}개까지 등록할 수 있습니다.`)
      return
    }

    if (publishAfterCreate && !form.application.enabled) {
      setErrorTitle('참가자 등록 경로가 필요합니다')
      setError(
        '현재 백엔드에는 운영자가 참가자를 직접 추가하는 API가 없어 응모 없는 팬미팅을 발행하면 시작할 수 없습니다. 응모를 사용하거나, 지금은 초안으로만 저장해 주세요.',
      )
      return
    }

    const invalidPolicyValue = [
      form.operation.reconnectGraceSec,
      form.operation.earlyStartMinutes,
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

      if (publishAfterCreate) {
        await publishFanMeeting(meetingId, token)
        // 발행이 끝난 완성본은 더 이상 복구 대상이 아니므로 로컬 초안을 먼저 지운다.
        clearMeetingCreateLocalDraft(session?.userId)
        allowNavigationRef.current = true
        setCreatedMeetingStatus('PUBLISHED')
        navigate(`/manager/fan-meetings/${meetingId}`)
      } else {
        // 서버 초안 ID까지 즉시 기록해야 직후에 이탈해도 같은 초안을 갱신하며 중복 생성하지 않는다.
        const savedAt = writeMeetingCreateLocalDraft(session?.userId, {
          step,
          form,
          questions,
          formDescription,
          createdMeetingId: meetingId,
        })
        setLocalDraftState(savedAt ? 'saved' : 'error')
        if (savedAt) setLocalDraftSavedAt(savedAt)
      }
    } catch (reason) {
      setErrorTitle(
        publishAfterCreate ? '팬미팅 발행 실패' : '초안 저장 실패',
      )
      setError(
        reason instanceof Error
          ? reason.message
          : publishAfterCreate
            ? '팬미팅 발행에 실패했습니다.'
            : '초안 저장에 실패했습니다.',
      )
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
      if (step === 2 && questions.some((question) => !question.questionText.trim())) {
        setErrorTitle('입력 확인')
        setError('응모 질문 내용을 모두 입력하거나 빈 질문을 삭제해 주세요.')
        return
      }

      setError(undefined)
      setStep(step + 1)
      return
    }

    await saveMeeting(true)
  }

  /** SPA 내부 링크로 나갈 때 최신 입력을 즉시 저장한 뒤 사용자가 선택한 이동을 계속한다. */
  function proceedBlockedNavigation() {
    if (navigationBlocker.state !== 'blocked') return

    writeMeetingCreateLocalDraft(session?.userId, {
      step,
      form,
      questions,
      formDescription,
      createdMeetingId,
    })
    allowNavigationRef.current = true
    navigationBlocker.proceed()
  }

  return (
    <div className="grid gap-7 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          backTo="/manager/fan-meetings"
          description="홍보 정보와 응모 조건, 그리고 이후 영상통화 운영 조건까지 한 번에 등록합니다."
          title="팬미팅 만들기"
        />
        {createdMeetingId ? (
          <Link className="inline-flex min-h-[var(--control-height)] items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-white px-[var(--control-padding-inline)] text-sm font-semibold" to={`/manager/fan-meetings/${createdMeetingId}`}>
            생성한 팬미팅 관리로 이동 <ArrowRight size={18} />
          </Link>
        ) : null}
      </div>
      <div
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-divider)] bg-white px-4 py-3 text-sm"
        role="status"
      >
        <span className="font-semibold">
          {localDraftState === 'saving'
            ? '브라우저에 임시 저장 중…'
            : localDraftState === 'error'
              ? '브라우저 임시 저장 실패'
              : localDraftSavedAt
                ? `브라우저 임시 저장 완료 · ${formatDateTime(localDraftSavedAt)}`
                : '입력을 시작하면 이 브라우저에 자동 임시 저장됩니다.'}
        </span>
        <span className="text-xs text-[var(--color-text-secondary)]">
          서버의 ‘초안 저장’과 별개이며 발행 성공 시 자동 삭제됩니다.
        </span>
      </div>
      {restoredLocalDraft ? (
        <AlertBanner title="브라우저 임시 초안을 복구했습니다" variant="success">
          {formatDateTime(restoredLocalDraft.savedAt)}에 저장한 STEP {restoredLocalDraft.step + 1}의
          입력을 이어서 표시합니다. 서버에 저장한 초안은 ‘초안 확인’에서 별도로 불러올 수 있습니다.
        </AlertBanner>
      ) : null}
      {localDraftState === 'error' ? (
        <AlertBanner title="브라우저 임시 저장을 사용할 수 없습니다" variant="warning">
          저장소가 차단되었거나 용량이 부족할 수 있습니다. 페이지를 나가기 전에 마지막 단계의
          ‘초안 저장’을 눌러 서버에 저장해 주세요.
        </AlertBanner>
      ) : null}
      <AlertBanner title="홍보·응모와 팬미팅은 같은 한 건입니다" variant="info">
        여기에서 만든 팬미팅이 곧 팬에게 보이는 홍보·응모 페이지입니다.
        발행 → 응모 접수 → 당첨자 추첨 → 결과 발표 → 진행 순서로 상태가 바뀌며,
        추첨을 실행하면 당첨자가 참가자와 대기열로 자동 등록되므로 별도의 팬미팅을 다시 만들 필요가 없습니다.
      </AlertBanner>
      <Stepper labels={STEP_LABELS} step={step} />
      <form className="grid gap-5" onSubmit={submit}>
        <Card>
          <CardHeader>
            <Badge variant="primary">STEP {step + 1}</Badge>
            <CardTitle as="h2" className="mt-3">{STEP_TITLES[step] ?? '팬미팅 만들기'}</CardTitle>
          </CardHeader>
          <CardContent>
            {step === 0 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="팬미팅명" maxLength={200} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} helperText="팬에게 공개되는 홍보·응모 페이지의 제목입니다." />
                <div className="grid gap-2">
                  <TextField label="예정 팬미팅 일시" required type="datetime-local" value={form.scheduledStartAt} onChange={(event) => setForm({ ...form, scheduledStartAt: event.target.value })} />
                  <Button className="w-fit" onClick={applyRecommendedSchedule} type="button" variant="secondary">
                    일정 자동 설정
                  </Button>
                  <p className="text-xs text-[var(--color-text-secondary)]">시작 일시를 기준으로 응모·결과 발표·대기열 시간을 한 번에 채웁니다.</p>
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-[var(--color-divider)] bg-[var(--color-surface-page)] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--color-primary-coral)]">담당 인플루언서</p>
                  {isInfluencerAccount ? (
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <div>
                        <strong className="text-lg">{influencerNickname}</strong>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">현재 로그인한 인플루언서 계정으로 자동 연결됩니다.</p>
                      </div>
                      <Badge variant="success">자동 연결</Badge>
                    </div>
                  ) : (
                    <Select
                      containerClassName="mt-3"
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
                <Textarea
                  containerClassName="sm:col-span-2"
                  label="이벤트 상세 소개"
                  value={form.description ?? ''}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="팬에게 보여 줄 이벤트와 응모 안내를 입력해 주세요."
                />
                <TextField
                  containerClassName="sm:col-span-2"
                  helperText="이미지 업로드 API가 명세에 없으므로 접근 가능한 이미지 URL을 입력합니다."
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
              <div className="grid gap-6">
                <section className="grid gap-5 rounded-2xl border border-[var(--color-divider)] p-5">
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
                      <TextField label="응모 정원" min={1} required reserveMessageSpace type="number" value={form.application.capacity} onChange={(event) => setForm({ ...form, application: { ...form.application, capacity: Number(event.target.value) } })} />
                    </div>
                  ) : (
                    <AlertBanner title="응모 없이 발행할 수 없습니다" variant="warning">
                      현재 백엔드에는 운영자가 참가자를 직접 추가하는 API가 없습니다. 응모를 끄면
                      참가자와 대기열을 만들 수 없어 팬미팅을 시작할 수 있으므로, 이 설정은 서버
                      초안으로만 저장할 수 있습니다. 실제 운영할 팬미팅은 응모를 켜 주세요.
                    </AlertBanner>
                  )}
                </section>
                <section className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--color-primary-coral)]">영상통화 운영</p>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">당첨자 선정 뒤 진행할 팬미팅의 예정 대기열과 1명당 통화 조건입니다.</p>
                  </div>
                <TextField error={queueOpenError} label="대기열 오픈 일시" required reserveMessageSpace type="datetime-local" value={form.operation.queueOpenAt} onChange={(event) => setForm({ ...form, operation: { ...form.operation, queueOpenAt: event.target.value } })} />
                <Select label="1인 통화 시간" options={[{ value: '120', label: '2분' }, { value: '180', label: '3분' }, { value: '300', label: '5분' }]} reserveMessageSpace value={String(form.operation.callDurationSec)} onChange={(event) => setForm({ ...form, operation: { ...form.operation, callDurationSec: Number(event.target.value) } })} />
                <div className="grid gap-3 rounded-xl border border-[var(--color-divider)] p-4 sm:col-span-2">
                  <Checkbox checked={form.operation.recordingEnabled} label="통화 녹화를 사용합니다." onChange={(event) => setForm({ ...form, operation: { ...form.operation, recordingEnabled: event.target.checked } })} />
                  <Checkbox checked={form.operation.translationEnabled} label="실시간 번역을 사용합니다." onChange={(event) => setForm({ ...form, operation: { ...form.operation, translationEnabled: event.target.checked } })} />
                </div>
                <div className="grid gap-5 sm:col-span-2 sm:grid-cols-3">
                  <TextField
                    helperText="비우면 서버 기본값을 사용합니다."
                    label="재접속 허용 시간(초)"
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
                    helperText="비우면 서버 기본값을 사용합니다."
                    label="조기 시작 허용(분)"
                    min={0}
                    onChange={(event) => setForm({
                      ...form,
                      operation: {
                        ...form.operation,
                        earlyStartMinutes: event.target.value === '' ? null : Number(event.target.value),
                      },
                    })}
                    step={1}
                    type="number"
                    value={form.operation.earlyStartMinutes ?? ''}
                  />
                  <TextField
                    helperText="비우면 서버 기본값을 사용합니다."
                    label="최대 재호출 횟수"
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
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-5">
                {form.application.enabled ? (
                  <>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      팬이 응모할 때 작성할 질문입니다. 답변 형식은 백엔드가 허용하는 주관식 두 가지만 사용할 수 있으며,
                      응모가 시작된 뒤에는 수정할 수 없습니다.
                    </p>
                    <Textarea
                      label="응모 폼 안내 문구"
                      onChange={(event) => setFormDescription(event.target.value)}
                      placeholder="응모자에게 보여 줄 안내 문구를 입력해 주세요."
                      rows={3}
                      value={formDescription}
                    />
                    {questions.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-[var(--color-divider)] p-5 text-center text-sm text-[var(--color-text-secondary)]">
                        등록된 질문이 없습니다. 질문 없이 동의만 받고 응모를 받을 수도 있습니다.
                      </p>
                    ) : (
                      <div className="grid gap-4">
                        {questions.map((question, index) => (
                          <div className="grid gap-4 rounded-2xl border border-[var(--color-divider)] p-5" key={question.key}>
                            <div className="flex items-center justify-between gap-3">
                              <Badge variant="neutral">질문 {index + 1}</Badge>
                              <Button
                                leadingIcon={<Trash size={15} />}
                                onClick={() => setQuestions((items) => items.filter((item) => item.key !== question.key))}
                                size="sm"
                                type="button"
                                variant="danger"
                              >
                                삭제
                              </Button>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                              <TextField
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
                    )}
                    <div>
                      <Button
                        disabled={questions.length >= MAX_DRAFT_QUESTIONS}
                        leadingIcon={<Plus size={17} />}
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
                        variant="secondary"
                      >
                        질문 추가 ({questions.length}/{MAX_DRAFT_QUESTIONS})
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    응모를 사용하지 않는 팬미팅이라 응모 폼을 만들지 않습니다. 다음 단계로 넘어가 주세요.
                  </p>
                )}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-5">
                <section className="grid gap-5 rounded-xl bg-[var(--color-surface-page)] p-6 sm:grid-cols-[1fr_.9fr]">
                  <div>
                    <p className="text-sm font-bold text-[var(--color-primary-coral)]">기본 정보</p>
                    <h3 className="mt-3 text-2xl font-black">{form.title}</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
                      {form.description?.trim() || '등록된 소개가 없습니다.'}
                    </p>
                    <p className="mt-4 break-all text-xs text-[var(--color-text-secondary)]">
                      커버 이미지: {form.coverImageUrl?.trim() || '등록 안 함'}
                    </p>
                  </div>
                  <dl className="grid gap-3 text-sm">
                    <div className="flex justify-between gap-4 border-b py-3"><dt>인플루언서</dt><dd className="text-right font-bold">{isInfluencerAccount ? `${influencerNickname} (#${resolvedInfluencerId})` : `사용자 #${form.influencerId || '-'}`}</dd></div>
                    <div className="flex justify-between gap-4 border-b py-3"><dt>팬미팅 시작</dt><dd className="text-right font-bold">{formatDateTime(form.scheduledStartAt)}</dd></div>
                  </dl>
                </section>

                <section className="grid gap-4 rounded-xl border border-[var(--color-divider)] p-5">
                  <h3 className="text-lg font-black">응모 일정과 설정</h3>
                  {form.application.enabled ? (
                    <>
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div className="flex justify-between gap-4 border-b py-3"><dt>응모 시작</dt><dd className="text-right font-bold">{formatDateTime(form.application.startAt)}</dd></div>
                        <div className="flex justify-between gap-4 border-b py-3"><dt>응모 마감</dt><dd className="text-right font-bold">{formatDateTime(form.application.endAt)}</dd></div>
                        <div className="flex justify-between gap-4 border-b py-3"><dt>결과 발표</dt><dd className="text-right font-bold">{formatDateTime(form.application.resultAnnouncementAt)}</dd></div>
                        <div className="flex justify-between gap-4 border-b py-3"><dt>모집 정원</dt><dd className="text-right font-bold">{form.application.capacity}명</dd></div>
                      </dl>
                      <div className="rounded-xl bg-[var(--color-surface-page)] p-4 text-sm">
                        <strong>응모 폼 안내</strong>
                        <p className="mt-2 whitespace-pre-wrap text-[var(--color-text-secondary)]">
                          {formDescription.trim() || '등록된 안내 문구가 없습니다.'}
                        </p>
                      </div>
                      {questions.length > 0 ? (
                        <ol className="grid gap-3">
                          {questions.map((question, index) => (
                            <li className="rounded-xl border border-[var(--color-divider)] p-4" key={question.key}>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="neutral">질문 {index + 1}</Badge>
                                <Badge variant={question.required ? 'primary' : 'neutral'}>
                                  {question.required ? '필수' : '선택'}
                                </Badge>
                                <span className="text-xs text-[var(--color-text-secondary)]">
                                  {question.questionType === 'LONG_TEXT' ? '장문형' : '단답형'}
                                </span>
                              </div>
                              <p className="mt-3 whitespace-pre-wrap text-sm font-semibold">{question.questionText}</p>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-[var(--color-text-secondary)]">등록된 응모 질문이 없습니다.</p>
                      )}
                    </>
                  ) : (
                    <AlertBanner title="응모 사용 안 함 · 발행 불가" variant="warning">
                      참가자를 직접 등록할 백엔드 API가 없어 현재 설정으로는 운영을 시작할 수 없습니다.
                      초안으로 저장하거나 이전 단계에서 응모를 켜 주세요.
                    </AlertBanner>
                  )}
                </section>

                <section className="grid gap-4 rounded-xl border border-[var(--color-divider)] p-5">
                  <h3 className="text-lg font-black">영상통화 운영 정책</h3>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex justify-between gap-4 border-b py-3"><dt>대기열 오픈</dt><dd className="text-right font-bold">{formatDateTime(form.operation.queueOpenAt)}</dd></div>
                    <div className="flex justify-between gap-4 border-b py-3"><dt>1인 통화 시간</dt><dd className="text-right font-bold">{form.operation.callDurationSec}초</dd></div>
                    <div className="flex justify-between gap-4 border-b py-3"><dt>통화 녹화</dt><dd className="text-right font-bold">{form.operation.recordingEnabled ? '사용' : '사용 안 함'}</dd></div>
                    <div className="flex justify-between gap-4 border-b py-3"><dt>실시간 번역</dt><dd className="text-right font-bold">{form.operation.translationEnabled ? '사용' : '사용 안 함'}</dd></div>
                    <div className="flex justify-between gap-4 border-b py-3"><dt>재접속 허용</dt><dd className="text-right font-bold">{form.operation.reconnectGraceSec == null ? '서버 기본값' : `${form.operation.reconnectGraceSec}초`}</dd></div>
                    <div className="flex justify-between gap-4 border-b py-3"><dt>조기 시작 허용</dt><dd className="text-right font-bold">{form.operation.earlyStartMinutes == null ? '서버 기본값' : `${form.operation.earlyStartMinutes}분`}</dd></div>
                    <div className="flex justify-between gap-4 border-b py-3"><dt>최대 재호출</dt><dd className="text-right font-bold">{form.operation.maxRecallCount == null ? '서버 기본값' : `${form.operation.maxRecallCount}회`}</dd></div>
                  </dl>
                </section>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {error ? <AlertBanner title={errorTitle} variant="error">{error}</AlertBanner> : null}
        {createdMeetingId ? (
          <AlertBanner
            title={
              createdMeetingStatus === 'PUBLISHED'
                ? '팬미팅을 발행했습니다'
                : '팬미팅을 초안으로 저장했습니다'
            }
            variant="success"
          >
            팬미팅 ID는 {createdMeetingId}이며 현재 상태는{' '}
            {createdMeetingStatus ?? 'DRAFT'}입니다.
          </AlertBanner>
        ) : null}
        <div
          className={`flex flex-wrap items-center gap-3 ${
            step < LAST_STEP ? 'justify-between' : 'justify-end'
          }`}
        >
          {step < LAST_STEP ? (
            <Button
              leadingIcon={<FloppyDisk size={18} />}
              onClick={() => {
                void openDraftDialog()
              }}
              variant="secondary"
            >
              초안 확인
            </Button>
          ) : null}
          <FormActions
            nextDisabled={
              createdMeetingStatus === 'PUBLISHED' ||
              (step === 1 && scheduleErrors.length > 0) ||
              (step === LAST_STEP && !form.application.enabled)
            }
            nextLoading={submitting}
            onBack={step > 0 ? () => setStep(step - 1) : undefined}
            onSave={
              step === LAST_STEP
                ? () => {
                    void saveMeeting(false)
                  }
                : undefined
            }
            saveLabel="초안 저장"
            nextLabel={
              step === LAST_STEP
                ? createdMeetingStatus === 'DRAFT'
                  ? '발행하기'
                  : '저장 후 발행'
                : '다음 단계'
            }
          />
        </div>
      </form>
      <Dialog
        description="현재 계정으로 서버에 저장한 미게시 팬미팅입니다. 불러오면 지금 작성 중인 브라우저 임시 초안을 대체합니다."
        footer={
          <Button
            onClick={() => setDraftDialogOpen(false)}
            variant="secondary"
          >
            닫기
          </Button>
        }
        onOpenChange={setDraftDialogOpen}
        open={draftDialogOpen}
        title="저장된 초안"
      >
        {draftLoading ? (
          <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
            초안 목록을 불러오는 중입니다.
          </p>
        ) : draftError ? (
          <AlertBanner title="초안 조회 실패" variant="error">
            {draftError}
          </AlertBanner>
        ) : draftMeetings.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
            저장된 초안이 없습니다.
          </p>
        ) : (
          <div className="grid gap-5">
            <ul className="divide-y divide-[var(--color-divider)]">
              {draftMeetings.map((meeting) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                  key={meeting.meetingId}
                >
                  <div>
                    <strong className="block">{meeting.title}</strong>
                    <time className="mt-1 block text-xs text-[var(--color-text-secondary)]">
                      {meeting.scheduledStartAt}
                    </time>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        void loadDraftDetail(meeting.meetingId)
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      불러오기
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {draftTotalPages > 1 ? (
              <Pagination
                className="border-t border-[var(--color-divider)] pt-5"
                currentPage={draftPage}
                onPageChange={(page) => {
                  void loadDraftMeetings(page)
                }}
                totalPages={draftTotalPages}
              />
            ) : null}
          </div>
        )}
      </Dialog>
      <Dialog
        description="작성 중인 내용은 이 브라우저에 임시 저장되어 나중에 복구할 수 있습니다. 그래도 현재 화면에서 나가시겠습니까?"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                if (navigationBlocker.state === 'blocked') navigationBlocker.reset()
              }}
              variant="secondary"
            >
              계속 작성
            </Button>
            <Button onClick={proceedBlockedNavigation} variant="danger">
              임시 저장 후 나가기
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
          서버에 안전하게 보관하려면 최종 확인 단계에서 ‘초안 저장’을 사용해 주세요.
        </p>
      </Dialog>
    </div>
  )
}

/** 팬미팅 공지를 실제 API로 조회·작성·수정·삭제하는 관리 페이지다. */
export function ManagerNoticesPage() {
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const [pageData, setPageData] = useState<PageResponse<NoticeSummaryResponse>>()
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number>()
  const [detail, setDetail] = useState<NoticeDetailResponse>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  // 작성·수정 팝업 상태
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<number>()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState<string>()

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
      setSelectedId((current) => current ?? result.content[0]?.noticeId)
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
  }, [meetingId, selectedId])

  /** 새 공지 작성 또는 기존 공지 수정 팝업을 연다. */
  function openEditor(target?: NoticeDetailResponse) {
    setEditingId(target?.noticeId)
    setTitle(target?.title ?? '')
    setContent(target?.content ?? '')
    setEditorError(undefined)
    setEditorOpen(true)
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
      if (editingId !== undefined) {
        await updateMeetingNotice(meetingId, editingId, { title: title.trim(), content: content.trim() }, token)
        setMessage('공지를 수정했습니다.')
        setSelectedId(editingId)
      } else {
        const created = await createMeetingNotice(meetingId, { title: title.trim(), content: content.trim() }, token)
        setMessage('공지를 등록했습니다.')
        setSelectedId(created.noticeId)
      }
      setEditorOpen(false)
      await loadList()
    } catch (cause) {
      setEditorError(toErrorMessage(cause, '공지를 저장하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  async function removeNotice(target: NoticeDetailResponse) {
    if (!window.confirm('이 공지를 삭제할까요? 삭제하면 되돌릴 수 없습니다.')) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('공지를 삭제하려면 먼저 로그인해 주세요.')
      return
    }

    setError(undefined)
    setMessage(undefined)
    try {
      await deleteMeetingNotice(meetingId, target.noticeId, token)
      setMessage('공지를 삭제했습니다.')
      setSelectedId(undefined)
      setDetail(undefined)
      await loadList()
    } catch (cause) {
      setError(toErrorMessage(cause, '공지를 삭제하지 못했습니다.'))
    }
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader title="팬미팅 공지 관리" description="진행 중인 팬미팅의 운영 안내를 작성하고 관리하세요." backTo={`/manager/fan-meetings/${meetingId}/monitor`} />
      {error ? <AlertBanner title="공지 관리 요청 실패" variant="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner onDismiss={() => setMessage(undefined)} title="처리 완료" variant="success">{message}</AlertBanner> : null}

      <div className="flex justify-end">
        <Button leadingIcon={<Plus size={18} />} onClick={() => openEditor()}>새 공지 작성</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle as="h2">공지 목록</CardTitle></CardHeader>
          {loading ? (
            <div className="p-6 text-sm text-[var(--color-text-secondary)]">공지 목록을 불러오는 중입니다.</div>
          ) : !pageData || pageData.content.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-text-secondary)]">등록된 공지가 없습니다.</div>
          ) : (
            <>
              <div className="divide-y">
                {pageData.content.map((notice) => (
                  <button
                    className={`w-full p-5 text-left hover:bg-[var(--color-surface-page)] ${selectedId === notice.noticeId ? 'border-l-4 border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)]' : ''}`}
                    key={notice.noticeId}
                    onClick={() => setSelectedId(notice.noticeId)}
                    type="button"
                  >
                    {notice.pinned ? <Badge variant="warning">고정</Badge> : null}
                    <strong className="mt-2 block text-sm">{notice.title}</strong>
                    <span className="mt-2 block text-xs text-[var(--color-text-secondary)]">{notice.authorNickname} · {formatDateTime(notice.createdAt)}</span>
                  </button>
                ))}
              </div>
              {pageData.totalPages > 1 ? (
                <Pagination className="border-t border-[var(--color-divider)] py-3" currentPage={page + 1} onPageChange={(next) => setPage(next - 1)} totalPages={pageData.totalPages} />
              ) : null}
            </>
          )}
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge variant="primary">선택한 공지</Badge>
              <CardTitle as="h2" className="mt-3">{detail?.title ?? '공지를 선택해 주세요'}</CardTitle>
              {detail ? <p className="mt-2 text-xs text-[var(--color-text-secondary)]">{detail.authorNickname} · 작성 {formatDateTime(detail.createdAt)} · 수정 {formatDateTime(detail.updatedAt)}</p> : null}
            </div>
            {detail ? (
              <div className="flex gap-2">
                {detail.canEdit ? <Button leadingIcon={<PencilSimple size={15} />} onClick={() => openEditor(detail)} size="sm" variant="secondary">수정</Button> : null}
                {detail.canDelete ? <Button leadingIcon={<Trash size={15} />} onClick={() => void removeNotice(detail)} size="sm" variant="danger">삭제</Button> : null}
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <p className="text-sm text-[var(--color-text-secondary)]">공지 내용을 불러오는 중입니다.</p>
            ) : detail ? (
              <p className="whitespace-pre-wrap leading-7">{detail.content}</p>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">왼쪽 목록에서 공지를 선택하면 내용이 표시됩니다.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        description={editingId !== undefined ? '공지 제목과 내용을 수정합니다.' : '팬미팅 참가자에게 보여 줄 공지를 작성합니다.'}
        footer={
          <>
            <Button disabled={saving} onClick={() => setEditorOpen(false)} variant="secondary">취소</Button>
            <Button form="manager-notice-form" loading={saving} type="submit">{editingId !== undefined ? '수정 저장' : '공지 등록'}</Button>
          </>
        }
        onOpenChange={setEditorOpen}
        open={editorOpen}
        title={editingId !== undefined ? '공지 수정' : '새 공지 작성'}
      >
        <form className="grid gap-5" id="manager-notice-form" onSubmit={submitNotice}>
          <TextField label="공지 제목" maxLength={200} required value={title} onChange={(event) => setTitle(event.target.value)} />
          <Textarea label="공지 내용" required rows={7} value={content} onChange={(event) => setContent(event.target.value)} />
          {editorError ? <AlertBanner title="저장 실패" variant="error">{editorError}</AlertBanner> : null}
        </form>
      </Dialog>
    </div>
  )
}

/** 로그인 응답에 저장된 현재 매니저 정보를 표시하는 마이페이지다. */
export function ManagerMyPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('KOREAN')
  const [submitting, setSubmitting] = useState(false)
  const [editError, setEditError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    const session = getAuthSession()

    if (!session) {
      setLoadError('로그인 후 프로필을 확인할 수 있습니다.')
      setLoading(false)
      return
    }

    const controller = new AbortController()

    getMyProfile(session.accessToken, controller.signal)
      .then((nextProfile) => {
        setProfile(nextProfile)
        setNickname(nextProfile.nickname)
        setPreferredLanguage(nextProfile.preferredLanguage)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return

        setLoadError(
          error instanceof Error
            ? error.message
            : '프로필 정보를 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  function handleEditOpen() {
    if (!profile) return

    setNickname(profile.nickname)
    setPreferredLanguage(profile.preferredLanguage)
    setEditError('')
    setEditOpen(true)
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) {
      setEditError('닉네임을 입력해 주세요.')
      return
    }

    const session = getAuthSession()
    if (!session) {
      setEditError('로그인 정보가 없습니다. 다시 로그인해 주세요.')
      return
    }

    setSubmitting(true)
    setEditError('')

    try {
      const updated = await updateMyProfile(
        {
          nickname: trimmedNickname,
          preferredLanguage,
        },
        session.accessToken,
      )

      setProfile((current) =>
        current
          ? {
              ...current,
              email: updated.email,
              nickname: updated.nickname,
              profileImageUrl: updated.profileImageUrl,
              preferredLanguage: updated.preferredLanguage,
            }
          : current,
      )
      replaceAuthSession({ ...session, nickname: updated.nickname })
      setSuccessMessage('회원정보가 수정되었습니다.')
      setEditOpen(false)
    } catch (error: unknown) {
      setEditError(
        error instanceof Error
          ? error.message
          : '회원정보를 수정하지 못했습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const displayName = profile?.nickname

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader
        title="내 마이페이지"
        description="개인정보를 확인하고 팬미팅 관리 이력으로 이동하세요."
      />

      {successMessage ? (
        <AlertBanner
          onDismiss={() => setSuccessMessage('')}
          title="수정 완료"
          variant="success"
        >
          {successMessage}
        </AlertBanner>
      ) : null}

      {loading ? <Card className="p-8">프로필 정보를 불러오는 중입니다.</Card> : null}

      {!loading && loadError ? (
        <AlertBanner title="프로필 조회 실패" variant="error">
          {loadError}
        </AlertBanner>
      ) : null}

      {!loading && !profile && !loadError ? (
        <Card className="grid gap-4 p-8">
          <h2 className="text-xl font-black">로그인이 필요합니다.</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            현재 회원 정보를 확인하려면 매니저 계정으로 로그인해 주세요.
          </p>
          <Link
            className="font-bold text-[var(--color-primary-coral)]"
            to="/login"
          >
            로그인 화면으로 이동 <ArrowRight className="inline" size={17} />
          </Link>
        </Card>
      ) : null}

      {!loading && profile ? (
        <>
          <Card>
            <CardContent className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-center">
                {profile.profileImageUrl ? (
                  <img
                    alt={`${profile.nickname} 프로필`}
                    className="size-32 shrink-0 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] object-cover p-1"
                    src={profile.profileImageUrl}
                  />
                ) : (
                  <div className="flex size-32 shrink-0 items-center justify-center rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] bg-[var(--color-primary-coral-soft)] text-4xl font-black text-[var(--color-primary-coral)]">
                    {displayName?.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--color-primary-coral)]">
                    매니저 프로필
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                    {displayName}
                  </h2>
                  <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-sm">
                    <div className="flex items-center gap-3">
                      <dt className="font-semibold text-[var(--color-text-tertiary)]">
                        아이디
                      </dt>
                      <dd className="font-bold">{profile.loginId}</dd>
                    </div>
                    <div className="flex items-center gap-3">
                      <dt className="font-semibold text-[var(--color-text-tertiary)]">회원번호</dt>
                      <dd className="font-bold">{profile.userId}</dd>
                    </div>
                    <div className="flex min-w-0 items-center gap-3">
                      <dt className="font-semibold text-[var(--color-text-tertiary)]">
                        이메일
                      </dt>
                      <dd className="truncate font-bold">{profile.email}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-[var(--color-divider)] pt-6 lg:flex-col lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <Button
                  leadingIcon={<PencilSimple aria-hidden size={17} weight="bold" />}
                  onClick={handleEditOpen}
                  size="sm"
                >
                  회원정보 수정
                </Button>
                {/* 백엔드에 비밀번호 재설정 계약이 없어 무동작 버튼을 비활성 안내로 바꾼다. */}
                <Button
                  disabled
                  leadingIcon={<Key aria-hidden size={17} weight="bold" />}
                  size="sm"
                  title="비밀번호 변경 API가 제공되면 사용할 수 있습니다."
                  variant="secondary"
                >
                  비밀번호 변경 준비 중
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="flex flex-wrap items-center gap-5 p-6">
            <span className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-surface-page)]">
              <VideoCamera size={24} />
            </span>
            <div className="flex-1">
              <h2 className="font-black">팬미팅 관리 이력</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                담당하거나 관리했던 1:1 영상통화 팬미팅 목록을 확인하세요.
              </p>
            </div>
            <Link
              className="font-bold text-[var(--color-primary-coral)]"
              to="/manager/fan-meetings"
            >
              이력 확인 <ArrowRight className="inline" size={17} />
            </Link>
          </Card>
        </>
      ) : null}

      <Dialog
        description="닉네임과 선호 언어를 변경할 수 있습니다."
        footer={
          <>
            <Button
              disabled={submitting}
              onClick={() => setEditOpen(false)}
              variant="secondary"
            >
              취소
            </Button>
            <Button
              form="manager-profile-edit-form"
              loading={submitting}
              type="submit"
            >
              저장
            </Button>
          </>
        }
        onOpenChange={setEditOpen}
        open={editOpen}
        title="회원정보 수정"
      >
        <form
          className="grid gap-5"
          id="manager-profile-edit-form"
          onSubmit={handleProfileSubmit}
        >
          <TextField
            label="닉네임"
            maxLength={30}
            onChange={(event) => setNickname(event.currentTarget.value)}
            required
            value={nickname}
          />
          <Select
            label="선호 언어"
            onChange={(event) => setPreferredLanguage(event.currentTarget.value)}
            options={[
              { value: 'KOREAN', label: '한국어' },
              { value: 'ENGLISH', label: '영어' },
            ]}
            value={preferredLanguage}
          />
          {editError ? (
            <AlertBanner title="수정 실패" variant="error">
              {editError}
            </AlertBanner>
          ) : null}
        </form>
      </Dialog>
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
