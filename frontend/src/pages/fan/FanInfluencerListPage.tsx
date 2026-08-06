import { ArrowRight, Check, MagnifyingGlass, UsersThree } from '@phosphor-icons/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  followInfluencer,
  getInfluencers,
  getMyFollowings,
  unfollowInfluencer,
  type FollowingSummaryResponse,
  type InfluencerSummaryResponse,
} from '../../api/influencers'
import {
  AlertBanner,
  Avatar,
  Button,
  Card,
  CardContent,
  EmptyState,
  Pagination,
  Spinner,
  Tabs,
  TextField,
} from '../../components'
import { useTranslation } from '../../i18n'

/** 3열 그리드가 정확히 채워지도록 12개씩 끊어 받는다. */
const PAGE_SIZE = 12

/** 주소에 남는 탭 값이다. 새로고침·뒤로가기에도 보던 목록이 유지된다. */
type TabValue = 'discover' | 'following'

/** 주소의 tab 값을 알려진 탭으로 좁힌다. 규격 밖 값은 기본 탭으로 되돌린다. */
function toTabValue(value: string | null): TabValue {
  return value === 'following' ? 'following' : 'discover'
}

/** 백엔드 LocalDateTime 문자열을 한국어 날짜 표기로 바꾼다. */
function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * 공개 인플루언서를 검색하고 팔로우까지 처리하는 탐색 화면이다.
 *
 * 목록 조회는 로그인 없이도 되지만 팔로우는 FAN만 할 수 있어, 팔로우 버튼과 팔로잉 탭은
 * 로그인 역할에 따라 노출을 달리한다.
 */
