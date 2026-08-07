/**
 * 팬미팅 한 건의 생명주기(상태)와 그 상태에서 허용되는 운영 액션을 한곳에서 계산한다.
 *
 * 백엔드에는 "이벤트"와 "팬미팅"이 따로 없고 `FanMeeting` 하나가 상태로만 구분되므로,
 * 목록·상세·생성 화면이 모두 이 모듈의 판정 결과를 공유해 버튼 노출 기준을 통일한다.
 */

import type { FanMeetingStatus } from '../../api/meetingManagement'
import { parseServerDate } from '../../api/serverTime'
import { translate } from '../../i18n'

/** API와 화면이 서로 다른 상태 유니온을 만들지 않도록 백엔드 응답 타입을 그대로 재사용한다. */
export type MeetingLifecycleStatus = FanMeetingStatus

/** 팬미팅 상태 코드를 화면용 한국어 라벨로 바꾼다. */
export const meetingStatusLabels = (): Record<string, string> => ({
  DRAFT: translate('meetingLifecycle.t1'),
  PUBLISHED: translate('meetingLifecycle.t2'),
  APPLICATION_OPEN: translate('meetingLifecycle.t3'),
  APPLICATION_CLOSED: translate('meetingLifecycle.t4'),
  READY: translate('meetingLifecycle.t5'),
  LIVE: translate('meetingLifecycle.t6'),
  ENDED: translate('meetingLifecycle.t7'),
  CANCELED: translate('meetingLifecycle.t8'),
})

/** 상태 코드를 라벨로 바꾸고, 알 수 없는 값이면 코드 자체를 보여 준다. */
export function meetingStatusLabel(status?: string | null): string {
  if (!status) return translate('meetingLifecycle.t9')
  return meetingStatusLabels()[status] ?? status
}

/** 팬미팅 상태에 맞는 배지 색상을 고른다. */
export function meetingStatusBadge(
  status?: string | null,
): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'LIVE') return 'primary'
  if (status === 'PUBLISHED' || status === 'APPLICATION_OPEN' || status === 'READY') return 'success'
  if (status === 'APPLICATION_CLOSED' || status === 'DRAFT') return 'warning'
  if (status === 'CANCELED') return 'danger'
  return 'neutral'
}

/** 목록의 상태 필터 드롭다운에서 사용하는 선택지다. */
export const meetingStatusFilterOptions = (): readonly { value: string; label: string }[] => [
  { value: '', label: translate('meetingLifecycle.t10') },
  { value: 'DRAFT', label: translate('meetingLifecycle.t11') },
  { value: 'PUBLISHED', label: translate('meetingLifecycle.t12') },
  { value: 'APPLICATION_OPEN', label: translate('meetingLifecycle.t13') },
  { value: 'APPLICATION_CLOSED', label: translate('meetingLifecycle.t14') },
  { value: 'READY', label: translate('meetingLifecycle.t15') },
  { value: 'LIVE', label: translate('meetingLifecycle.t16') },
  { value: 'ENDED', label: translate('meetingLifecycle.t17') },
  { value: 'CANCELED', label: translate('meetingLifecycle.t18') },
]

/** 팬미팅이 아직 시작되지 않아 정보 수정이 가능한 상태 목록이다. */
const PRE_LIVE_STATUSES: readonly string[] = [
  'DRAFT',
  'PUBLISHED',
  'APPLICATION_OPEN',
  'APPLICATION_CLOSED',
  'READY',
]

/** 액션 가능 여부를 계산할 때 참고하는 팬미팅의 현재 값이다. */
export type MeetingActionContext = {
  status?: string | null
  /** 응모 기능 사용 여부다. */
  applicationEnabled?: boolean | null
  applicationStartAt?: string | null
  applicationEndAt?: string | null
  scheduledStartAt?: string | null
  /** 조기 시작 허용 시간(분)이며 서버 기본값은 30분이다. */
  earlyStartMinutes?: number | null
  /** 추첨으로 확정된 참가자 수다. */
  participantCount?: number | null
  /** 추첨이 이미 끝났는지 여부다. */
  drawCompleted?: boolean | null
  /** 응모 결과 발표(알림 발송)를 이미 했는지 여부다. */
  resultsPublished?: boolean | null
  /** 테스트에서 현재 시각을 고정하기 위한 값이다. */
  now?: Date
}

