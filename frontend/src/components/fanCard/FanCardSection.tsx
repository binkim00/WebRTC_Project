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
import {
  getCapturedPhotos,
  getFanCardDraft,
  saveFanCardDraft,
} from '../../api/capturedPhotos'
import { AlertBanner, Button, Card, CardContent } from '..'
import {
  drawFanCard,
  fanCardSizeOf,
  type CardDecoration,
  type FanCardFont,
  type FanCardLayout,
} from './fanCardCanvas'
import { FanCardQuotePicker } from './FanCardQuotePicker'
import { FanCardLayoutPicker } from './FanCardLayoutPicker'
import { photoCountOf } from './fanCardLayoutOptions'
import { FanCardFontPicker } from './FanCardFontPicker'
import {
  FanCardStickerPanel,
  MAX_DECORATION_SIZE,
  MIN_DECORATION_SIZE,
} from './FanCardStickerPanel'
import { useTranslation } from '../../i18n'

/** AI 추천 문구가 생성 중일 때 다시 조회하는 간격이다. */
const SUGGESTION_POLL_INTERVAL_MS = 3_000

/** 새로 얹는 스티커의 한 변 길이다. 카드 폭의 6분의 1쯤이라 한눈에 보인다. */
const NEW_STICKER_SIZE = 180

/** 새로 얹는 글자의 크기다. */
const NEW_TEXT_SIZE = 72

/** 꾸미던 상태를 자동 저장하기 전에 기다리는 시간이다. */
const DRAFT_SAVE_DELAY_MS = 600

/** 내려받기용 임시 주소를 정리하기까지 기다리는 시간이다. */
const OBJECT_URL_RELEASE_DELAY_MS = 1_000

/**
 * 고른 요소를 감싸는 점선 색을 디자인 토큰에서 읽어 온다.
 *
 * <p>캔버스에는 CSS 변수를 그대로 넣을 수 없어 값을 꺼내 쓴다. 이렇게 해 두면 토큰만
 * 바꿔도 미리보기 표시 색이 화면 강조색과 함께 움직인다.
 *
 * @returns 캔버스에 쓸 색 문자열
 */
function resolveSelectionColor(): string {
  if (typeof globalThis.getComputedStyle !== 'function') return '#c93634'
  const token = globalThis
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--color-primary-coral')
    .trim()
  return token || '#c93634'
}

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

/** 요소 중심에서 테두리까지의 반높이·반너비다. 글자는 글자 수만큼 가로로 넓다. */
function decorationExtents(decoration: CardDecoration): { half: number; halfWidth: number } {
  const half = decoration.size / 2
  const halfWidth = decoration.kind === 'TEXT'
    ? Math.max(half, (decoration.content.length * decoration.size * 0.6) / 2)
    : half
  return { half, halfWidth }
}

/** 선택 테두리(점선)와 요소 사이의 간격이다. 핸들도 이 테두리 모서리에 앉는다. */
const SELECTION_INSET = 8

/** 카드 좌표계 기준 핸들 원의 반지름(그리기)과 판정 반경이다. 손가락으로도 집히게 판정을 넉넉히 둔다. */
const HANDLE_DRAW_RADIUS = 26
const HANDLE_HIT_RADIUS = 48

/**
 * 선택한 요소의 조절 핸들(오른쪽 아래)과 삭제 핸들(오른쪽 위)의 카드 좌표다.
 *
 * <p>요소가 회전해 있으면 핸들도 테두리를 따라 함께 돈다.
 */
