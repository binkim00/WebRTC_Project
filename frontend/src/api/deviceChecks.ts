import { apiRequest } from './client'
import { unwrapEnvelope } from './envelope'

export type DeviceCheckRequest = {
  cameraOk: boolean
  microphoneOk: boolean
  /** 점검하지 않았으면 생략 */
  speakerOk?: boolean
  networkOk: boolean
}

export type DeviceCheckResponse = {
  deviceCheckId: number
  cameraOk: boolean
  microphoneOk: boolean
  speakerOk: boolean | null
  networkOk: boolean
  warningRequired: boolean
  /** 장비 이상이 있어도 입장을 막지 않으므로 항상 true */
  canEnter: boolean
  checkedAt: string
}

/** 장비 점검 결과를 저장한다. */
export async function saveDeviceCheck(
  meetingId: string | number,
  request: DeviceCheckRequest,
  authToken: string,
  signal?: AbortSignal,
): Promise<DeviceCheckResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/fan-meetings/${encodeURIComponent(String(meetingId))}/device-checks`,
    { method: 'POST', authToken, signal, body: JSON.stringify(request) },
  )

  return unwrapEnvelope<DeviceCheckResponse>(response)
}
