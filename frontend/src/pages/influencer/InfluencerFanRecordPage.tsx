import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseServerDate } from '../../api/serverTime'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { recallFanCallSession } from '../../api/callSessionLog'
import {
  fetchFanMemos,
  fetchMeetingDetail,
  fetchParticipants,
  type FanMeetingParticipant,
  type FanMemo,
} from '../../api/fanMeetingParticipants'
import { createFanMemo, deleteFanMemo, updateFanMemo } from '../../api/fanMemos'
import { Button, Dialog } from '../../components'
import { useCallSummary } from '../../hooks/useCallSummary'
import { useTranslation } from '../../i18n'

/** 백엔드 팬 메모 계약의 상한이다. */
const MEMO_MAX_LENGTH = 300
const PARTICIPANT_LOOKUP_SIZE = 50
/**
 * 한 팬미팅 = 메모 1개이므로 메모 목록이 곧 이 팬과 함께한 팬미팅 목록이다.
 * 최근 5건만 받는 기본값으로는 회차 목록이 잘리므로 넉넉히 요청한다.
 */
const MEMO_LOOKUP_SIZE = 50

/** 한 팬미팅 회차와 그 회차의 메모 하나를 묶은 값이다. */
type NoteSession = {
  meetingId: string
  title: string
  /** 목록 정렬과 날짜 표시에 쓰는 ISO 문자열이다. */
  at: string
  /** 메모가 아직 없으면 undefined이고, 저장 시 생성(POST)으로 분기한다. */
  memoId?: string
  memo: string
  savedAt?: string
}

