import { apiRequest } from './client'
import { unwrapEnvelope } from './envelope'
import { translate } from '../i18n'

/** 백엔드 AiCallSummaryStatus enum과 같은 값이다. */
export type AiCallSummaryStatus = 'GENERATING' | 'COMPLETED' | 'FAILED'

/** 생성이 끝난 통화 요약이다. */
export type AiCallSummary = {
  callSummaryId: number
  callSessionId: number
  summary: string
  /** 백엔드가 JSON 배열 형태의 문자열로 내려준다. 표시용으로는 parseSummaryKeywords를 쓴다. */
  keywords: string | null
  createdAt: string
}

/**
 * 요약 조회 결과다.
 *
 * 백엔드는 완료 시 200, 생성 중이면 202를 주지만 apiRequest가 상태 코드를 노출하지 않으므로
 * 본문 형태로 구분한다. 두 응답의 필드가 겹치지 않아 판별이 모호하지 않다.
 */
export type AiCallSummaryResult =
  | { state: 'COMPLETED'; summary: AiCallSummary }
  | { state: 'GENERATING'; message: string }

/** 응답 본문을 필드 단위로 살펴보기 전에 객체인지 좁힌다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * keywords 문자열을 화면에 뿌릴 배열로 바꾼다.
 *
 * JSON 배열이 아니면 쉼표 구분 문자열로 간주하고, 그래도 못 읽으면 빈 배열을 준다.
 */
export function parseSummaryKeywords(keywords: string | null): string[] {
  if (!keywords?.trim()) return []

  try {
    const parsed: unknown = JSON.parse(keywords)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean)
    }
  } catch {
    // JSON이 아니면 아래 쉼표 분리로 넘어간다.
  }

  return keywords
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 통화 세션의 AI 요약을 조회한다. (인플루언서·운영자 전용) */
export async function getCallSummary(
  callSessionId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<AiCallSummaryResult> {
  const response = await apiRequest<unknown>(
    `/api/v1/call-sessions/${encodeURIComponent(String(callSessionId))}/summary`,
    { method: 'GET', authToken, signal },
  )

  const data = unwrapEnvelope<unknown>(response)
  if (isRecord(data) && data.status === 'GENERATING') {
    return {
      state: 'GENERATING',
      message: typeof data.message === 'string' ? data.message : translate('aiSummaries.t1'),
    }
  }

  return { state: 'COMPLETED', summary: data as AiCallSummary }
}
