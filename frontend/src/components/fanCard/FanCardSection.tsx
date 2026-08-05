import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getFanCardCandidates,
  saveFanCard,
  type FanCardCandidates,
} from '../../api/fanCards'
import { AlertBanner, Button, Card } from '..'
import { drawFanCard } from './fanCardCanvas'

/** AI 추천 문구가 생성 중일 때 다시 조회하는 간격이다. */
const SUGGESTION_POLL_INTERVAL_MS = 3_000

type FanCardSectionProps = {
  /** 카드를 만들 통화 세션 식별자 */
  callSessionId: string
  /** 카드에 넣을 팬미팅 제목 */
  meetingTitle: string
  /** 카드에 넣을 인플루언서 표시 이름 */
  influencerName: string
  /** 카드에 넣을 팬 닉네임 */
  fanNickname: string
  /** 카드에 넣을 날짜 문구 */
  dateLabel: string
  /** API 호출에 사용할 액세스 토큰 */
  authToken: string
}

/**
 * 팬이 통화에서 인상 깊었던 문구를 골라 기념 카드로 만드는 섹션이다.
 *
 * AI 추천 문구는 통화가 끝난 뒤 생성되므로 준비되지 않았을 수 있다. 그래서 추천을 기다리는
 * 동안에도 자막에서 직접 고를 수 있게 두 목록을 함께 보여 준다.
 */
export function FanCardSection({
  callSessionId,
  meetingTitle,
  influencerName,
  fanNickname,
  dateLabel,
  authToken,
}: FanCardSectionProps) {
  const [candidates, setCandidates] = useState<FanCardCandidates>()
  const [selectedText, setSelectedText] = useState<string>()
  const [savedText, setSavedText] = useState<string>()
  const [loadError, setLoadError] = useState<string>()
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const abortController = new AbortController()
    setLoadError(undefined)

    getFanCardCandidates(callSessionId, authToken, abortController.signal)
      .then((loaded) => {
        if (abortController.signal.aborted) return
        setCandidates(loaded)
        // 이미 저장한 카드가 있으면 그 문구를 그대로 보여 준다.
        if (loaded.savedCard) {
          setSavedText(loaded.savedCard.text)
          setSelectedText((current) => current ?? loaded.savedCard?.text)
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadError(
          error instanceof Error
            ? error.message
            : '기념 카드 문구를 불러오지 못했습니다.',
        )
      })

    return () => abortController.abort()
  }, [authToken, callSessionId, reloadKey])

  useEffect(() => {
    // AI 추천은 통화 종료 후 생성되므로 준비될 때까지만 다시 조회한다.
    if (candidates?.suggestionStatus !== 'GENERATING') return

    const timer = window.setTimeout(
      () => setReloadKey((key) => key + 1),
      SUGGESTION_POLL_INTERVAL_MS,
    )
    return () => window.clearTimeout(timer)
  }, [candidates])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !selectedText) return

    let active = true
    void drawFanCard(canvas, {
      text: selectedText,
      meetingTitle,
      influencerName,
      fanNickname,
      dateLabel,
    }).catch(() => {
      if (active) setSaveError('카드 이미지를 그리지 못했습니다.')
    })

    return () => {
      active = false
    }
  }, [dateLabel, fanNickname, influencerName, meetingTitle, selectedText])

  const handleSave = useCallback(async () => {
    if (!selectedText) return

    setSaving(true)
    setSaveError(undefined)
    try {
      const saved = await saveFanCard(callSessionId, selectedText, authToken)
      setSavedText(saved.text)
    } catch (error: unknown) {
      setSaveError(
        error instanceof Error ? error.message : '기념 카드를 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }, [authToken, callSessionId, selectedText])

  /** 미리보기 캔버스를 PNG로 내려받는다. */
  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.toBlob((blob) => {
      if (!blob) {
        setSaveError('카드 이미지를 만들지 못했습니다.')
        return
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `melly-card-${callSessionId}.png`
      anchor.rel = 'noopener'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  const aiSuggestions = candidates?.aiSuggestions ?? []
  const quotes = candidates?.influencerQuotes ?? []
  const hasAnyCandidate = aiSuggestions.length > 0 || quotes.length > 0

  return (
    <section className="mt-8">
      <Card className="p-6">
        <header>
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            기념 카드 만들기
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            통화에서 인상 깊었던 한마디를 골라 카드로 간직할 수 있어요.
          </p>
        </header>

        {loadError ? (
          <AlertBanner className="mt-4" title="문구를 불러오지 못했습니다" variant="error">
            <p>{loadError}</p>
            <Button
              className="mt-3"
              onClick={() => setReloadKey((key) => key + 1)}
              size="sm"
              variant="secondary"
            >
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
                    onSelect={() => setSelectedText(suggestion)}
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
              {aiSuggestions.length > 0
                ? '직접 고르기'
                : '통화에서 나온 말 중에 고르기'}
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
                    onSelect={() => setSelectedText(quote.text)}
                    selected={selectedText === quote.text}
                    subText={quote.translatedText ?? undefined}
                    text={quote.text}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {selectedText ? (
          <div className="mt-6 border-t border-[var(--color-divider)] pt-6">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              카드 미리보기
            </h3>
            <canvas
              aria-label={`기념 카드 미리보기: ${selectedText}`}
              className="mx-auto mt-3 h-auto w-full max-w-xs rounded-[var(--radius-panel)]"
              ref={canvasRef}
              role="img"
            />

            {saveError ? (
              <AlertBanner className="mt-4" title="카드를 처리하지 못했습니다" variant="error">
                {saveError}
              </AlertBanner>
            ) : null}

            {savedText === selectedText ? (
              <p className="mt-4 text-sm text-[var(--color-success)]">
                카드를 저장했습니다. 이미지로도 내려받을 수 있어요.
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button
                loading={saving}
                onClick={() => void handleSave()}
                size="lg"
              >
                {savedText ? '이 문구로 다시 저장' : '카드 저장하기'}
              </Button>
              <Button onClick={handleDownload} size="lg" variant="secondary">
                이미지 내려받기
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </section>
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
