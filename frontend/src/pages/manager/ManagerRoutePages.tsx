import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  CaretUp,
  Check,
  FloppyDisk,
  Key,
  Megaphone,
  PencilSimple,
  Plus,
  Trash,
  VideoCamera,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import {
  drawApplicationWinners,
  getApplicants,
  getApplicationForm,
  getApplicationStatistics,
  publishApplicationResults,
  saveApplicationForm,
  type ApplicantListResponse,
  type ApplicationStatisticsResponse,
  type ApplicationStatus,
} from '../../api/applications'
import { getAuthSession, replaceAuthSession } from '../../api/authSession'
import { forceEndCallSession } from '../../api/callSessions'
import type { PageResponse } from '../../api/envelope'
import { fetchMeetingDetail } from '../../api/fanMeetingParticipants'
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
import {
  fetchMyMeetings,
  fetchOwnedMeetings,
  type ManagerMeetingPage,
  type ManagerMeetingSummary,
} from '../../api/managerMeetings'
import {
  createEvent,
  publishFanMeeting,
  updateFanMeeting,
  type FanMeetingForm,
} from '../../api/managerOperations'
import {
  cancelFanMeeting,
  deleteFanMeetingDraft,
  endFanMeeting,
  getFanMeetingStatistics,
  patchFanMeeting,
  startFanMeeting,
  type FanMeetingStatisticsResponse,
  type FanMeetingUpdateRequest,
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

const DRAFT_PAGE_SIZE = 5

/** 팬미팅(이벤트) 상태 코드를 화면용 한국어 라벨로 바꾼다. */
const meetingStatusLabels: Record<string, string> = {
  DRAFT: '초안',
  PUBLISHED: '발행됨',
  APPLICATION_OPEN: '응모 접수 중',
  APPLICATION_CLOSED: '응모 마감',
  READY: '진행 준비',
  LIVE: '진행 중',
  ENDED: '종료',
  CANCELED: '취소됨',
}

/** 팬미팅 상태에 맞는 배지 색상을 고른다. */
function meetingStatusBadge(status?: string): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'LIVE') return 'primary'
  if (status === 'PUBLISHED' || status === 'APPLICATION_OPEN' || status === 'READY') return 'success'
  if (status === 'APPLICATION_CLOSED' || status === 'DRAFT') return 'warning'
  if (status === 'CANCELED') return 'danger'
  return 'neutral'
}

/** 오류 원인에서 사용자에게 보여줄 메시지를 뽑는다. */
function toErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

/** LocalDateTime 문자열을 읽기 쉬운 한국어 일시로 표시한다. */
function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}

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

