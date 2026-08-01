/** 백엔드 공통 성공 응답 래퍼다. (backend common/api/ApiResponse.java) */
export type ApiEnvelope<T> = {
  success: boolean
  data: T
}

/** 백엔드 공통 페이지 응답이다. (backend common/api/PageResponse.java) */
export type PageResponse<T> = {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** ApiResponse 래퍼가 있으면 data를 꺼내고 없으면 값을 그대로 반환한다. */
export function unwrapEnvelope<T>(value: unknown): T {
  if (value === null || value === undefined) {
    throw new TypeError('API 응답 형식이 올바르지 않습니다.')
  }

  return (isRecord(value) && 'data' in value ? value.data : value) as T
}

/** 정의된 값만 골라 쿼리스트링을 만든다. 값이 없으면 빈 문자열을 반환한다. */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }

  return search.size ? `?${search.toString()}` : ''
}
