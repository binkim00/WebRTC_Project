import type { FanCardCandidates } from '../../api/fanCards'
import { AlertBanner, Button } from '..'

type FanCardQuotePickerProps = {
  /** 서버에서 받은 문구 후보이며 아직 못 받았으면 undefined */
  candidates?: FanCardCandidates
  /** 후보를 불러오지 못한 이유 */
  loadError?: string
  /** 지금 고른 문구 */
  selectedText?: string
  /** 문구를 골랐을 때 호출한다 */
  onSelect: (text: string) => void
  /** 다시 불러오기를 눌렀을 때 호출한다 */
  onRetry: () => void
}

/**
 * 카드에 넣을 문구를 고르는 목록이다.
 *
 * <p>AI 추천 문구는 통화가 끝난 뒤에야 만들어지므로 아직 없을 수 있다. 그래서 추천을
 * 기다리는 동안에도 통화 자막에서 직접 고를 수 있게 두 목록을 함께 보여 준다.
 */
export function FanCardQuotePicker({
  candidates,
  loadError,
  selectedText,
  onSelect,
  onRetry,
}: FanCardQuotePickerProps) {
  const aiSuggestions = candidates?.aiSuggestions ?? []
  const quotes = candidates?.influencerQuotes ?? []
  const hasAnyCandidate = aiSuggestions.length > 0 || quotes.length > 0

  return (
    <>
      {loadError ? (
        <AlertBanner className="mt-4" title="문구를 불러오지 못했습니다" variant="error">
          <p>{loadError}</p>
          <Button className="mt-3" onClick={onRetry} size="sm" variant="secondary">
            다시 불러오기
          </Button>
        </AlertBanner>
      ) : null}

      {!loadError && !candidates ? (
        <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
          문구를 불러오고 있습니다.
        </p>
      ) : null}

      {candidates && !hasAnyCandidate ? (
        <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
          {candidates.suggestionStatus === 'GENERATING'
            ? 'AI가 추천 문구를 고르고 있습니다. 잠시만 기다려 주세요.'
            : '이번 통화에서는 카드로 만들 문구를 찾지 못했어요.'}
        </p>
      ) : null}

      {aiSuggestions.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            AI 추천 문구
          </h3>
          <ul className="mt-3 grid gap-2">
            {aiSuggestions.map((suggestion) => (
              <li key={`ai:${suggestion}`}>
                <CandidateButton
                  badge="AI 추천"
                  onSelect={() => onSelect(suggestion)}
                  selected={selectedText === suggestion}
                  text={suggestion}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {quotes.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {aiSuggestions.length > 0 ? '직접 고르기' : '통화에서 나온 말 중에 고르기'}
            {candidates?.suggestionStatus === 'GENERATING' ? (
              <span className="ml-2 font-normal text-[var(--color-text-secondary)]">
                AI 추천을 기다리는 동안 먼저 고를 수 있어요
              </span>
            ) : null}
          </h3>
          <ul className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
            {quotes.map((quote) => (
              <li key={quote.subtitleId}>
                <CandidateButton
                  onSelect={() => onSelect(quote.text)}
                  selected={selectedText === quote.text}
                  subText={quote.translatedText ?? undefined}
                  text={quote.text}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}

type CandidateButtonProps = {
  /** 후보 문구 */
  text: string
  /** 문구 아래에 덧붙일 번역문 */
  subText?: string
  /** 문구 앞에 붙일 표시 */
  badge?: string
  /** 선택 상태 */
  selected: boolean
  /** 문구를 골랐을 때 호출한다 */
  onSelect: () => void
}

/** 문구 후보 하나를 고를 수 있는 버튼이다. */
function CandidateButton({ text, subText, badge, selected, onSelect }: CandidateButtonProps) {
  return (
    <button
      aria-pressed={selected}
      className={`w-full rounded-[var(--radius-control)] border p-3 text-left transition-colors duration-200 motion-reduce:transition-none ${
        selected
          ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)]'
          : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] hover:bg-[var(--color-surface-page)]'
      }`}
      onClick={onSelect}
      type="button"
    >
      {badge ? (
        <span className="mb-1 inline-block rounded-full bg-[var(--color-primary-coral-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-primary-coral)]">
          {badge}
        </span>
      ) : null}
      <span className="block text-sm font-medium text-[var(--color-text-primary)]">
        {text}
      </span>
      {subText ? (
        <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">
          {subText}
        </span>
      ) : null}
    </button>
  )
}
