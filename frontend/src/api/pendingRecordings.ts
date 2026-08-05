import { translate } from '../i18n'
/** 업로드 실패 뒤 브라우저에 임시 보관하는 녹화 데이터다. */
export type PendingRecording = {
  callSessionId: string
  /** 완료 화면에서 새로고침 후에도 복구할 수 있도록 팬미팅 ID를 함께 보관한다. */
  meetingId?: string
  blob: Blob
  durationSec: number | null
  savedAt: number
}

const DATABASE_NAME = 'melly-recording-recovery'
const DATABASE_VERSION = 1
const STORE_NAME = 'pending-recordings'

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error(translate('pendingRecordings.t1')))
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
      () => reject(request.error ?? new Error(translate('pendingRecordings.t2'))),
      { once: true },
    )
  })
}

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
          () => reject(request.error ?? new Error(translate('pendingRecordings.t3'))),
          { once: true },
        )
        transaction.addEventListener('complete', () => database.close(), { once: true })
        transaction.addEventListener('abort', () => database.close(), { once: true })
        transaction.addEventListener('error', () => database.close(), { once: true })
      }),
  )
}

/** 업로드가 끝나기 전 녹화 Blob을 IndexedDB에 보관한다. */
export function savePendingRecording(recording: PendingRecording): Promise<IDBValidKey> {
  return runRequest('readwrite', (store) => store.put(recording))
}

/** 새로고침 뒤에도 같은 통화 세션의 미전송 녹화를 복구한다. */
export async function getPendingRecording(
  callSessionId: string,
): Promise<PendingRecording | undefined> {
  const result = await runRequest<PendingRecording | undefined>(
    'readonly',
    (store) => store.get(callSessionId),
  )
  return result
}

/** 같은 팬미팅에 남아 있는 가장 최근 미전송 녹화를 찾는다. */
export async function findPendingRecordingByMeeting(
  meetingId: string,
): Promise<PendingRecording | undefined> {
  const recordings = await runRequest<PendingRecording[]>(
    'readonly',
    (store) => store.getAll(),
  )
  return recordings
    .filter((recording) => recording.meetingId === meetingId)
    .sort((first, second) => second.savedAt - first.savedAt)[0]
}

/** 서버 업로드가 확인된 데이터만 브라우저 임시 저장소에서 제거한다. */
export function deletePendingRecording(callSessionId: string): Promise<undefined> {
  return runRequest('readwrite', (store) => store.delete(callSessionId))
}
