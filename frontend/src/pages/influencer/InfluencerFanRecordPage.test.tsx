// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  fetchFanMemos: vi.fn(),
  fetchMeetingDetail: vi.fn(),
  fetchParticipants: vi.fn(),
  createFanMemo: vi.fn(),
  updateFanMemo: vi.fn(),
  getCallSummary: vi.fn(),
}))

vi.mock('../../api/authSession', () => ({ getAuthSession: mocks.getAuthSession }))
vi.mock('../../api/aiSummaries', () => ({ getCallSummary: mocks.getCallSummary }))
vi.mock('../../api/fanMeetingParticipants', () => ({
  fetchFanMemos: mocks.fetchFanMemos,
  fetchMeetingDetail: mocks.fetchMeetingDetail,
  fetchParticipants: mocks.fetchParticipants,
}))
vi.mock('../../api/fanMemos', () => ({
  createFanMemo: mocks.createFanMemo,
  updateFanMemo: mocks.updateFanMemo,
}))

const { InfluencerFanRecordPage } = await import('./InfluencerFanRecordPage')

function page(size: number) {
  return { page: 0, size, totalElements: size, totalPages: 1, hasNext: false }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/influencer/fan-meetings/10/fans/fan-1/records']}>
      <Routes>
        <Route
          element={<InfluencerFanRecordPage />}
          path="/influencer/fan-meetings/:fanMeetingId/fans/:fanId/records"
        />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAuthSession.mockReturnValue({ accessToken: 'token', role: 'INFLUENCER' })
  // 메모가 있는 지난 회차 하나. 현재 경로의 팬미팅(10)은 메모가 없다.
  mocks.fetchFanMemos.mockResolvedValue({
    content: [
      {
        memoId: '77',
        meetingId: '9',
        meetingTitle: '여름밤 라이브 콜',
        content: '처음이라 긴장한 모습이었다.',
        createdAt: '2026-06-14T20:41:00+09:00',
        updatedAt: '2026-06-14T20:41:00+09:00',
      },
    ],
    ...page(1),
  })
  mocks.fetchMeetingDetail.mockResolvedValue({
    meetingId: '10',
    title: 'MELLY DAY 팬미팅',
    status: 'ENDED',
    scheduledStartAt: '2026-07-26T19:00:00+09:00',
    influencer: { influencerId: 'melly', influencerName: 'Melly' },
  })
  mocks.fetchParticipants.mockResolvedValue({
    content: [
      {
        participantId: 'p-1',
        fanId: 'fan-1',
        nickname: '김유진',
        callOrder: 1,
        participantStatus: 'ACTIVE',
      },
    ],
    ...page(1),
  })
  mocks.createFanMemo.mockResolvedValue({ memoId: '78' })
  mocks.updateFanMemo.mockResolvedValue({ memoId: '77' })
})

describe('InfluencerFanRecordPage', () => {
  it('회차 목록과 집계를 메모·팬미팅 데이터에서 계산한다', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: '김유진' })).toBeTruthy()
    // 메모가 있는 지난 회차 + 메모가 없는 현재 회차 = 2회. 리터럴이 아니다.
    expect(screen.getByText('참여 2회 · 최근 팬미팅 2026.07.26')).toBeTruthy()

    const list = screen.getByRole('navigation', { name: '팬미팅' })
    expect(list.textContent).toContain('2회')
    expect(list.textContent).toContain('메모 없음')
    expect(list.textContent).toContain('메모 있음')

    expect(screen.getAllByRole('button', { name: /팬미팅|라이브 콜/ })).toHaveLength(2)

    // 메모와 팬미팅 정보가 따로 도착하므로, 선택이 정착한 뒤에 확인한다.
    // 최신 회차가 먼저 오고, 지금 열고 들어온 팬미팅이 기본 선택된다.
    await waitFor(() => {
      const [firstSession] = screen.getAllByRole('button', { name: /팬미팅|라이브 콜/ })
      expect(firstSession?.getAttribute('aria-current')).toBe('true')
      expect(firstSession?.textContent).toContain('MELLY DAY 팬미팅')
    })
  })

  it('설계에 없는 조작과 탭을 노출하지 않는다', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1, name: '김유진' })

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull()
    expect(screen.queryByText('새 메모 작성')).toBeNull()
  })

  it('빈 메모는 저장 버튼을 비활성하고 사유를 함께 보여 준다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: '김유진' })

    await user.click(screen.getByRole('button', { name: '메모 작성' }))

    const save = screen.getByRole('button', { name: '메모 저장' })
    expect(save.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('내용을 입력하면 저장할 수 있어요.')).toBeTruthy()

    await user.type(screen.getByRole('textbox', { name: '내 메모' }), '과학 동아리 이야기를 다시 묻기')

    expect(screen.getByRole('button', { name: '메모 저장' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('저장하면 기존 메모를 덮어씁니다.')).toBeTruthy()
    expect(screen.getByText('17자')).toBeTruthy()
  })

  it('메모가 없는 회차는 생성으로, 있는 회차는 수정으로 저장한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { level: 1, name: '김유진' })

    await user.click(screen.getByRole('button', { name: '메모 작성' }))
    await user.type(screen.getByRole('textbox', { name: '내 메모' }), '첫 메모')
    await user.click(screen.getByRole('button', { name: '메모 저장' }))

    await waitFor(() => {
      expect(mocks.createFanMemo).toHaveBeenCalledWith(
        'fan-1',
        { meetingId: 10, content: '첫 메모' },
        'token',
      )
    })
    expect(mocks.updateFanMemo).not.toHaveBeenCalled()
    expect(
      await screen.findByText('메모가 저장되었습니다. 통화 화면에서도 볼 수 있어요.'),
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /여름밤 라이브 콜/ }))
    await user.click(screen.getByRole('button', { name: '메모 수정' }))
    await user.clear(screen.getByRole('textbox', { name: '내 메모' }))
    await user.type(screen.getByRole('textbox', { name: '내 메모' }), '고친 메모')
    await user.click(screen.getByRole('button', { name: '메모 저장' }))

    await waitFor(() => {
      expect(mocks.updateFanMemo).toHaveBeenCalledWith('77', { content: '고친 메모' }, 'token')
    })
  })

  it('함께한 팬미팅이 없으면 설계된 빈 상태만 보여 준다', async () => {
    mocks.fetchFanMemos.mockResolvedValue({ content: [], ...page(0) })
    mocks.fetchMeetingDetail.mockRejectedValue(new Error('no meeting'))
    renderPage()

    expect(await screen.findByText('아직 함께한 팬미팅이 없어요')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '팬미팅' })).toBeNull()
  })

  it('메모를 불러오지 못하면 빈 상태 대신 실패를 알린다', async () => {
    mocks.fetchFanMemos.mockRejectedValue(new TypeError('팬 메모를 불러오지 못했습니다.'))
    mocks.fetchMeetingDetail.mockRejectedValue(new Error('no meeting'))
    renderPage()

    expect(await screen.findByText('팬 메모를 불러오지 못했습니다.')).toBeTruthy()
    expect(screen.queryByText('아직 함께한 팬미팅이 없어요')).toBeNull()
  })
})
