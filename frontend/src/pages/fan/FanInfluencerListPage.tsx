import { ArrowRight, MagnifyingGlass, UsersThree } from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import { getInfluencers, type InfluencerSummaryResponse } from '../../api/influencers'
import {
  AlertBanner,
  Avatar,
  Button,
  Card,
  CardContent,
  EmptyState,
  Pagination,
  Spinner,
  TextField,
} from '../../components'
import { useTranslation } from '../../i18n'

/** 3열 그리드가 정확히 채워지도록 12개씩 끊어 받는다. */
const PAGE_SIZE = 12

/** 공개 인플루언서를 검색하고 상세로 이동하는 탐색 화면이다. 로그인 없이도 볼 수 있다. */
export function FanInfluencerListPage() {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [influencers, setInfluencers] = useState<InfluencerSummaryResponse[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    const authToken = getAuthSession()?.accessToken

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
          cause instanceof ApiError ? cause.message : '인플루언서 목록을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [keyword, page])

  /** 검색어를 확정하고 첫 페이지로 되돌린다. 남은 페이지 번호로 조회하면 빈 목록이 나올 수 있다. */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setKeyword(String(formData.get('keyword') ?? '').trim())
    setPage(1)
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-3xl font-black tracking-[-0.04em]">{t('fanInfluencerListPage.t1')}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('fanInfluencerListPage.t2')}
        </p>
      </header>

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
              ? '검색어와 일치하는 인플루언서가 없습니다. 다른 검색어를 입력해 보세요.'
              : '아직 공개된 인플루언서가 없습니다.'
          }
          title={t('fanInfluencerListPage.t8')}
        />
      ) : (
        <>
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {influencers.map((influencer) => (
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
                          {t('fanInfluencerListPage.t9')} {influencer.followerCount.toLocaleString('ko-KR')}{t('fanInfluencerListPage.t10')}
                        </p>
                      </div>
                    </div>

                    <p className="line-clamp-3 min-h-15 text-sm leading-6 text-[var(--color-text-secondary)]">
                      {influencer.introduction ?? '등록된 소개가 없습니다.'}
                    </p>

                    <Link
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-primary-coral)]"
                      to={`/fan/influencers/${influencer.influencerId}`}
                    >
                      {t('fanInfluencerListPage.t11')}
                      <ArrowRight aria-hidden size={15} weight="bold" />
                    </Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            className="border-t border-[var(--color-divider)] pt-8"
            currentPage={page}
            onPageChange={setPage}
            totalPages={totalPages}
          />
        </>
      )}
    </div>
  )
}
