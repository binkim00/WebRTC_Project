import { ArrowLeft, ArrowRight, FloppyDisk } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  drawApplicationWinners,
  getApplicationStatistics,
  publishApplicationResults,
} from '../../api/applications'
import { getAuthSession } from '../../api/authSession'
import {
  fetchPublicFanMeetingDetail,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import { publishFanMeeting } from '../../api/managerOperations'
import {
  cancelFanMeeting,
  controlFanMeetingForTest,
  deleteFanMeetingDraft,
  endFanMeeting,
  patchFanMeeting,
  startFanMeeting,
  transitionFanMeetingImmediately,
  type FanMeetingStatus,
  type FanMeetingTestControlRequest,
  type FanMeetingUpdateRequest,
} from '../../api/meetingManagement'
import { fetchParticipants } from '../../api/fanMeetingParticipants'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Select,
  Spinner,
  TextField,
  Textarea,
} from '../../components'
import { ManagerApplicantsPanel } from './ManagerApplicantsPanel'
import { ManagerApplicationFormPanel } from './ManagerApplicationFormPanel'
import {
  formatDateTime,
  getAvailableActions,
  getScheduleErrors,
  meetingStatusBadge,
  meetingStatusLabel,
  normalizeDetailTab,
  toApiLocalDateTime,
  toDateTimeLocalValue,
  toErrorMessage,
  type MeetingDetailTab,
} from './meetingLifecycle'

/**
 * 위험한 테스트 제어는 개발 서버에서도 명시적으로 켠 경우에만 노출한다.
 * 운영자가 사용하는 즉시 전환은 개요 탭의 제한된 순방향 액션으로 별도 제공한다.
 */
const TEST_CONTROL_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_TEST_CONTROLS === 'true'

/** 상세 화면 상단에 표시할 탭 목록이다. */
const TABS: readonly { id: MeetingDetailTab; label: string }[] = [
  { id: 'overview', label: '개요' },
  { id: 'settings', label: '설정' },
  { id: 'application-form', label: '응모 폼' },
  { id: 'applicants', label: '응모자' },
  ...(TEST_CONTROL_ENABLED
    ? [{ id: 'test-control' as const, label: '테스트 제어' }]
    : []),
]

/** 상세 화면에서 실행할 수 있는 정상 액션과 제한된 즉시 전환 명령이다. */
type MeetingOperationAction =
  | 'publish'
  | 'cancel'
  | 'delete'
  | 'start'
  | 'end'
  | 'draw'
  | 'publishResults'
  | 'openApplicationsNow'
  | 'closeApplicationsNow'
  | 'startNow'

/** 테스트 제어에서 강제로 지정할 수 있는 상태 목록이다. */
const TEST_CONTROL_STATUS_OPTIONS: readonly { value: FanMeetingStatus; label: string }[] = [
  { value: 'DRAFT', label: '초안' },
  { value: 'PUBLISHED', label: '발행' },
  { value: 'APPLICATION_OPEN', label: '응모 접수 중' },
  { value: 'APPLICATION_CLOSED', label: '응모 마감' },
  { value: 'READY', label: '진행 준비' },
  { value: 'LIVE', label: '진행 중' },
  { value: 'ENDED', label: '종료' },
  { value: 'CANCELED', label: '취소' },
]

/**
 * 상태별로 그 상태가 실제로 성립하는 일정 조합이며 현재 시각 기준 분 단위 오프셋이다.
 *
 * 백엔드 test-control은 일정 검증을 건너뛰지만, 상태만 바꾸고 일정이 어긋난 채로 두면
 * canApply·canEnter 계산이 상태와 따로 놀아 화면이 엉킨다. 그래서 상태를 고르면
 * 조회 API가 같은 판정을 내리도록 일정을 함께 맞춘다.
 *
 * 모든 조합은 `getScheduleErrors`의 선후 규칙(응모 시작 < 마감 <= 결과 발표 < 팬미팅 시작,
 * 대기실 오픈 < 팬미팅 시작)을 지킨다. CANCELED는 일정 의미가 없어 기존 값을 유지한다.
 */
const TEST_CONTROL_SCHEDULE_OFFSETS: Partial<
  Record<
    FanMeetingStatus,
    {
      applicationOpenAt: number
      applicationCloseAt: number
      resultAnnouncementAt: number
      waitingRoomOpenAt: number
      scheduledStartAt: number
    }
  >
> = {
  // 아직 응모가 열리기 전이라 모든 일정이 미래다.
  DRAFT: {
    applicationOpenAt: 60,
    applicationCloseAt: 1440,
    resultAnnouncementAt: 1500,
    waitingRoomOpenAt: 1560,
    scheduledStartAt: 1620,
  },
  PUBLISHED: {
    applicationOpenAt: 30,
    applicationCloseAt: 1440,
    resultAnnouncementAt: 1500,
    waitingRoomOpenAt: 1560,
    scheduledStartAt: 1620,
  },
  // 응모 시작은 지났고 마감은 남아야 canApply가 true가 된다.
  APPLICATION_OPEN: {
    applicationOpenAt: -5,
    applicationCloseAt: 60,
    resultAnnouncementAt: 70,
    waitingRoomOpenAt: 80,
    scheduledStartAt: 90,
  },
  APPLICATION_CLOSED: {
    applicationOpenAt: -120,
    applicationCloseAt: -5,
    resultAnnouncementAt: 30,
    waitingRoomOpenAt: 50,
    scheduledStartAt: 60,
  },
  // 대기실 오픈이 지나야 확정 참가자의 canEnter가 true가 된다.
  READY: {
    applicationOpenAt: -180,
    applicationCloseAt: -120,
    resultAnnouncementAt: -60,
    waitingRoomOpenAt: -10,
    scheduledStartAt: 30,
  },
  LIVE: {
    applicationOpenAt: -240,
    applicationCloseAt: -180,
    resultAnnouncementAt: -120,
    waitingRoomOpenAt: -30,
    scheduledStartAt: -5,
  },
  ENDED: {
    applicationOpenAt: -300,
    applicationCloseAt: -240,
    resultAnnouncementAt: -180,
    waitingRoomOpenAt: -120,
    scheduledStartAt: -60,
  },
}

