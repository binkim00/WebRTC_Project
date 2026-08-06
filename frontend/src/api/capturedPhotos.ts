// 꾸미기 상태를 그대로 보관하려고 카드 렌더러의 타입을 빌려 쓴다. 타입 전용 참조라
// 런타임 의존은 생기지 않으며, 저장 형식과 그리는 형식이 어긋나는 것을 막아 준다.
import type {
  CardDecoration,
  FanCardFont,
  FanCardLayout,
  PhotoAdjustment,
} from '../components/fanCard/fanCardCanvas'
import { translate } from '../i18n'

/** 통화 중 팬이 셔터로 찍어 둔 기념 카드용 사진이다. */
export type CapturedPhotos = {
  callSessionId: string
  /** image/png Blob이며 찍은 순서대로 담는다. */
  photos: Blob[]
  /** 마지막으로 찍은 시각 (ISO) */
  capturedAt: string
}

/** 팬이 카드를 꾸미던 중간 상태다. 다시 들어와도 이어서 꾸밀 수 있게 보관한다. */
export type FanCardDraft = {
  callSessionId: string
  /** 고른 카드 모양이며 없으면 문구 전용이다. */
  layout?: FanCardLayout
  /** 고른 글꼴 */
  fontKey: FanCardFont
  /** 카드에 넣기로 한 사진의 위치 */
  selectedPhotoIndexes: number[]
  /** 얹어 둔 스티커와 글자 */
  decorations: CardDecoration[]
  /** 사진을 칸 안에서 옮기고 키운 값이며 예전 초안에는 없다. */
  photoAdjustments?: PhotoAdjustment[]
  /** 문구 크기 배율이며 예전 초안에는 없다. */
  quoteScale?: number
  /** 마지막으로 저장한 시각 (ISO) */
  savedAt: string
}

/**
 * 통화 한 번에 남길 수 있는 최대 사진 수다.
 *
 * <p>사진은 서버로 보내지 않고 이 브라우저에만 두므로 서버 용량과는 무관하다. 그래서
 * 카드 한 장에 들어가는 수(네컷 기준 4장)보다 훨씬 넉넉히 잡아, 마음껏 찍고 나중에
 * 고르게 한다. 기본 통화 시간 3분 기준으로 9초에 한 장 꼴이다.
 *
 * <p>이 수를 더 늘릴 때는 카드 화면이 고른 사진만 ImageBitmap 으로 푸는지 함께 확인해야
 * 한다. 전부 풀면 장당 4MB 가까이 메모리를 먹어 휴대폰에서 버겁다.
 */
export const MAX_CAPTURED_PHOTOS = 20

/** 카드 한 장에 들어가는 사진 수의 상한이다. 네컷 계열이 이만큼 쓴다. */
export const MAX_PHOTOS_PER_CARD = 4

/**
 * 사진과 꾸미던 상태를 브라우저에 두는 기간이다.
 *
 * <p>통화 화면은 팬과 인플루언서의 얼굴이 담기므로 오래 남겨 두지 않는다. 카드를 만들
 * 기회는 하루로 하고, 지나면 접근을 막고 실제로도 지운다.
 */
export const CARD_DATA_TTL_MS = 24 * 60 * 60 * 1000

// 녹화 복구용 DB(melly-recording-recovery)와 분리한다. 같은 DB에 스토어를 추가하면 버전을
// 올려야 하고, 이미 사용자 브라우저에 남아 있는 미전송 녹화가 업그레이드 실패에 휘말릴 수 있다.
const DATABASE_NAME = 'melly-fan-card-photos'
// 꾸미기 상태 스토어를 추가하며 2로 올렸다. 이미 v1을 쓰던 브라우저도 업그레이드로 이어진다.
const DATABASE_VERSION = 2
const PHOTO_STORE = 'captured-photos'
const DRAFT_STORE = 'card-drafts'

/**
 * 사진 보관용 IndexedDB를 연다.
 *
 * @returns 열린 데이터베이스
 * @throws Error IndexedDB를 지원하지 않거나 저장소를 열지 못한 경우
 */
function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error(translate('capturedPhotos.t1')))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      for (const store of [PHOTO_STORE, DRAFT_STORE]) {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store, { keyPath: 'callSessionId' })
        }
      }
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error(translate('capturedPhotos.t2'))),
      { once: true },
    )
  })
}

/**
 * 스토어 하나에 요청을 실행하고 결과를 돌려준다.
 *
 * @param storeName 대상 스토어 이름
 * @param mode 트랜잭션 모드
 * @param operation 스토어에 실행할 요청
 * @returns 요청 결과
 * @throws Error 요청이 실패한 경우
 */
