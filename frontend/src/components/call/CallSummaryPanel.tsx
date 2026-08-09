import { ChatCircleText } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  CALL_SUMMARY_POLL_INTERVAL_MS,
  getCallSummary,
  parseSummaryKeywords,
  type AiCallSummary,
} from '../../api/aiSummaries'
import { AlertBanner } from '../feedback/AlertBanner'
import { Spinner } from '../feedback/Spinner'
import { useTranslation } from '../../i18n'

/** 생성 중일 때 다시 물어보는 간격이다. 요약은 통화 종료 직후 수 초~수십 초가 걸린다. */
/** 조회·생성 대기·완료·실패를 한 값으로 다루어 화면이 중간 상태를 놓치지 않게 한다. */
type PanelState =
  | { kind: 'loading' }
  | { kind: 'generating'; message: string }
  | { kind: 'ready'; summary: AiCallSummary }
  | { kind: 'error'; message: string }

/** 빈 상태와 오류를 같은 높이로 감싸 탭 전환 시 레이아웃이 흔들리지 않게 한다. */
function PanelFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[460px] place-items-center px-6 text-center">
      <div className="grid justify-items-center gap-4">{children}</div>
    </div>
  )
}

/**
 * 통화 세션의 AI 요약을 보여 준다. (인플루언서·운영자 전용)
 *
 * 백엔드는 아직 생성 중이면 202와 GENERATING을 주므로, 완료될 때까지 주기적으로 다시 조회한다.
 */
export function CallSummaryPanel({ callSessionId }: { callSessionId: string | number }) {
  const { t } = useTranslation()
  const [state, setState] = useState<PanelState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    /** 한 번 조회하고, 아직 생성 중이면 스스로 다음 조회를 예약한다. */
    async function load() {
      const token = getAuthSession()?.accessToken
      if (!token) {
        setState({ kind: 'error', message: t('callSummaryPanel.t5') })
        return
      }

      try {
        const result = await getCallSummary(callSessionId, token, controller.signal)
        if (controller.signal.aborted) return

        if (result.state === 'GENERATING') {
          setState({ kind: 'generating', message: result.message })
          timer = setTimeout(() => void load(), CALL_SUMMARY_POLL_INTERVAL_MS)
          return
        }
        setState({ kind: 'ready', summary: result.summary })
      } catch (cause) {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message:
            cause instanceof ApiError && cause.status === 404
              ? t('callSummaryPanel.t6')
              : cause instanceof ApiError
                ? cause.message
                : t('callSummaryPanel.t7'),
        })
      }
    }

    setState({ kind: 'loading' })
    void load()

    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callSessionId])

  if (state.kind === 'loading') {
    return (
      <PanelFrame>
        <Spinner label={t('callSummaryPanel.t1')} />
      </PanelFrame>
    )
  }

  if (state.kind === 'generating') {
    return (
      <PanelFrame>
        <Spinner label={t('callSummaryPanel.t2')} />
        <div>
          <p className="text-lg font-extrabold">{state.message}</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {t('callSummaryPanel.t3')}
          </p>
        </div>
      </PanelFrame>
    )
  }

  if (state.kind === 'error') {
    return (
      <PanelFrame>
        <ChatCircleText
          aria-hidden
          className="text-[var(--color-text-tertiary)]"
          size={44}
          weight="duotone"
        />
        <AlertBanner title={t('callSummaryPanel.t4')} variant="info">
          {state.message}
        </AlertBanner>
      </PanelFrame>
    )
  }

  const keywords = parseSummaryKeywords(state.summary.keywords)

  return (
    <div className="grid gap-5 p-6">
      {keywords.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {keywords.map((keyword) => (
            <li
              className="rounded-full bg-[var(--color-surface-page)] px-3 py-1 text-xs font-bold text-[var(--color-text-secondary)]"
              key={keyword}
            >
              #{keyword}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="whitespace-pre-wrap text-sm leading-7">{state.summary.summary}</p>
    </div>
  )
}
