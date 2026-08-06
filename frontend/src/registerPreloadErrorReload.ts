/**
 * 배포로 화면 조각이 사라졌을 때 스스로 새로고침하도록 등록한다.
 *
 * <p>Vite는 화면별 청크 파일 이름에 해시를 붙이고, 배포하면 해시가 바뀌면서 옛 파일은
 * 사라진다. 배포 전에 열어 둔 탭은 옛 index.html을 들고 있으므로, 그 탭에서 다른 화면으로
 * 넘어가면 이미 없는 파일을 받으러 갔다가 실패한다. 화면에는
 * "Failed to fetch dynamically imported module" 오류만 남는다.
 *
 * <p>이때 Vite가 window에 알려 주는 신호를 받아 한 번만 새로고침하면 팬은 아무 일도 없던
 * 것처럼 이어서 쓸 수 있다. 시연 도중 배포가 겹쳐도 관객 화면이 깨지지 않는다.
 */

/** 마지막으로 새로고침한 시각을 기억하는 키다. 탭 하나에서만 유효하면 된다. */
const PRELOAD_RELOAD_KEY = 'vite-preload-reload-at'

/** 이 시간 안에 같은 오류가 또 나면 새로고침하지 않는다. */
const PRELOAD_RELOAD_COOLDOWN_MS = 10_000

/**
 * 마지막으로 새로고침한 시각을 읽는다.
 *
 * @returns 기억된 시각이며 읽지 못하면 0
 */
function readLastReloadAt(): number {
  try {
    return Number(window.sessionStorage.getItem(PRELOAD_RELOAD_KEY) ?? 0)
  } catch {
    return 0
  }
}

/**
 * 새로고침한 시각을 남긴다.
 *
 * @param now 기록할 시각(밀리초)
 * @returns 기록에 성공했는지
 */
function writeLastReloadAt(now: number): boolean {
  try {
    window.sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

/**
 * 청크를 받지 못했을 때 한 번만 새로고침하도록 창에 등록한다.
 *
 * <p>되풀이를 막는 장치가 이 처리의 핵심이다. 네트워크가 끊긴 것처럼 새로고침해도 같은
 * 오류가 계속 나는 상황에서는 페이지가 끝없이 다시 뜨게 되므로, 방금 새로고침했다면
 * 그냥 오류 화면을 그대로 보여 준다.
 *
 * <p>시각을 기록하지 못하는 환경(사생활 보호 모드 등)에서는 되풀이를 막을 방법이 없으므로
 * 아예 새로고침하지 않는다. 오류 화면 한 번이 무한 새로고침보다 낫다.
 */
export function registerPreloadErrorReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    // 막지 않으면 Vite가 오류를 그대로 다시 던져 화면이 깨진 채로 남는다.
    event.preventDefault()

    const now = Date.now()
    if (now - readLastReloadAt() < PRELOAD_RELOAD_COOLDOWN_MS) return
    if (!writeLastReloadAt(now)) return

    window.location.reload()
  })
}
