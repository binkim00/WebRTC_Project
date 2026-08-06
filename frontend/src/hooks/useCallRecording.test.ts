import { afterEach, describe, expect, it, vi } from 'vitest'

import { startRecorderWithFallback } from './useCallRecording'

/**
 * MediaRecorder 를 대신하는 스텁이다.
 *
 * 실제 브라우저에서는 "지원한다"고 답한 형식이라도 인코더가 없으면 생성이나 start 에서
 * 예외가 난다. 그 상황을 형식별로 재현하려고 실패시킬 형식을 지정할 수 있게 했다.
 */
type StubOptions = {
  /** 생성자에서 예외를 낼 형식들 */
  failOnCreate?: readonly string[]
  /** start 에서 예외를 낼 형식들 */
  failOnStart?: readonly string[]
  /** isTypeSupported 가 true 로 답할 형식들이며 생략하면 전부 지원한다고 답한다 */
  supported?: readonly string[]
}

/** 스텁이 만들어 낸 녹화기의 기록이다. */
type StubRecord = { mimeType: string; started: boolean }

/**
 * 전역 MediaRecorder 를 스텁으로 바꾸고 생성 기록을 돌려준다.
 *
 * @param options 실패시킬 형식과 지원 목록
 * @returns 시도 순서대로 쌓인 생성 기록
 */
function installMediaRecorderStub(options: StubOptions = {}): StubRecord[] {
  const records: StubRecord[] = []
  const { failOnCreate = [], failOnStart = [], supported } = options

  class MediaRecorderStub {
    mimeType: string
    private readonly record: StubRecord

    constructor(_stream: MediaStream, recorderOptions?: { mimeType?: string }) {
      const mimeType = recorderOptions?.mimeType ?? '(브라우저 기본)'
      if (failOnCreate.includes(mimeType)) {
        throw new Error(`${mimeType} 생성 실패`)
      }
      this.mimeType = mimeType
      this.record = { mimeType, started: false }
      records.push(this.record)
    }

    addEventListener(): void {}

    start(): void {
      if (failOnStart.includes(this.mimeType)) {
        throw new Error(`${this.mimeType} 시작 실패`)
      }
      this.record.started = true
    }

    static isTypeSupported(type: string): boolean {
      return supported === undefined || supported.includes(type)
    }
  }

  vi.stubGlobal('MediaRecorder', MediaRecorderStub)
  return records
}

/** 스텁에 넘길 빈 스트림이다. 실제 트랙은 폴백 판단에 쓰이지 않는다. */
const stream = {} as MediaStream

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('startRecorderWithFallback', () => {
  it('첫 후보로 시작되면 그대로 쓴다', () => {
    const records = installMediaRecorderStub()

    const recorder = startRecorderWithFallback(stream, 1_000, () => {})

    expect(recorder.mimeType).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2')
    expect(records).toHaveLength(1)
    expect(records[0]?.started).toBe(true)
  })

  it('mp4 생성이 막히면 webm 으로 내려간다', () => {
    const records = installMediaRecorderStub({
      failOnCreate: [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
      ],
    })

    const recorder = startRecorderWithFallback(stream, 1_000, () => {})

    expect(recorder.mimeType).toBe('video/webm;codecs=vp8,opus')
    expect(records.at(-1)?.started).toBe(true)
  })

  it('지원한다고 답한 형식이 start 에서 실패해도 다음 후보로 내려간다', () => {
    // isTypeSupported 는 true 인데 실제 인코더가 없어 start 에서 터지는 경우다.
    const records = installMediaRecorderStub({
      failOnStart: [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
      ],
    })

    const recorder = startRecorderWithFallback(stream, 1_000, () => {})

    expect(recorder.mimeType).toBe('video/webm;codecs=vp8,opus')
    expect(records).toHaveLength(4)
  })

  it('지원하는 형식이 하나도 없으면 브라우저 기본값으로 시도한다', () => {
    const records = installMediaRecorderStub({ supported: [] })

    const recorder = startRecorderWithFallback(stream, 1_000, () => {})

    expect(recorder.mimeType).toBe('(브라우저 기본)')
    expect(records).toHaveLength(1)
  })

  it('모든 후보가 실패하면 마지막 오류를 던진다', () => {
    installMediaRecorderStub({
      supported: ['video/webm'],
      failOnCreate: ['video/webm', '(브라우저 기본)'],
    })

    expect(() => startRecorderWithFallback(stream, 1_000, () => {})).toThrow()
  })

  it('시도마다 리스너를 새로 붙인다', () => {
    // 리스너는 start 전에 붙어야 첫 조각을 놓치지 않는다. 앞 후보가 실패하면 그 녹화기는
    // 버려지므로, 새로 만든 녹화기에도 다시 붙여야 한다.
    installMediaRecorderStub({
      failOnCreate: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2'],
    })
    const prepare = vi.fn()

    startRecorderWithFallback(stream, 1_000, prepare)

    expect(prepare).toHaveBeenCalledTimes(1)
    expect(prepare.mock.calls[0]?.[0]).toBeDefined()
  })
})
