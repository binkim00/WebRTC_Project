import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertBanner, Button, Pagination, Spinner, TextField } from '../../components'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  fetchMyMeetings,
  type ManagerMeetingSummary,
} from '../../api/managerMeetings'
import { translate, useTranslation } from '../../i18n'

const statusContent = (): Record<string, { label: string; className: string }> => ({
  DRAFT: { label: translate('influencerMeetingHistoryPage.t33'), className: 'text-[var(--color-text-secondary)]' },
  PUBLISHED: { label: translate('influencerMeetingHistoryPage.t34'), className: 'text-[var(--color-text-secondary)]' },
  APPLICATION_OPEN: { label: translate('influencerMeetingHistoryPage.t35'), className: 'text-[var(--color-primary-coral)]' },
  APPLICATION_CLOSED: { label: translate('influencerMeetingHistoryPage.t36'), className: 'text-[var(--color-text-secondary)]' },
  READY: { label: translate('influencerMeetingHistoryPage.t37'), className: 'text-[var(--color-warning)]' },
  LIVE: { label: translate('influencerMeetingHistoryPage.t38'), className: 'text-[var(--color-success)]' },
  ENDED: { label: translate('influencerMeetingHistoryPage.t39'), className: 'text-[var(--color-text-secondary)]' },
  CANCELED: { label: translate('influencerMeetingHistoryPage.t40'), className: 'text-[var(--color-error)]' },
})

const fallbackStatus = () => ({ label: translate('influencerMeetingHistoryPage.t41'), className: 'text-[var(--color-text-secondary)]' })

const PAGE_SIZE = 5
/** 이 화면에서만 팬미팅을 만드는 1인 인플루언서·매니저 전용 경로다. 소속 인플루언서가 열면 라우터가 403으로 보낸다. */
const NEW_MEETING_PATH = '/manager/fan-meetings/new'

