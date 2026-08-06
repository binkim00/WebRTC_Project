/**
 * 기념 사진 셔터를 상대에게 알리는 LiveKit **데이터 채널 토픽**이다.
 *
 * 왜 필요한가: 지금은 팬이 셔터를 누르면 상대는 아무것도 모른 채 그 순간이 찍힌다. 그래서
 * 남는 사진이 "같이 찍은 사진"이 아니라 "몰래 찍은 화면"이 된다. 셔터를 누른 사실을 상대에게
 * 먼저 알려 **양쪽이 같은 카운트다운을 보고 함께 포즈를 잡게** 하려고 이 토픽을 둔다.
 *
 * 자막(`subtitle`)·통화 제어(`call-control`)·리액션(`reaction`)과 같은 방식으로 토픽만 분리한다.
 * LiveKit의 데이터 채널은 토픽별로 독립 구독이므로 서로 간섭하지 않는다.
 *
 * 중요: 이 신호는 **표시용 힌트일 뿐 촬영 명령이 아니다.** 받은 쪽은 카운트다운만 띄우고
 * 아무것도 저장하지 않는다. 실제 촬영은 셔터를 누른 팬 브라우저에서만 일어나므로, 참가자가
 * 보낸 값을 그대로 믿어도 상대 화면·저장소를 건드리는 경로가 생기지 않는다. 반대로 이 신호가
 * 상대에게 닿지 않아도 누른 쪽 촬영은 그대로 진행된다.
 */
export const PHOTO_SHUTTER_DATA_TOPIC = 'photo-shutter'

/** 화면에 보여 줄 카운트다운의 시작 숫자다. 3 → 2 → 1 순으로 줄어든다. */
export const PHOTO_SHUTTER_COUNT_FROM = 3

/**
 * 카운트 한 칸이 머무는 시간(ms)이다.
 *
 * 숫자는 3부터 보여 주지만 실제 대기는 1초씩 세지 않는다. 팬 1명당 통화가 2분 남짓이라
 * 3초를 그대로 기다리면 체감상 길고, 그 사이 표정이 풀린다. 세 칸 합쳐 약 2초가 되도록
 * 한 칸을 짧게 잡아 "3·2·1"의 리듬만 남긴다.
 */
export const PHOTO_SHUTTER_STEP_MS = 660

/** 셔터 신호 payload다. 다른 토픽과 같이 `type`으로 종류를 구분한다. */
export type PhotoShutterSignal = {
  type: 'photo_shutter'
  /** 어느 통화의 셔터인지다. 팬이 교체되는 팬미팅에서 이전 통화의 신호를 무시하기 위해 쓴다. */
  callSessionId: string
}

/**
 * 셔터 신호를 바이트열로 만든다.
 *
 * 반환 타입을 `Uint8Array<ArrayBuffer>`로 좁히는 이유는 callControlChannel과 같다.
 * `TextEncoder.encode()`의 타입은 SharedArrayBuffer 기반 버퍼도 허용해서 LiveKit
 * `publishData`가 요구하는 NonSharedUint8Array와 맞지 않는다.
 *
 * @param callSessionId 셔터를 누른 통화 세션 식별자
 * @returns 데이터 채널로 보낼 바이트열
 */
export function encodePhotoShutterSignal(callSessionId: string): Uint8Array<ArrayBuffer> {
  const signal: PhotoShutterSignal = { type: 'photo_shutter', callSessionId }
  return new Uint8Array(new TextEncoder().encode(JSON.stringify(signal)))
}

/**
 * 데이터 채널로 받은 바이트열에서 셔터 신호를 읽는다.
 *
 * 알 수 없는 형식·다른 종류의 메시지는 조용히 무시한다. 카운트다운은 보조 표현이므로
 * 이상한 값이 와도 통화를 방해하지 않는 쪽을 택한다.
 *
 * @param data 데이터 채널로 받은 바이트열
 * @returns 셔터 신호이며 해석할 수 없으면 undefined
 */
export function parsePhotoShutterSignal(data: Uint8Array): PhotoShutterSignal | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(data))
  } catch {
    return undefined
  }

  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  if (record.type !== 'photo_shutter') return undefined

  // 세션 식별자는 숫자로 올 수도 있어 문자열로 정규화한다. 프론트는 통화 세션 ID를 문자열로 다룬다.
  const rawId = record.callSessionId ?? record.call_session_id
  if (typeof rawId !== 'string' && typeof rawId !== 'number') return undefined

  return { type: 'photo_shutter', callSessionId: String(rawId) }
}
