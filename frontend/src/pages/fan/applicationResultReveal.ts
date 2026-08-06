/**
 * 팬이 응모 결과를 **직접 확인했는지** 기억한다.
 *
 * 왜 브라우저에 두는가: 백엔드 응모 내역 응답(`MyApplicationSummaryResponse`)은 상태와
 * 결과 확정 시각만 주고, "팬이 결과를 열어 봤는지"는 어디에도 없다. 그 값이 없으면 목록이
 * 당첨·미당첨을 그대로 노출해 결과 화면을 열기 전에 결과가 새어 나간다.
 *
 * **한계**: 기기·브라우저마다 따로 기록된다. 다른 기기에서 로그인하면 결과를 아직 확인하지
 * 않은 것으로 보인다. 결과를 감추는 쪽으로 틀리는 것이라 안전한 방향이며, 서버에
 * 확인 시각(예: `resultCheckedAt`)이 생기면 이 모듈만 교체하면 된다.
 */

/** 계정별 확인 완료 팬미팅 목록을 담는 저장 키다. */
const STORAGE_KEY = 'melly-revealed-application-results'

/** 저장 형식이다. 키는 회원 식별자, 값은 결과를 확인한 팬미팅 식별자 목록이다. */
type RevealStore = Record<string, number[]>

/**
 * 저장값을 읽는다.
 *
 * 세션이 아니라 localStorage를 쓰는 이유: 탭을 닫았다 다시 열었을 때 이미 확인한 결과가
 * 다시 감춰지면 팬은 결과가 사라졌다고 여긴다. 확인 여부는 세션보다 오래 유지되어야 한다.
 * 사파리 프라이빗 모드처럼 접근이 막히거나 값이 깨져 있으면 빈 값으로 시작한다.
 */
function readStore(): RevealStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

    const store: RevealStore = {}
    for (const [userId, meetingIds] of Object.entries(parsed)) {
      if (!Array.isArray(meetingIds)) continue
      store[userId] = meetingIds.filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value),
      )
    }
    return store
  } catch {
    return {}
  }
}

/** 저장값을 쓴다. 저장이 막힌 브라우저에서는 조용히 넘긴다(결과는 계속 감춰진 채로 남는다). */
function writeStore(store: RevealStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // 저장할 수 없어도 화면 동작 자체는 막지 않는다.
  }
}

/** 이 팬이 해당 팬미팅의 응모 결과를 이미 확인했는지 확인한다. */
export function hasRevealedApplicationResult(
  userId: number,
  meetingId: number,
): boolean {
  return readStore()[String(userId)]?.includes(meetingId) ?? false
}

/** 응모 결과를 확인한 것으로 기록한다. 이미 기록되어 있으면 아무것도 하지 않는다. */
export function markApplicationResultRevealed(
  userId: number,
  meetingId: number,
): void {
  const store = readStore()
  const key = String(userId)
  const revealed = store[key] ?? []
  if (revealed.includes(meetingId)) return

  store[key] = [...revealed, meetingId]
  writeStore(store)
}
