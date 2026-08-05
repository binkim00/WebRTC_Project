/** 통화 중 팬이 셔터로 찍어 둔 기념 카드용 사진이다. */
export type CapturedPhotos = {
  callSessionId: string
  /** image/png Blob이며 찍은 순서대로 담는다. */
  photos: Blob[]
  /** 마지막으로 찍은 시각 (ISO) */
  capturedAt: string
}

/**
 * 통화 한 번에 남길 수 있는 최대 사진 수다.
 *
 * <p>카드 한 장에 들어가는 수(네컷 기준 4장)보다 넉넉히 잡아, 팬이 여러 장을 찍어 두고
 * 완료 화면에서 마음에 드는 것만 고를 수 있게 한다.
 */
export const MAX_CAPTURED_PHOTOS = 8

/** 카드 한 장에 들어가는 사진 수의 상한이다. 네컷 계열이 이만큼 쓴다. */
export const MAX_PHOTOS_PER_CARD = 4

// 녹화 복구용 DB(melly-recording-recovery)와 분리한다. 같은 DB에 스토어를 추가하면 버전을
// 올려야 하고, 이미 사용자 브라우저에 남아 있는 미전송 녹화가 업그레이드 실패에 휘말릴 수 있다.
const DATABASE_NAME = 'melly-fan-card-photos'
const DATABASE_VERSION = 1
const STORE_NAME = 'captured-photos'

/**
 * 사진 보관용 IndexedDB를 연다.
 *
 * @returns 열린 데이터베이스
 * @throws Error IndexedDB를 지원하지 않거나 저장소를 열지 못한 경우
 */
function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('이 브라우저는 통화 사진 보관을 지원하지 않습니다.'))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'callSessionId' })
      }
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('통화 사진 저장소를 열지 못했습니다.')),
      { once: true },
    )
  })
}

/**
 * 사진 스토어에 요청 하나를 실행하고 결과를 돌려준다.
 *
 * @param mode 트랜잭션 모드
 * @param operation 스토어에 실행할 요청
 * @returns 요청 결과
 * @throws Error 요청이 실패한 경우
 */
function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode)
        const request = operation(transaction.objectStore(STORE_NAME))

        request.addEventListener('success', () => resolve(request.result), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('통화 사진 저장소 요청에 실패했습니다.')),
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
  return runRequest('readwrite', (store) => store.put(captured))
}

/**
 * 통화 세션에 보관된 사진 묶음을 찾는다.
 *
 * 통화 화면을 떠난 뒤 완료 화면에서 카드를 만들 때 쓴다.
 *
 * @param callSessionId 찾을 통화 세션 식별자
 * @returns 보관된 사진 묶음이며, 찍은 사진이 없으면 undefined
 */
export function getCapturedPhotos(
  callSessionId: string,
): Promise<CapturedPhotos | undefined> {
  return runRequest<CapturedPhotos | undefined>(
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
  return runRequest('readwrite', (store) => store.delete(callSessionId))
}
