// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerPreloadErrorReload } from './registerPreloadErrorReload'

/**
 * 배포 직후 청크가 사라졌을 때의 자동 새로고침을 검증한다.
 *
 * 여기서 가장 중요한 것은 "새로고침이 된다"가 아니라 **되풀이되지 않는다**는 쪽이다.
 * 쿨다운이나 저장 실패 처리가 틀어지면 운영에서 페이지가 끝없이 다시 떠 화면을 아예 쓸 수
 * 없게 되는데, 그 상태는 배포를 겹쳐 봐야 재현되어 눈으로 확인하기 어렵다.
 */

const RELOAD_KEY = 'vite-preload-reload-at'

let reload: ReturnType<typeof vi.fn>

beforeEach(() => {
  reload = vi.fn()
  // jsdom의 location은 재정의가 막혀 있어 통째로 갈아 끼운다.
  vi.stubGlobal('location', { ...window.location, reload })
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

/**
 * 등록을 실행하고 그때 붙은 핸들러를 그대로 잡아 온다.
 *
 * `window.dispatchEvent`로 쏘면 앞선 테스트가 붙여 둔 리스너까지 함께 반응한다(jsdom의 window는
 * 파일 안에서 공유되고, 이 모듈은 앱 부팅 때 한 번만 등록하므로 해제 수단을 두지 않았다).
 * 그래서 이번 테스트가 등록한 핸들러만 직접 호출해 서로 간섭하지 않게 한다.
 */
function registerAndCapture(): (event: Event) => void {
  let handler: ((event: Event) => void) | undefined
  const spy = vi
    .spyOn(window, 'addEventListener')
    .mockImplementation((type, listener) => {
      if (type === 'vite:preloadError') handler = listener as (event: Event) => void
    })

  registerPreloadErrorReload()
  spy.mockRestore()

  if (!handler) throw new Error('vite:preloadError 핸들러가 등록되지 않았습니다.')
  return handler
}

/** Vite가 보내는 신호와 같은 형태의 이벤트를 만든다. */
function preloadErrorEvent(): Event {
  return new Event('vite:preloadError', { cancelable: true })
}

describe('registerPreloadErrorReload', () => {
  it('청크를 받지 못하면 기본 동작을 막고 한 번 새로고침한다', () => {
    const handler = registerAndCapture()

    const event = preloadErrorEvent()
    handler(event)

    // 막지 않으면 Vite가 오류를 다시 던져 화면이 깨진 채로 남는다.
    expect(event.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('쿨다운 안에 같은 오류가 또 나면 새로고침하지 않는다', () => {
    // 방금 새로고침한 것처럼 시각을 남겨 둔다.
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    const handler = registerAndCapture()

    const event = preloadErrorEvent()
    handler(event)

    expect(event.defaultPrevented).toBe(true)
    // 새로고침해도 같은 오류가 계속 나는 상황에서는 오류 화면을 그대로 보여 준다.
    expect(reload).not.toHaveBeenCalled()
  })

  it('쿨다운이 지난 뒤에는 다시 새로고침한다', () => {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now() - 11_000))
    const handler = registerAndCapture()

    handler(preloadErrorEvent())

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('시각을 기록할 수 없으면 새로고침하지 않는다', () => {
    /*
     * 사생활 보호 모드처럼 저장이 막힌 환경에서는 쿨다운이 성립하지 않는다. 그대로 새로고침하면
     * 매번 기록에 실패해 무한히 다시 뜨므로, 이 경우에는 아예 새로고침하지 않아야 한다.
     */
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    const handler = registerAndCapture()

    handler(preloadErrorEvent())

    expect(reload).not.toHaveBeenCalled()
  })

  it('읽기가 막힌 환경에서도 한 번은 새로고침한다', () => {
    // 읽지 못하면 쿨다운을 알 수 없지만, 쓰기가 되면 다음 번은 막히므로 한 번은 시도해도 된다.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    const handler = registerAndCapture()

    handler(preloadErrorEvent())

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