function formatSchedule(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function errorMessage(reason: unknown) {
  return reason instanceof ApiError || reason instanceof TypeError
    ? reason.message
    : translate('influencerMeetingHistoryPage.t42')
}

function statusOf(meeting: ManagerMeetingSummary) {
  // 백엔드가 새 상태를 추가해도 배지 렌더링이 중단되지 않도록 안전한 기본값을 둔다.
  return statusContent()[meeting.status ?? 'ENDED'] ?? fallbackStatus()
}

export function InfluencerMeetingHistoryPage() {
  const { t } = useTranslation()
  const authSession = getAuthSession()
  const authToken = authSession?.accessToken
  // 팬미팅 상세 허브(/manager/fan-meetings/{id})는 관리 권한이 있는 1인 인플루언서만 열 수 있다.
  // 소속 인플루언서는 그 화면에 들어갈 권한이 없어 열면 라우터가 403으로 보내므로 버튼 자체를 숨긴다.
  const canOpenDetail = authSession?.role === 'SOLO_INFLUENCER'
  // Tailwind는 클래스 전체를 문자열 그대로 스캔해야 CSS를 생성한다. `md:${rowColumns}`처럼
  // 접두사와 변수를 런타임에 이어 붙이면 그 조합 문자열이 소스에 그대로 없어 스타일이 생성되지
  // 않는다(데스크톱에서도 모바일 2열로 보이던 원인). 두 분기 모두 완성된 리터럴로 둔다.
  const desktopColumns = canOpenDetail
    ? 'md:grid-cols-[minmax(0,1.6fr)_180px_90px_130px_130px_110px]'
    : 'md:grid-cols-[minmax(0,1.6fr)_180px_90px_130px_130px]'

  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [meetings, setMeetings] = useState<ManagerMeetingSummary[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()

  useEffect(() => {
    if (!authToken) {
      setLoadError(t('influencerMeetingHistoryPage.t17'))
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setLoadError(undefined)

    void fetchMyMeetings(
      { keyword, page: page - 1, size: PAGE_SIZE },
      authToken,
      controller.signal,
    )
      .then((result) => {
        setMeetings(result.content)
        setTotalPages(result.totalPages)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, keyword, page])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setKeyword(keywordInput.trim())
  }

  function resetSearch() {
    setKeywordInput('')
    setKeyword('')
    setPage(1)
  }

  const isEmpty = !loading && meetings.length === 0

  return (
    <div>
      <h1 className="text-[25px] font-black tracking-[-0.035em]">{t('influencerMeetingHistoryPage.t1')}</h1>
      <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-muted)]">
        {t('influencerMeetingHistoryPage.t2')}
      </p>

      <div className="mt-6 flex flex-col items-stretch gap-4 border-b border-[var(--color-divider)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <form
          className="flex max-w-[520px] flex-1 items-end gap-3"
          onSubmit={handleSearch}
          role="search"
        >
          <TextField
            containerClassName="min-w-0 flex-1"
            label={t('influencerMeetingHistoryPage.t3')}
            onChange={(event) => setKeywordInput(event.currentTarget.value)}
            placeholder={t('influencerMeetingHistoryPage.t4')}
            value={keywordInput}
          />
          <Button className="whitespace-nowrap" type="submit" variant="secondary">
            {t('influencerMeetingHistoryPage.t5')}
          </Button>
        </form>
        <Link
          className="mj-font-emphasis inline-flex min-h-11 items-center whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-5 text-[15px] text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
          to={NEW_MEETING_PATH}
        >
          {t('influencerMeetingHistoryPage.t6')}
        </Link>
      </div>

      {loadError ? (
        <AlertBanner className="mt-6" title={t('influencerMeetingHistoryPage.t7')} variant="error">
          {loadError}
        </AlertBanner>
      ) : null}

      {loading ? (
        <div className="flex min-h-72 items-center justify-center">
          <Spinner label={t('influencerMeetingHistoryPage.t8')} />
        </div>
      ) : isEmpty ? (
        <div className="grid place-items-center px-6 py-20 text-center" role="status">
          <strong className="text-xl font-extrabold tracking-[-0.03em]">
            {keyword ? t('influencerMeetingHistoryPage.t18') : t('influencerMeetingHistoryPage.t19')}
          </strong>
          <span className="mt-[9px] max-w-[420px] text-base font-medium leading-[1.6] text-[var(--color-text-muted)]">
            {keyword
              ? t('influencerMeetingHistoryPage.t20')
              : t('influencerMeetingHistoryPage.t21')}
          </span>
          {keyword ? (
            <Button className="mt-5" onClick={resetSearch} variant="secondary">
              {t('influencerMeetingHistoryPage.t9')}
            </Button>
          ) : (
            <Link
              className="mj-font-emphasis mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--color-primary-coral)] px-5 text-[15px] text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
              to={NEW_MEETING_PATH}
            >
              {t('influencerMeetingHistoryPage.t10')}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="mt-[22px]" role="table" aria-label={t('influencerMeetingHistoryPage.t11')}>
            <div
              className={`hidden ${desktopColumns} gap-[18px] border-b border-[var(--color-border-control)] pb-[11px] md:grid`}
              role="row"
            >
              {(canOpenDetail
                ? [t('influencerMeetingHistoryPage.t22'), t('influencerMeetingHistoryPage.t23'), t('influencerMeetingHistoryPage.t24'), t('influencerMeetingHistoryPage.t25'), t('influencerMeetingHistoryPage.t26'), t('influencerMeetingHistoryPage.t27')]
                : [t('influencerMeetingHistoryPage.t28'), t('influencerMeetingHistoryPage.t29'), t('influencerMeetingHistoryPage.t30'), t('influencerMeetingHistoryPage.t31'), t('influencerMeetingHistoryPage.t32')]
              ).map((label) => (
                <span
                  className="text-[13px] font-bold text-[var(--color-text-muted)]"
                  key={label}
                  role="columnheader"
                >
                  {label}
                </span>
              ))}
            </div>
            {meetings.map((meeting) => {
              const status = statusOf(meeting)
              const ended = (meeting.status ?? 'ENDED') === 'ENDED'

              return (
                <div
                  className={`grid grid-cols-2 items-center gap-2.5 border-b border-[var(--color-border-row)] py-[15px] ${desktopColumns} md:gap-[18px]`}
                  key={meeting.meetingId}
                  role="row"
                >
                  <div className="col-span-2 min-w-0 md:col-span-1" role="cell">
                    <strong className="block text-[17px] font-extrabold tracking-[-0.025em]">
                      {meeting.title}
                    </strong>
                    <span className="mt-1 block text-sm font-medium text-[var(--color-text-muted)]">
                      {t('influencerMeetingHistoryPage.t12')}
                    </span>
                  </div>
                  <div className="min-w-0" role="cell">
                    <time className="text-base font-bold tabular-nums">
                      {formatSchedule(meeting.scheduledStartAt)}
                    </time>
                  </div>
                  <div className="min-w-0" role="cell">
                    <span className={`text-sm font-extrabold ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="min-w-0" role="cell">
                    <Link
                      className="mj-font-label inline-flex min-h-10 items-center whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-[13px] text-sm hover:border-[var(--color-text-muted)]"
                      to={`/fan-meetings/${encodeURIComponent(meeting.meetingId)}/fans`}
                    >
                      {t('influencerMeetingHistoryPage.t13')}
                    </Link>
                  </div>
                  <div className="min-w-0" role="cell">
                    {ended ? (
                      <Link
                        className="mj-font-label inline-flex min-h-10 items-center whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-[13px] text-sm hover:border-[var(--color-text-muted)]"
                        to={`/fan-meetings/${encodeURIComponent(meeting.meetingId)}/statistics`}
                      >
                        {t('influencerMeetingHistoryPage.t14')}
                      </Link>
                    ) : (
                      <span className="whitespace-nowrap text-sm font-semibold text-[var(--color-text-muted)]">
                        {t('influencerMeetingHistoryPage.t15')}
                      </span>
                    )}
                  </div>
                  {canOpenDetail ? (
                    <div className="min-w-0" role="cell">
                      <Link
                        className="mj-font-label inline-flex min-h-10 items-center whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-[13px] text-sm hover:border-[var(--color-text-muted)]"
                        to={`/manager/fan-meetings/${encodeURIComponent(meeting.meetingId)}`}
                      >
                        {t('influencerMeetingHistoryPage.t16')}
                      </Link>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <Pagination
            className="mt-7 justify-center"
            currentPage={page}
            onPageChange={setPage}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  )
}