/** 상태별로 화면에 노출할 운영 액션의 허용 여부다. */
export type MeetingActions = {
  /** 제목·소개·커버·예정 일시·응모 설정을 수정할 수 있는지 여부다. */
  canEditBasic: boolean
  /** 대기열 개방 일시·통화 시간·녹화·번역을 수정할 수 있는지 여부다. */
  canEditOperation: boolean
  /** 재접속 유예·조기 시작·재호출 횟수를 수정할 수 있는지 여부다. */
  canEditPolicy: boolean
  /** 응모 폼(안내문·질문)을 수정할 수 있는지 여부다. */
  canEditApplicationForm: boolean
  canPublish: boolean
  canDeleteDraft: boolean
  canCancel: boolean
  canDraw: boolean
  canPublishResults: boolean
  canStart: boolean
  canEnd: boolean
  /** 예약 일시와 관계없이 응모 접수를 즉시 열 수 있는지 여부다. */
  canOpenApplicationsNow: boolean
  /** 예약 마감 일시와 관계없이 응모 접수를 즉시 닫을 수 있는지 여부다. */
  canCloseApplicationsNow: boolean
  /** 예약 시작 일시 전이라도 논리적 선행 조건을 지키며 시작할 수 있는지 여부다. */
  canStartNow: boolean
  /** 응모가 시작되어 대부분의 수정이 잠긴 상태인지 여부다. */
  applicationStarted: boolean
  /** 시작 버튼을 누를 수 없을 때 사용자에게 보여 줄 이유다. */
  startBlockedReason?: string
}

