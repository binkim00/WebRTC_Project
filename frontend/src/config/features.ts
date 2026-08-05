/**
 * 현재 서비스에서 사용할 기능 플래그다.
 *
 * 이메일 인증은 기본적으로 켜 두고, 특정 환경에서만 끄고 싶을 때
 * VITE_ENABLE_EMAIL_VERIFICATION=false 로 명시한다. Docker 빌드처럼 환경변수가
 * 전달되지 않는 경우에도 기능이 살아 있어야 하므로 기본값을 활성으로 둔다.
 */
export const isEmailVerificationEnabled =
  import.meta.env.VITE_ENABLE_EMAIL_VERIFICATION !== 'false'