/** 설정 폼에서 다루는 필드 이름 목록이며 변경된 항목만 PATCH에 담기 위해 사용한다. */
type SettingsField =
  | 'title'
  | 'description'
  | 'coverImageUrl'
  | 'scheduledStartAt'
  | 'applicationStartAt'
  | 'applicationEndAt'
  | 'resultAnnouncementAt'
  | 'capacity'
  | 'queueOpenAt'
  | 'callDurationSec'
  | 'recordingEnabled'
  | 'translationEnabled'
  | 'reconnectGraceSec'
  | 'earlyStartMinutes'
  | 'maxRecallCount'

/** 설정 탭이 편집하는 팬미팅 값 전체다. */
type SettingsForm = {
  title: string
  description: string
  coverImageUrl: string
  scheduledStartAt: string
  applicationEnabled: boolean
  applicationStartAt: string
  applicationEndAt: string
  resultAnnouncementAt: string
  capacity: number
  queueOpenAt: string
  callDurationSec: number
  recordingEnabled: boolean
  translationEnabled: boolean
  reconnectGraceSec: number
  earlyStartMinutes: number
  maxRecallCount: number
}

/** 상세 조회 응답을 설정 폼 상태로 바꾼다. */
function toSettingsForm(detail: PublicFanMeetingDetail): SettingsForm {
  const { meeting } = detail
  return {
    title: meeting.title,
    description: meeting.description ?? '',
    coverImageUrl: meeting.coverImageUrl ?? '',
    scheduledStartAt: toDateTimeLocalValue(meeting.scheduledStartAt),
    applicationEnabled: meeting.application.enabled,
    applicationStartAt: toDateTimeLocalValue(meeting.application.startAt),
    applicationEndAt: toDateTimeLocalValue(meeting.application.endAt),
    resultAnnouncementAt: toDateTimeLocalValue(meeting.application.resultAnnouncementAt),
    capacity: meeting.application.capacity,
    queueOpenAt: toDateTimeLocalValue(meeting.operation.queueOpenAt),
    callDurationSec: meeting.operation.callDurationSec,
    recordingEnabled: meeting.operation.recordingEnabled,
    translationEnabled: meeting.operation.translationEnabled,
    reconnectGraceSec: meeting.operation.reconnectGraceSec,
    earlyStartMinutes: meeting.operation.earlyStartMinutes,
    maxRecallCount: meeting.operation.maxRecallCount,
  }
}

/**
 * 팬미팅 한 건의 모든 운영 작업을 탭으로 묶은 상세 화면이다.
 *
 * 홍보·응모와 진행이 같은 팬미팅이므로 화면을 나누지 않고, 현재 상태에서 허용되는
 * 액션만 노출해 잘못된 전환 요청을 사전에 막는다.
 */
