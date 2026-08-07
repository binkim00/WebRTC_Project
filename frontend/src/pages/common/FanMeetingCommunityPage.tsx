import { PencilSimple } from '@phosphor-icons/react'
import { parseServerDate } from '../../api/serverTime'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/auth'
import {
  attachmentContentUrl,
  resolveAttachmentUrl,
  uploadAttachment,
  type AttachmentUploadResponse,
} from '../../api/attachments'
import {
  createCommunityPost,
  getCommunityPosts,
  COMMUNITY_ATTACHMENT_MAX_COUNT,
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
  const date = parseServerDate(iso)

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
  const [attachments, setAttachments] = useState<AttachmentUploadResponse[]>([])
  const [uploading, setUploading] = useState(false)

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
            : t('fanMeetingCommunityPage.t17'),
        )
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      })

    return () => abortController.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanMeetingId, keyword, currentPage, reloadCount])

  /** 고른 파일을 순서대로 올리고 게시글에 연결할 첨부 목록에 담는다. */
  async function uploadFiles(fileList: FileList | null) {
    const files = fileList ? [...fileList] : []
    if (!files.length || !session) return

    const room = COMMUNITY_ATTACHMENT_MAX_COUNT - attachments.length
    if (room <= 0) {
      setWriteError(
        t('fanMeetingCommunityPage.s6AttachmentFull', { p0: COMMUNITY_ATTACHMENT_MAX_COUNT }),
      )
      return
    }

    setUploading(true)
    setWriteError(undefined)
    try {
      // 서버가 개수를 거절하지 않도록 남은 자리만큼만 올린다.
      for (const file of files.slice(0, room)) {
        const uploaded = await uploadAttachment(file, 'COMMUNITY', session.accessToken)
        setAttachments((current) => [...current, uploaded])
      }
      if (files.length > room) {
        setWriteError(
          t('fanMeetingCommunityPage.s6AttachmentTrimmed', {
            p0: COMMUNITY_ATTACHMENT_MAX_COUNT,
            p1: files.length - room,
          }),
        )
      }
    } catch (uploadError: unknown) {
      setWriteError(
        uploadError instanceof Error
          ? uploadError.message
          : t('fanMeetingCommunityPage.s6UploadFailed'),
      )
    } finally {
      setUploading(false)
    }
  }

  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!fanMeetingId?.trim() || !session) {
      return
    }

    const formData = new FormData(event.currentTarget)
    const title = String(formData.get('title') ?? '').trim()
    const content = String(formData.get('content') ?? '').trim()

    if (!title || !content) {
      setWriteError(t('fanMeetingCommunityPage.t18'))
      return
    }

    setSubmitting(true)
    setWriteError(undefined)

    try {
      await createCommunityPost(
        fanMeetingId,
        {
          title,
          content,
          attachmentIds: attachments.map((attachment) => attachment.attachmentId),
        },
        session.accessToken,
      )
      setWriteOpen(false)
      setAttachments([])
      setCurrentPage(1)
      setReloadCount((count) => count + 1)
    } catch (createError: unknown) {
      setWriteError(
        createError instanceof Error ? createError.message : t('fanMeetingCommunityPage.t19'),
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
            {writeOpen ? t('fanMeetingCommunityPage.t20') : t('fanMeetingCommunityPage.t21')}
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
              <fieldset className="grid gap-2">
                <legend className="text-sm font-bold text-[var(--color-text-secondary)]">
                  {t('fanMeetingCommunityPage.s6Attachments')}{' '}
                  <span className="font-medium tabular-nums">
                    ({attachments.length}/{COMMUNITY_ATTACHMENT_MAX_COUNT})
                  </span>
                </legend>
                <input
                  accept="image/*,.pdf"
                  className="block w-full text-sm"
                  disabled={uploading || attachments.length >= COMMUNITY_ATTACHMENT_MAX_COUNT}
                  multiple
                  onChange={(event) => {
                    void uploadFiles(event.target.files)
                    event.target.value = ''
                  }}
                  type="file"
                />
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {t('fanMeetingCommunityPage.s6AttachmentHint')}
                </p>
                {uploading ? (
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {t('fanMeetingCommunityPage.s6Uploading')}
                  </p>
                ) : null}
                {attachments.length ? (
                  <ul className="grid gap-2">
                    {attachments.map((attachment) => (
                      <li
                        className="flex items-center justify-between gap-3 border-b border-[var(--color-divider)] py-2 text-sm"
                        key={attachment.attachmentId}
                      >
                        <a
                          className="min-w-0 flex-1 truncate font-semibold hover:underline"
                          href={attachmentContentUrl(attachment.attachmentId)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {attachment.originalFileName}
                        </a>
                        <Button
                          onClick={() =>
                            setAttachments((current) =>
                              current.filter(
                                (item) => item.attachmentId !== attachment.attachmentId,
                              ),
                            )
                          }
                          size="sm"
                          variant="ghost"
                        >
                          {t('fanMeetingCommunityPage.s6Remove')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </fieldset>
              {writeError ? (
                <AlertBanner title={t('fanMeetingCommunityPage.t9')} variant="error">
                  {writeError}
                </AlertBanner>
              ) : null}
              <div className="flex justify-end">
                {/* 업로드가 끝나기 전에 저장하면 방금 고른 파일이 빠진 채 연결된다. */}
                <Button disabled={uploading} loading={submitting} type="submit">
                  {t('fanMeetingCommunityPage.t10')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <SearchField
        buttonLabel={t('fanMeetingCommunityPage.t22')}
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
              ? t('fanMeetingCommunityPage.t23')
              : t('fanMeetingCommunityPage.t24')
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
                    className="flex items-center gap-3 px-6 py-5 transition-colors hover:bg-[var(--color-surface-page)] focus-visible:[outline:var(--focus-ring-width)_solid_var(--color-focus-indigo)] focus-visible:[outline-offset:calc(var(--focus-ring-offset)*-1)]"
                    to={`/community/posts/${post.postId}`}
                  >
                    {/* 첨부한 첫 이미지를 대표로 보여 준다. 이미지 첨부가 없으면 null이다. */}
                    {post.thumbnailUrl ? (
                      <img
                        alt=""
                        className="h-14 w-14 flex-none rounded-lg object-cover"
                        decoding="async"
                        loading="lazy"
                        src={resolveAttachmentUrl(post.thumbnailUrl)}
                      />
                    ) : null}
                    <span className="grid min-w-0 flex-1 gap-1.5">
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
