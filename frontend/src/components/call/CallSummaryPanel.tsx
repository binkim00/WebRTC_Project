import { ChatCircleText } from '@phosphor-icons/react'
import { ApiError } from '../../api/ApiError'
import { parseSummaryKeywords } from '../../api/aiSummaries'
import { useCallSummary } from '../../hooks/useCallSummary'
import { AlertBanner } from '../feedback/AlertBanner'
import { Spinner } from '../feedback/Spinner'
import { useTranslation } from '../../i18n'

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
  const state = useCallSummary(callSessionId)

  if (state.kind === 'loading' || state.kind === 'idle') {
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

  if (state.kind === 'error' || state.kind === 'unauthenticated') {
    const message =
      state.kind === 'unauthenticated'
        ? t('callSummaryPanel.t5')
        : state.cause instanceof ApiError && state.cause.status === 404
          ? t('callSummaryPanel.t6')
          : state.cause instanceof ApiError
            ? state.cause.message
            : t('callSummaryPanel.t7')

    return (
      <PanelFrame>
        <ChatCircleText
          aria-hidden
          className="text-[var(--color-text-tertiary)]"
          size={44}
          weight="duotone"
        />
        <AlertBanner title={t('callSummaryPanel.t4')} variant="info">
          {message}
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
