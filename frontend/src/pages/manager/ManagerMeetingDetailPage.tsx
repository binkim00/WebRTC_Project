import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
import { useNowTicker } from '../../hooks/useNowTicker'
import {
  CALL_DURATION_MAX_MINUTES,
  CALL_DURATION_MIN_MINUTES,
  callDurationSecToMinutesInput,
  formatCallDuration,
  minutesInputToCallDurationSec,
  validateCallDurationSec,
} from './callDuration'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  Select,
  Spinner,
  TextField,
  Textarea,
} from '../../components'
// components/index.ts는 여러 세션이 함께 고치는 파일이라 배럴을 거치지 않고 직접 가져온다.
import { CoverImageUpload } from '../../components/meeting/CoverImageUpload'
import { ManagerApplicantsPanel } from './ManagerApplicantsPanel'
import { ManagerApplicationFormPanel } from './ManagerApplicationFormPanel'
import {
  formatDateTime,
  getAvailableActions,
  getScheduleErrors,
  meetingStatusLabel,
  normalizeDetailTab,
  toApiLocalDateTime,
  toDateTimeLocalValue,
  toErrorMessage,
  type MeetingDetailTab,
} from './meetingLifecycle'
import { translate, useTranslation } from '../../i18n'

/**
 * 위험한 테스트 제어는 개발 서버에서도 명시적으로 켠 경우에만 노출한다.
 * 운영자가 사용하는 즉시 전환은 개요 탭의 제한된 순방향 액션으로 별도 제공한다.
 */
const TEST_CONTROL_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_TEST_CONTROLS === 'true'

/**
 * 상세 화면 상단에 표시할 탭 목록이다.
 *
 * 라벨은 탭이 실제로 하는 일을 기준으로 붙인다:
 * 진행 현황(단계 확인·다음 액션 실행) / 응모자·추첨(응모 목록과 추첨·발표) /
 * 응모 질문(응모 폼 질문 편집) / 정보 수정(제목·일정·운영 설정 편집).
 */
const TABS = (): readonly { id: MeetingDetailTab; label: string }[] => [
  { id: 'overview', label: translate('managerMeetingDetailPage.t138') },
  { id: 'applicants', label: translate('managerMeetingDetailPage.t139') },
  { id: 'application-form', label: translate('managerMeetingDetailPage.t140') },
  { id: 'settings', label: translate('managerMeetingDetailPage.t141') },
  ...(TEST_CONTROL_ENABLED
    ? [{ id: 'test-control' as const, label: translate('managerMeetingDetailPage.t142') }]
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

const ACTION_CONFIRMATION = (): Record<
  MeetingOperationAction,
  { title: string; description: string; confirmLabel: string }
> => ({
  publish: {
    title: translate('managerMeetingDetailPage.t143'),
    description: translate('managerMeetingDetailPage.t144'),
    confirmLabel: translate('managerMeetingDetailPage.t145'),
  },
  cancel: {
    title: translate('managerMeetingDetailPage.t146'),
    description: translate('managerMeetingDetailPage.t147'),
    confirmLabel: translate('managerMeetingDetailPage.t148'),
  },
  delete: {
    title: translate('managerMeetingDetailPage.t149'),
    description: translate('managerMeetingDetailPage.t150'),
    confirmLabel: translate('managerMeetingDetailPage.t151'),
  },
  start: {
    title: translate('managerMeetingDetailPage.t152'),
    description: translate('managerMeetingDetailPage.t153'),
    confirmLabel: translate('managerMeetingDetailPage.t154'),
  },
  end: {
    title: translate('managerMeetingDetailPage.t155'),
    description: translate('managerMeetingDetailPage.t156'),
    confirmLabel: translate('managerMeetingDetailPage.t157'),
  },
  draw: {
    title: translate('managerMeetingDetailPage.t158'),
    description: translate('managerMeetingDetailPage.t159'),
    confirmLabel: translate('managerMeetingDetailPage.t160'),
  },
  publishResults: {
    title: translate('managerMeetingDetailPage.t161'),
    description: translate('managerMeetingDetailPage.t162'),
    confirmLabel: translate('managerMeetingDetailPage.t163'),
  },
  openApplicationsNow: {
    title: translate('managerMeetingDetailPage.t164'),
    description: translate('managerMeetingDetailPage.t165'),
    confirmLabel: translate('managerMeetingDetailPage.t166'),
  },
  closeApplicationsNow: {
    title: translate('managerMeetingDetailPage.t167'),
    description: translate('managerMeetingDetailPage.t168'),
    confirmLabel: translate('managerMeetingDetailPage.t169'),
  },
  startNow: {
    title: translate('managerMeetingDetailPage.t170'),
    description: translate('managerMeetingDetailPage.t171'),
    confirmLabel: translate('managerMeetingDetailPage.t172'),
  },
})

/** 상태 배지를 추가하지 않고 토큰 색상의 텍스트로 상태를 구분한다. */
function meetingStatusTextClass(status?: string | null): string {
  if (status === 'LIVE') return 'text-[var(--color-primary-coral)]'
  if (status === 'PUBLISHED' || status === 'APPLICATION_OPEN' || status === 'READY') {
    return 'text-[var(--color-success)]'
  }
  if (status === 'APPLICATION_CLOSED' || status === 'DRAFT') {
    return 'text-[var(--color-warning)]'
  }
  if (status === 'CANCELED') return 'text-[var(--color-error)]'
  return 'text-[var(--color-text-secondary)]'
}

/** 상세 화면에서는 운영 상태를 사용자가 이해하기 쉬운 진행 단계로 표시한다. */
function meetingStatusDisplayLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    DRAFT: translate('managerMeetingDetailPage.t173'),
    PUBLISHED: translate('managerMeetingDetailPage.t174'),
    APPLICATION_OPEN: translate('managerMeetingDetailPage.t175'),
    APPLICATION_CLOSED: translate('managerMeetingDetailPage.t176'),
    READY: translate('managerMeetingDetailPage.t177'),
    LIVE: translate('managerMeetingDetailPage.t178'),
    ENDED: translate('managerMeetingDetailPage.t179'),
    CANCELED: translate('managerMeetingDetailPage.t180'),
  }
  return status ? labels[status] ?? translate('managerMeetingDetailPage.t181') : translate('managerMeetingDetailPage.t182')
}

