/**
 * 팬별 통화 세션 기록이다. (브라우저 저장)
 *
 * AI 대화 요약 조회에는 통화 세션 식별자가 필요한데, 백엔드에는 (팬미팅, 팬)으로 지난
 * 통화 세션을 찾는 API가 없다. 그래서 요약은 통화 중이거나 통화 직후(대기열의 currentCall을
 * 알 때)에만 열 수 있고, 팬미팅이 끝나면 어디서도 볼 수 없었다.
 *
 * 이 모듈은 대기열 폴링에서 관측한 currentCall의 세션을 (팬미팅, 팬) 키로 localStorage에
 * 남겨, 팬미팅이 끝난 뒤에도 팬 기록 화면이 요약을 다시 찾을 수 있게 한다.
 *
 * localStorage 기반이라 **통화를 지켜본 그 브라우저에서만** 남는 한계가 있다. 백엔드가
 * 팬·팬미팅 기준 세션 조회 API를 제공하면 이 모듈은 그 API 호출로 대체한다.
 */

const STORAGE_KEY = 'melly-fan-call-sessions'

/** 이 수를 넘으면 오래 전에 기록한 것부터 지운다. 항목당 100바이트 안팎이라 넉넉히 잡는다. */
const MAX_RECORDS = 300

type StoredRecord = { callSessionId: string; at: string }
type StoredMap = Record<string, StoredRecord>

function keyOf(meetingId: string, fanId: string): string {
  return `${meetingId}:${fanId}`
}

function readMap(): StoredMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}

    const map: StoredMap = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as StoredRecord).callSessionId === 'string' &&
        typeof (value as StoredRecord).at === 'string'
      ) {
        map[key] = value as StoredRecord
      }
    }
    return map
  } catch {
    return {}
  }
}

function writeMap(map: StoredMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // 저장 공간 문제로 기록에 실패해도 통화 흐름을 막지 않는다.
  }
}

/**
 * 통화 세션을 (팬미팅, 팬) 키로 기록한다.
 *
 * 같은 팬과 다시 통화하면(재호출 등) 최신 세션으로 덮어쓴다. 요약도 최신 통화 기준이
 * 자연스럽다.
 */
export function rememberFanCallSession(
  meetingId: string,
  fanId: string,
  callSessionId: string,
): void {
  if (!meetingId || !fanId || !callSessionId) return

  const map = readMap()
  const key = keyOf(meetingId, fanId)
  if (map[key]?.callSessionId === callSessionId) return

  map[key] = { callSessionId, at: new Date().toISOString() }

  const keys = Object.keys(map)
  if (keys.length > MAX_RECORDS) {
    const oldestFirst = keys.sort((left, right) =>
      (map[left]?.at ?? '').localeCompare(map[right]?.at ?? ''),
    )
    for (const staleKey of oldestFirst.slice(0, keys.length - MAX_RECORDS)) {
      delete map[staleKey]
    }
  }

  writeMap(map)
}

/** (팬미팅, 팬)으로 기록해 둔 통화 세션을 찾는다. 없으면 undefined다. */
export function recallFanCallSession(
  meetingId: string,
  fanId: string,
): string | undefined {
  if (!meetingId || !fanId) return undefined
  return readMap()[keyOf(meetingId, fanId)]?.callSessionId
}
