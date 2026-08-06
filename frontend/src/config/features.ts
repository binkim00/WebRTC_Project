/**
 * 현재 서비스에서 사용할 기능 플래그다.
 *
 * 이메일 인증은 **기본 활성**이다. 끄고 싶은 환경에서만
 * `VITE_ENABLE_EMAIL_VERIFICATION=false`를 명시한다.
 *
 * 기본값을 활성으로 두는 이유: `.env`는 gitignore 대상이고 Dockerfile은 빌드 ARG로만
 * 값을 넘기므로, `=== 'true'` 조건이면 환경변수를 잊은 배포에서 기능이 조용히 꺼진다.
 * 반대로 두면 "명시적으로 끈 환경"만 꺼지므로 실수로 비활성화되는 일이 없다.
 */
export const isEmailVerificationEnabled =
  import.meta.env.VITE_ENABLE_EMAIL_VERIFICATION !== 'false'