export function FanInfluencerListPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = toTabValue(searchParams.get('tab'))

  const session = getAuthSession()
  const authToken = session?.accessToken
  // 팔로우는 FAN 전용 API다. 다른 역할로 로그인한 사용자에게는 버튼 자체를 보이지 않는다.
  const canFollow = !session || session.role === 'FAN'

  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [influencers, setInfluencers] = useState<InfluencerSummaryResponse[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const [followings, setFollowings] = useState<FollowingSummaryResponse[]>()
  const [followingPage, setFollowingPage] = useState(1)
  const [followingTotalPages, setFollowingTotalPages] = useState(1)
  const [followingError, setFollowingError] = useState<string>()

  // 팔로우 상태를 목록 응답과 별도로 들고 있는다. 버튼을 누를 때마다 목록을 다시 받지 않아도
  // 화면이 즉시 바뀌고, 탐색 탭과 팔로잉 탭이 같은 최신 상태를 공유한다.
  // 카드에 팔로워 수가 함께 보이므로 응답이 준 갱신된 수치도 같이 담아 둔다.
  const [followOverrides, setFollowOverrides] = useState<
    Record<number, { following: boolean; followerCount: number }>
  >({})
  const [pendingFollowId, setPendingFollowId] = useState<number>()
  const [followError, setFollowError] = useState<string>()

  useEffect(() => {
    if (tab !== 'discover') return

    const controller = new AbortController()

    setLoading(true)
    setError(undefined)

    void getInfluencers(
      { keyword: keyword || undefined, page: page - 1, size: PAGE_SIZE },
      authToken,
      controller.signal,
    )
      .then((result) => {
        setInfluencers(result.content)
        setTotalPages(Math.max(1, result.totalPages))
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof ApiError ? cause.message : t('fanInfluencerListPage.t12'),
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, page, tab, authToken])

  useEffect(() => {
    if (tab !== 'following' || !authToken) return

    const controller = new AbortController()

    setFollowings(undefined)
    setFollowingError(undefined)

    void getMyFollowings(
      { page: followingPage - 1, size: PAGE_SIZE },
      authToken,
      controller.signal,
    )
      .then((result) => {
        setFollowings(result.content)
        setFollowingTotalPages(Math.max(1, result.totalPages))
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setFollowings([])
        setFollowingError(
          cause instanceof ApiError ? cause.message : t('fanInfluencerListPage.t22'),
        )
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authToken, followingPage])

  /** 검색어를 확정하고 첫 페이지로 되돌린다. 남은 페이지 번호로 조회하면 빈 목록이 나올 수 있다. */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setKeyword(String(formData.get('keyword') ?? '').trim())
    setPage(1)
  }

  /** 탭을 바꾼다. 주소만 갱신하고 목록은 각 탭의 조회 효과가 이어받는다. */
  function handleTabChange(value: string) {
    const next = new URLSearchParams(searchParams)
    if (toTabValue(value) === 'discover') next.delete('tab')
    else next.set('tab', 'following')
    setSearchParams(next, { replace: true })
  }

  /**
   * 팔로우를 켜고 끈다.
   *
   * 팔로잉 탭에서 취소하면 목록에서 사라져야 하므로 응답을 받은 뒤 해당 항목을 직접 걷어낸다.
   * 취소 후 화면이 비면 이전 페이지로 물러나 빈 목록만 남는 상황을 막는다.
   */
  const toggleFollow = useCallback(
    async (influencerId: number, currentlyFollowing: boolean) => {
      if (!authToken) {
        setFollowError(t('fanInfluencerListPage.t24'))
        return
      }

      setPendingFollowId(influencerId)
      setFollowError(undefined)

      try {
        const result = currentlyFollowing
          ? await unfollowInfluencer(influencerId, authToken)
          : await followInfluencer(influencerId, authToken)
        setFollowOverrides((current) => ({
          ...current,
          [influencerId]: {
            following: result.isFollowing,
            followerCount: result.followerCount,
          },
        }))

        if (currentlyFollowing) {
          setFollowings((current) => {
            if (!current) return current
            const next = current.filter((item) => item.influencerId !== influencerId)
            if (next.length === 0 && followingPage > 1) setFollowingPage(followingPage - 1)
            return next
          })
        }
      } catch (cause: unknown) {
        setFollowError(
          cause instanceof ApiError ? cause.message : t('fanInfluencerListPage.t23'),
        )
      } finally {
        setPendingFollowId(undefined)
      }
    },
    // t는 언어가 바뀔 때만 새로 만들어진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authToken, followingPage],
  )

  /** 목록 응답의 팔로우 여부에 이 화면에서 바꾼 상태를 덮어씌운다. */
  function isFollowing(influencerId: number, fromServer: boolean): boolean {
    return followOverrides[influencerId]?.following ?? fromServer
  }

  /** 목록 응답의 팔로워 수에 이 화면에서 팔로우를 바꾼 뒤 받은 수치를 덮어씌운다. */
  function followerCountOf(influencerId: number, fromServer: number): number {
    return followOverrides[influencerId]?.followerCount ?? fromServer
  }

  /** 카드에 들어가는 팔로우 토글 버튼이다. 상태에 따라 문구와 스타일이 바뀐다. */
  function followButton(influencerId: number, following: boolean) {
    if (!canFollow) return null

    return (
      <Button
        aria-pressed={following}
        leadingIcon={following ? <Check aria-hidden size={15} weight="bold" /> : undefined}
        loading={pendingFollowId === influencerId}
        onClick={() => void toggleFollow(influencerId, following)}
        size="sm"
        variant={following ? 'secondary' : 'primary'}
      >
        {following ? t('fanInfluencerListPage.t19') : t('fanInfluencerListPage.t18')}
      </Button>
    )
  }

  const tabItems = [
    { value: 'discover', label: t('fanInfluencerListPage.t16') },
    { value: 'following', label: t('fanInfluencerListPage.t17') },
  ] as const

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-3xl font-black tracking-[-0.04em]">{t('fanInfluencerListPage.t1')}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('fanInfluencerListPage.t2')}
        </p>
      </header>

      {/* 팔로잉 탭은 로그인한 팬에게만 의미가 있어 팔로우 권한이 없으면 탭 줄을 감춘다. */}
      {canFollow && session ? (
        <Tabs
          ariaLabel={t('fanInfluencerListPage.t27')}
          items={tabItems}
          onValueChange={handleTabChange}
          value={tab}
        />
      ) : null}

      {followError ? (
        <AlertBanner title={t('fanInfluencerListPage.t6')} variant="error">
          {followError}
        </AlertBanner>
      ) : null}

      {tab === 'discover' ? (
        <>
          <Card>
            <CardContent>
              <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit}>
                <TextField
                  containerClassName="min-w-60 flex-1"
                  defaultValue={keyword}
                  endAdornment={
                    <MagnifyingGlass
                      aria-hidden
                      className="mr-3 text-[var(--color-text-tertiary)]"
                      size={18}
                    />
                  }
                  label={t('fanInfluencerListPage.t3')}
                  name="keyword"
                  placeholder={t('fanInfluencerListPage.t4')}
                  type="search"
                />
                <Button type="submit">{t('fanInfluencerListPage.t5')}</Button>
              </form>
            </CardContent>
          </Card>

          {error ? (
            <AlertBanner title={t('fanInfluencerListPage.t6')} variant="error">
              {error}
            </AlertBanner>
          ) : null}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Spinner label={t('fanInfluencerListPage.t7')} size="lg" />
            </div>
          ) : influencers.length === 0 ? (
            <EmptyState
              description={
                keyword
                  ? t('fanInfluencerListPage.t13')
                  : t('fanInfluencerListPage.t14')
              }
              title={t('fanInfluencerListPage.t8')}
            />
          ) : (
            <>
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {influencers.map((influencer) => {
                  const following = isFollowing(
                    influencer.influencerId,
                    influencer.isFollowing,
                  )
                  return (
                    <li key={influencer.influencerId}>
                      <Card className="h-full">
                        <CardContent className="grid h-full content-start gap-4">
                          <div className="flex items-center gap-4">
                            <Avatar
                              name={influencer.influencerName}
                              size="lg"
                              src={influencer.profileImageUrl ?? undefined}
                            />
                            <div className="grid gap-1">
                              <p className="text-lg font-extrabold">{influencer.influencerName}</p>
                              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                                <UsersThree aria-hidden size={15} weight="duotone" />
                                {t('fanInfluencerListPage.t9')} {followerCountOf(influencer.influencerId, influencer.followerCount).toLocaleString('ko-KR')}{t('fanInfluencerListPage.t10')}
                              </p>
                            </div>
                          </div>

                          <p className="line-clamp-3 min-h-15 text-sm leading-6 text-[var(--color-text-secondary)]">
                            {influencer.introduction ?? t('fanInfluencerListPage.t15')}
                          </p>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <Link
                              className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-primary-coral)]"
                              to={`/fan/influencers/${influencer.influencerId}`}
                            >
                              {t('fanInfluencerListPage.t11')}
                              <ArrowRight aria-hidden size={15} weight="bold" />
                            </Link>
                            {followButton(influencer.influencerId, following)}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  )
                })}
              </ul>

              <Pagination
                className="border-t border-[var(--color-divider)] pt-8"
                currentPage={page}
                onPageChange={setPage}
                totalPages={totalPages}
              />
            </>
          )}
        </>
      ) : (
        <>
          {followingError ? (
            <AlertBanner title={t('fanInfluencerListPage.t6')} variant="error">
              {followingError}
            </AlertBanner>
          ) : null}

          {followings === undefined ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Spinner label={t('fanInfluencerListPage.t26')} size="lg" />
            </div>
          ) : followings.length === 0 ? (
            <EmptyState
              description={t('fanInfluencerListPage.t21')}
              title={t('fanInfluencerListPage.t20')}
            />
          ) : (
            <>
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {followings.map((item) => (
                  <li key={item.influencerId}>
                    <Card className="h-full">
                      <CardContent className="grid h-full content-start gap-4">
                        <div className="flex items-center gap-4">
                          <Avatar
                            name={item.influencerName}
                            size="lg"
                            src={item.profileImageUrl ?? undefined}
                          />
                          <div className="grid gap-1">
                            <p className="text-lg font-extrabold">{item.influencerName}</p>
                            <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
                              {t('fanInfluencerListPage.t25', { p0: formatDate(item.followedAt) })}
                            </p>
                          </div>
                        </div>

                        <p className="line-clamp-3 min-h-15 text-sm leading-6 text-[var(--color-text-secondary)]">
                          {item.introduction ?? t('fanInfluencerListPage.t15')}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <Link
                            className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-primary-coral)]"
                            to={`/fan/influencers/${item.influencerId}`}
                          >
                            {t('fanInfluencerListPage.t11')}
                            <ArrowRight aria-hidden size={15} weight="bold" />
                          </Link>
                          {followButton(
                            item.influencerId,
                            isFollowing(item.influencerId, true),
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>

              <Pagination
                className="border-t border-[var(--color-divider)] pt-8"
                currentPage={followingPage}
                onPageChange={setFollowingPage}
                totalPages={followingTotalPages}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
