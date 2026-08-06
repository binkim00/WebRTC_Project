import {
  CalendarBlank,
  MagnifyingGlass,
  Plus,
  VideoCamera,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  fetchMyMeetings,
  type ManagerMeetingPage,
  type ManagerMeetingSummary,
} from '../../api/managerMeetings'
import { getAuthSession } from '../../api/authSession'
import { publishFanMeeting } from '../../api/managerOperations'
import {
  cancelFanMeeting,
  deleteFanMeetingDraft,
} from '../../api/meetingManagement'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  EmptyState,
  Pagination,
  Select,
  Spinner,
} from '../../components'
import {
  getAvailableActions,
  meetingStatusBadge,
  meetingStatusFilterOptions,
  meetingStatusLabel,
  toErrorMessage,
} from './meetingLifecycle'
import { useTranslation } from '../../i18n'
import { parseServerDate } from '../../api/serverTime'

/** 서버 데이터가 없을 때도 페이지가 동일한 구조를 사용하도록 하는 빈 페이지 값이다. */
const emptyPage: ManagerMeetingPage = {
  content: [],
  page: 0,
  size: 10,
  totalElements: 0,
  totalPages: 1,
  hasNext: false,
}

/** ISO 날짜 문자열을 목록에서 읽기 쉬운 `YYYY.MM.DD HH:mm` 형식으로 바꾼다. */
function formatMeetingDate(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}.${month}.${day} ${hour}:${minute}`
}

/**
 * 운영자가 담당하는 팬미팅을 한 목록에서 관리한다.
 *
 * 홍보·응모 단계와 진행 단계가 같은 팬미팅이므로 목록도 하나만 두고,
 * 상태 필터와 상태별 액션 버튼으로 두 단계를 모두 처리한다.
 */
export function ManagerMeetingListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [meetingPage, setMeetingPage] = useState<ManagerMeetingPage>(emptyPage)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  const load = useCallback(async (signal?: AbortSignal) => {
    const session = getAuthSession()
    if (!session || (session.role !== 'MANAGER' && session.role !== 'SOLO_INFLUENCER')) {
      setError(t('managerMeetingListPage.t25'))
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await fetchMyMeetings(
        {
          keyword: keyword.trim() || undefined,
          status: statusFilter || undefined,
          page: page - 1,
          size: 10,
        },
        session.accessToken,
        signal,
      )
      if (signal?.aborted) return
      // 서버 정렬이 보장되지 않는 환경에서도 최근 생성한 팬미팅이 먼저 보이도록 보정한다.
      result.content.sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : Number.NaN
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : Number.NaN
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
          return rightTime - leftTime
        }
        return Number(right.meetingId) - Number(left.meetingId)
      })
      setMeetingPage(result)
      setError(undefined)
    } catch (cause) {
      if (signal?.aborted) return
      setError(toErrorMessage(cause, t('managerMeetingListPage.t26')))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, page, statusFilter])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  /** 발행·취소·초안 삭제를 확인 후 실행하고 목록을 다시 읽는다. */
  async function runAction(meetingId: string, action: 'publish' | 'cancel' | 'delete') {
    const confirmText =
      action === 'publish'
        ? t('managerMeetingListPage.t27')
        : action === 'cancel'
          ? t('managerMeetingListPage.t28')
          : t('managerMeetingListPage.t29')
    if (!window.confirm(confirmText)) return

    const token = getAuthSession()?.accessToken
    if (!token) {
      setError(t('managerMeetingListPage.t30'))
      return
    }

    setBusyId(meetingId)
    setError(undefined)
    setMessage(undefined)
    try {
      if (action === 'publish') {
        await publishFanMeeting(Number(meetingId), token)
        setMessage(t('managerMeetingListPage.t31'))
      } else if (action === 'cancel') {
        await cancelFanMeeting(meetingId, token)
        setMessage(t('managerMeetingListPage.t32'))
      } else {
        await deleteFanMeetingDraft(meetingId, token)
        setMessage(t('managerMeetingListPage.t33'))
      }
      await load()
    } catch (cause) {
      setError(toErrorMessage(cause, t('managerMeetingListPage.t34')))
    } finally {
      setBusyId(undefined)
    }
  }

  /** 검색 폼 제출 시 첫 페이지로 돌아가고 입력 키워드를 실제 검색 조건으로 적용한다. */
  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setKeyword(keywordInput)
  }

  return (
    <div className="grid min-w-0 gap-7 pb-10">
      <header>
        <h1 className="text-4xl font-black tracking-[-0.05em]">{t('managerMeetingListPage.t1')}</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          {t('managerMeetingListPage.t2')}
        </p>
      </header>

      {error ? (
        <AlertBanner title={t('managerMeetingListPage.t3')} variant="error">
          {error}
        </AlertBanner>
      ) : null}
      {message ? (
        <AlertBanner onDismiss={() => setMessage(undefined)} title={t('managerMeetingListPage.t4')} variant="success">
          {message}
        </AlertBanner>
      ) : null}

      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-col gap-5 border-b border-[var(--color-divider)] p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <form className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-3xl sm:flex-row sm:items-end" onSubmit={handleSearch} role="search">
            <label className="grid min-w-0 flex-1 gap-2 text-sm font-bold">
              <span>{t('managerMeetingListPage.t5')}</span>
              <span className="flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-white px-4 focus-within:border-[var(--color-focus-indigo)]">
                <MagnifyingGlass aria-hidden="true" className="shrink-0 text-[var(--color-text-tertiary)]" size={21} />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-text-tertiary)]"
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder={t('managerMeetingListPage.t6')}
                  type="search"
                  value={keywordInput}
                />
              </span>
            </label>
            <Select
              containerClassName="w-full sm:w-48"
              label={t('managerMeetingListPage.t7')}
              onChange={(event) => {
                setPage(1)
                setStatusFilter(event.target.value)
              }}
              options={[...meetingStatusFilterOptions()]}
              value={statusFilter}
            />
            <Button className="min-h-12 px-8" type="submit" variant="secondary">
              {t('managerMeetingListPage.t8')}
            </Button>
          </form>
          <Button
            className="min-h-12 self-start px-6 lg:self-auto"
            leadingIcon={<Plus size={20} weight="bold" />}
            onClick={() => navigate('/manager/fan-meetings/new')}
          >
            {t('managerMeetingListPage.t9')}
          </Button>
        </div>

        {loading ? (
          <div className="flex min-h-80 items-center justify-center">
            <Spinner label={t('managerMeetingListPage.t10')} />
          </div>
        ) : meetingPage.content.length === 0 ? (
          <EmptyState
            action={<Button onClick={() => navigate('/manager/fan-meetings/new')}>{t('managerMeetingListPage.t11')}</Button>}
            description={t('managerMeetingListPage.t12')}
            title={t('managerMeetingListPage.t13')}
          />
        ) : (
          <>
            <div className="divide-y divide-[var(--color-divider)]">
              {meetingPage.content.map((meeting) => (
                <MeetingRow
                  busy={busyId === meeting.meetingId}
                  key={meeting.meetingId}
                  meeting={meeting}
                  onAction={runAction}
                />
              ))}
            </div>
            {meetingPage.totalPages > 1 ? (
              <div className="border-t border-[var(--color-divider)] p-5">
                <Pagination
                  currentPage={page}
                  onPageChange={setPage}
                  totalPages={meetingPage.totalPages}
                />
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}

/** 팬미팅 한 건의 상태, 일정, 응모 현황과 상태별 액션을 한 행으로 표시한다. */
function MeetingRow({
  meeting,
  busy,
  onAction,
}: {
  meeting: ManagerMeetingSummary
  busy: boolean
  onAction: (meetingId: string, action: 'publish' | 'cancel' | 'delete') => void
}) {
  const { t } = useTranslation()
  const detailTo = `/manager/fan-meetings/${encodeURIComponent(meeting.meetingId)}`
  const actions = getAvailableActions({
    status: meeting.status,
    applicationEnabled: meeting.applicationStartAt !== null,
    applicationStartAt: meeting.applicationStartAt,
    applicationEndAt: meeting.applicationEndAt,
    scheduledStartAt: meeting.scheduledStartAt,
    participantCount: meeting.participantCount,
  })

  return (
    <article className="grid gap-5 px-5 py-5 transition-colors hover:bg-[var(--color-surface-page)] sm:px-7 lg:grid-cols-[minmax(240px,1.4fr)_minmax(120px,.6fr)_minmax(170px,.85fr)_minmax(130px,.6fr)_minmax(210px,1fr)] lg:items-center lg:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-page)] text-[var(--color-text-secondary)]">
          <VideoCamera aria-hidden="true" size={21} weight="fill" />
        </span>
        <div className="min-w-0">
          <Link className="truncate font-extrabold hover:text-[var(--color-primary-coral)]" to={detailTo}>
            {meeting.title}
          </Link>
          <p className="mt-1 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <Badge variant={meetingStatusBadge(meeting.status)}>{meetingStatusLabel(meeting.status)}</Badge>
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs text-[var(--color-text-tertiary)] lg:hidden">{t('managerMeetingListPage.t14')}</p>
        <p className="mt-1 font-bold lg:mt-0">{meeting.influencerName}</p>
      </div>

      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
        <CalendarBlank aria-hidden="true" size={19} />
        <time dateTime={meeting.scheduledStartAt}>{formatMeetingDate(meeting.scheduledStartAt)}</time>
      </div>

      <div className="text-sm text-[var(--color-text-secondary)]">
        <p>{t('managerMeetingListPage.t15')} {meeting.applicationCount}{t('managerMeetingListPage.t16')}</p>
        <p className="mt-1">{t('managerMeetingListPage.t17')} {meeting.participantCount}{t('managerMeetingListPage.t18')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          className="inline-flex min-h-[38px] items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-3.5 text-sm font-bold transition-colors hover:border-[var(--color-text-tertiary)]"
          to={detailTo}
        >
          {t('managerMeetingListPage.t19')}
        </Link>
        <Link
          className="inline-flex min-h-[38px] items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-3.5 text-sm font-bold transition-colors hover:border-[var(--color-text-tertiary)]"
          to={`${detailTo}/fans`}
        >
          {t('managerMeetingListPage.t20')}
        </Link>
        {meeting.status === 'LIVE' ? (
          <Link
            className="inline-flex min-h-[38px] items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] border border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] px-3.5 text-sm font-extrabold text-[var(--color-primary-coral)] transition-colors hover:border-[var(--color-primary-coral)] hover:bg-[var(--color-primary-coral)] hover:text-white"
            to={`${detailTo}/monitor`}
          >
            {t('managerMeetingListPage.t21')}
          </Link>
        ) : null}
        {actions.canPublish ? (
          <Button disabled={busy} onClick={() => onAction(meeting.meetingId, 'publish')} size="sm">
            {t('managerMeetingListPage.t22')}
          </Button>
        ) : null}
        {actions.canDeleteDraft ? (
          <Button
            disabled={busy}
            onClick={() => onAction(meeting.meetingId, 'delete')}
            size="sm"
            variant="danger"
          >
            {t('managerMeetingListPage.t23')}
          </Button>
        ) : null}
        {actions.canCancel ? (
          <Button disabled={busy} onClick={() => onAction(meeting.meetingId, 'cancel')} size="sm" variant="danger">
            {t('managerMeetingListPage.t24')}
          </Button>
        ) : null}
      </div>
    </article>
  )
}
