import { ArrowLeft, ArrowRight, LinkSimple, UsersThree } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { getInfluencer, type InfluencerDetailResponse } from '../../api/influencers'
import {
  AlertBanner,
  Avatar,
  Badge,
  Card,
  CardContent,
  EmptyState,
  Spinner,
} from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { fanMeetingStatusContent } from './fanMeetingStatus'
import { useTranslation } from '../../i18n'

/** 백엔드 LocalDateTime 문자열을 한국어 날짜·시각 표기로 바꾼다. */
function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** 인플루언서 한 명의 소개와 공개 팬미팅 목록을 보여 준다. 로그인 없이도 볼 수 있다. */
export function FanInfluencerDetailPage() {
  const { t } = useTranslation()
  const influencerId = Number(useParams().influencerId)
  const validId = Number.isInteger(influencerId) && influencerId > 0

  const [detail, setDetail] = useState<InfluencerDetailResponse>()
  const [loading, setLoading] = useState(validId)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!validId) return

    const controller = new AbortController()
    const authToken = getAuthSession()?.accessToken

    setLoading(true)
    setError(undefined)

    void getInfluencer(influencerId, authToken, controller.signal)
      .then(setDetail)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof ApiError ? cause.message : '인플루언서 정보를 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [influencerId, validId])

  if (!validId) {
    return (
      <InvalidRouteState
        message={t('fanInfluencerDetailPage.t1')}
        title={t('fanInfluencerDetailPage.t2')}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label={t('fanInfluencerDetailPage.t3')} size="lg" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="grid gap-5">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold"
          to="/fan/influencers"
        >
          <ArrowLeft size={17} /> {t('fanInfluencerDetailPage.t4')}
        </Link>
        <AlertBanner title={t('fanInfluencerDetailPage.t5')} variant="error">
          {error ?? '해당 인플루언서를 찾을 수 없습니다.'}
        </AlertBanner>
      </div>
    )
  }

  return (
    <div className="grid gap-8">
      <Link
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary-coral)]"
        to="/fan/influencers"
      >
        <ArrowLeft size={17} /> {t('fanInfluencerDetailPage.t6')}
      </Link>

      <header className="flex flex-wrap items-center gap-6">
        <Avatar
          name={detail.influencerName}
          size="lg"
          src={detail.profileImageUrl ?? undefined}
        />
        <div className="grid gap-2">
          <h1 className="text-3xl font-black tracking-[-0.04em]">{detail.influencerName}</h1>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-secondary)]">
            <UsersThree aria-hidden size={17} weight="duotone" />
            {t('fanInfluencerDetailPage.t7')} {detail.followerCount.toLocaleString('ko-KR')}{t('fanInfluencerDetailPage.t8')}
          </p>
          {detail.socialUrl ? (
            <a
              className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--color-primary-coral)]"
              href={detail.socialUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              <LinkSimple aria-hidden size={16} weight="bold" />
              {t('fanInfluencerDetailPage.t9')}
            </a>
          ) : null}
        </div>
      </header>

      {detail.introduction ? (
        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-xl font-black tracking-[-0.03em]">{t('fanInfluencerDetailPage.t10')}</h2>
            <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-text-secondary)]">
              {detail.introduction}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-5">
        <h2 className="text-xl font-black tracking-[-0.03em]">{t('fanInfluencerDetailPage.t11')}</h2>
        {detail.meetings.length === 0 ? (
          <EmptyState
            description={t('fanInfluencerDetailPage.t12')}
            title={t('fanInfluencerDetailPage.t13')}
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {detail.meetings.map((meeting) => (
              <li key={meeting.meetingId}>
                <Card className="h-full overflow-hidden">
                  {meeting.coverImageUrl ? (
                    <img
                      alt={`${meeting.title} 썸네일`}
                      className="aspect-[16/7] w-full object-cover"
                      src={meeting.coverImageUrl}
                    />
                  ) : null}
                  <CardContent className="grid content-start gap-3">
                    <Badge
                      className="w-fit"
                      variant={fanMeetingStatusContent[meeting.status].variant}
                    >
                      {fanMeetingStatusContent[meeting.status].label}
                    </Badge>
                    <p className="text-base font-extrabold">{meeting.title}</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {formatDateTime(meeting.scheduledStartAt)}
                    </p>
                    <Link
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-primary-coral)]"
                      to={`/fan/events/${meeting.meetingId}`}
                    >
                      {t('fanInfluencerDetailPage.t14')}
                      <ArrowRight aria-hidden size={15} weight="bold" />
                    </Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
