import { Link } from 'react-router-dom'
import { ScreenPage } from '../../components/routing/ScreenPage'

export function LoginPage() {
  return (
    <ScreenPage
      description="인증 API가 아직 연결되지 않아 로그인 폼 대신 라우팅 진입점만 제공합니다."
      screenId="CM-001"
      title="로그인 화면"
    >
      <Link className="text-sm font-semibold text-violet-700 hover:underline" to="/signup">
        회원가입 화면으로 이동
      </Link>
    </ScreenPage>
  )
}

export function SignupPage() {
  return (
    <ScreenPage
      description="회원가입 정책과 API가 확정되기 전까지 라우팅 진입점만 제공합니다."
      screenId="CM-002"
      title="회원가입 화면"
    >
      <Link className="text-sm font-semibold text-violet-700 hover:underline" to="/login">
        로그인 화면으로 이동
      </Link>
    </ScreenPage>
  )
}