/** 3단계 입력 폼에서 현재 단계와 완료 단계를 시각적으로 표시한다. */
function Stepper({ step, labels = ['기본 정보', '응모 설정', '미리보기'] }: { step: number; labels?: string[] }) {
  return <ol className="mx-auto grid w-full max-w-4xl grid-cols-3 gap-0 px-5 py-8 sm:px-12 sm:py-10">
    {labels.map((label, index) => <li className="relative text-center" key={label}>
      {index < 2 ? <span className={`absolute left-1/2 right-[-50%] top-8 h-px ${index < step ? 'bg-gradient-to-r from-[var(--color-primary-coral)] to-[var(--color-success)]' : 'bg-[var(--color-divider)]'}`} /> : null}
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

/** datetime-local 입력값에 초가 없으면 백엔드 LocalDateTime 형식에 맞게 초를 붙인다. */
function toApiLocalDateTime(value: string): string {
  return value.length === 16 ? `${value}:00` : value
}

/** 백엔드 LocalDateTime 값을 datetime-local 입력에서 사용할 분 단위 값으로 바꾼다. */
function toDateTimeLocalValue(value: string | null): string {
  return value ? value.replace(' ', 'T').slice(0, 16) : ''
}

/** 입력된 일정 사이의 선후 관계를 백엔드 검증 규칙과 동일하게 검사한다. */
function getMeetingScheduleErrors(form: FanMeetingForm): string[] {
  const errors: string[] = []
  const scheduledStart = form.scheduledStartAt
    ? new Date(form.scheduledStartAt)
    : null
  const applicationStart = form.application.startAt
    ? new Date(form.application.startAt)
    : null
  const applicationEnd = form.application.endAt
    ? new Date(form.application.endAt)
    : null
  const resultAnnouncement = form.application.resultAnnouncementAt
    ? new Date(form.application.resultAnnouncementAt)
    : null
  const queueOpen = form.operation.queueOpenAt
    ? new Date(form.operation.queueOpenAt)
    : null

  if (
    form.application.enabled &&
    applicationStart &&
    applicationEnd &&
    applicationEnd <= applicationStart
  ) {
    errors.push('응모 마감 일시는 응모 시작 일시보다 이후여야 합니다.')
  }

  if (
    form.application.enabled &&
    applicationEnd &&
    resultAnnouncement &&
    resultAnnouncement < applicationEnd
  ) {
    errors.push('결과 발표 일시는 응모 마감 일시보다 빠를 수 없습니다.')
  }

  if (
    form.application.enabled &&
    applicationEnd &&
    scheduledStart &&
    applicationEnd >= scheduledStart
  ) {
    errors.push('응모 마감 일시는 팬미팅 시작 일시보다 이전이어야 합니다.')
  }

  if (
    form.application.enabled &&
    resultAnnouncement &&
    scheduledStart &&
    resultAnnouncement >= scheduledStart
  ) {
    errors.push('결과 발표 일시는 팬미팅 시작 일시보다 이전이어야 합니다.')
  }

  if (queueOpen && scheduledStart && queueOpen >= scheduledStart) {
    errors.push('대기열 오픈 일시는 팬미팅 시작 일시보다 이전이어야 합니다.')
  }

  return errors
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
    getMeetingScheduleErrors(form)[0] ??
    (Number.isNaN(queueOpen.getTime())
      ? '대기열 오픈 일시를 입력해 주세요.'
      : undefined)
  )
}

/** 등록된 홍보·응모 이벤트를 검색하고 상태별 발행·취소·삭제를 수행하는 실제 API 목록 페이지다. */
export function ManagerEventListPage() {
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<ManagerMeetingPage>()
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('이벤트 목록을 조회하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      setData(await fetchMyMeetings({ keyword: appliedKeyword || undefined, page, size: 10 }, token))
      setError(undefined)
    } catch (cause) {
      setError(toErrorMessage(cause, '이벤트 목록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }, [appliedKeyword, page])

  useEffect(() => {
    void load()
  }, [load])

  /** 상태 전환·삭제 액션을 확인 후 실행하고 목록을 다시 읽는다. */
  async function runAction(meetingId: string, action: 'publish' | 'cancel' | 'delete') {
    const confirmText =
      action === 'publish'
        ? '이 이벤트를 발행할까요? 발행하면 팬에게 공개됩니다.'
        : action === 'cancel'
          ? '이 이벤트를 취소할까요? 취소하면 되돌릴 수 없습니다.'
          : '이 초안 이벤트를 삭제할까요? 삭제하면 되돌릴 수 없습니다.'
    if (!window.confirm(confirmText)) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('작업을 수행하려면 먼저 로그인해 주세요.')
      return
    }

    setBusyId(meetingId)
    setError(undefined)
    setMessage(undefined)
    try {
      if (action === 'publish') {
        await publishFanMeeting(Number(meetingId), token)
        setMessage('이벤트를 발행했습니다.')
      } else if (action === 'cancel') {
        await cancelFanMeeting(meetingId, token)
        setMessage('이벤트를 취소했습니다.')
      } else {
        await deleteFanMeetingDraft(meetingId, token)
        setMessage('초안 이벤트를 삭제했습니다.')
      }
      await load()
    } catch (cause) {
      setError(toErrorMessage(cause, '이벤트 상태를 변경하지 못했습니다.'))
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader title="이벤트 관리" description="작성한 이벤트와 응모 설정을 확인하고 관리하세요." />
      {error ? <AlertBanner title="이벤트 관리 요청 실패" variant="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner onDismiss={() => setMessage(undefined)} title="처리 완료" variant="success">{message}</AlertBanner> : null}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-divider)] p-6">
          <form
            className="flex min-w-0 flex-1 flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(0)
              setAppliedKeyword(keyword.trim())
            }}
          >
            <TextField containerClassName="min-w-[260px] flex-1" label="이벤트명 검색" onChange={(e) => setKeyword(e.target.value)} placeholder="이벤트명을 입력하세요" value={keyword} />
            <Button type="submit" variant="secondary">검색</Button>
          </form>
          <Button leadingIcon={<Plus size={19} />} onClick={() => navigate('/manager/events/new')}>새 이벤트</Button>
        </div>
        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center"><Spinner label="이벤트 목록을 불러오는 중" /></div>
        ) : !data || data.content.length === 0 ? (
          <div className="p-10 text-center text-[var(--color-text-secondary)]">등록된 이벤트가 없습니다.</div>
        ) : (
          <>
            <div className="hidden grid-cols-[1.5fr_.7fr_.9fr_.5fr_1fr] gap-4 bg-[var(--color-surface-page)] px-6 py-4 text-xs font-bold text-[var(--color-text-secondary)] sm:grid">
              <span>이벤트명</span><span>인플루언서</span><span>예정 일시</span><span>상태</span><span>관리</span>
            </div>
            <div className="divide-y divide-[var(--color-divider)]">
              {data.content.map((event) => {
                const status = event.status
                const busy = busyId === event.meetingId
                const cancellable = status === 'PUBLISHED' || status === 'APPLICATION_OPEN' || status === 'APPLICATION_CLOSED'
                return (
                  <div className="grid gap-3 px-6 py-5 sm:grid-cols-[1.5fr_.7fr_.9fr_.5fr_1fr] sm:items-center" key={event.meetingId}>
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-page)]"><Megaphone size={19} /></span>
                      <strong className="min-w-0 break-keep">{event.title}</strong>
                    </div>
                    <span className="text-sm text-[var(--color-text-secondary)]">{event.influencerName}</span>
                    <time className="text-sm text-[var(--color-text-secondary)]">{formatDateTime(event.scheduledStartAt)}</time>
                    <span><Badge variant={meetingStatusBadge(status)}>{status ? meetingStatusLabels[status] ?? status : '상태 미확인'}</Badge></span>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      <Link className="text-[var(--color-primary-coral)]" to={`/manager/events/${event.meetingId}/applications`}>응모자 관리</Link>
                      <Link className="text-[var(--color-primary-coral)]" to={`/manager/events/${event.meetingId}/edit`}>수정</Link>
                      {status === 'DRAFT' ? (
                        <>
                          <Button disabled={busy} onClick={() => void runAction(event.meetingId, 'publish')} size="sm">발행</Button>
                          <Button disabled={busy} leadingIcon={<Trash size={15} />} onClick={() => void runAction(event.meetingId, 'delete')} size="sm" variant="danger">삭제</Button>
                        </>
                      ) : null}
                      {cancellable ? (
                        <Button disabled={busy} onClick={() => void runAction(event.meetingId, 'cancel')} size="sm" variant="danger">취소</Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
            {data.totalPages > 1 ? (
              <Pagination className="border-t border-[var(--color-divider)] py-4" currentPage={page + 1} onPageChange={(next) => setPage(next - 1)} totalPages={data.totalPages} />
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}

/** 응모 폼 편집기에서 사용하는 로컬 질문 상태다. */
type EditableFormQuestion = {
  key: number
  questionId?: number
  questionText: string
  questionType: 'SHORT_TEXT' | 'LONG_TEXT'
  required: boolean
}

/** 이벤트 기본 정보를 PATCH로 수정하고 응모 폼 질문을 관리하는 실제 API 페이지다. */
export function ManagerEventEditPage() {
  const eventId = useParams<{ eventId: string }>().eventId ?? ''
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [initial, setInitial] = useState({ title: '', description: '', scheduledStartAt: '', capacity: 0 })
  const [form, setForm] = useState({ title: '', description: '', scheduledStartAt: '', capacity: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  // 응모 폼 관리 상태
  const [formDescription, setFormDescription] = useState('')
  const [questions, setQuestions] = useState<EditableFormQuestion[]>([])
  const [formLoaded, setFormLoaded] = useState(false)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string>()
  const [formMessage, setFormMessage] = useState<string>()
  const nextKey = useRef(1)

  useEffect(() => {
    if (!eventId) {
      setLoadError('이벤트 식별자가 없습니다.')
      setLoading(false)
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setLoadError('이벤트 정보를 조회하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    const controller = new AbortController()

    fetchMeetingDetail(eventId, token, controller.signal)
      .then((detail) => {
        const values = {
          title: detail.title,
          description: '',
          scheduledStartAt: detail.scheduledStartAt?.slice(0, 16) ?? '',
          capacity: detail.application?.capacity ?? 0,
        }
        setInitial(values)
        setForm(values)
        setStatus(detail.status)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoadError(toErrorMessage(cause, '이벤트 정보를 불러오지 못했습니다.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    getApplicationForm(eventId, controller.signal)
      .then((response) => {
        setFormDescription(response.formDescription ?? '')
        setQuestions(response.questions
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((question) => ({
            key: nextKey.current++,
            questionId: question.questionId,
            questionText: question.questionText,
            questionType: question.questionType === 'LONG_TEXT' ? 'LONG_TEXT' : 'SHORT_TEXT',
            required: question.required,
          })))
        setFormLoaded(true)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        // 아직 폼이 없는 이벤트면 빈 편집기로 시작한다.
        if (cause instanceof ApiError && cause.status === 404) {
          setFormLoaded(true)
          return
        }
        setFormError(toErrorMessage(cause, '응모 폼을 불러오지 못했습니다.'))
      })

    return () => controller.abort()
  }, [eventId])

  /** 처음 불러온 값과 달라진 필드만 PATCH 본문에 담아 저장한다. */
  async function saveBasic(event: FormEvent) {
    event.preventDefault()

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('저장하려면 먼저 로그인해 주세요.')
      return
    }

    const patch: FanMeetingUpdateRequest = {}
    if (form.title.trim() && form.title !== initial.title) patch.title = form.title.trim()
    if (form.description !== initial.description) patch.description = form.description
    if (form.scheduledStartAt && form.scheduledStartAt !== initial.scheduledStartAt) {
      patch.scheduledStartAt = toApiLocalDateTime(form.scheduledStartAt)
    }
    if (form.capacity !== initial.capacity && form.capacity > 0) {
      patch.application = { capacity: form.capacity }
    }

    if (Object.keys(patch).length === 0) {
      setMessage('변경된 항목이 없습니다.')
      return
    }

    setSaving(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const updated = await patchFanMeeting(eventId, patch, token)
      const values = {
        title: updated.title,
        description: updated.description ?? '',
        scheduledStartAt: updated.scheduledStartAt?.slice(0, 16) ?? '',
        capacity: updated.application.capacity,
      }
      setInitial(values)
      setForm(values)
      setStatus(updated.status)
      setMessage('이벤트 정보를 저장했습니다.')
    } catch (cause) {
      setError(toErrorMessage(cause, '이벤트 정보를 저장하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  /** 질문 순서를 위나 아래로 한 칸 옮긴다. */
  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((items) => {
      const target = index + direction
      if (target < 0 || target >= items.length) return items
      const next = items.slice()
      const [picked] = next.splice(index, 1)
      next.splice(target, 0, picked)
      return next
    })
  }

  function updateQuestion(key: number, patch: Partial<EditableFormQuestion>) {
    setQuestions((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  /** 응모 폼 전체(설명 + 질문 목록)를 서버에 교체 저장한다. */
  async function saveForm(event: FormEvent) {
    event.preventDefault()

    const token = getAuthSession()?.accessToken
    if (!token) {
      setFormError('응모 폼을 저장하려면 먼저 로그인해 주세요.')
      return
    }

    if (questions.some((question) => !question.questionText.trim())) {
      setFormError('모든 질문 내용을 입력해 주세요.')
      return
    }

    setFormSaving(true)
    setFormError(undefined)
    setFormMessage(undefined)
    try {
      const saved = await saveApplicationForm(eventId, {
        formDescription: formDescription.trim() || null,
        questions: questions.map((question, index) => ({
          questionId: question.questionId ?? null,
          questionText: question.questionText.trim(),
          questionType: question.questionType,
          required: question.required,
          displayOrder: index + 1,
        })),
      }, token)
      setFormDescription(saved.formDescription ?? '')
      setQuestions(saved.questions
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((question) => ({
          key: nextKey.current++,
          questionId: question.questionId,
          questionText: question.questionText,
          questionType: question.questionType === 'LONG_TEXT' ? 'LONG_TEXT' : 'SHORT_TEXT',
          required: question.required,
        })))
      setFormMessage('응모 폼을 저장했습니다.')
    } catch (cause) {
      setFormError(toErrorMessage(cause, '응모 폼을 저장하지 못했습니다.'))
    } finally {
      setFormSaving(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Spinner label="이벤트 정보를 불러오는 중" /></div>
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader
        eyebrow="PROMOTION & APPLICATION"
        title="홍보·응모 이벤트 수정"
        description="이벤트 기본 정보를 수정하고 팬 응모 폼 질문을 관리하세요."
        backTo="/manager/events/manage"
      />
      {loadError ? <AlertBanner title="이벤트 조회 실패" variant="error">{loadError}</AlertBanner> : null}
      {!loadError ? (
        <>
          <div className="flex items-center gap-3">
            <Badge variant={meetingStatusBadge(status)}>{status ? meetingStatusLabels[status] ?? status : '상태 미확인'}</Badge>
            <span className="text-sm text-[var(--color-text-secondary)]">이벤트 #{eventId}</span>
          </div>

          <form className="grid gap-5" onSubmit={saveBasic}>
            <Card>
              <CardHeader>
                <Badge variant="primary">기본 정보</Badge>
                <CardTitle as="h2" className="mt-3">이벤트 기본 정보 수정</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <TextField containerClassName="sm:col-span-2" label="이벤트 제목" maxLength={200} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                <TextField label="예정 팬미팅 일시" type="datetime-local" value={form.scheduledStartAt} onChange={(event) => setForm({ ...form, scheduledStartAt: event.target.value })} />
                <TextField label="응모 정원" min={1} type="number" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} />
                <Textarea
                  containerClassName="sm:col-span-2"
                  helperText="상세 조회 API가 기존 소개 내용을 제공하지 않아 비어 있습니다. 입력한 경우에만 새 내용으로 수정됩니다."
                  label="이벤트 상세 소개"
                  rows={6}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="팬에게 보여 줄 이벤트와 응모 안내를 입력해 주세요."
                />
              </CardContent>
            </Card>
            {error ? <AlertBanner title="저장 실패" variant="error">{error}</AlertBanner> : null}
            {message ? <AlertBanner onDismiss={() => setMessage(undefined)} title="처리 결과" variant="success">{message}</AlertBanner> : null}
            <div className="flex justify-end">
              <Button leadingIcon={<FloppyDisk size={18} />} loading={saving} type="submit">변경 내용 저장</Button>
            </div>
          </form>

          <form className="grid gap-5" onSubmit={saveForm}>
            <Card>
              <CardHeader>
                <Badge variant="primary">응모 폼 관리</Badge>
                <CardTitle as="h2" className="mt-3">팬 응모 질문 구성</CardTitle>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">저장 시 질문 목록 전체가 교체되며, 목록에서 제거한 기존 질문은 삭제됩니다.</p>
              </CardHeader>
              <CardContent className="grid gap-5">
                {!formLoaded && !formError ? <p className="text-sm text-[var(--color-text-secondary)]">응모 폼을 불러오는 중입니다.</p> : null}
                <Textarea label="응모 폼 안내 문구" rows={3} value={formDescription} onChange={(event) => setFormDescription(event.target.value)} placeholder="응모자에게 보여 줄 안내 문구를 입력해 주세요." />
                {questions.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[var(--color-divider)] p-5 text-center text-sm text-[var(--color-text-secondary)]">등록된 질문이 없습니다. 질문을 추가해 주세요.</p>
                ) : (
                  <div className="grid gap-4">
                    {questions.map((question, index) => (
                      <div className="grid gap-4 rounded-2xl border border-[var(--color-divider)] p-5" key={question.key}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <Badge variant="neutral">질문 {index + 1}</Badge>
                          <div className="flex gap-2">
                            <Button aria-label="위로 이동" disabled={index === 0} onClick={() => moveQuestion(index, -1)} size="sm" type="button" variant="secondary"><CaretUp size={15} /></Button>
                            <Button aria-label="아래로 이동" disabled={index === questions.length - 1} onClick={() => moveQuestion(index, 1)} size="sm" type="button" variant="secondary"><CaretDown size={15} /></Button>
                            <Button leadingIcon={<Trash size={15} />} onClick={() => setQuestions((items) => items.filter((item) => item.key !== question.key))} size="sm" type="button" variant="danger">삭제</Button>
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                          <TextField label="질문 내용" required value={question.questionText} onChange={(event) => updateQuestion(question.key, { questionText: event.target.value })} placeholder="예: 이번 팬미팅에서 가장 나누고 싶은 이야기는 무엇인가요?" />
                          <Select
                            label="답변 형식"
                            onChange={(event) => updateQuestion(question.key, { questionType: event.target.value === 'LONG_TEXT' ? 'LONG_TEXT' : 'SHORT_TEXT' })}
                            options={[
                              { value: 'SHORT_TEXT', label: '단답형' },
                              { value: 'LONG_TEXT', label: '장문형' },
                            ]}
                            value={question.questionType}
                          />
                        </div>
                        <Checkbox checked={question.required} label="필수 응답 질문입니다." onChange={(event) => updateQuestion(question.key, { required: event.target.checked })} />
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <Button
                    leadingIcon={<Plus size={17} />}
                    onClick={() => setQuestions((items) => [...items, { key: nextKey.current++, questionText: '', questionType: 'SHORT_TEXT', required: true }])}
                    type="button"
                    variant="secondary"
                  >
                    질문 추가
                  </Button>
                </div>
              </CardContent>
            </Card>
            {formError ? <AlertBanner title="응모 폼 처리 실패" variant="error">{formError}</AlertBanner> : null}
            {formMessage ? <AlertBanner onDismiss={() => setFormMessage(undefined)} title="처리 결과" variant="success">{formMessage}</AlertBanner> : null}
            <div className="flex justify-end">
              <Button disabled={!formLoaded} leadingIcon={<FloppyDisk size={18} />} loading={formSaving} type="submit">응모 폼 저장</Button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  )
}

/** 응모 상태 코드를 화면용 라벨과 배지 색상으로 바꾼다. */
const applicationStatusLabels: Record<ApplicationStatus, string> = {
  SUBMITTED: '응모 완료',
  WITHDRAWN: '응모 철회',
  SELECTED: '당첨',
  NOT_SELECTED: '미당첨',
}

function applicationStatusBadge(status: ApplicationStatus): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'SELECTED') return 'success'
  if (status === 'NOT_SELECTED') return 'danger'
  if (status === 'WITHDRAWN') return 'neutral'
  return 'primary'
}

/** 응모자 목록·답변을 조회하고 추첨과 결과 발표를 수행하는 실제 API 페이지다. */
export function ManagerApplicationsPage() {
  const eventId = useParams<{ eventId: string }>().eventId ?? ''
  const [meetingTitle, setMeetingTitle] = useState<string>()
  const [stats, setStats] = useState<ApplicationStatisticsResponse>()
  const [list, setList] = useState<ApplicantListResponse>()
  const [statusFilter, setStatusFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<number>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  const loadStats = useCallback(async () => {
    const token = getAuthSession()?.accessToken
    if (!token || !eventId) return
    try {
      setStats(await getApplicationStatistics(eventId, token))
    } catch (cause) {
      setError(toErrorMessage(cause, '응모 통계를 불러오지 못했습니다.'))
    }
  }, [eventId])

  const loadApplicants = useCallback(async () => {
    const token = getAuthSession()?.accessToken
    if (!eventId) {
      setError('이벤트 식별자가 없습니다.')
      setLoading(false)
      return
    }
    if (!token) {
      setError('응모자 목록을 조회하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      setList(await getApplicants(eventId, {
        applicationStatus: statusFilter ? (statusFilter as ApplicationStatus) : undefined,
        keyword: appliedKeyword || undefined,
        page,
        size: 10,
      }, token))
      setError(undefined)
    } catch (cause) {
      setError(toErrorMessage(cause, '응모자 목록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }, [appliedKeyword, eventId, page, statusFilter])

  useEffect(() => {
    void loadApplicants()
  }, [loadApplicants])

  useEffect(() => {
    void loadStats()

    const token = getAuthSession()?.accessToken
    if (!token || !eventId) return
    const controller = new AbortController()
    fetchMeetingDetail(eventId, token, controller.signal)
      .then((detail) => setMeetingTitle(detail.title))
      .catch(() => {
        // 제목 조회 실패는 응모 관리 기능을 막지 않는다.
      })
    return () => controller.abort()
  }, [eventId, loadStats])

  /** 응모자 전체에서 당첨자를 추첨한다. */
  async function draw() {
    if (!window.confirm('응모자 중에서 당첨자를 추첨할까요? 추첨 후에는 다시 실행할 수 없습니다.')) return
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('추첨하려면 먼저 로그인해 주세요.')
      return
    }

    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const result = await drawApplicationWinners(eventId, token)
      setMessage(`추첨을 완료했습니다. 당첨 ${result.selectedCount}명 · 미당첨 ${result.notSelectedCount}명 · 참가자 ${result.participantCount}명`)
      await Promise.all([loadStats(), loadApplicants()])
    } catch (cause) {
      setError(toErrorMessage(cause, '추첨에 실패했습니다.'))
    } finally {
      setBusy(false)
    }
  }

  /** 추첨 결과를 팬에게 발표(알림 발송)한다. */
  async function publishResults() {
    if (!window.confirm('응모 결과를 발표할까요? 발표하면 모든 응모자에게 알림이 전송됩니다.')) return
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('결과를 발표하려면 먼저 로그인해 주세요.')
      return
    }

    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const result = await publishApplicationResults(eventId, token)
      setMessage(`응모 결과를 발표했습니다. 알림 ${result.notificationCount}건을 전송했습니다.`)
      await Promise.all([loadStats(), loadApplicants()])
    } catch (cause) {
      setError(toErrorMessage(cause, '결과 발표에 실패했습니다.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader title="응모 관리" description="응모자의 답변을 확인하고 추첨과 결과 발표를 진행하세요." backTo="/manager/events/manage" />
      {error ? <AlertBanner title="응모 관리 요청 실패" variant="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner onDismiss={() => setMessage(undefined)} title="처리 완료" variant="success">{message}</AlertBanner> : null}

      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">이벤트명</p>
            <h2 className="mt-1 text-xl font-black">{meetingTitle ?? `이벤트 #${eventId}`}</h2>
          </div>
          <div className="flex flex-wrap gap-8 text-right">
            <div><p className="text-xs text-[var(--color-text-secondary)]">전체 응모</p><strong className="text-2xl">{stats?.totalApplications ?? '-'}명</strong></div>
            <div><p className="text-xs text-[var(--color-text-secondary)]">응모 완료</p><strong className="text-2xl">{stats?.submittedCount ?? '-'}명</strong></div>
            <div><p className="text-xs text-[var(--color-text-secondary)]">당첨</p><strong className="text-2xl text-[var(--color-primary-coral)]">{stats?.selectedCount ?? '-'}명</strong></div>
            <div><p className="text-xs text-[var(--color-text-secondary)]">미당첨</p><strong className="text-2xl">{stats?.notSelectedCount ?? '-'}명</strong></div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-divider)] p-6">
          <form
            className="flex min-w-0 flex-1 flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(0)
              setAppliedKeyword(keyword.trim())
            }}
          >
            <Select
              containerClassName="w-40"
              label="응모 상태"
              onChange={(event) => {
                setPage(0)
                setStatusFilter(event.target.value)
              }}
              options={[
                { value: '', label: '전체' },
                { value: 'SUBMITTED', label: '응모 완료' },
                { value: 'SELECTED', label: '당첨' },
                { value: 'NOT_SELECTED', label: '미당첨' },
                { value: 'WITHDRAWN', label: '응모 철회' },
              ]}
              value={statusFilter}
            />
            <TextField containerClassName="min-w-[220px] flex-1" label="닉네임 검색" onChange={(event) => setKeyword(event.target.value)} placeholder="닉네임을 입력하세요" value={keyword} />
            <Button type="submit" variant="secondary">검색</Button>
          </form>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void draw()}>추첨하기</Button>
            <Button disabled={busy} onClick={() => void publishResults()} variant="outline">결과 발표</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center"><Spinner label="응모자 목록을 불러오는 중" /></div>
        ) : !list || list.content.length === 0 ? (
          <div className="p-10 text-center text-[var(--color-text-secondary)]">조건에 맞는 응모자가 없습니다.</div>
        ) : (
          <>
            <div className="divide-y divide-[var(--color-divider)]">
              {list.content.map((applicant) => {
                const expanded = expandedId === applicant.applicationId
                return (
                  <div key={applicant.applicationId}>
                    <button
                      className={`grid w-full gap-3 p-5 text-left transition hover:bg-[var(--color-surface-page)] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center ${expanded ? 'bg-[var(--color-primary-coral-soft)]' : ''}`}
                      onClick={() => setExpandedId(expanded ? undefined : applicant.applicationId)}
                      type="button"
                    >
                      {applicant.profileImageUrl ? (
                        <img alt="" className="size-10 rounded-full object-cover" src={applicant.profileImageUrl} />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-primary-coral-soft)] font-bold text-[var(--color-primary-coral)]">{applicant.nickname.slice(0, 1)}</span>
                      )}
                      <div className="min-w-0">
                        <strong>{applicant.nickname}</strong>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">응모일 {formatDateTime(applicant.submittedAt)}</p>
                      </div>
                      <Badge variant={applicationStatusBadge(applicant.applicationStatus)}>{applicationStatusLabels[applicant.applicationStatus]}</Badge>
                      <span className="text-[var(--color-text-tertiary)]">{expanded ? <CaretUp size={17} /> : <CaretDown size={17} />}</span>
                    </button>
                    {expanded ? (
                      <div className="grid gap-4 border-t border-dashed border-[var(--color-divider)] bg-[var(--color-surface-page)] p-5">
                        {applicant.answers.length === 0 ? (
                          <p className="text-sm text-[var(--color-text-secondary)]">제출된 답변이 없습니다.</p>
                        ) : (
                          applicant.answers.map((answer) => (
                            <div key={answer.questionId}>
                              <p className="text-xs font-bold text-[var(--color-text-secondary)]">{answer.questionText}</p>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{answer.answerText}</p>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {list.totalPages > 1 ? (
              <Pagination className="border-t border-[var(--color-divider)] py-4" currentPage={page + 1} onPageChange={(next) => setPage(next - 1)} totalPages={list.totalPages} />
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}

/**
 * 홍보·응모 이벤트를 생성하는 실제 API 연결 페이지다.
 * 현재 백엔드 계약상 예정 팬미팅 운영 값도 같은 요청 본문에 포함한다.
 */
export function ManagerEventCreatePage() {
  const navigate = useNavigate()
  const session = getAuthSession()
  const isInfluencerAccount = session?.role === 'INFLUENCER' || session?.role === 'SOLO_INFLUENCER'
  const resolvedInfluencerId = isInfluencerAccount ? session?.userId : undefined
  const influencerNickname = isInfluencerAccount ? session?.nickname : undefined
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FanMeetingForm>({
    influencerId: resolvedInfluencerId ?? 0,
    title: '',
    description: '',
    coverImageUrl: null,
    scheduledStartAt: '',
    application: {
      enabled: true,
      startAt: null,
      endAt: null,
      resultAnnouncementAt: null,
      capacity: 30,
    },
    operation: {
      queueOpenAt: '',
      callDurationSec: 180,
      recordingEnabled: true,
      translationEnabled: false,
    },
  })
  const [createdMeetingId, setCreatedMeetingId] = useState<number>()
  const [createdMeetingStatus, setCreatedMeetingStatus] = useState<
    'DRAFT' | 'PUBLISHED'
  >()
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
  const scheduleErrors = getMeetingScheduleErrors(form)
  const applicationEndError = scheduleErrors.find((message) =>
    message.startsWith('응모 마감'),
  )
  const resultAnnouncementError = scheduleErrors.find((message) =>
    message.startsWith('결과 발표'),
  )
  const queueOpenError = scheduleErrors.find((message) =>
    message.startsWith('대기열 오픈'),
  )

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
      setCreatedMeetingId(meeting.meetingId)
      setCreatedMeetingStatus('DRAFT')
      setStep(0)
      setError(undefined)
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

  async function saveMeeting(publishAfterCreate: boolean) {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setErrorTitle('로그인 필요')
      setError('이벤트를 등록하려면 먼저 로그인해 주세요.')
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

      if (publishAfterCreate) {
        await publishFanMeeting(meetingId, token)
        setCreatedMeetingStatus('PUBLISHED')
        navigate('/manager/events/manage')
      }
    } catch (reason) {
      setErrorTitle(
        publishAfterCreate ? '이벤트 게시 실패' : '초안 저장 실패',
      )
      setError(
        reason instanceof Error
          ? reason.message
          : publishAfterCreate
            ? '이벤트 게시에 실패했습니다.'
            : '초안 저장에 실패했습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * 앞 단계에서는 화면만 이동하고, 마지막 단계의 기본 제출은 생성 후 즉시 게시한다.
   */
  async function submit(event: React.FormEvent) {
    event.preventDefault()

    if (step < 2) {
      setStep(step + 1)
      return
    }

    await saveMeeting(true)
  }

  return (
    <div className="grid gap-7 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="이벤트 생성" description="팬에게 공개할 홍보·응모 정보와 이후 팬미팅 운영 조건을 등록하세요." backTo="/manager/events" />
        {createdMeetingId ? (
          <Link className="inline-flex min-h-[var(--control-height)] items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-white px-[var(--control-padding-inline)] text-sm font-semibold" to="/manager/events/manage">
            이벤트 관리 목록으로 이동 <ArrowRight size={18} />
          </Link>
        ) : null}
      </div>
      <AlertBanner title="현재 백엔드의 이벤트 등록 경로를 사용합니다" variant="info">
        현재 명세에서는 이벤트 등록 요청을 <code>POST /api/v1/fan-meetings</code>로 받습니다.
        화면에서는 실제 업무 의미에 맞게 이벤트로 표시하며, 생성 결과의 <code>meetingId</code>는 서버 참조 ID로 보관합니다.
      </AlertBanner>
      <Stepper step={step} labels={['홍보 정보', '응모·운영 설정', '최종 확인']} />
      <form className="grid gap-5" onSubmit={submit}>
        <Card>
          <CardHeader>
            <Badge variant="primary">STEP {step + 1}</Badge>
            <CardTitle as="h2" className="mt-3">
              {step === 0 ? '이벤트 홍보 정보' : step === 1 ? '응모와 이후 팬미팅 운영 설정' : '이벤트 정보 최종 확인'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {step === 0 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="이벤트명" maxLength={200} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} helperText="팬에게 공개되는 홍보·응모 페이지의 제목입니다." />
                <TextField label="예정 팬미팅 일시" required type="datetime-local" value={form.scheduledStartAt} onChange={(event) => setForm({ ...form, scheduledStartAt: event.target.value })} />
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
                    <p className="text-sm text-[var(--color-text-secondary)]">응모 없는 이벤트로 등록하면 기간과 정원은 서버 규약에 맞게 비활성 값으로 전송됩니다.</p>
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
                </section>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-5 sm:grid-cols-[1fr_.9fr]">
                <div className="rounded-xl bg-[var(--color-surface-page)] p-6">
                  <p className="text-sm font-bold text-[var(--color-primary-coral)]">홍보·응모 이벤트</p>
                  <h3 className="mt-3 text-2xl font-black">{form.title}</h3>
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{form.description?.trim() || '등록된 이벤트 소개가 없습니다.'}</p>
                </div>
                <dl className="grid gap-3 text-sm">
                  <div className="flex justify-between border-b py-3"><dt>인플루언서</dt><dd className="font-bold">{isInfluencerAccount ? `${influencerNickname} (#${resolvedInfluencerId})` : `사용자 #${form.influencerId || '-'}`}</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>예정 팬미팅</dt><dd className="font-bold">{form.scheduledStartAt}</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>응모</dt><dd className="font-bold">{form.application.enabled ? `${form.application.capacity}명 모집` : '사용 안 함'}</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>대기열 오픈</dt><dd className="font-bold">{form.operation.queueOpenAt}</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>통화 시간</dt><dd className="font-bold">{form.operation.callDurationSec}초</dd></div>
                  <div className="flex justify-between border-b py-3"><dt>녹화 / 번역</dt><dd className="font-bold">{form.operation.recordingEnabled ? '녹화 사용' : '녹화 미사용'} · {form.operation.translationEnabled ? '번역 사용' : '번역 미사용'}</dd></div>
                </dl>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {error ? <AlertBanner title={errorTitle} variant="error">{error}</AlertBanner> : null}
        {createdMeetingId ? (
          <AlertBanner
            title={
              createdMeetingStatus === 'PUBLISHED'
                ? '이벤트가 공개되었습니다'
                : '이벤트가 초안으로 저장되었습니다'
            }
            variant="success"
          >
            팬미팅 ID는 {createdMeetingId}이며 현재 상태는{' '}
            {createdMeetingStatus ?? 'DRAFT'}입니다.
          </AlertBanner>
        ) : null}
        <div
          className={`flex flex-wrap items-center gap-3 ${
            step < 2 ? 'justify-between' : 'justify-end'
          }`}
        >
          {step < 2 ? (
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
              (step === 1 && scheduleErrors.length > 0)
            }
            nextLoading={submitting}
            onBack={step > 0 ? () => setStep(step - 1) : undefined}
            onSave={
              step === 2
                ? () => {
                    void saveMeeting(false)
                  }
                : undefined
            }
            saveLabel="초안 저장"
            nextLabel={
              step === 2
                ? createdMeetingStatus === 'DRAFT'
                  ? '게시하기'
                  : '바로 게시'
                : '다음 단계'
            }
          />
        </div>
      </form>
      <Dialog
        description="현재 계정으로 저장한 미게시 팬미팅입니다."
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
    </div>
  )
}

/** 팬미팅 설정 폼에서 다루는 필드 이름 목록이다. */
type MeetingSettingsField =
  | 'title'
  | 'scheduledStartAt'
  | 'queueOpenAt'
  | 'callDurationSec'
  | 'recordingEnabled'
  | 'translationEnabled'
  | 'reconnectGraceSec'
  | 'earlyStartMinutes'
  | 'maxRecallCount'

/** 팬미팅 기본·운영 설정을 PATCH로 저장하고 상태 전환을 수행하는 실제 API 페이지다. */
export function ManagerMeetingSettingsPage() {
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [form, setForm] = useState({
    title: '',
    scheduledStartAt: '',
    queueOpenAt: '',
    callDurationSec: 180,
    recordingEnabled: true,
    translationEnabled: false,
    reconnectGraceSec: 60,
    earlyStartMinutes: 10,
    maxRecallCount: 1,
  })
  const [dirty, setDirty] = useState<Set<MeetingSettingsField>>(new Set())
  const [saving, setSaving] = useState(false)
  const [transitionBusy, setTransitionBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    if (!meetingId) {
      setLoadError('팬미팅 식별자가 없습니다.')
      setLoading(false)
      return
    }

    const token = getAuthSession()?.accessToken
    if (!token) {
      setLoadError('팬미팅 설정을 조회하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    const controller = new AbortController()
    fetchMeetingDetail(meetingId, token, controller.signal)
      .then((detail) => {
        setStatus(detail.status)
        setForm((current) => ({
          ...current,
          title: detail.title,
          scheduledStartAt: detail.scheduledStartAt?.slice(0, 16) ?? '',
        }))
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoadError(toErrorMessage(cause, '팬미팅 정보를 불러오지 못했습니다.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [meetingId])

  /** 필드 값을 바꾸고 변경 목록에 기록한다. 변경한 필드만 PATCH에 담는다. */
  function setField<K extends MeetingSettingsField>(field: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setDirty((current) => new Set(current).add(field))
  }

  /** 저장 결과 응답으로 폼과 상태를 실제 서버 값으로 동기화한다. */
  function applyResponse(updated: Awaited<ReturnType<typeof patchFanMeeting>>) {
    setStatus(updated.status)
    setForm({
      title: updated.title,
      scheduledStartAt: updated.scheduledStartAt?.slice(0, 16) ?? '',
      queueOpenAt: updated.operation.queueOpenAt?.slice(0, 16) ?? '',
      callDurationSec: updated.operation.callDurationSec,
      recordingEnabled: updated.operation.recordingEnabled,
      translationEnabled: updated.operation.translationEnabled,
      reconnectGraceSec: updated.operation.reconnectGraceSec,
      earlyStartMinutes: updated.operation.earlyStartMinutes,
      maxRecallCount: updated.operation.maxRecallCount,
    })
    setDirty(new Set())
  }

  async function save(event: FormEvent) {
    event.preventDefault()

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('설정을 저장하려면 먼저 로그인해 주세요.')
      return
    }

    if (dirty.size === 0) {
      setMessage('변경한 항목이 없습니다.')
      return
    }

    const patch: FanMeetingUpdateRequest = {}
    if (dirty.has('title') && form.title.trim()) patch.title = form.title.trim()
    if (dirty.has('scheduledStartAt') && form.scheduledStartAt) patch.scheduledStartAt = toApiLocalDateTime(form.scheduledStartAt)

    const operation: FanMeetingUpdateRequest['operation'] = {}
    if (dirty.has('queueOpenAt') && form.queueOpenAt) operation.queueOpenAt = toApiLocalDateTime(form.queueOpenAt)
    if (dirty.has('callDurationSec')) operation.callDurationSec = form.callDurationSec
    if (dirty.has('recordingEnabled')) operation.recordingEnabled = form.recordingEnabled
    if (dirty.has('translationEnabled')) operation.translationEnabled = form.translationEnabled
    if (dirty.has('reconnectGraceSec')) operation.reconnectGraceSec = form.reconnectGraceSec
    if (dirty.has('earlyStartMinutes')) operation.earlyStartMinutes = form.earlyStartMinutes
    if (dirty.has('maxRecallCount')) operation.maxRecallCount = form.maxRecallCount
    if (Object.keys(operation).length > 0) patch.operation = operation

    if (Object.keys(patch).length === 0) {
      setMessage('저장할 유효한 변경 항목이 없습니다.')
      return
    }

    setSaving(true)
    setError(undefined)
    setMessage(undefined)
    try {
      applyResponse(await patchFanMeeting(meetingId, patch, token))
      setMessage('팬미팅 설정을 저장했습니다.')
    } catch (cause) {
      setError(toErrorMessage(cause, '팬미팅 설정을 저장하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  /** 발행·취소·시작·종료 상태 전환을 확인 후 실행한다. */
  async function runTransition(action: 'publish' | 'cancel' | 'start' | 'end') {
    const labels = { publish: '발행', cancel: '취소', start: '시작', end: '종료' } as const
    if (!window.confirm(`팬미팅을 ${labels[action]}할까요?`)) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('상태를 변경하려면 먼저 로그인해 주세요.')
      return
    }

    setTransitionBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      if (action === 'publish') {
        const published = await publishFanMeeting(Number(meetingId), token)
        setStatus(published.status)
        setMessage(`팬미팅 상태가 '${meetingStatusLabels[published.status] ?? published.status}'(으)로 변경되었습니다.`)
      } else {
        const runner = action === 'cancel'
          ? cancelFanMeeting
          : action === 'start'
            ? startFanMeeting
            : endFanMeeting
        const updated = await runner(meetingId, token)
        applyResponse(updated)
        setMessage(`팬미팅 상태가 '${meetingStatusLabels[updated.status] ?? updated.status}'(으)로 변경되었습니다.`)
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : toErrorMessage(cause, '팬미팅 상태를 변경하지 못했습니다.'))
    } finally {
      setTransitionBusy(false)
    }
  }

  const canPublish = !status || status === 'DRAFT'
  const canCancel = !status || ['PUBLISHED', 'APPLICATION_OPEN', 'APPLICATION_CLOSED', 'READY'].includes(status)
  const canStart = !status || ['READY', 'APPLICATION_CLOSED', 'PUBLISHED'].includes(status)
  const canEnd = !status || status === 'LIVE'

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center"><Spinner label="팬미팅 설정을 불러오는 중" /></div>
  }

  return (
    <div className="grid gap-7 pb-10">
      <PageHeader
        title="팬미팅 설정"
        description="팬미팅 일정과 운영 설정을 수정하고 진행 상태를 전환하세요."
        backTo="/manager/fan-meetings/manage"
      />
      {loadError ? <AlertBanner title="팬미팅 조회 실패" variant="error">{loadError}</AlertBanner> : null}
      {!loadError ? (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Badge variant={meetingStatusBadge(status)}>{status ? meetingStatusLabels[status] ?? status : '상태 미확인'}</Badge>
                <strong className="text-lg">{form.title || `팬미팅 #${meetingId}`}</strong>
              </div>
              <div className="flex flex-wrap gap-2">
                {canPublish ? <Button disabled={transitionBusy} onClick={() => void runTransition('publish')} size="sm">발행</Button> : null}
                {canStart ? <Button disabled={transitionBusy} onClick={() => void runTransition('start')} size="sm" variant="outline">시작</Button> : null}
                {canEnd ? <Button disabled={transitionBusy} onClick={() => void runTransition('end')} size="sm" variant="secondary">종료</Button> : null}
                {canCancel ? <Button disabled={transitionBusy} onClick={() => void runTransition('cancel')} size="sm" variant="danger">취소</Button> : null}
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--color-text-secondary)]">허용되지 않는 상태 전환은 서버에서 거부되며 오류 메시지로 안내됩니다.</p>
          </Card>

          {error ? <AlertBanner title="요청 실패" variant="error">{error}</AlertBanner> : null}
          {message ? <AlertBanner onDismiss={() => setMessage(undefined)} title="처리 결과" variant="success">{message}</AlertBanner> : null}

          <form className="grid gap-5" onSubmit={save}>
            <Card>
              <CardHeader>
                <Badge variant="primary">기본 정보</Badge>
                <CardTitle as="h2" className="mt-3">일정과 제목</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <TextField containerClassName="sm:col-span-2" label="팬미팅 제목" maxLength={200} value={form.title} onChange={(event) => setField('title', event.target.value)} />
                <TextField label="팬미팅 시작 일시" type="datetime-local" value={form.scheduledStartAt} onChange={(event) => setField('scheduledStartAt', event.target.value)} />
                <TextField label="대기열 오픈 일시" type="datetime-local" value={form.queueOpenAt} onChange={(event) => setField('queueOpenAt', event.target.value)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Badge variant="primary">운영 설정</Badge>
                <CardTitle as="h2" className="mt-3">영상통화 운영 조건</CardTitle>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">현재 저장된 운영 값은 조회 API가 제공하지 않아 표시값은 기본값입니다. 직접 변경한 항목만 서버에 저장됩니다.</p>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <Select
                  label="1인 통화 시간"
                  onChange={(event) => setField('callDurationSec', Number(event.target.value))}
                  options={[{ value: '120', label: '2분' }, { value: '180', label: '3분' }, { value: '300', label: '5분' }]}
                  value={String(form.callDurationSec)}
                />
                <TextField label="재접속 허용 시간(초)" min={0} type="number" value={form.reconnectGraceSec} onChange={(event) => setField('reconnectGraceSec', Number(event.target.value))} />
                <TextField label="조기 시작 허용(분)" min={0} type="number" value={form.earlyStartMinutes} onChange={(event) => setField('earlyStartMinutes', Number(event.target.value))} />
                <TextField label="최대 재호출 횟수" min={0} type="number" value={form.maxRecallCount} onChange={(event) => setField('maxRecallCount', Number(event.target.value))} />
                <div className="grid gap-3 rounded-xl border border-[var(--color-divider)] p-4 sm:col-span-2">
                  <Checkbox checked={form.recordingEnabled} label="통화 녹화를 사용합니다." onChange={(event) => setField('recordingEnabled', event.target.checked)} />
                  <Checkbox checked={form.translationEnabled} label="실시간 번역을 사용합니다." onChange={(event) => setField('translationEnabled', event.target.checked)} />
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button leadingIcon={<FloppyDisk size={18} />} loading={saving} type="submit">설정 저장</Button>
            </div>
          </form>
        </>
      ) : null}
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
                {/* TODO: 비밀번호 변경 API 연결 */}
                <Button
                  leadingIcon={<Key aria-hidden size={17} weight="bold" />}
                  size="sm"
                  variant="secondary"
                >
                  비밀번호 변경
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
              to="/manager/fan-meetings/manage"
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
            <Textarea label="강제 종료 사유" required rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />
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