/** 테스트 제어에서 강제로 지정할 수 있는 상태 목록이다. */
const TEST_CONTROL_STATUS_OPTIONS = (): readonly { value: FanMeetingStatus; label: string }[] => [
  { value: 'DRAFT', label: translate('managerMeetingDetailPage.t183') },
  { value: 'PUBLISHED', label: translate('managerMeetingDetailPage.t184') },
  { value: 'APPLICATION_OPEN', label: translate('managerMeetingDetailPage.t185') },
  { value: 'APPLICATION_CLOSED', label: translate('managerMeetingDetailPage.t186') },
  { value: 'READY', label: translate('managerMeetingDetailPage.t187') },
  { value: 'LIVE', label: translate('managerMeetingDetailPage.t188') },
  { value: 'ENDED', label: translate('managerMeetingDetailPage.t189') },
  { value: 'CANCELED', label: translate('managerMeetingDetailPage.t190') },
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
  const { t } = useTranslation()
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const navigate = useNavigate()
  const isSolo = getAuthSession()?.role === 'SOLO_INFLUENCER'
  const meetingListPath = isSolo ? '/influencer/fan-meetings' : '/manager/fan-meetings'
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = normalizeDetailTab(searchParams.get('tab'))
  // 주소를 직접 입력해도 운영 빌드에서는 테스트 패널에 접근할 수 없다.
  const tab = requestedTab === 'test-control' && !TEST_CONTROL_ENABLED
    ? 'overview'
    : requestedTab

  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  const [applicantCount, setApplicantCount] = useState(0)
  const [participantCount, setParticipantCount] = useState(0)
  const [drawCompleted, setDrawCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [pendingAction, setPendingAction] = useState<MeetingOperationAction>()
  // 추첨·발표 직후 응모자 탭 목록이 새 상태를 다시 읽도록 신호를 준다.
  const [applicantsRefresh, setApplicantsRefresh] = useState(0)
  // 마감·조기 시작 경계가 지나면 새로고침하지 않아도 버튼 상태를 다시 계산한다.
  const actionNowMs = useNowTicker(15_000)
  // getAvailableActions가 Date를 받고 useMemo 의존성으로도 쓰이므로 identity를 고정한다.
  const actionNow = useMemo(() => new Date(actionNowMs), [actionNowMs])

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!meetingId) {
      setLoadError(t('managerMeetingDetailPage.t78'))
      setLoading(false)
      return
    }
    const token = getAuthSession()?.accessToken
    if (!token) {
      setLoadError(t('managerMeetingDetailPage.t79'))
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
        setApplicantCount(statistics.value.totalApplications)
        setDrawCompleted(statistics.value.selectedCount + statistics.value.notSelectedCount > 0)
      }
      if (participants.status === 'fulfilled') {
        setParticipantCount(participants.value.totalElements)
      }
    } catch (cause) {
      if (signal?.aborted) return
      setLoadError(toErrorMessage(cause, t('managerMeetingDetailPage.t80')))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])


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

  /** 확인 모달에서 승인된 상태 전환 API를 실행하고 화면 값을 다시 읽는다. */
  async function runAction(action: MeetingOperationAction) {
    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('managerMeetingDetailPage.t81'))
      return
    }

    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    // 운영 모니터로 넘어가는 경우에는 이 화면을 다시 읽지 않는다. 떠난 화면의 상태를 갱신하는
    // 요청일 뿐이다.
    let navigatedAway = false
    try {
      if (action === 'publish') {
        await publishFanMeeting(Number(meetingId), token)
        setMessage(t('managerMeetingDetailPage.t82'))
      } else if (action === 'cancel') {
        await cancelFanMeeting(meetingId, token)
        setMessage(t('managerMeetingDetailPage.t83'))
      } else if (action === 'delete') {
        await deleteFanMeetingDraft(meetingId, token)
        setMessage(t('managerMeetingDetailPage.t84'))
      } else if (action === 'start') {
        await startFanMeeting(meetingId, token)
        // 시작 직후 해야 할 일(대기열 확인·통화 배정)은 운영 모니터에 있으므로 바로 이동한다.
        // 솔로 인플루언서에게는 모니터 화면이 없어 상세에 남는다.
        if (!isSolo) {
          navigatedAway = true
          navigate(`/manager/fan-meetings/${encodeURIComponent(meetingId)}/monitor`)
          return
        }
        setMessage(t('managerMeetingDetailPage.t85'))
      } else if (action === 'end') {
        await endFanMeeting(meetingId, token)
        setMessage(t('managerMeetingDetailPage.t86'))
      } else if (action === 'draw') {
        const result = await drawApplicationWinners(meetingId, token)
        setMessage(
          t('managerMeetingDetailPage.t191', { p0: result.selectedCount, p1: result.notSelectedCount, p2: result.participantCount }),
        )
        setApplicantsRefresh((value) => value + 1)
      } else if (action === 'publishResults') {
        const result = await publishApplicationResults(meetingId, token)
        setMessage(t('managerMeetingDetailPage.t192', { p0: result.notificationCount }))
        setApplicantsRefresh((value) => value + 1)
      } else {
        const currentStatus = detail?.meeting.status
        if (!currentStatus) throw new TypeError(t('managerMeetingDetailPage.t87'))

        const targetStatus = action === 'openApplicationsNow'
          ? 'APPLICATION_OPEN'
          : action === 'closeApplicationsNow'
            ? 'APPLICATION_CLOSED'
            : 'LIVE'
        // 응모 열기·마감은 서버가 일정을 계산한다. "지금 시작"만 예정 시각이 필요하다
        // (그 시각 전에 시작하려면 조기 시작 폭을 넓혀야 서버가 허용한다).
        await transitionFanMeetingImmediately(meetingId, currentStatus, targetStatus, token, {
          scheduledStartAt: detail.meeting.scheduledStartAt,
        })
        // "지금 시작"으로 LIVE가 됐다면 시작 버튼과 같은 이유로 운영 모니터로 바로 넘어간다.
        if (targetStatus === 'LIVE' && !isSolo) {
          navigatedAway = true
          navigate(`/manager/fan-meetings/${encodeURIComponent(meetingId)}/monitor`)
          return
        }
        setMessage(
          action === 'openApplicationsNow'
            ? t('managerMeetingDetailPage.t88')
            : action === 'closeApplicationsNow'
              ? t('managerMeetingDetailPage.t89')
              : t('managerMeetingDetailPage.t90'),
        )
      }
    } catch (cause) {
      setError(toErrorMessage(cause, t('managerMeetingDetailPage.t91')))
    } finally {
      setBusy(false)
      /*
       * 성공·실패와 상관없이 확인 대화상자를 닫고 서버 상태를 다시 읽는다.
       *
       * 예전에는 둘 다 성공 경로에만 있었다. 그래서 명령이 서버에 반영된 뒤 응답을 다루다
       * 실패하면(응모 즉시 시작·마감이 그랬다) 화면은 예전 상태 그대로에 확인 대화상자만
       * 열려 있어, 이미 처리된 일을 다시 누르게 됐다. 새로고침하면 제대로 넘어가 있는 것도
       * 화면만 갱신되지 않았다는 뜻이다.
       *
       * 실패 사유는 위에서 setError로 따로 알리므로, 대화상자를 닫아도 원인은 남는다.
       */
      setPendingAction(undefined)
      if (!navigatedAway) await load()
    }
  }

  if (loading && !detail) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Spinner label={t('managerMeetingDetailPage.t1')} />
      </div>
    )
  }

  if (loadError || !detail) {
    return (
      <div className="grid gap-5 pb-10">
        <Link className="inline-flex w-fit items-center gap-2 text-sm font-semibold" to={meetingListPath}>
          {t('managerMeetingDetailPage.t2')}
        </Link>
        <AlertBanner title={t('managerMeetingDetailPage.t3')} variant="error">
          {loadError ?? t('managerMeetingDetailPage.t92')}
        </AlertBanner>
      </div>
    )
  }

  const status = detail.meeting.status
  const confirmation = pendingAction ? ACTION_CONFIRMATION()[pendingAction] : undefined
  const encodedMeetingId = encodeURIComponent(meetingId)

  return (
    <div className="grid gap-6 pb-10">
      <header className="grid gap-3">
        <Link
          className="inline-flex w-fit text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          to={meetingListPath}
        >
          {t('managerMeetingDetailPage.t4')}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className={`text-sm font-extrabold ${meetingStatusTextClass(status)}`}>
            {meetingStatusDisplayLabel(status)}
          </span>
          <h1 className="text-3xl font-black tracking-[-0.05em]">{detail.meeting.title}</h1>
        </div>
        <p className="text-[var(--color-text-secondary)]">
          {detail.influencer.name} {t('managerMeetingDetailPage.t5')} {formatDateTime(detail.meeting.scheduledStartAt)}
        </p>
      </header>

      {error ? <AlertBanner title={t('managerMeetingDetailPage.t6')} variant="error">{error}</AlertBanner> : null}
      {message ? (
        <AlertBanner onDismiss={() => setMessage(undefined)} title={t('managerMeetingDetailPage.t7')} variant="success">
          {message}
        </AlertBanner>
      ) : null}

      {/*
        상세 탭과 다른 관리 화면(참가 팬·공지 관리·운영 모니터)을 같은 탭 바에 같은 모양으로
        묶는다. 이전에는 앞의 둘이 헤더의 알약 버튼, 나머지가 탭이라 형태가 갈라져 있었다.
        팬미팅 단계에서 쓸 일이 없는 항목은 숨겨 "지금 할 수 있는 일"만 보이게 한다:
        - 참가 팬: 추첨이 확정되는 결과 발표(READY) 이후에만 참가자가 존재한다.
        - 공지 관리: 임시 저장 단계에는 공지를 받아볼 대상이 없다.
        - 운영 모니터: 대기열·통화가 살아 있는 READY·LIVE에서만 볼 것이 있다.
        - 결과 통계: 종료된 팬미팅에서만 의미가 있어 팬미팅 목록의 종료 행에서 진입한다.
      */}
      <nav className="flex flex-wrap gap-1 border-b border-[var(--color-divider)]" aria-label={t('managerMeetingDetailPage.t8')}>
        {TABS().map((item) => (
          <button
            aria-current={tab === item.id ? 'page' : undefined}
            className={`min-h-11 whitespace-nowrap rounded-t-[var(--radius-control)] px-5 text-sm font-bold transition-colors ${
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
        {status === 'READY' || status === 'LIVE' || status === 'ENDED' ? (
          <TabLink label={t('managerMeetingDetailPage.t94')} to={`/manager/fan-meetings/${encodedMeetingId}/fans`} />
        ) : null}
        {status !== 'DRAFT' ? (
          <TabLink label={t('managerMeetingDetailPage.t95')} to={`/manager/fan-meetings/${encodedMeetingId}/notices`} />
        ) : null}
        {!isSolo && (status === 'READY' || status === 'LIVE') ? (
          <TabLink label={t('managerMeetingDetailPage.t96')} to={`/manager/fan-meetings/${encodedMeetingId}/monitor`} />
        ) : null}
      </nav>

      {tab === 'overview' ? (
        <OverviewPanel
          actions={actions}
          applicantCount={applicantCount}
          busy={busy}
          detail={detail}
          drawCompleted={drawCompleted}
          meetingId={meetingId}
          onAction={setPendingAction}
          participantCount={participantCount}
        />
      ) : null}

      {tab === 'applicants' ? (
        <ManagerApplicantsPanel
          canDraw={actions.canDraw}
          canPublishResults={actions.canPublishResults}
          capacity={detail.meeting.application.capacity}
          drawCompleted={drawCompleted}
          meetingId={meetingId}
          meetingStatus={status}
          meetingTitle={detail.meeting.title}
          onDraw={() => setPendingAction('draw')}
          onPublishResults={() => setPendingAction('publishResults')}
          refreshToken={applicantsRefresh}
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
              ? t('managerMeetingDetailPage.t98')
              : t('managerMeetingDetailPage.t99')
          }
          meetingId={meetingId}
        />
      ) : null}

      {TEST_CONTROL_ENABLED && tab === 'test-control' ? (
        <TestControlPanel detail={detail} meetingId={meetingId} onApplied={() => void load()} />
      ) : null}

      <Dialog
        description={confirmation?.description}
        footer={
          <>
            <Button
              disabled={busy}
              onClick={() => setPendingAction(undefined)}
              variant="outline"
            >
              {t('managerMeetingDetailPage.t9')}
            </Button>
            <Button
              disabled={busy}
              loading={busy}
              onClick={() => pendingAction && void runAction(pendingAction)}
              variant={pendingAction === 'cancel' || pendingAction === 'delete' ? 'danger' : 'primary'}
            >
              {confirmation?.confirmLabel ?? t('managerMeetingDetailPage.t100')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !busy) setPendingAction(undefined)
        }}
        open={Boolean(pendingAction)}
        title={confirmation?.title ?? t('managerMeetingDetailPage.t101')}
      >
        {busy ? (
          <p className="text-sm font-medium text-[var(--color-text-secondary)]" role="status">
            {t('managerMeetingDetailPage.t10')}
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}

/** 팬미팅의 진행 흐름과 현재 상태에서 가능한 운영 액션을 한 화면에 모은다. */
function OverviewPanel({
  detail,
  actions,
  applicantCount,
  busy,
  meetingId,
  participantCount,
  drawCompleted,
  onAction,
}: {
  detail: PublicFanMeetingDetail
  actions: ReturnType<typeof getAvailableActions>
  applicantCount: number
  busy: boolean
  meetingId: string
  participantCount: number
  drawCompleted: boolean
  onAction: (action: MeetingOperationAction) => void
}) {
  const { t } = useTranslation()
  const { meeting } = detail
  const encodedId = encodeURIComponent(meetingId)
  // 응모형은 생성 시 응모 사용이 강제되고 CSV 직접 등록형은 응모 비활성이 강제되므로,
  // 상세 응답에 선별 방식 필드가 없는 동안은 응모 사용 여부로 CSV형을 판별한다.
  const isExternalSelection = !meeting.application.enabled
  // 백엔드는 발행(PUBLISHED) 상태에서만 명단 업로드를 허용하고, 확정하면 READY로 넘어간다.
  const canUploadExternalParticipants = isExternalSelection && meeting.status === 'PUBLISHED'
  const primaryActions: { action: MeetingOperationAction; label: string }[] = []
  if (actions.canPublish) primaryActions.push({ action: 'publish', label: t('managerMeetingDetailPage.t102') })
  if (actions.canDraw) primaryActions.push({ action: 'draw', label: t('managerMeetingDetailPage.t103') })
  if (actions.canPublishResults) primaryActions.push({ action: 'publishResults', label: t('managerMeetingDetailPage.t104') })
  if (actions.canStart) primaryActions.push({ action: 'start', label: t('managerMeetingDetailPage.t105') })
  if (actions.canEnd) primaryActions.push({ action: 'end', label: t('managerMeetingDetailPage.t106') })
  if (actions.canOpenApplicationsNow) {
    primaryActions.push({ action: 'openApplicationsNow', label: t('managerMeetingDetailPage.t107') })
  }
  if (actions.canCloseApplicationsNow) {
    primaryActions.push({ action: 'closeApplicationsNow', label: t('managerMeetingDetailPage.t108') })
  }
  if (actions.canStartNow && !actions.canStart) {
    primaryActions.push({ action: 'startNow', label: t('managerMeetingDetailPage.t109') })
  }

  const secondaryAction = actions.canDeleteDraft
    ? ({ action: 'delete', label: t('managerMeetingDetailPage.t110') } as const)
    : actions.canCancel
      ? ({ action: 'cancel', label: t('managerMeetingDetailPage.t111') } as const)
      : undefined

  const actionNote = meeting.status === 'DRAFT'
    ? t('managerMeetingDetailPage.t112')
    : meeting.status === 'PUBLISHED'
      ? canUploadExternalParticipants
        ? t('managerMeetingDetailPage.t113')
        : t('managerMeetingDetailPage.t193', { p0: formatDateTime(meeting.application.startAt) })
      : meeting.status === 'APPLICATION_OPEN'
        ? t('managerMeetingDetailPage.t194', { p0: formatDateTime(meeting.application.endAt), p1: applicantCount })
        : meeting.status === 'APPLICATION_CLOSED' && !drawCompleted
          ? t('managerMeetingDetailPage.t195', { p0: applicantCount })
          : meeting.status === 'APPLICATION_CLOSED'
            ? t('managerMeetingDetailPage.t196', { p0: participantCount })
            : meeting.status === 'READY'
              ? t('managerMeetingDetailPage.t197', { p0: formatDateTime(meeting.operation.queueOpenAt) })
              : meeting.status === 'LIVE'
                ? t('managerMeetingDetailPage.t114')
                : meeting.status === 'ENDED'
                  ? t('managerMeetingDetailPage.t115')
                  : t('managerMeetingDetailPage.t116')

  const stageIndex = meeting.status === 'DRAFT' || meeting.status === 'CANCELED'
    ? -1
    : meeting.status === 'PUBLISHED'
      ? 0
      : meeting.status === 'APPLICATION_OPEN'
        ? 1
        : meeting.status === 'APPLICATION_CLOSED'
          ? drawCompleted ? 2 : 1
          : meeting.status === 'READY'
            ? 3
            : 4

  const unavailableReason = meeting.status === 'ENDED'
    ? t('managerMeetingDetailPage.t117')
    : meeting.status === 'CANCELED'
      ? t('managerMeetingDetailPage.t118')
      : t('managerMeetingDetailPage.t119')

  return (
    <div>
      <section aria-labelledby="meeting-actions-title" className="py-6">
        <div className="flex flex-col items-start justify-between gap-5 md:flex-row">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold" id="meeting-actions-title">{t('managerMeetingDetailPage.t11')}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('managerMeetingDetailPage.t12')}
            </p>
            <p className="mt-4 text-sm font-semibold leading-6 text-[var(--color-text-body)]" id="operation-action-note">
              {actions.startBlockedReason ?? actionNote}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canUploadExternalParticipants ? (
              <Link
                className="inline-flex min-h-[var(--control-height)] items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-[var(--control-padding-inline)] text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                to={`/manager/fan-meetings/${encodedId}/external-participants`}
              >
                 {t('managerMeetingDetailPage.t198')} </Link>
            ) : null}
            {primaryActions.map((item) => (
              <Button
                disabled={busy}
                key={item.action}
                onClick={() => onAction(item.action)}
                title={busy ? t('managerMeetingDetailPage.t120') : undefined}
              >
                {item.label}
              </Button>
            ))}
            {secondaryAction ? (
              <Button
                disabled={busy}
                onClick={() => onAction(secondaryAction.action)}
                title={busy ? t('managerMeetingDetailPage.t121') : undefined}
                variant="outline"
              >
                {secondaryAction.label}
              </Button>
            ) : (
              <Button
                aria-describedby="operation-action-note"
                disabled
                title={unavailableReason}
                variant="outline"
              >
                {t('managerMeetingDetailPage.t13')}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* 상단 구분선 제거(a31e0f0)를 유지하고, 문구는 번역 키를 쓴다. */}
      <section aria-labelledby="meeting-flow-title" className="py-6">
        <p className="text-xs font-extrabold text-[var(--color-primary-coral)]">{t('managerMeetingDetailPage.t14')}</p>
        <h2 className="mt-3 text-xl font-extrabold tracking-[-0.032em]" id="meeting-flow-title">{t('managerMeetingDetailPage.t15')}</h2>
        <ol className="mt-5 border-y border-[var(--color-divider)]">
            <FlowStep
              current={stageIndex === -1}
              done={stageIndex >= 0}
              description={t('managerMeetingDetailPage.t16')}
              title={t('managerMeetingDetailPage.t17')}
            />
            <FlowStep
              current={stageIndex === 0}
              done={stageIndex >= 1}
              description={
                meeting.application.enabled
                  ? t('managerMeetingDetailPage.t199', { p0: formatDateTime(meeting.application.startAt), p1: formatDateTime(meeting.application.endAt), p2: meeting.application.capacity })
                  : t('managerMeetingDetailPage.t122')
              }
              title={t('managerMeetingDetailPage.t18')}
            />
            <FlowStep
              current={stageIndex === 1}
              done={stageIndex >= 2}
              description={t('managerMeetingDetailPage.t200', { p0: participantCount })}
              title={t('managerMeetingDetailPage.t19')}
            />
            <FlowStep
              current={stageIndex === 2}
              done={stageIndex >= 3}
              description={t('managerMeetingDetailPage.t20')}
              title={t('managerMeetingDetailPage.t21')}
            />
            <FlowStep
              current={stageIndex === 3}
              done={stageIndex >= 4}
              description={t('managerMeetingDetailPage.t201', { p0: formatDateTime(meeting.operation.queueOpenAt), p1: formatCallDuration(meeting.operation.callDurationSec) })}
              title={t('managerMeetingDetailPage.t22')}
            />
        </ol>
      </section>
      {/*
        연결된 관리 화면 링크 섹션은 40a80d7에서 헤더의 nav로 옮겼다(어느 탭에서도 이동 가능).
        여기서 되살리면 링크가 두 곳에 중복되므로 삭제를 유지한다.
      */}
    </div>
  )
}

/** 팬미팅 흐름의 단계 하나를 완료 여부와 함께 표시한다. */
function FlowStep({
  title,
  description,
  done,
  current,
}: {
  title: string
  description: string
  done: boolean
  current: boolean
}) {
  return (
    <li className="flex gap-4 border-b border-[var(--color-divider)] px-1 py-4 last:border-b-0">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black ${
          done
            ? 'border-[var(--color-success)] bg-[var(--color-success)] text-white'
            : current
              ? 'border-[var(--color-primary-coral)] bg-white text-[var(--color-primary-coral)]'
              : 'border-[var(--color-border-control)] bg-white text-[var(--color-text-tertiary)]'
        }`}
      >
        {done ? '✓' : current ? '·' : ''}
      </span>
      <div className="min-w-0">
        <strong className={`text-base font-extrabold ${done || current ? '' : 'text-[var(--color-text-secondary)]'}`}>
          {title}
        </strong>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
      </div>
    </li>
  )
}

/**
 * 탭 바 안에서 다른 관리 화면으로 이동하는 링크 하나다.
 *
 * 상세 탭 버튼과 같은 크기·글꼴·색을 써서 한 줄에서 형태가 갈라지지 않게 한다.
 * 목적지가 다른 화면이므로 선택 상태(aria-current)는 갖지 않는다.
 */
function TabLink({ label, to }: { label: string; to: string }) {
  return (
    <Link
      className="inline-flex min-h-11 items-center whitespace-nowrap rounded-t-[var(--radius-control)] px-5 text-sm font-bold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
      to={to}
    >
      {label}
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
  const { t } = useTranslation()
  const [form, setForm] = useState<SettingsForm>(() => toSettingsForm(detail))
  const [dirty, setDirty] = useState<Set<SettingsField>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  // 통화 시간은 분 단위로 입력받고 초로 저장한다. 입력 도중의 빈 문자열을 초로
  // 환산할 수 없으므로 표시용 문자열을 별도 상태로 둔다.
  const [callDurationMinutesInput, setCallDurationMinutesInput] = useState(() =>
    callDurationSecToMinutesInput(detail.meeting.operation.callDurationSec),
  )
  const callDurationError = validateCallDurationSec(
    minutesInputToCallDurationSec(callDurationMinutesInput),
  )

  useEffect(() => {
    setForm(toSettingsForm(detail))
    setDirty(new Set())
    // 서버 값이 다시 들어오면 분 입력값도 함께 맞춘다.
    setCallDurationMinutesInput(
      callDurationSecToMinutesInput(detail.meeting.operation.callDurationSec),
    )
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
      setError(t('managerMeetingDetailPage.t123'))
      return
    }
    if (dirty.size === 0) {
      setMessage(t('managerMeetingDetailPage.t124'))
      return
    }
    if (scheduleErrors.length > 0) {
      setError(scheduleErrors[0])
      return
    }
    // 통화 시간을 건드렸을 때만 막는다. 다른 항목만 고치는 저장은 서버에서 온
    // 범위 밖 값(예: API로 설정된 90초) 때문에 막히지 않아야 한다.
    if (dirty.has('callDurationSec') && callDurationError) {
      setError(callDurationError)
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
      setMessage(t('managerMeetingDetailPage.t125'))
      return
    }

    setSaving(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await patchFanMeeting(meetingId, patch, token)
      setMessage(t('managerMeetingDetailPage.t126'))
      setDirty(new Set())
      onSaved()
    } catch (cause) {
      setError(toErrorMessage(cause, t('managerMeetingDetailPage.t127')))
    } finally {
      setSaving(false)
    }
  }

  const basicLocked = !actions.canEditBasic
  const operationLocked = !actions.canEditOperation

  return (
    <form className="grid gap-5" onSubmit={save}>
      {basicLocked ? (
        <AlertBanner title={t('managerMeetingDetailPage.t29')} variant="info">
          {actions.applicationStarted
            ? t('managerMeetingDetailPage.t128')
            : t('managerMeetingDetailPage.t129')}
        </AlertBanner>
      ) : null}

      {/* 진행 현황 탭과 동일하게 구역 상단 구분선 없이 여백으로만 나눈다. */}
      <Card className="border-t-0">
        <CardHeader>
          <Badge variant="primary">{t('managerMeetingDetailPage.t30')}</Badge>
          <CardTitle as="h2" className="mt-3">{t('managerMeetingDetailPage.t31')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <TextField
            containerClassName="sm:col-span-2"
            disabled={basicLocked}
            label={t('managerMeetingDetailPage.t32')}
            maxLength={200}
            onChange={(event) => setField('title', event.target.value)}
            value={form.title}
          />
          <TextField
            disabled={basicLocked}
            label={t('managerMeetingDetailPage.t33')}
            onChange={(event) => setField('scheduledStartAt', event.target.value)}
            type="datetime-local"
            value={form.scheduledStartAt}
          />
          <div className="grid gap-3">
            <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
              {t('managerMeetingDetailPage.t34')}
            </p>
            {/*
              주소 입력칸은 두지 않는다. 운영자가 외부 주소를 손으로 넣으면 그 주소가 막히거나
              사라졌을 때 커버가 통째로 깨지고, 파일 업로드(POST /api/v1/attachments)가 이미
              있으므로 올린 파일의 콘텐츠 주소를 coverImageUrl에 그대로 넣는다.
              이미 저장돼 있던 주소는 아래 미리보기로 그대로 보인다.
            */}
            <CoverImageUpload
              disabled={basicLocked}
              onChange={(url) => setField('coverImageUrl', url)}
              value={form.coverImageUrl}
            />
          </div>
          <Textarea
            containerClassName="sm:col-span-2"
            disabled={basicLocked}
            label={t('managerMeetingDetailPage.t35')}
            onChange={(event) => setField('description', event.target.value)}
            placeholder={t('managerMeetingDetailPage.t36')}
            rows={6}
            value={form.description}
          />
        </CardContent>
      </Card>

      <Card className="border-t-0">
        <CardHeader>
          <Badge variant="primary">{t('managerMeetingDetailPage.t37')}</Badge>
          <CardTitle as="h2" className="mt-3">{t('managerMeetingDetailPage.t38')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Checkbox
            checked={form.applicationEnabled}
            description={t('managerMeetingDetailPage.t39')}
            disabled
            label={t('managerMeetingDetailPage.t40')}
            readOnly
          />
          {form.applicationEnabled ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                disabled={basicLocked}
                label={t('managerMeetingDetailPage.t41')}
                onChange={(event) => setField('applicationStartAt', event.target.value)}
                type="datetime-local"
                value={form.applicationStartAt}
              />
              <TextField
                disabled={basicLocked}
                error={scheduleErrors.find((item) => item.startsWith(t('managerMeetingDetailPage.t130')))}
                label={t('managerMeetingDetailPage.t42')}
                onChange={(event) => setField('applicationEndAt', event.target.value)}
                type="datetime-local"
                value={form.applicationEndAt}
              />
              <TextField
                disabled={basicLocked}
                error={scheduleErrors.find((item) => item.startsWith(t('managerMeetingDetailPage.t131')))}
                label={t('managerMeetingDetailPage.t43')}
                onChange={(event) => setField('resultAnnouncementAt', event.target.value)}
                type="datetime-local"
                value={form.resultAnnouncementAt}
              />
              <TextField
                disabled={basicLocked}
                label={t('managerMeetingDetailPage.t44')}
                min={1}
                onChange={(event) => setField('capacity', Number(event.target.value))}
                type="number"
                value={form.capacity}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-t-0">
        <CardHeader>
          <Badge variant="primary">{t('managerMeetingDetailPage.t45')}</Badge>
          <CardTitle as="h2" className="mt-3">{t('managerMeetingDetailPage.t46')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <TextField
            disabled={operationLocked}
            error={scheduleErrors.find((item) => item.startsWith(t('managerMeetingDetailPage.t132')))}
            label={t('managerMeetingDetailPage.t47')}
            onChange={(event) => setField('queueOpenAt', event.target.value)}
            type="datetime-local"
            value={form.queueOpenAt}
          />
          <TextField
            disabled={operationLocked}
            endAdornment={<span className="pr-3 text-sm text-[var(--color-text-secondary)]">{t('managerMeetingDetailPage.t48')}</span>}
            error={callDurationError}
            helperText={t('managerMeetingDetailPage.t202', { p0: CALL_DURATION_MIN_MINUTES, p1: CALL_DURATION_MAX_MINUTES })}
            label={t('managerMeetingDetailPage.t49')}
            max={CALL_DURATION_MAX_MINUTES}
            min={CALL_DURATION_MIN_MINUTES}
            step={1}
            type="number"
            value={callDurationMinutesInput}
            onChange={(event) => {
              // 입력 중 빈 문자열은 초로 환산할 수 없으므로 표시용 문자열을 따로 들고 있는다.
              setCallDurationMinutesInput(event.target.value)
              const seconds = minutesInputToCallDurationSec(event.target.value)
              if (seconds !== undefined) setField('callDurationSec', seconds)
            }}
          />
          <div className="grid gap-3 rounded-xl border border-[var(--color-divider)] p-4 sm:col-span-2">
            <Checkbox
              checked={form.recordingEnabled}
              disabled={operationLocked}
              label={t('managerMeetingDetailPage.t50')}
              onChange={(event) => setField('recordingEnabled', event.target.checked)}
            />
            {/*
              번역 자막 토글은 두지 않는다. 자막은 AI 워커가 참가자 언어를 보고 알아서
              제공하므로 팬미팅 단위 설정이 아니다. 값은 기존 설정을 그대로 유지한다
              (수정하지 않으므로 PATCH에 담기지 않는다).
            */}
          </div>
        </CardContent>
      </Card>

      <Card className="border-t-0">
        <CardHeader>
          <Badge variant="primary">{t('managerMeetingDetailPage.t52')}</Badge>
          <CardTitle as="h2" className="mt-3">{t('managerMeetingDetailPage.t53')}</CardTitle>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {t('managerMeetingDetailPage.t54')}
          </p>
        </CardHeader>
        <CardContent className="grid items-start gap-5 sm:grid-cols-2">
          <TextField
            className="pr-44"
            disabled={!actions.canEditPolicy}
            endAdornment={
              <span className="whitespace-nowrap px-3 text-sm text-[var(--color-text-muted)]">
                {t('managerMeetingDetailPage.t55')}
              </span>
            }
            helperText={t('managerMeetingDetailPage.t56')}
            label={t('managerMeetingDetailPage.t57')}
            min={0}
            onChange={(event) => setField('reconnectGraceSec', Number(event.target.value))}
            step={1}
            type="number"
            value={form.reconnectGraceSec}
          />
          <TextField
            className="pr-40"
            disabled={!actions.canEditPolicy}
            endAdornment={
              <span className="whitespace-nowrap px-3 text-sm text-[var(--color-text-muted)]">
                {t('managerMeetingDetailPage.t58')}
              </span>
            }
            helperText={t('managerMeetingDetailPage.t59')}
            label={t('managerMeetingDetailPage.t60')}
            min={0}
            onChange={(event) => setField('maxRecallCount', Number(event.target.value))}
            step={1}
            type="number"
            value={form.maxRecallCount}
          />
        </CardContent>
      </Card>

      {error ? <AlertBanner title={t('managerMeetingDetailPage.t61')} variant="error">{error}</AlertBanner> : null}
      {message ? (
        <AlertBanner onDismiss={() => setMessage(undefined)} title={t('managerMeetingDetailPage.t62')} variant="success">
          {message}
        </AlertBanner>
      ) : null}

      {actions.canEditPolicy ? (
        <div className="flex justify-end">
          <Button
            disabled={scheduleErrors.length > 0}
            loading={saving}
            title={scheduleErrors.length > 0 ? scheduleErrors.join(' ') : undefined}
            type="submit"
          >
            {t('managerMeetingDetailPage.t63')}
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
  const { t } = useTranslation()
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
      setError(t('managerMeetingDetailPage.t133'))
      return
    }
    if (!window.confirm(t('managerMeetingDetailPage.t134'))) return

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
      setMessage(t('managerMeetingDetailPage.t203', { p0: meetingStatusLabel(updated.status) }))
      onApplied()
    } catch (cause) {
      setError(toErrorMessage(cause, t('managerMeetingDetailPage.t135')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-5" onSubmit={apply}>
      <AlertBanner title={t('managerMeetingDetailPage.t64')} variant="warning">
        {t('managerMeetingDetailPage.t65')}
      </AlertBanner>

      <Card className="border-t-0">
        <CardHeader>
          <Badge variant="warning">{t('managerMeetingDetailPage.t66')}</Badge>
          <CardTitle as="h2" className="mt-3">{t('managerMeetingDetailPage.t67')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Select
            label={t('managerMeetingDetailPage.t68')}
            onChange={(event) => changeStatus(event.target.value as FanMeetingStatus)}
            options={TEST_CONTROL_STATUS_OPTIONS().map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={form.status}
          />
          <div className="grid content-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-4 py-3">
            <Checkbox
              checked={autoSchedule}
              label={t('managerMeetingDetailPage.t69')}
              onChange={(event) => changeAutoSchedule(event.target.checked)}
            />
          </div>
          <TextField
            disabled={autoSchedule}
            label={t('managerMeetingDetailPage.t70')}
            onChange={(event) => setField('scheduledStartAt', event.target.value)}
            type="datetime-local"
            value={form.scheduledStartAt}
          />
          <TextField
            disabled={autoSchedule}
            label={t('managerMeetingDetailPage.t71')}
            onChange={(event) => setField('applicationOpenAt', event.target.value)}
            type="datetime-local"
            value={form.applicationOpenAt}
          />
          <TextField
            disabled={autoSchedule}
            label={t('managerMeetingDetailPage.t72')}
            onChange={(event) => setField('applicationCloseAt', event.target.value)}
            type="datetime-local"
            value={form.applicationCloseAt}
          />
          <TextField
            disabled={autoSchedule}
            label={t('managerMeetingDetailPage.t73')}
            onChange={(event) => setField('resultAnnouncementAt', event.target.value)}
            type="datetime-local"
            value={form.resultAnnouncementAt}
          />
          <TextField
            disabled={autoSchedule}
            label={t('managerMeetingDetailPage.t74')}
            onChange={(event) => setField('waitingRoomOpenAt', event.target.value)}
            type="datetime-local"
            value={form.waitingRoomOpenAt}
          />
          <p className="text-xs leading-5 text-[var(--color-text-secondary)] sm:col-span-2">
            {autoSchedule
              ? t('managerMeetingDetailPage.t136')
              : t('managerMeetingDetailPage.t137')}
          </p>
        </CardContent>
      </Card>

      {error ? <AlertBanner title={t('managerMeetingDetailPage.t75')} variant="error">{error}</AlertBanner> : null}
      {message ? (
        <AlertBanner onDismiss={() => setMessage(undefined)} title={t('managerMeetingDetailPage.t76')} variant="success">
          {message}
        </AlertBanner>
      ) : null}

      <div className="flex justify-end">
        <Button loading={saving} type="submit">
          {t('managerMeetingDetailPage.t77')}
        </Button>
      </div>
    </form>
  )
}
