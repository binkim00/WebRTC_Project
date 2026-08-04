import { ImageSquare } from '@phosphor-icons/react'
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
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  Spinner,
  Tabs,
} from '../../components'
import { InvalidRouteState } from '../../components/routing/ScreenPage'
import { fanMeetingStatusContent } from './fanMeetingStatus'

type FanMeetingListStatus = 'upcoming' | 'completed'

type FanMeetingListItem = {
  application: MyApplicationSummaryResponse
  detail?: PublicFanMeetingDetail
  detailNotFound?: boolean
  listStatus: FanMeetingListStatus
  recording?: RecordingSummaryResponse
}

const FAN_MEETING_TABS = [
  {
    value: 'upcoming',
    label: '예정',
    tabId: 'fan-meetings-upcoming-tab',
    panelId: 'fan-meetings-upcoming-panel',
  },
  {
    value: 'completed',
    label: '히스토리',
    tabId: 'fan-meetings-completed-tab',
    panelId: 'fan-meetings-completed-panel',
  },
] as const
const ITEMS_PER_PAGE = 6

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isCompletedStatus(status: FanMeetingDetailStatus | undefined): boolean {
  return status === 'ENDED' || status === 'CANCELED'
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

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header>
        <Link
          className="inline-flex items-center text-sm font-medium text-[var(--color-text-secondary)] transition-colors duration-200 hover:text-[var(--color-primary-coral)] motion-reduce:transition-none"
          to="/fan/mypage/profile"
        >
          ← 프로필로 돌아가기
        </Link>
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
          마이페이지
        </h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          내 정보와 참여 내역을 관리하세요.
        </p>
      </header>

      <section className="mt-12">
        {listError ? (
          <AlertBanner className="mb-6" title="팬미팅 목록을 확인할 수 없습니다" variant="error">
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
          <AlertBanner className="mb-6" title="일부 정보를 확인하지 못했습니다" variant="warning">
            {partialWarning}
          </AlertBanner>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">팬미팅</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {isUpcoming
                ? '참가가 확정된 다가오는 팬미팅을 확인하세요.'
                : '참여한 팬미팅과 저장된 녹화 영상을 확인하세요.'}
            </p>
            {/* 대기열이 열리면 새로고침 없이 버튼이 바뀐다는 것을 알려 준다. */}
            {isUpcoming && waitingCount > 0 ? (
              <p
                aria-live="polite"
                className="mt-2 text-sm font-semibold text-[var(--color-text-tertiary)]"
              >
                {refreshing
                  ? '대기열 상태를 확인하는 중입니다.'
                  : '대기열이 열리면 이 화면에서 바로 입장할 수 있습니다.'}
              </p>
            ) : null}
          </div>
          <Tabs
            ariaLabel="팬미팅 목록 상태"
            items={FAN_MEETING_TABS}
            onValueChange={(nextStatus) =>
              setSearchParams({ status: nextStatus, page: '1' })
            }
            value={status}
          />
        </div>

        {/* 선택된 탭과 실제 목록 영역을 명시적으로 연결해 스크린리더가 문맥을 유지하게 한다. */}
        <div
          aria-labelledby={`fan-meetings-${status}-tab`}
          id={`fan-meetings-${status}-panel`}
          role="tabpanel"
          tabIndex={0}
        >
        {loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Spinner label="내 팬미팅 목록을 불러오는 중" size="lg" />
          </div>
        ) : visibleItems.length === 0 ? (
          <Card className="mt-6">
            <CardContent className="py-14 text-center text-[var(--color-text-secondary)]">
              {isUpcoming ? '예정된 팬미팅이 없습니다.' : '완료된 팬미팅이 없습니다.'}
            </CardContent>
          </Card>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {visibleItems.map((item) => {
              const meeting = item.detail?.meeting
              const meetingStatus = meeting?.status
              const statusContent = meetingStatus
                ? fanMeetingStatusContent[meetingStatus]
                : undefined
              // LIVE 상태만으로 입장을 허용하지 않는다. 대기열 오픈 시각이 지나고
              // 서버가 참가자 입장을 허용한 경우에만 장비 점검·대기실로 이동한다.
              const queueIsOpen = isWaitingRoomOpen(item.detail?.meeting.operation.queueOpenAt)
              const canEnter = Boolean(
                queueIsOpen &&
                  (item.detail?.viewer.canEnter || item.detail?.meeting.status === 'READY'),
              )
              const recordingEnabled = meeting?.operation.recordingEnabled
              const recordingReady = Boolean(item.recording?.playable)

              return (
                <Card className="overflow-hidden" key={item.application.applicationId}>
                  {item.application.coverImageUrl ? (
                    <img
                      alt={`${item.application.meetingTitle} 대표 이미지`}
                      className="h-56 w-full object-cover"
                      src={item.application.coverImageUrl}
                    />
                  ) : (
                    <div className="flex h-56 items-center justify-center bg-[var(--color-divider)] text-[var(--color-text-tertiary)]">
                      <ImageSquare aria-hidden size={44} weight="duotone" />
                      <span className="sr-only">등록된 대표 이미지가 없습니다</span>
                    </div>
                  )}

                  <CardContent>
                    <Badge variant={statusContent?.variant ?? (isUpcoming ? 'primary' : 'neutral')}>
                      {statusContent?.label ?? (isUpcoming ? '참가 확정' : '참여 완료')}
                    </Badge>
                    <h3 className="mt-3 text-xl font-bold text-[var(--color-text-primary)]">
                      {item.application.meetingTitle}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                      인플루언서 {item.application.influencerName}
                    </p>
                    <div className="mt-6">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {isUpcoming ? '팬미팅 일정' : '참여 일자'}
                      </p>
                      <time
                        className="mt-1 block font-semibold text-[var(--color-text-primary)]"
                        dateTime={item.application.scheduledStartAt}
                      >
                        {formatDateTime(item.application.scheduledStartAt)}
                      </time>
                    </div>
                  </CardContent>

                  <CardFooter className="grid gap-4">
                    {isUpcoming ? (
                      <>
                        <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                          {canEnter
                            ? '지금 대기실에 입장할 수 있어요.'
                            : '입장 전에 카메라와 마이크를 점검해 주세요.'}
                        </p>
                        <Button
                          className="w-full"
                          disabled={enteringMeetingId !== undefined}
                          loading={enteringMeetingId === item.application.meetingId}
                          onClick={() =>
                            canEnter
                              ? void handleEnterQueue(item.application.meetingId)
                              : navigate(`/fan-meetings/${item.application.meetingId}/device-check`)
                          }
                          size="lg"
                          variant={canEnter ? 'primary' : 'secondary'}
                        >
                          {canEnter ? '대기실 입장' : '장비 점검하기'}
                        </Button>
                        {queueError?.meetingId === item.application.meetingId ? (
                          <AlertBanner title="대기실 입장 실패" variant="error">
                            {queueError.message}
                          </AlertBanner>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {recordingReady && item.recording ? (
                          <>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                              영상 보관 기한{' '}
                              <strong className="text-[var(--color-text-primary)]">
                                {formatDateTime(item.recording.availableUntil)}
                              </strong>
                            </p>
                            <Badge className="w-fit" variant="success">녹화 영상 저장 완료</Badge>
                            <Button
                              className="w-full"
                              loading={downloadingRecordingId === item.recording.recordingId}
                              onClick={() => void handleDownload(item)}
                              size="lg"
                              variant="secondary"
                            >
                              녹화 영상 다운로드
                            </Button>
                          </>
                        ) : (
                          <Badge className="w-fit" variant="neutral">
                            {recordingEnabled === false
                              ? '녹화하지 않은 팬미팅'
                              : item.recording?.status === 'EXPIRED'
                                ? '녹화 영상 보관 종료'
                                : '녹화 영상 없음'}
                          </Badge>
                        )}
                        <Link
                          className="inline-flex min-h-[var(--control-height)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-control)] px-4 py-2 text-sm font-semibold"
                          to={`/fan/fan-meetings/${item.application.meetingId}/complete`}
                        >
                          완료 내역 보기
                        </Link>
                        {downloadError?.meetingId === item.application.meetingId ? (
                          <AlertBanner title="다운로드 실패" variant="error">
                            {downloadError.message}
                          </AlertBanner>
                        ) : null}
                      </>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}

        {!loading && filteredItems.length > 0 ? (
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
      </section>
    </div>
  )
}
