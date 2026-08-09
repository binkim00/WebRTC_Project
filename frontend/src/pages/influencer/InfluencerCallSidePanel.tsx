import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { forceEndCallSession } from '../../api/callSessions'
import {
  callQueueEntry,
  fetchFanMemos,
  fetchMeetingQueue,
  markQueueEntryNoShow,
  type FanMemo,
  type MeetingQueue,
  type QueueEntry,
} from '../../api/fanMeetingParticipants'
import { createFanMemo, updateFanMemo } from '../../api/fanMemos'
import { getApplicants, type ApplicantAnswerResponse } from '../../api/applications'
import { changeQueuePosition } from '../../api/queueManagement'
import { AlertBanner, Button, Dialog } from '../../components'
import { useTranslation } from '../../i18n'

type ConfirmKind = 'noshow' | 'skip'

/** 백엔드 팬 메모 계약의 상한이다. (FanMemoCreateRequest.content) */
const MEMO_MAX_LENGTH = 300

/**
 * 실패 원인을 화면 문구로 만든다.
 *
 * 서버가 준 메시지가 가장 정확하므로 그것을 먼저 쓰고, 정체를 알 수 없는 오류만 기본 문구로 덮는다.
 *
 * @param reason catch로 받은 값
 * @param fallback 서버 메시지를 쓸 수 없을 때의 기본 문구
 * @return 화면에 띄울 문구
 */
function failureMessage(reason: unknown, fallback: string) {
  return reason instanceof ApiError || reason instanceof TypeError ? reason.message : fallback
}

/**
 * 인플루언서 통화의 팬 정보 패널이다. (Influencer Call.dc.html 우측 260px)
 *
 * 통화 중에는 모니터링 화면을 볼 수 없으므로 이 패널이 그 자리를 대신한다. 팬 정보·응모 답변을
 * 읽는 것뿐 아니라 **메모 작성**과(모든 인플루언서) **대기열 운영**(1인 인플루언서)까지 여기서 끝난다.
 * 운영 조치를 해도 대기실로 나가지 않고 이 화면에서 다음 팬을 이어 호출한다.
 *
 * @param meetingId 진행 중인 팬미팅 식별자
 */
