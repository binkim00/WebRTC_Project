import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

type ErrorPageShellProps = {
  code: string
  title: string
  description: string
}

function ErrorPageShell({ code, title, description }: ErrorPageShellProps) {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-bold uppercase tracking-widest text-violet-700">{code}</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-950">{title}</h1>
      <p className="mt-4 text-slate-600">{description}</p>
      <Link
        className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        to="/"
      >
        메인으로 이동
      </Link>
    </section>
  )
}

export function ForbiddenPage() {
  return (
    <ErrorPageShell
      code="403"
      description="현재 인증 상태로는 이 화면에 접근할 수 없습니다. 실제 역할 Guard는 인증 저장소가 추가된 뒤 연결합니다."
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
