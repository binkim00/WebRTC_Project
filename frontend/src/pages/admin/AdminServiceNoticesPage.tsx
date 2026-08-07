import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { parseServerDate } from '../../api/serverTime'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/authSession'
import {
  attachmentContentUrl,
  resolveAttachmentUrl,
  uploadAttachment,
  type AttachmentUploadResponse,
} from '../../api/attachments'
import {
  createServiceNotice,
  deleteServiceNotice,
  getServiceNotice,
  getServiceNotices,
  updateServiceNotice,
  NOTICE_ATTACHMENT_MAX_COUNT,
  type NoticeAttachmentResponse,
  type NoticeSummaryResponse,
} from '../../api/notices'
import type { PageResponse } from '../../api/envelope'
import {
  AlertBanner,
  Button,
  Dialog,
  Pagination,
  Spinner,
  Textarea,
  TextField,
} from '../../components'
import { useTranslation } from '../../i18n'

const PAGE_SIZE = 10

/**
 * 편집 대화상자에서 다루는 첨부 한 건이다.
 *
 * 새로 올린 첨부(업로드 응답)와 이미 공지에 붙어 있던 첨부(상세 응답)가 같은 모양이라
 * 두 타입을 함께 담는다.
 */
type EditorAttachment = AttachmentUploadResponse | NoticeAttachmentResponse

