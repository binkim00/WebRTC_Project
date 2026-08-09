import { useEffect, useState } from 'react'
import { getAuthSession } from '../api/authSession'
import {
  CALL_SUMMARY_POLL_INTERVAL_MS,
  getCallSummary,
  type AiCallSummary,
} from '../api/aiSummaries'

/**
 * 요약 조회 상태다.
 *
 * 조회·생성 대기·완료·실패를 한 값으로 다루어 화면이 중간 상태를 놓치지 않게 한다.
 * 실패 사유는 문구로 굳히지 않고 원인을 그대로 넘겨, 화면마다 자기 어투로 안내하게 한다.
 */
export type CallSummaryState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'generating'; message: string }
  | { kind: 'ready'; summary: AiCallSummary }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; cause: unknown }

/**
 * 통화 세션의 AI 요약을 가져오고, 아직 만들어지는 중이면 완료될 때까지 다시 물어본다.
 *
 * 백엔드는 생성이 끝나면 200, 아직이면 202와 `GENERATING`을 준다. 한 번만 조회하면 통화 직후
 * 화면에는 늘 "생성 중"만 남으므로 완료될 때까지 주기적으로 다시 조회한다. 실패(404 등)는
 * 다시 물어봐도 결과가 달라지지 않으므로 그 자리에서 멈춘다 — 무한 폴링을 만들지 않는다.
 *
 * @param callSessionId 조회할 통화 세션 식별자이며, 아직 모르면 undefined를 넘긴다
 * @returns 현재 조회 상태
 */
export function useCallSummary(
  callSessionId: string | number | undefined,
): CallSummaryState {
  const [state, setState] = useState<CallSummaryState>({ kind: 'idle' })

  useEffect(() => {
    if (callSessionId === undefined || callSessionId === '') {
      setState({ kind: 'idle' })
      return
    }

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    /** 한 번 조회하고, 아직 생성 중이면 스스로 다음 조회를 예약한다. */
    async function load() {
      const token = getAuthSession()?.accessToken
      if (!token) {
        setState({ kind: 'unauthenticated' })
        return
      }

      try {
        const result = await getCallSummary(callSessionId!, token, controller.signal)
        if (controller.signal.aborted) return

        if (result.state === 'GENERATING') {
          setState({ kind: 'generating', message: result.message })
          timer = setTimeout(() => void load(), CALL_SUMMARY_POLL_INTERVAL_MS)
          return
        }
        setState({ kind: 'ready', summary: result.summary })
      } catch (cause) {
        if (controller.signal.aborted) return
        setState({ kind: 'error', cause })
      }
    }

    setState({ kind: 'loading' })
    void load()

    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [callSessionId])

  return state
}
