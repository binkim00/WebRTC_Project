import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import {
  getFanCardCandidates,
  saveFanCard,
  type FanCardCandidates,
} from '../../api/fanCards'
import { getCapturedPhotos, MAX_PHOTOS_PER_CARD } from '../../api/capturedPhotos'
import { AlertBanner, Button, Card } from '..'
import {
  drawFanCard,
  fanCardSizeOf,
  type CardDecoration,
  type FanCardFont,
  type FanCardLayout,
} from './fanCardCanvas'
import {
  CARD_STICKER_CATEGORIES,
  cardStickerName,
  cardStickerUrl,
} from './cardStickers'

/** AI 추천 문구가 생성 중일 때 다시 조회하는 간격이다. */
const SUGGESTION_POLL_INTERVAL_MS = 3_000

type LayoutOption = {
  /** 레이아웃 값이며 undefined는 사진 없는 문구 전용 카드다. */
  key?: FanCardLayout
  label: string
  /** 이 레이아웃이 쓰는 사진 수 */
  photoCount: number
}

/** 팬이 고를 수 있는 카드 모양이다. 사진이 있을 때만 노출한다. */
const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  { key: 'INSTA', label: '인스타 프레임', photoCount: 1 },
  { key: 'POLAROID', label: '폴라로이드', photoCount: 1 },
  { key: 'FOURCUT', label: '네컷 2×2', photoCount: MAX_PHOTOS_PER_CARD },
  { key: 'FOURCUT_VERTICAL', label: '네컷 세로', photoCount: MAX_PHOTOS_PER_CARD },
  { key: 'FOURCUT_HORIZONTAL', label: '네컷 가로', photoCount: MAX_PHOTOS_PER_CARD },
  { key: undefined, label: '사진 없이 문구만', photoCount: 0 },
]

/**
 * 팬이 고를 수 있는 글꼴이다.
 *
 * <p>previewFamily는 버튼 라벨을 그 글꼴로 보여 주기 위한 값이며, 카드에 실제로 쓰는
 * 글꼴은 fanCardCanvas가 키로 정한다.
 */
const FONT_OPTIONS: readonly { key: FanCardFont; label: string; previewFamily?: string }[] = [
  { key: 'DEFAULT', label: '기본' },
  { key: 'ROUND', label: '둥글둥글', previewFamily: '"Jua"' },
  { key: 'HANDWRITING', label: '손글씨', previewFamily: '"Gaegu"' },
  { key: 'HEADLINE', label: '또렷하게', previewFamily: '"Do Hyeon"' },
]

/** 새로 얹는 스티커의 한 변 길이다. 카드 폭의 6분의 1쯤이라 한눈에 보인다. */
const NEW_STICKER_SIZE = 180

/** 새로 얹는 글자의 크기다. */
const NEW_TEXT_SIZE = 72

/** 팬이 조절할 수 있는 크기 범위다. */
const MIN_DECORATION_SIZE = 48
const MAX_DECORATION_SIZE = 420

/**
 * 화면에서 누른 지점을 카드 안의 좌표로 바꾼다.
 *
 * <p>미리보기 캔버스는 화면 폭에 맞춰 줄여 그리므로, 저장본과 같은 자리에 얹으려면
 * 표시 크기와 실제 카드 크기의 비율을 곱해야 한다.
 *
 * @param canvas 대상 캔버스
 * @param clientX 화면 기준 가로 좌표
 * @param clientY 화면 기준 세로 좌표
 * @returns 카드 좌표계의 지점
 */
function toCardPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  }
}

/**
 * 누른 지점에 있는 꾸미기 요소를 찾는다.
 *
 * <p>위에 쌓인 것을 먼저 집도록 뒤에서부터 살핀다. 글자는 세로보다 가로로 넓으므로
 * 글자 수만큼 판정 폭을 넓혀 준다.
 *
 * @param decorations 카드에 얹힌 요소 목록
 * @param point 카드 좌표계의 지점
 * @returns 집힌 요소이며 없으면 undefined
 */
function findDecorationAt(
  decorations: readonly CardDecoration[],
  point: { x: number; y: number },
): CardDecoration | undefined {
  for (let index = decorations.length - 1; index >= 0; index -= 1) {
    const decoration = decorations[index]
    if (!decoration) continue

    const halfHeight = decoration.size / 2
    const halfWidth = decoration.kind === 'TEXT'
      ? Math.max(halfHeight, (decoration.content.length * decoration.size * 0.6) / 2)
      : halfHeight

    if (
      Math.abs(point.x - decoration.x) <= halfWidth
      && Math.abs(point.y - decoration.y) <= halfHeight
    ) {
      return decoration
    }
  }
  return undefined
}

