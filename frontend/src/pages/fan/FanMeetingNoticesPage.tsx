import { ArrowLeft, PushPin } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { attachmentContentUrl, resolveAttachmentUrl } from '../../api/attachments'
import type { PageResponse } from '../../api/envelope'
import {
  getMeetingNotice,
  getMeetingNotices,
  type NoticeDetailResponse,
  type NoticeSummaryResponse,
} from '../../api/notices'
import { parseServerDate } from '../../api/serverTime'
import {
  AlertBanner,
  Badge,
  Card,
  EmptyState,
  Pagination,
  Spinner,
} from '../../components'
import { useTranslation } from '../../i18n'

/** 한 번에 보여 줄 공지 수다. 대기실 요약(3건)보다 넉넉하게 잡는다. */
const PAGE_SIZE = 10

/** LocalDateTime 문자열을 읽기 쉬운 일시로 표시한다. */
function formatDateTime(value: string): string {
  const date = parseServerDate(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}

/** 오류 원인에서 사용자에게 보여 줄 메시지를 뽑는다. */
function toErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

/**
 * 팬이 보는 팬미팅 공지 목록 화면이다.
 *
 * 팬은 대기실(FanMeetingWaitingPage)에서 최신 공지 몇 건만 볼 수 있었고 전체 목록을 여는
 * 경로가 없었다. 이 화면이 그 자리를 맡는다.
 *
 * 목록 요약에는 본문이 없어 제목을 누르면 그 자리에서 상세를 펼친다. 팬미팅 공지 상세는
 * 별도 라우트가 없고 대기실도 같은 방식으로 상세를 읽어 쓴다. 공지 조회 API는 인증이
 * 필요 없으므로 이 화면도 로그인 없이 볼 수 있다.
 */
export function FanMeetingNoticesPage() {
  const { t } = useTranslation()
  const meetingId = useParams<{ fanMeetingId: string }>().fanMeetingId ?? ''
  const [data, setData] = useState<PageResponse<NoticeSummaryResponse>>()
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const [openId, setOpenId] = useState<number>()
  const [detail, setDetail] = useState<NoticeDetailResponse>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string>()

  useEffect(() => {
    if (!meetingId) {
      setError(t('fanMeetingNoticesPage.s6NoMeeting'))
      setLoading(false)
      return
    }

    const controller = new AbortController()

    setLoading(true)
    getMeetingNotices(meetingId, { page, size: PAGE_SIZE }, controller.signal)
      .then((result) => {
        setData(result)
        setError(undefined)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(toErrorMessage(cause, t('fanMeetingNoticesPage.s6ListFailed')))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, page])

  useEffect(() => {
    if (!meetingId || openId === undefined) {
      setDetail(undefined)
      setDetailLoading(false)
      return
    }

    const controller = new AbortController()

    setDetailLoading(true)
    setDetailError(undefined)
    getMeetingNotice(meetingId, openId, controller.signal)
      .then((result) => setDetail(result))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setDetailError(toErrorMessage(cause, t('fanMeetingNoticesPage.s6DetailFailed')))
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, openId])

  const notices = data?.content ?? []

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <Link
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary-coral)]"
        to={`/fan/fan-meetings/${meetingId}/waiting`}
      >
        <ArrowLeft size={17} /> {t('fanMeetingNoticesPage.s6BackToWaiting')}
      </Link>

      <header>
        <p className="text-sm font-black tracking-[0.12em] text-[var(--color-primary-coral)]">NOTICE</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">
          {t('fanMeetingNoticesPage.s6Title')}
        </h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">
          {t('fanMeetingNoticesPage.s6Subtitle')}
        </p>
      </header>

      {error ? (
        <AlertBanner title={t('fanMeetingNoticesPage.s6ErrorTitle')} variant="error">
          {error}
        </AlertBanner>
      ) : null}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex min-h-60 items-center justify-center">
            <Spinner label={t('fanMeetingNoticesPage.s6Loading')} />
          </div>
        ) : notices.length === 0 ? (
          <EmptyState
            description={t('fanMeetingNoticesPage.s6EmptyDescription')}
            title={t('fanMeetingNoticesPage.s6EmptyTitle')}
          />
        ) : (
          <>
            <ul className="divide-y divide-[var(--color-divider)]">
              {notices.map((notice) => {
                const open = openId === notice.noticeId
                return (
                  <li key={notice.noticeId}>
                    <button
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-6 py-5 text-left transition-colors hover:bg-[var(--color-surface-page)]"
                      // 같은 공지를 다시 누르면 접는다.
                      onClick={() => setOpenId(open ? undefined : notice.noticeId)}
                      type="button"
                    >
                      {notice.thumbnailUrl ? (
                        <img
                          alt=""
                          className="h-14 w-14 flex-none rounded-lg object-cover"
                          loading="lazy"
                          src={resolveAttachmentUrl(notice.thumbnailUrl)}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {notice.pinned ? (
                            <Badge variant="primary">
                              <PushPin aria-hidden="true" size={13} weight="fill" />{' '}
                              {t('fanMeetingNoticesPage.s6Pinned')}
                            </Badge>
                          ) : null}
                          <strong className="min-w-0 break-keep">{notice.title}</strong>
                        </span>
                        <span className="mt-1 block text-xs text-[var(--color-text-tertiary)]">
                          {notice.authorNickname} · {formatDateTime(notice.createdAt)}
                        </span>
                      </span>
                    </button>

                    {open ? (
                      <div className="border-t border-[var(--color-divider)] bg-[var(--color-surface-page)] px-6 py-5">
                        {detailLoading ? (
                          <Spinner label={t('fanMeetingNoticesPage.s6DetailLoading')} />
                        ) : detailError ? (
                          <AlertBanner
                            title={t('fanMeetingNoticesPage.s6ErrorTitle')}
                            variant="error"
                          >
                            {detailError}
                          </AlertBanner>
                        ) : detail && detail.noticeId === notice.noticeId ? (
                          <>
                            <div className="whitespace-pre-wrap leading-7">{detail.content}</div>

                            {/* 이미지 첨부는 내려받기 전에 본문과 함께 바로 보이는 편이 낫다. */}
                            {detail.attachments
                              .filter((attachment) => attachment.contentType.startsWith('image/'))
                              .map((attachment) => (
                                <img
                                  alt={attachment.originalFileName}
                                  className="mt-4 w-full rounded-lg"
                                  key={attachment.attachmentId}
                                  loading="lazy"
                                  src={attachmentContentUrl(attachment.attachmentId)}
                                />
                              ))}

                            {detail.attachments.length ? (
                              <ul className="mt-5 grid gap-2 border-t border-[var(--color-divider)] pt-4">
                                {detail.attachments.map((attachment) => (
                                  <li key={attachment.attachmentId}>
                                    <a
                                      className="text-sm font-semibold hover:underline"
                                      // download=true로 새 탭에서 열리지 않고 저장되게 한다.
                                      href={attachmentContentUrl(attachment.attachmentId, true)}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      {attachment.originalFileName}
                                    </a>
                                    <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
                                      {Math.max(
                                        1,
                                        Math.round(attachment.fileSize / 1024),
                                      ).toLocaleString('ko-KR')}{' '}
                                      KB
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {data && data.totalPages > 1 ? (
              <Pagination
                className="border-t border-[var(--color-divider)] py-4"
                currentPage={page + 1}
                onPageChange={(next) => {
                  // 페이지를 옮기면 펼쳐 둔 공지는 목록에 없으므로 함께 접는다.
                  setOpenId(undefined)
                  setPage(next - 1)
                }}
                totalPages={data.totalPages}
              />
            ) : null}
          </>
        )}
      </Card>
    </main>
  )
}
