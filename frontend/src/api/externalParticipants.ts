import { apiRequest, authorizedFetch } from './client'
import { unwrapEnvelope } from './envelope'
import type { FanMeetingStatus } from './meetingManagement'
import { translate } from '../i18n'

/** 명단 CSV가 반드시 가져야 하는 헤더다. (백엔드 ExternalParticipantCsvParser.HEADER) */
export const EXTERNAL_PARTICIPANT_CSV_HEADER = 'email,callOrder'

/** 명단 전체 단위 오류 한 건이다. */
export type ExternalParticipantFileError = {
  errorCode: string
  errorMessage: string
}

/** 명단 한 행의 검증 결과다. */
export type ExternalParticipantRow = {
  /** 헤더를 포함한 CSV 파일 기준 행 번호다. */
  rowNumber: number
  email: string
  callOrder: number | null
  matchedUserId: number | null
  matchedNickname: string | null
  valid: boolean
  errorCode: string | null
  errorMessage: string | null
}

export type ExternalParticipantPreviewResponse = {
  totalRowCount: number
  validRowCount: number
  invalidRowCount: number
  confirmable: boolean
  fileErrors: ExternalParticipantFileError[]
  rows: ExternalParticipantRow[]
}

export type ExternalParticipantConfirmResponse = {
  meetingId: number
  participantCount: number
  queueEntryCount: number
  meetingStatus: FanMeetingStatus
  confirmedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value === 'string') return value
  throw new TypeError(translate('externalParticipants.t1', { p0: fieldName }))
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readNumber(value: unknown, fieldName: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new TypeError(translate('externalParticipants.t2', { p0: fieldName }))
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === 'boolean') return value
  throw new TypeError(translate('externalParticipants.t3', { p0: fieldName }))
}

function parseFileError(value: unknown): ExternalParticipantFileError {
  if (!isRecord(value)) throw new TypeError(translate('externalParticipants.t4'))
  return {
    errorCode: readString(value.errorCode, 'errorCode'),
    errorMessage: readString(value.errorMessage, 'errorMessage'),
  }
}

function parseRow(value: unknown): ExternalParticipantRow {
  if (!isRecord(value)) throw new TypeError(translate('externalParticipants.t5'))
  return {
    rowNumber: readNumber(value.rowNumber, 'rowNumber'),
    email: readString(value.email, 'email'),
    callOrder: readOptionalNumber(value.callOrder),
    matchedUserId: readOptionalNumber(value.matchedUserId),
    matchedNickname: readOptionalString(value.matchedNickname),
    valid: readBoolean(value.valid, 'valid'),
    errorCode: readOptionalString(value.errorCode),
    errorMessage: readOptionalString(value.errorMessage),
  }
}

function parsePreviewResponse(value: unknown): ExternalParticipantPreviewResponse {
  const record = unwrapEnvelope<Record<string, unknown>>(value)
  if (!isRecord(record) || !Array.isArray(record.rows) || !Array.isArray(record.fileErrors)) {
    throw new TypeError(translate('externalParticipants.t6'))
  }
  return {
    totalRowCount: readNumber(record.totalRowCount, 'totalRowCount'),
    validRowCount: readNumber(record.validRowCount, 'validRowCount'),
    invalidRowCount: readNumber(record.invalidRowCount, 'invalidRowCount'),
    confirmable: readBoolean(record.confirmable, 'confirmable'),
    fileErrors: record.fileErrors.map(parseFileError),
    rows: record.rows.map(parseRow),
  }
}

function parseConfirmResponse(value: unknown): ExternalParticipantConfirmResponse {
  const record = unwrapEnvelope<Record<string, unknown>>(value)
  if (!isRecord(record)) throw new TypeError(translate('externalParticipants.t7'))
  return {
    meetingId: readNumber(record.meetingId, 'meetingId'),
    participantCount: readNumber(record.participantCount, 'participantCount'),
    queueEntryCount: readNumber(record.queueEntryCount, 'queueEntryCount'),
    meetingStatus: readString(record.meetingStatus, 'meetingStatus') as FanMeetingStatus,
    confirmedAt: readString(record.confirmedAt, 'confirmedAt'),
  }
}

/**
 * 운영자가 채워 넣을 명단 CSV 양식을 내려받는다.
 *
 * 특정 팬미팅과 무관한 공통 양식이라 팬미팅 식별자 없이 호출한다. 파일 응답이라
 * 공통 apiRequest(JSON 전용) 대신 직접 fetch한다.
 */
export async function downloadExternalParticipantCsvTemplate(
  authToken: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; fileName: string }> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
  const response = await authorizedFetch(
    `${baseUrl}/api/v1/fan-meetings/external-participants/csv-template`,
    { signal },
    authToken,
  )

  if (!response.ok) {
    throw new Error(translate('externalParticipants.t8', { p0: response.status }))
  }

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const plainName = /filename="?([^";]+)"?/i.exec(disposition)?.[1]
  const fileName = encodedName
    ? decodeURIComponent(encodedName)
    : (plainName ?? 'external-participant-template.csv')

  return { blob: await response.blob(), fileName }
}

/** 업로드한 명단 CSV를 저장하지 않고 검증 결과만 확인한다. */
export async function previewExternalParticipantsCsv(
  meetingId: string | number,
  file: File,
  authToken: string,
  signal?: AbortSignal,
): Promise<ExternalParticipantPreviewResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/external-participants/csv/preview`,
    { method: 'POST', authToken, signal, body: formData },
  )

  return parsePreviewResponse(response)
}

/** 업로드한 명단 CSV를 다시 검증하고 참가자와 대기열을 확정한다. */
export async function confirmExternalParticipantsCsv(
  meetingId: string | number,
  file: File,
  authToken: string,
  signal?: AbortSignal,
): Promise<ExternalParticipantConfirmResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/external-participants/csv/confirm`,
    { method: 'POST', authToken, signal, body: formData },
  )

  return parseConfirmResponse(response)
}