function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(storeName, mode)
        const request = operation(transaction.objectStore(storeName))

        request.addEventListener('success', () => resolve(request.result), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error(translate('capturedPhotos.t3'))),
          { once: true },
        )
        transaction.addEventListener('complete', () => database.close(), { once: true })
        transaction.addEventListener('abort', () => database.close(), { once: true })
        transaction.addEventListener('error', () => database.close(), { once: true })
      }),
  )
}

/**
 * 통화 세션 하나의 사진 묶음을 저장한다. 같은 세션이면 통째로 덮어쓴다.
 *
 * @param captured 저장할 사진 묶음
 * @returns 저장된 키
 */
export function saveCapturedPhotos(captured: CapturedPhotos): Promise<IDBValidKey> {
  return runRequest(PHOTO_STORE, 'readwrite', (store) => store.put(captured))
}

/**
 * 통화 세션에 보관된 사진 묶음을 찾는다.
 *
 * 통화 화면을 떠난 뒤 카드 화면에서 카드를 만들 때 쓴다.
 *
 * @param callSessionId 찾을 통화 세션 식별자
 * @returns 보관된 사진 묶음이며, 찍은 사진이 없으면 undefined
 */
export function getCapturedPhotos(
  callSessionId: string,
): Promise<CapturedPhotos | undefined> {
  return runRequest<CapturedPhotos | undefined>(
    PHOTO_STORE,
    'readonly',
    (store) => store.get(callSessionId),
  )
}

/**
 * 통화 세션의 사진 묶음을 지운다.
 *
 * @param callSessionId 지울 통화 세션 식별자
 */
export function deleteCapturedPhotos(callSessionId: string): Promise<undefined> {
  return runRequest(PHOTO_STORE, 'readwrite', (store) => store.delete(callSessionId))
}

/**
 * 꾸미던 상태를 저장한다. 같은 세션이면 덮어쓴다.
 *
 * @param draft 저장할 꾸미기 상태
 * @returns 저장된 키
 */
export function saveFanCardDraft(draft: FanCardDraft): Promise<IDBValidKey> {
  return runRequest(DRAFT_STORE, 'readwrite', (store) => store.put(draft))
}

/**
 * 저장해 둔 꾸미기 상태를 찾는다.
 *
 * @param callSessionId 찾을 통화 세션 식별자
 * @returns 보관된 상태이며 없으면 undefined
 */
export function getFanCardDraft(callSessionId: string): Promise<FanCardDraft | undefined> {
  return runRequest<FanCardDraft | undefined>(
    DRAFT_STORE,
    'readonly',
    (store) => store.get(callSessionId),
  )
}

/**
 * 꾸미던 상태를 지운다.
 *
 * @param callSessionId 지울 통화 세션 식별자
 */
export function deleteFanCardDraft(callSessionId: string): Promise<undefined> {
  return runRequest(DRAFT_STORE, 'readwrite', (store) => store.delete(callSessionId))
}

/**
 * 통화 세션에 딸린 사진과 꾸미기 상태를 함께 지운다.
 *
 * @param callSessionId 지울 통화 세션 식별자
 */
export async function deleteFanCardData(callSessionId: string): Promise<void> {
  await Promise.all([
    deleteCapturedPhotos(callSessionId).catch(() => undefined),
    deleteFanCardDraft(callSessionId).catch(() => undefined),
  ])
}

/**
 * 보관 기간이 지난 사진과 꾸미기 상태를 모두 지운다.
 *
 * <p>브라우저가 꺼져 있는 동안에는 아무것도 실행되지 않으므로 정해진 시각에 저절로
 * 지워지지는 않는다. 그래서 팬이 앱에 들어올 때마다 한 번씩 훑어, 기기에 남는 기간이
 * 보관 기간에서 크게 벗어나지 않게 한다.
 *
 * @param nowMs 기준 시각이며 밀리초로 준다
 * @returns 지운 통화 세션 수
 */
export async function purgeExpiredFanCardData(nowMs: number): Promise<number> {
  const [photos, drafts] = await Promise.all([
    runRequest<CapturedPhotos[]>(PHOTO_STORE, 'readonly', (store) => store.getAll()),
    runRequest<FanCardDraft[]>(DRAFT_STORE, 'readonly', (store) => store.getAll()),
  ])

  const expired = new Set<string>()
  for (const photo of photos) {
    if (nowMs - new Date(photo.capturedAt).getTime() > CARD_DATA_TTL_MS) {
      expired.add(photo.callSessionId)
    }
  }
  for (const draft of drafts) {
    if (nowMs - new Date(draft.savedAt).getTime() > CARD_DATA_TTL_MS) {
      expired.add(draft.callSessionId)
    }
  }

  await Promise.all([...expired].map((callSessionId) => deleteFanCardData(callSessionId)))
  return expired.size
}