export function ManagerMeetingDetailPage() {
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = normalizeDetailTab(searchParams.get('tab'))
  // 주소를 직접 입력해도 운영 빌드에서는 테스트 패널에 접근할 수 없다.
  const tab = requestedTab === 'test-control' && !TEST_CONTROL_ENABLED
    ? 'overview'
    : requestedTab

  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  const [participantCount, setParticipantCount] = useState(0)
  const [drawCompleted, setDrawCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [applicantsRefresh, setApplicantsRefresh] = useState(0)
  const [actionNow, setActionNow] = useState(() => new Date())

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!meetingId) {
      setLoadError('팬미팅 식별자가 없습니다.')
      setLoading(false)
      return
    }
    const token = getAuthSession()?.accessToken
    if (!token) {
      setLoadError('팬미팅 정보를 조회하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const loaded = await fetchPublicFanMeetingDetail(Number(meetingId), token, signal)
      if (signal?.aborted) return
      setDetail(loaded)
      setLoadError(undefined)

      // 추첨 여부와 확정 참가자 수는 시작·결과 발표 버튼 노출 조건이라 함께 읽는다.
      const [statistics, participants] = await Promise.allSettled([
        getApplicationStatistics(meetingId, token),
        fetchParticipants(meetingId, { page: 0, size: 1 }, token, signal),
      ])
      if (signal?.aborted) return
      if (statistics.status === 'fulfilled') {
        setDrawCompleted(statistics.value.selectedCount + statistics.value.notSelectedCount > 0)
      }
      if (participants.status === 'fulfilled') {
        setParticipantCount(participants.value.totalElements)
      }
    } catch (cause) {
      if (signal?.aborted) return
      setLoadError(toErrorMessage(cause, '팬미팅 정보를 불러오지 못했습니다.'))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [meetingId])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    // 마감·조기 시작 경계가 지나면 새로고침하지 않아도 버튼 상태를 다시 계산한다.
    const timer = window.setInterval(() => setActionNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const actions = useMemo(
    () =>
      getAvailableActions({
        status: detail?.meeting.status,
        applicationEnabled: detail?.meeting.application.enabled,
        applicationStartAt: detail?.meeting.application.startAt,
        applicationEndAt: detail?.meeting.application.endAt,
        scheduledStartAt: detail?.meeting.scheduledStartAt,
        earlyStartMinutes: detail?.meeting.operation.earlyStartMinutes,
        participantCount,
        drawCompleted,
        now: actionNow,
      }),
    [actionNow, detail, drawCompleted, participantCount],
  )

  /** 확인을 받은 뒤 상태 전환 API를 실행하고 화면 값을 다시 읽는다. */
  async function runAction(action: MeetingOperationAction) {
    const confirmTexts: Record<typeof action, string> = {
      publish: '팬미팅을 발행할까요? 발행하면 팬에게 공개됩니다.',
      cancel: '팬미팅을 취소할까요? 취소하면 되돌릴 수 없습니다.',
      delete: '초안을 삭제할까요? 삭제하면 되돌릴 수 없습니다.',
      start: '팬미팅을 시작할까요? 대기열이 열리고 영상통화가 시작됩니다.',
      end: '팬미팅을 종료할까요? 진행 중인 통화가 모두 종료됩니다.',
      draw: '응모자 중에서 당첨자를 추첨할까요? 추첨 후에는 다시 실행할 수 없습니다.',
      publishResults: '응모 결과를 발표할까요? 모든 응모자에게 알림이 전송됩니다.',
      openApplicationsNow:
        '응모 접수를 지금 시작할까요? 응모 시작 시각이 현재로 변경되며, 이미 지난 마감 시각은 기존 응모 기간만큼 연장됩니다.',
      closeApplicationsNow:
        '응모 접수를 지금 마감할까요? 응모 마감 시각이 현재로 변경되며 이후에는 새 응모를 받을 수 없습니다.',
      startNow:
        '팬미팅을 지금 시작할까요? 예정 시작 시각이 현재로 변경되고 확정 참가자에게 즉시 영향을 줍니다.',
    }
    if (!window.confirm(confirmTexts[action])) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('작업을 수행하려면 먼저 로그인해 주세요.')
      return
    }

    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      if (action === 'publish') {
        await publishFanMeeting(Number(meetingId), token)
        setMessage('팬미팅을 발행했습니다. 응모 시작 일시가 되면 응모가 열립니다.')
      } else if (action === 'cancel') {
        await cancelFanMeeting(meetingId, token)
        setMessage('팬미팅을 취소했습니다.')
      } else if (action === 'delete') {
        await deleteFanMeetingDraft(meetingId, token)
        setMessage('초안을 삭제했습니다.')
      } else if (action === 'start') {
        await startFanMeeting(meetingId, token)
        setMessage('팬미팅을 시작했습니다.')
      } else if (action === 'end') {
        await endFanMeeting(meetingId, token)
        setMessage('팬미팅을 종료했습니다.')
      } else if (action === 'draw') {
        const result = await drawApplicationWinners(meetingId, token)
        setMessage(
          `추첨을 완료했습니다. 당첨 ${result.selectedCount}명 · 미당첨 ${result.notSelectedCount}명 · 참가자 ${result.participantCount}명`,
        )
        setApplicantsRefresh((value) => value + 1)
      } else if (action === 'publishResults') {
        const result = await publishApplicationResults(meetingId, token)
        setMessage(`응모 결과를 발표했습니다. 알림 ${result.notificationCount}건을 전송했습니다.`)
        setApplicantsRefresh((value) => value + 1)
      } else {
        const currentStatus = detail?.meeting.status
        if (!currentStatus) throw new TypeError('현재 팬미팅 상태를 확인할 수 없습니다.')

        const targetStatus = action === 'openApplicationsNow'
          ? 'APPLICATION_OPEN'
          : action === 'closeApplicationsNow'
            ? 'APPLICATION_CLOSED'
            : 'LIVE'
        await transitionFanMeetingImmediately(
          meetingId,
          currentStatus,
          targetStatus,
          token,
          {
            applicationStartAt: detail.meeting.application.startAt,
            applicationEndAt: detail.meeting.application.endAt,
          },
        )
        setMessage(
          action === 'openApplicationsNow'
            ? '응모 접수를 즉시 시작하고 응모 시작 시각을 현재로 갱신했습니다.'
            : action === 'closeApplicationsNow'
              ? '응모 접수를 즉시 마감하고 응모 마감 시각을 현재로 갱신했습니다.'
              : '팬미팅을 즉시 시작하고 예정 시작 시각을 현재로 갱신했습니다.',
        )
      }
      await load()
    } catch (cause) {
      setError(toErrorMessage(cause, '요청을 처리하지 못했습니다.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !detail) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Spinner label="팬미팅 정보를 불러오는 중" />
      </div>
    )
  }

  if (loadError || !detail) {
    return (
      <div className="grid gap-5 pb-10">
        <Link className="inline-flex w-fit items-center gap-2 text-sm font-semibold" to="/manager/fan-meetings">
          <ArrowLeft size={17} /> 팬미팅 목록으로
        </Link>
        <AlertBanner title="팬미팅 조회 실패" variant="error">
          {loadError ?? '팬미팅 정보를 찾을 수 없습니다.'}
        </AlertBanner>
      </div>
    )
  }

  const status = detail.meeting.status

  return (
    <div className="grid gap-6 pb-10">
      <header className="grid gap-3">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary-coral)]"
          to="/manager/fan-meetings"
        >
          <ArrowLeft size={17} /> 팬미팅 목록으로
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={meetingStatusBadge(status)}>{meetingStatusLabel(status)}</Badge>
          <h1 className="text-3xl font-black tracking-[-0.05em]">{detail.meeting.title}</h1>
        </div>
        <p className="text-[var(--color-text-secondary)]">
          {detail.influencer.name} · 예정 {formatDateTime(detail.meeting.scheduledStartAt)}
        </p>
      </header>

      {error ? <AlertBanner title="요청 실패" variant="error">{error}</AlertBanner> : null}
      {message ? (
        <AlertBanner onDismiss={() => setMessage(undefined)} title="처리 완료" variant="success">
          {message}
        </AlertBanner>
      ) : null}

      <nav className="flex flex-wrap gap-1 border-b border-[var(--color-divider)]" aria-label="팬미팅 관리 탭">
        {TABS.map((item) => (
          <button
            aria-current={tab === item.id ? 'page' : undefined}
            className={`min-h-11 rounded-t-[var(--radius-control)] px-5 text-sm font-bold transition-colors ${
              tab === item.id
                ? 'border-b-2 border-[var(--color-primary-coral)] text-[var(--color-primary-coral)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
            key={item.id}
            onClick={() => setSearchParams(item.id === 'overview' ? {} : { tab: item.id })}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <OverviewPanel
          actions={actions}
          busy={busy}
          detail={detail}
          drawCompleted={drawCompleted}
          meetingId={meetingId}
          onAction={runAction}
          participantCount={participantCount}
        />
      ) : null}

      {tab === 'settings' ? (
        <SettingsPanel
          actions={actions}
          detail={detail}
          meetingId={meetingId}
          onSaved={() => void load()}
        />
      ) : null}

      {tab === 'application-form' ? (
        <ManagerApplicationFormPanel
          editable={actions.canEditApplicationForm}
          lockedReason={
            actions.applicationStarted
              ? '응모가 시작된 뒤에는 응모 폼을 수정할 수 없습니다.'
              : '발행 전 또는 발행 직후 상태에서만 응모 폼을 수정할 수 있습니다.'
          }
          meetingId={meetingId}
        />
      ) : null}

      {tab === 'applicants' ? (
        <ManagerApplicantsPanel meetingId={meetingId} refreshToken={applicantsRefresh} />
      ) : null}

      {TEST_CONTROL_ENABLED && tab === 'test-control' ? (
        <TestControlPanel detail={detail} meetingId={meetingId} onApplied={() => void load()} />
      ) : null}
    </div>
  )
}

/** 팬미팅의 진행 흐름과 현재 상태에서 가능한 운영 액션을 한 화면에 모은다. */
function OverviewPanel({
  detail,
  actions,
  busy,
  meetingId,
  participantCount,
  drawCompleted,
  onAction,
}: {
  detail: PublicFanMeetingDetail
  actions: ReturnType<typeof getAvailableActions>
  busy: boolean
  meetingId: string
  participantCount: number
  drawCompleted: boolean
  onAction: (action: MeetingOperationAction) => void
}) {
  const { meeting } = detail
  const encodedId = encodeURIComponent(meetingId)

  return (
    <div className="grid gap-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">운영 액션</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              현재 상태에서 실행할 수 있는 작업만 표시합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.canPublish ? (
              <Button disabled={busy} onClick={() => onAction('publish')} size="sm">발행</Button>
            ) : null}
            {actions.canDraw ? (
              <Button disabled={busy} onClick={() => onAction('draw')} size="sm">추첨하기</Button>
            ) : null}
            {actions.canPublishResults ? (
              <Button disabled={busy} onClick={() => onAction('publishResults')} size="sm">결과 발표</Button>
            ) : null}
            {actions.canStart ? (
              <Button disabled={busy} onClick={() => onAction('start')} size="sm">팬미팅 시작</Button>
            ) : null}
            {actions.canEnd ? (
              <Button disabled={busy} onClick={() => onAction('end')} size="sm" variant="secondary">종료</Button>
            ) : null}
            {actions.canDeleteDraft ? (
              <Button disabled={busy} onClick={() => onAction('delete')} size="sm" variant="danger">초안 삭제</Button>
            ) : null}
            {actions.canCancel ? (
              <Button disabled={busy} onClick={() => onAction('cancel')} size="sm" variant="danger">취소</Button>
            ) : null}
          </div>
        </div>
        {(actions.canOpenApplicationsNow ||
          actions.canCloseApplicationsNow ||
          (actions.canStartNow && !actions.canStart)) ? (
          <div className="mt-5 rounded-[var(--radius-control)] border border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong className="text-sm text-[var(--color-warning)]">예약 시간 전 수동 운영</strong>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  서버의 기간 검증과 실제 시작 기록을 일치시키기 위해 해당 예약 시각도 현재로 갱신됩니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {actions.canOpenApplicationsNow ? (
                  <Button disabled={busy} onClick={() => onAction('openApplicationsNow')} size="sm" variant="secondary">
                    응모 지금 시작
                  </Button>
                ) : null}
                {actions.canCloseApplicationsNow ? (
                  <Button disabled={busy} onClick={() => onAction('closeApplicationsNow')} size="sm" variant="secondary">
                    응모 지금 마감
                  </Button>
                ) : null}
                {actions.canStartNow && !actions.canStart ? (
                  <Button disabled={busy} onClick={() => onAction('startNow')} size="sm">
                    일정 전에 팬미팅 시작
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {actions.startBlockedReason ? (
          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">{actions.startBlockedReason}</p>
        ) : null}
        {meeting.status === 'PUBLISHED' ? (
          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
            응모 시작 일시({formatDateTime(meeting.application.startAt)})가 지나면 응모 접수가 열립니다.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <Badge variant="primary">진행 현황</Badge>
          <CardTitle as="h2" className="mt-3">팬미팅 흐름</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3">
            <FlowStep
              done={meeting.status !== 'DRAFT'}
              description={`발행하면 팬에게 공개됩니다. ${meeting.status === 'DRAFT' ? '아직 초안입니다.' : ''}`}
              title="1. 홍보 정보 발행"
            />
            <FlowStep
              done={['APPLICATION_OPEN', 'APPLICATION_CLOSED', 'READY', 'LIVE', 'ENDED'].includes(meeting.status)}
              description={
                meeting.application.enabled
                  ? `응모 기간 ${formatDateTime(meeting.application.startAt)} ~ ${formatDateTime(meeting.application.endAt)} · 모집 ${meeting.application.capacity}명`
                  : '이 팬미팅은 응모를 사용하지 않습니다.'
              }
              title="2. 팬 응모 접수"
            />
            <FlowStep
              done={drawCompleted}
              description={`추첨하면 당첨자가 참가자와 대기열로 바로 등록됩니다. 현재 확정 참가자 ${participantCount}명.`}
              title="3. 당첨자 추첨"
            />
            <FlowStep
              done={['READY', 'LIVE', 'ENDED'].includes(meeting.status)}
              description="결과를 발표하면 응모자 전원에게 알림이 가고 팬미팅이 시작 대기 상태가 됩니다."
              title="4. 결과 발표"
            />
            <FlowStep
              done={['LIVE', 'ENDED'].includes(meeting.status)}
              description={`대기열 개방 ${formatDateTime(meeting.operation.queueOpenAt)} · 1인 통화 ${meeting.operation.callDurationSec}초`}
              title="5. 팬미팅 진행"
            />
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Badge variant="primary">바로 가기</Badge>
          <CardTitle as="h2" className="mt-3">연결된 관리 화면</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <QuickLink label="확정 참가자" to={`/manager/fan-meetings/${encodedId}/fans`} />
          <QuickLink label="공지 관리" to={`/manager/fan-meetings/${encodedId}/notices`} />
          <QuickLink label="실시간 운영 모니터" to={`/manager/fan-meetings/${encodedId}/monitor`} />
          <QuickLink label="결과 통계" to={`/manager/fan-meetings/${encodedId}/statistics`} />
          <QuickLink label="커뮤니티" to={`/manager/fan-meetings/${encodedId}/community`} />
        </CardContent>
      </Card>
    </div>
  )
}

/** 팬미팅 흐름의 단계 하나를 완료 여부와 함께 표시한다. */
function FlowStep({ title, description, done }: { title: string; description: string; done: boolean }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-[var(--color-divider)] p-4">
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
          done ? 'bg-[var(--color-success)] text-white' : 'bg-[var(--color-surface-page)] text-[var(--color-text-tertiary)]'
        }`}
      >
        {done ? '✓' : ''}
      </span>
      <div className="min-w-0">
        <strong className="text-sm">{title}</strong>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
      </div>
    </li>
  )
}

/** 상세 화면에서 다른 관리 화면으로 이동하는 링크 한 줄이다. */
function QuickLink({ label, to }: { label: string; to: string }) {
  return (
    <Link
      className="flex min-h-12 items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-4 text-sm font-bold hover:bg-[var(--color-surface-page)]"
      to={to}
    >
      {label}
      <ArrowRight aria-hidden="true" size={17} />
    </Link>
  )
}

/**
 * 팬미팅 기본 정보, 응모 설정, 운영 설정을 한 폼에서 수정한다.
 *
 * 백엔드는 응모가 시작되면 재접속·조기 시작·재호출 값 외에는 수정 요청 자체를 거부하므로,
 * 잠긴 항목은 입력을 비활성화하고 PATCH 본문에서도 제외한다.
 */
function SettingsPanel({
  meetingId,
  detail,
  actions,
  onSaved,
}: {
  meetingId: string
  detail: PublicFanMeetingDetail
  actions: ReturnType<typeof getAvailableActions>
  onSaved: () => void
}) {
  const [form, setForm] = useState<SettingsForm>(() => toSettingsForm(detail))
  const [dirty, setDirty] = useState<Set<SettingsField>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    setForm(toSettingsForm(detail))
    setDirty(new Set())
  }, [detail])

  /** 필드 값을 바꾸고 변경 목록에 기록한다. 변경한 필드만 PATCH에 담는다. */
  function setField<K extends SettingsField>(field: K, value: SettingsForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setDirty((current) => new Set(current).add(field))
  }

  const scheduleErrors = getScheduleErrors({
    scheduledStartAt: form.scheduledStartAt,
    applicationEnabled: form.applicationEnabled,
    applicationStartAt: form.applicationStartAt || null,
    applicationEndAt: form.applicationEndAt || null,
    resultAnnouncementAt: form.resultAnnouncementAt || null,
    queueOpenAt: form.queueOpenAt,
  })

  /** 변경한 항목만 골라 PATCH 요청을 보낸다. */
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
    if (scheduleErrors.length > 0) {
      setError(scheduleErrors[0])
      return
    }

    const patch: FanMeetingUpdateRequest = {}

    if (actions.canEditBasic) {
      if (dirty.has('title') && form.title.trim()) patch.title = form.title.trim()
      // 백엔드는 빈 문자열을 null로 정규화하므로 내용을 지울 때도 빈 문자열을 보낸다.
      if (dirty.has('description')) patch.description = form.description.trim()
      if (dirty.has('coverImageUrl')) patch.coverImageUrl = form.coverImageUrl.trim()
      if (dirty.has('scheduledStartAt') && form.scheduledStartAt) {
        patch.scheduledStartAt = toApiLocalDateTime(form.scheduledStartAt)
      }

      // 백엔드 병합 규칙상 값을 생략하면 기존 값이 유지되므로 변경한 항목만 담는다.
      const application: NonNullable<FanMeetingUpdateRequest['application']> = {}
      if (dirty.has('applicationStartAt') && form.applicationStartAt) {
        application.startAt = toApiLocalDateTime(form.applicationStartAt)
      }
      if (dirty.has('applicationEndAt') && form.applicationEndAt) {
        application.endAt = toApiLocalDateTime(form.applicationEndAt)
      }
      if (dirty.has('resultAnnouncementAt') && form.resultAnnouncementAt) {
        application.resultAnnouncementAt = toApiLocalDateTime(form.resultAnnouncementAt)
      }
      if (dirty.has('capacity')) application.capacity = form.capacity
      if (Object.keys(application).length > 0) patch.application = application
    }

    const operation: NonNullable<FanMeetingUpdateRequest['operation']> = {}
    if (actions.canEditOperation) {
      if (dirty.has('queueOpenAt') && form.queueOpenAt) operation.queueOpenAt = toApiLocalDateTime(form.queueOpenAt)
      if (dirty.has('callDurationSec')) operation.callDurationSec = form.callDurationSec
      if (dirty.has('recordingEnabled')) operation.recordingEnabled = form.recordingEnabled
      if (dirty.has('translationEnabled')) operation.translationEnabled = form.translationEnabled
    }
    if (actions.canEditPolicy) {
      if (dirty.has('reconnectGraceSec')) operation.reconnectGraceSec = form.reconnectGraceSec
      if (dirty.has('earlyStartMinutes')) operation.earlyStartMinutes = form.earlyStartMinutes
      if (dirty.has('maxRecallCount')) operation.maxRecallCount = form.maxRecallCount
    }
    if (Object.keys(operation).length > 0) patch.operation = operation

    if (Object.keys(patch).length === 0) {
      setMessage('현재 상태에서 저장할 수 있는 변경 항목이 없습니다.')
      return
    }

    setSaving(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await patchFanMeeting(meetingId, patch, token)
      setMessage('팬미팅 설정을 저장했습니다.')
      setDirty(new Set())
      onSaved()
    } catch (cause) {
      setError(toErrorMessage(cause, '팬미팅 설정을 저장하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  const basicLocked = !actions.canEditBasic
  const operationLocked = !actions.canEditOperation

  return (
    <form className="grid gap-5" onSubmit={save}>
      {basicLocked ? (
        <AlertBanner title="수정할 수 없는 항목이 있습니다" variant="info">
          {actions.applicationStarted
            ? '응모가 시작되어 기본 정보·응모 설정·대기열 설정은 수정할 수 없습니다. 재접속 유예, 조기 시작 허용, 최대 재호출 횟수만 변경할 수 있습니다.'
            : '진행이 시작되었거나 종료된 팬미팅은 수정할 수 없습니다.'}
        </AlertBanner>
      ) : null}

      <Card>
        <CardHeader>
          <Badge variant="primary">기본 정보</Badge>
          <CardTitle as="h2" className="mt-3">팬에게 공개되는 정보</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <TextField
            containerClassName="sm:col-span-2"
            disabled={basicLocked}
            label="팬미팅 제목"
            maxLength={200}
            onChange={(event) => setField('title', event.target.value)}
            value={form.title}
          />
          <TextField
            disabled={basicLocked}
            label="팬미팅 시작 일시"
            onChange={(event) => setField('scheduledStartAt', event.target.value)}
            type="datetime-local"
            value={form.scheduledStartAt}
          />
          <TextField
            disabled={basicLocked}
            label="커버 이미지 URL"
            maxLength={2048}
            onChange={(event) => setField('coverImageUrl', event.target.value)}
            placeholder="https://example.com/cover.jpg"
            type="url"
            value={form.coverImageUrl}
          />
          <Textarea
            containerClassName="sm:col-span-2"
            disabled={basicLocked}
            label="상세 소개"
            onChange={(event) => setField('description', event.target.value)}
            placeholder="팬에게 보여 줄 팬미팅 소개와 응모 안내를 입력해 주세요."
            rows={6}
            value={form.description}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Badge variant="primary">응모 설정</Badge>
          <CardTitle as="h2" className="mt-3">응모 기간과 모집 인원</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Checkbox
            checked={form.applicationEnabled}
            description="응모 사용 여부는 생성 시에만 정할 수 있습니다. 백엔드 수정 API는 이미 저장된 응모 일시를 지울 수 없어 여기에서는 바꿀 수 없습니다."
            disabled
            label="팬 응모를 진행합니다."
            readOnly
          />
          {form.applicationEnabled ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                disabled={basicLocked}
                label="응모 시작 일시"
                onChange={(event) => setField('applicationStartAt', event.target.value)}
                type="datetime-local"
                value={form.applicationStartAt}
              />
              <TextField
                disabled={basicLocked}
                error={scheduleErrors.find((item) => item.startsWith('응모 마감'))}
                label="응모 마감 일시"
                onChange={(event) => setField('applicationEndAt', event.target.value)}
                type="datetime-local"
                value={form.applicationEndAt}
              />
              <TextField
                disabled={basicLocked}
                error={scheduleErrors.find((item) => item.startsWith('결과 발표'))}
                label="결과 발표 일시"
                onChange={(event) => setField('resultAnnouncementAt', event.target.value)}
                type="datetime-local"
                value={form.resultAnnouncementAt}
              />
              <TextField
                disabled={basicLocked}
                label="모집 인원"
                min={1}
                onChange={(event) => setField('capacity', Number(event.target.value))}
                type="number"
                value={form.capacity}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Badge variant="primary">운영 설정</Badge>
          <CardTitle as="h2" className="mt-3">대기열과 영상통화 조건</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <TextField
            disabled={operationLocked}
            error={scheduleErrors.find((item) => item.startsWith('대기열 오픈'))}
            label="대기열 오픈 일시"
            onChange={(event) => setField('queueOpenAt', event.target.value)}
            type="datetime-local"
            value={form.queueOpenAt}
          />
          <Select
            disabled={operationLocked}
            label="1인 통화 시간"
            onChange={(event) => setField('callDurationSec', Number(event.target.value))}
            options={[
              { value: '120', label: '2분' },
              { value: '180', label: '3분' },
              { value: '300', label: '5분' },
            ]}
            value={String(form.callDurationSec)}
          />
          <div className="grid gap-3 rounded-xl border border-[var(--color-divider)] p-4 sm:col-span-2">
            <Checkbox
              checked={form.recordingEnabled}
              disabled={operationLocked}
              label="통화 녹화를 사용합니다."
              onChange={(event) => setField('recordingEnabled', event.target.checked)}
            />
            <Checkbox
              checked={form.translationEnabled}
              disabled={operationLocked}
              label="실시간 번역을 사용합니다."
              onChange={(event) => setField('translationEnabled', event.target.checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Badge variant="primary">진행 정책</Badge>
          <CardTitle as="h2" className="mt-3">당일 운영 세부 값</CardTitle>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            이 세 값은 응모가 시작된 뒤에도 팬미팅 시작 전까지 변경할 수 있습니다.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <TextField
            disabled={!actions.canEditPolicy}
            label="재접속 허용 시간(초)"
            min={0}
            onChange={(event) => setField('reconnectGraceSec', Number(event.target.value))}
            type="number"
            value={form.reconnectGraceSec}
          />
          <TextField
            disabled={!actions.canEditPolicy}
            label="조기 시작 허용(분)"
            min={0}
            onChange={(event) => setField('earlyStartMinutes', Number(event.target.value))}
            type="number"
            value={form.earlyStartMinutes}
          />
          <TextField
            disabled={!actions.canEditPolicy}
            label="최대 재호출 횟수"
            min={0}
            onChange={(event) => setField('maxRecallCount', Number(event.target.value))}
            type="number"
            value={form.maxRecallCount}
          />
        </CardContent>
      </Card>

      {error ? <AlertBanner title="저장 실패" variant="error">{error}</AlertBanner> : null}
      {message ? (
        <AlertBanner onDismiss={() => setMessage(undefined)} title="처리 결과" variant="success">
          {message}
        </AlertBanner>
      ) : null}

      {actions.canEditPolicy ? (
        <div className="flex justify-end">
          <Button
            disabled={scheduleErrors.length > 0}
            leadingIcon={<FloppyDisk size={18} />}
            loading={saving}
            type="submit"
          >
            변경 내용 저장
          </Button>
        </div>
      ) : null}
    </form>
  )
}

/**
 * 테스트 제어 폼이 다루는 값이며 일시는 datetime-local 문자열이다.
 *
 * 비워 둔 일시는 요청에서 빠지고 백엔드가 기존 설정을 유지한다.
 */
type TestControlForm = {
  status: FanMeetingStatus
  scheduledStartAt: string
  applicationOpenAt: string
  applicationCloseAt: string
  resultAnnouncementAt: string
  waitingRoomOpenAt: string
}

/**
 * 상세 응답을 테스트 제어 폼 초기값으로 바꾼다.
 *
 * 대기실 오픈은 조회 응답에서 operation.queueOpenAt이지만 test-control 요청에서는
 * waitingRoomOpenAt이라 이름이 다르므로 여기서 맞춰 담는다.
 */
function toTestControlForm(detail: PublicFanMeetingDetail): TestControlForm {
  const { meeting } = detail
  return {
    status: meeting.status,
    scheduledStartAt: toDateTimeLocalValue(meeting.scheduledStartAt),
    applicationOpenAt: toDateTimeLocalValue(meeting.application.startAt),
    applicationCloseAt: toDateTimeLocalValue(meeting.application.endAt),
    resultAnnouncementAt: toDateTimeLocalValue(meeting.application.resultAnnouncementAt),
    waitingRoomOpenAt: toDateTimeLocalValue(meeting.operation.queueOpenAt),
  }
}

/**
 * 현재 시각에서 분 단위로 떨어진 시각을 datetime-local 입력값 형식으로 만든다.
 *
 * toISOString()은 UTC로 바꿔 버려 로컬 시각과 어긋나므로 직접 조립한다.
 */
function nowDateTimeLocal(offsetMinutes = 0): string {
  const target = new Date(Date.now() + offsetMinutes * 60_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`
}

/**
 * 선택한 상태가 성립하도록 일정 필드를 현재 시각 기준으로 다시 계산한다.
 *
 * 오프셋 표가 없는 상태(CANCELED)는 일정을 건드리지 않고 상태만 바꾼다.
 */
function withScheduleForStatus(
  form: TestControlForm,
  status: FanMeetingStatus,
): TestControlForm {
  const offsets = TEST_CONTROL_SCHEDULE_OFFSETS[status]
  if (!offsets) return { ...form, status }

  return {
    status,
    applicationOpenAt: nowDateTimeLocal(offsets.applicationOpenAt),
    applicationCloseAt: nowDateTimeLocal(offsets.applicationCloseAt),
    resultAnnouncementAt: nowDateTimeLocal(offsets.resultAnnouncementAt),
    waitingRoomOpenAt: nowDateTimeLocal(offsets.waitingRoomOpenAt),
    scheduledStartAt: nowDateTimeLocal(offsets.scheduledStartAt),
  }
}

/**
 * 정상 전환 규칙을 건너뛰고 상태와 일정을 강제로 바꾸는 시연·테스트 전용 패널이다.
 *
 * 실제 운영 흐름은 개요 탭의 발행·시작·종료 버튼을 쓴다. 이 탭은 응모 기간을 기다리지 않고
 * 곧바로 특정 상태를 재현해야 할 때만 사용한다.
 */
function TestControlPanel({
  meetingId,
  detail,
  onApplied,
}: {
  meetingId: string
  detail: PublicFanMeetingDetail
  onApplied: () => void
}) {
  const [form, setForm] = useState<TestControlForm>(() => toTestControlForm(detail))
  // 상태만 확인하려는 테스트에서 기존 행사 일정을 실수로 덮어쓰지 않도록 기본값은 꺼 둔다.
  const [autoSchedule, setAutoSchedule] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    setForm(toTestControlForm(detail))
  }, [detail])

  /** 자동 조정을 끈 상태에서 일시를 직접 고칠 때 쓴다. */
  function setField<K extends keyof TestControlForm>(field: K, value: TestControlForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  /** 상태를 바꾼다. 자동 조정이 켜져 있으면 일정도 그 상태에 맞게 다시 채운다. */
  function changeStatus(status: FanMeetingStatus) {
    setForm((current) =>
      autoSchedule ? withScheduleForStatus(current, status) : { ...current, status },
    )
    setMessage(undefined)
    setError(undefined)
  }

  /** 자동 조정을 다시 켜는 순간 현재 상태 기준으로 일정을 즉시 맞춰 준다. */
  function changeAutoSchedule(enabled: boolean) {
    setAutoSchedule(enabled)
    if (enabled) setForm((current) => withScheduleForStatus(current, current.status))
  }

  /** 비어 있지 않은 값만 골라 강제 변경을 요청한다. 빈 값은 기존 설정을 유지한다. */
  async function apply(event: FormEvent) {
    event.preventDefault()

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError('테스트 제어를 실행하려면 먼저 로그인해 주세요.')
      return
    }
    if (!window.confirm('상태와 일정을 강제로 변경할까요? 정상 전환 규칙을 건너뜁니다.')) return

    const request: FanMeetingTestControlRequest = { status: form.status }
    if (form.scheduledStartAt) request.scheduledStartAt = toApiLocalDateTime(form.scheduledStartAt)
    if (form.applicationOpenAt) request.applicationOpenAt = toApiLocalDateTime(form.applicationOpenAt)
    if (form.applicationCloseAt) request.applicationCloseAt = toApiLocalDateTime(form.applicationCloseAt)
    if (form.resultAnnouncementAt) {
      request.resultAnnouncementAt = toApiLocalDateTime(form.resultAnnouncementAt)
    }
    if (form.waitingRoomOpenAt) request.waitingRoomOpenAt = toApiLocalDateTime(form.waitingRoomOpenAt)

    setSaving(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const updated = await controlFanMeetingForTest(meetingId, request, token)
      setMessage(`상태를 ${meetingStatusLabel(updated.status)}(으)로 변경했습니다.`)
      onApplied()
    } catch (cause) {
      setError(toErrorMessage(cause, '테스트 제어를 실행하지 못했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-5" onSubmit={apply}>
      <AlertBanner title="시연·테스트 전용 기능입니다" variant="warning">
        상태 전환 규칙과 일정 검증을 모두 건너뛰고 값을 그대로 덮어씁니다. 실제 운영에서는 개요 탭의
        발행·시작·종료 버튼을 사용해 주세요.
      </AlertBanner>

      <Card>
        <CardHeader>
          <Badge variant="warning">테스트 제어</Badge>
          <CardTitle as="h2" className="mt-3">상태·일정 강제 변경</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Select
            label="팬미팅 상태"
            onChange={(event) => changeStatus(event.target.value as FanMeetingStatus)}
            options={TEST_CONTROL_STATUS_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={form.status}
          />
          <div className="grid content-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-4 py-3">
            <Checkbox
              checked={autoSchedule}
              label="상태에 맞춰 일시 자동 조정"
              onChange={(event) => changeAutoSchedule(event.target.checked)}
            />
          </div>
          <TextField
            disabled={autoSchedule}
            label="팬미팅 시작 일시"
            onChange={(event) => setField('scheduledStartAt', event.target.value)}
            type="datetime-local"
            value={form.scheduledStartAt}
          />
          <TextField
            disabled={autoSchedule}
            label="응모 시작 일시"
            onChange={(event) => setField('applicationOpenAt', event.target.value)}
            type="datetime-local"
            value={form.applicationOpenAt}
          />
          <TextField
            disabled={autoSchedule}
            label="응모 종료 일시"
            onChange={(event) => setField('applicationCloseAt', event.target.value)}
            type="datetime-local"
            value={form.applicationCloseAt}
          />
          <TextField
            disabled={autoSchedule}
            label="결과 발표 일시"
            onChange={(event) => setField('resultAnnouncementAt', event.target.value)}
            type="datetime-local"
            value={form.resultAnnouncementAt}
          />
          <TextField
            disabled={autoSchedule}
            label="대기실 오픈 일시"
            onChange={(event) => setField('waitingRoomOpenAt', event.target.value)}
            type="datetime-local"
            value={form.waitingRoomOpenAt}
          />
          <p className="text-xs leading-5 text-[var(--color-text-secondary)] sm:col-span-2">
            {autoSchedule
              ? '상태를 고르면 그 상태가 성립하는 일시로 자동 계산합니다. 직접 입력하려면 자동 조정을 꺼 주세요.'
              : '비워 둔 일시는 기존 설정을 그대로 유지합니다. 상태는 항상 함께 전송됩니다.'}
          </p>
        </CardContent>
      </Card>

      {error ? <AlertBanner title="실행 실패" variant="error">{error}</AlertBanner> : null}
      {message ? (
        <AlertBanner onDismiss={() => setMessage(undefined)} title="처리 완료" variant="success">
          {message}
        </AlertBanner>
      ) : null}

      <div className="flex justify-end">
        <Button loading={saving} type="submit">
          강제 변경 실행
        </Button>
      </div>
    </form>
  )
}
