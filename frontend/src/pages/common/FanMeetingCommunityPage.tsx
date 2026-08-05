import { PencilSimple } from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import {
  createCommunityPost,
  getCommunityPosts,
  type CommunityPostSummaryResponse,
} from '../../api/community'
import type { PageResponse } from '../../api/envelope'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Pagination,
  SearchField,
  Spinner,
  Textarea,
  TextField,
} from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { useTranslation } from '../../i18n'

const PAGE_SIZE = 10

function formatDateTime(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function FanMeetingCommunityPage() {
  const { t } = useTranslation()
  const { fanMeetingId } = useParams()
  const [session] = useState(() => getAuthSession())
  const canWrite = session?.role === 'MANAGER' || session?.role === 'SOLO_INFLUENCER'
  const [keyword, setKeyword] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageData, setPageData] = useState<PageResponse<CommunityPostSummaryResponse>>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [reloadCount, setReloadCount] = useState(0)
  const [writeOpen, setWriteOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [writeError, setWriteError] = useState<string>()

  useEffect(() => {
    if (!fanMeetingId?.trim()) {
      setLoading(false)
      return
    }

    const abortController = new AbortController()
    setLoading(true)
    setError(undefined)

    getCommunityPosts(
      fanMeetingId,
      {
        keyword: keyword || undefined,
        page: currentPage - 1,
        size: PAGE_SIZE,
      },
      abortController.signal,
    )
      .then(setPageData)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') {
          return
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : '커뮤니티 게시글을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      })

    return () => abortController.abort()
  }, [fanMeetingId, keyword, currentPage, reloadCount])

  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!fanMeetingId?.trim() || !session) {
      return
    }

    const formData = new FormData(event.currentTarget)
    const title = String(formData.get('title') ?? '').trim()
    const content = String(formData.get('content') ?? '').trim()

    if (!title || !content) {
      setWriteError('제목과 내용을 모두 입력해 주세요.')
      return
    }

    setSubmitting(true)
    setWriteError(undefined)

    try {
      await createCommunityPost(fanMeetingId, { title, content }, session.accessToken)
      setWriteOpen(false)
      setCurrentPage(1)
      setReloadCount((count) => count + 1)
    } catch (createError: unknown) {
      setWriteError(
        createError instanceof Error ? createError.message : '게시글 작성에 실패했습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message={t('fanMeetingCommunityPage.t1')}
        title={t('fanMeetingCommunityPage.t2')}
      />
    )
  }

  const posts = pageData?.content ?? []
  const totalPages = Math.max(1, pageData?.totalPages ?? 1)

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-[-0.045em]">{t('fanMeetingCommunityPage.t3')}</h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            {t('fanMeetingCommunityPage.t4')}
          </p>
        </div>
        {canWrite ? (
          <Button
            leadingIcon={<PencilSimple aria-hidden size={18} weight="bold" />}
            onClick={() => {
              setWriteOpen((open) => !open)
              setWriteError(undefined)
            }}
            variant={writeOpen ? 'secondary' : 'primary'}
          >
            {writeOpen ? '작성 취소' : '글쓰기'}
          </Button>
        ) : null}
      </header>

      {canWrite && writeOpen ? (
        <Card>
          <CardContent>
            <form className="grid gap-4" onSubmit={(event) => void handleCreatePost(event)}>
              <TextField
                label={t('fanMeetingCommunityPage.t5')}
                name="title"
                placeholder={t('fanMeetingCommunityPage.t6')}
                required
              />
              <Textarea
                label={t('fanMeetingCommunityPage.t7')}
                name="content"
                placeholder={t('fanMeetingCommunityPage.t8')}
                required
                rows={6}
              />
              {writeError ? (
                <AlertBanner title={t('fanMeetingCommunityPage.t9')} variant="error">
                  {writeError}
                </AlertBanner>
              ) : null}
              <div className="flex justify-end">
                <Button loading={submitting} type="submit">
                  {t('fanMeetingCommunityPage.t10')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <SearchField
        buttonLabel="검색"
        label={t('fanMeetingCommunityPage.t11')}
        onSearch={(query) => {
          setKeyword(query.trim())
          setCurrentPage(1)
        }}
        placeholder={t('fanMeetingCommunityPage.t12')}
      />

      {error ? (
        <AlertBanner title={t('fanMeetingCommunityPage.t13')} variant="error">
          {error}
        </AlertBanner>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('fanMeetingCommunityPage.t14')} />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          description={
            keyword
              ? '검색어를 변경해 다시 시도해 주세요.'
              : '아직 등록된 게시글이 없습니다.'
          }
          title={t('fanMeetingCommunityPage.t15')}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-[var(--color-divider)]">
              {posts.map((post) => (
                <li key={post.postId}>
                  <Link
                    className="grid gap-1.5 px-6 py-5 transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:calc(var(--focus-ring-offset)*-1)]"
                    to={`/community/posts/${post.postId}`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {post.pinned ? <Badge variant="primary">{t('fanMeetingCommunityPage.t16')}</Badge> : null}
                      <span className="text-base font-bold text-[var(--color-text-primary)]">
                        {post.title}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-secondary)]">
                      <span>{post.authorNickname}</span>
                      <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!loading && posts.length > 0 ? (
        <Pagination
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          totalPages={totalPages}
        />
      ) : null}
    </div>
  )
}
