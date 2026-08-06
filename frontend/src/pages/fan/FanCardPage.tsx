import { ArrowLeft } from '@phosphor-icons/react'
import { parseServerDate } from '../../api/serverTime'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getAuthSession } from '../../api/auth'
import { getCallSessionStatus } from '../../api/callSessions'
import { CARD_DATA_TTL_MS, deleteFanCardData } from '../../api/capturedPhotos'
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
import { AlertBanner, Card, CardContent, Spinner } from '../../components'
import { FanCardSection } from '../../components/fanCard/FanCardSection'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { translate, useTranslation } from '../../i18n'

/** 2026.08.05 형식으로 표시한다. */
function formatCardDate(iso: string | null | undefined): string {
  const parsed = iso ? new Date(iso) : new Date()
  const target = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${target.getFullYear()}.${pad(target.getMonth() + 1)}.${pad(target.getDate())}`
}

/**
 * 남은 보관 시간을 사람이 읽는 문구로 바꾼다.
 *
 * @param remainingMs 남은 시간(밀리초)
 * @returns '3시간 20분' 같은 문구이며 1분 미만이면 '곧 사라져요'
 */
function formatRemaining(remainingMs: number): string {
  const totalMinutes = Math.floor(remainingMs / 60_000)
  if (totalMinutes < 1) return translate('fanCardPage.t1')

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return translate('fanCardPage.t2', { p0: hours, p1: minutes })
  return translate('fanCardPage.t3', { p0: minutes })
}

/** 보관 기간을 확인하는 동안의 상태다. */
type ExpiryState =
  | { kind: 'LOADING' }
  | { kind: 'AVAILABLE'; endedAt: string | null; remainingMs: number }
  | { kind: 'EXPIRED' }
  | { kind: 'ERROR'; message: string }

/**
 * 팬이 통화 기념 카드를 만드는 전용 화면이다.
 *
 * <p>완료 화면 안에 두면 녹화 안내와 기록 목록에 섞여 화면이 길어지고, 스티커를 끌어
 * 옮기기에도 좁다. 그래서 카드 만들기만 따로 떼어 넓게 쓴다.
 *
 * <p>통화 화면은 인플루언서의 얼굴이 담기므로 사진을 오래 두지 않는다. 통화가 끝나고
 * 하루가 지나면 카드를 만들 수 없고, 브라우저에 남은 사진과 꾸미던 상태도 지운다.
 * 만료 판정은 기기 시계가 아니라 서버가 알려 준 시각으로 하므로 시계를 돌려도 늘어나지
 * 않는다.
 */
export function FanCardPage() {
  const { t } = useTranslation()
  const { fanMeetingId, callSessionId } = useParams()
  const [session] = useState(() => getAuthSession())
  const [expiry, setExpiry] = useState<ExpiryState>({ kind: 'LOADING' })
  const [influencerName, setInfluencerName] = useState<string>()
  const [meetingTitle, setMeetingTitle] = useState<string>()

  useEffect(() => {
    if (!callSessionId?.trim() || !session) return

    const abortController = new AbortController()

    getCallSessionStatus(callSessionId, {
      authToken: session.accessToken,
      signal: abortController.signal,
    })
      .then((status) => {
        if (abortController.signal.aborted) return

        // 아직 끝나지 않은 통화라면 보관 기간을 세지 않는다.
        if (!status.endedAt) {
          setExpiry({ kind: 'AVAILABLE', endedAt: null, remainingMs: CARD_DATA_TTL_MS })
          return
        }

        const elapsed = parseServerDate(status.serverNow).getTime()
          - parseServerDate(status.endedAt).getTime()
        const remainingMs = CARD_DATA_TTL_MS - elapsed

        if (remainingMs <= 0) {
          setExpiry({ kind: 'EXPIRED' })
          // 만료된 사진은 화면을 막는 데 그치지 않고 실제로도 지운다.
          void deleteFanCardData(callSessionId)
          return
        }
        setExpiry({ kind: 'AVAILABLE', endedAt: status.endedAt, remainingMs })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setExpiry({
          kind: 'ERROR',
          message: error instanceof Error
            ? error.message
            : t('fanCardPage.t4'),
        })
      })

    return () => abortController.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callSessionId, session])

  useEffect(() => {
    if (!fanMeetingId?.trim() || !session) return

    const abortController = new AbortController()

    fetchPublicFanMeetingDetail(
      Number(fanMeetingId),
      session.accessToken,
      abortController.signal,
    )
      .then((meeting) => {
        if (abortController.signal.aborted) return
        setInfluencerName(meeting?.influencer.name)
        setMeetingTitle(meeting?.meeting.title)
      })
      // 이름과 제목을 못 받아도 카드에 기본값을 넣어 만들 수 있게 둔다.
      .catch(() => undefined)

    return () => abortController.abort()
  }, [fanMeetingId, session])

  if (!fanMeetingId?.trim() || !callSessionId?.trim()) {
    return (
      <InvalidRouteState
        message={t('fanCardPage.t5')}
        title={t('fanCardPage.t6')}
      />
    )
  }

  if (!session) {
    return (
      <InvalidRouteState
        message={t('fanCardPage.t7')}
        title={t('fanCardPage.t8')}
      />
    )
  }

  const backTo = `/fan/fan-meetings/${fanMeetingId}/complete`

  /**
   * 팬미팅 기록으로 돌아가는 버튼이다.
   *
   * 만료 화면과 카드 화면 두 곳에 같은 버튼이 필요해 한 번만 정의한다. 서비스의 보조 버튼과
   * 같은 높이·모서리·포커스 링을 쓴다.
   */
  function BackToRecordsLink({ className = '', to }: { className?: string; to: string }) {
    return (
      <Link
        className={`mj-font-label inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-5 text-[15px] font-bold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:var(--focus-ring-offset)] ${className}`}
        to={to}
      >
         {t('fanCardPage.t9')} </Link>
    )
  }

  return (
    // 바깥 main 이 이미 좌우 여백과 위아래 여백을 주므로 여기서는 폭만 좁힌다.
    <div className="mx-auto w-full max-w-3xl">
      <header>
        {/* 다른 팬 하위 화면과 같은 되돌아가기 위치·모양을 쓴다. */}
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary-coral)]"
          to={backTo}
        >
          <ArrowLeft aria-hidden size={18} weight="bold" />
           {t('fanCardPage.t10')} </Link>
        <h1 className="mt-5 text-4xl font-black tracking-[-0.045em]">{t('fanCardPage.t11')}</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
           {t('fanCardPage.t12')} </p>
      </header>

      {expiry.kind === 'LOADING' ? (
        <div className="mt-8 flex items-center gap-3">
          <Spinner />
          <p className="text-[15px] font-medium text-[var(--color-text-muted)]">
             {t('fanCardPage.t13')} </p>
        </div>
      ) : null}

      {expiry.kind === 'ERROR' ? (
        <AlertBanner className="mt-8" title={t('fanCardPage.t14')} variant="error">
          {expiry.message}
        </AlertBanner>
      ) : null}

      {expiry.kind === 'EXPIRED' ? (
        <Card className="mt-8">
          <CardContent className="py-12 text-center">
            <h2 className="text-xl font-extrabold tracking-[-0.03em] text-[var(--color-text-primary)]">
               {t('fanCardPage.t15')} </h2>
            <p className="mt-3 text-[15px] font-medium leading-[1.7] text-[var(--color-text-muted)]">
               {t('fanCardPage.t16')} <br />
               {t('fanCardPage.t17')} </p>
            <BackToRecordsLink className="mt-6" to={backTo} />
          </CardContent>
        </Card>
      ) : null}

      {expiry.kind === 'AVAILABLE' ? (
        <>
          <AlertBanner className="mt-6" title={t('fanCardPage.t18')} variant="warning">
             {t('fanCardPage.t19')} {formatRemaining(expiry.remainingMs)}{t('fanCardPage.t20')} </AlertBanner>

          <FanCardSection
            authToken={session.accessToken}
            callSessionId={callSessionId}
            dateLabel={formatCardDate(expiry.endedAt)}
            fanNickname={session.nickname}
            influencerName={influencerName ?? t('fanCardPage.t21')}
            meetingTitle={meetingTitle ?? t('fanCardPage.t22')}
          />

          <BackToRecordsLink className="mt-8" to={backTo} />
        </>
      ) : null}
    </div>
  )
}
