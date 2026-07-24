import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../data-display/DataDisplay'
import { AlertBanner } from '../feedback/Feedback'

type ScreenPageProps = {
  screenId: string
  title: string
  description: string
  requiredParams?: readonly string[]
  children?: ReactNode
}

type InvalidRouteStateProps = {
  title: string
  message: string
}

export function InvalidRouteState({ title, message }: InvalidRouteStateProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-amber-50">
        <Badge variant="warning">잘못된 라우트 상태</Badge>
        <CardTitle as="h1" className="mt-3 text-2xl">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AlertBanner title="주소를 확인해 주세요" variant="warning">
          {message}
        </AlertBanner>
        <Link
          className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          to="/"
        >
          메인으로 이동
        </Link>
      </CardContent>
    </Card>
  )
}

export function ScreenPage({
  screenId,
  title,
  description,
  requiredParams = [],
  children,
}: ScreenPageProps) {
  const params = useParams()
  const missingParam = requiredParams.find((paramName) => !params[paramName]?.trim())

  if (missingParam) {
    return (
      <InvalidRouteState
        message={`URL에 필요한 ${missingParam} 값이 없습니다. 이전 화면에서 올바른 식별자를 사용해 다시 이동해 주세요.`}
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  const visibleParams = Object.entries(params).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-br from-violet-50 to-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="primary">{screenId}</Badge>
          <Badge>라우팅 구현 화면</Badge>
        </div>
        <CardTitle as="h1" className="mt-4 text-3xl tracking-tight">
          {title}
        </CardTitle>
        <p className="mt-3 max-w-3xl text-slate-600">{description}</p>
      </CardHeader>

      <CardContent className="grid gap-6">
        {visibleParams.length > 0 ? (
          <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            {visibleParams.map(([name, value]) => (
              <div key={name}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {name}
                </dt>
                <dd className="mt-1 break-all font-mono text-sm text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {children}

        <AlertBanner title="현재 구현 범위" variant="info">
          현재 단계에서는 URL 연결과 공통 화면 구조를 제공합니다. 실제 데이터와 업무 기능은 API와
          상세 디자인이 확정된 뒤 연결합니다.
        </AlertBanner>
      </CardContent>
    </Card>
  )
}
