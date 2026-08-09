// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { VideoCallRoom } from './VideoCallRoom'

/**
 * 이 테스트가 지키는 것은 **서버 Egress 녹화의 유일한 방아쇠**다.
 *
 * 백엔드 `RecordingEgressCoordinator.prepareStart`는 팬의 `recordingConsentAt`이 없으면
 * 로그 한 줄 없이 조용히 녹화를 포기한다. 그래서 이 화면이 `consentToRecording`을 부르지
 * 않으면 아무 오류도 없이 서버 녹화만 사라지고, 팬에게는 깨진 브라우저 녹화가 남는다.
 * 실제로 2026-08-05 병합에서 이 호출이 탈락해 이후 녹화 41건이 전부 브라우저 업로드로
 * 떨어졌고, 테스트가 없어 아무도 알아채지 못했다. 같은 사고를 두 번 겪지 않기 위한 회귀
 * 방어선이다.
 */
const mocks = vi.hoisted(() => ({
  consentToRecording: vi.fn(),
  getAuthSession: vi.fn(),
  issueLiveKitAccessToken: vi.fn(),
  getCallSessionStatus: vi.fn(),
  fetchPublicFanMeetingDetail: vi.fn(),
  fetchMeetingQueue: vi.fn(),
}))

vi.mock('../../api/recordings', () => ({
  consentToRecording: mocks.consentToRecording,
}))
vi.mock('../../api/auth', () => ({
  getAuthSession: mocks.getAuthSession,
}))
vi.mock('../../api/callSessions', () => ({
  issueLiveKitAccessToken: mocks.issueLiveKitAccessToken,
  getCallSessionStatus: mocks.getCallSessionStatus,
  isCallSessionEnded: (status: string) => status === 'ENDED',
}))
vi.mock('../../api/fanMeetings', () => ({
  fetchPublicFanMeetingDetail: mocks.fetchPublicFanMeetingDetail,
}))
vi.mock('../../api/fanMeetingParticipants', () => ({
  fetchMeetingQueue: mocks.fetchMeetingQueue,
}))
vi.mock('../../api/queue', () => ({
  isQueueNotInitialized: () => false,
}))
// 폴링이 돌면 테스트가 끝난 뒤에도 상태 조회가 이어져 결과가 흔들린다.
vi.mock('../../hooks/usePolling', () => ({
  usePolling: () => {},
}))
// LiveKit 실제 연결과 통화 화면은 이 테스트의 관심사가 아니다.
vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: ({ children }: { children?: ReactNode }) => (
    <div data-testid="livekit-room">{children}</div>
  ),
}))
vi.mock('./ConnectedCallRoom', () => ({
  ConnectedCallRoom: () => <div data-testid="connected-call-room" />,
}))
vi.mock('./MeetingWrapUp', () => ({
  MeetingWrapUp: () => <div data-testid="meeting-wrap-up" />,
}))

/**
 * 통화 입장에 필요한 최소 응답을 채운다.
 *
 * @param role 로그인 사용자 역할
 * @param recordingEnabled 팬미팅 운영 설정의 녹화 사용 여부
 */
function stubCallEntry(role: string, recordingEnabled: boolean) {
  mocks.getAuthSession.mockReturnValue({ role, accessToken: 'token-1' })
  mocks.issueLiveKitAccessToken.mockResolvedValue({
    liveKitUrl: 'wss://livekit.test',
    accessToken: 'lk-token',
    expiresAt: '2026-08-07T00:00:00',
  })
  mocks.getCallSessionStatus.mockResolvedValue({ status: 'CONNECTING' })
  mocks.fetchPublicFanMeetingDetail.mockResolvedValue({
    meeting: { operation: { callDurationSec: 120, recordingEnabled } },
  })
  mocks.fetchMeetingQueue.mockResolvedValue({ entries: [] })
  mocks.consentToRecording.mockResolvedValue({
    callSessionId: 11,
    consentedAt: '2026-08-06T22:00:00',
  })
}

/** 실제 사용처처럼 사전 Provider 안에서 팬 통화 화면을 렌더링한다. */
function renderRoom() {
  return render(
    <I18nProvider>
      <VideoCallRoom
        callSessionId="11"
        endTo="/fan/meetings"
        meetingId="7"
        participantLabel="팬"
        screenId="FAN-CALL"
      />
    </I18nProvider>,
  )
}

beforeEach(() => {
  window.localStorage.setItem('melly-locale', 'ko')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('VideoCallRoom 녹화 동의 기록', () => {
  it('녹화가 켜진 팬미팅에 팬으로 입장하면 통화 세션과 토큰으로 동의를 기록한다', async () => {
    stubCallEntry('FAN', true)
    renderRoom()

    await waitFor(() => {
      expect(mocks.consentToRecording).toHaveBeenCalledTimes(1)
    })
    // 세션 식별자와 인증 토큰이 함께 가야 서버가 참가자를 특정할 수 있다.
    expect(mocks.consentToRecording.mock.calls[0]?.[0]).toBe('11')
    expect(mocks.consentToRecording.mock.calls[0]?.[1]).toBe('token-1')
  })

  it('입장 토큰을 받기 전에 동의를 보내지 않는다', async () => {
    stubCallEntry('FAN', true)
    renderRoom()

    // 동의는 CallSession이 CONNECTING인 동안만 허용되므로 입장 전에 보내야 하고,
    // 그 전제인 입장 토큰 발급보다 앞설 수는 없다.
    await waitFor(() => {
      expect(mocks.consentToRecording).toHaveBeenCalled()
    })
    expect(mocks.issueLiveKitAccessToken).toHaveBeenCalled()
  })

  it('호스트(인플루언서)는 동의를 기록하지 않는다', async () => {
    stubCallEntry('INFLUENCER', true)
    renderRoom()

    await waitFor(() => {
      expect(mocks.issueLiveKitAccessToken).toHaveBeenCalled()
    })
    // 동의는 녹화 대상인 팬 본인만 남긴다. 백엔드도 FAN 역할만 허용한다.
    expect(mocks.consentToRecording).not.toHaveBeenCalled()
  })

  it('녹화를 쓰지 않는 팬미팅에서는 동의를 기록하지 않는다', async () => {
    stubCallEntry('FAN', false)
    renderRoom()

    await waitFor(() => {
      expect(mocks.issueLiveKitAccessToken).toHaveBeenCalled()
    })
    expect(mocks.consentToRecording).not.toHaveBeenCalled()
  })

  it('동의 기록이 실패해도 통화 입장을 막지 않는다', async () => {
    stubCallEntry('FAN', true)
    mocks.consentToRecording.mockRejectedValue(new Error('409 conflict'))
    renderRoom()

    // 녹화를 못 남기는 것보다 통화가 끊기는 쪽이 더 큰 손실이므로 입장은 계속한다.
    await waitFor(() => {
      expect(mocks.consentToRecording).toHaveBeenCalled()
    })
    expect(await screen.findByTestId('livekit-room')).toBeTruthy()
  })

  it('통화 상태 조회가 실패해도 LiveKit 토큰이 정상이면 영상 화면을 연다', async () => {
    stubCallEntry('INFLUENCER', false)
    mocks.getCallSessionStatus.mockRejectedValue(new Error('status unavailable'))
    renderRoom()

    expect(await screen.findByTestId('livekit-room')).toBeTruthy()
    expect(screen.getByText('status unavailable')).toBeTruthy()
  })
})