function decorationHandlePositions(decoration: CardDecoration): {
  transform: { x: number; y: number }
  remove: { x: number; y: number }
} {
  const { half, halfWidth } = decorationExtents(decoration)
  const cos = Math.cos(decoration.rotation)
  const sin = Math.sin(decoration.rotation)
  const rotated = (x: number, y: number) => ({
    x: decoration.x + x * cos - y * sin,
    y: decoration.y + x * sin + y * cos,
  })

  return {
    transform: rotated(halfWidth + SELECTION_INSET, half + SELECTION_INSET),
    remove: rotated(halfWidth + SELECTION_INSET, -half - SELECTION_INSET),
  }
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
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

    const { half, halfWidth } = decorationExtents(decoration)

    if (
      Math.abs(point.x - decoration.x) <= halfWidth
      && Math.abs(point.y - decoration.y) <= half
    ) {
      return decoration
    }
  }
  return undefined
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
 * 팬이 통화에서 남긴 사진과 인상 깊었던 문구로 기념 카드를 만드는 섹션이다.
 *
 * AI 추천 문구는 통화가 끝난 뒤 생성되므로 준비되지 않았을 수 있다. 그래서 추천을 기다리는
 * 동안에도 자막에서 직접 고를 수 있게 두 목록을 함께 보여 준다.
 *
 * <p>문구 고르기는 선택 사항이다. 추천이 늦거나 마음에 드는 말이 없어도 사진과 꾸미기만으로
 * 카드를 완성해 내려받을 수 있다. 다만 서버가 보관하는 것은 문구뿐이라, 문구를 고른 경우에만
 * 저장 버튼을 열어 준다.
 */
