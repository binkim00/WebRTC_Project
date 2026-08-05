import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import {
  getAllMyApplications,
  type MyApplicationSummaryResponse,
} from '../../api/applications'
import { getAuthSession } from '../../api/authSession'
import {
  fetchPublicFanMeetingDetail,
  type FanMeetingDetailStatus,
  type PublicFanMeetingDetail,
} from '../../api/fanMeetings'
import { isWaitingRoomOpen, serverLocalDateTimeMs } from '../../api/meetingManagement'
import { usePolling } from '../../hooks/usePolling'
import { enterQueue, interpretQueueEnterError } from '../../api/queue'
import {
  getAllMyRecordings,
  issueRecordingDownloadUrl,
  resolveRecordingContentUrl,
  type RecordingSummaryResponse,
} from '../../api/recordings'
import { AlertBanner, Button, Spinner } from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'

type FanMeetingListStatus = 'upcoming' | 'completed'

type FanMeetingListItem = {
  application: MyApplicationSummaryResponse
  detail?: PublicFanMeetingDetail
  detailNotFound?: boolean
  listStatus: FanMeetingListStatus
  recording?: RecordingSummaryResponse
}

const ITEMS_PER_PAGE = 6

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** 2026.08.02 19:00 — L0 날짜·시간 표기다. */
function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 2026.07.30 */
function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

function isCompletedStatus(status: FanMeetingDetailStatus | undefined): boolean {
  return status === 'ENDED' || status === 'CANCELED'
}

