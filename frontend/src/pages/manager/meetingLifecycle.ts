/**
 * 팬미팅 한 건의 생명주기(상태)와 그 상태에서 허용되는 운영 액션을 한곳에서 계산한다.
 *
 * 백엔드에는 "이벤트"와 "팬미팅"이 따로 없고 `FanMeeting` 하나가 상태로만 구분되므로,
 * 목록·상세·생성 화면이 모두 이 모듈의 판정 결과를 공유해 버튼 노출 기준을 통일한다.
 */

import type { FanMeetingStatus } from '../../api/meetingManagement'

/** API와 화면이 서로 다른 상태 유니온을 만들지 않도록 백엔드 응답 타입을 그대로 재사용한다. */
export type MeetingLifecycleStatus = FanMeetingStatus

/** 팬미팅 상태 코드를 화면용 한국어 라벨로 바꾼다. */
export const meetingStatusLabels: Record<string, string> = {
  DRAFT: '초안',
  PUBLISHED: '발행됨',
  APPLICATION_OPEN: '응모 접수 중',
  APPLICATION_CLOSED: '응모 마감',
  READY: '진행 준비',
  LIVE: '진행 중',
  ENDED: '종료',
  CANCELED: '취소됨',
}

/** 상태 코드를 라벨로 바꾸고, 알 수 없는 값이면 코드 자체를 보여 준다. */
export function meetingStatusLabel(status?: string | null): string {
  if (!status) return '상태 미확인'
  return meetingStatusLabels[status] ?? status
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
export const meetingStatusFilterOptions: readonly { value: string; label: string }[] = [
  { value: '', label: '전체 상태' },
  { value: 'DRAFT', label: '초안' },
  { value: 'PUBLISHED', label: '발행됨' },
  { value: 'APPLICATION_OPEN', label: '응모 접수 중' },
  { value: 'APPLICATION_CLOSED', label: '응모 마감' },
  { value: 'READY', label: '진행 준비' },
  { value: 'LIVE', label: '진행 중' },
  { value: 'ENDED', label: '종료' },
  { value: 'CANCELED', label: '취소됨' },
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
  const date = new Date(value)
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
        ? '확정 참가자가 없어 팬미팅을 시작할 수 없습니다.'
        : `조기 시작 허용 시각(${earliestStartAt?.toLocaleString('ko-KR') ?? '-'}) 이후부터 시작할 수 있습니다.`
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
    canCloseApplicationsNow: status === 'APPLICATION_OPEN',
    canStartNow,
    applicationStarted,
    startBlockedReason,
  }
}

/** LocalDateTime 문자열을 읽기 쉬운 한국어 일시로 표시한다. */
export function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
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
      errors.push('응모 마감 일시는 응모 시작 일시보다 이후여야 합니다.')
    }
    if (applicationEnd && resultAnnouncement && resultAnnouncement < applicationEnd) {
      errors.push('결과 발표 일시는 응모 마감 일시보다 빠를 수 없습니다.')
    }
    if (applicationEnd && scheduledStart && applicationEnd >= scheduledStart) {
      errors.push('응모 마감 일시는 팬미팅 시작 일시보다 이전이어야 합니다.')
    }
    if (resultAnnouncement && scheduledStart && resultAnnouncement >= scheduledStart) {
      errors.push('결과 발표 일시는 팬미팅 시작 일시보다 이전이어야 합니다.')
    }
  }

  if (queueOpen && scheduledStart && queueOpen >= scheduledStart) {
    errors.push('대기열 오픈 일시는 팬미팅 시작 일시보다 이전이어야 합니다.')
  }

  return errors
}

/** 팬미팅 상세 화면의 탭 식별자다. test-control은 시연·테스트 전용 탭이다. */
export type MeetingDetailTab =
  | 'overview'
  | 'settings'
  | 'application-form'
  | 'test-control'

/** 주소창의 `tab` 파라미터를 유효한 탭 값으로 정규화한다. */
export function normalizeDetailTab(value: string | null): MeetingDetailTab {
  if (
    value === 'settings' ||
    value === 'application-form' ||
    value === 'test-control'
  ) {
    return value
  }
  return 'overview'
}
