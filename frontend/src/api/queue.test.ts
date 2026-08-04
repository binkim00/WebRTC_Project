import { describe, expect, it } from 'vitest'
import { ApiError } from './ApiError'
import { interpretQueueEnterError } from './queue'

/**
 * 백엔드는 대기실 입장 실패를 대부분 409로 반환하므로 상태 코드만으로는 구분할 수 없다.
 * 여기서 확인하는 것은 "재입장으로 넘겨도 되는 409"와 "사유를 보여 줘야 하는 409"의 분리다.
 */
describe('interpretQueueEnterError', () => {
  it('이미 입장한 경우에만 대기실로 이동하도록 알려 준다', () => {
    const result = interpretQueueEnterError(
      new ApiError(409, 'QUEUE_ENTRY_ALREADY_ENTERED', '이미 대기실에 입장했습니다.'),
    )

    expect(result.alreadyEntered).toBe(true)
  })

  it('대기실 오픈 전 409는 재입장으로 처리하지 않고 사유를 안내한다', () => {
    const result = interpretQueueEnterError(
      new ApiError(409, 'WAITING_ROOM_NOT_OPEN', '대기실 입장 가능 시간이 아닙니다.'),
    )

    expect(result.alreadyEntered).toBe(false)
    expect(result.message).toContain('대기실이 열리지 않았습니다')
  })

  it('대기열 미초기화와 참가자 없음도 각각의 사유로 구분한다', () => {
    expect(
      interpretQueueEnterError(new ApiError(409, 'QUEUE_NOT_INITIALIZED', '')),
    ).toMatchObject({ alreadyEntered: false })
    expect(
      interpretQueueEnterError(new ApiError(409, 'NO_PARTICIPANTS', '')),
    ).toMatchObject({ alreadyEntered: false })
    expect(
      interpretQueueEnterError(new ApiError(403, 'PARTICIPANT_NOT_FOUND', '')),
    ).toMatchObject({ alreadyEntered: false })
  })

  it('처음 보는 오류 코드는 재입장으로 단정하지 않고 서버 메시지를 그대로 전달한다', () => {
    const result = interpretQueueEnterError(
      new ApiError(409, 'SOME_NEW_CONFLICT', '서버가 보낸 설명'),
    )

    expect(result.alreadyEntered).toBe(false)
    expect(result.message).toBe('서버가 보낸 설명')
  })

  it('ApiError가 아닌 오류에도 안내 문구를 만든다', () => {
    expect(interpretQueueEnterError(new Error('boom')).alreadyEntered).toBe(false)
    expect(interpretQueueEnterError(new TypeError('형식 오류')).message).toBe('형식 오류')
  })
})
