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
import { meetingStatusBadge, meetingStatusLabel } from '../manager/meetingLifecycle'

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
        message="올바른 인플루언서를 선택해 주세요."
        title="인플루언서 정보가 없습니다"
      />
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="인플루언서 정보를 불러오는 중" size="lg" />
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
          <ArrowLeft size={17} /> 인플루언서 탐색으로
        </Link>
        <AlertBanner title="인플루언서 정보를 표시할 수 없습니다" variant="error">
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
        <ArrowLeft size={17} /> 인플루언서 탐색으로
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
            팔로워 {detail.followerCount.toLocaleString('ko-KR')}명
          </p>
          {detail.socialUrl ? (
            <a
              className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--color-primary-coral)]"
              href={detail.socialUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              <LinkSimple aria-hidden size={16} weight="bold" />
              소셜 링크
            </a>
          ) : null}
        </div>
      </header>

      {detail.introduction ? (
        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-xl font-black tracking-[-0.03em]">소개</h2>
            <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--color-text-secondary)]">
              {detail.introduction}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-5">
        <h2 className="text-xl font-black tracking-[-0.03em]">공개 팬미팅</h2>
        {detail.meetings.length === 0 ? (
          <EmptyState
            description="이 인플루언서의 공개된 팬미팅이 아직 없습니다."
            title="예정된 팬미팅이 없습니다"
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
                    <Badge className="w-fit" variant={meetingStatusBadge(meeting.status)}>
                      {meetingStatusLabel(meeting.status)}
                    </Badge>
                    <p className="text-base font-extrabold">{meeting.title}</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {formatDateTime(meeting.scheduledStartAt)}
                    </p>
                    <Link
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-primary-coral)]"
                      to={`/fan/events/${meeting.meetingId}`}
                    >
                      자세히 보기
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
