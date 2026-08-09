import { ArrowLeft, ArrowRight, CalendarBlank } from '@phosphor-icons/react'
import { parseServerDate } from '../../api/serverTime'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  getAllMyApplications,
  type ApplicationStatus,
  type MyApplicationSummaryResponse,
} from '../../api/applications'
import {
  fetchPublicFanMeetingDetail,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import {
  AlertBanner,
  Badge,
  Card,
  CardContent,
  Pagination,
  Spinner,
} from '../../components'
import { translate, useTranslation } from '../../i18n'
import { hasRevealedApplicationResult } from './applicationResultReveal'

const PAGE_SIZE = 6

function isResultPublished(detail: PublicFanMeetingDetail | undefined): boolean {
  // 추첨 직후에는 응모 상태가 SELECTED/NOT_SELECTED로 바뀌지만,
  // 운영자가 결과를 공개하면 팬미팅 상태가 READY로 전환된다.
  return (
    detail?.meeting.status === 'READY' ||
    detail?.meeting.status === 'LIVE' ||
    detail?.meeting.status === 'ENDED'
  )
}

/**
 * 목록 카드에 표시하는 상태다.
 *
 * `RESULT_READY`는 서버 상태가 아니라 **결과가 나왔지만 팬이 아직 열어 보지 않은 상태**를 뜻하는
 * 화면 전용 값이다. 이 상태에서는 당첨·미당첨을 감추고 "결과 확인하기"로만 안내해, 결과 화면을
 * 열기 전에 목록에서 결과가 새어 나가지 않게 한다.
 */
type ApplicationCardStatus = ApplicationStatus | 'RESULT_READY'

type StatusFilter = 'all' | ApplicationCardStatus

function isStatusFilter(value: string | null): value is StatusFilter {
  return (
    value === 'all' ||
    value === 'SUBMITTED' ||
    value === 'RESULT_READY' ||
    value === 'SELECTED' ||
    value === 'NOT_SELECTED' ||
    value === 'WITHDRAWN'
  )
}

const statusFilterItems = (): { value: StatusFilter; label: string }[] => [
  { value: 'all', label: translate('fanApplicationsPage.t21') },
  { value: 'SUBMITTED', label: translate('fanApplicationsPage.t22') },
  { value: 'RESULT_READY', label: translate('fanApplicationsPage.resultReady') },
  { value: 'SELECTED', label: translate('fanApplicationsPage.t23') },
  { value: 'NOT_SELECTED', label: translate('fanApplicationsPage.t24') },
  { value: 'WITHDRAWN', label: translate('fanApplicationsPage.t25') },
]

const applicationStatusContent = (): Record<
  ApplicationCardStatus,
  { label: string; variant: 'success' | 'warning' | 'neutral' | 'primary' }
> => ({
  SUBMITTED: { label: translate('fanApplicationsPage.t26'), variant: 'warning' },
  RESULT_READY: {
    label: translate('fanApplicationsPage.resultReady'),
    variant: 'primary',
  },
  SELECTED: { label: translate('fanApplicationsPage.t27'), variant: 'success' },
  NOT_SELECTED: { label: translate('fanApplicationsPage.t28'), variant: 'neutral' },
  WITHDRAWN: { label: translate('fanApplicationsPage.t29'), variant: 'neutral' },
})

/**
 * 카드에 표시할 상태를 정한다.
 *
 * 결과가 확정된 응모(SELECTED·NOT_SELECTED)는 팬이 결과 화면에서 직접 확인하기 전까지
 * `RESULT_READY`로 다룬다. 그 밖의 상태는 서버 값을 그대로 쓴다.
 */
function toCardStatus(
  application: MyApplicationSummaryResponse,
  revealed: boolean,
): ApplicationCardStatus {
  const decided =
    application.applicationStatus === 'SELECTED' ||
    application.applicationStatus === 'NOT_SELECTED'
  return decided && !revealed ? 'RESULT_READY' : application.applicationStatus
}

function formatDateTime(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FanApplicationsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedStatus = searchParams.get('status')
  const statusFilter: StatusFilter = isStatusFilter(requestedStatus)
    ? requestedStatus
    : 'all'
  const [page, setPage] = useState(0)
  /** 카드에 그릴 응모와, 결과 노출 여부까지 반영한 표시 상태를 함께 들고 있는다. */
  const [applications, setApplications] = useState<
    { application: MyApplicationSummaryResponse; cardStatus: ApplicationCardStatus }[]
  >()
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    const session = getAuthSession()

    if (!session || session.role !== 'FAN') {
      setError(t('fanApplicationsPage.t19'))
      setApplications([])
      return () => controller.abort()
    }

    void getAllMyApplications({}, session.accessToken, controller.signal)
      .then(async (allApplications) => {
        const checkedApplications = await Promise.all(
          allApplications.map(async (application) => {
            if (
              application.applicationStatus !== 'SELECTED' &&
              application.applicationStatus !== 'NOT_SELECTED'
            ) {
              return { application, resultPublished: true }
            }

            try {
              const detail = await fetchPublicFanMeetingDetail(
                application.meetingId,
                session.accessToken,
                controller.signal,
              )
              return { application, resultPublished: isResultPublished(detail) }
            } catch (reason: unknown) {
              if (controller.signal.aborted) throw reason
              // 결과 공개 여부를 확인하지 못한 응모는 상태를 노출하지 않는다.
              return { application, resultPublished: false }
            }
          }),
        )
        // 결과를 확인했는지는 계정별로 이 브라우저에 기록되어 있다. 카드 상태와 탭 필터가
        // 같은 기준을 쓰도록 여기서 한 번만 계산해 카드까지 그대로 들고 간다.
        const filteredApplications = checkedApplications
          .filter(({ resultPublished }) => resultPublished)
          .map(({ application }) => ({
            application,
            cardStatus: toCardStatus(
              application,
              hasRevealedApplicationResult(session.userId, application.meetingId),
            ),
          }))
          .filter(
            ({ cardStatus }) => statusFilter === 'all' || cardStatus === statusFilter,
          )
        const nextTotalPages = Math.max(1, Math.ceil(filteredApplications.length / PAGE_SIZE))
        const nextPage = Math.min(page, nextTotalPages - 1)

        setApplications(filteredApplications.slice(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE))
        setTotalPages(nextTotalPages)
        setTotalElements(filteredApplications.length)
        if (nextPage !== page) setPage(nextPage)
        setError(undefined)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : t('fanApplicationsPage.t20'),
        )
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page])

  const isLoading = applications === undefined && !error

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      <header>
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary-coral)]"
          to="/fan/mypage/profile"
        >
          <ArrowLeft aria-hidden size={18} weight="bold" />
          {t('fanApplicationsPage.t1')}
        </Link>
        <h1 className="mt-5 text-4xl font-black tracking-[-0.045em]">{t('fanApplicationsPage.t2')}</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          {t('fanApplicationsPage.t3')}
        </p>
      </header>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-[-0.035em]">{t('fanApplicationsPage.t4')}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('fanApplicationsPage.t5')}
            </p>
          </div>
          <p className="text-sm font-bold text-[var(--color-text-secondary)]">
            {t('fanApplicationsPage.t6')} {totalElements}{t('fanApplicationsPage.t7')}
          </p>
        </div>

        <div aria-label={t('fanApplicationsPage.t8')} className="mt-6 flex flex-wrap gap-2" role="group">
          {statusFilterItems().map((item) => (
            <button
              aria-pressed={statusFilter === item.value}
              className={[
                'rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]',
                statusFilter === item.value
                  ? 'border-transparent bg-[var(--color-primary-coral)] text-white'
                  : 'border-[var(--color-border-control)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-page)]',
              ].join(' ')}
              key={item.value}
              onClick={() => {
                setSearchParams(item.value === 'all' ? {} : { status: item.value })
                setPage(0)
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {error ? (
          <AlertBanner className="mt-6" title={t('fanApplicationsPage.t9')} variant="error">
            {error}
          </AlertBanner>
        ) : null}

        {isLoading ? (
          <div className="flex justify-center py-24">
            <Spinner label={t('fanApplicationsPage.t10')} />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {(applications ?? []).map(({ application, cardStatus }) => {
                const statusContent = applicationStatusContent()[cardStatus]
                const resultDecided = application.resultDecidedAt !== null

                return (
                  <Card className="overflow-hidden" key={application.applicationId}>
                    <div className="relative">
                      {application.coverImageUrl ? (
                        <img
                          alt={t('fanApplicationsPage.t30', { p0: application.meetingTitle })}
                          className="aspect-[16/5.5] w-full object-cover"
                          decoding="async"
                          loading="lazy"
                          src={application.coverImageUrl}
                        />
                      ) : (
                        <div className="flex aspect-[16/5.5] w-full items-center justify-center bg-[var(--color-divider)] text-sm text-[var(--color-text-secondary)]">
                          {t('fanApplicationsPage.t11')}
                        </div>
                      )}
                      <Badge
                        className="absolute right-4 top-4"
                        variant={statusContent.variant}
                      >
                        {statusContent.label}
                      </Badge>
                    </div>

                    <CardContent>
                      <p className="text-xs font-bold text-[var(--color-primary-coral)]">
                        {t('fanApplicationsPage.t12')}
                      </p>
                      <h3 className="mt-2 text-xl font-black tracking-[-0.025em]">
                        {application.meetingTitle}
                      </h3>
                      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                        {t('fanApplicationsPage.t13')} {application.influencerName}
                      </p>

                      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-[var(--color-divider)] pt-5">
                        <div>
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-tertiary)]">
                            <CalendarBlank aria-hidden size={16} />
                            {t('fanApplicationsPage.t14')}
                          </p>
                          <p className="mt-1 text-sm font-bold">
                            {formatDateTime(application.scheduledStartAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                            to={`/fan/events/${application.meetingId}`}
                          >
                            {t('fanApplicationsPage.t15')}
                          </Link>
                          {/*
                            결과가 확정되면 언제든 결과 화면으로 갈 수 있게 한다.
                            이전에는 당첨·미당첨 탭에서만 이 버튼을 숨겨 결과 노출을 막으려 했는데,
                            그 탭 자체가 이미 결과를 알려 주고 있어 소용이 없었다. 지금은 확인 전
                            응모를 RESULT_READY로 따로 묶어 감추므로 버튼은 항상 열어 둔다.
                          */}
                          {resultDecided ? (
                            <Link
                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                              to={`/fan/events/${application.meetingId}/application-result`}
                            >
                              {t('fanApplicationsPage.t16')}
                              <ArrowRight aria-hidden size={18} weight="bold" />
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {(applications ?? []).length > 0 ? (
              <Pagination
                className="mt-8"
                currentPage={page + 1}
                onPageChange={(nextPage) => setPage(nextPage - 1)}
                totalPages={Math.max(1, totalPages)}
              />
            ) : !error ? (
              <div className="mt-6 rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-control)] px-6 py-16 text-center">
                <h3 className="font-bold">{t('fanApplicationsPage.t17')}</h3>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {t('fanApplicationsPage.t18')}
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
