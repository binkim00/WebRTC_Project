import { ArrowLeft, ArrowRight, PushPin } from '@phosphor-icons/react'
import { parseServerDate } from '../../api/serverTime'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { attachmentContentUrl, resolveAttachmentUrl } from '../../api/attachments'
import type { PageResponse } from '../../api/envelope'
import {
  getServiceNotice,
  getServiceNotices,
  type NoticeDetailResponse,
  type NoticeSummaryResponse,
} from '../../api/notices'
import {
  AlertBanner,
  Badge,
  Card,
  EmptyState,
  Pagination,
  Spinner,
} from '../../components'
import { useTranslation } from '../../i18n'

/** LocalDateTime 문자열을 읽기 쉬운 한국어 일시로 표시한다. */
function formatDateTime(value: string): string {
  const date = parseServerDate(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}

/** 오류 원인에서 사용자에게 보여 줄 메시지를 뽑는다. */
function toErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

/**
 * 운영팀이 등록한 서비스 전체 공지를 목록으로 보여 준다.
 *
 * 로그인 없이도 볼 수 있는 공개 화면이라 인증 토큰 없이 조회한다.
 */
export function ServiceNoticesPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<PageResponse<NoticeSummaryResponse>>()
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()

    setLoading(true)
    getServiceNotices({ page, size: 10 }, controller.signal)
      .then((result) => {
        setData(result)
        setError(undefined)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(toErrorMessage(cause, t('serviceNoticesPage.t14')))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  return (
    <div className="grid gap-7 pb-10">
      <header>
        <p className="text-sm font-black tracking-[0.12em] text-[var(--color-primary-coral)]">NOTICE</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.05em]">{t('serviceNoticesPage.t1')}</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          {t('serviceNoticesPage.t2')}
        </p>
      </header>

      {error ? (
        <AlertBanner title={t('serviceNoticesPage.t3')} variant="error">
          {error}
        </AlertBanner>
      ) : null}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex min-h-80 items-center justify-center">
            <Spinner label={t('serviceNoticesPage.t4')} />
          </div>
        ) : !data || data.content.length === 0 ? (
          <EmptyState description={t('serviceNoticesPage.t5')} title={t('serviceNoticesPage.t6')} />
        ) : (
          <>
            <ul className="divide-y divide-[var(--color-divider)]">
              {data.content.map((notice) => (
                <li key={notice.noticeId}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 transition-colors hover:bg-[var(--color-surface-page)]"
                    to={`/service-notices/${notice.noticeId}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {/* 첨부한 첫 이미지를 대표로 보여 준다. 이미지 첨부가 없으면 null이다. */}
                      {notice.thumbnailUrl ? (
                        <img
                          alt=""
                          className="h-14 w-14 flex-none rounded-lg object-cover"
                          decoding="async"
                          loading="lazy"
                          src={resolveAttachmentUrl(notice.thumbnailUrl)}
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {notice.pinned ? (
                            <Badge variant="primary">
                              <PushPin aria-hidden="true" size={13} weight="fill" /> {t('serviceNoticesPage.t7')}
                            </Badge>
                          ) : null}
                          <strong className="min-w-0 break-keep">{notice.title}</strong>
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                          {notice.authorNickname} · {formatDateTime(notice.createdAt)}
                        </p>
                      </div>
                    </div>
                    <ArrowRight aria-hidden="true" className="text-[var(--color-text-tertiary)]" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
            {data.totalPages > 1 ? (
              <Pagination
                className="border-t border-[var(--color-divider)] py-4"
                currentPage={page + 1}
                onPageChange={(next) => setPage(next - 1)}
                totalPages={data.totalPages}
              />
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}

/** 서비스 공지 한 건의 제목과 본문을 보여 준다. */
export function ServiceNoticeDetailPage() {
  const { t } = useTranslation()
  const noticeId = useParams<{ noticeId: string }>().noticeId ?? ''
  const [notice, setNotice] = useState<NoticeDetailResponse>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!noticeId) {
      setError(t('serviceNoticesPage.t15'))
      setLoading(false)
      return
    }

    const controller = new AbortController()

    setLoading(true)
    getServiceNotice(noticeId, undefined, controller.signal)
      .then((result) => {
        setNotice(result)
        setError(undefined)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(toErrorMessage(cause, t('serviceNoticesPage.t16')))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeId])

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Spinner label={t('serviceNoticesPage.t8')} />
      </div>
    )
  }

  return (
    <div className="grid gap-6 pb-10">
      <Link
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary-coral)]"
        to="/service-notices"
      >
        <ArrowLeft size={17} /> {t('serviceNoticesPage.t9')}
      </Link>

      {error || !notice ? (
        <AlertBanner title={t('serviceNoticesPage.t10')} variant="error">
          {error ?? t('serviceNoticesPage.t17')}
        </AlertBanner>
      ) : (
        <Card className="p-6 sm:p-9">
          <div className="flex flex-wrap items-center gap-2">
            {notice.pinned ? (
              <Badge variant="primary">
                <PushPin aria-hidden="true" size={13} weight="fill" /> {t('serviceNoticesPage.t11')}
              </Badge>
            ) : null}
            <h1 className="text-2xl font-black tracking-[-0.04em]">{notice.title}</h1>
          </div>
          <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">
            {notice.authorNickname} · {formatDateTime(notice.createdAt)}
          </p>
          <div className="mt-7 whitespace-pre-wrap border-t border-[var(--color-divider)] pt-7 leading-7">
            {notice.content}
          </div>
          {/* 이미지 첨부는 내려받기 전에 본문과 함께 바로 보이는 편이 낫다. */}
          {notice.attachments.some((attachment) => attachment.contentType.startsWith('image/')) ? (
            <div className="mt-7 grid gap-3 border-t border-[var(--color-divider)] pt-6">
              {notice.attachments
                .filter((attachment) => attachment.contentType.startsWith('image/'))
                .map((attachment) => (
                  <img
                    alt={attachment.originalFileName}
                    className="w-full rounded-lg"
                    decoding="async"
                    key={attachment.attachmentId}
                    loading="lazy"
                    src={attachmentContentUrl(attachment.attachmentId)}
                  />
                ))}
            </div>
          ) : null}

          {/* 백엔드는 공지에 첨부를 연결할 수 있으므로 읽는 쪽에서도 내려받을 수 있게 한다. */}
          {notice.attachments.length ? (
            <section className="mt-7 grid gap-2 border-t border-[var(--color-divider)] pt-6">
              <h2 className="text-sm font-bold">{t('serviceNoticesPage.t12')} {notice.attachments.length}{t('serviceNoticesPage.t13')}</h2>
              <ul className="grid gap-2">
                {notice.attachments.map((attachment) => (
                  <li key={attachment.attachmentId}>
                    <a
                      className="text-sm font-semibold hover:underline"
                      // download=true를 붙여 이미지·PDF가 새 탭에서 열리지 않고 저장되게 한다.
                      href={attachmentContentUrl(attachment.attachmentId, true)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {attachment.originalFileName}
                    </a>
                    <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
                      {Math.max(1, Math.round(attachment.fileSize / 1024)).toLocaleString('ko-KR')} KB
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </Card>
      )}
    </div>
  )
}
