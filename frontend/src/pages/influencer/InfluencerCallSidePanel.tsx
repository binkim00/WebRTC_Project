import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { forceEndCallSession } from '../../api/callSessions'
import {
  fetchFanMemos,
  fetchMeetingQueue,
  markQueueEntryNoShow,
  type FanMemo,
  type MeetingQueue,
} from '../../api/fanMeetingParticipants'
import { changeQueuePosition } from '../../api/queueManagement'
import { AlertBanner, Button, Dialog } from '../../components'
import { useTranslation } from '../../i18n'

type ConfirmKind = 'noshow' | 'skip'

/**
 * 인플루언서 통화의 팬 정보 패널이다. (Influencer Call.dc.html 우측 260px)
 *
 * 1인 인플루언서(solo)에게만 운영 블록이 붙는다 — 통화 중에는 모니터링 화면을 볼 수 없으므로
 * 노쇼 처리와 다음 팬 넘기기의 최소 조작을 여기서 제공한다.
 */
export function InfluencerCallSidePanel({ meetingId }: { meetingId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [session] = useState(() => getAuthSession())
  const isSolo = session?.role === 'SOLO_INFLUENCER'
  const [queue, setQueue] = useState<MeetingQueue>()
  const [memo, setMemo] = useState<FanMemo>()
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
  const currentFanId = currentEntry?.fanId
  const callConnected = Boolean(queue?.currentCall?.startedAt)

  useEffect(() => {
    if (!currentFanId) {
      setMemo(undefined)
      return
    }
    const token = getAuthSession()?.accessToken
    if (!token) return

    const controller = new AbortController()
    void fetchFanMemos(currentFanId, token, controller.signal)
      .then((response) => setMemo(response.content[0]))
      .catch(() => {
        if (!controller.signal.aborted) setMemo(undefined)
      })
    return () => controller.abort()
  }, [currentFanId])

  /** 운영 조치 후에는 다음 팬을 호출할 대기실로 복귀한다. */
  function returnToReady() {
    navigate(`/influencer/fan-meetings/${encodeURIComponent(meetingId)}/ready`)
  }

  async function handleNoShow() {
    const token = getAuthSession()?.accessToken
    if (!token || !currentEntry || opsBusy) return

    setOpsBusy(true)
    setOpsError(undefined)
    try {
      await markQueueEntryNoShow(currentEntry.queueEntryId, token)
      // 화면 이동만으로는 서버 세션이 정리되지 않으므로 통화도 명시적으로 종료한다.
      const sessionId = queue?.currentCall?.callSessionId
      if (sessionId) {
        try {
          await forceEndCallSession(sessionId, { reason: '노쇼 처리' }, { authToken: token })
        } catch {
          // 노쇼 처리와 함께 서버가 세션을 이미 정리한 경우다.
        }
      }
      setConfirm(undefined)
      returnToReady()
    } catch (reason) {
      setOpsError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '노쇼 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setOpsBusy(false)
    }
  }

  async function handleSkip() {
    const token = getAuthSession()?.accessToken
    if (!token || !currentEntry || opsBusy) return

    setOpsBusy(true)
    setOpsError(undefined)
    try {
      // 지금 통화를 끝내고 현재 팬을 대기열 마지막으로 보낸다. 다음 호출은 대기실에서 진행한다.
      if (queue?.currentCall?.callSessionId) {
        await forceEndCallSession(
          queue.currentCall.callSessionId,
          { reason: '다음 팬으로 넘기기' },
          { authToken: token },
        )
      }
      // 다음 팬이 없으면 옮길 자리도 없으므로 통화 종료만으로 마무리한다.
      if (nextEntry) {
        await changeQueuePosition(currentEntry.queueEntryId, entries.length, token)
      }
      setConfirm(undefined)
      returnToReady()
    } catch (reason) {
      setOpsError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '다음 팬으로 넘기지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setOpsBusy(false)
    }
  }

  const memoContent = memo?.content ?? ''
  const showMemoToggle = memoContent.length > 60

  return (
    <aside
      aria-label={t('influencerCallSidePanel.t1')}
      className="min-w-0 rounded-xl border border-white/10 bg-[var(--color-surface-dark-panel)] p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white/65">{t('influencerCallSidePanel.t2')}</p>
          <h2 className="mt-1.5 truncate text-2xl font-black tracking-[-0.035em] text-white">
            {currentFanName ?? '확인 중'}
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
            {callConnected ? '통화 연결됨' : '연결 중'}
          </dd>
        </div>
      </dl>

      <section className="mt-5 border-t border-white/10 pt-4">
        <h3 className="text-sm font-extrabold text-white/90">{t('influencerCallSidePanel.t5')}</h3>
        <p
          className={`mt-2.5 text-[15px] font-medium leading-[1.75] text-white/80 ${memoOpen ? '' : 'line-clamp-2'}`}
        >
          {memoContent || '작성된 메모가 없습니다.'}
        </p>
        {showMemoToggle ? (
          <button
            aria-expanded={memoOpen}
            className="mt-2 min-h-9 text-sm font-extrabold text-[var(--color-primary-coral-on-dark)]"
            onClick={() => setMemoOpen((open) => !open)}
            type="button"
          >
            {memoOpen ? '메모 접기' : '메모 전체 보기'}
          </button>
        ) : null}
      </section>

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
            {t('influencerCallSidePanel.t10')}
          </p>
          <div className="mt-3 grid gap-2">
            <button
              className="mj-font-label min-h-11 rounded-lg border border-[color-mix(in_srgb,var(--color-error-on-dark)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_24%,var(--color-surface-dark-panel))] text-[15px] text-[var(--color-error-on-dark)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-error)_34%,var(--color-surface-dark-panel))] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!currentEntry}
              onClick={() => {
                setOpsError(undefined)
                setConfirm('noshow')
              }}
              type="button"
            >
              {t('influencerCallSidePanel.t11')}
            </button>
            <button
              className="mj-font-label min-h-11 rounded-lg border border-white/35 bg-white/10 text-[15px] text-white/90 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!currentEntry}
              onClick={() => {
                setOpsError(undefined)
                setConfirm('skip')
              }}
              type="button"
            >
              {t('influencerCallSidePanel.t12')}
            </button>
          </div>
        </section>
      ) : null}

      <Dialog
        description={
          confirm === 'noshow'
            ? `통화가 즉시 종료되고 ${currentFanName ?? '현재 팬'} 님은 대기열에서 빠집니다. 기록에 노쇼로 남으며 되돌릴 수 없습니다.`
            : nextEntry
              ? `지금 통화를 끝내고 ${nextEntry.position}번째 ${nextEntry.nickname} 님과의 연결을 대기실에서 이어갑니다. ${currentFanName ?? '현재 팬'} 님은 대기열 마지막으로 이동합니다.`
              : `대기열에 다음 팬이 없어 지금 통화를 끝내는 것으로 오늘 진행이 마무리됩니다.`
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
              {confirm === 'noshow' ? '노쇼 처리' : '다음 팬으로'}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !opsBusy) setConfirm(undefined)
        }}
        open={confirm !== undefined}
        title={
          confirm === 'noshow'
            ? `${currentFanName ?? '현재 팬'} 님을 노쇼로 처리할까요?`
            : '다음 팬으로 넘길까요?'
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
