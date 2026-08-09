import { useEffect, useState } from 'react'
import { parseServerDate } from '../../api/serverTime'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  getMyApplication,
  type MyApplicationResponse,
} from '../../api/applications'
import {
  fetchPublicFanMeetingDetail,
  isClosedFanMeetingStatus,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import {
  followInfluencer,
  getInfluencer,
  unfollowInfluencer,
} from '../../api/influencers'
import { markApplicationResultRevealed } from './applicationResultReveal'
import { JellyCelebration } from '../../components/celebration/JellyCelebration'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { translate, useTranslation } from '../../i18n'

function pad(part: number) {
  return String(part).padStart(2, '0')
}

/** 2026.07.27 18:00 */
function formatDateTime(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 2026.07.18 */
function formatDate(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/** 08.02 18:30 — 같은 해 안의 가까운 기한에 쓰는 짧은 표기다. */
function formatShortDateTime(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** mm:ss — 1:1 통화 시간 표기다. */
function formatCallDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`
}

/** 결과 발표까지 남은 시간을 "N일 N시간"으로 계산한다. 지났으면 0으로 고정한다. */
function formatRemaining(announceAt: string): string {
  const diff = Math.max(0, parseServerDate(announceAt).getTime() - Date.now())
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  return translate('fanApplicationResultPage.t42', { p0: days, p1: hours })
}

function isResultPublished(detail: PublicFanMeetingDetail | undefined): boolean {
  return (
    detail?.meeting.status === 'READY' ||
    detail?.meeting.status === 'LIVE' ||
    detail?.meeting.status === 'ENDED'
  )
}

export function FanApplicationResultPage() {
  const { t } = useTranslation()
  const { meetingId } = useParams()
  const [application, setApplication] = useState<MyApplicationResponse | null>()
  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  // 발표 절차(READY 전환) 전에는 추첨 결과가 응답에 실려 있어도 화면에 공개하지 않는다.
  const [resultPublished, setResultPublished] = useState<boolean>()
  const [error, setError] = useState<string>()
  const [reloadKey, setReloadKey] = useState(0)
  // 낙첨 화면의 "다음 팬미팅 알림 받기"는 인플루언서 팔로우와 같은 기능이다. 백엔드는 팬미팅을
  // 공개할 때 팔로워에게 알림을 만들므로 팔로우 여부를 그대로 체크 상태로 쓴다.
  // undefined는 아직 팔로우 여부를 모른다는 뜻이며, 이때는 체크박스를 아예 그리지 않는다.
  const [following, setFollowing] = useState<boolean>()
  const [followPending, setFollowPending] = useState(false)
  const [followError, setFollowError] = useState<string>()

  useEffect(() => {
    if (!meetingId?.trim()) return

    const controller = new AbortController()
    const session = getAuthSession()

    if (!session || session.role !== 'FAN') {
      setError(t('fanApplicationResultPage.t36'))
      return () => controller.abort()
    }

    setApplication(undefined)
    setError(undefined)
    setResultPublished(undefined)

    void getMyApplication(meetingId, session.accessToken, controller.signal)
      .then(async (result) => {
        setApplication(result)
        if (
          result &&
          (result.applicationStatus === 'SELECTED' ||
            result.applicationStatus === 'NOT_SELECTED')
        ) {
          try {
            const detail = await fetchPublicFanMeetingDetail(
              Number(meetingId),
              session.accessToken,
              controller.signal,
            )
            const published = isResultPublished(detail)
            setResultPublished(published)
            // 결과를 실제로 화면에 띄운 시점에만 "확인함"으로 기록한다. 이 기록이 있어야
            // 응모 내역 목록이 당첨·미당첨을 미리 노출하지 않는다.
            if (published) {
              markApplicationResultRevealed(session.userId, Number(meetingId))
            }
          } catch {
            if (controller.signal.aborted) return
            // 공개 여부를 확인하지 못하면 결과를 숨기는 쪽으로 처리한다.
            setResultPublished(false)
          }
        } else {
          setResultPublished(true)
        }
        setError(undefined)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(
          reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : t('fanApplicationResultPage.t37'),
        )
      })

    // 통화 시간·장비 점검 기한·발표 예정 시각은 응모 응답에 없어 공개 상세에서 보강한다.
    // 보조 정보이므로 실패해도 결과 표시는 막지 않는다.
    void fetchPublicFanMeetingDetail(
      Number(meetingId),
      session.accessToken,
      controller.signal,
    )
      .then((result) => setDetail(result))
      .catch(() => undefined)

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, reloadKey])

  const showsNotSelected =
    resultPublished === true && application?.applicationStatus === 'NOT_SELECTED'
  const influencerId = detail?.influencer.influencerId

  // 팔로우 여부는 응모·팬미팅 응답에 없어 인플루언서 상세에서 따로 읽는다. 낙첨 화면에서만
  // 쓰는 값이라 그 화면을 그릴 때만 조회한다. 실패하면 체크박스를 숨기고 결과 표시는 그대로 둔다.
  useEffect(() => {
    if (!showsNotSelected || influencerId === undefined) return

    const controller = new AbortController()
    const session = getAuthSession()
    if (!session) return () => controller.abort()

    void getInfluencer(influencerId, session.accessToken, controller.signal)
      .then((result) => setFollowing(result.isFollowing))
      .catch(() => undefined)

    return () => controller.abort()
  }, [showsNotSelected, influencerId])

  /**
   * 다음 팬미팅 알림 수신(= 인플루언서 팔로우)을 켜고 끈다.
   *
   * 이 화면은 팔로워 수를 보여 주지 않으므로 응답에서 팔로우 여부만 반영한다.
   */
  async function toggleFollow() {
    if (influencerId === undefined || following === undefined) return

    // 이 화면은 팬 세션이 없으면 위에서 오류 화면으로 대체되므로 여기까지 오는 일은 거의 없다.
    const session = getAuthSession()
    if (!session) {
      setFollowError(t('fanApplicationResultPage.t53'))
      return
    }

    setFollowPending(true)
    setFollowError(undefined)
    try {
      const result = following
        ? await unfollowInfluencer(influencerId, session.accessToken)
        : await followInfluencer(influencerId, session.accessToken)
      setFollowing(result.isFollowing)
    } catch (reason: unknown) {
      setFollowError(
        reason instanceof ApiError ? reason.message : t('fanApplicationResultPage.t53'),
      )
    } finally {
      setFollowPending(false)
    }
  }

  if (!meetingId?.trim()) {
    return (
      <InvalidRouteState
        message={t('fanApplicationResultPage.t1')}
        title={t('fanApplicationResultPage.t2')}
      />
    )
  }

  // dc.html의 오류 상태 — 실제 실패 사유를 본문으로 보여 주고 재시도를 제공한다.
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1240px] py-[72px]" role="alert">
        <h1 className="text-[clamp(28px,3vw,36px)] font-black leading-[1.16] tracking-[-0.045em] text-[var(--color-error)]">
          {t('fanApplicationResultPage.t3')}
        </h1>
        <p className="mt-4 max-w-[52ch] text-lg font-medium leading-[1.7] text-[var(--color-text-body)]">
          {error}
        </p>
        <button
          className="mj-font-emphasis mt-7 min-h-[54px] rounded-[10px] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-7 text-[17px] text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
          onClick={() => setReloadKey((key) => key + 1)}
          type="button"
        >
          {t('fanApplicationResultPage.t4')}
        </button>
      </div>
    )
  }

  // dc.html의 로딩 스켈레톤이다. 결과 공개 여부 확인이 끝나기 전에도 결과를 노출하지 않는다.
  if (application === undefined || resultPublished === undefined) {
    return (
      <div
        aria-busy="true"
        aria-label={t('fanApplicationResultPage.t5')}
        className="mx-auto w-full max-w-[1240px] py-16"
      >
        <div className="h-5 w-[120px] rounded-md bg-[var(--color-surface-muted)]" />
        <div className="mt-[18px] h-[52px] w-[46%] rounded-lg bg-[var(--color-surface-muted)]" />
        <div className="mt-9 h-[340px] rounded-xl bg-[var(--color-surface-muted)]" />
      </div>
    )
  }

  // 응모 이력이 없거나 취소한 경우는 결과 화면의 대상이 아니다. (dc.html 범위 밖의 기존 안내 유지)
  if (application === null || application.applicationStatus === 'WITHDRAWN') {
    return (
      <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-control)] px-6 py-16 text-center">
        <h1 className="text-xl font-black tracking-[-0.03em]">
          {application === null ? t('fanApplicationResultPage.t38') : t('fanApplicationResultPage.t39')}
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          {application === null
            ? t('fanApplicationResultPage.t40')
            : t('fanApplicationResultPage.t41')}
        </p>
        <Link
          className="mj-font-label mt-6 inline-flex min-h-[var(--control-height)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-6 py-2 text-sm transition-colors hover:bg-[var(--color-surface-page)]"
          to={`/fan/events/${meetingId}`}
        >
          {t('fanApplicationResultPage.t6')}
        </Link>
      </div>
    )
  }

  const announcedAtLabel = application.resultDecidedAt
    ? t('fanApplicationResultPage.t43', { p0: formatDateTime(application.resultDecidedAt) })
    : null
  const operation = detail?.meeting.operation
  const resultAnnounceAt = detail?.meeting.application.resultAnnouncementAt ?? null

  // 당첨 — 표현 강도 8, Signature S1(전체 폭 포트레이트)
  // 발표 절차 전(resultPublished false)에는 추첨이 끝났어도 아래 발표 대기 화면을 유지한다.
  if (resultPublished && application.applicationStatus === 'SELECTED') {
    // 장비 점검을 마쳐야 하는 실질 기한은 대기실 개방 시각이다. 미설정이면 팬미팅 시작 시각으로 안내한다.
    const deviceCheckDeadline = operation?.queueOpenAt ?? application.scheduledStartAt
    // 이 화면은 팬미팅이 끝난 뒤에도 계속 열 수 있다. 끝난 팬미팅에서는 장비 점검이
    // 서버에서 막히므로 안내와 버튼을 기록 동선으로 바꾼다.
    const meetingClosed = isClosedFanMeetingStatus(detail?.meeting.status)

    return (
      <div className="-mx-4 -mt-8 sm:-mx-6 lg:-mx-10 lg:-mt-10">
        {/* 커버 이미지는 두지 않는다. 젤리 축하 연출과 겹쳐 화면만 무거워지고 정보가 아니다. */}
        <div className="mx-auto w-[min(100%-40px,1240px)] pb-[72px] pt-11 min-[1081px]:w-[min(100%-88px,1240px)]">
          {/* 당첨 문구 위에 배치하는 장식형 축하 연출 — 버튼·정보를 가리지 않는다. */}
          <JellyCelebration className="mb-2 h-[clamp(225px,27vw,315px)]" />
          {announcedAtLabel ? (
            <p className="jc-heading-intro text-[15px] font-bold text-[var(--color-primary-coral)]">
              {announcedAtLabel}
            </p>
          ) : null}
          <h1 className="jc-heading-intro mt-3.5 text-[clamp(38px,4.4vw,58px)] font-black leading-[1.1] tracking-[-0.05em] [text-wrap:balance]">
            {t('fanApplicationResultPage.t7')}
          </h1>
          <p className="jc-heading-intro mt-[18px] max-w-[46ch] text-xl font-medium leading-[1.6] text-[var(--color-text-body)]">
            {application.meetingTitle}
            {meetingClosed
              ? t('fanApplicationResultPage.t46')
              : t('fanApplicationResultPage.t8')}
          </p>

          <div className="mt-11 grid items-start gap-10 border-t border-[var(--color-divider)] pt-8 lg:grid-cols-[1fr_460px] lg:gap-[72px]">
            <section aria-label={t('fanApplicationResultPage.t9')}>
              <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('fanApplicationResultPage.t10')}</p>
                  <p className="mt-1.5 text-2xl font-black tracking-[-0.035em] tabular-nums">
                    {formatDateTime(application.scheduledStartAt)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('fanApplicationResultPage.t11')}</p>
                  <p className="mt-1.5 text-2xl font-black tracking-[-0.035em] tabular-nums">
                    {operation ? formatCallDuration(operation.callDurationSec) : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('fanApplicationResultPage.t12')}</p>
                  <p className="mt-1.5 text-2xl font-black tracking-[-0.035em]">
                    {application.influencerName}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('fanApplicationResultPage.t13')}</p>
                  <p className="mt-1.5 text-2xl font-black tracking-[-0.035em] tabular-nums">
                    {formatShortDateTime(deviceCheckDeadline)}
                  </p>
                </div>
              </div>
              <p className="mt-7 max-w-[56ch] border-t border-[var(--color-divider)] pt-5 text-base font-medium leading-[1.75] text-[var(--color-text-muted)]">
                {meetingClosed
                  ? t('fanApplicationResultPage.t47')
                  // 대기실 입장 시각은 queueOpenAt 이 정한다. earlyStartMinutes 는 매니저가 예정보다
                  // 일찍 시작할 수 있는 여유라 팬 안내에 쓸 값이 아니었고, 값이 커서 "17280분 전부터"
                  // 처럼 읽혔다.
                  : `${t('fanApplicationResultPage.t14')} ${
                    operation?.queueOpenAt
                      ? t('fanApplicationResultPage.t15', {
                        p0: formatDateTime(operation.queueOpenAt),
                      })
                      : t('fanApplicationResultPage.t50')
                  }`}
              </p>
            </section>
            <section aria-label={t('fanApplicationResultPage.t16')}>
              <Link
                className="mj-font-emphasis flex min-h-[58px] w-full items-center justify-center rounded-[10px] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-[17px] text-white shadow-[var(--shadow-final-cta)] transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-[var(--color-primary-coral-hover)] active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none"
                to={
                  meetingClosed
                    ? `/fan/fan-meetings/${application.meetingId}/complete`
                    : `/fan-meetings/${application.meetingId}/device-check`
                }
              >
                {meetingClosed
                  ? t('fanApplicationResultPage.t48')
                  : t('fanApplicationResultPage.t17')}
              </Link>
              <p className="mt-5 text-[15px] font-medium leading-[1.7] text-[var(--color-text-muted)]">
                {meetingClosed
                  ? t('fanApplicationResultPage.t49')
                  : t('fanApplicationResultPage.t18')}
              </p>
            </section>
          </div>
        </div>
      </div>
    )
  }

  // 미당첨 — 표현 강도 3, 제스처 없음
  if (resultPublished && application.applicationStatus === 'NOT_SELECTED') {
    const capacity = detail?.meeting.application.capacity

    return (
      <div className="mx-auto w-full max-w-[1240px] py-[72px]">
        {announcedAtLabel ? (
          <p className="text-[15px] font-bold text-[var(--color-text-muted)]">{announcedAtLabel}</p>
        ) : null}
        <h1 className="mt-3.5 max-w-[24ch] text-[clamp(30px,3.2vw,40px)] font-black leading-[1.16] tracking-[-0.045em] [text-wrap:balance]">
          {t('fanApplicationResultPage.t19')}
        </h1>
        <p className="mt-[18px] max-w-[52ch] text-lg font-medium leading-[1.7] text-[var(--color-text-body)]">
          {application.meetingTitle}{t('fanApplicationResultPage.t20')}
        </p>

        <div className="mt-12 grid items-start gap-10 border-t border-[var(--color-divider)] pt-8 lg:grid-cols-[1fr_400px] lg:gap-[72px]">
          <section aria-label={t('fanApplicationResultPage.t21')}>
            <h2 className="text-base font-extrabold tracking-[-0.025em]">{t('fanApplicationResultPage.t22')}</h2>
            <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
              <div>
                <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('fanApplicationResultPage.t23')}</p>
                <p className="mt-1.5 text-lg font-extrabold tabular-nums">
                  {formatDate(application.submittedAt)}
                </p>
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('fanApplicationResultPage.t24')}</p>
                <p className="mt-1.5 text-lg font-extrabold tabular-nums">
                  {capacity !== undefined ? t('fanApplicationResultPage.t45', { p0: capacity }) : '-'}
                </p>
              </div>
            </div>
            <p className="mt-[26px] max-w-[56ch] border-t border-[var(--color-divider)] pt-5 text-base font-medium leading-[1.75] text-[var(--color-text-muted)]">
              {t('fanApplicationResultPage.t25')}
            </p>
          </section>
          <section aria-label={t('fanApplicationResultPage.t26')}>
            <Link
              className="mj-font-emphasis flex min-h-[54px] items-center justify-center rounded-[10px] bg-[var(--color-primary-coral)] text-base text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
              to="/fan/events"
            >
              {t('fanApplicationResultPage.t27')}
            </Link>
            {following === undefined ? null : (
              <>
                <label
                  className={`mt-3.5 flex min-h-[52px] items-center gap-3 ${
                    followPending ? 'cursor-progress' : 'cursor-pointer'
                  }`}
                >
                  <input
                    checked={following}
                    className="m-0 size-[21px] flex-none accent-[var(--color-primary-coral)]"
                    disabled={followPending}
                    onChange={() => void toggleFollow()}
                    type="checkbox"
                  />
                  <span className="text-base font-semibold text-[var(--color-text-muted)]">
                    {application.influencerName}{t('fanApplicationResultPage.t28')}
                  </span>
                </label>
                <p
                  aria-live="polite"
                  className={`mt-1.5 text-[15px] font-medium leading-[1.6] ${
                    followError ? 'text-[var(--color-error)]' : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {followError ??
                    (following
                      ? t('fanApplicationResultPage.t51')
                      : t('fanApplicationResultPage.t52'))}
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    )
  }

  // 발표 전(SUBMITTED) — 결과 대기
  return (
    <div className="mx-auto w-full max-w-[1240px] py-[72px]">
      <p className="text-[15px] font-bold text-[var(--color-text-muted)]">
        {t('fanApplicationResultPage.t30')}
      </p>
      <h1 className="mt-3.5 text-[clamp(30px,3.2vw,40px)] font-black leading-[1.16] tracking-[-0.045em]">
        {t('fanApplicationResultPage.t31')}
      </h1>

      <div className="mt-10 max-w-[520px] border-t-2 border-[var(--color-text-primary)] pt-7">
        <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('fanApplicationResultPage.t32')}</p>
        <p className="mt-2 text-[clamp(40px,5vw,60px)] font-black leading-none tracking-[-0.05em] tabular-nums">
          {resultAnnounceAt ? formatRemaining(resultAnnounceAt) : '-'}
        </p>
        {resultAnnounceAt ? (
          <p className="mt-3.5 text-[17px] font-medium tabular-nums text-[var(--color-text-muted)]">
            {formatDateTime(resultAnnounceAt)} {t('fanApplicationResultPage.t33')}
          </p>
        ) : null}
      </div>

      <p className="mt-9 max-w-[56ch] border-t border-[var(--color-divider)] pt-6 text-[17px] font-medium leading-[1.75] text-[var(--color-text-body)]">
        {t('fanApplicationResultPage.t34')}
      </p>
      <Link
        className="mj-font-label mt-[26px] inline-flex min-h-[52px] items-center rounded-[10px] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-6 text-base hover:border-[var(--color-text-muted)]"
        to="/fan/mypage/applications"
      >
        {t('fanApplicationResultPage.t35')}
      </Link>
    </div>
  )
}
