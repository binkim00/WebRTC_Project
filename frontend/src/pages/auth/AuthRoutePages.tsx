import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  RadioGroup,
  Select,
  TextField,
} from '../../components'
import type { UserRole } from '../../types/user'

const languageOptions = [
  { label: '한국어', value: 'ko' },
  { label: 'English', value: 'en' },
] as const

const roleOptions = [
  {
    label: '팬',
    value: 'fan',
  },
  {
    label: '인플루언서',
    value: 'influencer',
  },
  {
    label: '매니저',
    value: 'manager',
  },
] as const

const roleLabels: Record<UserRole, string> = {
  fan: '팬',
  influencer: '인플루언서',
  manager: '매니저',
}

function isUserRole(value: string): value is UserRole {
  return value === 'fan' || value === 'influencer' || value === 'manager'
}

export function LoginPage() {
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <Card className="mx-auto max-w-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-br from-violet-50 to-white">
        <Badge variant="primary">CM-001</Badge>
        <CardTitle as="h1" className="mt-4 text-2xl">
          로그인
        </CardTitle>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          MELLY의 역할별 화면으로 이동하려면 계정 정보를 입력해 주세요.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6">
        {submitted ? (
          <AlertBanner title="인증 연결 대기 중" variant="info">
            입력 형식은 확인했습니다. 현재는 인증 API가 연결되지 않아 실제 로그인 요청은
            전송하지 않습니다.
          </AlertBanner>
        ) : null}
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <TextField
            autoComplete="email"
            label="이메일"
            name="email"
            placeholder="name@example.com"
            required
            type="email"
          />
          <TextField
            autoComplete="current-password"
            label="비밀번호"
            minLength={8}
            name="password"
            placeholder="8자 이상 입력"
            required
            type="password"
          />
          <Checkbox label="로그인 상태 유지" name="remember" />
          <Button className="w-full" size="lg" type="submit">
            로그인
          </Button>
        </form>
        <p className="text-center text-sm text-slate-600">
          아직 계정이 없나요?{' '}
          <Link className="font-semibold text-violet-700 hover:underline" to="/signup">
            회원가입
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export function SignupPage() {
  const [passwordError, setPasswordError] = useState<string>()
  const [submitted, setSubmitted] = useState(false)
  const [role, setRole] = useState<UserRole>('fan')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const password = String(formData.get('password') ?? '')
    const passwordConfirm = String(formData.get('passwordConfirm') ?? '')

    if (password !== passwordConfirm) {
      setPasswordError('비밀번호와 비밀번호 확인이 일치하지 않습니다.')
      setSubmitted(false)
      return
    }

    setPasswordError(undefined)
    setSubmitted(true)
  }

  return (
    <Card className="mx-auto max-w-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-br from-violet-50 to-white">
        <Badge variant="primary">CM-002</Badge>
        <CardTitle as="h1" className="mt-4 text-2xl">
          회원가입
        </CardTitle>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          기본 정보를 입력해 MELLY 계정 생성을 준비해 주세요.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6">
        {submitted ? (
          <AlertBanner title="가입 정보 확인 완료" variant="info">
            {roleLabels[role]} 역할로 입력값의 형식을 확인했습니다. 회원가입 정책과 API가
            확정되면 이 폼에서 실제 계정 생성 요청을 연결할 수 있습니다.
          </AlertBanner>
        ) : null}
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <TextField
            autoComplete="name"
            label="이름"
            name="name"
            placeholder="이름 입력"
            required
          />
          <TextField
            autoComplete="email"
            label="이메일"
            name="email"
            placeholder="name@example.com"
            required
            type="email"
          />
          <Select
            defaultValue="ko"
            label="언어"
            name="language"
            options={languageOptions}
            required
          />
          <TextField
            autoComplete="new-password"
            helperText="8자 이상 입력해 주세요."
            label="비밀번호"
            minLength={8}
            name="password"
            required
            type="password"
          />
          <TextField
            autoComplete="new-password"
            error={passwordError}
            label="비밀번호 확인"
            minLength={8}
            name="passwordConfirm"
            required
            type="password"
          />
          <RadioGroup
            appearance="button"
            legend="가입 역할"
            name="role"
            onValueChange={(value) => {
              if (isUserRole(value)) {
                setRole(value)
              }
            }}
            options={roleOptions}
            required
            value={role}
          />
          <Checkbox
            description="세부 약관 화면은 현재 라우팅 정의에 포함되어 있지 않습니다."
            label="서비스 이용 조건에 동의합니다."
            name="terms"
            required
          />
          <Button className="w-full" size="lg" type="submit">
            회원가입
          </Button>
        </form>
        <p className="text-center text-sm text-slate-600">
          이미 계정이 있나요?{' '}
          <Link className="font-semibold text-violet-700 hover:underline" to="/login">
            로그인
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
