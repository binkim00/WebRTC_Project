import { CaretDown, CaretUp } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import {
  getApplicants,
  getApplicationStatistics,
  type ApplicantListResponse,
  type ApplicationStatisticsResponse,
  type ApplicationStatus,
} from '../../api/applications'
import { getAuthSession } from '../../api/authSession'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Pagination,
  Select,
  Spinner,
  TextField,
} from '../../components'
import { formatDateTime, toErrorMessage } from './meetingLifecycle'

/** 응모 상태 코드를 화면용 한국어 라벨로 바꾼다. */
const applicationStatusLabels: Record<ApplicationStatus, string> = {
  SUBMITTED: '응모 완료',
  WITHDRAWN: '응모 철회',
  SELECTED: '당첨',
  NOT_SELECTED: '미당첨',
}

/** 응모 상태에 맞는 배지 색상을 고른다. */
function applicationStatusBadge(
  status: ApplicationStatus,
): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'SELECTED') return 'success'
  if (status === 'NOT_SELECTED') return 'danger'
  if (status === 'WITHDRAWN') return 'neutral'
  return 'primary'
}

/**
 * 팬미팅의 응모 현황 통계와 응모자별 제출 답변을 조회한다.
 *
 * 추첨과 결과 발표 버튼은 상태 판정을 가진 상세 화면(개요 탭)에 두고, 여기서는 조회만 담당한다.
 * `refreshToken` 값이 바뀌면 추첨 직후처럼 외부 변경을 반영해 다시 조회한다.
 */
export function ManagerApplicantsPanel({
  meetingId,
  refreshToken = 0,
}: {
  meetingId: string
  refreshToken?: number
}) {
  const [stats, setStats] = useState<ApplicationStatisticsResponse>()
  const [list, setList] = useState<ApplicantListResponse>()
  const [statusFilter, setStatusFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<number>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const loadApplicants = useCallback(async () => {
    const token = getAuthSession()?.accessToken
    if (!meetingId) {
      setError('팬미팅 식별자가 없습니다.')
      setLoading(false)
      return
    }
    if (!token) {
      setError('응모자 목록을 조회하려면 먼저 로그인해 주세요.')
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [applicants, statistics] = await Promise.all([
        getApplicants(
          meetingId,
          {
            applicationStatus: statusFilter ? (statusFilter as ApplicationStatus) : undefined,
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

  return (
    <div className="grid gap-5">
      {error ? <AlertBanner title="응모자 조회 실패" variant="error">{error}</AlertBanner> : null}

      <Card className="p-6">
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">전체 응모</p>
            <strong className="text-2xl">{stats?.totalApplications ?? '-'}명</strong>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">응모 완료</p>
            <strong className="text-2xl">{stats?.submittedCount ?? '-'}명</strong>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">당첨</p>
            <strong className="text-2xl text-[var(--color-primary-coral)]">{stats?.selectedCount ?? '-'}명</strong>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">미당첨</p>
            <strong className="text-2xl">{stats?.notSelectedCount ?? '-'}명</strong>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <form
          className="flex flex-wrap items-end gap-2 border-b border-[var(--color-divider)] p-6"
          onSubmit={(event) => {
            event.preventDefault()
            setPage(0)
            setAppliedKeyword(keyword.trim())
          }}
        >
          <Select
            containerClassName="w-40"
            label="응모 상태"
            onChange={(event) => {
              setPage(0)
              setStatusFilter(event.target.value)
            }}
            options={[
              { value: '', label: '전체' },
              { value: 'SUBMITTED', label: '응모 완료' },
              { value: 'SELECTED', label: '당첨' },
              { value: 'NOT_SELECTED', label: '미당첨' },
              { value: 'WITHDRAWN', label: '응모 철회' },
            ]}
            value={statusFilter}
          />
          <TextField
            containerClassName="min-w-[220px] flex-1"
            label="닉네임 검색"
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="닉네임을 입력하세요"
            value={keyword}
          />
          <Button type="submit" variant="secondary">검색</Button>
        </form>

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <Spinner label="응모자 목록을 불러오는 중" />
          </div>
        ) : !list || list.content.length === 0 ? (
          <div className="p-10 text-center text-[var(--color-text-secondary)]">
            조건에 맞는 응모자가 없습니다.
          </div>
        ) : (
          <>
            <div className="divide-y divide-[var(--color-divider)]">
              {list.content.map((applicant) => {
                const expanded = expandedId === applicant.applicationId
                return (
                  <div key={applicant.applicationId}>
                    <button
                      className={`grid w-full gap-3 p-5 text-left transition hover:bg-[var(--color-surface-page)] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center ${expanded ? 'bg-[var(--color-primary-coral-soft)]' : ''}`}
                      onClick={() => setExpandedId(expanded ? undefined : applicant.applicationId)}
                      type="button"
                    >
                      {applicant.profileImageUrl ? (
                        <img alt="" className="size-10 rounded-full object-cover" src={applicant.profileImageUrl} />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--color-primary-coral-soft)] font-bold text-[var(--color-primary-coral)]">
                          {applicant.nickname.slice(0, 1)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <strong>{applicant.nickname}</strong>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          응모일 {formatDateTime(applicant.submittedAt)}
                        </p>
                      </div>
                      <Badge variant={applicationStatusBadge(applicant.applicationStatus)}>
                        {applicationStatusLabels[applicant.applicationStatus]}
                      </Badge>
                      <span className="text-[var(--color-text-tertiary)]">
                        {expanded ? <CaretUp size={17} /> : <CaretDown size={17} />}
                      </span>
                    </button>
                    {expanded ? (
                      <div className="grid gap-4 border-t border-dashed border-[var(--color-divider)] bg-[var(--color-surface-page)] p-5">
                        {applicant.answers.length === 0 ? (
                          <p className="text-sm text-[var(--color-text-secondary)]">제출된 답변이 없습니다.</p>
                        ) : (
                          applicant.answers.map((answer) => (
                            <div key={answer.questionId}>
                              <p className="text-xs font-bold text-[var(--color-text-secondary)]">{answer.questionText}</p>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{answer.answerText}</p>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {list.totalPages > 1 ? (
              <Pagination
                className="border-t border-[var(--color-divider)] py-4"
                currentPage={page + 1}
                onPageChange={(next) => setPage(next - 1)}
                totalPages={list.totalPages}
              />
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}
