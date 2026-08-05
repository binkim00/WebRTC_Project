import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  getMyApplication,
  type MyApplicationResponse,
} from '../../api/applications'
import {
  fetchPublicFanMeetingDetail,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

function pad(part: number) {
  return String(part).padStart(2, '0')
}

/** 2026.07.27 18:00 */
function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 2026.07.18 */
function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/** 08.02 18:30 — 같은 해 안의 가까운 기한에 쓰는 짧은 표기다. */
function formatShortDateTime(value: string): string {
  const date = new Date(value)
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
  const diff = Math.max(0, new Date(announceAt).getTime() - Date.now())
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  return `${days}일 ${hours}시간`
}

function isResultPublished(detail: PublicFanMeetingDetail | undefined): boolean {
  return (
    detail?.meeting.status === 'READY' ||
    detail?.meeting.status === 'LIVE' ||
    detail?.meeting.status === 'ENDED'
  )
}

export function FanApplicationResultPage() {
  const { meetingId } = useParams()
  const [application, setApplication] = useState<MyApplicationResponse | null>()
  const [detail, setDetail] = useState<PublicFanMeetingDetail>()
  // 발표 절차(READY 전환) 전에는 추첨 결과가 응답에 실려 있어도 화면에 공개하지 않는다.
  const [resultPublished, setResultPublished] = useState<boolean>()
  const [error, setError] = useState<string>()
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!meetingId?.trim()) return

    const controller = new AbortController()
    const session = getAuthSession()

    if (!session || session.role !== 'FAN') {
      setError('팬 계정으로 로그인한 뒤 응모 결과를 확인해 주세요.')
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
            setResultPublished(isResultPublished(detail))
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
            : '응모 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
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
  }, [meetingId, reloadKey])

  if (!meetingId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 팬미팅 ID가 없습니다. 응모한 이벤트 목록에서 다시 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  // dc.html의 오류 상태 — 실제 실패 사유를 본문으로 보여 주고 재시도를 제공한다.
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1240px] py-[72px]" role="alert">
        <h1 className="text-[clamp(28px,3vw,36px)] font-black leading-[1.16] tracking-[-0.045em] text-[var(--color-error)]">
          결과를 불러오지 못했어요
        </h1>
        <p className="mt-4 max-w-[52ch] text-lg font-medium leading-[1.7] text-[var(--color-text-body)]">
          {error}
        </p>
        <button
          className="mj-font-emphasis mt-7 min-h-[54px] rounded-[10px] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] px-7 text-[17px] text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
          onClick={() => setReloadKey((key) => key + 1)}
          type="button"
        >
          다시 불러오기
        </button>
      </div>
    )
  }

  // dc.html의 로딩 스켈레톤이다. 결과 공개 여부 확인이 끝나기 전에도 결과를 노출하지 않는다.
  if (application === undefined || resultPublished === undefined) {
    return (
      <div
        aria-busy="true"
        aria-label="응모 결과를 불러오는 중"
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
          {application === null ? '응모 내역이 없습니다' : '응모를 취소한 이벤트입니다'}
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          {application === null
            ? '이 이벤트에 응모한 기록을 찾을 수 없어요. 이벤트 상세에서 응모해 주세요.'
            : '응모를 취소해 결과를 확인할 수 없어요. 모집 중이라면 다시 응모할 수 있어요.'}
        </p>
        <Link
          className="mj-font-label mt-6 inline-flex min-h-[var(--control-height)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-6 py-2 text-sm transition-colors hover:bg-[var(--color-surface-page)]"
          to={`/fan/events/${meetingId}`}
        >
          이벤트 상세로 이동
        </Link>
      </div>
    )
  }

  const announcedAtLabel = application.resultDecidedAt
    ? `${formatDateTime(application.resultDecidedAt)} 발표`
    : null
  const operation = detail?.meeting.operation
  const resultAnnounceAt = detail?.meeting.application.resultAnnouncementAt ?? null

  // 당첨 — 표현 강도 8, Signature S1(전체 폭 포트레이트)
  // 발표 절차 전(resultPublished false)에는 추첨이 끝났어도 아래 발표 대기 화면을 유지한다.
  if (resultPublished && application.applicationStatus === 'SELECTED') {
    // 장비 점검을 마쳐야 하는 실질 기한은 대기실 개방 시각이다. 미설정이면 팬미팅 시작 시각으로 안내한다.
    const deviceCheckDeadline = operation?.queueOpenAt ?? application.scheduledStartAt

    return (
      <div className="-mx-4 -mt-8 sm:-mx-6 lg:-mx-10 lg:-mt-10">
        {/* 히어로는 축하 배경일 뿐 정보가 아니므로 본문을 밀어내지 않는 높이로 제한하고,
            이미지가 없으면 아예 그리지 않는다. */}
        {application.coverImageUrl ? (
          <figure className="relative m-0 h-[min(34vw,320px)] overflow-hidden bg-[var(--color-surface-muted)]">
            <img
              alt={`팬미팅에서 만나게 될 ${application.influencerName}`}
              className="absolute inset-0 size-full object-cover"
              src={application.coverImageUrl}
            />
          </figure>
        ) : null}

        <div className="mx-auto w-[min(100%-40px,1240px)] pb-[72px] pt-11 min-[1081px]:w-[min(100%-88px,1240px)]">
          {announcedAtLabel ? (
            <p className="text-[15px] font-bold text-[var(--color-primary-coral)]">
              {announcedAtLabel}
            </p>
          ) : null}
          <h1 className="mt-3.5 text-[clamp(38px,4.4vw,58px)] font-black leading-[1.1] tracking-[-0.05em] [text-wrap:balance]">
            당첨됐어요
          </h1>
          <p className="mt-[18px] max-w-[46ch] text-xl font-medium leading-[1.6] text-[var(--color-text-body)]">
            {application.meetingTitle}에 초대되었습니다. 팬미팅 전에 장비 점검을 마쳐 주세요.
          </p>

          <div className="mt-11 grid items-start gap-10 border-t border-[var(--color-divider)] pt-8 lg:grid-cols-[1fr_460px] lg:gap-[72px]">
            <section aria-label="팬미팅 정보">
              <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">팬미팅 일정</p>
                  <p className="mt-1.5 text-2xl font-black tracking-[-0.035em] tabular-nums">
                    {formatDateTime(application.scheduledStartAt)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">통화 시간</p>
                  <p className="mt-1.5 text-2xl font-black tracking-[-0.035em] tabular-nums">
                    {operation ? formatCallDuration(operation.callDurationSec) : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">인플루언서</p>
                  <p className="mt-1.5 text-2xl font-black tracking-[-0.035em]">
                    {application.influencerName}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--color-text-muted)]">장비 점검 기한</p>
                  <p className="mt-1.5 text-2xl font-black tracking-[-0.035em] tabular-nums">
                    {formatShortDateTime(deviceCheckDeadline)}
                  </p>
                </div>
              </div>
              <p className="mt-7 max-w-[56ch] border-t border-[var(--color-divider)] pt-5 text-base font-medium leading-[1.75] text-[var(--color-text-muted)]">
                기한까지 장비 점검을 완료하지 않으면 참여가 취소될 수 있습니다. 팬미팅 당일에는
                시작 {operation?.earlyStartMinutes ?? 10}분 전부터 대기실에 입장할 수 있어요.
              </p>
            </section>
            <section aria-label="다음 단계">
              <Link
                className="mj-font-emphasis flex min-h-[58px] w-full items-center justify-center rounded-[10px] border border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-[17px] text-white shadow-[var(--shadow-final-cta)] transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-[var(--color-primary-coral-hover)] active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none"
                to={`/fan-meetings/${application.meetingId}/device-check`}
              >
                장비 점검하기
              </Link>
              <p className="mt-5 text-[15px] font-medium leading-[1.7] text-[var(--color-text-muted)]">
                응모 내역과 결과는 마이페이지에서 다시 확인할 수 있습니다.
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
          이번에는 아쉽게 되지 않았어요
        </h1>
        <p className="mt-[18px] max-w-[52ch] text-lg font-medium leading-[1.7] text-[var(--color-text-body)]">
          {application.meetingTitle}에 응모해 주셔서 감사합니다.
        </p>

        <div className="mt-12 grid items-start gap-10 border-t border-[var(--color-divider)] pt-8 lg:grid-cols-[1fr_400px] lg:gap-[72px]">
          <section aria-label="응모 내역">
            <h2 className="text-base font-extrabold tracking-[-0.025em]">응모 내역</h2>
            <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
              <div>
                <p className="text-sm font-bold text-[var(--color-text-muted)]">응모일</p>
                <p className="mt-1.5 text-lg font-extrabold tabular-nums">
                  {formatDate(application.submittedAt)}
                </p>
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--color-text-muted)]">모집 결과</p>
                <p className="mt-1.5 text-lg font-extrabold tabular-nums">
                  {capacity !== undefined ? `${capacity}명 선정` : '-'}
                </p>
              </div>
            </div>
            <p className="mt-[26px] max-w-[56ch] border-t border-[var(--color-divider)] pt-5 text-base font-medium leading-[1.75] text-[var(--color-text-muted)]">
              선정은 응모 순서와 무관하게 진행됩니다. 다음 팬미팅 응모에는 영향을 주지 않습니다.
            </p>
          </section>
          <section aria-label="다음 단계">
            <Link
              className="mj-font-emphasis flex min-h-[54px] items-center justify-center rounded-[10px] bg-[var(--color-primary-coral)] text-base text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
              to="/fan/events"
            >
              다음 팬미팅 보기
            </Link>
            <label className="mt-3.5 flex min-h-[52px] cursor-not-allowed items-center gap-3">
              <input
                checked={false}
                className="m-0 size-[21px] flex-none accent-[var(--color-primary-coral)]"
                disabled
                readOnly
                type="checkbox"
              />
              <span className="text-base font-semibold text-[var(--color-text-muted)]">
                {application.influencerName}의 다음 팬미팅 알림 받기
              </span>
            </label>
            <p aria-live="polite" className="mt-1.5 text-[15px] font-medium leading-[1.6] text-[var(--color-text-muted)]">
              알림 설정 기능은 아직 제공되지 않습니다.
            </p>
          </section>
        </div>
      </div>
    )
  }

  // 발표 전(SUBMITTED) — 결과 대기
  return (
    <div className="mx-auto w-full max-w-[1240px] py-[72px]">
      <p className="text-[15px] font-bold text-[var(--color-text-muted)]">
        응모 완료 · 결과 대기 중
      </p>
      <h1 className="mt-3.5 text-[clamp(30px,3.2vw,40px)] font-black leading-[1.16] tracking-[-0.045em]">
        결과 발표를 기다리고 있어요
      </h1>

      <div className="mt-10 max-w-[520px] border-t-2 border-[var(--color-text-primary)] pt-7">
        <p className="text-sm font-bold text-[var(--color-text-muted)]">결과 발표까지</p>
        <p className="mt-2 text-[clamp(40px,5vw,60px)] font-black leading-none tracking-[-0.05em] tabular-nums">
          {resultAnnounceAt ? formatRemaining(resultAnnounceAt) : '-'}
        </p>
        {resultAnnounceAt ? (
          <p className="mt-3.5 text-[17px] font-medium tabular-nums text-[var(--color-text-muted)]">
            {formatDateTime(resultAnnounceAt)} 발표 예정
          </p>
        ) : null}
      </div>

      <p className="mt-9 max-w-[56ch] border-t border-[var(--color-divider)] pt-6 text-[17px] font-medium leading-[1.75] text-[var(--color-text-body)]">
        결과는 이 화면과 마이페이지 응모 내역에서 확인할 수 있습니다. 알림을 켜두면 발표 시각에
        안내를 보내드려요.
      </p>
      <Link
        className="mj-font-label mt-[26px] inline-flex min-h-[52px] items-center rounded-[10px] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-6 text-base hover:border-[var(--color-text-muted)]"
        to="/fan/mypage/applications"
      >
        마이페이지 응모 내역
      </Link>
    </div>
  )
}