/** 편집 대화상자의 대상이다. `create`는 새 공지, `edit`은 기존 공지 수정이다. */
type EditorTarget =
  | { mode: 'create' }
  | {
      mode: 'edit'
      noticeId: number
      title: string
      content: string
      /** 편집을 시작할 때 붙어 있던 첨부 식별자다. 바뀐 게 없으면 요청에서 뺀다. */
      attachmentIds: number[]
    }

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 2026.08.05 14:30 */
function formatDateTime(value: string): string {
  const date = parseServerDate(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof ApiError || reason instanceof TypeError ? reason.message : fallback
}

/** 두 첨부 목록이 같은 순서의 같은 파일인지 비교한다. 수정 요청에서 첨부를 보낼지 정한다. */
function sameAttachmentIds(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

/**
 * 서비스 운영자(ADMIN)가 서비스 전체 공지를 작성·수정·삭제하는 화면이다.
 *
 * 팬미팅 공지와 달리 서비스 전체에 노출되므로 백엔드가 ADMIN 역할로 제한하고, 수정·삭제는
 * 작성자 본인이나 ADMIN에게 허용한다(PostCommandService가 다시 검증한다). 화면은 역할을
 * 직접 따지지 않고 상세 조회로 받은 `canEdit`·`canDelete`를 따라, 권한 규칙이 바뀌어도
 * 서버 판단을 그대로 반영한다.
 *
 * <p>상세 조회에 **로그인 토큰을 반드시 함께 보낸다.** 서버는 토큰이 없으면 조회자를 알 수
 * 없어 두 값을 false로 내려 주고, 그러면 내가 쓴 공지까지 "다른 운영자가 작성"으로 보인다.
 *
 * 라우트 보호는 `/admin/*` 경로에 걸린 MANAGE_SERVICE_NOTICES 권한이 담당한다.
 */
export function AdminServiceNoticesPage() {
  const { t } = useTranslation()
  const [session] = useState(() => getAuthSession())
  const [data, setData] = useState<PageResponse<NoticeSummaryResponse>>()
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const [editor, setEditor] = useState<EditorTarget>()
  const [titleInput, setTitleInput] = useState('')
  const [contentInput, setContentInput] = useState('')
  const [attachments, setAttachments] = useState<EditorAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState<string>()

  const [deleteTarget, setDeleteTarget] = useState<NoticeSummaryResponse>()
  const [deleting, setDeleting] = useState(false)

  /** 내가 수정·삭제할 수 있는 공지 식별자다. 상세 조회의 canEdit·canDelete로 채운다. */
  const [editableIds, setEditableIds] = useState<ReadonlySet<number>>(new Set())

  const loadNotices = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(undefined)

      try {
        const result = await getServiceNotices({ page, size: PAGE_SIZE }, signal)
        if (signal?.aborted) return
        setData(result)

        // 목록 요약에는 권한 정보가 없어 상세로 확인한다. 실패한 건은 조작 버튼을 감추는
        // 쪽으로 두어(보수적) 권한 없는 요청을 보내지 않는다.
        const permissions = await Promise.all(
          result.content.map(async (item) => {
            try {
              const detail = await getServiceNotice(
                item.noticeId, session?.accessToken, signal,
              )
              return detail.canEdit || detail.canDelete ? item.noticeId : undefined
            } catch {
              return undefined
            }
          }),
        )
        if (signal?.aborted) return
        setEditableIds(new Set(permissions.filter((id): id is number => id !== undefined)))
      } catch (reason) {
        if (signal?.aborted) return
        setError(errorMessage(reason, t('adminServiceNoticesPage.t19')))
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page],
  )

  useEffect(() => {
    const controller = new AbortController()
    void loadNotices(controller.signal)
    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadNotices])

  function openCreate() {
    setEditor({ mode: 'create' })
    setTitleInput('')
    setContentInput('')
    setAttachments([])
    setEditorError(undefined)
  }

  async function openEdit(item: NoticeSummaryResponse) {
    setEditorError(undefined)
    try {
      // 목록 요약에는 본문과 첨부가 없어 상세를 읽어 채운다.
      const detail = await getServiceNotice(item.noticeId, session?.accessToken)
      setEditor({
        mode: 'edit',
        noticeId: detail.noticeId,
        title: detail.title,
        content: detail.content,
        attachmentIds: detail.attachments.map((attachment) => attachment.attachmentId),
      })
      setTitleInput(detail.title)
      setContentInput(detail.content)
      setAttachments(detail.attachments)
    } catch (reason) {
      setError(errorMessage(reason, t('adminServiceNoticesPage.t20')))
    }
  }

  /** 선택한 파일을 순서대로 올리고 공지에 연결할 첨부 목록에 추가한다. */
  async function uploadFiles(fileList: FileList | null) {
    const files = fileList ? [...fileList] : []
    if (!files.length) return

    const authToken = session?.accessToken
    if (!authToken) {
      setEditorError(t('adminServiceNoticesPage.t21'))
      return
    }

    const room = NOTICE_ATTACHMENT_MAX_COUNT - attachments.length
    if (room <= 0) {
      setEditorError(
        t('adminServiceNoticesPage.s6AttachmentFull', { p0: NOTICE_ATTACHMENT_MAX_COUNT }),
      )
      return
    }

    setUploading(true)
    setEditorError(undefined)
    try {
      // 서버가 개수를 거절하지 않도록 남은 자리만큼만 올린다.
      for (const file of files.slice(0, room)) {
        const uploaded = await uploadAttachment(file, 'NOTICE', authToken)
        setAttachments((current) => [...current, uploaded])
      }
      if (files.length > room) {
        setEditorError(
          t('adminServiceNoticesPage.s6AttachmentTrimmed', {
            p0: NOTICE_ATTACHMENT_MAX_COUNT,
            p1: files.length - room,
          }),
        )
      }
    } catch (reason) {
      setEditorError(errorMessage(reason, t('adminServiceNoticesPage.s6UploadFailed')))
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || saving) return

    const authToken = session?.accessToken
    if (!authToken) {
      setEditorError(t('adminServiceNoticesPage.t21'))
      return
    }

    const title = titleInput.trim()
    const content = contentInput.trim()
    if (!title) {
      setEditorError(t('adminServiceNoticesPage.t22'))
      return
    }
    if (!content) {
      setEditorError(t('adminServiceNoticesPage.t23'))
      return
    }

    const attachmentIds = attachments.map((attachment) => attachment.attachmentId)

    setSaving(true)
    setEditorError(undefined)
    try {
      if (editor.mode === 'create') {
        await createServiceNotice({ title, content, attachmentIds }, authToken)
        setNotice(t('adminServiceNoticesPage.t24'))
        // 새 공지는 최신순 목록의 첫 페이지에 들어가므로 그쪽을 보여 준다.
        setPage(0)
      } else {
        // PATCH이므로 바뀐 값만 보낸다. 셋 다 그대로면 요청하지 않는다.
        // 첨부는 보내는 순간 목록 전체를 대신하므로, 그대로일 때 보내지 않아야
        // 다른 곳에서 바뀐 첨부를 이 화면이 되돌리는 일이 없다.
        const changed = {
          ...(title === editor.title ? {} : { title }),
          ...(content === editor.content ? {} : { content }),
          ...(sameAttachmentIds(attachmentIds, editor.attachmentIds) ? {} : { attachmentIds }),
        }
        if (Object.keys(changed).length === 0) {
          setEditor(undefined)
          return
        }
        await updateServiceNotice(editor.noticeId, changed, authToken)
        setNotice(t('adminServiceNoticesPage.t25'))
      }

      setEditor(undefined)
      await loadNotices()
    } catch (reason) {
      setEditorError(errorMessage(reason, t('adminServiceNoticesPage.t26')))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const authToken = session?.accessToken
    if (!deleteTarget || !authToken || deleting) return

    setDeleting(true)
    try {
      await deleteServiceNotice(deleteTarget.noticeId, authToken)
      setDeleteTarget(undefined)
      setNotice(t('adminServiceNoticesPage.t27'))
      await loadNotices()
    } catch (reason) {
      setError(errorMessage(reason, t('adminServiceNoticesPage.t28')))
      setDeleteTarget(undefined)
    } finally {
      setDeleting(false)
    }
  }

  const notices = data?.content ?? []

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] font-black tracking-[-0.04em]">{t('adminServiceNoticesPage.t1')}</h1>
          <p className="mt-[7px] text-[15px] font-medium text-[var(--color-text-muted)]">
            {t('adminServiceNoticesPage.t2')}
          </p>
        </div>
        <Button onClick={openCreate}>{t('adminServiceNoticesPage.t3')}</Button>
      </header>

      {error ? (
        <AlertBanner className="mt-6" title={t('adminServiceNoticesPage.t4')} variant="error">
          {error}
        </AlertBanner>
      ) : null}
      {notice ? (
        <AlertBanner
          className="mt-6"
          onDismiss={() => setNotice(undefined)}
          title={t('adminServiceNoticesPage.t5')}
          variant="success"
        >
          {notice}
        </AlertBanner>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('adminServiceNoticesPage.t6')} />
        </div>
      ) : notices.length === 0 ? (
        <div className="mt-8 grid place-items-center rounded-xl border border-[var(--color-divider)] px-6 py-16 text-center">
          <strong className="text-[19px] font-extrabold tracking-[-0.03em]">
            {t('adminServiceNoticesPage.t7')}
          </strong>
          <span className="mt-2 text-base font-medium text-[var(--color-text-muted)]">
            {t('adminServiceNoticesPage.t8')}
          </span>
        </div>
      ) : (
        <ul className="mt-7 border-t border-[var(--color-divider)]">
          {notices.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-divider)] py-4"
              key={item.noticeId}
            >
              <div className="flex min-w-0 items-center gap-3">
                {/* 첨부 이미지가 있으면 목록에서도 어떤 공지인지 바로 알아볼 수 있게 보여 준다. */}
                {item.thumbnailUrl ? (
                  <img
                    alt=""
                    className="h-12 w-12 flex-none rounded-md object-cover"
                    decoding="async"
                    loading="lazy"
                    src={resolveAttachmentUrl(item.thumbnailUrl)}
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-lg font-extrabold tracking-[-0.026em]">{item.title}</p>
                  <p className="mt-1 text-sm font-medium tabular-nums text-[var(--color-text-muted)]">
                    {item.authorNickname} · {formatDateTime(item.createdAt)}
                  </p>
                </div>
              </div>
              {/*
                수정·삭제는 작성자 본인만 가능하다. 권한이 없는 공지에는 버튼을 두지 않아
                눌러 보고 오류를 만나는 일이 없게 한다.
              */}
              {editableIds.has(item.noticeId) ? (
                <div className="flex flex-none gap-2">
                  <Button onClick={() => void openEdit(item)} size="sm" variant="secondary">
                    {t('adminServiceNoticesPage.t9')}
                  </Button>
                  <Button onClick={() => setDeleteTarget(item)} size="sm" variant="secondary">
                    {t('adminServiceNoticesPage.t10')}
                  </Button>
                </div>
              ) : (
                <span className="flex-none text-sm font-semibold text-[var(--color-text-muted)]">
                  {t('adminServiceNoticesPage.t11')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.totalPages > 1 ? (
        <div className="mt-7">
          <Pagination
            currentPage={page + 1}
            onPageChange={(nextPage) => setPage(nextPage - 1)}
            totalPages={data.totalPages}
          />
        </div>
      ) : null}

      <Dialog
        footer={
          <>
            <Button disabled={saving} onClick={() => setEditor(undefined)} variant="secondary">
              {t('adminServiceNoticesPage.t12')}
            </Button>
            {/* 업로드가 끝나기 전에 저장하면 방금 고른 파일이 빠진 채 연결된다. */}
            <Button disabled={uploading} form="admin-notice-form" loading={saving} type="submit">
              {editor?.mode === 'edit' ? t('adminServiceNoticesPage.t29') : t('adminServiceNoticesPage.t30')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open) setEditor(undefined)
        }}
        open={Boolean(editor)}
        title={editor?.mode === 'edit' ? t('adminServiceNoticesPage.t31') : t('adminServiceNoticesPage.t32')}
      >
        <form className="grid gap-4" id="admin-notice-form" onSubmit={(event) => void handleSubmit(event)}>
          <TextField
            label={t('adminServiceNoticesPage.t13')}
            onChange={(event) => setTitleInput(event.target.value)}
            required
            value={titleInput}
          />
          <Textarea
            label={t('adminServiceNoticesPage.t14')}
            onChange={(event) => setContentInput(event.target.value)}
            required
            rows={8}
            value={contentInput}
          />

          {/*
            팬미팅 공지 작성 화면과 같은 방식이다. 파일을 먼저 올려 attachmentId를 받고,
            저장할 때 그 목록을 공지에 연결한다.
          */}
          <fieldset className="grid gap-3">
            <legend className="text-sm font-bold text-[var(--color-text-secondary)]">
              {t('adminServiceNoticesPage.s6Attachments')}{' '}
              <span className="font-medium tabular-nums">
                ({attachments.length}/{NOTICE_ATTACHMENT_MAX_COUNT})
              </span>
            </legend>
            <input
              accept="image/*,.pdf"
              className="block w-full text-sm"
              disabled={uploading || attachments.length >= NOTICE_ATTACHMENT_MAX_COUNT}
              multiple
              onChange={(event) => {
                void uploadFiles(event.target.files)
                event.target.value = ''
              }}
              type="file"
            />
            <p className="text-xs text-[var(--color-text-secondary)]">
              {t('adminServiceNoticesPage.s6AttachmentHint')}
            </p>
            {uploading ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('adminServiceNoticesPage.s6Uploading')}
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
                          current.filter((item) => item.attachmentId !== attachment.attachmentId),
                        )
                      }
                      size="sm"
                      variant="ghost"
                    >
                      {t('adminServiceNoticesPage.s6Remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </fieldset>

          {editorError ? (
            <AlertBanner title={t('adminServiceNoticesPage.t15')} variant="error">
              {editorError}
            </AlertBanner>
          ) : null}
        </form>
      </Dialog>

      <Dialog
        description={t('adminServiceNoticesPage.t16')}
        footer={
          <>
            <Button
              disabled={deleting}
              onClick={() => setDeleteTarget(undefined)}
              variant="secondary"
            >
              {t('adminServiceNoticesPage.t17')}
            </Button>
            <Button loading={deleting} onClick={() => void handleDelete()}>
              {t('adminServiceNoticesPage.t18')}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined)
        }}
        open={Boolean(deleteTarget)}
        title={deleteTarget ? t('adminServiceNoticesPage.t34', { p0: deleteTarget.title }) : t('adminServiceNoticesPage.t33')}
      />
    </div>
  )
}
