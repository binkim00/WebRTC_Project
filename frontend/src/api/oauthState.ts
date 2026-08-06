import {
  getSocialAuthorizeUrl,
  type SocialProviderPath,
} from './socialAuth'

/**
 * CSRF 방어용 state를 보관하는 키다.
 *
 * 공급자를 오가는 사이에만 필요하고 다른 탭과 공유되면 안 되므로 sessionStorage를 쓴다.
 * 공급자별로 키를 나눠 두어 여러 공급자를 번갈아 시도해도 서로의 값을 덮지 않는다.
 */
function stateKey(provider: SocialProviderPath): string {
  return `oauth_state_${provider}`
}

/**
 * 연결 후 돌아갈 화면을 보관하는 키다.
 *
 * 마이페이지에서 계정을 추가 연결할 때, 콜백 화면이 "로그인 흐름"인지 "연결 흐름"인지
 * 구분해야 하므로 시작 지점을 함께 남긴다.
 */
function returnKey(provider: SocialProviderPath): string {
  return `oauth_return_${provider}`
}

/** state 난수를 만든다. crypto.randomUUID가 없는 환경에서는 시각·난수 조합으로 대체한다. */
function createState(): string {
  if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** 저장이 막힌 브라우저(프라이빗 모드 등)에서도 흐름이 끊기지 않도록 실패를 흡수한다. */
function safeSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // 저장에 실패하면 콜백에서 state 대조를 통과하지 못해 로그인 화면으로 되돌아간다.
  }
}

function safeGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // 지우지 못해도 다음 시도에서 새 값으로 덮인다.
  }
}

/**
 * 소셜 로그인을 시작한다. state를 만들어 저장하고 공급자 로그인 화면으로 이동한다.
 *
 * @param provider 소문자 공급자 코드
 * @param returnTo 연결 흐름에서 돌아갈 내부 경로. 로그인 흐름에서는 생략한다.
 */
export async function startSocialAuth(
  provider: SocialProviderPath,
  returnTo?: string,
): Promise<void> {
  const state = createState()
  safeSet(stateKey(provider), state)
  if (returnTo) safeSet(returnKey(provider), returnTo)
  else safeRemove(returnKey(provider))

  const { authorizeUrl } = await getSocialAuthorizeUrl(provider, state)
  // 서버가 준 주소를 그대로 쓴다. 프론트에서 파라미터를 덧붙이면 공급자가 거부할 수 있다.
  window.location.href = authorizeUrl
}

/**
 * 콜백에서 받은 state가 우리가 만든 값인지 확인한다.
 *
 * 확인 후에는 재사용을 막기 위해 저장값을 지운다. 값이 없거나 다르면 위조된 요청으로 보고
 * 호출한 쪽이 흐름을 중단해야 한다.
 */
export function consumeOauthState(
  provider: SocialProviderPath,
  received: string | null,
): boolean {
  const expected = safeGet(stateKey(provider))
  safeRemove(stateKey(provider))

  return Boolean(expected) && expected === received
}

/** 연결 흐름으로 시작했다면 돌아갈 경로를 꺼낸다. 로그인 흐름이면 undefined다. */
export function consumeOauthReturnTo(provider: SocialProviderPath): string | undefined {
  const stored = safeGet(returnKey(provider))
  safeRemove(returnKey(provider))

  // 열린 리다이렉트를 막기 위해 내부 절대 경로만 인정한다.
  return stored?.startsWith('/') && !stored.startsWith('//') ? stored : undefined
}