/**
 * 레이아웃이 쓰는 사진 수를 알려 준다.
 *
 * @param layout 확인할 레이아웃이며 undefined면 문구 전용이다
 * @returns 필요한 사진 수
 */
function photoCountOf(layout: FanCardLayout | undefined): number {
  return LAYOUT_OPTIONS.find((option) => option.key === layout)?.photoCount ?? 0
}

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
  const [photoBitmaps, setPhotoBitmaps] = useState<readonly ImageBitmap[]>([])
  const [photoUrls, setPhotoUrls] = useState<readonly string[]>([])
  const [layout, setLayout] = useState<FanCardLayout>()
  const [selectedPhotoIndexes, setSelectedPhotoIndexes] = useState<readonly number[]>([])
  const [fontKey, setFontKey] = useState<FanCardFont>('DEFAULT')
  const [decorations, setDecorations] = useState<readonly CardDecoration[]>([])
  const [selectedDecorationId, setSelectedDecorationId] = useState<string>()
  const [stickerCategoryKey, setStickerCategoryKey] = useState(
    CARD_STICKER_CATEGORIES[0]?.key ?? 'heart',
  )
  const [decorationTextInput, setDecorationTextInput] = useState('')
  const decorationCounterRef = useRef(0)
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number }>(undefined)

  const selectedDecoration = decorations.find(
    (decoration) => decoration.id === selectedDecorationId,
  )

  /**
   * 카드 한가운데에 새 꾸미기 요소를 얹고 곧바로 선택한다.
   *
   * @param kind 스티커인지 글자인지
   * @param content 스티커 코드 또는 글자
   */
  const addDecoration = useCallback(
    (kind: CardDecoration['kind'], content: string) => {
      const size = fanCardSizeOf(layout)
      decorationCounterRef.current += 1
      const created: CardDecoration = {
        id: `decoration-${decorationCounterRef.current}`,
        kind,
        content,
        x: size.width / 2,
        y: size.height / 2,
        size: kind === 'STICKER' ? NEW_STICKER_SIZE : NEW_TEXT_SIZE,
        rotation: 0,
      }
      setDecorations((current) => [...current, created])
      setSelectedDecorationId(created.id)
    },
    [layout],
  )

  /**
   * 선택한 요소의 값을 바꾼다.
   *
   * @param patch 바꿀 속성만 담은 값
   */
  const updateSelectedDecoration = useCallback(
    (patch: Partial<Pick<CardDecoration, 'x' | 'y' | 'size' | 'rotation'>>) => {
      if (!selectedDecorationId) return
      setDecorations((current) =>
        current.map((decoration) =>
          decoration.id === selectedDecorationId ? { ...decoration, ...patch } : decoration,
        ),
      )
    },
    [selectedDecorationId],
  )

  /** 선택한 요소를 카드에서 뗀다. */
  const removeSelectedDecoration = useCallback(() => {
    if (!selectedDecorationId) return
    setDecorations((current) =>
      current.filter((decoration) => decoration.id !== selectedDecorationId),
    )
    setSelectedDecorationId(undefined)
  }, [selectedDecorationId])

  /**
   * 카드를 눌렀을 때 그 자리의 요소를 집는다. 빈 곳을 누르면 선택을 푼다.
   *
   * @param event 포인터 누름 이벤트
   */
  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = event.currentTarget
      const point = toCardPoint(canvas, event.clientX, event.clientY)
      const hit = findDecorationAt(decorations, point)

      setSelectedDecorationId(hit?.id)
      if (!hit) return

      // 집은 지점과 요소 중심의 차이를 기억해야 끌 때 요소가 튀지 않는다.
      draggingRef.current = { id: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y }
      canvas.setPointerCapture(event.pointerId)
    },
    [decorations],
  )

  /**
   * 집은 요소를 끌어 옮긴다.
   *
   * @param event 포인터 이동 이벤트
   */
  const handleCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const dragging = draggingRef.current
      if (!dragging) return

      const canvas = event.currentTarget
      const point = toCardPoint(canvas, event.clientX, event.clientY)
      // 카드 밖으로 완전히 나가 다시 집지 못하는 일이 없게 안쪽으로 붙잡아 둔다.
      const x = Math.min(Math.max(point.x - dragging.offsetX, 0), canvas.width)
      const y = Math.min(Math.max(point.y - dragging.offsetY, 0), canvas.height)

      setDecorations((current) =>
        current.map((decoration) =>
          decoration.id === dragging.id ? { ...decoration, x, y } : decoration,
        ),
      )
    },
    [],
  )

  /** 끌기를 마친다. */
  const handleCanvasPointerUp = useCallback(() => {
    draggingRef.current = undefined
  }, [])

  // 통화 화면에서 셔터로 남긴 사진을 불러온다. 서버에 올리지 않으므로 이 브라우저에만 있다.
  useEffect(() => {
    let active = true
    const createdUrls: string[] = []
    let createdBitmaps: ImageBitmap[] = []

    getCapturedPhotos(callSessionId)
      .then(async (stored) => {
        if (!active || !stored || stored.photos.length === 0) return

        createdBitmaps = await Promise.all(
          stored.photos.map((photo) => createImageBitmap(photo)),
        )
        if (!active) {
          for (const bitmap of createdBitmaps) bitmap.close()
          return
        }

        for (const photo of stored.photos) createdUrls.push(URL.createObjectURL(photo))
        setPhotoBitmaps(createdBitmaps)
        setPhotoUrls(createdUrls)
        // 사진이 있으면 프레임 카드를 기본으로 보여 준다.
        setLayout('INSTA')
        setSelectedPhotoIndexes([0])
      })
      .catch(() => {
        // 사진을 못 읽어도 문구 카드는 만들 수 있으므로 조용히 넘어간다.
      })

    return () => {
      active = false
      for (const url of createdUrls) URL.revokeObjectURL(url)
      for (const bitmap of createdBitmaps) bitmap.close()
    }
  }, [callSessionId])

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
    const photos = selectedPhotoIndexes
      .map((index) => photoBitmaps[index])
      .filter((photo): photo is ImageBitmap => Boolean(photo))

    void drawFanCard(canvas, {
      text: selectedText,
      meetingTitle,
      influencerName,
      fanNickname,
      dateLabel,
      layout,
      photos,
      fontKey,
      decorations,
    })
      .then(() => {
        // 고른 요소를 알아볼 수 있게 점선을 두른다. 이 표시는 미리보기에만 그리고
        // 내려받을 때는 따로 그린 캔버스를 쓰므로 저장본에는 남지 않는다.
        if (!active || !selectedDecoration) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const half = selectedDecoration.size / 2
        const halfWidth = selectedDecoration.kind === 'TEXT'
          ? Math.max(half, (selectedDecoration.content.length * selectedDecoration.size * 0.6) / 2)
          : half

        ctx.save()
        ctx.translate(selectedDecoration.x, selectedDecoration.y)
        ctx.rotate(selectedDecoration.rotation)
        ctx.setLineDash([14, 10])
        ctx.lineWidth = 4
        ctx.strokeStyle = '#ff5a5f'
        ctx.strokeRect(-halfWidth - 8, -half - 8, halfWidth * 2 + 16, half * 2 + 16)
        ctx.restore()
      })
      .catch(() => {
        if (active) setSaveError('카드 이미지를 그리지 못했습니다.')
      })

    return () => {
      active = false
    }
  }, [
    dateLabel,
    decorations,
    fanNickname,
    fontKey,
    influencerName,
    layout,
    meetingTitle,
    photoBitmaps,
    selectedDecoration,
    selectedPhotoIndexes,
    selectedText,
  ])

  /**
   * 카드 모양을 바꾸고 고른 사진 수를 새 모양에 맞춘다.
   *
   * @param nextLayout 새로 고른 레이아웃이며 undefined면 문구 전용이다
   */
  const changeLayout = useCallback(
    (nextLayout: FanCardLayout | undefined) => {
      // 네컷 스트립은 카드 크기가 달라서, 얹어 둔 스티커를 같은 비율 자리로 옮겨 준다.
      const before = fanCardSizeOf(layout)
      const after = fanCardSizeOf(nextLayout)
      if (before.width !== after.width || before.height !== after.height) {
        setDecorations((current) =>
          current.map((decoration) => ({
            ...decoration,
            x: (decoration.x / before.width) * after.width,
            y: (decoration.y / before.height) * after.height,
          })),
        )
      }

      setLayout(nextLayout)
      const need = photoCountOf(nextLayout)

      setSelectedPhotoIndexes((current) => {
        if (need === 0) return []
        const trimmed = current.slice(0, need)
        if (trimmed.length > 0) return trimmed
        // 아직 고른 사진이 없으면 앞에서부터 필요한 만큼 자동으로 채워 준다.
        return photoBitmaps.slice(0, need).map((_, index) => index)
      })
    },
    [layout, photoBitmaps],
  )

  /**
   * 사진 한 장을 카드에 넣거나 뺀다.
   *
   * <p>한 장만 쓰는 레이아웃은 곧바로 교체하고, 네컷은 고른 순서대로 칸을 채운다.
   *
   * @param index 사진 목록에서의 위치
   */
  const togglePhoto = useCallback(
    (index: number) => {
      const need = photoCountOf(layout)
      if (need === 0) return

      setSelectedPhotoIndexes((current) => {
        if (need === 1) return [index]
        if (current.includes(index)) return current.filter((item) => item !== index)
        if (current.length >= need) return current
        return [...current, index]
      })
    },
    [layout],
  )

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

  /**
   * 카드를 PNG로 내려받는다.
   *
   * <p>미리보기 캔버스에는 고른 요소를 알리는 점선이 그려져 있으므로, 저장할 때는 화면에
   * 없는 캔버스에 같은 내용을 다시 그려 점선이 파일에 남지 않게 한다.
   */
  async function handleDownload() {
    if (!selectedText) return

    const canvas = document.createElement('canvas')
    const photos = selectedPhotoIndexes
      .map((index) => photoBitmaps[index])
      .filter((photo): photo is ImageBitmap => Boolean(photo))

    try {
      await drawFanCard(canvas, {
        text: selectedText,
        meetingTitle,
        influencerName,
        fanNickname,
        dateLabel,
        layout,
        photos,
        fontKey,
        decorations,
      })
    } catch {
      setSaveError('카드 이미지를 만들지 못했습니다.')
      return
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setSaveError('카드 이미지를 만들지 못했습니다.')
        return
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      // 여러 모양으로 내려받아도 파일이 덮이지 않게 레이아웃을 파일명에 남긴다.
      anchor.download = `melly-card-${callSessionId}${layout ? `-${layout.toLowerCase()}` : ''}.png`
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
            {photoBitmaps.length > 0
              ? '통화에서 인상 깊었던 한마디와 남긴 사진으로 카드를 만들 수 있어요.'
              : '통화에서 인상 깊었던 한마디를 골라 카드로 간직할 수 있어요.'}
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

        {selectedText && photoBitmaps.length > 0 ? (
          <div className="mt-6 border-t border-[var(--color-divider)] pt-6">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              카드 모양 고르기
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              통화 중에 남긴 사진 {photoBitmaps.length}장으로 카드를 만들 수 있어요.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {LAYOUT_OPTIONS.map((option) => (
                <li key={option.label}>
                  <button
                    aria-pressed={layout === option.key}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none ${
                      layout === option.key
                        ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]'
                        : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]'
                    }`}
                    onClick={() => changeLayout(option.key)}
                    type="button"
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>

            {photoCountOf(layout) > 0 ? (
              <div className="mt-5">
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  사진 고르기
                  <span className="ml-2 font-normal text-[var(--color-text-secondary)]">
                    {selectedPhotoIndexes.length}/{photoCountOf(layout)}장 선택
                  </span>
                </h4>
                <ul className="mt-3 grid grid-cols-4 gap-2">
                  {photoUrls.map((url, index) => {
                    const order = selectedPhotoIndexes.indexOf(index)
                    const chosen = order >= 0
                    return (
                      <li key={url}>
                        <button
                          aria-label={`${index + 1}번째 사진${chosen ? ' 선택 해제' : ' 선택'}`}
                          aria-pressed={chosen}
                          className={`relative block w-full overflow-hidden rounded-[var(--radius-control)] border-2 transition-colors duration-200 motion-reduce:transition-none ${
                            chosen
                              ? 'border-[var(--color-primary-coral)]'
                              : 'border-transparent hover:border-[var(--color-border-control)]'
                          }`}
                          onClick={() => togglePhoto(index)}
                          type="button"
                        >
                          <img alt="" className="block aspect-video w-full object-cover" src={url} />
                          {chosen && photoCountOf(layout) > 1 ? (
                            <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-[var(--color-primary-coral)] text-[11px] font-bold text-white">
                              {order + 1}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {selectedPhotoIndexes.length < photoCountOf(layout) ? (
                  <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                    남은 칸은 빈 자리로 나옵니다. 원하는 사진을 더 골라 주세요.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {selectedText ? (
          <div className="mt-6 border-t border-[var(--color-divider)] pt-6">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              글꼴 고르기
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {FONT_OPTIONS.map((option) => (
                <li key={option.key}>
                  <button
                    aria-pressed={fontKey === option.key}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 motion-reduce:transition-none ${
                      fontKey === option.key
                        ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]'
                        : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]'
                    }`}
                    onClick={() => setFontKey(option.key)}
                    style={option.previewFamily ? { fontFamily: option.previewFamily } : undefined}
                    type="button"
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>

            <h3 className="mt-6 text-sm font-semibold text-[var(--color-text-primary)]">
              카드 미리보기
            </h3>
            <canvas
              aria-label={`기념 카드 미리보기: ${selectedText}`}
              // touch-none 이 없으면 모바일에서 스티커를 끌 때 화면이 함께 스크롤된다.
              className={`mx-auto mt-3 h-auto w-full max-w-sm touch-none rounded-[var(--radius-panel)] ${
                decorations.length > 0 ? 'cursor-grab' : ''
              }`}
              onPointerCancel={handleCanvasPointerUp}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              ref={canvasRef}
              role="img"
            />

            <div className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  스티커로 꾸미기
                </h4>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {decorations.length > 0
                    ? '카드 위에서 끌어 옮길 수 있어요.'
                    : '눌러서 카드에 올려 보세요.'}
                </p>
              </div>

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {CARD_STICKER_CATEGORIES.map((category) => (
                  <li key={category.key}>
                    <button
                      aria-pressed={stickerCategoryKey === category.key}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none ${
                        stickerCategoryKey === category.key
                          ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]'
                          : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]'
                      }`}
                      onClick={() => setStickerCategoryKey(category.key)}
                      type="button"
                    >
                      {category.label}
                    </button>
                  </li>
                ))}
              </ul>

              <ul className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                {(CARD_STICKER_CATEGORIES.find(
                  (category) => category.key === stickerCategoryKey,
                )?.stickers ?? []).map((sticker) => (
                  <li key={sticker.code}>
                    <button
                      className="block w-full rounded-[var(--radius-control)] p-1.5 transition-colors duration-200 hover:bg-[var(--color-surface-page)] motion-reduce:transition-none"
                      onClick={() => addDecoration('STICKER', sticker.code)}
                      title={sticker.name}
                      type="button"
                    >
                      <img
                        alt={sticker.name}
                        className="block aspect-square w-full"
                        loading="lazy"
                        src={cardStickerUrl(sticker.code)}
                      />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  aria-label="카드에 올릴 글자"
                  className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-3 py-2 text-sm"
                  maxLength={20}
                  onChange={(event) => setDecorationTextInput(event.target.value)}
                  placeholder="카드에 올릴 짧은 글자"
                  type="text"
                  value={decorationTextInput}
                />
                <Button
                  disabled={!decorationTextInput.trim()}
                  onClick={() => {
                    addDecoration('TEXT', decorationTextInput.trim())
                    setDecorationTextInput('')
                  }}
                  size="sm"
                  variant="secondary"
                >
                  글자 올리기
                </Button>
              </div>

              {selectedDecoration ? (
                <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {selectedDecoration.kind === 'STICKER'
                        ? cardStickerName(selectedDecoration.content)
                        : `“${selectedDecoration.content}”`}
                      <span className="ml-2 font-normal text-[var(--color-text-secondary)]">
                        선택됨
                      </span>
                    </p>
                    <Button onClick={removeSelectedDecoration} size="sm" variant="secondary">
                      떼어내기
                    </Button>
                  </div>

                  <label className="mt-3 block text-xs font-semibold text-[var(--color-text-secondary)]">
                    크기
                    <input
                      className="mt-1 block w-full"
                      max={MAX_DECORATION_SIZE}
                      min={MIN_DECORATION_SIZE}
                      onChange={(event) =>
                        updateSelectedDecoration({ size: Number(event.target.value) })
                      }
                      type="range"
                      value={selectedDecoration.size}
                    />
                  </label>

                  <label className="mt-2 block text-xs font-semibold text-[var(--color-text-secondary)]">
                    기울기
                    <input
                      className="mt-1 block w-full"
                      max={180}
                      min={-180}
                      onChange={(event) =>
                        updateSelectedDecoration({
                          rotation: (Number(event.target.value) * Math.PI) / 180,
                        })
                      }
                      type="range"
                      value={Math.round((selectedDecoration.rotation * 180) / Math.PI)}
                    />
                  </label>
                </div>
              ) : null}
            </div>

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
              <Button onClick={() => void handleDownload()} size="lg" variant="secondary">
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
