/**
 * 개발 환경에서 두 브라우저의 LiveKit 연결 정보를 대조하기 위한 진단 로그다.
 *
 * 운영 빌드에서는 아무것도 출력하지 않으며, 입장 토큰 원문과 인증 헤더는 절대 기록하지 않는다.
 * 토큰 payload는 화면 표시가 아니라 개발자 대조용으로만 디코딩하며 서명은 검증하지 않는다.
 * 서명 검증과 인증 판단은 백엔드 책임이므로 이 파일의 결과로 입장을 막지 않는다.
 */

const LOG_PREFIX = '[melly][rtc]'

type ConnectionDebugInput = {
  callSessionId?: string
  liveKitUrl: string
  accessToken: string
  expiresAt: string
}

type ConnectionStateDebugInput = {
  callSessionId?: string
  connectionState: string
  remoteIdentities: string[]
}

type TokenClaims = {
  identity?: string
  roomName?: string
  tokenExpiresAt?: string
}

/**
 * JWT payload 세그먼트를 UTF-8 문자열로 디코딩한다.
 *
 * base64url은 표준 base64와 달리 `-`, `_`를 쓰고 패딩이 생략되므로 먼저 되돌린다.
 * 방 이름에 한글이 들어갈 수 있어 atob 결과를 TextDecoder로 다시 해석한다.
 */
function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = window.atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * 입장 토큰에서 대조에 필요한 최소 정보만 읽는다.
 *
 * 읽는 값은 identity(`sub`), roomName(`video.room`), 만료 시각(`exp`)뿐이다.
 */
function readTokenClaims(accessToken: string): TokenClaims {
  const payloadSegment = accessToken.split('.')[1]
  if (!payloadSegment) {
    return {}
  }

  const payload: unknown = JSON.parse(decodeBase64Url(payloadSegment))
  if (typeof payload !== 'object' || payload === null) {
    return {}
  }

  const { sub, exp, video } = payload as {
    sub?: unknown
    exp?: unknown
    video?: unknown
  }
  const room =
    typeof video === 'object' && video !== null ? (video as { room?: unknown }).room : undefined

  return {
    identity: typeof sub === 'string' ? sub : undefined,
    roomName: typeof room === 'string' ? room : undefined,
    tokenExpiresAt:
      typeof exp === 'number' ? new Date(exp * 1000).toISOString() : undefined,
  }
}

/**
 * 입장 토큰을 받은 직후 한 번 호출해 두 브라우저가 같은 방에 들어가는지 대조한다.
 *
 * 두 브라우저에서 `roomName`이 같고 `identity`가 서로 다르면 정상이다.
 * 디코딩에 실패해도 경고만 남기고 통화 연결에는 영향을 주지 않는다.
 */
export function logCallConnectionDebug(input: ConnectionDebugInput): void {
  if (!import.meta.env.DEV) {
    return
  }

  try {
    const claims = readTokenClaims(input.accessToken)
    console.info(`${LOG_PREFIX} 입장 정보`, {
      callSessionId: input.callSessionId ?? '없음',
      roomName: claims.roomName ?? '알 수 없음',
      identity: claims.identity ?? '알 수 없음',
      liveKitUrl: input.liveKitUrl,
      expiresAt: input.expiresAt,
      tokenExpiresAt: claims.tokenExpiresAt ?? '알 수 없음',
    })
  } catch (error: unknown) {
    console.warn(
      `${LOG_PREFIX} 입장 토큰 payload를 해석하지 못했습니다. 통화 연결에는 영향이 없습니다.`,
      error instanceof Error ? error.message : error,
    )
  }
}

/**
 * 연결 상태가 바뀔 때마다 실제 참가자 구성을 기록한다.
 *
 * 양쪽이 `Connected`이고 원격 참가자가 1명 이상이면 방이 실제로 연결된 것이다.
 */
export function logCallConnectionState(input: ConnectionStateDebugInput): void {
  if (!import.meta.env.DEV) {
    return
  }

  console.info(`${LOG_PREFIX} 연결 상태`, {
    callSessionId: input.callSessionId ?? '없음',
    connectionState: input.connectionState,
    remoteParticipantCount: input.remoteIdentities.length,
    remoteIdentities: input.remoteIdentities,
  })
}
