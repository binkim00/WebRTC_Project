import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { AlertBanner, Badge, Card, CardContent, CardHeader, CardTitle } from '../../components'
import { useTranslation } from '../../i18n'

type ErrorPageShellProps = {
  code: string
  title: string
  description: string
}

function ErrorPageShell({ code, title, description }: ErrorPageShellProps) {
  const { t } = useTranslation()
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
        <AlertBanner title={t('errorRoutePages.t1')} variant="error">
          {description}
        </AlertBanner>
        <Link
          className="mt-6 inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          to="/"
        >
          {t('errorRoutePages.t2')}
        </Link>
      </CardContent>
    </Card>
  )
}

export function ForbiddenPage() {
  const { t } = useTranslation()
  return (
    <ErrorPageShell
      code="403"
      description={t('errorRoutePages.t3')}
      title={t('errorRoutePages.t4')}
    />
  )
}

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <ErrorPageShell
      code="404"
      description={t('errorRoutePages.t5')}
      title={t('errorRoutePages.t6')}
    />
  )
}

export function RouterErrorPage() {
  const { t } = useTranslation()
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    return (
      <ErrorPageShell
        code={String(error.status)}
        description={error.statusText || t('errorRoutePages.t9')}
        title={t('errorRoutePages.t7')}
      />
    )
  }

  const description =
    error instanceof Error ? error.message : t('errorRoutePages.t10')

  return <ErrorPageShell code="ERROR" description={description} title={t('errorRoutePages.t8')} />
}
