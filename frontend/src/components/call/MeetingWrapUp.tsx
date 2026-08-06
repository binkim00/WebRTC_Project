import { CheckCircle, ProhibitInset, UsersThree } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { getAuthSession } from '../../api/authSession'
import { useTranslation } from '../../i18n'

/**
 * 팬미팅이 끝난 이유다.
 *
 * `ALL_CALLS_FINISHED`는 대기열의 팬을 모두 만나 더 진행할 통화가 없는 정상 종료이고,
 * `ENDED`·`CANCELED`는 운영자가 팬미팅 자체를 끝내거나 취소한 경우다.
 */
export type MeetingWrapUpReason = 'ALL_CALLS_FINISHED' | 'ENDED' | 'CANCELED'

/** 진행 결과 집계다. 대기열을 읽지 못했으면 넘기지 않는다. */
export type MeetingWrapUpTally = {
  /** 통화까지 마친 팬 수 */
  completed: number
  /** 노쇼·건너뜀으로 만나지 못한 팬 수 */
  missed: number
}

/**
 * 인플루언서가 팬미팅을 마친 뒤 보는 마무리 화면이다.
 *
 * 이전에는 안내 배너 한 줄을 띄우고 3초 뒤 홈으로 강제 이동시켰다. 팬미팅을 끝까지 진행한
 * 사람이 결과를 확인할 새도 없이 화면에서 밀려나고 다음에 무엇을 할지도 알 수 없었다.
 * 그래서 이 화면은 (1) 무엇이 끝났는지, (2) 몇 명을 만났는지, (3) 다음에 할 수 있는 일을
 * 함께 보여 주고, **이동 시점은 사용자가 정한다.**
 */
export function MeetingWrapUp({
  meetingId,
  reason,
  tally,
}: {
  meetingId: string
  reason: MeetingWrapUpReason
  tally?: MeetingWrapUpTally
}) {
  const { t } = useTranslation()
  // 팬미팅 목록 경로는 역할마다 다르다. 매니저를 인플루언서 경로로 보내면 라우터 가드에 막힌다.
  const role = getAuthSession()?.role
  const meetingListPath =
    role === 'MANAGER' ? '/manager/fan-meetings' : '/influencer/fan-meetings'
  const canceled = reason === 'CANCELED'
  const title = canceled
    ? t('meetingWrapUp.t6')
    : reason === 'ENDED'
      ? t('meetingWrapUp.t7')
      : t('meetingWrapUp.t8')
  const description = canceled
    ? t('meetingWrapUp.t9')
    : reason === 'ENDED'
      ? t('meetingWrapUp.t10')
      : t('meetingWrapUp.t11')

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8 py-14">
      <div className="grid justify-items-center gap-5 text-center">
        {canceled ? (
          <ProhibitInset
            aria-hidden
            className="text-[var(--color-text-tertiary)]"
            size={64}
            weight="duotone"
          />
        ) : (
          <CheckCircle
            aria-hidden
            className="text-[var(--color-success)]"
            size={64}
            weight="duotone"
          />
        )}
        <div>
          <h1 className="text-[clamp(26px,3vw,34px)] font-black leading-[1.15] tracking-[-0.04em] [text-wrap:balance]">
            {title}
          </h1>
          <p className="mt-3.5 text-[17px] font-medium leading-[1.7] text-[var(--color-text-body)]">
            {description}
          </p>
        </div>
      </div>

      {/* 진행 결과 — 취소된 팬미팅은 집계를 보여 줄 의미가 없어 감춘다. */}
      {tally && !canceled ? (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] bg-[var(--color-divider)]">
          <div className="bg-[var(--color-surface-panel)] px-6 py-5 text-center">
            <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('meetingWrapUp.t1')}</p>
            <p className="mt-1.5 text-[34px] font-black leading-none tracking-[-0.04em] tabular-nums">
              {tally.completed}
            </p>
          </div>
          <div className="bg-[var(--color-surface-panel)] px-6 py-5 text-center">
            <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('meetingWrapUp.t2')}</p>
            <p
              className={`mt-1.5 text-[34px] font-black leading-none tracking-[-0.04em] tabular-nums ${
                tally.missed > 0 ? 'text-[var(--color-warning)]' : ''
              }`}
            >
              {tally.missed}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2.5">
        {/*
          가장 자연스러운 다음 행동은 방금 만난 팬들의 기록을 보는 것이다.
          참가 팬 화면은 역할 공용 경로(/fan-meetings/{id}/fans)라 매니저·인플루언서 모두 열 수 있다.
        */}
        {canceled ? null : (
          <Link
            className="mj-font-emphasis flex min-h-14 items-center justify-center gap-2 rounded-[10px] bg-[var(--color-primary-coral)] px-6 text-[17px] text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
            to={`/fan-meetings/${encodeURIComponent(meetingId)}/fans`}
          >
            <UsersThree aria-hidden size={20} weight="bold" />
            {t('meetingWrapUp.t3')}
          </Link>
        )}
        <Link
          className="mj-font-label flex min-h-12 items-center justify-center rounded-[10px] border border-[var(--color-border-control)] px-6 text-base font-bold text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-text-tertiary)]"
          to={meetingListPath}
        >
          {t('meetingWrapUp.t4')}
        </Link>
        <Link
          className="mj-font-label flex min-h-11 items-center justify-center text-[15px] text-[var(--color-text-muted)] hover:text-[var(--color-primary-coral)]"
          to="/"
        >
          {t('meetingWrapUp.t5')}
        </Link>
      </div>
    </div>
  )
}
