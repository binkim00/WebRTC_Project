import { ApiError } from './ApiError'

const API_URL = import.meta.env.VITE_API_BASE_URL ?? ''

type ErrorResponse = {
  code?: string
  message?: string
}

async function readErrorResponse(response: Response): Promise<ErrorResponse> {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    const data: unknown = JSON.parse(text)

    if (typeof data !== 'object' || data === null) {
      return {}
    }

    const error = data as Record<string, unknown>

    return {
      code: typeof error.code === 'string' ? error.code : undefined,
      message: typeof error.message === 'string' ? error.message : undefined,
    }
  } catch {
    return {}
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await readErrorResponse(response)

    throw new ApiError(
      response.status,
      error.code ?? `HTTP_${response.status}`,
      error.message ?? 'API 요청에 실패했습니다.',
    )
  }

  return response.json() as Promise<T>
}
