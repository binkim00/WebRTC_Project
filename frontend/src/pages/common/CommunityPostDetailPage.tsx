import { ArrowLeft } from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/auth'
import {
  createComment,
  deleteComment,
  deleteCommunityPost,
  getComments,
  getCommunityPost,
  reportComment,
  updateComment,
  updateCommunityPost,
  type CommentSummaryResponse,
  type CommunityPostDetailResponse,
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
  Spinner,
  Textarea,
  TextField,
} from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { useTranslation } from '../../i18n'

const COMMENT_PAGE_SIZE = 10

function formatDateTime(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toFriendlyCommentError(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return '댓글은 확정 참가자 또는 운영자만 작성할 수 있습니다.'
  }

  return error instanceof Error ? error.message : '댓글 작성에 실패했습니다.'
}

export function CommunityPostDetailPage() {
  const { t } = useTranslation()
  const { postId } = useParams()
  const navigate = useNavigate()
  const [session] = useState(() => getAuthSession())

  const [post, setPost] = useState<CommunityPostDetailResponse>()
  const [postLoading, setPostLoading] = useState(true)
  const [postError, setPostError] = useState<string>()
  const [postReloadCount, setPostReloadCount] = useState(0)

  const [comments, setComments] = useState<PageResponse<CommentSummaryResponse>>()
  const [commentPage, setCommentPage] = useState(1)
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [commentsError, setCommentsError] = useState<string>()
  const [commentsReloadCount, setCommentsReloadCount] = useState(0)

  const [editing, setEditing] = useState(false)
  const [postSaving, setPostSaving] = useState(false)
  const [postActionError, setPostActionError] = useState<string>()

  const [commentContent, setCommentContent] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [commentError, setCommentError] = useState<string>()

  const [editingCommentId, setEditingCommentId] = useState<number>()
  const [editingCommentContent, setEditingCommentContent] = useState('')
  const [reportingCommentId, setReportingCommentId] = useState<number>()
  const [commentActionBusy, setCommentActionBusy] = useState(false)
  const [commentActionError, setCommentActionError] = useState<string>()
  const [commentActionSuccess, setCommentActionSuccess] = useState<string>()

  useEffect(() => {
    if (!postId?.trim()) {
      setPostLoading(false)
      return
    }

    const abortController = new AbortController()
    setPostLoading(true)
    setPostError(undefined)

    getCommunityPost(postId, abortController.signal)
      .then(setPost)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setPostError(
          error instanceof Error ? error.message : '게시글을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setPostLoading(false)
        }
      })

    return () => abortController.abort()
  }, [postId, postReloadCount])

  useEffect(() => {
    if (!postId?.trim()) {
      setCommentsLoading(false)
      return
    }

    const abortController = new AbortController()
    setCommentsLoading(true)
    setCommentsError(undefined)

    getComments(
      postId,
      { page: commentPage - 1, size: COMMENT_PAGE_SIZE },
      abortController.signal,
    )
      .then(setComments)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setCommentsError(
          error instanceof Error ? error.message : '댓글을 불러오지 못했습니다.',
        )
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setCommentsLoading(false)
        }
      })

    return () => abortController.abort()
  }, [postId, commentPage, commentsReloadCount])

  async function handleUpdatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!postId?.trim() || !session) {
      return
    }

    const formData = new FormData(event.currentTarget)
    const title = String(formData.get('title') ?? '').trim()
    const content = String(formData.get('content') ?? '').trim()

    if (!title || !content) {
      setPostActionError('제목과 내용을 모두 입력해 주세요.')
      return
    }

    setPostSaving(true)
    setPostActionError(undefined)

    try {
      await updateCommunityPost(postId, { title, content }, session.accessToken)
      setEditing(false)
      setPostReloadCount((count) => count + 1)
    } catch (error: unknown) {
      setPostActionError(
        error instanceof Error ? error.message : '게시글 수정에 실패했습니다.',
      )
    } finally {
      setPostSaving(false)
    }
  }

  async function handleDeletePost() {
    if (!postId?.trim() || !session || !post) {
      return
    }

    if (!window.confirm('게시글을 삭제하시겠습니까?')) {
      return
    }

    setPostActionError(undefined)

    try {
      await deleteCommunityPost(postId, session.accessToken)

      if (post.meetingId !== null) {
        navigate(`/fan-meetings/${post.meetingId}/community`, { replace: true })
      } else {
        navigate(-1)
      }
    } catch (error: unknown) {
      setPostActionError(
        error instanceof Error ? error.message : '게시글 삭제에 실패했습니다.',
      )
    }
  }

  async function handleCreateComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!postId?.trim() || !session) {
      return
    }

    const content = commentContent.trim()

    if (!content) {
      setCommentError('댓글 내용을 입력해 주세요.')
      return
    }

    setCommentSubmitting(true)
    setCommentError(undefined)

    try {
      await createComment(postId, { content }, session.accessToken)
      setCommentContent('')
      setCommentPage(1)
      setCommentsReloadCount((count) => count + 1)
      setPostReloadCount((count) => count + 1)
    } catch (error: unknown) {
      setCommentError(toFriendlyCommentError(error))
    } finally {
      setCommentSubmitting(false)
    }
  }

  async function handleUpdateComment(commentId: number) {
    if (!session) {
      return
    }

    const content = editingCommentContent.trim()

    if (!content) {
      setCommentActionError('댓글 내용을 입력해 주세요.')
      return
    }

    setCommentActionBusy(true)
    setCommentActionError(undefined)
    setCommentActionSuccess(undefined)

    try {
      await updateComment(commentId, { content }, session.accessToken)
      setEditingCommentId(undefined)
      setEditingCommentContent('')
      setCommentsReloadCount((count) => count + 1)
    } catch (error: unknown) {
      setCommentActionError(
        error instanceof Error ? error.message : '댓글 수정에 실패했습니다.',
      )
    } finally {
      setCommentActionBusy(false)
    }
  }

  async function handleDeleteComment(commentId: number) {
    if (!session) {
      return
    }

    if (!window.confirm('댓글을 삭제하시겠습니까?')) {
      return
    }

    setCommentActionBusy(true)
    setCommentActionError(undefined)
    setCommentActionSuccess(undefined)

    try {
      await deleteComment(commentId, session.accessToken)
      setCommentsReloadCount((count) => count + 1)
      setPostReloadCount((count) => count + 1)
    } catch (error: unknown) {
      setCommentActionError(
        error instanceof Error ? error.message : '댓글 삭제에 실패했습니다.',
      )
    } finally {
      setCommentActionBusy(false)
    }
  }

  async function handleReportComment(
    event: FormEvent<HTMLFormElement>,
    commentId: number,
  ) {
    event.preventDefault()

    if (!session) {
      return
    }

    const formData = new FormData(event.currentTarget)
    const reason = String(formData.get('reason') ?? '').trim()
    const detail = String(formData.get('detail') ?? '').trim()

    if (!reason) {
      setCommentActionError('신고 사유를 입력해 주세요.')
      return
    }

    setCommentActionBusy(true)
    setCommentActionError(undefined)
    setCommentActionSuccess(undefined)

    try {
      await reportComment(
        commentId,
        { reason, detail: detail || undefined },
        session.accessToken,
      )
      setReportingCommentId(undefined)
      setCommentActionSuccess('신고가 접수되었습니다. 확인 후 조치하겠습니다.')
    } catch (error: unknown) {
      setCommentActionError(
        error instanceof Error ? error.message : '신고 접수에 실패했습니다.',
      )
    } finally {
      setCommentActionBusy(false)
    }
  }

  if (!postId?.trim()) {
    return (
      <InvalidRouteState
        message={t('communityPostDetailPage.t1')}
        title={t('communityPostDetailPage.t2')}
      />
    )
  }

  if (postLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label={t('communityPostDetailPage.t3')} />
      </div>
    )
  }

  if (postError || !post) {
    return (
      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <AlertBanner title={t('communityPostDetailPage.t4')} variant="error">
          {postError ?? '게시글 정보를 찾을 수 없습니다.'}
        </AlertBanner>
        <div>
          <Button onClick={() => setPostReloadCount((count) => count + 1)}>{t('communityPostDetailPage.t5')}</Button>
        </div>
      </div>
    )
  }

  const commentList = comments?.content ?? []
  const commentTotalPages = Math.max(1, comments?.totalPages ?? 1)

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <header>
        {post.meetingId !== null ? (
          <Link
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary-coral)]"
            to={`/fan-meetings/${post.meetingId}/community`}
          >
            <ArrowLeft aria-hidden size={18} weight="bold" />
            {t('communityPostDetailPage.t6')}
          </Link>
        ) : null}
      </header>

      <Card>
        <CardContent>
          {editing ? (
            <form className="grid gap-4" onSubmit={(event) => void handleUpdatePost(event)}>
              <TextField defaultValue={post.title} label={t('communityPostDetailPage.t7')} name="title" required />
              <Textarea
                defaultValue={post.content}
                label={t('communityPostDetailPage.t8')}
                name="content"
                required
                rows={8}
              />
              {postActionError ? (
                <AlertBanner title={t('communityPostDetailPage.t9')} variant="error">
                  {postActionError}
                </AlertBanner>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setEditing(false)
                    setPostActionError(undefined)
                  }}
                  type="button"
                  variant="secondary"
                >
                  {t('communityPostDetailPage.t10')}
                </Button>
                <Button loading={postSaving} type="submit">
                  {t('communityPostDetailPage.t11')}
                </Button>
              </div>
            </form>
          ) : (
            <article>
              <div className="flex flex-wrap items-center gap-2">
                {post.pinned ? <Badge variant="primary">{t('communityPostDetailPage.t12')}</Badge> : null}
                <h1 className="text-2xl font-black tracking-[-0.03em] text-[var(--color-text-primary)]">
                  {post.title}
                </h1>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--color-divider)] pb-4 text-sm text-[var(--color-text-secondary)]">
                <span className="font-semibold">{post.authorNickname}</span>
                <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
                <span>{t('communityPostDetailPage.t13')} {post.commentCount}{t('communityPostDetailPage.t14')}</span>
              </div>
              <p className="mt-5 whitespace-pre-wrap leading-7 text-[var(--color-text-primary)]">
                {post.content}
              </p>
              {postActionError ? (
                <div className="mt-4">
                  <AlertBanner title={t('communityPostDetailPage.t15')} variant="error">
                    {postActionError}
                  </AlertBanner>
                </div>
              ) : null}
              {post.canEdit || post.canDelete ? (
                <div className="mt-6 flex justify-end gap-2">
                  {post.canEdit ? (
                    <Button
                      onClick={() => {
                        setEditing(true)
                        setPostActionError(undefined)
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      {t('communityPostDetailPage.t16')}
                    </Button>
                  ) : null}
                  {post.canDelete ? (
                    <Button
                      onClick={() => void handleDeletePost()}
                      size="sm"
                      variant="danger"
                    >
                      {t('communityPostDetailPage.t17')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4">
        <h2 className="text-xl font-black tracking-[-0.03em]">
          {t('communityPostDetailPage.t18')} <span className="text-[var(--color-primary-coral)]">{post.commentCount}</span>
        </h2>

        {session ? (
          <Card>
            <CardContent>
              <form className="grid gap-3" onSubmit={(event) => void handleCreateComment(event)}>
                <Textarea
                  label={t('communityPostDetailPage.t19')}
                  onChange={(event) => setCommentContent(event.currentTarget.value)}
                  placeholder={t('communityPostDetailPage.t20')}
                  rows={3}
                  value={commentContent}
                />
                {commentError ? (
                  <AlertBanner title={t('communityPostDetailPage.t21')} variant="error">
                    {commentError}
                  </AlertBanner>
                ) : null}
                <div className="flex justify-end">
                  <Button loading={commentSubmitting} type="submit">
                    {t('communityPostDetailPage.t22')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <AlertBanner title={t('communityPostDetailPage.t23')} variant="info">
            {t('communityPostDetailPage.t24')}{' '}
            <Link className="font-semibold underline" to="/login">
              {t('communityPostDetailPage.t25')}
            </Link>
            {t('communityPostDetailPage.t26')}
          </AlertBanner>
        )}

        {commentActionSuccess ? (
          <AlertBanner title={t('communityPostDetailPage.t27')} variant="success">
            {commentActionSuccess}
          </AlertBanner>
        ) : null}
        {commentActionError ? (
          <AlertBanner title={t('communityPostDetailPage.t28')} variant="error">
            {commentActionError}
          </AlertBanner>
        ) : null}
        {commentsError ? (
          <AlertBanner title={t('communityPostDetailPage.t29')} variant="error">
            {commentsError}
          </AlertBanner>
        ) : null}

        {commentsLoading ? (
          <div className="flex justify-center py-10">
            <Spinner label={t('communityPostDetailPage.t30')} />
          </div>
        ) : commentList.length === 0 ? (
          <EmptyState description={t('communityPostDetailPage.t31')} title={t('communityPostDetailPage.t32')} />
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-[var(--color-divider)]">
                {commentList.map((comment) => {
                  const isEditingComment = editingCommentId === comment.commentId
                  const isReportingComment = reportingCommentId === comment.commentId
                  const isOwnComment = comment.canEdit

                  return (
                    <li className="grid gap-3 px-6 py-5" key={comment.commentId}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-bold text-[var(--color-text-primary)]">
                          {comment.authorNickname}
                        </span>
                        <time
                          className="text-[var(--color-text-tertiary)]"
                          dateTime={comment.createdAt}
                        >
                          {formatDateTime(comment.createdAt)}
                        </time>
                        <span className="ml-auto flex gap-1">
                          {comment.canEdit ? (
                            <Button
                              disabled={commentActionBusy}
                              onClick={() => {
                                setEditingCommentId(comment.commentId)
                                setEditingCommentContent(comment.content)
                                setReportingCommentId(undefined)
                                setCommentActionError(undefined)
                                setCommentActionSuccess(undefined)
                              }}
                              size="sm"
                              variant="ghost"
                            >
                              {t('communityPostDetailPage.t33')}
                            </Button>
                          ) : null}
                          {comment.canDelete ? (
                            <Button
                              disabled={commentActionBusy}
                              onClick={() => void handleDeleteComment(comment.commentId)}
                              size="sm"
                              variant="ghost"
                            >
                              {t('communityPostDetailPage.t34')}
                            </Button>
                          ) : null}
                          {session && !isOwnComment ? (
                            <Button
                              disabled={commentActionBusy}
                              onClick={() => {
                                setReportingCommentId(
                                  isReportingComment ? undefined : comment.commentId,
                                )
                                setEditingCommentId(undefined)
                                setCommentActionError(undefined)
                                setCommentActionSuccess(undefined)
                              }}
                              size="sm"
                              variant="ghost"
                            >
                              {t('communityPostDetailPage.t35')}
                            </Button>
                          ) : null}
                        </span>
                      </div>

                      {isEditingComment ? (
                        <div className="grid gap-2">
                          <Textarea
                            label={t('communityPostDetailPage.t36')}
                            onChange={(event) =>
                              setEditingCommentContent(event.currentTarget.value)
                            }
                            rows={3}
                            value={editingCommentContent}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              onClick={() => {
                                setEditingCommentId(undefined)
                                setEditingCommentContent('')
                              }}
                              size="sm"
                              variant="secondary"
                            >
                              {t('communityPostDetailPage.t37')}
                            </Button>
                            <Button
                              loading={commentActionBusy}
                              onClick={() => void handleUpdateComment(comment.commentId)}
                              size="sm"
                            >
                              {t('communityPostDetailPage.t38')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-primary)]">
                          {comment.content}
                        </p>
                      )}

                      {isReportingComment ? (
                        <form
                          className="grid gap-3 rounded-[var(--radius-panel)] bg-[var(--color-surface-page)] p-4"
                          onSubmit={(event) =>
                            void handleReportComment(event, comment.commentId)
                          }
                        >
                          <TextField
                            label={t('communityPostDetailPage.t39')}
                            maxLength={100}
                            name="reason"
                            placeholder={t('communityPostDetailPage.t40')}
                            required
                          />
                          <Textarea
                            label={t('communityPostDetailPage.t41')}
                            name="detail"
                            placeholder={t('communityPostDetailPage.t42')}
                            rows={3}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              onClick={() => setReportingCommentId(undefined)}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              {t('communityPostDetailPage.t43')}
                            </Button>
                            <Button
                              loading={commentActionBusy}
                              size="sm"
                              type="submit"
                              variant="danger"
                            >
                              {t('communityPostDetailPage.t44')}
                            </Button>
                          </div>
                        </form>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {!commentsLoading && commentList.length > 0 ? (
          <Pagination
            currentPage={commentPage}
            onPageChange={setCommentPage}
            totalPages={commentTotalPages}
          />
        ) : null}
      </section>
    </div>
  )
}
