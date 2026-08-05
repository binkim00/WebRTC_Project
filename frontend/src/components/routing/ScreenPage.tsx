import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../data-display'
import { AlertBanner } from '../feedback'
import { useTranslation } from '../../i18n'

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
  const { t } = useTranslation()
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-amber-50">
        <Badge variant="warning">{t('screenPage.t1')}</Badge>
        <CardTitle as="h1" className="mt-3 text-2xl">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AlertBanner title={t('screenPage.t2')} variant="warning">
          {message}
        </AlertBanner>
        <Link
          className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          to="/"
        >
          {t('screenPage.t3')}
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
  const { t } = useTranslation()
  const params = useParams()
  const missingParam = requiredParams.find((paramName) => !params[paramName]?.trim())

  if (missingParam) {
    return (
      <InvalidRouteState
        message={t('screenPage.t8', { p0: missingParam })}
        title={t('screenPage.t4')}
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
          <Badge>{t('screenPage.t5')}</Badge>
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

        <AlertBanner title={t('screenPage.t6')} variant="info">
          {t('screenPage.t7')}
        </AlertBanner>
      </CardContent>
    </Card>
  )
}