export function InfluencerCallSidePanel({ meetingId }: { meetingId: string }) {
  const { t } = useTranslation()
  const [session] = useState(() => getAuthSession())
  const isSolo = session?.role === 'SOLO_INFLUENCER'
  const [queue, setQueue] = useState<MeetingQueue>()
  const [memoOpen, setMemoOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmKind>()
  const [opsBusy, setOpsBusy] = useState(false)
  const [opsError, setOpsError] = useState<string>()

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    const token = getAuthSession()?.accessToken
    if (!token) return
    try {
      setQueue(await fetchMeetingQueue(meetingId, token, signal))
    } catch {
      // 패널은 보조 정보라 조회 실패로 통화를 방해하지 않는다.
    }
  }, [meetingId])

  useEffect(() => {
    const controller = new AbortController()
    void loadQueue(controller.signal)
    const timer = window.setInterval(() => void loadQueue(controller.signal), 3_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [loadQueue])

  const entries = useMemo(() => queue?.entries ?? [], [queue?.entries])
  const currentEntry = useMemo(() => {
    if (queue?.currentCall) {
      const matched = entries.find(
        (entry) => entry.participantId === queue.currentCall?.participantId,
      )
      if (matched) return matched
    }
    return entries.find((entry) => entry.status === 'IN_CALL')
  }, [entries, queue?.currentCall])
  const nextEntry = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            (entry.status === 'WAITING' || entry.status === 'CALLED') &&
            entry.participantId !== currentEntry?.participantId,
        )
        .sort((a, b) => a.position - b.position)[0],
    [currentEntry?.participantId, entries],
  )

  const currentFanName = queue?.currentCall?.nickname ?? currentEntry?.nickname
  const callConnected = Boolean(queue?.currentCall?.startedAt)

  /**
   * 방금까지 통화한 팬이다.
   *
   * 마지막 팬의 통화가 끝나면 `currentCall`이 비고 대기열에도 IN_CALL이 없어 메모를 남길 대상이
   * 사라진다. 그러면 하필 **마지막 팬만** 메모를 못 남기게 되므로 직전 대상을 기억해 둔다.
   */
  const [lastEntry, setLastEntry] = useState<QueueEntry>()

  useEffect(() => {
    if (currentEntry) setLastEntry(currentEntry)
    // 폴링마다 새 객체가 오므로 식별자가 바뀔 때만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry?.queueEntryId])

  const memoFan = currentEntry ?? lastEntry
  const memoFanId = memoFan?.fanId

  const [memos, setMemos] = useState<readonly FanMemo[]>([])
  /** 메모 목록을 어느 팬 기준으로 채웠는지다. 초안을 채울 시점을 이 값으로 판단한다. */
  const [memoLoadedFanId, setMemoLoadedFanId] = useState<string>()
  const [memoDraft, setMemoDraft] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)
  const [memoNotice, setMemoNotice] = useState<string>()
  const [memoError, setMemoError] = useState<string>()

  /**
   * 이 팬의 메모를 읽어 온다. 첫 조회와 저장 직후의 갱신에 함께 쓴다.
   *
   * @param fanId 메모를 읽을 팬 회원 식별자
   * @param signal 화면 이탈·팬 교체 시 조회를 끊을 신호
   */
  const loadMemos = useCallback(async (fanId: string, signal?: AbortSignal) => {
    const token = getAuthSession()?.accessToken
    if (!token) return

    try {
      const response = await fetchFanMemos(fanId, token, signal)
      if (signal?.aborted) return
      setMemos(response.content)
    } catch {
      if (signal?.aborted) return
      // 메모를 못 읽어도 새로 쓰는 것은 막지 않는다.
      setMemos([])
    }
    setMemoLoadedFanId(fanId)
  }, [])

  useEffect(() => {
    if (!memoFanId) {
      setMemos([])
      setMemoLoadedFanId(undefined)
      return
    }

    const controller = new AbortController()
    void loadMemos(memoFanId, controller.signal)
    return () => controller.abort()
  }, [loadMemos, memoFanId])

  /** 이번 회차에 이미 저장된 메모다. 있으면 수정(PATCH), 없으면 생성(POST)으로 저장한다. */
  const currentMemo = useMemo(
    () => memos.find((item) => item.meetingId === meetingId),
    [meetingId, memos],
  )
  /** 지난 회차에 남긴 메모 중 가장 최근 것이다. 이번 회차 메모와 섞이지 않게 따로 보여 준다. */
  const pastMemo = useMemo(
    () => memos.find((item) => item.meetingId !== meetingId),
    [meetingId, memos],
  )

  /** 초안을 이미 채운 팬이다. 저장 후 재조회가 입력 중인 내용을 덮지 않도록 한 번만 채운다. */
  const memoSeededForRef = useRef<string>(undefined)

  useEffect(() => {
    if (!memoLoadedFanId || memoSeededForRef.current === memoLoadedFanId) return

    memoSeededForRef.current = memoLoadedFanId
    setMemoDraft(currentMemo?.content ?? '')
    setMemoNotice(undefined)
    setMemoError(undefined)
  }, [currentMemo?.content, memoLoadedFanId])

  /**
   * 지금 통화 중인 팬이 응모할 때 쓴 답변을 읽는다.
   *
   * 통화가 2분 남짓이라 무슨 말을 할지 정하는 데 시간을 쓰면 그대로 침묵이 된다. 팬이 응모 폼에
   * 이미 적어 둔 답변("좋아하는 곡", "하고 싶은 말")을 통화 화면에 띄우면 그 시간을 대화로 채울 수
   * 있다. 서버에 이미 있는 데이터라 새 API 없이 응모자 목록에서 이 팬만 골라 쓴다.
   *
   * 응모를 받지 않는 팬미팅(CSV 명단)에서는 응모 자체가 없으므로 결과가 비고, 이 블록은 숨는다.
   */
  const [answers, setAnswers] = useState<readonly ApplicantAnswerResponse[]>([])
  const [answersOpen, setAnswersOpen] = useState(false)

  useEffect(() => {
    if (!memoFanId) {
      setAnswers([])
      return
    }
    const token = getAuthSession()?.accessToken
    if (!token) return

    const controller = new AbortController()
    // 확정 참가자 수만큼만 조회하면 되므로 한 페이지로 충분하다.
    void getApplicants(meetingId, { size: 100 }, token, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return
        const matched = response.content.find(
          (applicant) => String(applicant.fanId) === String(memoFanId),
        )
        setAnswers(matched?.answers ?? [])
      })
      .catch(() => {
        // 보조 정보이므로 조회 실패로 통화를 방해하지 않는다.
        if (!controller.signal.aborted) setAnswers([])
      })
    return () => controller.abort()
  }, [meetingId, memoFanId])

  /**
   * 통화 중 적은 메모를 저장한다.
   *
   * 한 회차에 메모는 하나이므로 이번 회차 메모가 이미 있으면 새로 만들지 않고 덮어쓴다.
   */
  async function handleMemoSave() {
    const token = getAuthSession()?.accessToken
    const content = memoDraft.trim()
    if (!token || !memoFanId || !content || memoSaving) return

    setMemoSaving(true)
    setMemoNotice(undefined)
    setMemoError(undefined)
    try {
      if (currentMemo) {
        await updateFanMemo(currentMemo.memoId, { content }, token)
      } else {
        // 팬미팅 식별자는 경로 파라미터라 문자열이지만 백엔드는 숫자를 받는다.
        const numericMeetingId = Number(meetingId)
        await createFanMemo(
          memoFanId,
          Number.isFinite(numericMeetingId)
            ? { meetingId: numericMeetingId, content }
            : { content },
          token,
        )
      }
      setMemoNotice(t('influencerCallSidePanel.s1MemoSaved'))
      // 방금 만든 메모의 memoId를 받아 둬야 다음 저장이 생성이 아니라 수정으로 간다.
      await loadMemos(memoFanId)
    } catch (reason) {
      setMemoError(failureMessage(reason, t('influencerCallSidePanel.s1MemoFailed')))
    } finally {
      setMemoSaving(false)
    }
  }

  /**
   * 대기열의 다음 팬을 호출한다.
   *
   * 호출에 성공하면 통화 화면의 대기열 폴링(VideoCallRoom)이 새 통화 세션을 따라가므로
   * 이 화면을 벗어나지 않고 그대로 다음 통화로 이어진다.
   *
   * @param token 인증 토큰
   * @throws 호출 API가 실패하면 그대로 던진다. 호출한 쪽이 문구를 정한다.
   */
  async function callNextFan(token: string) {
    if (!nextEntry) return
    await callQueueEntry(nextEntry.queueEntryId, token)
    await loadQueue()
  }

  /**
   * 운영 조치를 끝낸 뒤 다음 팬을 이어서 호출한다.
   *
   * 앞 단계(노쇼·건너뛰기)는 이미 서버에 반영됐으므로, 호출 실패를 앞 단계의 실패처럼 보이게
   * 하지 않는다. 실패해도 "다음 팬 호출" 버튼으로 다시 시도할 수 있다.
   *
   * @param token 인증 토큰
   */
  async function continueWithNextFan(token: string) {
    try {
      await callNextFan(token)
    } catch (reason) {
      setOpsError(failureMessage(reason, t('influencerCallSidePanel.s1CallNextFailed')))
    }
  }

  /** "다음 팬 호출" 버튼이다. 진행 중인 통화가 없을 때 다음 순번을 직접 부른다. */
  async function handleCallNext() {
    const token = getAuthSession()?.accessToken
    if (!token || !nextEntry || opsBusy) return

    setOpsBusy(true)
    setOpsError(undefined)
    await continueWithNextFan(token)
    setOpsBusy(false)
  }

  /** 현재 팬을 노쇼로 처리하고, 다음 팬이 있으면 이 화면에서 이어 호출한다. */
  async function handleNoShow() {
    const token = getAuthSession()?.accessToken
    if (!token || !currentEntry || opsBusy) return

    setOpsBusy(true)
    setOpsError(undefined)
    try {
      await markQueueEntryNoShow(currentEntry.queueEntryId, token)
      // 대기열만 정리하면 서버 세션이 남으므로 통화도 명시적으로 종료한다.
      const sessionId = queue?.currentCall?.callSessionId
      if (sessionId) {
        try {
          await forceEndCallSession(sessionId, { reason: t('influencerCallSidePanel.t16') }, { authToken: token })
        } catch {
          // 노쇼 처리와 함께 서버가 세션을 이미 정리한 경우다.
        }
      }
      setConfirm(undefined)
    } catch (reason) {
      setOpsError(failureMessage(reason, t('influencerCallSidePanel.t17')))
      setOpsBusy(false)
      return
    }

    await continueWithNextFan(token)
    setOpsBusy(false)
  }

  /** 현재 팬을 대기열 마지막으로 보내고, 다음 팬을 이 화면에서 이어 호출한다. */
  async function handleSkip() {
    const token = getAuthSession()?.accessToken
    if (!token || !currentEntry || opsBusy) return

    setOpsBusy(true)
    setOpsError(undefined)
    try {
      if (queue?.currentCall?.callSessionId) {
        await forceEndCallSession(
          queue.currentCall.callSessionId,
          { reason: t('influencerCallSidePanel.t18') },
          { authToken: token },
        )
      }
      // 다음 팬이 없으면 옮길 자리도 없으므로 통화 종료만으로 마무리한다.
      if (nextEntry) {
        await changeQueuePosition(currentEntry.queueEntryId, entries.length, token)
      }
      setConfirm(undefined)
    } catch (reason) {
      setOpsError(failureMessage(reason, t('influencerCallSidePanel.t19')))
      setOpsBusy(false)
      return
    }

    await continueWithNextFan(token)
    setOpsBusy(false)
  }

  const pastMemoContent = pastMemo?.content ?? ''
  const showMemoToggle = pastMemoContent.length > 60
  /** 진행 중인 통화가 있으면 다음 팬을 부를 수 없다. 팬미팅당 활성 통화 세션은 하나다. */
  const canCallNext = Boolean(nextEntry) && !queue?.currentCall

  return (
    <aside
      aria-label={t('influencerCallSidePanel.t1')}
      className="min-w-0 rounded-xl border border-white/10 bg-[var(--color-surface-dark-panel)] p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white/65">{t('influencerCallSidePanel.t2')}</p>
          <h2 className="mt-1.5 truncate text-2xl font-black tracking-[-0.035em] text-white">
            {currentFanName ?? t('influencerCallSidePanel.t20')}
          </h2>
        </div>
        {currentEntry ? (
          <span className="whitespace-nowrap text-sm font-extrabold text-white/75 tabular-nums">
            {currentEntry.position}{t('influencerCallSidePanel.t3')}
          </span>
        ) : null}
      </div>

      <dl className="mt-5 grid gap-[13px] border-t border-white/10 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[15px] font-semibold text-white/65">{t('influencerCallSidePanel.t4')}</dt>
          <dd
            className={`text-[15px] font-extrabold ${callConnected ? 'text-[var(--color-success-on-dark)]' : 'text-[var(--color-warning-on-dark)]'}`}
          >
            {callConnected ? t('influencerCallSidePanel.t21') : t('influencerCallSidePanel.t22')}
          </dd>
        </div>
      </dl>

      {/*
        이번 통화 메모 — 통화 중에 바로 쓴다. 예전에는 이 패널이 조회만 해서, 방금 나눈 대화를
        적어 두려면 통화가 끝난 뒤 팬 기록 화면까지 찾아가야 했다.
        마지막 팬은 통화가 끝나도 대상이 남도록 memoFan(직전 통화 상대)을 쓴다.
      */}
      <section aria-labelledby="ic-memo" className="mt-5 border-t border-white/10 pt-4">
        <h3 className="text-sm font-extrabold text-white/90" id="ic-memo">
          {t('influencerCallSidePanel.s1MemoTitle')}
        </h3>
        {memoFan ? (
          <>
            <p className="mt-1.5 text-[13px] font-medium leading-[1.5] text-white/60">
              {t('influencerCallSidePanel.s1MemoFor', { p0: memoFan.nickname })}
            </p>
            <textarea
              aria-label={t('influencerCallSidePanel.s1MemoTitle')}
              className="mj-font-body mt-2.5 min-h-[104px] w-full resize-y rounded-lg border border-white/20 bg-white/5 p-3 text-[15px] leading-[1.7] text-white placeholder:text-white/45 focus:border-[var(--color-primary-coral-on-dark)] focus:outline-none focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)]"
              maxLength={MEMO_MAX_LENGTH}
              onChange={(event) => setMemoDraft(event.target.value)}
              placeholder={t('influencerCallSidePanel.s1MemoPlaceholder')}
              value={memoDraft}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                className="mj-font-label min-h-10 rounded-lg border border-white/35 bg-white/10 px-3.5 text-sm text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!memoDraft.trim() || memoSaving}
                onClick={() => void handleMemoSave()}
                type="button"
              >
                {memoSaving
                  ? t('influencerCallSidePanel.s1MemoSaving')
                  : t('influencerCallSidePanel.s1MemoSave')}
              </button>
              <span className="text-sm font-semibold text-white/55 tabular-nums">
                {t('influencerCallSidePanel.s1MemoCount', {
                  p0: memoDraft.length,
                  p1: MEMO_MAX_LENGTH,
                })}
              </span>
            </div>
            <p
              aria-live="polite"
              className={`mt-2 min-h-5 text-sm font-bold leading-[1.5] ${memoError ? 'text-[var(--color-error-on-dark)]' : 'text-[var(--color-success-on-dark)]'}`}
            >
              {memoError ?? memoNotice}
            </p>
          </>
        ) : (
          <p className="mt-2.5 text-sm font-medium leading-[1.6] text-white/65">
            {t('influencerCallSidePanel.s1MemoNoFan')}
          </p>
        )}
      </section>

      {/* 지난 회차 메모 — 이번 회차 메모와 섞이지 않도록 다른 회차의 최신 메모만 보여 준다. */}
      <section className="mt-5 border-t border-white/10 pt-4">
        <h3 className="text-sm font-extrabold text-white/90">
          {t('influencerCallSidePanel.s1PastMemoTitle')}
        </h3>
        <p
          className={`mt-2.5 text-[15px] font-medium leading-[1.75] text-white/80 ${memoOpen ? '' : 'line-clamp-2'}`}
        >
          {pastMemoContent || t('influencerCallSidePanel.s1PastMemoEmpty')}
        </p>
        {showMemoToggle ? (
          <button
            aria-expanded={memoOpen}
            className="mt-2 min-h-9 text-sm font-extrabold text-[var(--color-primary-coral-on-dark)]"
            onClick={() => setMemoOpen((open) => !open)}
            type="button"
          >
            {memoOpen ? t('influencerCallSidePanel.t24') : t('influencerCallSidePanel.t25')}
          </button>
        ) : null}
      </section>

      {/*
        응모 답변 — 팬이 응모할 때 직접 쓴 문장이다. 2분 통화의 첫 화두로 쓰라고 통화 화면에 둔다.
        접힌 상태에서는 첫 답변만 보여 주고, 필요하면 펼쳐 전체를 읽는다.
      */}
      {answers.length ? (
        <section className="mt-5 border-t border-white/10 pt-4">
          <h3 className="text-sm font-extrabold text-white/90">
            {t('influencerCallSidePanel.answersTitle')}
          </h3>
          <dl className="mt-2.5 grid gap-3">
            {(answersOpen ? answers : answers.slice(0, 1)).map((answer) => (
              <div key={answer.questionId}>
                <dt className="text-[13px] font-bold text-white/60">{answer.questionText}</dt>
                <dd className="mt-1 text-[15px] font-medium leading-[1.7] text-white/85">
                  {answer.answerText || t('influencerCallSidePanel.answersEmpty')}
                </dd>
              </div>
            ))}
          </dl>
          {answers.length > 1 ? (
            <button
              aria-expanded={answersOpen}
              className="mt-2 min-h-9 text-sm font-extrabold text-[var(--color-primary-coral-on-dark)]"
              onClick={() => setAnswersOpen((open) => !open)}
              type="button"
            >
              {answersOpen
                ? t('influencerCallSidePanel.answersCollapse')
                : t('influencerCallSidePanel.answersExpand')}
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="mt-5 border-t border-white/10 pt-4">
        <p className="text-[13px] font-bold text-white/65">{t('influencerCallSidePanel.t6')}</p>
        {nextEntry ? (
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <strong className="block truncate text-[17px] font-extrabold text-white">
                {nextEntry.nickname}
              </strong>
              <span className="mt-[3px] block text-sm font-medium text-white/65 tabular-nums">
                {nextEntry.position}{t('influencerCallSidePanel.t7')}
              </span>
            </div>
            <span
              aria-hidden="true"
              className="grid size-10 flex-none place-items-center rounded-lg bg-white/10 text-base font-extrabold text-white/90"
            >
              {nextEntry.nickname.slice(0, 1)}
            </span>
          </div>
        ) : (
          <p className="mt-2.5 text-sm font-medium leading-[1.6] text-white/65">
            {t('influencerCallSidePanel.t8')}
          </p>
        )}
      </section>

      {isSolo ? (
        <section aria-labelledby="ic-ops" className="mt-5 border-t border-white/10 pt-4">
          <h3 className="text-[13px] font-bold text-white/65" id="ic-ops">
            {t('influencerCallSidePanel.t9')}
          </h3>
          <p className="mt-[7px] text-sm font-medium leading-[1.55] text-white/75">
            {t('influencerCallSidePanel.s1OpsHint')}
          </p>
          <div className="mt-3 grid gap-2">
            {/*
              다음 팬 호출 — 이전에는 이 조작이 대기실에만 있어서, 통화가 끝날 때마다 화면을
              오가야 다음 팬을 부를 수 있었다. 진행 중인 통화가 있으면 부를 수 없으므로 잠근다.
            */}
            <button
              className="mj-font-label min-h-11 rounded-lg border border-[color-mix(in_srgb,var(--color-primary-coral-on-dark)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-primary-coral)_26%,var(--color-surface-dark-panel))] text-[15px] text-white transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary-coral)_38%,var(--color-surface-dark-panel))] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canCallNext || opsBusy}
              onClick={() => void handleCallNext()}
              type="button"
            >
              {t('influencerCallSidePanel.s1CallNext')}
            </button>
            {/*
              노쇼는 팬이 들어오지 않은 상태의 조치다. 통화가 시작된 뒤에도 눌리면 대화 중인 팬을
              노쇼로 남기게 되므로, 연결이 확인되면 버튼 자체를 감춘다.
            */}
            {callConnected ? null : (
              <button
                className="mj-font-label min-h-11 rounded-lg border border-[color-mix(in_srgb,var(--color-error-on-dark)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_24%,var(--color-surface-dark-panel))] text-[15px] text-[var(--color-error-on-dark)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-error)_34%,var(--color-surface-dark-panel))] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!currentEntry || opsBusy}
                onClick={() => {
                  setOpsError(undefined)
                  setConfirm('noshow')
                }}
                type="button"
              >
                {t('influencerCallSidePanel.t11')}
              </button>
            )}
            <button
              className="mj-font-label min-h-11 rounded-lg border border-white/35 bg-white/10 text-[15px] text-white/90 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!currentEntry || opsBusy}
              onClick={() => {
                setOpsError(undefined)
                setConfirm('skip')
              }}
              type="button"
            >
              {t('influencerCallSidePanel.t12')}
            </button>
          </div>
          {/* 확인 창을 거치지 않는 조작(다음 팬 호출)의 실패도 알려야 하므로 여기에도 둔다. */}
          {opsError && confirm === undefined ? (
            <p
              className="mt-2.5 text-sm font-bold leading-[1.55] text-[var(--color-error-on-dark)]"
              role="alert"
            >
              {opsError}
            </p>
          ) : null}
        </section>
      ) : null}

      <Dialog
        description={
          confirm === 'noshow'
            ? t('influencerCallSidePanel.s1NoShowDesc', { p0: currentFanName ?? t('influencerCallSidePanel.t26') })
            : nextEntry
              ? t('influencerCallSidePanel.s1SkipDesc', { p0: nextEntry.position, p1: nextEntry.nickname, p2: currentFanName ?? t('influencerCallSidePanel.t27') })
              : t('influencerCallSidePanel.t28')
        }
        footer={
          <>
            <Button disabled={opsBusy} onClick={() => setConfirm(undefined)} variant="secondary">
              {t('influencerCallSidePanel.t13')}
            </Button>
            <Button
              loading={opsBusy}
              onClick={() => void (confirm === 'noshow' ? handleNoShow() : handleSkip())}
              variant={confirm === 'noshow' ? 'danger' : 'primary'}
            >
              {confirm === 'noshow' ? t('influencerCallSidePanel.t29') : t('influencerCallSidePanel.t30')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !opsBusy) setConfirm(undefined)
        }}
        open={confirm !== undefined}
        title={
          confirm === 'noshow'
            ? t('influencerCallSidePanel.t35', { p0: currentFanName ?? t('influencerCallSidePanel.t31') })
            : t('influencerCallSidePanel.t32')
        }
      >
        {confirm === 'noshow' || opsError ? (
          <div className="grid gap-3">
            {confirm === 'noshow' ? (
              <p
                className="rounded-lg bg-[var(--color-error-soft)] px-[15px] py-[13px] text-[15px] font-bold leading-[1.55] text-[var(--color-error)]"
                role="alert"
              >
                {t('influencerCallSidePanel.t14')}
              </p>
            ) : null}
            {opsError ? (
              <AlertBanner title={t('influencerCallSidePanel.t15')} variant="error">
                {opsError}
              </AlertBanner>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </aside>
  )
}