function dateParts(value?: string) {
  if (!value) return undefined
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return undefined

  const pad = (part: number) => String(part).padStart(2, '0')
  return {
    date: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

/** 규칙 문서가 정한 표기다. 2026.07.26 */
function formatDate(value?: string) {
  return dateParts(value)?.date ?? ''
}

/** 규칙 문서가 정한 표기다. 2026.07.26 21:12 */
function formatDateTime(value?: string) {
  const parts = dateParts(value)
  return parts ? `${parts.date} ${parts.time}` : ''
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof ApiError || reason instanceof TypeError
    ? reason.message
    : fallback
}

/**
 * 팬 메모 화면이다. 팬미팅 한 회차에 메모 하나를 두고, 새로 만들지 않고 고쳐 쓴다.
 *
 * 회차 목록은 메모 목록에서 팬미팅 단위로 묶어 만들고, 현재 경로의 팬미팅은
 * 메모가 없어도 항상 넣어 첫 메모를 쓸 수 있게 한다.
 */
export function InfluencerFanRecordPage() {
  const { t } = useTranslation()
  const { fanMeetingId, fanId } = useParams<{ fanMeetingId: string; fanId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const authToken = getAuthSession()?.accessToken
  // 통화 화면에서 넘어온 경우에만 세션을 알 수 있다. 참가자 응답에는 통화 세션이 없다.
  const callSessionId = searchParams.get('callSessionId')?.trim() || undefined

  const [participant, setParticipant] = useState<FanMeetingParticipant>()
  /** 회차별 통화 세션 식별자다. 서버 참가자 응답에서 받아 채운다. */
  const [sessionIdByMeeting, setSessionIdByMeeting] = useState<Record<string, string>>({})
  const [memos, setMemos] = useState<FanMemo[]>([])
  const [currentMeeting, setCurrentMeeting] = useState<{ title: string; at?: string }>()
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string>()

  const [selectedMeetingId, setSelectedMeetingId] = useState<string>()
  const [sessionPicked, setSessionPicked] = useState(false)
  const [editingMeetingId, setEditingMeetingId] = useState<string>()
  const [draft, setDraft] = useState('')
  const [savedMeetingId, setSavedMeetingId] = useState<string>()
  const [saving, setSaving] = useState(false)
  /** 방금 메모를 지운 회차다. 안내 문구를 그 회차를 보고 있는 동안에만 띄운다. */
  const [deletedMeetingId, setDeletedMeetingId] = useState<string>()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadMemos = useCallback(
    async (signal?: AbortSignal) => {
      if (!fanId || !authToken) return

      try {
        const response = await fetchFanMemos(fanId, authToken, signal, MEMO_LOOKUP_SIZE)
        setMemos(response.content)
        setPageError(undefined)
      } catch (reason) {
        if (signal?.aborted) return
        setPageError(errorMessage(reason, t('influencerFanRecordPage.t18')))
      }
    },
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authToken, fanId],
  )

  useEffect(() => {
    if (!fanId) {
      setPageError(t('influencerFanRecordPage.t19'))
      setLoading(false)
      return
    }
    if (!authToken) {
      setPageError(t('influencerFanRecordPage.t20'))
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    void loadMemos(controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, fanId, loadMemos])

  useEffect(() => {
    if (!fanMeetingId || !authToken) return

    const controller = new AbortController()

    // 현재 팬미팅은 메모가 없어도 목록에 있어야 하므로 제목과 일시를 따로 읽는다.
    void fetchMeetingDetail(fanMeetingId, authToken, controller.signal)
      .then((detail) => {
        setCurrentMeeting({ title: detail.title, at: detail.scheduledStartAt })
      })
      .catch(() => {
        // 회차 정보 조회 실패는 이미 저장된 메모 열람을 막지 않는다.
      })

    return () => controller.abort()
  }, [authToken, fanMeetingId])

  /**
   * 선택한 회차의 참가자 정보를 읽어 팬 프로필과 통화 세션 식별자를 채운다.
   *
   * 회차를 바꿀 때마다 그 회차의 참가자 목록을 보는 이유는 통화 세션이 (팬미팅, 팬)마다 다르기
   * 때문이다. 프로필은 회차와 무관하게 같으므로 어느 회차에서 읽어도 된다.
   */
  useEffect(() => {
    const lookupMeetingId = selectedMeetingId ?? fanMeetingId
    if (!lookupMeetingId || !fanId || !authToken) return

    const controller = new AbortController()

    // 경로의 fanId는 팬 회원 ID이므로 참가자 목록에서 일치하는 참가자를 찾는다.
    void (async () => {
      try {
        let page = 0
        while (!controller.signal.aborted) {
          const response = await fetchParticipants(
            lookupMeetingId,
            { page, size: PARTICIPANT_LOOKUP_SIZE },
            authToken,
            controller.signal,
          )
          const match = response.content.find((item) => item.fanId === fanId)
          if (match) {
            setParticipant(match)
            if (match.latestCallSessionId) {
              const callSessionId = match.latestCallSessionId
              setSessionIdByMeeting((current) =>
                current[lookupMeetingId] === callSessionId
                  ? current
                  : { ...current, [lookupMeetingId]: callSessionId },
              )
            }
            return
          }
          if (!response.hasNext || page + 1 >= response.totalPages) return
          page += 1
        }
      } catch {
        // 팬 프로필 보조 정보 조회 실패는 메모 기능을 막지 않는다.
      }
    })()

    return () => controller.abort()
  }, [authToken, fanId, fanMeetingId, selectedMeetingId])

  const sessions = useMemo<NoteSession[]>(() => {
    const byMeeting = new Map<string, NoteSession>()

    for (const memo of memos) {
      // 회차당 메모는 하나이므로 최신순 응답의 첫 건만 그 회차의 메모로 삼는다.
      if (byMeeting.has(memo.meetingId)) continue
      byMeeting.set(memo.meetingId, {
        meetingId: memo.meetingId,
        title: memo.meetingTitle,
        at: memo.createdAt,
        memoId: memo.memoId,
        memo: memo.content,
        savedAt: memo.updatedAt || memo.createdAt,
      })
    }

    if (fanMeetingId && currentMeeting) {
      const existing = byMeeting.get(fanMeetingId)
      byMeeting.set(fanMeetingId, {
        meetingId: fanMeetingId,
        title: currentMeeting.title,
        at: currentMeeting.at ?? existing?.at ?? '',
        memoId: existing?.memoId,
        memo: existing?.memo ?? '',
        savedAt: existing?.savedAt,
      })
    }

    return [...byMeeting.values()].sort((left, right) => right.at.localeCompare(left.at))
  }, [currentMeeting, fanMeetingId, memos])

  useEffect(() => {
    const first = sessions.at(0)
    if (!first) {
      setSelectedMeetingId(undefined)
      return
    }
    // 회차 목록은 메모와 팬미팅 정보가 따로 도착해 두 번 채워진다. 사용자가 직접 고르기 전까지는
    // 지금 열고 들어온 팬미팅을 우선 선택해, 먼저 도착한 지난 회차에 선택이 묶이지 않게 한다.
    if (sessionPicked) {
      if (!sessions.some((session) => session.meetingId === selectedMeetingId)) {
        setSelectedMeetingId(first.meetingId)
      }
      return
    }

    const preferred =
      sessions.find((session) => session.meetingId === fanMeetingId) ?? first
    if (preferred.meetingId !== selectedMeetingId) {
      setSelectedMeetingId(preferred.meetingId)
    }
  }, [fanMeetingId, selectedMeetingId, sessionPicked, sessions])

  const selected = sessions.find((session) => session.meetingId === selectedMeetingId)
  const selectedIsCurrent = Boolean(selected && selected.meetingId === fanMeetingId)

  /**
   * 요약 조회에 쓸 통화 세션이다.
   *
   * 서버 참가자 응답이 알려 준 세션이 가장 정확하므로 그 값을 먼저 쓴다. 그 값을 아직 받지
   * 못했을 때만 통화 화면에서 넘어온 값과 브라우저에 남은 기록을 차례로 본다. 브라우저 기록은
   * 통화를 지켜본 그 브라우저에만 남으므로 어디까지나 보조 수단이다.
   */
  const summarySessionId = useMemo(() => {
    if (!selected || !fanId) return undefined
    const fromServer = sessionIdByMeeting[selected.meetingId]
    if (fromServer) return fromServer
    if (selectedIsCurrent && callSessionId) return callSessionId
    return recallFanCallSession(selected.meetingId, fanId)
  }, [callSessionId, fanId, selected, selectedIsCurrent, sessionIdByMeeting])

  // 생성 중(202)이면 완료될 때까지 다시 물어보고, 실패면 그 자리에서 멈춘다.
  const summaryState = useCallSummary(authToken ? summarySessionId : undefined)

  const summaryLines = useMemo(
    () =>
      summaryState.kind === 'ready'
        ? summaryState.summary.summary
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : [],
    [summaryState],
  )

  /** 요약을 보여 줄 수 없을 때의 이유 안내다. 요약이 표시되면 비운다. */
  const summaryNotice = !selected
    ? undefined
    : summaryState.kind === 'ready'
      ? undefined
      : summaryState.kind === 'generating' || summaryState.kind === 'loading'
        ? t('influencerFanRecordPage.summary.generating')
        : summaryState.kind === 'error' || summaryState.kind === 'unauthenticated'
          ? t('influencerFanRecordPage.summary.failed')
          : t('influencerFanRecordPage.summary.noRecord')

  const editing = Boolean(selected && editingMeetingId === selected.meetingId)
  const hasMemo = Boolean(selected?.memo.trim())
  const canSave = draft.trim().length > 0
  const justSaved = Boolean(selected && savedMeetingId === selected.meetingId)
  const justDeleted = Boolean(selected && deletedMeetingId === selected.meetingId)

  function selectSession(meetingId: string) {
    setSessionPicked(true)
    setSelectedMeetingId(meetingId)
    setEditingMeetingId(undefined)
    setDraft('')
    setSavedMeetingId(undefined)
    setDeletedMeetingId(undefined)
  }

  function startEdit() {
    if (!selected) return
    setEditingMeetingId(selected.meetingId)
    setDraft(selected.memo)
    setSavedMeetingId(undefined)
    setDeletedMeetingId(undefined)
  }

  function cancelEdit() {
    setEditingMeetingId(undefined)
    setDraft('')
  }

  /**
   * AI 통화 요약을 메모 입력란에 그대로 붙여 넣는다.
   * 이미 쓰던 내용이 있으면 줄을 바꿔 뒤에 잇고, 백엔드 상한(300자)에 맞춰 자른다.
   */
  function pasteSummaryIntoDraft() {
    const summaryText = summaryLines.join('\n')
    if (!summaryText) return
    setDraft((current) => {
      const merged = current.trim() ? `${current.trimEnd()}\n${summaryText}` : summaryText
      return merged.slice(0, MEMO_MAX_LENGTH)
    })
  }

  function save() {
    const content = draft.trim()
    if (!selected || !content || !fanId || !authToken || saving) return

    const target = selected.meetingId
    const numericMeetingId = Number(target)
    const request = selected.memoId
      ? updateFanMemo(selected.memoId, { content }, authToken)
      : createFanMemo(
          fanId,
          Number.isFinite(numericMeetingId)
            ? { meetingId: numericMeetingId, content }
            : { content },
          authToken,
        )

    setSaving(true)
    setPageError(undefined)

    void request
      .then(() => {
        setEditingMeetingId(undefined)
        setDraft('')
        setSavedMeetingId(target)
        setDeletedMeetingId(undefined)
        return loadMemos()
      })
      .catch((reason: unknown) => {
        setPageError(errorMessage(reason, t('influencerFanRecordPage.t21')))
      })
      .finally(() => setSaving(false))
  }

  /**
   * 선택한 회차의 메모를 지운다.
   *
   * 잘못 적은 메모를 되돌릴 방법이 화면에 없어 덮어쓰기밖에 할 수 없었다. 지운 뒤에는 같은
   * 회차에 다시 쓸 수 있고, 지난 회차는 메모가 곧 회차 기록이므로 목록에서도 함께 사라진다.
   */
  function removeMemo() {
    const memoId = selected?.memoId
    const target = selected?.meetingId
    if (!memoId || !target || !authToken || deleting) return

    setDeleting(true)
    setPageError(undefined)

    void deleteFanMemo(memoId, authToken)
      .then(() => {
        setDeleteOpen(false)
        setEditingMeetingId(undefined)
        setDraft('')
        setSavedMeetingId(undefined)
        setDeletedMeetingId(target)
        return loadMemos()
      })
      .catch((reason: unknown) => {
        setPageError(errorMessage(reason, t('influencerFanRecordPage.s1DeleteFailed')))
      })
      .finally(() => setDeleting(false))
  }

  const fanName = participant?.nickname ?? t('influencerFanRecordPage.t32', { p0: fanId ?? '' }).trim()
  const recentSessionDate = formatDate(sessions.at(0)?.at)
  const memoMeta = hasMemo
    ? justSaved
      ? t('influencerFanRecordPage.t22')
      : formatDateTime(selected?.savedAt)
    : t('influencerFanRecordPage.t23')

  const hint = pageError
    ? pageError
    : justSaved
      ? t('influencerFanRecordPage.t24')
      : justDeleted
        ? t('influencerFanRecordPage.s1Deleted')
        : editing
          ? canSave
            ? t('influencerFanRecordPage.t25')
            : t('influencerFanRecordPage.t26')
          : hasMemo
            ? t('influencerFanRecordPage.t27')
            : ''
  const hintClassName = pageError
    ? 'text-[var(--color-error)]'
    : justSaved
      ? 'text-[var(--color-success)]'
      : 'text-[var(--color-text-muted)]'

  return (
    <div>
      <Link
        className="text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        to={
          fanMeetingId
            ? `/influencer/fan-meetings/${encodeURIComponent(fanMeetingId)}/fans`
            : '/influencer/fan-meetings'
        }
      >
        {t('influencerFanRecordPage.t1')}
      </Link>

      <div className="mt-4 flex items-center gap-4">
        {participant?.profileImageUrl ? (
          <img
            alt={t('influencerFanRecordPage.t33', { p0: fanName })}
            className="size-14 flex-none rounded-lg bg-[var(--color-surface-muted)] object-cover"
            decoding="async"
            loading="lazy"
            src={participant.profileImageUrl}
          />
        ) : (
          <span
            aria-hidden="true"
            className="size-14 flex-none rounded-lg bg-[var(--color-surface-muted)]"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-[26px] font-black tracking-[-0.035em]">{fanName}</h1>
          {loading ? null : (
            <p className="mt-[5px] text-[15px] font-medium text-[var(--color-text-muted)]">
              {t('influencerFanRecordPage.t2')} {sessions.length}{t('influencerFanRecordPage.t3')} {recentSessionDate}
            </p>
          )}
        </div>
      </div>

      {loading ? null : sessions.length === 0 ? (
        pageError ? (
          <p
            aria-live="polite"
            className="mt-[26px] border-t border-[var(--color-divider)] pt-[22px] text-sm font-semibold text-[var(--color-error)]"
          >
            {pageError}
          </p>
        ) : (
          <div
            className="mt-[26px] grid place-items-center border-t border-[var(--color-divider)] px-6 py-[88px] text-center"
            role="status"
          >
            <strong className="text-[19px] font-extrabold tracking-[-0.03em]">
              {t('influencerFanRecordPage.t4')}
            </strong>
            <span className="mt-[9px] max-w-[420px] text-base font-medium leading-[1.6] text-[var(--color-text-muted)]">
              {t('influencerFanRecordPage.t5')}
            </span>
          </div>
        )
      ) : (
        <div className="mt-[26px] grid items-start gap-7 border-t border-[var(--color-divider)] pt-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-11">
          <nav aria-label={t('influencerFanRecordPage.t6')} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-extrabold">{t('influencerFanRecordPage.t7')}</h2>
              <span className="text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
                {sessions.length}{t('influencerFanRecordPage.t8')}
              </span>
            </div>
            <p className="mt-[7px] text-sm font-medium leading-[1.55] text-[var(--color-text-muted)]">
              {t('influencerFanRecordPage.t9')}
            </p>

            <div className="mt-[14px]">
              {sessions.map((session) => {
                const current = session.meetingId === selectedMeetingId
                const sessionHasMemo = Boolean(session.memo.trim())

                return (
                  <button
                    aria-current={current ? 'true' : undefined}
                    className={[
                      'mb-1.5 block w-full rounded-lg border px-[15px] py-[14px] text-left hover:border-[var(--color-text-muted)]',
                      current
                        ? 'border-[var(--color-primary-coral)] bg-[var(--color-surface-subtle)]'
                        : 'border-[var(--color-divider)] bg-[var(--color-surface-panel)]',
                    ].join(' ')}
                    key={session.meetingId}
                    onClick={() => selectSession(session.meetingId)}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-2.5">
                      <span className="text-[13px] font-semibold tabular-nums text-[var(--color-text-muted)]">
                        {formatDate(session.at)}
                      </span>
                      <span
                        className={[
                          'whitespace-nowrap text-[13px] font-extrabold',
                          sessionHasMemo
                            ? 'text-[var(--color-success)]'
                            : 'text-[var(--color-text-muted)]',
                        ].join(' ')}
                      >
                        {sessionHasMemo ? t('influencerFanRecordPage.t28') : t('influencerFanRecordPage.t29')}
                      </span>
                    </span>
                    <span
                      className={[
                        'mt-[7px] block text-base leading-[1.4] tracking-[-0.02em]',
                        current ? 'font-extrabold' : 'font-bold',
                      ].join(' ')}
                    >
                      {session.title}
                    </span>
                  </button>
                )
              })}
            </div>
          </nav>

          <article className="min-w-0">
            <p className="text-[13px] font-semibold tabular-nums text-[var(--color-text-muted)]">
              {formatDate(selected?.at)}
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.034em]">
              {selected?.title}
            </h2>

            <section
              aria-labelledby="fn-sum"
              className="mt-[22px] rounded-[10px] bg-[var(--color-surface-subtle)] px-5 py-[18px]"
            >
              <h3 className="text-sm font-extrabold" id="fn-sum">
                {t('influencerFanRecordPage.t10')}
              </h3>
              <p className="mt-[7px] text-sm font-medium leading-[1.55] text-[var(--color-text-muted)]">
                {t('influencerFanRecordPage.t11')}
              </p>
              {summaryLines.length === 0 && summaryNotice ? (
                <p className="mt-[11px] text-sm font-semibold text-[var(--color-text-muted)]">
                  {summaryNotice}
                </p>
              ) : null}
              {summaryLines.map((line) => (
                <p
                  className="mt-[11px] max-w-[60ch] text-base font-medium leading-[1.75] text-[var(--color-text-body)]"
                  key={line}
                >
                  {line}
                </p>
              ))}
            </section>

            <section
              aria-labelledby="fn-memo"
              className="mt-[26px] border-t border-[var(--color-divider)] pt-[22px]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-[17px] font-extrabold tracking-[-0.028em]" id="fn-memo">
                    {t('influencerFanRecordPage.t12')}
                  </h3>
                  <p className="mt-1.5 text-sm font-medium text-[var(--color-text-muted)]">
                    {memoMeta}
                  </p>
                </div>
                {editing ? null : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className="hover:border-[var(--color-primary-coral)] hover:bg-[var(--color-surface-panel)] hover:text-[var(--color-primary-coral)]"
                      onClick={startEdit}
                      variant="secondary"
                    >
                      {hasMemo ? t('influencerFanRecordPage.t30') : t('influencerFanRecordPage.t31')}
                    </Button>
                    {/* 저장된 메모가 있는 회차에서만 지울 수 있다. */}
                    {selected?.memoId ? (
                      <Button
                        className="hover:border-[var(--color-error)] hover:bg-[var(--color-surface-panel)] hover:text-[var(--color-error)]"
                        onClick={() => setDeleteOpen(true)}
                        variant="secondary"
                      >
                        {t('influencerFanRecordPage.s1Delete')}
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>

              {editing ? (
                <>
                  <textarea
                    aria-label={t('influencerFanRecordPage.t13')}
                    className="mj-font-body mt-4 min-h-[132px] w-full max-w-[60ch] resize-y rounded-lg border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] p-[14px] text-base leading-[1.7] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-coral)] focus:outline-none focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
                    maxLength={MEMO_MAX_LENGTH}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t('influencerFanRecordPage.t14')}
                    value={draft}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <Button
                      className="mj-font-emphasis"
                      disabled={!canSave}
                      loading={saving}
                      onClick={save}
                    >
                      {t('influencerFanRecordPage.t15')}
                    </Button>
                    {summaryLines.length > 0 ? (
                      <Button
                        className="hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
                        onClick={pasteSummaryIntoDraft}
                        variant="secondary"
                      >
                        {t('influencerFanRecordPage.pasteSummary')}
                      </Button>
                    ) : null}
                    <Button
                      className="hover:border-[var(--color-text-muted)]"
                      onClick={cancelEdit}
                      variant="secondary"
                    >
                      {t('influencerFanRecordPage.t16')}
                    </Button>
                    <span className="text-sm font-semibold tabular-nums text-[var(--color-text-muted)]">
                      {t('influencerFanRecordPage.t34', { p0: draft.length })}
                    </span>
                  </div>
                </>
              ) : hasMemo ? (
                <p className="mt-4 max-w-[60ch] whitespace-pre-line text-[17px] font-medium leading-[1.8] text-[var(--color-text-body)]">
                  {selected?.memo}
                </p>
              ) : (
                <p className="mt-4 max-w-[56ch] text-base font-medium leading-[1.7] text-[var(--color-text-muted)]">
                  {t('influencerFanRecordPage.t17')}
                </p>
              )}

              <p aria-live="polite" className={`mt-[14px] text-sm font-semibold ${hintClassName}`}>
                {hint}
              </p>

              {/* 저장 직후에는 참가 팬 화면으로 돌아가 다음 팬을 이어서 정리하는 동선을 바로 연다. */}
              {justSaved && fanMeetingId ? (
                <button
                  className="mt-3 inline-flex min-h-11 items-center rounded-[10px] bg-[var(--color-primary-coral)] px-5 text-sm font-extrabold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                  onClick={() =>
                    navigate(`/influencer/fan-meetings/${encodeURIComponent(fanMeetingId)}/fans`)
                  }
                  type="button"
                >
                  {t('influencerFanRecordPage.backToFans')}
                </button>
              ) : null}
            </section>
          </article>
        </div>
      )}

      <Dialog
        description={t('influencerFanRecordPage.s1DeleteDesc', { p0: selected?.title ?? '' })}
        footer={
          <>
            <Button disabled={deleting} onClick={() => setDeleteOpen(false)} variant="secondary">
              {t('influencerFanRecordPage.t16')}
            </Button>
            <Button loading={deleting} onClick={removeMemo} variant="danger">
              {t('influencerFanRecordPage.s1DeleteConfirm')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteOpen(false)
        }}
        open={deleteOpen}
        title={t('influencerFanRecordPage.s1DeleteTitle')}
      />
    </div>
  )
}
