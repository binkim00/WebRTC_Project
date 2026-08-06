// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { CallStage } from './CallStage'
import { REACTION_EMOJIS } from './reactionChannel'

/** CallStage는 라벨을 사전에서 가져오므로 실제 사용처처럼 Provider 안에서 렌더링한다. */
function renderStage(overrides: Partial<Parameters<typeof CallStage>[0]> = {}) {
  return render(
    <I18nProvider>
      <CallStage
        cameraEnabled
        captionEnabled
        connected
        connectionLabel="연결 완료"
        localVideo={<div />}
        microphoneEnabled
        onCameraToggle={vi.fn()}
        onCaptionToggle={vi.fn()}
        onLeave={vi.fn()}
        onMicrophoneToggle={vi.fn()}
        participantLabel="팬"
        remoteName="상대"
        remoteVideo={<div />}
        timeLabel="남은 시간"
        timeValue="01:30"
        {...overrides}
      />
    </I18nProvider>,
  )
}

beforeEach(() => {
  // 화면 언어에 따라 라벨이 달라지지 않도록 한국어로 고정한다.
  window.localStorage.setItem('melly-locale', 'ko')
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('CallStage 리액션·남은 시간 게이지', () => {
  it('리액션 버튼을 열면 이모지를 눌러 보낼 수 있다', () => {
    const onReactionSend = vi.fn()
    renderStage({ reactionEmojis: REACTION_EMOJIS, onReactionSend })

    // 리액션은 상시 노출하지 않고 독의 토글 버튼으로 연다.
    fireEvent.click(screen.getByRole('button', { name: '리액션 보내기' }))

    for (const emoji of REACTION_EMOJIS) {
      expect(screen.getByRole('button', { name: `${emoji} 리액션 보내기` })).toBeTruthy()
    }

    const firstEmoji = REACTION_EMOJIS[0] as string
    fireEvent.click(screen.getByRole('button', { name: `${firstEmoji} 리액션 보내기` }))
    expect(onReactionSend).toHaveBeenCalledWith(firstEmoji)
  })

  it('리액션 핸들러가 없으면 토글과 팔레트를 모두 숨긴다', () => {
    renderStage({ reactionEmojis: REACTION_EMOJIS })

    expect(screen.queryByRole('button', { name: '리액션 보내기' })).toBeNull()
    expect(screen.queryByRole('group', { name: '리액션 보내기' })).toBeNull()
  })

  it('timeRatio를 주면 상단 헤어라인 게이지를 남은 비율만큼 그린다', () => {
    const { container } = renderStage({ timeRatio: 0.5 })

    const gauge = container.querySelector<HTMLElement>('[style*="width"]')
    expect(gauge).toBeTruthy()
    expect(gauge?.style.width).toBe('50%')
  })

  it('timeRatio가 없으면 게이지를 숨긴다', () => {
    const { container } = renderStage()

    expect(container.querySelector('[style*="width"]')).toBeNull()
  })

  /*
   * 팬 화면은 인플루언서와 달리 사진 셔터가 함께 붙는다. 셔터가 다른 조작을 밀어내
   * 리액션·게이지가 사라지는 일이 없어야 하므로, 팬과 같은 조합으로 함께 확인한다.
   */
  it('팬 화면 조합(사진 셔터)에서도 리액션과 게이지를 함께 그린다', () => {
    const onCapture = vi.fn()
    const { container } = renderStage({
      reactionEmojis: REACTION_EMOJIS,
      onReactionSend: vi.fn(),
      timeRatio: 0.25,
      onCapture,
      captureLabel: '사진 0/20',
    })

    fireEvent.click(screen.getByRole('button', { name: '리액션 보내기' }))
    expect(screen.getByRole('group', { name: '리액션 보내기' })).toBeTruthy()

    // 셔터는 접근성 이름에 찍은 장수를 함께 담는다.
    const shutter = screen.getByRole('button', { name: '기념 사진 찍기 — 사진 0/20' })
    fireEvent.click(shutter)
    expect(onCapture).toHaveBeenCalled()

    const gauge = container.querySelector<HTMLElement>('[style*="width"]')
    expect(gauge?.style.width).toBe('25%')
  })

  it('마이크·카메라·자막·종료 조작이 독에서 그대로 동작한다', () => {
    const onMicrophoneToggle = vi.fn()
    const onCameraToggle = vi.fn()
    const onCaptionToggle = vi.fn()
    const onLeave = vi.fn()
    renderStage({ onMicrophoneToggle, onCameraToggle, onCaptionToggle, onLeave })

    fireEvent.click(screen.getByRole('button', { name: '마이크 끄기' }))
    expect(onMicrophoneToggle).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '카메라 끄기' }))
    expect(onCameraToggle).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('switch'))
    expect(onCaptionToggle).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '통화 종료' }))
    expect(onLeave).toHaveBeenCalled()
  })
})
