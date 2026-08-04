/**
 * 현재 서비스에서 사용할 기능 플래그다.
 *
 * 이메일 인증 관련 API·화면 코드는 유지하되 기본값을 꺼 두어,
 * 추후 환경변수만 변경하면 기존 기능을 다시 활성화할 수 있다.
 */
export const isEmailVerificationEnabled =
  import.meta.env.VITE_ENABLE_EMAIL_VERIFICATION === 'true'