function isToday(value: string): boolean {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

/** 영상 보관 만료까지 남은 일수다. 지났으면 0을 준다. */
function remainingDays(availableUntil: string): number {
  const diff = new Date(availableUntil).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

function isResultPublished(detail: PublicFanMeetingDetail | undefined): boolean {
  // 추첨 상태와 결과 공개 상태는 다르므로 READY 이후에만 팬 목록에 노출한다.
  return (
    detail?.meeting.status === 'READY' ||
    detail?.meeting.status === 'LIVE' ||
    detail?.meeting.status === 'ENDED' ||
    detail?.meeting.status === 'CANCELED'
  )
}

function parsePage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

export function FanMeetingListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const status = searchParams.get('status')
  const requestedPage = parsePage(searchParams.get('page'))
  const [items, setItems] = useState<FanMeetingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string>()
  const [reloadKey, setReloadKey] = useState(0)
  // 자동 재조회는 목록을 스피너로 바꾸지 않고 조용히 갱신해야 하므로 최초 로딩과 구분한다.
  const [refreshing, setRefreshing] = useState(false)
  const backgroundReloadRef = useRef(false)
  // 자동 재조회가 겹치지 않도록 마지막 조회 시각을 기억해 최소 간격을 지킨다.
  const lastLoadedAtRef = useRef(0)
  const [partialWarning, setPartialWarning] = useState<string>()
  const [enteringMeetingId, setEnteringMeetingId] = useState<number>()
  const [queueError, setQueueError] = useState<{ meetingId: number; message: string }>()
  const [downloadingRecordingId, setDownloadingRecordingId] = useState<number>()
  const [downloadError, setDownloadError] = useState<{ meetingId: number; message: string }>()

  useEffect(() => {
    const controller = new AbortController()
    const session = getAuthSession()

    if (!session || session.role !== 'FAN') {
      setListError('팬 계정으로 로그인해 주세요.')
      setLoading(false)
      return () => controller.abort()
    }

    // 자동 재조회는 이미 그려 둔 목록을 유지한 채 갱신 표시만 남긴다.
    const isBackgroundReload = backgroundReloadRef.current
    backgroundReloadRef.current = false
    lastLoadedAtRef.current = Date.now()

    if (isBackgroundReload) setRefreshing(true)
    else setLoading(true)
    setListError(undefined)
    setPartialWarning(undefined)

    void (async () => {
      try {
        // 공개 전체 목록 대신 실제 '내 응모' API를 사용해 확정 참가 내역만 가져온다.
        const [applications, recordings] = await Promise.all([
          getAllMyApplications(
            { applicationStatus: 'SELECTED' },
            session.accessToken,
            controller.signal,
          ),
          // 녹화 목록도 첫 페이지만 보지 않고 백엔드 페이지 전체를 순회한다.
          getAllMyRecordings(session.accessToken, controller.signal).catch((error: unknown) => {
            if (!controller.signal.aborted) {
              setPartialWarning(
                error instanceof Error
                  ? `녹화 목록을 불러오지 못했습니다: ${error.message}`
                  : '녹화 목록을 불러오지 못했습니다.',
              )
            }
            return [] as RecordingSummaryResponse[]
          }),
        ])

        const recordingByMeetingId = new Map(
          recordings.map((recording) => [recording.meetingId, recording]),
        )
        let detailFailureCount = 0
        const enrichedItems: FanMeetingListItem[] = []
        // 상세 요청을 작은 묶음으로 처리해 참가 내역이 많아도 브라우저와 서버를 과부하시키지 않는다.
        for (let offset = 0; offset < applications.length; offset += 8) {
          const batch = applications.slice(offset, offset + 8)
          const enrichedBatch = await Promise.all(
            batch.map(async (application): Promise<FanMeetingListItem> => {
              let detail: PublicFanMeetingDetail | undefined
              try {
                // 내 응모 요약에는 팬미팅 상태가 없어 실제 상세 계약으로 상태·입장 가능 여부를 보강한다.
                detail = await fetchPublicFanMeetingDetail(
                  application.meetingId,
                  session.accessToken,
                  controller.signal,
                )
              } catch (error: unknown) {
                if (controller.signal.aborted) throw error
                detailFailureCount += 1
                const detailNotFound = error instanceof ApiError && error.status === 404
                return {
                  application,
                  detail,
                  recording: recordingByMeetingId.get(application.meetingId),
                  detailNotFound,
                  listStatus: 'completed',
                }
              }

              const recording = recordingByMeetingId.get(application.meetingId)
              return {
                application,
                detail,
                recording,
                detailNotFound: false,
                // 상세 조회 실패 시에도 서버에 녹화가 있으면 완료 내역으로 안전하게 분류한다.
                listStatus:
                  isCompletedStatus(detail?.meeting.status) || recording
                    ? 'completed'
                    : 'upcoming',
              }
            }),
          )
          enrichedItems.push(...enrichedBatch)
        }

        if (controller.signal.aborted) return
        if (detailFailureCount > 0) {
          setPartialWarning((current) =>
            [current, `${detailFailureCount}개 팬미팅의 최신 상태를 확인하지 못했습니다.`]
              .filter(Boolean)
              .join(' '),
          )
        }
        // 결과 공개 전 응모는 숨기되, 상세 조회 장애는 녹화가 있으면 완료 내역으로 보존한다.
        setItems(
          enrichedItems.filter((item) =>
            item.detail
              ? isResultPublished(item.detail)
              : !item.detailNotFound && Boolean(item.recording),
          ),
        )
      } catch (error: unknown) {
        if (controller.signal.aborted) return
        setListError(
          error instanceof ApiError || error instanceof TypeError
            ? error.message
            : '내 팬미팅 목록을 불러오지 못했습니다.',
        )
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    })()

    return () => controller.abort()
  }, [reloadKey])

  /**
   * 아직 대기실에 입장할 수 없는 예정 팬미팅 수다.
   *
   * 카드의 `canEnter`와 같은 기준(대기열 오픈 시각 + 서버의 입장 허용 여부)을 쓴다.
   * 하나라도 남아 있으면 화면을 열어 둔 사이 상태가 바뀔 수 있으므로 자동 재조회가 필요하다.
   */
  const waitingCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.listStatus === 'upcoming' &&
          !(
            isWaitingRoomOpen(item.detail?.meeting.operation.queueOpenAt) &&
            (item.detail?.viewer.canEnter || item.detail?.meeting.status === 'READY')
          ),
      ).length,
    [items],
  )

  /**
   * 아직 오픈 전인 팬미팅 중 가장 이른 오픈 시각(ms)이며 없으면 undefined다.
   *
   * 목록을 다시 읽은 직후에만 다시 계산되므로 여기서 쓰는 현재 시각은 그 시점 기준이다.
   */
  const nextQueueOpenAtMs = useMemo(() => {
    const now = Date.now()
    const futureOpenTimes = items
      .filter((item) => item.listStatus === 'upcoming')
      .map((item) => serverLocalDateTimeMs(item.detail?.meeting.operation.queueOpenAt))
      .filter((time) => Number.isFinite(time) && time > now)
    return futureOpenTimes.length ? Math.min(...futureOpenTimes) : undefined
  }, [items])

  useEffect(() => {
    if (nextQueueOpenAtMs === undefined) return

    // 예정된 오픈 시각에 딱 한 번만 다시 조회한다. 주기 폴링과 달리 낭비되는 요청이 없다.
    // 서버와 브라우저의 시계 차이를 감수하도록 1초 여유를 둔다.
    const delay = Math.max(1_000, nextQueueOpenAtMs + 1_000 - Date.now())
    // setTimeout은 지연이 2^31-1ms(약 24.8일)를 넘으면 넘쳐서 즉시 실행된다. 그대로 두면
    // 먼 미래의 팬미팅 때문에 재조회가 무한 반복되므로 예약하지 않고 아래 경로에 맡긴다.
    if (delay > 2_147_483_647) return

    const timer = window.setTimeout(() => {
      backgroundReloadRef.current = true
      setReloadKey((key) => key + 1)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [nextQueueOpenAtMs])

  // 운영자가 대기열을 수동으로 열면 오픈 시각이 과거로 바뀌어 위 예약 타이머가 걸리지 않는다.
  // 화면 복귀와 느린 주기 두 경로로 그 변경을 따라잡는다.
  const reloadInBackground = useCallback(() => {
    // 실제 조회 완료 시점을 기준으로 제한한다. 최초 로드나 수동 새로고침 직후라면 건너뛴다.
    // (폴링 주기가 아니라 lastLoadedAtRef를 기준으로 해야 중복 조회를 정확히 막을 수 있어
    //  이 스로틀은 usePolling으로 옮기지 않고 콜백 안에 남겨 둔다.)
    const MIN_RELOAD_INTERVAL_MS = 15_000
    if (Date.now() - lastLoadedAtRef.current < MIN_RELOAD_INTERVAL_MS) return
    backgroundReloadRef.current = true
    setReloadKey((key) => key + 1)
  }, [])

  // pauseWhenHidden으로 보이지 않는 탭에서는 요청을 아끼고, refreshOnFocus로 화면 복귀 시 즉시 따라잡는다.
  usePolling(reloadInBackground, {
    intervalMs: 30_000,
    enabled: waitingCount > 0,
    immediate: false,
    pauseWhenHidden: true,
    refreshOnFocus: true,
  })

  const upcomingCount = useMemo(
    () => items.filter((item) => item.listStatus === 'upcoming').length,
    [items],
  )
  const completedCount = items.length - upcomingCount

  const filteredItems = useMemo(() => {
    if (status !== 'upcoming' && status !== 'completed') return []

    return items
      .filter((item) => item.listStatus === status)
      .sort((first, second) => {
        const firstTime = new Date(first.application.scheduledStartAt).getTime()
        const secondTime = new Date(second.application.scheduledStartAt).getTime()
        return status === 'upcoming' ? firstTime - secondTime : secondTime - firstTime
      })
  }, [items, status])
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(requestedPage, totalPages)
  const visibleItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )

  useEffect(() => {
    if (loading || requestedPage === currentPage) return
    setSearchParams({ status: status ?? 'upcoming', page: String(currentPage) }, { replace: true })
  }, [currentPage, loading, requestedPage, setSearchParams, status])

  if (status !== 'upcoming' && status !== 'completed') {
    return (
      <InvalidRouteState
        message="status는 upcoming 또는 completed여야 합니다."
        title="팬미팅 목록 상태를 확인할 수 없습니다"
      />
    )
  }

  const isUpcoming = status === 'upcoming'

  async function handleEnterQueue(meetingId: number) {
    if (enteringMeetingId !== undefined) return
    const session = getAuthSession()

    if (!session || session.role !== 'FAN') {
      setQueueError({ meetingId, message: '팬 계정으로 로그인한 뒤 입장해 주세요.' })
      return
    }

    setEnteringMeetingId(meetingId)
    setQueueError(undefined)
    try {
      await enterQueue(meetingId, session.accessToken)
      navigate(`/fan/fan-meetings/${meetingId}/waiting`)
    } catch (error: unknown) {
      // 서버는 "이미 입장함"과 "오픈 전·대기열 미초기화"를 모두 409로 반환하므로
      // 상태 코드가 아니라 ErrorCode로 구분해야 실패 사유가 화면에서 사라지지 않는다.
      const { alreadyEntered, message } = interpretQueueEnterError(error)
      if (alreadyEntered) {
        navigate(`/fan/fan-meetings/${meetingId}/waiting`)
        return
      }
      setQueueError({ meetingId, message })
    } finally {
      setEnteringMeetingId(undefined)
    }
  }

  async function handleDownload(item: FanMeetingListItem) {
    if (!item.recording || downloadingRecordingId !== undefined) return
    const session = getAuthSession()
    if (!session) {
      setDownloadError({ meetingId: item.application.meetingId, message: '로그인이 필요합니다.' })
      return
    }

    setDownloadingRecordingId(item.recording.recordingId)
    setDownloadError(undefined)
    try {
      const signedUrl = await issueRecordingDownloadUrl(
        item.recording.recordingId,
        session.accessToken,
      )
      const anchor = document.createElement('a')
      anchor.href = resolveRecordingContentUrl(signedUrl, true)
      anchor.download = item.recording.fileName || 'recording'
      anchor.rel = 'noopener'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
    } catch (error: unknown) {
      setDownloadError({
        meetingId: item.application.meetingId,
        message: error instanceof Error ? error.message : '다운로드 링크를 만들지 못했습니다.',
      })
    } finally {
      setDownloadingRecordingId(undefined)
    }
  }

  function changePage(page: number) {
    setSearchParams({ status: status ?? 'upcoming', page: String(page) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const statusTabClass = (active: boolean) =>
    `mj-font-emphasis min-h-11 rounded-[var(--radius-control)] border px-[18px] text-[15px] ${
      active
        ? 'border-[var(--color-primary-coral)] bg-[var(--color-primary-coral)] text-white'
        : 'border-[var(--color-border-control)] bg-[var(--color-surface-panel)] hover:border-[var(--color-text-muted)]'
    }`

  return (
    <div>
      <Link
        className="text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        to="/fan/mypage/profile"
      >
        ← 프로필로 돌아가기
      </Link>
      <h1 className="mt-3.5 text-[28px] font-black tracking-[-0.038em]">마이페이지</h1>
      <p className="mt-[7px] text-base font-medium text-[var(--color-text-muted)]">
        내 정보와 참여 내역을 관리하세요.
      </p>

      <nav aria-label="마이페이지 메뉴" className="mt-6 flex gap-[26px] border-b border-[var(--color-divider)]">
        <Link
          className="px-0.5 pb-[13px] text-base font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          to="/fan/mypage/applications"
        >
          응모한 팬미팅
        </Link>
        <span
          aria-current="page"
          className="px-0.5 pb-[13px] text-base font-extrabold text-[var(--color-primary-coral)] shadow-[inset_0_-3px_0_0_var(--color-primary-coral)]"
        >
          내 팬미팅
        </span>
      </nav>

      {listError ? (
        <AlertBanner className="mt-6" title="팬미팅 목록을 확인할 수 없습니다" variant="error">
          <p>{listError}</p>
          <Button
            className="mt-3"
            onClick={() => setReloadKey((key) => key + 1)}
            size="sm"
            variant="secondary"
          >
            목록 다시 불러오기
          </Button>
        </AlertBanner>
      ) : null}
      {partialWarning ? (
        <AlertBanner className="mt-6" title="일부 정보를 확인하지 못했습니다" variant="warning">
          {partialWarning}
        </AlertBanner>
      ) : null}
      {/* 대기열 자동 갱신 상태는 화면 구성 요소를 늘리지 않고 보조기기에만 알린다. */}
      <p aria-live="polite" className="sr-only">
        {refreshing ? '대기열 상태를 확인하는 중입니다.' : ''}
      </p>

      <div aria-label="팬미팅 상태" className="mt-6 flex gap-2" role="tablist">
        <button
          aria-selected={isUpcoming}
          className={statusTabClass(isUpcoming)}
          onClick={() => setSearchParams({ status: 'upcoming', page: '1' })}
          role="tab"
          type="button"
        >
          예정 <span className="font-bold tabular-nums">{upcomingCount}</span>
        </button>
        <button
          aria-selected={!isUpcoming}
          className={statusTabClass(!isUpcoming)}
          onClick={() => setSearchParams({ status: 'completed', page: '1' })}
          role="tab"
          type="button"
        >
          히스토리 <span className="font-bold tabular-nums">{completedCount}</span>
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Spinner label="내 팬미팅 목록을 불러오는 중" />
        </div>
      ) : isUpcoming ? (
        <section aria-label="예정된 팬미팅" className="mt-[26px]">
          {visibleItems.length === 0 ? (
            <p className="py-14 text-center text-sm font-medium text-[var(--color-text-secondary)]">
              예정된 팬미팅이 없습니다.
            </p>
          ) : (
            visibleItems.map((item, index) => {
              const today = isToday(item.application.scheduledStartAt)
              // LIVE 상태만으로 입장을 허용하지 않는다. 대기열 오픈 시각이 지나고
              // 서버가 참가자 입장을 허용한 경우에만 대기실로 이동한다.
              const queueIsOpen = isWaitingRoomOpen(item.detail?.meeting.operation.queueOpenAt)
              const canEnter = Boolean(
                queueIsOpen &&
                  (item.detail?.viewer.canEnter || item.detail?.meeting.status === 'READY'),
              )

              return (
                <article
                  className={`grid grid-cols-1 items-center gap-4 py-6 min-[901px]:grid-cols-[236px_minmax(0,1fr)_auto] min-[901px]:gap-[26px] ${
                    index < visibleItems.length - 1 ? 'border-b border-[var(--color-divider)]' : ''
                  } ${index === 0 ? 'pt-0' : ''}`}
                  key={item.application.applicationId}
                >
                  <figure className="relative m-0 max-w-[320px] overflow-hidden rounded-[10px] bg-[var(--color-surface-muted)] min-[901px]:max-w-none">
                    {item.application.coverImageUrl ? (
                      <img
                        alt=""
                        className="block aspect-[16/10] w-full object-cover"
                        src={item.application.coverImageUrl}
                      />
                    ) : (
                      <div
                        aria-label="대표 이미지가 등록되지 않은 팬미팅"
                        className="grid aspect-[16/10] w-full place-items-center"
                        role="img"
                      >
                        <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                          이미지 없음
                        </span>
                      </div>
                    )}
                    {today ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 h-[3px]"
                        style={{
                          background:
                            'linear-gradient(90deg, rgba(232,97,92,0) 0%, rgba(217,66,63,0.95) 50%, rgba(232,97,92,0) 100%)',
                        }}
                      />
                    ) : null}
                  </figure>
                  <div className="min-w-0">
                    <p
                      className={`text-[13px] font-extrabold ${today ? 'text-[var(--color-primary-coral)]' : 'text-[var(--color-text-muted)]'}`}
                    >
                      {today ? '오늘 진행' : '예정된 팬미팅'}
                    </p>
                    <h2 className="mt-2 text-[22px] font-extrabold tracking-[-0.032em]">
                      {item.application.meetingTitle}
                    </h2>
                    <p className="mt-[7px] text-base font-medium text-[var(--color-text-muted)]">
                      인플루언서 {item.application.influencerName}
                    </p>
                    <p className="mt-3.5 text-[13px] font-bold text-[var(--color-text-muted)]">
                      팬미팅 일정
                    </p>
                    <p className="mt-[5px] text-lg font-extrabold tabular-nums">
                      {formatDateTime(item.application.scheduledStartAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2.5 text-left min-[901px]:items-end min-[901px]:text-right">
                    <span
                      className={`text-sm ${canEnter ? 'font-bold text-[var(--color-success)]' : 'font-semibold text-[var(--color-text-muted)]'}`}
                    >
                      {canEnter ? '지금 입장할 수 있어요' : '입장 전에 장비를 확인해 주세요'}
                    </span>
                    {canEnter ? (
                      <Button
                        className="mj-font-emphasis min-h-[52px] whitespace-nowrap rounded-[10px] px-6 text-base"
                        disabled={enteringMeetingId !== undefined}
                        loading={enteringMeetingId === item.application.meetingId}
                        onClick={() => void handleEnterQueue(item.application.meetingId)}
                      >
                        입장하기
                      </Button>
                    ) : (
                      <Link
                        className="mj-font-emphasis inline-flex min-h-[52px] items-center whitespace-nowrap rounded-[10px] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-6 text-base hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
                        to={`/fan-meetings/${item.application.meetingId}/device-check`}
                      >
                        장비 점검하기
                      </Link>
                    )}
                    {queueError?.meetingId === item.application.meetingId ? (
                      <p className="text-sm font-semibold text-[var(--color-error)]" role="alert">
                        {queueError.message}
                      </p>
                    ) : null}
                  </div>
                </article>
              )
            })
          )}
        </section>
      ) : (
        <section aria-label="지난 팬미팅" className="mt-[26px]">
          <p className="max-w-[60ch] text-base font-medium leading-[1.65] text-[var(--color-text-body)]">
            녹화 영상은 팬미팅 후{' '}
            <strong className="font-extrabold text-[var(--color-text-primary)]">5일</strong> 동안
            보관됩니다. 기간이 지나면 영상은 삭제되고 기록은 그대로 남습니다.
          </p>

          {visibleItems.length === 0 ? (
            <p className="py-14 text-center text-sm font-medium text-[var(--color-text-secondary)]">
              완료된 팬미팅이 없습니다.
            </p>
          ) : (
            <div className="mt-[22px] grid grid-cols-1 gap-7 min-[621px]:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map((item, index) => {
                const playable = Boolean(item.recording?.playable)
                const recordingEnabled = item.detail?.meeting.operation.recordingEnabled
                const isLatest = index === 0 && currentPage === 1

                return (
                  <article className="min-w-0" key={item.application.applicationId}>
                    <figure className="relative m-0 overflow-hidden rounded-[10px] bg-[var(--color-surface-muted)]">
                      {item.application.coverImageUrl ? (
                        <img
                          alt=""
                          className="block aspect-[16/10] w-full object-cover saturate-[0.8]"
                          src={item.application.coverImageUrl}
                        />
                      ) : (
                        <div
                          aria-label="사진이 저장되지 않은 기록"
                          className="grid aspect-[16/10] w-full place-items-center bg-[var(--color-surface-page)]"
                          role="img"
                        >
                          <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                            사진 없음
                          </span>
                        </div>
                      )}
                      {/* MELLY 씰 — 기록물 썸네일 전용 표식이며 최신 기록만 선명하다. */}
                      <span
                        aria-hidden="true"
                        className={`absolute left-[11px] top-[11px] grid size-[22px] place-items-center rounded-full text-[11px] font-black tracking-[-0.05em] text-white ${isLatest ? 'bg-[var(--color-primary-coral)]' : 'bg-[var(--color-primary-coral)]/70'}`}
                      >
                        M
                      </span>
                    </figure>
                    <h2 className="mt-[15px] text-lg font-extrabold tracking-[-0.03em]">
                      {item.application.meetingTitle}
                    </h2>
                    <p className="mt-1.5 text-[15px] font-medium tabular-nums text-[var(--color-text-muted)]">
                      {item.application.influencerName} ·{' '}
                      {formatDateTime(item.application.scheduledStartAt)}
                    </p>
                    {playable && item.recording ? (
                      <>
                        <p className="mt-3 border-t border-[var(--color-divider)] pt-3 text-sm font-extrabold text-[var(--color-warning)]">
                          영상 {remainingDays(item.recording.availableUntil)}일 남음
                        </p>
                        <p className="mt-1 text-sm font-medium tabular-nums text-[var(--color-text-muted)]">
                          {formatDate(item.recording.availableUntil)}까지
                        </p>
                        <button
                          className="mj-font-label mt-3 inline-flex min-h-[46px] items-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-[18px] text-[15px] hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
                          disabled={downloadingRecordingId !== undefined}
                          onClick={() => void handleDownload(item)}
                          type="button"
                        >
                          {downloadingRecordingId === item.recording.recordingId
                            ? '다운로드 준비 중'
                            : '영상 다운로드'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="mt-3 border-t border-[var(--color-divider)] pt-3 text-sm font-extrabold text-[var(--color-text-muted)]">
                          {recordingEnabled === false ? '녹화하지 않은 팬미팅' : '영상 보관 종료'}
                        </p>
                        <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">
                          사진과 기록은 계속 보관
                        </p>
                        <Link
                          className="mj-font-label mt-3 inline-flex min-h-[46px] items-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] bg-[var(--color-surface-panel)] px-[18px] text-[15px] hover:border-[var(--color-primary-coral)] hover:text-[var(--color-primary-coral)]"
                          to={`/fan/fan-meetings/${item.application.meetingId}/complete`}
                        >
                          기록 보기
                        </Link>
                      </>
                    )}
                    {downloadError?.meetingId === item.application.meetingId ? (
                      <p className="mt-2 text-sm font-semibold text-[var(--color-error)]" role="alert">
                        {downloadError.message}
                      </p>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      {!loading && totalPages > 1 ? (
        <nav
          aria-label="팬미팅 목록 페이지"
          className="mt-8 flex items-center justify-center gap-4"
        >
          <Button
            disabled={currentPage <= 1}
            onClick={() => changePage(currentPage - 1)}
            variant="secondary"
          >
            이전
          </Button>
          <p aria-live="polite" className="text-sm font-semibold">
            {currentPage} / {totalPages} 페이지
          </p>
          <Button
            disabled={currentPage >= totalPages}
            onClick={() => changePage(currentPage + 1)}
            variant="secondary"
          >
            다음
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
