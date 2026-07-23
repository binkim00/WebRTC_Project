import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

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
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <p className="text-sm font-semibold text-amber-700">잘못된 라우트 상태</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-3 text-slate-700">{message}</p>
      <Link
        className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        to="/"
      >
        메인으로 이동
      </Link>
    </section>
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
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-700">{screenId}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-3 max-w-3xl text-slate-600">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          라우팅 구현 화면
        </span>
      </div>

      {visibleParams.length > 0 ? (
        <dl className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          {visibleParams.map(([name, value]) => (
            <div key={name}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{name}</dt>
              <dd className="mt-1 break-all font-mono text-sm text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {children ? <div className="mt-6">{children}</div> : null}

      <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500">
        현재 단계에서는 URL 연결을 검증하는 최소 화면만 제공합니다. 실제 데이터와 업무 UI는 API와
        디자인이 확정된 뒤 연결합니다.
      </p>
    </article>
  )
}
