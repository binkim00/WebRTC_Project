// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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
  it('리액션 목록과 핸들러를 주면 이모지 버튼을 그린다', () => {
    renderStage({ reactionEmojis: REACTION_EMOJIS, onReactionSend: vi.fn() })

    for (const emoji of REACTION_EMOJIS) {
      expect(screen.getByRole('button', { name: `${emoji} 리액션 보내기` })).toBeTruthy()
    }
  })

  it('리액션 핸들러가 없으면 버튼을 숨긴다', () => {
    renderStage({ reactionEmojis: REACTION_EMOJIS })

    expect(screen.queryByRole('group', { name: '리액션 보내기' })).toBeNull()
  })

  it('timeRatio를 주면 카운트다운 테두리에 게이지를 그린다', () => {
    const { container } = renderStage({ timeRatio: 0.5 })

    const gauge = container.querySelector('rect[stroke-dasharray]')
    expect(gauge).toBeTruthy()
    // pathLength=1이므로 남은 비율이 그대로 dashoffset의 여집합이 된다.
    expect(gauge?.getAttribute('stroke-dashoffset')).toBe('0.5')
  })

  it('timeRatio가 없으면 게이지를 숨긴다', () => {
    const { container } = renderStage()

    expect(container.querySelector('rect[stroke-dasharray]')).toBeNull()
  })

  /*
   * 팬 화면은 인플루언서와 달리 사진 셔터가 함께 붙는다. 그 버튼이 좌측 조작 열을 밀어내
   * 리액션이 사라지는 일이 없어야 하므로, 팬과 같은 조합으로도 함께 그려지는지 확인한다.
   */
  it('팬 화면 조합(사진 셔터)에서도 리액션과 게이지를 함께 그린다', () => {
    renderStage({
      reactionEmojis: REACTION_EMOJIS,
      onReactionSend: vi.fn(),
      timeRatio: 0.25,
      onCapture: vi.fn(),
      captureLabel: '사진 0/20',
    })

    expect(screen.getByRole('group', { name: '리액션 보내기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '기념 사진 찍기' })).toBeTruthy()
  })
})

describe('CallStage 같이 찍기 카운트다운', () => {
  /** 양쪽 화면에 같은 숫자가 떠야 하므로 셔터 버튼이 없는 인플루언서 화면 조합으로 확인한다. */
  it('captureCountdown을 주면 숫자와 안내 문구를 띄운다', () => {
    renderStage({ captureCountdown: 3 })

    const countdown = screen.getByRole('status')
    expect(countdown.textContent).toContain('3')
    expect(countdown.textContent).toContain('같이 찍어요')
    // 숫자만 읽어 주면 무엇의 카운트다운인지 알 수 없어 읽기용 문장을 따로 둔다.
    expect(countdown.textContent).toContain('사진 촬영까지 3')
  })

  /** 통화 남은 시간과 헷갈리지 않도록 별도 표시로 두었는지 확인한다. */
  it('통화 남은 시간과 별개의 영역으로 그린다', () => {
    renderStage({ captureCountdown: 1, timeValue: '01:30' })

    expect(screen.getByRole('status').textContent).not.toContain('01:30')
  })

  it('captureCountdown이 없으면 카운트다운을 숨긴다', () => {
    renderStage()

    expect(screen.queryByRole('status')).toBeNull()
  })
})
