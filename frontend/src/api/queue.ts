import { ApiError } from './ApiError'
import { apiRequest } from './client'
import { translate } from '../i18n'

type ApiEnvelope<T> = {
  success: boolean
  data: T
}

export type QueueEnterResponse = {
  queueEntryId: number
  position: number
  status: 'WAITING'
  enteredAt: string
  aheadCount: number
  estimatedWaitSec: number
}

export type QueueDisplayStatus = 'WAITING' | 'IN_CALL' | 'COMPLETED'

export type QueueSnapshotResponse = {
  queueEntryId: number
  position: number
  aheadCount: number
  estimatedWaitSec: number
  displayStatus: QueueDisplayStatus
  callAttemptCount: number
  calledAt: string | null
  callSessionId: number | null
  canEnterCall: boolean
  /** 운영자 순번 조정으로 변경된 경우 팬에게 표시할 최근 사유다. */
  lastChangeReason?: string | null
  /** 최근 순번 조정이 반영된 시각이다. */
  lastChangedAt?: string | null
}

function isQueueEnterResponse(value: unknown): value is QueueEnterResponse {
  if (typeof value !== 'object' || value === null) return false

  const response = value as Record<string, unknown>

  return (
    typeof response.queueEntryId === 'number' &&
    typeof response.position === 'number' &&
    response.status === 'WAITING' &&
    typeof response.enteredAt === 'string' &&
    typeof response.aheadCount === 'number' &&
    typeof response.estimatedWaitSec === 'number'
  )
}

function isQueueDisplayStatus(value: unknown): value is QueueDisplayStatus {
  return value === 'WAITING' || value === 'IN_CALL' || value === 'COMPLETED'
}

function isQueueSnapshotResponse(value: unknown): value is QueueSnapshotResponse {
  if (typeof value !== 'object' || value === null) return false

  const response = value as Record<string, unknown>

  // lastChangeReason/lastChangedAt은 수정사항 API가 추가한 필드지만,
  // 구버전 backend와도 잠시 호환할 수 있도록 누락(undefined)도 허용한다.
  return (
    typeof response.queueEntryId === 'number' &&
    typeof response.position === 'number' &&
    typeof response.aheadCount === 'number' &&
    typeof response.estimatedWaitSec === 'number' &&
    isQueueDisplayStatus(response.displayStatus) &&
    typeof response.callAttemptCount === 'number' &&
    (typeof response.calledAt === 'string' || response.calledAt === null) &&
    (typeof response.callSessionId === 'number' || response.callSessionId === null) &&
    typeof response.canEnterCall === 'boolean' &&
    (typeof response.lastChangeReason === 'string' || response.lastChangeReason === null || response.lastChangeReason === undefined) &&
    (typeof response.lastChangedAt === 'string' || response.lastChangedAt === null || response.lastChangedAt === undefined)
  )
}

export async function enterQueue(
  meetingId: string | number,
  authToken: string,
): Promise<QueueEnterResponse> {
  const response = await apiRequest<ApiEnvelope<unknown>>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/queue/enter`,
    {
      method: 'POST',
      authToken,
    },
  )

  if (!response.success || !isQueueEnterResponse(response.data)) {
    throw new TypeError(translate('queue.t1'))
  }

  return response.data
}

/**
 * 대기실 입장 실패 원인을 화면이 그대로 쓸 수 있는 형태로 해석한다.
 *
 * 백엔드는 "이미 입장함", "오픈 전", "대기열 미초기화", "참가자 없음"을 모두 409로 반환한다.
 * 상태 코드만 보고 전부 재입장으로 처리하면 실제로 막힌 팬을 순번이 뜨지 않는 대기실로 보내
 * 원인이 화면에서 사라지므로, ErrorCode 이름으로 구분한다.
 *
 * @param error 대기실 입장 요청에서 발생한 오류
 * @returns alreadyEntered가 true면 대기실로 이동해도 되고, 아니면 message를 그대로 보여 준다
 */
export function interpretQueueEnterError(
  error: unknown,
): { alreadyEntered: boolean; message: string } {
  if (!(error instanceof ApiError)) {
    return {
      alreadyEntered: false,
      message:
        error instanceof TypeError
          ? error.message
          : translate('queue.t2'),
    }
  }

  switch (error.code) {
    case 'QUEUE_ENTRY_ALREADY_ENTERED':
      return { alreadyEntered: true, message: error.message }
    case 'WAITING_ROOM_NOT_OPEN':
      return {
        alreadyEntered: false,
        message:
          translate('queue.t3'),
      }
    case 'QUEUE_NOT_INITIALIZED':
      return {
        alreadyEntered: false,
        message: translate('queue.t4'),
      }
    case 'NO_PARTICIPANTS':
      return {
        alreadyEntered: false,
        message: translate('queue.t5'),
      }
    case 'PARTICIPANT_NOT_FOUND':
      return {
        alreadyEntered: false,
        message: translate('queue.t6'),
      }
    default:
      // 상태 코드만 아는 새 오류는 재입장으로 단정하지 않고 서버 메시지를 그대로 보여 준다.
      return { alreadyEntered: false, message: error.message }
  }
}

/**
 * 대기열이 아직 열리지 않았거나 팬미팅 종료로 정리된 상태인지 판별한다.
 *
 * 백엔드는 Redis에 대기열 초기화 키가 없으면 409 `QUEUE_NOT_INITIALIZED`
 * ("대기열이 초기화되지 않았습니다.")를 반환한다. 이 상태가 되는 경우는 두 가지다.
 *
 * 1. 대기열을 아직 열지 않았다.
 * 2. **팬미팅을 종료했다.** 종료 처리(`FanMeetingManagementService`)가 Redis의 대기열 키를
 *    모두 지우므로, 종료 뒤에는 대기열 조회가 항상 이 코드로 실패한다.
 *
 * 즉 장애가 아니라 "대기열이 없는 정상 상태"다. 호출부는 오류 배너를 띄우는 대신
 * 빈 대기열로 취급해야 한다.
 */
export function isQueueNotInitialized(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false

  // 종료된 팬미팅은 backend가 FAN_MEETING_ALREADY_ENDED로 명확히 알려 주지만,
  // 구버전에서는 QUEUE_NOT_INITIALIZED 또는 메시지만 내려올 수 있다.
  // 세 경우 모두 운영 화면에서는 장애가 아닌 '대기열을 더 조회할 수 없음'으로 처리한다.
  return (
    error.code === 'QUEUE_NOT_INITIALIZED' ||
    error.code === 'FAN_MEETING_ALREADY_ENDED' ||
    (error.status === 409 && error.message.includes(translate('queue.t7')))
  )
}

export async function getMyQueue(
  meetingId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<QueueSnapshotResponse> {
  const response = await apiRequest<ApiEnvelope<unknown>>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/queue/me`,
    {
      method: 'GET',
      authToken,
      signal,
    },
  )

  if (!response.success || !isQueueSnapshotResponse(response.data)) {
    throw new TypeError(translate('queue.t8'))
  }

  return response.data
}
