import { FAN_CARD_TEXT_INPUT_LIMIT, type FanCardCandidates } from '../../api/fanCards'
import { AlertBanner, Badge, Button, Textarea } from '..'
import { useTranslation } from '../../i18n'

type FanCardQuotePickerProps = {
  /** 서버에서 받은 문구 후보이며 아직 못 받았으면 undefined */
  candidates?: FanCardCandidates
  /** 후보를 불러오지 못한 이유 */
  loadError?: string
  /** 지금 고른 문구 */
  selectedText?: string
  /** 문구를 고르거나 선택을 풀었을 때 호출하며, 풀었으면 undefined를 넘긴다 */
  onSelect: (text: string | undefined) => void
  /** 다시 불러오기를 눌렀을 때 호출한다 */
  onRetry: () => void
}

/**
 * 카드에 넣을 문구를 고르는 목록이다.
 *
 * <p>AI 추천 문구는 통화가 끝난 뒤에야 만들어지므로 아직 없을 수 있다. 그래서 추천을
 * 기다리는 동안에도 통화 자막에서 직접 고를 수 있게 두 목록을 함께 보여 준다.
 *
 * <p>문구 고르기는 선택 사항이라 고른 문구를 다시 눌러 뺄 수 있다.
 */
export function FanCardQuotePicker({
  candidates,
  loadError,
  selectedText,
  onSelect,
  onRetry,
}: FanCardQuotePickerProps) {
  const { t, locale } = useTranslation()
  const aiSuggestions = candidates?.aiSuggestions ?? []
  const quotes = candidates?.influencerQuotes ?? []
  const hasAnyCandidate = aiSuggestions.length > 0 || quotes.length > 0

  // 화면 언어가 한국어가 아니면 팬 언어로 번역된 문장을 카드 문구로 쓴다.
  // 원문(주로 한국어)을 그대로 고르게 하면 영어 사용자 카드에 읽지 못하는 문장이 박힌다.
  const cardTextOf = (quote: { text: string; translatedText: string | null }) =>
    locale !== 'ko' && quote.translatedText ? quote.translatedText : quote.text
  const subTextOf = (quote: { text: string; translatedText: string | null }) => {
    if (!quote.translatedText) return undefined
    return locale !== 'ko' ? quote.text : quote.translatedText
  }

  return (
    <>
      {loadError ? (
        <AlertBanner className="mt-4" title={t('fanCardQuotePicker.t1')} variant="error">
          <p>{loadError}</p>
          <Button className="mt-3" onClick={onRetry} size="sm" variant="secondary">
             {t('fanCardQuotePicker.t2')} </Button>
        </AlertBanner>
      ) : null}

      {!loadError && !candidates ? (
        <p className="mt-4 text-[15px] font-medium leading-[1.7] text-[var(--color-text-muted)]">
           {t('fanCardQuotePicker.t3')} </p>
      ) : null}

      {candidates && !hasAnyCandidate ? (
        <p className="mt-4 text-[15px] font-medium leading-[1.7] text-[var(--color-text-muted)]">
          {candidates.suggestionStatus === 'GENERATING'
            ? t('fanCardQuotePicker.t4')
            : t('fanCardQuotePicker.t5')}
        </p>
      ) : null}

      {/* 고른 문구가 이 칸에 담기고, 그대로 고쳐 쓸 수도 있다. 추천이 마음에 들지 않거나
          통화에서 고를 말이 없을 때 팬이 직접 적을 길을 항상 열어 둔다. 값이 곧 카드에
          들어갈 문구라 아래 목록의 선택 표시도 이 값을 따라간다. */}
      <div className="mt-5">
        <Textarea
          label={t('fanCardQuotePicker.t12')}
          maxLength={FAN_CARD_TEXT_INPUT_LIMIT}
          onChange={(event) => onSelect(event.target.value || undefined)}
          placeholder={t('fanCardQuotePicker.t13')}
          rows={2}
          value={selectedText ?? ''}
        />
        <p className="mt-1 text-right text-xs text-[var(--color-text-muted)]">
          {(selectedText ?? '').length}/{FAN_CARD_TEXT_INPUT_LIMIT}
        </p>
      </div>

      {hasAnyCandidate ? (
        <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
          {t('fanCardQuotePicker.t11')}
        </p>
      ) : null}

      {aiSuggestions.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-[15px] font-extrabold text-[var(--color-text-primary)]">
             {t('fanCardQuotePicker.t6')} </h3>
          <ul className="mt-3 grid gap-2">
            {aiSuggestions.map((suggestion) => {
              const selected = selectedText === suggestion
              return (
                <li key={`ai:${suggestion}`}>
                  <CandidateButton
                    badge={t('fanCardQuotePicker.t7')}
                    onSelect={() => onSelect(selected ? undefined : suggestion)}
                    selected={selected}
                    text={suggestion}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {quotes.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-[15px] font-extrabold text-[var(--color-text-primary)]">
            {aiSuggestions.length > 0 ? t('fanCardQuotePicker.t8') : t('fanCardQuotePicker.t9')}
            {candidates?.suggestionStatus === 'GENERATING' ? (
              <span className="ml-2 text-[13px] font-semibold text-[var(--color-text-muted)]">
                 {t('fanCardQuotePicker.t10')} </span>
            ) : null}
          </h3>
          <ul className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
            {quotes.map((quote) => {
              const cardText = cardTextOf(quote)
              const subText = subTextOf(quote)
              // 화면 언어를 바꿔 앞뒤가 뒤집혀도 이미 고른 문구는 고른 상태로 보이게 한다.
              const selected = selectedText === cardText
                || (subText !== undefined && selectedText === subText)

              return (
                <li key={quote.subtitleId}>
                  <CandidateButton
                    onSelect={() => onSelect(selected ? undefined : cardText)}
                    selected={selected}
                    subText={subText}
                    text={cardText}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </>
  )
}

type CandidateButtonProps = {
  /** 카드에 들어갈 후보 문구 */
  text: string
  /** 문구 아래에 덧붙일 보조 문장이며 번역문 또는 원문이다 */
  subText?: string
  /** 문구 앞에 붙일 표시 */
  badge?: string
  /** 선택 상태 */
  selected: boolean
  /** 문구를 고르거나 선택을 풀 때 호출한다 */
  onSelect: () => void
}

/** 문구 후보 하나를 고르고 풀 수 있는 버튼이다. */
function CandidateButton({ text, subText, badge, selected, onSelect }: CandidateButtonProps) {
  return (
    <button
      aria-pressed={selected}
      className={`w-full rounded-[var(--radius-panel)] border px-4 py-3.5 text-left transition-colors focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)] ${
        selected
          ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)]'
          : 'border-[var(--color-divider)] hover:border-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-page)]'
      }`}
      onClick={onSelect}
      type="button"
    >
      {/* 표시는 서비스 공용 Badge를 쓴다. 직접 만든 알약과 색·모서리가 어긋나지 않게 한다. */}
      {badge ? (
        <Badge className="mb-1.5" variant="primary">
          {badge}
        </Badge>
      ) : null}
      <span className="block text-[15px] font-semibold leading-[1.6] text-[var(--color-text-primary)]">
        {text}
      </span>
      {/* 번역문은 원문을 대체하지 않고 아래에 덧붙인다. 통화 자막과 같은 규칙이다. */}
      {subText ? (
        <span className="mt-1 block text-[13px] font-medium leading-6 text-[var(--color-text-muted)]">
          {subText}
        </span>
      ) : null}
    </button>
  )
}
