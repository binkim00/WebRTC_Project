import { apiRequest } from './client'
import { unwrapEnvelope } from './envelope'

/**
 * 이메일 인증 발송·재발송 응답이다.
 *
 * 일시는 백엔드 LocalDateTime(KST) 문자열이다. devToken은 개발 프로파일에서
 * expose-link가 켜진 경우에만 내려오며 운영에서는 절대 채워지지 않는다.
 */
export type EmailVerificationSendResult = {
  email: string
  expiresAt: string
  resendAvailableAt: string
  devToken?: string | null
}

/** 현재 사용자의 이메일 인증 상태다. */
export type EmailVerificationStatus = {
  email: string
  emailVerified: boolean
  emailVerifiedAt: string | null
}

/**
 * 로그인한 사용자의 이메일로 인증 링크를 발송한다.
 *
 * 발송할 때마다 이전 링크는 무효가 된다. 이미 인증된 계정이면 409(EMAIL_ALREADY_VERIFIED),
 * 발송 빈도 제한에 걸리면 429(TOO_MANY_REQUESTS)를 돌려준다.
 */
export async function sendEmailVerification(
  authToken: string,
  signal?: AbortSignal,
): Promise<EmailVerificationSendResult> {
  const response = await apiRequest<unknown>('/api/v1/auth/email-verifications', {
    method: 'POST',
    authToken,
    signal,
  })

  return unwrapEnvelope<EmailVerificationSendResult>(response)
}

/** 인증 메일을 다시 보낸다. 발송과 동일한 규칙·응답을 쓰지만 서버 집계를 위해 경로를 구분한다. */
export async function resendEmailVerification(
  authToken: string,
  signal?: AbortSignal,
): Promise<EmailVerificationSendResult> {
  const response = await apiRequest<unknown>('/api/v1/auth/email-verifications/resend', {
    method: 'POST',
    authToken,
    signal,
  })

  return unwrapEnvelope<EmailVerificationSendResult>(response)
}

/**
 * 메일 링크의 토큰으로 이메일 인증을 완료한다.
 *
 * 백엔드는 만료·사용 완료·잘못된 토큰을 보안상 구분하지 않고 모두
 * 400(EMAIL_VERIFICATION_TOKEN_INVALID) 하나로 응답한다.
 */
export async function confirmEmailVerification(
  token: string,
  authToken?: string,
  signal?: AbortSignal,
): Promise<EmailVerificationStatus> {
  const response = await apiRequest<unknown>('/api/v1/auth/email-verifications/confirm', {
    method: 'POST',
    authToken,
    signal,
    body: JSON.stringify({ token }),
  })

  return unwrapEnvelope<EmailVerificationStatus>(response)
}

/** 현재 사용자의 이메일 인증 상태를 조회한다. */
export async function getEmailVerificationStatus(
  authToken: string,
  signal?: AbortSignal,
): Promise<EmailVerificationStatus> {
  const response = await apiRequest<unknown>('/api/v1/auth/email-verifications', {
    method: 'GET',
    authToken,
    signal,
  })

  return unwrapEnvelope<EmailVerificationStatus>(response)
}

/**
 * 이메일 주소를 mel***@example.com 형태로 마스킹한다.
 *
 * 로컬 파트 앞 최대 3자만 남기되, 전체가 드러나지 않도록 마지막 글자는 항상 가린다.
 * 로컬 파트가 한 글자면 남길 글자가 없어 전부 가린다(***@...).
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex <= 0) return email

  const localPart = email.slice(0, atIndex)
  const keptLength = Math.min(3, localPart.length - 1)
  return `${localPart.slice(0, keptLength)}***${email.slice(atIndex)}`
}