export function FanCardSection({
  callSessionId,
  meetingTitle,
  influencerName,
  fanNickname,
  dateLabel,
  authToken,
}: FanCardSectionProps) {
  const { t } = useTranslation()
  const [candidates, setCandidates] = useState<FanCardCandidates>()
  const [selectedText, setSelectedText] = useState<string>()
  const [savedText, setSavedText] = useState<string>()
  const [loadError, setLoadError] = useState<string>()
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [photoBlobs, setPhotoBlobs] = useState<readonly Blob[]>([])
  const [photoUrls, setPhotoUrls] = useState<readonly string[]>([])
  /**
   * 카드에 넣기로 한 사진만 풀어 둔다.
   *
   * <p>PNG를 ImageBitmap 으로 풀면 장당 4MB 가까이 차지해, 찍은 것을 모두 풀면 휴대폰에서
   * 버겁다. 고른 것만 남기고 빠진 것은 곧바로 닫아 최대 네 장만 메모리에 둔다.
   */
  const bitmapCacheRef = useRef(new Map<number, ImageBitmap>())
  const [layout, setLayout] = useState<FanCardLayout>()
  const [selectedPhotoIndexes, setSelectedPhotoIndexes] = useState<readonly number[]>([])
  const [fontKey, setFontKey] = useState<FanCardFont>('DEFAULT')
  const [decorations, setDecorations] = useState<readonly CardDecoration[]>([])
  const [selectedDecorationId, setSelectedDecorationId] = useState<string>()
  const decorationCounterRef = useRef(0)
  /** 진행 중인 끌기다. move는 위치 이동, transform은 모서리 핸들로 크기·기울기 조절이다. */
  const draggingRef = useRef<
    | { kind: 'move'; id: string; offsetX: number; offsetY: number }
    | {
        kind: 'transform'
        id: string
        center: { x: number; y: number }
        startDistance: number
        startAngle: number
        startSize: number
        startRotation: number
      }
    | undefined
  >(undefined)
  /** 보관해 둔 상태를 다 불러왔는지. 불러오기 전에 저장하면 초기값이 덮어쓴다. */
  const draftLoadedRef = useRef(false)

  const selectedDecoration = decorations.find(
    (decoration) => decoration.id === selectedDecorationId,
  )

  /**
   * 카드에 담을 것이 하나라도 있는지.
   *
   * <p>문구 고르기는 선택 사항이라 사진만으로도 카드를 완성할 수 있다. 다만 문구도 사진도
   * 없으면 빈 도안만 남으므로 그때는 미리보기와 내려받기를 열지 않는다.
   */
  const canCompose = Boolean(selectedText) || selectedPhotoIndexes.length > 0

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

  /** 선택한 요소를 카드에서 뗀다. */
  const removeSelectedDecoration = useCallback(() => {
    if (!selectedDecorationId) return
    setDecorations((current) =>
      current.filter((decoration) => decoration.id !== selectedDecorationId),
    )
    setSelectedDecorationId(undefined)
  }, [selectedDecorationId])

  /**
   * 카드를 눌렀을 때 그 자리의 요소나 핸들을 집는다. 빈 곳을 누르면 선택을 푼다.
   *
   * <p>선택한 요소에는 카드 위에 삭제(×)·조절(모서리) 핸들이 떠 있다. 핸들을 먼저 판정해야
   * 요소 밖으로 살짝 나가 있는 핸들이 빈 곳 클릭으로 오인되지 않는다.
   *
   * @param event 포인터 누름 이벤트
   */
  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = event.currentTarget
      const point = toCardPoint(canvas, event.clientX, event.clientY)

      if (selectedDecoration) {
        const handles = decorationHandlePositions(selectedDecoration)

        // 삭제 핸들 — 누르는 즉시 뗀다.
        if (distanceBetween(point, handles.remove) <= HANDLE_HIT_RADIUS) {
          removeSelectedDecoration()
          return
        }

        // 조절 핸들 — 중심에서 멀어지면 커지고, 중심을 축으로 돌리면 기울어진다.
        if (distanceBetween(point, handles.transform) <= HANDLE_HIT_RADIUS) {
          const center = { x: selectedDecoration.x, y: selectedDecoration.y }
          draggingRef.current = {
            kind: 'transform',
            id: selectedDecoration.id,
            center,
            startDistance: Math.max(1, distanceBetween(point, center)),
            startAngle: Math.atan2(point.y - center.y, point.x - center.x),
            startSize: selectedDecoration.size,
            startRotation: selectedDecoration.rotation,
          }
          canvas.setPointerCapture(event.pointerId)
          return
        }
      }

      const hit = findDecorationAt(decorations, point)

      setSelectedDecorationId(hit?.id)
      if (!hit) return

      // 집은 지점과 요소 중심의 차이를 기억해야 끌 때 요소가 튀지 않는다.
      draggingRef.current = {
        kind: 'move',
        id: hit.id,
        offsetX: point.x - hit.x,
        offsetY: point.y - hit.y,
      }
      canvas.setPointerCapture(event.pointerId)
    },
    [decorations, removeSelectedDecoration, selectedDecoration],
  )

  /**
   * 집은 요소를 끌어 옮기거나, 조절 핸들로 크기·기울기를 바꾼다.
   *
   * @param event 포인터 이동 이벤트
   */
  const handleCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const dragging = draggingRef.current
      if (!dragging) return

      const canvas = event.currentTarget
      const point = toCardPoint(canvas, event.clientX, event.clientY)

      if (dragging.kind === 'transform') {
        const distance = Math.max(1, distanceBetween(point, dragging.center))
        const size = Math.min(
          MAX_DECORATION_SIZE,
          Math.max(MIN_DECORATION_SIZE, dragging.startSize * (distance / dragging.startDistance)),
        )
        const angle = Math.atan2(point.y - dragging.center.y, point.x - dragging.center.x)
        const rotation = dragging.startRotation + (angle - dragging.startAngle)

        setDecorations((current) =>
          current.map((decoration) =>
            decoration.id === dragging.id ? { ...decoration, size, rotation } : decoration,
          ),
        )
        return
      }

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
    const cache = bitmapCacheRef.current

    // 사진과 꾸미던 상태를 함께 불러온다. 따로 부르면 어느 쪽이 늦게 오느냐에 따라
    // 기본값이 복원한 상태를 덮어써 팬이 꾸며 둔 것이 사라진다.
    Promise.all([getCapturedPhotos(callSessionId), getFanCardDraft(callSessionId)])
      .then(([stored, draft]) => {
        if (!active) return

        if (stored && stored.photos.length > 0) {
          // 여기서는 풀지 않고 원본만 들고 있는다. 팔레트 미리보기는 objectURL 로 충분하고,
          // 실제로 푸는 것은 카드에 넣기로 한 사진뿐이다.
          for (const photo of stored.photos) createdUrls.push(URL.createObjectURL(photo))
          setPhotoBlobs(stored.photos)
          setPhotoUrls(createdUrls)
        }

        if (draft) {
          setLayout(draft.layout)
          setFontKey(draft.fontKey)
          setSelectedPhotoIndexes(draft.selectedPhotoIndexes)
          setDecorations(draft.decorations)
          // 이어 붙일 식별자가 겹치지 않게 이미 쓴 번호 뒤에서 시작한다.
          decorationCounterRef.current = draft.decorations.length
        } else if (stored && stored.photos.length > 0) {
          // 사진이 있으면 프레임 카드를 기본으로 보여 준다.
          setLayout('INSTA')
          setSelectedPhotoIndexes([0])
        }

        draftLoadedRef.current = true
      })
      .catch(() => {
        // 사진을 못 읽어도 문구 카드는 만들 수 있으므로 조용히 넘어간다.
        draftLoadedRef.current = true
      })

    return () => {
      active = false
      for (const url of createdUrls) URL.revokeObjectURL(url)
      for (const bitmap of cache.values()) bitmap.close()
      cache.clear()
    }
  }, [callSessionId])

  // 꾸미던 상태를 자동으로 보관한다. 끌어 옮기는 동안 값이 계속 바뀌므로 잠시 멈췄을 때만
  // 저장해 쓰기 횟수를 줄인다. 복원이 끝나기 전에는 저장하지 않는다. 초기값이 저장해 둔
  // 것을 덮어쓰기 때문이다.
  useEffect(() => {
    if (!draftLoadedRef.current) return

    const timer = window.setTimeout(() => {
      void saveFanCardDraft({
        callSessionId,
        layout,
        fontKey,
        selectedPhotoIndexes: [...selectedPhotoIndexes],
        decorations: [...decorations],
        savedAt: new Date().toISOString(),
      }).catch(() => undefined)
    }, DRAFT_SAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [callSessionId, decorations, fontKey, layout, selectedPhotoIndexes])

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
            : t('fanCardSection.t1'),
        )
      })

    return () => abortController.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /**
   * 카드에 넣기로 한 사진만 그릴 수 있는 형태로 푼다.
   *
   * <p>고른 것만 풀고 빠진 것은 곧바로 닫아, 찍은 장수가 늘어도 메모리가 함께 늘지 않게
   * 한다. 이미 푼 사진은 다시 풀지 않는다.
   *
   * @returns 고른 순서대로 정렬한 사진
   */
  const resolveSelectedPhotos = useCallback(async (): Promise<ImageBitmap[]> => {
    const cache = bitmapCacheRef.current

    for (const [index, bitmap] of [...cache]) {
      if (!selectedPhotoIndexes.includes(index)) {
        bitmap.close()
        cache.delete(index)
      }
    }

    const photos: ImageBitmap[] = []
    for (const index of selectedPhotoIndexes) {
      const cached = cache.get(index)
      if (cached) {
        photos.push(cached)
        continue
      }

      const blob = photoBlobs[index]
      if (!blob) continue
      const bitmap = await createImageBitmap(blob)
      cache.set(index, bitmap)
      photos.push(bitmap)
    }
    return photos
  }, [photoBlobs, selectedPhotoIndexes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !canCompose) return

    let active = true

    void resolveSelectedPhotos()
      .then((photos) => {
        if (!active) return undefined
        return drawFanCard(canvas, {
          text: selectedText ?? '',
          meetingTitle,
          influencerName,
          fanNickname,
          dateLabel,
          layout,
          photos,
          fontKey,
          decorations,
        })
      })
      .then(() => {
        // 고른 요소를 알아볼 수 있게 점선을 두르고, 카드 위에서 바로 조작할 수 있는
        // 삭제(×)·조절(↔) 핸들을 모서리에 그린다. 이 표시는 미리보기에만 그리고
        // 내려받을 때는 따로 그린 캔버스를 쓰므로 저장본에는 남지 않는다.
        if (!active || !selectedDecoration) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const { half, halfWidth } = decorationExtents(selectedDecoration)
        const selectionColor = resolveSelectionColor()

        ctx.save()
        ctx.translate(selectedDecoration.x, selectedDecoration.y)
        ctx.rotate(selectedDecoration.rotation)
        ctx.setLineDash([14, 10])
        ctx.lineWidth = 4
        ctx.strokeStyle = selectionColor
        ctx.strokeRect(
          -halfWidth - SELECTION_INSET,
          -half - SELECTION_INSET,
          halfWidth * 2 + SELECTION_INSET * 2,
          half * 2 + SELECTION_INSET * 2,
        )
        ctx.setLineDash([])

        /** 테두리 모서리에 흰 원 핸들 하나를 그린다. */
        const drawHandleCircle = (x: number, y: number) => {
          ctx.beginPath()
          ctx.arc(x, y, HANDLE_DRAW_RADIUS, 0, Math.PI * 2)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
          ctx.lineWidth = 4
          ctx.strokeStyle = selectionColor
          ctx.stroke()
        }

        const cornerX = halfWidth + SELECTION_INSET
        const cornerY = half + SELECTION_INSET
        const iconRadius = HANDLE_DRAW_RADIUS * 0.42

        // 오른쪽 위 — 삭제(×) 핸들
        drawHandleCircle(cornerX, -cornerY)
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.strokeStyle = selectionColor
        ctx.beginPath()
        ctx.moveTo(cornerX - iconRadius, -cornerY - iconRadius)
        ctx.lineTo(cornerX + iconRadius, -cornerY + iconRadius)
        ctx.moveTo(cornerX + iconRadius, -cornerY - iconRadius)
        ctx.lineTo(cornerX - iconRadius, -cornerY + iconRadius)
        ctx.stroke()

        // 오른쪽 아래 — 크기·기울기 조절(↔) 핸들
        drawHandleCircle(cornerX, cornerY)
        ctx.beginPath()
        ctx.moveTo(cornerX - iconRadius, cornerY + iconRadius)
        ctx.lineTo(cornerX + iconRadius, cornerY - iconRadius)
        ctx.stroke()
        for (const [tipX, tipY] of [
          [cornerX + iconRadius, cornerY - iconRadius],
          [cornerX - iconRadius, cornerY + iconRadius],
        ] as const) {
          const direction = tipY < cornerY ? 1 : -1
          ctx.beginPath()
          ctx.moveTo(tipX - direction * iconRadius * 0.9, tipY)
          ctx.lineTo(tipX, tipY)
          ctx.lineTo(tipX, tipY + direction * iconRadius * 0.9)
          ctx.stroke()
        }

        ctx.restore()
      })
      .catch(() => {
        if (active) setSaveError(t('fanCardSection.t2'))
      })

    return () => {
      active = false
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 미리보기 재그리기를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canCompose,
    dateLabel,
    decorations,
    fanNickname,
    fontKey,
    influencerName,
    layout,
    meetingTitle,
    resolveSelectedPhotos,
    selectedDecoration,
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
        return photoBlobs.slice(0, need).map((_, index) => index)
      })
    },
    [layout, photoBlobs],
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

  /**
   * 고른 문구를 서버에 저장한다.
   *
   * <p>서버가 보관하는 것은 문구뿐이고 빈 문구는 받지 않으므로, 문구를 고르지 않았으면
   * 저장 자체를 시도하지 않는다. 사진과 꾸미기는 내려받은 이미지에만 담긴다.
   */
  const handleSave = useCallback(async () => {
    if (!selectedText) return

    setSaving(true)
    setSaveError(undefined)
    try {
      const saved = await saveFanCard(callSessionId, selectedText, authToken)
      setSavedText(saved.text)
    } catch (error: unknown) {
      setSaveError(
        error instanceof Error ? error.message : t('fanCardSection.t3'),
      )
    } finally {
      setSaving(false)
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, callSessionId, selectedText])

  /**
   * 카드를 PNG로 내려받는다.
   *
   * <p>미리보기 캔버스에는 고른 요소를 알리는 점선이 그려져 있으므로, 저장할 때는 화면에
   * 없는 캔버스에 같은 내용을 다시 그려 점선이 파일에 남지 않게 한다.
   */
  async function handleDownload() {
    if (!canCompose) return

    const canvas = document.createElement('canvas')

    try {
      const photos = await resolveSelectedPhotos()
      await drawFanCard(canvas, {
        text: selectedText ?? '',
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
      setSaveError(t('fanCardSection.t4'))
      return
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setSaveError(t('fanCardSection.t5'))
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
      // 누르자마자 주소를 없애면 내려받기가 시작되기 전에 끊기는 브라우저가 있다.
      // 잠시 뒤에 정리해 저장이 중간에 실패하지 않게 한다.
      window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_RELEASE_DELAY_MS)
    }, 'image/png')
  }


  return (
    <section className="mt-8">
      {/*
        Card는 이 프로젝트에서 위쪽 구분선만 그리는 요소이고 여백은 CardContent가 담당한다.
        Card에 직접 p-6을 주면 다른 화면의 카드와 여백 규칙이 어긋나므로 관례대로 둘을 겹쳐 쓴다.
      */}
      <Card>
        <CardContent>
          <header>
            <h2 className="text-xl font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
               {t('fanCardSection.t6')} </h2>
            <p className="mt-2 text-[15px] font-medium leading-[1.7] text-[var(--color-text-muted)]">
              {photoBlobs.length > 0
                ? t('fanCardSection.t7')
                : t('fanCardSection.t8')}
            </p>
          </header>

          <FanCardQuotePicker
            candidates={candidates}
            loadError={loadError}
            onRetry={() => setReloadKey((key) => key + 1)}
            onSelect={setSelectedText}
            selectedText={selectedText}
          />

          {/* 문구는 선택 사항이라 사진만 있어도 배치를 고를 수 있어야 한다. */}
          {photoBlobs.length > 0 ? (
            <FanCardLayoutPicker
              layout={layout}
              onLayoutChange={changeLayout}
              onTogglePhoto={togglePhoto}
              photoUrls={photoUrls}
              selectedPhotoIndexes={selectedPhotoIndexes}
            />
          ) : null}

          {canCompose ? (
            <div className="mt-6 border-t border-[var(--color-divider)] pt-6">
              <FanCardFontPicker fontKey={fontKey} onChange={setFontKey} />

              <h3 className="mt-6 text-[15px] font-extrabold text-[var(--color-text-primary)]">
                 {t('fanCardSection.t9')} </h3>
              <canvas
                aria-label={
                  selectedText
                    ? t('fanCardSection.t10', { p0: selectedText })
                    : t('fanCardSection.t17')
                }
                // touch-none 이 없으면 모바일에서 스티커를 끌 때 화면이 함께 스크롤된다.
                className={`mx-auto mt-3 h-auto w-full max-w-sm touch-none rounded-[var(--radius-panel)] bg-[var(--color-surface-page)] ${
                  decorations.length > 0 ? 'cursor-grab' : ''
                }`}
                onPointerCancel={handleCanvasPointerUp}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                ref={canvasRef}
                role="img"
              />

              <FanCardStickerPanel
                decorationCount={decorations.length}
                onAddSticker={(code) => addDecoration('STICKER', code)}
                onAddText={(text) => addDecoration('TEXT', text)}
              />

              {saveError ? (
                <AlertBanner className="mt-4" title={t('fanCardSection.t11')} variant="error">
                  {saveError}
                </AlertBanner>
              ) : null}

              {/* 저장 완료도 오류와 같은 배너 체계로 알린다. 초록 문장 한 줄만 두면 눈에 띄지 않는다. */}
              {/* 문구를 고르지 않으면 둘 다 undefined 라 저장한 적이 없어도 같다고 나온다. */}
              {selectedText && savedText === selectedText ? (
                <AlertBanner className="mt-4" title={t('fanCardSection.t12')} variant="success">
                   {t('fanCardSection.t13')} </AlertBanner>
              ) : null}

              <div className={`mt-6 grid gap-3 ${selectedText ? 'sm:grid-cols-2' : ''}`}>
                {/* 문구 저장 API는 문구가 있어야 하므로, 문구 없이 만든 카드는 내려받기만 제공한다. */}
                {selectedText ? (
                  <Button loading={saving} onClick={() => void handleSave()} size="lg">
                    {savedText ? t('fanCardSection.t14') : t('fanCardSection.t15')}
                  </Button>
                ) : null}
                <Button onClick={() => void handleDownload()} size="lg" variant="secondary">
                   {t('fanCardSection.t16')} </Button>
              </div>

              {selectedText ? null : (
                <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                  {t('fanCardSection.t18')}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
