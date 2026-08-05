import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getAuthSession } from '../../api/auth'
import { getCallSessionStatus } from '../../api/callSessions'
import { CARD_DATA_TTL_MS, deleteFanCardData } from '../../api/capturedPhotos'
import { fetchPublicFanMeetingDetail } from '../../api/fanMeetings'
import { AlertBanner, Card, Spinner } from '../../components'
import { FanCardSection } from '../../components/fanCard/FanCardSection'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

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
  if (totalMinutes < 1) return '곧 사라져요'

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}시간 ${minutes}분`
  return `${minutes}분`
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

        const elapsed = new Date(status.serverNow).getTime()
          - new Date(status.endedAt).getTime()
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
            : '카드를 만들 수 있는 통화인지 확인하지 못했습니다.',
        })
      })

    return () => abortController.abort()
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
        message="주소가 올바르지 않아 기념 카드를 열 수 없습니다."
        title="기념 카드"
      />
    )
  }

  if (!session) {
    return (
      <InvalidRouteState
        message="기념 카드를 만들려면 먼저 로그인해 주세요."
        title="기념 카드"
      />
    )
  }

  const backTo = `/fan/fan-meetings/${fanMeetingId}/complete`

  return (
    // 바깥 main 이 이미 좌우 여백과 위아래 여백을 주므로 여기서는 폭만 좁힌다.
    <div className="mx-auto w-full max-w-3xl">
      <header>
        <h1 className="text-[25px] font-black tracking-[-0.035em]">기념 카드 만들기</h1>
        <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-secondary)]">
          통화에서 인상 깊었던 한마디와 남긴 사진으로 카드를 만들어 보세요.
        </p>
      </header>

      {expiry.kind === 'LOADING' ? (
        <div className="mt-8 flex items-center gap-3">
          <Spinner />
          <p className="text-sm text-[var(--color-text-secondary)]">
            카드를 만들 수 있는지 확인하고 있습니다.
          </p>
        </div>
      ) : null}

      {expiry.kind === 'ERROR' ? (
        <AlertBanner className="mt-8" title="확인하지 못했습니다" variant="error">
          {expiry.message}
        </AlertBanner>
      ) : null}

      {expiry.kind === 'EXPIRED' ? (
        <Card className="mt-8 p-8 text-center">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            카드를 만들 수 있는 기간이 지났어요
          </h2>
          <p className="mt-3 text-sm leading-[1.7] text-[var(--color-text-secondary)]">
            통화 화면 사진은 통화가 끝나고 하루 동안만 이 기기에 보관합니다.
            <br />
            보관 기간이 지나 사진과 꾸미던 내용을 모두 지웠습니다.
          </p>
          <Link
            className="mj-font-label mt-6 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-5 text-[15px] font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-page)]"
            to={backTo}
          >
            팬미팅 기록으로 돌아가기
          </Link>
        </Card>
      ) : null}

      {expiry.kind === 'AVAILABLE' ? (
        <>
          <AlertBanner className="mt-6" title="사진은 하루만 보관해요" variant="warning">
            남은 시간 {formatRemaining(expiry.remainingMs)}. 시간이 지나면 사진과 꾸미던
            내용이 사라지니, 마음에 드는 카드는 잊지 말고 내려받아 주세요.
          </AlertBanner>

          <FanCardSection
            authToken={session.accessToken}
            callSessionId={callSessionId}
            dateLabel={formatCardDate(expiry.endedAt)}
            fanNickname={session.nickname}
            influencerName={influencerName ?? '인플루언서'}
            meetingTitle={meetingTitle ?? '팬미팅'}
          />

          <div className="mt-8">
            <Link
              className="mj-font-label inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-5 text-[15px] font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-page)]"
              to={backTo}
            >
              팬미팅 기록으로 돌아가기
            </Link>
          </div>
        </>
      ) : null}
    </div>
  )
}
