import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  getApplicants,
  getApplicationStatistics,
  type ApplicantListResponse,
  type ApplicantResponse,
  type ApplicationStatisticsResponse,
  type ApplicationStatus,
} from '../../api/applications'
import { getAuthSession } from '../../api/authSession'
import { AlertBanner, Button, Pagination, Spinner, TextField } from '../../components'
import { toErrorMessage } from './meetingLifecycle'
import { useTranslation } from '../../i18n'

const applicationStatusContent: Record<
  ApplicationStatus,
  { label: string; className: string }
> = {
  SUBMITTED: { label: '미검토', className: 'text-[var(--color-text-secondary)]' },
  WITHDRAWN: { label: '응모 철회', className: 'text-[var(--color-text-secondary)]' },
  SELECTED: { label: '선정', className: 'text-[var(--color-success)]' },
  NOT_SELECTED: { label: '미선정', className: 'text-[var(--color-error)]' },
}

function firstAnswer(applicant?: ApplicantResponse): string {
  return applicant?.answers[0]?.answerText ?? '-'
}

/** 실제 응모·추첨 API를 프로토타입의 목록과 상세 분할 화면으로 표시한다. */
export function ManagerApplicantsPanel({
  meetingId,
  meetingTitle,
  capacity,
  canDraw,
  canPublishResults,
  drawCompleted,
  meetingStatus,
  onDraw,
  onPublishResults,
  refreshToken = 0,
}: {
  meetingId: string
  meetingTitle: string
  capacity: number
  canDraw: boolean
  canPublishResults: boolean
  drawCompleted: boolean
  meetingStatus: string
  onDraw: () => void
  onPublishResults: () => void
  refreshToken?: number
}) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<ApplicationStatisticsResponse>()
  const [list, setList] = useState<ApplicantListResponse>()
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | ''>('')
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<number>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const loadApplicants = useCallback(async () => {
    const token = getAuthSession()?.accessToken
    if (!meetingId) {
      setError('팬미팅 정보를 확인할 수 없습니다.')
      setLoading(false)
      return
    }
    if (!token) {
      setError('응모자 목록을 확인하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [applicants, statistics] = await Promise.all([
        getApplicants(
          meetingId,
          {
            applicationStatus: statusFilter || undefined,
            keyword: appliedKeyword || undefined,
            page,
            size: 10,
          },
          token,
        ),
        getApplicationStatistics(meetingId, token),
      ])
      setList(applicants)
      setStats(statistics)
      setError(undefined)
    } catch (cause) {
      setError(toErrorMessage(cause, '응모자 목록을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }, [appliedKeyword, meetingId, page, statusFilter])

  useEffect(() => {
    void loadApplicants()
  }, [loadApplicants, refreshToken])

  const selectedApplicant =
    list?.content.find((applicant) => applicant.applicationId === selectedId) ??
    list?.content[0]
  const selectedStatus = selectedApplicant
    ? applicationStatusContent[selectedApplicant.applicationStatus]
    : undefined
  const unreviewedCount = stats?.submittedCount ?? 0
  const headLine = drawCompleted
    ? canPublishResults
      ? '선정 완료 · 확정 대기'
      : '선정 확정 완료'
    : `선정 전 ${unreviewedCount}명`
  const headColor = drawCompleted
    ? 'text-[var(--color-success)]'
    : 'text-[var(--color-warning)]'
  const hasApplications = (stats?.totalApplications ?? 0) > 0
  const canRunDraw = canDraw && hasApplications

  const drawDisabledReason = drawCompleted
    ? '랜덤 선정이 이미 완료되었습니다.'
    : !hasApplications
      ? '응모자가 없어 랜덤 선정을 진행할 수 없습니다.'
    : meetingStatus !== 'APPLICATION_CLOSED'
      ? '응모가 마감된 뒤 랜덤 선정을 진행할 수 있습니다.'
      : '지금은 랜덤 선정을 진행할 수 없습니다.'
  const confirmHint = canPublishResults
    ? '확정하면 되돌릴 수 없고 선정 결과가 응모자에게 발송됩니다.'
    : drawCompleted
      ? '선정 결과가 이미 확정되었습니다.'
      : '랜덤 선정을 먼저 완료해야 선정 결과를 확정할 수 있습니다.'

  function applyStatusFilter(next: ApplicationStatus | '') {
    setStatusFilter(next)
    setPage(0)
    setSelectedId(undefined)
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedKeyword(keyword.trim())
    setPage(0)
    setSelectedId(undefined)
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <AlertBanner title={t('managerApplicantsPanel.t1')} variant="error">
          {error}
        </AlertBanner>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black tracking-[-0.035em]">{t('managerApplicantsPanel.t2')}</h2>
          <p className="mt-2 text-sm font-medium text-[var(--color-text-secondary)]">
            {meetingTitle} {t('managerApplicantsPanel.t3')} {capacity}{t('managerApplicantsPanel.t4')}
          </p>
        </div>
        <p className={`whitespace-nowrap text-sm font-bold ${headColor}`}>
          {headLine}
        </p>
      </div>

      <section
        aria-label={t('managerApplicantsPanel.t5')}
        className="grid grid-cols-2 border-y border-[var(--color-divider)] sm:grid-cols-4"
      >
        <MetricFilter
          active={statusFilter === ''}
          label={t('managerApplicantsPanel.t6')}
          onClick={() => applyStatusFilter('')}
          value={stats?.totalApplications}
        />
        <MetricFilter
          active={statusFilter === 'SELECTED'}
          className="border-l border-[var(--color-divider)]"
          label={t('managerApplicantsPanel.t7')}
          onClick={() => applyStatusFilter('SELECTED')}
          tone="success"
          value={stats?.selectedCount}
        />
        <MetricFilter
          active={statusFilter === 'NOT_SELECTED'}
          className="border-t border-[var(--color-divider)] sm:border-l sm:border-t-0"
          label={t('managerApplicantsPanel.t8')}
          onClick={() => applyStatusFilter('NOT_SELECTED')}
          tone="error"
          value={stats?.notSelectedCount}
        />
        <MetricFilter
          active={statusFilter === 'SUBMITTED'}
          className="border-l border-t border-[var(--color-divider)] sm:border-t-0"
          label={t('managerApplicantsPanel.t9')}
          onClick={() => applyStatusFilter('SUBMITTED')}
          value={stats?.submittedCount}
        />
      </section>

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
        <div className="min-w-0">
          <form className="flex items-end gap-3" onSubmit={handleSearch} role="search">
            <TextField
              containerClassName="min-w-0 flex-1"
              label={t('managerApplicantsPanel.t10')}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('managerApplicantsPanel.t11')}
              type="search"
              value={keyword}
            />
            <Button
              disabled={!canRunDraw}
              onClick={onDraw}
              title={!canRunDraw ? drawDisabledReason : undefined}
              type="button"
              variant="outline"
            >
              {t('managerApplicantsPanel.t12')}
            </Button>
          </form>
          {!canRunDraw ? (
            <p className="mt-2 text-sm font-medium text-[var(--color-text-secondary)]">
              {drawDisabledReason}
            </p>
          ) : null}

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Spinner label={t('managerApplicantsPanel.t13')} />
            </div>
          ) : (
            <div className="mt-5" role="table" aria-label={t('managerApplicantsPanel.t14')}>
              <div
                className="hidden grid-cols-[150px_minmax(0,1fr)_90px] gap-4 border-b border-[var(--color-border-control)] pb-3 sm:grid"
                role="row"
              >
                <span className="text-sm font-bold text-[var(--color-text-secondary)]" role="columnheader">{t('managerApplicantsPanel.t15')}</span>
                <span className="text-sm font-bold text-[var(--color-text-secondary)]" role="columnheader">{t('managerApplicantsPanel.t16')}</span>
                <span className="text-right text-sm font-bold text-[var(--color-text-secondary)]" role="columnheader">{t('managerApplicantsPanel.t17')}</span>
              </div>
              {list?.content.map((applicant) => {
                const status = applicationStatusContent[applicant.applicationStatus]
                const selected = selectedApplicant?.applicationId === applicant.applicationId
                return (
                  <button
                    aria-current={selected ? 'true' : undefined}
                    className={`grid w-full gap-2 border-b border-[var(--color-border-row)] px-2 py-4 text-left transition-colors hover:bg-[var(--color-surface-page)] sm:grid-cols-[150px_minmax(0,1fr)_90px] sm:items-center sm:gap-4 ${selected ? 'bg-[var(--color-surface-page)]' : ''}`}
                    key={applicant.applicationId}
                    onClick={() => setSelectedId(applicant.applicationId)}
                    role="row"
                    type="button"
                  >
                    <span className={`text-base ${selected ? 'font-extrabold' : 'font-semibold'}`} role="cell">
                      {applicant.nickname}
                    </span>
                    <span className="truncate text-sm font-medium text-[var(--color-text-secondary)]" role="cell">
                      {firstAnswer(applicant)}
                    </span>
                    <span className={`whitespace-nowrap text-right text-sm font-extrabold ${status.className}`} role="cell">
                      {status.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <Pagination
            className="mt-6"
            currentPage={page + 1}
            onPageChange={(next) => {
              setPage(next - 1)
              setSelectedId(undefined)
            }}
            totalPages={Math.max(1, list?.totalPages ?? 1)}
          />
        </div>

        <aside
          aria-label={t('managerApplicantsPanel.t18')}
          className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-divider)] p-5"
        >
          <p className="text-sm font-bold text-[var(--color-text-secondary)]">{t('managerApplicantsPanel.t19')}</p>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <h3 className="text-xl font-black tracking-[-0.032em]">
              {selectedApplicant?.nickname ?? '-'}
            </h3>
            <span className={`whitespace-nowrap text-sm font-extrabold ${selectedStatus?.className ?? 'text-[var(--color-text-secondary)]'}`}>
              {selectedStatus?.label ?? '-'}
            </span>
          </div>

          <section className="mt-5 border-t border-[var(--color-divider)] pt-4">
            <h4 className="text-sm font-extrabold">{t('managerApplicantsPanel.t20')}</h4>
            <div className="mt-3 grid gap-4">
              {selectedApplicant?.answers.length ? (
                selectedApplicant.answers.map((answer) => (
                  <div key={answer.questionId}>
                    <p className="text-sm font-bold text-[var(--color-text-secondary)]">
                      {answer.questionText}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-base font-medium leading-7 text-[var(--color-text-body)]">
                      {answer.answerText}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-base font-medium text-[var(--color-text-body)]">-</p>
              )}
            </div>
          </section>

          <div className="mt-5 border-t border-[var(--color-divider)] pt-5">
            <Button
              className="w-full"
              disabled={!canPublishResults}
              onClick={onPublishResults}
              title={!canPublishResults ? confirmHint : undefined}
            >
              {drawCompleted && !canPublishResults ? '선정 확정 완료' : '선정 확정'}
            </Button>
            <p className="mt-3 text-sm font-medium leading-6 text-[var(--color-text-secondary)]">
              {confirmHint}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function MetricFilter({
  label,
  value,
  active,
  onClick,
  className = '',
  tone = 'default',
}: {
  label: string
  value?: number
  active: boolean
  onClick: () => void
  className?: string
  tone?: 'default' | 'success' | 'error'
}) {
  const valueClass = tone === 'success'
    ? 'text-[var(--color-success)]'
    : tone === 'error'
      ? 'text-[var(--color-error)]'
      : 'text-[var(--color-text-primary)]'

  return (
    <button
      aria-pressed={active}
      className={`min-w-0 px-5 py-4 text-left transition-colors hover:bg-[var(--color-surface-page)] ${active ? 'bg-[var(--color-surface-page)]' : ''} ${className}`}
      onClick={onClick}
      type="button"
    >
      <span className="block text-sm font-bold text-[var(--color-text-secondary)]">{label}</span>
      <span className={`mt-2 block text-2xl font-black tabular-nums ${valueClass}`}>
        {value == null ? '-' : `${value}명`}
      </span>
    </button>
  )
}
