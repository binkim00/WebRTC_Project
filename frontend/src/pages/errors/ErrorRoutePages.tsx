import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { AlertBanner, Badge, Card, CardContent, CardHeader, CardTitle } from '../../components'

type ErrorPageShellProps = {
  code: string
  title: string
  description: string
}

function ErrorPageShell({ code, title, description }: ErrorPageShellProps) {
  return (
    <Card className="mx-auto max-w-2xl overflow-hidden text-center">
      <CardHeader className="bg-gradient-to-br from-red-50 to-white">
        <Badge className="mx-auto" variant="danger">
          {code}
        </Badge>
        <CardTitle as="h1" className="mt-4 text-3xl">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AlertBanner title="요청한 화면을 표시할 수 없습니다" variant="error">
          {description}
        </AlertBanner>
        <Link
          className="mt-6 inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          to="/"
        >
          메인으로 이동
        </Link>
      </CardContent>
    </Card>
  )
}

export function ForbiddenPage() {
  return (
    <ErrorPageShell
      code="403"
      description="현재 로그인한 역할로는 이 화면에 접근할 수 없습니다."
      title="접근 권한이 없습니다"
    />
  )
}

export function NotFoundPage() {
  return (
    <ErrorPageShell
      code="404"
      description="정의되지 않은 주소이거나 더 이상 존재하지 않는 화면입니다."
      title="페이지를 찾을 수 없습니다"
    />
  )
}

export function RouterErrorPage() {
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    return (
      <ErrorPageShell
        code={String(error.status)}
        description={error.statusText || '라우트를 처리하는 중 오류가 발생했습니다.'}
        title="라우트 오류가 발생했습니다"
      />
    )
  }

  const description =
    error instanceof Error ? error.message : '알 수 없는 라우트 오류가 발생했습니다.'

  return <ErrorPageShell code="ERROR" description={description} title="화면을 표시할 수 없습니다" />
}