/** 백엔드 LocalDateTime 문자열을 Date로 바꾸고, 값이 없거나 잘못되면 null을 준다. */
function toDate(value?: string | null): Date | null {
  if (!value) return null
  const date = parseServerDate(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 백엔드 `FanMeetingManagementService.hasApplicationStarted()`와 같은 기준으로
 * 응모가 이미 시작되어 기본 정보 수정이 잠겼는지 판단한다.
 */
function hasApplicationStarted(context: MeetingActionContext, now: Date): boolean {
  const status = context.status ?? undefined
  if (status && status !== 'DRAFT' && status !== 'PUBLISHED') return true

  const startAt = toDate(context.applicationStartAt)
  return context.applicationEnabled === true && startAt !== null && now >= startAt
}

/**
 * 현재 상태에서 허용되는 운영 액션을 백엔드 검증 규칙과 같은 조건으로 계산한다.
 *
 * 서버가 최종 판정을 하지만, 실패할 요청을 미리 막아 불필요한 409/400 응답을 줄인다.
 */
export function getAvailableActions(context: MeetingActionContext): MeetingActions {
  const now = context.now ?? new Date()
  const status = context.status ?? undefined
  const preLive = status !== undefined && PRE_LIVE_STATUSES.includes(status)
  const applicationStarted = hasApplicationStarted(context, now)

  const applicationEndAt = toDate(context.applicationEndAt)
  const scheduledStartAt = toDate(context.scheduledStartAt)
  const participantCount = context.participantCount ?? 0
  const drawCompleted = context.drawCompleted === true
  const resultsPublished = context.resultsPublished === true

  // 응모 마감 상태는 시각과 무관하게, 접수 중 상태는 마감 시각이 지난 뒤에만 추첨할 수 있다.
  const canDraw =
    !drawCompleted &&
    (status === 'APPLICATION_CLOSED' ||
      (status === 'APPLICATION_OPEN' && applicationEndAt !== null && now >= applicationEndAt))

  // 조기 시작 허용 시간만큼 앞당겨서만 시작할 수 있고 확정 참가자가 최소 1명 필요하다.
  const earliestStartAt =
    scheduledStartAt === null
      ? null
      : new Date(scheduledStartAt.getTime() - (context.earlyStartMinutes ?? 30) * 60_000)
  const startTimeReached = earliestStartAt === null || now >= earliestStartAt
  const canStartNow = status === 'READY' && participantCount > 0
  const canStart = canStartNow && startTimeReached

  let startBlockedReason: string | undefined
  if (status === 'READY' && !canStart) {
    startBlockedReason =
      participantCount <= 0
        ? translate('meetingLifecycle.t19')
        : translate('meetingLifecycle.t20', { p0: earliestStartAt?.toLocaleString('ko-KR') ?? '-' })
  }

  return {
    canEditBasic: preLive && !applicationStarted,
    canEditOperation: preLive && !applicationStarted,
    canEditPolicy: preLive,
    canEditApplicationForm:
      (status === 'DRAFT' || status === 'PUBLISHED') && !applicationStarted,
    canPublish: status === 'DRAFT',
    canDeleteDraft: status === 'DRAFT',
    canCancel:
      status === 'PUBLISHED' ||
      status === 'APPLICATION_OPEN' ||
      status === 'APPLICATION_CLOSED' ||
      status === 'READY',
    canDraw,
    canPublishResults: drawCompleted && !resultsPublished && status === 'APPLICATION_CLOSED',
    canStart,
    canEnd: status === 'LIVE',
    // 수동 운영 전환은 시간만 우회한다. 상태 순서와 참가자 존재 조건은 그대로 지킨다.
    canOpenApplicationsNow: status === 'PUBLISHED' && context.applicationEnabled === true,
    // 정식 명령 `applications/close`가 APPLICATION_OPEN → APPLICATION_CLOSED만 허용한다.
    canCloseApplicationsNow: status === 'APPLICATION_OPEN',
    canStartNow,
    applicationStarted,
    startBlockedReason,
  }
}

/** LocalDateTime 문자열을 읽기 쉬운 한국어 일시로 표시한다. */
export function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  const date = parseServerDate(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}

/** datetime-local 입력값에 초가 없으면 백엔드 LocalDateTime 형식에 맞게 초를 붙인다. */
export function toApiLocalDateTime(value: string): string {
  return value.length === 16 ? `${value}:00` : value
}

/** 백엔드 LocalDateTime 값을 datetime-local 입력에서 사용할 분 단위 값으로 바꾼다. */
export function toDateTimeLocalValue(value?: string | null): string {
  return value ? value.replace(' ', 'T').slice(0, 16) : ''
}

/** 오류 원인에서 사용자에게 보여 줄 메시지를 뽑는다. */
export function toErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

/** 일정 검증에 필요한 입력값이며 datetime-local 문자열을 그대로 받는다. */
export type MeetingScheduleInput = {
  scheduledStartAt: string
  applicationEnabled: boolean
  applicationStartAt: string | null
  applicationEndAt: string | null
  resultAnnouncementAt: string | null
  queueOpenAt: string
}

/**
 * 입력된 일정 사이의 선후 관계를 백엔드 `validateSchedule()`과 같은 규칙으로 검사한다.
 *
 * 요청 전에 걸러 내지 않으면 서버가 400으로 거절하므로 생성·수정 화면이 함께 사용한다.
 */
export function getScheduleErrors(input: MeetingScheduleInput): string[] {
  const errors: string[] = []
  const scheduledStart = toDate(input.scheduledStartAt)
  const applicationStart = toDate(input.applicationStartAt)
  const applicationEnd = toDate(input.applicationEndAt)
  const resultAnnouncement = toDate(input.resultAnnouncementAt)
  const queueOpen = toDate(input.queueOpenAt)

  if (input.applicationEnabled) {
    if (applicationStart && applicationEnd && applicationEnd <= applicationStart) {
      errors.push(translate('meetingLifecycle.t21'))
    }
    if (applicationEnd && resultAnnouncement && resultAnnouncement < applicationEnd) {
      errors.push(translate('meetingLifecycle.t22'))
    }
    if (applicationEnd && scheduledStart && applicationEnd >= scheduledStart) {
      errors.push(translate('meetingLifecycle.t23'))
    }
    if (resultAnnouncement && scheduledStart && resultAnnouncement >= scheduledStart) {
      errors.push(translate('meetingLifecycle.t24'))
    }
    // 팬은 결과를 확인한 뒤에야 대기열에 들어올 수 있으므로 발표가 오픈보다 앞서야 한다.
    if (resultAnnouncement && queueOpen && resultAnnouncement >= queueOpen) {
      errors.push(translate('meetingLifecycle.resultBeforeQueueOpen'))
    }
  }

  if (queueOpen && scheduledStart && queueOpen >= scheduledStart) {
    errors.push(translate('meetingLifecycle.t25'))
  }

  return errors
}

/** Date를 datetime-local 입력값(YYYY-MM-DDTHH:mm)으로 바꾼다. */
function toDateTimeLocalInput(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 예정 일시에서 역산한 나머지 일정 자동 입력값이다. datetime-local 문자열로 돌려준다. */
export type ScheduleDefaults = {
  applicationStartAt: string
  applicationEndAt: string
  resultAnnouncementAt: string
  queueOpenAt: string
}

/**
 * 팬미팅 예정 일시를 기준으로 나머지 일정(응모 시작·마감, 결과 발표, 대기열 오픈)의
 * 추천값을 역산한다. 생성 화면이 비어 있는 필드를 자동으로 채울 때 쓴다.
 *
 * 표준 간격은 응모 시작 = max(지금+10분, 시작 7일 전), 마감 = 시작 24시간 전,
 * 발표 = 마감 1시간 뒤, 대기열 오픈 = 시작 30분 전이다. 예정 일시가 임박해 표준 간격이
 * 성립하지 않으면 지금+10분 ~ 예정 일시 구간을 비율로 압축해 순서를 지킨다.
 *
 * 모든 값이 `getScheduleErrors`의 선후 규칙을 만족하지 못할 만큼 임박했으면(분 단위 반올림
 * 후 순서가 무너지는 경우 포함) null을 돌려주고 아무것도 채우지 않는다.
 */
export function deriveScheduleDefaults(
  scheduledStartAtLocal: string,
  now: Date = new Date(),
): ScheduleDefaults | null {
  if (!scheduledStartAtLocal) return null
  const start = new Date(scheduledStartAtLocal)
  if (Number.isNaN(start.getTime())) return null

  const MINUTE = 60_000
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR
  // 정확히 현재 시각으로 채우면 남은 단계를 작성하는 사이 과거가 되므로 10분 뒤를 하한으로 둔다.
  const floor = new Date(now.getTime() + 10 * MINUTE)

  let applicationStart = new Date(Math.max(floor.getTime(), start.getTime() - 7 * DAY))
  let applicationEnd = new Date(start.getTime() - 24 * HOUR)
  let resultAnnouncement = new Date(start.getTime() - 23 * HOUR)
  let queueOpen = new Date(start.getTime() - 30 * MINUTE)

  const standardFits =
    applicationStart < applicationEnd && resultAnnouncement < queueOpen && queueOpen < start
  if (!standardFits) {
    const total = start.getTime() - floor.getTime()
    // 분 단위로 잘라도 네 시점의 선후가 유지되려면 최소 10분은 남아 있어야 한다.
    if (total < 10 * MINUTE) return null
    applicationStart = floor
    applicationEnd = new Date(floor.getTime() + total * 0.5)
    resultAnnouncement = new Date(floor.getTime() + total * 0.65)
    queueOpen = new Date(floor.getTime() + total * 0.85)
  }

  const defaults: ScheduleDefaults = {
    applicationStartAt: toDateTimeLocalInput(applicationStart),
    applicationEndAt: toDateTimeLocalInput(applicationEnd),
    resultAnnouncementAt: toDateTimeLocalInput(resultAnnouncement),
    queueOpenAt: toDateTimeLocalInput(queueOpen),
  }

  // 분 단위로 자른 뒤에도 검증 규칙(응모시작 < 마감 ≤ 발표 < 오픈 < 시작)이 성립하는지 확인한다.
  const errors = getScheduleErrors({
    scheduledStartAt: scheduledStartAtLocal,
    applicationEnabled: true,
    applicationStartAt: defaults.applicationStartAt,
    applicationEndAt: defaults.applicationEndAt,
    resultAnnouncementAt: defaults.resultAnnouncementAt,
    queueOpenAt: defaults.queueOpenAt,
  })
  return errors.length === 0 ? defaults : null
}

/** 팬미팅 상세 화면의 탭 식별자다. test-control은 시연·테스트 전용 탭이다. */
export type MeetingDetailTab =
  | 'overview'
  | 'applicants'
  | 'settings'
  | 'application-form'
  | 'test-control'

/** 주소창의 `tab` 파라미터를 유효한 탭 값으로 정규화한다. */
export function normalizeDetailTab(value: string | null): MeetingDetailTab {
  if (
    value === 'applicants' ||
    value === 'settings' ||
    value === 'application-form' ||
    value === 'test-control'
  ) {
    return value
  }
  return 'overview'
}
