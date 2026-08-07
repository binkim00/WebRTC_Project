import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getCallSummary } from '../../api/aiSummaries'
import { ApiError } from '../../api/ApiError'
import { getAuthSession, type LoginRole } from '../../api/auth'
import { recallFanCallSession } from '../../api/callSessionLog'
import {
  fetchFanMemos,
  fetchMeetingDetail,
  fetchMeetingQueue,
  fetchParticipantDetail,
  fetchParticipants,
  type FanMeetingParticipant,
  type FanMemo,
  type MeetingDetail,
  type MeetingQueue,
  type QueueEntry,
  type QueueStatus,
} from '../../api/fanMeetingParticipants'
import { isQueueNotInitialized } from '../../api/queue'
import {
  AlertBanner,
  Button,
  Pagination,
  Select,
  Spinner,
  TextField,
} from '../../components'
import { translate, type TranslationKey, useTranslation } from '../../i18n'

type ParticipantView = FanMeetingParticipant & {
  queueEntry?: QueueEntry
}

const PAGE_SIZE = 6

const previewMeeting: MeetingDetail = {
  meetingId: 'demo-meeting',
  title: 'MELLY DAY 팬미팅',
  status: 'IN_PROGRESS',
  scheduledStartAt: '2026-07-29T19:00:00+09:00',
  influencer: {
    influencerId: 'melly',
    influencerName: 'Melly',
  },
  application: {
    capacity: 32,
  },
}

const previewParticipants: FanMeetingParticipant[] = [
  {
    participantId: 'participant-07',
    fanId: 'fan-07',
    nickname: '김하늘',
    callOrder: 7,
    participantStatus: 'ACTIVE',
    queueStatus: 'IN_CALL',
    cameraOk: true,
    microphoneOk: true,
  },
  {
    participantId: 'participant-08',
    fanId: 'fan-08',
    nickname: '박서연',
    callOrder: 8,
    participantStatus: 'ACTIVE',
    queueStatus: 'WAITING',
    cameraOk: true,
    microphoneOk: true,
  },
  {
    participantId: 'participant-09',
    fanId: 'fan-09',
    nickname: '이민지',
    callOrder: 9,
    participantStatus: 'ACTIVE',
    queueStatus: 'CALLED',
    cameraOk: false,
    microphoneOk: true,
  },
  {
    participantId: 'participant-10',
    fanId: 'fan-10',
    nickname: '최유나',
    callOrder: 10,
    participantStatus: 'ACTIVE',
    queueStatus: 'NO_SHOW',
    cameraOk: false,
    microphoneOk: false,
  },
  {
    participantId: 'participant-11',
    fanId: 'fan-11',
    nickname: '정다은',
    callOrder: 11,
    participantStatus: 'ACTIVE',
    queueStatus: 'COMPLETED',
    cameraOk: true,
    microphoneOk: true,
  },
  {
    participantId: 'participant-12',
    fanId: 'fan-12',
    nickname: '오지민',
    callOrder: 12,
    participantStatus: 'ACTIVE',
    queueStatus: 'WAITING',
    cameraOk: false,
    microphoneOk: true,
  },
]

const previewQueue: MeetingQueue = {
  currentCall: {
    callSessionId: 'call-07',
    participantId: 'participant-07',
    nickname: '김하늘',
    startedAt: '2026-07-29T19:21:00+09:00',
    endsAt: '2026-07-29T19:23:00+09:00',
  },
  entries: previewParticipants.map((participant, index) => ({
    queueEntryId: `queue-${participant.callOrder}`,
    participantId: participant.participantId,
    fanId: participant.fanId,
    nickname: participant.nickname,
    position: participant.callOrder,
    status: participant.queueStatus ?? 'WAITING',
    callAttemptCount: participant.queueStatus === 'CALLED' ? 1 : 0,
    enteredAt: `2026-07-29T${['19:21', '19:18', '19:16', '18:54', '18:40', '18:37'][index]}:00+09:00`,
  })),
}

const previewMemo: FanMemo = {
  memoId: 'memo-07',
  meetingId: 'previous-meeting',
  meetingTitle: '서윤의 여름 이야기',
  content:
    '지난 팬미팅에서 요청한 인사말을 확인했어요. 다음 통화 시작 전 운영자 확인이 필요합니다.',
  createdAt: '2026-06-18T20:10:00+09:00',
  updatedAt: '2026-06-18T20:10:00+09:00',
}

const previewMemoFanIds = new Set(['fan-07', 'fan-08', 'fan-10', 'fan-12'])

/**
 * 필터 선택 항목이다. 문장 대신 **사전 키**를 들고 있다.
 *
 * `as const`를 유지해야 value가 리터럴 타입으로 좁혀지므로, 배열 자체는 모듈 로드 시점에 만들고
 * 라벨만 렌더할 때 옮긴다(모듈 로드 시점에 번역하면 처음 언어로 굳는다).
 */
const statusOptions = [
  { labelKey: 'influencerFanListPage.filter.allStatus', value: 'ALL' },
  { labelKey: 'influencerFanListPage.filter.waiting', value: 'WAITING' },
  { labelKey: 'influencerFanListPage.filter.called', value: 'CALLED' },
  { labelKey: 'influencerFanListPage.filter.inCall', value: 'IN_CALL' },
  { labelKey: 'influencerFanListPage.filter.completed', value: 'COMPLETED' },
  { labelKey: 'influencerFanListPage.filter.noShow', value: 'NO_SHOW' },
] as const satisfies readonly { labelKey: TranslationKey; value: string }[]

const memoOptions = [
  { labelKey: 'influencerFanListPage.filter.allMemo', value: 'ALL' },
  { labelKey: 'influencerFanListPage.filter.hasMemo', value: 'HAS_MEMO' },
  { labelKey: 'influencerFanListPage.filter.noMemo', value: 'NO_MEMO' },
] as const satisfies readonly { labelKey: TranslationKey; value: string }[]

function queueStatusLabel(status?: QueueStatus) {
  switch (status) {
    case 'WAITING':
      return translate('influencerFanListPage.t63')
    case 'CALLED':
      return translate('influencerFanListPage.t64')
    case 'IN_CALL':
      return translate('influencerFanListPage.t65')
    case 'COMPLETED':
      return translate('influencerFanListPage.t66')
    case 'NO_SHOW':
      return translate('influencerFanListPage.t67')
    default:
      return translate('influencerFanListPage.t68')
  }
}

function queueStatusClass(status?: QueueStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'text-[var(--color-text-secondary)]'
    case 'CALLED':
      return 'text-[var(--color-primary-coral)]'
    case 'IN_CALL':
      return 'text-[var(--color-success)]'
    case 'NO_SHOW':
      return 'text-[var(--color-error)]'
    default:
      return 'text-[var(--color-text-secondary)]'
  }
}

function meetingStatusContent(status?: string) {
  const labels: Record<string, { label: string; className: string }> = {
    DRAFT: { label: translate('influencerFanListPage.t69'), className: 'text-[var(--color-text-secondary)]' },
    PUBLISHED: { label: translate('influencerFanListPage.t70'), className: 'text-[var(--color-text-secondary)]' },
    APPLICATION_OPEN: { label: translate('influencerFanListPage.t71'), className: 'text-[var(--color-primary-coral)]' },
    APPLICATION_CLOSED: { label: translate('influencerFanListPage.t72'), className: 'text-[var(--color-warning)]' },
    READY: { label: translate('influencerFanListPage.t73'), className: 'text-[var(--color-warning)]' },
    LIVE: { label: translate('influencerFanListPage.t74'), className: 'text-[var(--color-success)]' },
    IN_PROGRESS: { label: translate('influencerFanListPage.t75'), className: 'text-[var(--color-success)]' },
    ENDED: { label: translate('influencerFanListPage.t76'), className: 'text-[var(--color-text-secondary)]' },
    CANCELED: { label: translate('influencerFanListPage.t77'), className: 'text-[var(--color-error)]' },
  }
  return status && labels[status]
    ? labels[status]
    : { label: translate('influencerFanListPage.t78'), className: 'text-[var(--color-text-secondary)]' }
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof TypeError) return error.message
  return translate('influencerFanListPage.t84')
}

/** 팬 메모 API는 팬 1명 단위라 목록의 메모 유무는 팬마다 한 번씩 확인해야 한다. */
const MEMO_PRESENCE_CONCURRENCY = 6

/**
 * 여러 팬의 메모 유무를 확인한다.
 *
 * 참가자 응답에 메모 유무가 없어 팬 수만큼 요청이 필요하므로, 한 번에 몰아 보내지 않고
 * 묶음으로 나눠 보내고 유무 판단에 필요한 1건만 받는다. 개별 실패는 '확인 전'으로 남긴다.
 */
async function loadMemoPresence(
  fanIds: readonly string[],
  authToken: string,
  signal?: AbortSignal,
): Promise<Record<string, boolean>> {
  const presence: Record<string, boolean> = {}

  for (let start = 0; start < fanIds.length; start += MEMO_PRESENCE_CONCURRENCY) {
    if (signal?.aborted) break

    const batch = fanIds.slice(start, start + MEMO_PRESENCE_CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (fanId) => {
        try {
          const response = await fetchFanMemos(fanId, authToken, signal, 1)
          return [fanId, response.content.length > 0] as const
        } catch {
          return undefined
        }
      }),
    )

    for (const result of results) {
      if (result) presence[result[0]] = result[1]
    }
  }

  return presence
}

export type InfluencerFanListPageProps = {
  /** 공통 참가자 화면에서 전달하는 실제 조회자 역할이다. 미지정 시 로그인 세션을 사용한다. */
  viewerRole?: LoginRole
}

export function InfluencerFanListPage({ viewerRole }: InfluencerFanListPageProps = {}) {
  const { t } = useTranslation()
  const { fanMeetingId } = useParams<{ fanMeetingId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const authSession = getAuthSession()
  const authToken = authSession?.accessToken
  const effectiveRole = viewerRole ?? authSession?.role
  // 팬 메모 API는 인플루언서 본인 범위이므로 매니저 화면에서는 호출하거나 링크하지 않는다.
  const canUseFanRecords =
    isPreview || effectiveRole === 'INFLUENCER' || effectiveRole === 'SOLO_INFLUENCER'

  const [meeting, setMeeting] = useState<MeetingDetail>()
  const [participants, setParticipants] = useState<FanMeetingParticipant[]>([])
  const [queue, setQueue] = useState<MeetingQueue>({ entries: [] })
  const [selectedParticipant, setSelectedParticipant] = useState<FanMeetingParticipant>()
  const [selectedMemos, setSelectedMemos] = useState<FanMemo[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [memoFilter, setMemoFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [participantTotal, setParticipantTotal] = useState(0)
  /** fanId → 메모 유무. 확인하지 못한 팬은 키가 없다. 팬 단위 캐시라 페이지를 넘어도 유지한다. */
  const [memoPresence, setMemoPresence] = useState<Record<string, boolean>>({})
  const [memoScanning, setMemoScanning] = useState(false)
  /** 정리 카드에서 "건너뛰기"한 팬. 다음 미작성 팬을 고를 때 제외한다. */
  const [skippedFanIds, setSkippedFanIds] = useState<ReadonlySet<string>>(new Set())
  const [focusSummaryLines, setFocusSummaryLines] = useState<string[]>([])
  const [focusSummaryNotice, setFocusSummaryNotice] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>()

  useEffect(() => {
    if (!fanMeetingId) {
      setLoadError(t('influencerFanListPage.t32'))
      setLoading(false)
      return
    }

    if (isPreview) {
      const normalizedKeyword = keyword.trim().toLowerCase()
      const filtered = previewParticipants.filter(
        (participant) =>
          !normalizedKeyword || participant.nickname.toLowerCase().includes(normalizedKeyword),
      )

      setMeeting(previewMeeting)
      setParticipants(filtered)
      setQueue(previewQueue)
      setParticipantTotal(32)
      // 프리뷰는 목업이므로 메모 유무를 조회하지 않고 그대로 채운다.
      setMemoPresence(
        Object.fromEntries(
          previewParticipants.map((participant) => [
            participant.fanId,
            previewMemoFanIds.has(participant.fanId),
          ]),
        ),
      )
      setLoadError(undefined)
      setLoading(false)
      return
    }

    if (!authToken) {
      setLoadError(t('influencerFanListPage.t33'))
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setLoadError(undefined)

    void (async () => {
      const [
        meetingResponse,
        firstParticipantPage,
        participantCountPage,
        queueResponse,
      ] = await Promise.all([
          fetchMeetingDetail(fanMeetingId, authToken, controller.signal),
          fetchParticipants(
            fanMeetingId,
            { keyword, page: 0, size: 100 },
            authToken,
            controller.signal,
          ),
          fetchParticipants(
            fanMeetingId,
            { page: 0, size: 1 },
            authToken,
            controller.signal,
          ),
          // 대기열은 상태 필터를 보정하는 보조 정보일 뿐이다. 대기열을 아직 열지 않았거나
          // 팬미팅이 종료되면 백엔드가 409 QUEUE_NOT_INITIALIZED를 반환하는데, 이때
          // Promise.all이 함께 깨져 팬 목록 전체가 "불러오지 못했습니다"로 실패했다.
          // 빈 대기열로 대체하면 참가자 API가 주는 queueStatus로 그대로 표시할 수 있다.
          fetchMeetingQueue(fanMeetingId, authToken, controller.signal).catch(
            (reason: unknown) => {
              if (isQueueNotInitialized(reason)) return { entries: [] } as MeetingQueue
              throw reason
            },
          ),
        ])
      const allParticipants = [...firstParticipantPage.content]

      // 대기열 상태는 참가자 API의 서버 필터가 아니므로 전체 페이지를 합친 뒤 정확히 필터링한다.
      for (let nextPage = 1; nextPage < firstParticipantPage.totalPages; nextPage += 1) {
        const response = await fetchParticipants(
          fanMeetingId,
          { keyword, page: nextPage, size: 100 },
          authToken,
          controller.signal,
        )
        allParticipants.push(...response.content)
      }

      // 상태·메모 필터와 페이지 나누기는 렌더에서 계산한다. 여기서 자르면 메모 필터가
      // 걸린 뒤의 전체 건수를 알 수 없어 페이지 수가 어긋난다.
      return {
        meetingResponse,
        queueResponse,
        participantTotal: participantCountPage.totalElements,
        allParticipants,
      }
    })()
      .then(
        ({
          meetingResponse,
          queueResponse,
          participantTotal: nextParticipantTotal,
          allParticipants,
        }) => {
          setMeeting(meetingResponse)
          setParticipants(allParticipants)
          setQueue(queueResponse)
          setParticipantTotal(nextParticipantTotal)
        },
      )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, fanMeetingId, isPreview, keyword])

  const participantViews = useMemo<ParticipantView[]>(() => {
    const queueByParticipant = new Map(
      queue.entries.map((entry) => [entry.participantId, entry]),
    )

    return participants
      .map((participant) => ({
        ...participant,
        queueEntry: queueByParticipant.get(participant.participantId),
      }))
      .filter((participant) => {
        if (statusFilter === 'ALL') return true
        return (participant.queueEntry?.status ?? participant.queueStatus) === statusFilter
      })
  }, [participants, queue.entries, statusFilter])

  const memoFilteredViews = useMemo(() => {
    if (memoFilter === 'ALL') return participantViews
    const wanted = memoFilter === 'HAS_MEMO'
    // 아직 확인하지 못한 팬은 어느 쪽으로도 단정하지 않고 목록에서 제외한다.
    return participantViews.filter((participant) => memoPresence[participant.fanId] === wanted)
  }, [memoFilter, memoPresence, participantViews])

  const totalPages = Math.max(1, Math.ceil(memoFilteredViews.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visibleViews = memoFilteredViews.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  /**
   * 메모 유무를 확인할 팬 목록이다.
   *
   * 평소에는 표에 보이는 페이지만 확인하고, 메모 필터를 걸 때만 전체를 확인한다.
   * 두 경우 모두 memoPresence에 의존하지 않아야 조회 → 목록 변화 → 재조회로 돌지 않는다.
   */
  /**
   * 통화가 끝난 뒤 인플루언서가 AI 요약을 읽고 팬 메모를 하나씩 정리하는 모드다.
   * 작성률 게이지와 "이어서 정리할 팬" 카드를 띄우려면 전체 팬의 메모 유무가 필요하다.
   */
  const reviewMode = canUseFanRecords && meeting?.status === 'ENDED'

  const memoScanScope = useMemo(() => {
    if (!canUseFanRecords || isPreview) return []
    if (memoFilter !== 'ALL' || reviewMode) return participantViews
    const pageStart = (Math.min(page, Math.max(1, Math.ceil(participantViews.length / PAGE_SIZE))) - 1) * PAGE_SIZE
    return participantViews.slice(pageStart, pageStart + PAGE_SIZE)
  }, [canUseFanRecords, isPreview, memoFilter, page, participantViews, reviewMode])

  const pendingMemoScan = memoScanScope
    .map((participant) => participant.fanId)
    .filter((id) => memoPresence[id] === undefined)
    .join(',')

  useEffect(() => {
    if (!pendingMemoScan || !authToken) return

    const controller = new AbortController()
    setMemoScanning(true)

    void loadMemoPresence(pendingMemoScan.split(','), authToken, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setMemoPresence((current) => ({ ...current, ...result }))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMemoScanning(false)
      })

    return () => controller.abort()
  }, [authToken, pendingMemoScan])

  const selectedParticipantId = selectedParticipant?.participantId
  const selectedFanId = selectedParticipant?.fanId

  useEffect(() => {
    // 목록을 클릭해 직접 고른 선택만 유지한다. 검색·필터·페이지 이동으로 그 팬이
    // 화면에서 사라지면 선택을 지우되, 아무도 안 고른 팬을 대신 골라 요약을 띄우지 않는다.
    if (!selectedParticipantId) return

    const stillVisible = visibleViews.some(
      (participant) => participant.participantId === selectedParticipantId,
    )
    if (!stillVisible) {
      setSelectedParticipant(undefined)
      setSelectedMemos([])
    }
  }, [selectedParticipantId, visibleViews])

  useEffect(() => {
    if (!fanMeetingId || !selectedParticipantId || !selectedFanId) return

    if (isPreview) {
      setSelectedMemos(
        previewMemoFanIds.has(selectedFanId) ? [previewMemo] : [],
      )
      setDetailLoading(false)
      return
    }

    if (!authToken) return

    const controller = new AbortController()
    setDetailLoading(true)

    void Promise.all([
      fetchParticipantDetail(
        fanMeetingId,
        selectedParticipantId,
        authToken,
        controller.signal,
      ),
      canUseFanRecords
        ? fetchFanMemos(selectedFanId, authToken, controller.signal)
        : Promise.resolve({ content: [] as FanMemo[] }),
    ])
      .then(([participantDetail, memoResponse]) => {
        // 응답이 도착했을 땐 이미 다른 팬을 선택했을 수 있다. abort된 요청의 응답으로
        // 지금 선택을 덮어쓰면 선택 유지 effect와 서로 되돌리며 무한 루프가 된다.
        if (controller.signal.aborted) return

        setSelectedParticipant((current) =>
          current?.participantId === selectedParticipantId
            ? {
                ...current,
                // 상세 조회는 보강 정보만 준다. participantId·fanId 같은 신원 필드는
                // 지금 선택(current)의 것을 유지해 응답이 뒤바뀌어도 선택이 흔들리지 않게 한다.
                cameraOk: participantDetail.cameraOk ?? current.cameraOk,
                microphoneOk: participantDetail.microphoneOk ?? current.microphoneOk,
              }
            : current,
        )
        setSelectedMemos(memoResponse.content)
        // 이미 받아 온 메모로 유무를 확정해 같은 팬을 다시 조회하지 않는다.
        if (canUseFanRecords) {
          setMemoPresence((current) => ({
            ...current,
            [selectedFanId]: memoResponse.content.length > 0,
          }))
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })

    return () => controller.abort()
  }, [
    authToken,
    canUseFanRecords,
    fanMeetingId,
    isPreview,
    selectedFanId,
    selectedParticipantId,
  ])

  const selectedView = participantViews.find(
    (participant) => participant.participantId === selectedParticipantId,
  )
  const selectedQueueEntry = selectedView?.queueEntry
  const selectedQueueStatus =
    selectedQueueEntry?.status ?? selectedParticipant?.queueStatus
  const recentMemo = selectedMemos[0]

  /** 정리 모드 진행 현황이다. 지금 불러와 있는 전체 참가자를 기준으로 센다. */
  const memoDoneCount = reviewMode
    ? participants.filter((participant) => memoPresence[participant.fanId] === true).length
    : 0
  const memoScanComplete =
    reviewMode &&
    participants.length > 0 &&
    participants.every((participant) => memoPresence[participant.fanId] !== undefined)
  /** 이어서 정리할 팬 — 통화 순서대로 메모가 없는 첫 팬이다. 건너뛴 팬은 제외한다. */
  const focusFan = reviewMode
    ? [...participants]
        .sort((left, right) => left.callOrder - right.callOrder)
        .find(
          (participant) =>
            memoPresence[participant.fanId] === false &&
            !skippedFanIds.has(participant.fanId),
        )
    : undefined
  /** 미작성 팬이 남아 있지만 전부 건너뛰어 카드가 비었는지. 되돌릴 버튼을 보여 준다. */
  const hasSkippedRemaining =
    reviewMode &&
    !focusFan &&
    participants.some(
      (participant) =>
        memoPresence[participant.fanId] === false && skippedFanIds.has(participant.fanId),
    )

  const focusFanId = focusFan?.fanId
  useEffect(() => {
    if (!reviewMode || !focusFanId || !fanMeetingId || !authToken) {
      setFocusSummaryLines([])
      setFocusSummaryNotice(undefined)
      return
    }

    // 통화 세션 기록은 대기열을 지켜본 브라우저에만 남는다. 없으면 미리보기 대신 안내만 띄운다.
    const sessionId = recallFanCallSession(fanMeetingId, focusFanId)
    if (!sessionId) {
      setFocusSummaryLines([])
      setFocusSummaryNotice(t('influencerFanListPage.review.noSummaryRecord'))
      return
    }

    const controller = new AbortController()
    setFocusSummaryNotice(undefined)

    void getCallSummary(sessionId, authToken, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.state === 'COMPLETED') {
          setFocusSummaryLines(
            result.summary.summary
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          )
          setFocusSummaryNotice(undefined)
          return
        }
        setFocusSummaryLines([])
        setFocusSummaryNotice(t('influencerFanRecordPage.summary.generating'))
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setFocusSummaryLines([])
        setFocusSummaryNotice(t('influencerFanRecordPage.summary.failed'))
      })

    return () => controller.abort()
    // t는 언어가 바뀔 때만 새로 만들어진다. 의존성에 넣으면 언어 전환이 재조회를 유발한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, fanMeetingId, focusFanId, reviewMode])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setKeyword(keywordInput)
  }

  /**
   * 팬 기록 화면 경로를 만든다.
   *
   * 통화 요약 조회에는 callSessionId가 필요한데 참가자 응답에는 없다.
   * 지금 통화 중인 팬을 여는 경우에만 현재 세션을 쿼리로 넘겨 요약 탭이 동작하게 한다.
   */
  function recordsPath(participant: { participantId: string; fanId: string }) {
    const callSessionId = participant.participantId === queue.currentCall?.participantId
      ? queue.currentCall?.callSessionId
      : undefined
    const callSessionQuery = callSessionId
      ? `&callSessionId=${encodeURIComponent(callSessionId)}`
      : ''
    return `/influencer/fan-meetings/${encodeURIComponent(fanMeetingId ?? '')}/fans/${encodeURIComponent(participant.fanId)}/records?tab=memo${callSessionQuery}`
  }

  function openMemo() {
    if (!canUseFanRecords || !fanMeetingId || !selectedParticipant) return
    navigate(recordsPath(selectedParticipant))
  }

  const roleLabel = effectiveRole === 'MANAGER' ? t('influencerFanListPage.t34') : t('influencerFanListPage.t35')
  const currentMeetingStatus = meetingStatusContent(meeting?.status)
  const equipmentWarning =
    selectedParticipant?.cameraOk === false || selectedParticipant?.microphoneOk === false

  function resetFilters() {
    setKeywordInput('')
    setKeyword('')
    setStatusFilter('ALL')
    setMemoFilter('ALL')
    setPage(1)
  }

  return (
    <div>
      {/* 시안의 페이지 머리: 상태 아이브로 + 팬미팅 제목 + (정리 모드) 큰 작성률 스탯. */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--color-divider)] pb-6">
        <div className="min-w-0">
          <p className={`text-[11px] font-extrabold uppercase tracking-[0.18em] ${currentMeetingStatus.className}`}>
            {currentMeetingStatus.label}
            {meeting?.influencer.influencerName ? ` · ${meeting.influencer.influencerName}` : ''}
          </p>
          <h1 className="mt-2 truncate text-[27px] font-black tracking-[-0.045em]">
            {meeting?.title ?? t('influencerFanListPage.t36')}
          </h1>
          <p className="mt-1.5 text-sm font-medium text-[var(--color-text-secondary)]">
            {t('influencerFanListPage.t1')} · {t('influencerFanListPage.t85', { p0: participantTotal })} · {roleLabel}
          </p>
        </div>
        {reviewMode ? (
          <div className="text-right">
            <p className="text-[32px] font-black leading-none tracking-[-0.04em] tabular-nums">
              <span className="text-[var(--color-primary-coral)]">{memoDoneCount}</span>
              <span className="text-[17px] font-extrabold text-[var(--color-text-muted)]">
                {' '}/ {participants.length}
              </span>
            </p>
            <p className="mt-2 text-[11px] font-bold tracking-[0.12em] text-[var(--color-text-secondary)]">
              {t('influencerFanListPage.review.statCaption')}
            </p>
          </div>
        ) : null}
        {reviewMode ? (
          // 참가자 한 명이 한 칸이다. 메모를 쓸 때마다 통화 순서 자리가 코랄로 채워진다.
          <div aria-hidden className="flex w-full basis-full gap-[3px]">
            {[...participants]
              .sort((left, right) => left.callOrder - right.callOrder)
              .map((participant) => (
                <i
                  className={`h-[5px] min-w-0 flex-1 rounded-full ${
                    memoPresence[participant.fanId] === true
                      ? 'bg-[var(--color-primary-coral)]'
                      : 'bg-[var(--color-surface-muted)]'
                  }`}
                  key={participant.participantId}
                />
              ))}
          </div>
        ) : null}
      </header>

      {loadError ? (
        <AlertBanner className="mt-6" title={t('influencerFanListPage.t3')} variant="error">
          {loadError}
        </AlertBanner>
      ) : null}

      {reviewMode ? (
        <section aria-label={t('influencerFanListPage.review.title')} className="mt-6">

          {focusFan ? (
            <div className="relative overflow-hidden rounded-2xl border border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] p-6">
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{
                  background:
                    'linear-gradient(90deg, var(--color-primary-coral), var(--color-primary-coral-highlight) 55%, transparent)',
                }}
              />
              <p className="text-[11px] font-extrabold tracking-[0.18em] text-[var(--color-primary-coral)]">
                {t('influencerFanListPage.review.focusTag')}
              </p>
              <div className="mt-3.5 flex flex-wrap items-center gap-3.5">
                <span
                  aria-hidden
                  className="grid size-12 place-items-center rounded-full bg-[var(--color-primary-coral)] text-lg font-black text-white"
                >
                  {focusFan.nickname.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-black tracking-[-0.03em]">
                    {focusFan.nickname}
                  </p>
                  <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                    @{focusFan.fanId} ·{' '}
                    {t('influencerFanListPage.review.order', { p0: focusFan.callOrder })}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[1.3fr_1fr]">
                <div className="max-h-36 min-w-0 overflow-y-auto rounded-xl bg-[var(--color-surface-panel)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-primary-coral-soft-border)]">
                  <p className="text-[10px] font-extrabold tracking-[0.16em] text-[var(--color-primary-coral)]">
                    {t('influencerFanListPage.review.summaryTitle')}
                  </p>
                  {focusSummaryNotice ? (
                    <p className="mt-1.5 text-sm font-medium leading-6 text-[var(--color-text-muted)]">
                      {focusSummaryNotice}
                    </p>
                  ) : null}
                  {focusSummaryLines.map((line) => (
                    <p className="mt-1.5 text-sm font-medium leading-[1.7] text-[var(--color-text-body)]" key={line}>
                      {line}
                    </p>
                  ))}
                </div>
                <div className="grid place-items-center rounded-xl border border-dashed border-[var(--color-primary-coral-soft-border)] bg-[var(--color-surface-panel)] px-4 py-5 text-center">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                      {t('influencerFanListPage.review.memoEmpty')}
                    </p>
                    <button
                      className="mt-3 inline-flex min-h-10 items-center rounded-[10px] bg-[var(--color-primary-coral)] px-5 text-sm font-extrabold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                      onClick={() => navigate(recordsPath(focusFan))}
                      type="button"
                    >
                      {t('influencerFanListPage.review.writeMemo')}
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm font-bold">
                <button
                  className="min-h-9 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
                  onClick={() =>
                    setSkippedFanIds(new Set([...skippedFanIds, focusFan.fanId]))
                  }
                  type="button"
                >
                  {t('influencerFanListPage.review.skip')}
                </button>
                <button
                  className="min-h-9 font-extrabold text-[var(--color-primary-coral)] hover:underline"
                  onClick={() => navigate(recordsPath(focusFan))}
                  type="button"
                >
                  {t('influencerFanListPage.review.viewRecords')}
                </button>
              </div>
            </div>
          ) : hasSkippedRemaining ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-divider)] px-5 py-4">
              <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                {t('influencerFanListPage.review.skippedNotice')}
              </p>
              <Button onClick={() => setSkippedFanIds(new Set())} variant="outline">
                {t('influencerFanListPage.review.showSkipped')}
              </Button>
            </div>
          ) : memoScanComplete ? (
            <p
              className="mt-4 rounded-xl bg-[var(--color-success-soft)] px-5 py-4 text-sm font-extrabold text-[var(--color-success)]"
              role="status"
            >
              {t('influencerFanListPage.review.allDone')}
            </p>
          ) : memoScanning ? (
            <p className="mt-4 text-sm font-semibold text-[var(--color-text-secondary)]" role="status">
              {t('influencerFanListPage.review.scanning')}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="mt-7">
        <div className="min-w-0">
          <form
            className="grid grid-cols-2 items-end gap-3 md:grid-cols-[minmax(0,1fr)_150px_auto]"
            onSubmit={handleSearch}
            role="search"
          >
            <TextField
              containerClassName="col-span-2 md:col-span-1"
              label={t('influencerFanListPage.t5')}
              onChange={(event) => setKeywordInput(event.currentTarget.value)}
              placeholder={t('influencerFanListPage.t6')}
              value={keywordInput}
            />
            <Select
              label={t('influencerFanListPage.t7')}
              onChange={(event) => {
                setPage(1)
                setStatusFilter(event.currentTarget.value)
              }}
              options={statusOptions.map((option) => ({
                label: t(option.labelKey),
                value: option.value,
              }))}
              value={statusFilter}
            />
            <Button className="whitespace-nowrap" type="submit">
              {t('influencerFanListPage.t9')}
            </Button>
          </form>

          {!canUseFanRecords ? (
            <p className="mt-2 text-sm font-medium text-[var(--color-text-secondary)]">
              {t('influencerFanListPage.t10')}
            </p>
          ) : null}

          {/* 시안의 명단 머리: 제목·인원과 메모 필터 칩을 한 줄에 둔다. */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[15px] font-extrabold tracking-[-0.02em]">
              {t('influencerFanListPage.t11')}{' '}
              <span className="font-bold text-[var(--color-text-muted)] tabular-nums">
                {participantTotal}
              </span>
            </h2>
            {canUseFanRecords ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('influencerFanListPage.t8')}>
                {memoOptions.map((option) => {
                  const active = memoFilter === option.value
                  return (
                    <button
                      aria-pressed={active}
                      className={`min-h-8 rounded-full px-3.5 text-[12.5px] font-extrabold transition-colors ${
                        active
                          ? 'bg-[var(--color-text-primary)] text-[var(--color-text-on-dark)]'
                          : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                      key={option.value}
                      onClick={() => {
                        setPage(1)
                        setMemoFilter(option.value)
                      }}
                      type="button"
                    >
                      {t(option.labelKey)}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="flex min-h-80 items-center justify-center">
              <Spinner label={t('influencerFanListPage.t15')} />
            </div>
          ) : memoFilter !== 'ALL' && memoScanning ? (
            // 메모 유무를 팬마다 확인하는 중이다. 절반만 확인된 목록을 결과로 보여 주지 않는다.
            <div className="flex min-h-80 items-center justify-center">
              <Spinner label={t('influencerFanListPage.t16')} />
            </div>
          ) : visibleViews.length ? (
            <div className="mt-2" aria-label={t('influencerFanListPage.t17')}>
              {visibleViews.map((participant) => {
                const queueStatus = participant.queueEntry?.status ?? participant.queueStatus
                const selected = participant.participantId === selectedParticipant?.participantId
                const hasMemo = memoPresence[participant.fanId]
                const memoContent = !canUseFanRecords
                  ? { label: t('influencerFanListPage.t49'), className: 'text-[var(--color-text-muted)]' }
                  : hasMemo === true
                    ? { label: t('influencerFanListPage.review.memoDone'), className: 'text-[var(--color-success)]' }
                    : hasMemo === false
                      ? { label: t('influencerFanListPage.review.memoTodo'), className: 'text-[var(--color-primary-coral)]' }
                      : { label: t('influencerFanListPage.t52'), className: 'text-[var(--color-text-muted)]' }

                return (
                  <div key={participant.participantId}>
                  <button
                    aria-current={selected ? 'true' : undefined}
                    aria-expanded={selected}
                    aria-label={`${participant.nickname} ${selected ? t('influencerFanListPage.t53') : t('influencerFanListPage.t54')}`}
                    className={`relative flex w-full items-center gap-3.5 rounded-xl border-b border-[var(--color-border-row)] px-3 py-3 text-left transition-colors last:border-0 hover:bg-[var(--color-surface-subtle)] ${selected ? 'bg-[var(--color-primary-coral-soft)] hover:bg-[var(--color-primary-coral-soft)]' : ''}`}
                    onClick={() => {
                      // 같은 행을 다시 누르면 선택을 해제해, 목록을 훑어보는 중 우연히 열린
                      // 요약 패널을 계속 닫아 두는 방법이 없던 문제를 없앤다.
                      if (selected) {
                        setSelectedParticipant(undefined)
                        setSelectedMemos([])
                        return
                      }
                      setSelectedParticipant(participant)
                    }}
                    type="button"
                  >
                    <span className="w-6 text-[12.5px] font-extrabold tabular-nums text-[var(--color-text-muted)]">
                      {String(participant.callOrder).padStart(2, '0')}
                    </span>
                    <span
                      aria-hidden
                      className={`grid size-9 flex-none place-items-center rounded-full text-[13px] font-extrabold ${
                        selected
                          ? 'bg-[var(--color-primary-coral)] text-white'
                          : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-body)] shadow-[inset_0_0_0_1px_var(--color-border-row)]'
                      }`}
                    >
                      {participant.nickname.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[14.5px] tracking-[-0.02em] ${selected ? 'font-extrabold' : 'font-bold'}`}>
                        {participant.nickname}
                      </span>
                      <span className="block truncate text-xs font-medium text-[var(--color-text-muted)]">
                        @{participant.fanId}
                      </span>
                    </span>
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-extrabold ${queueStatusClass(queueStatus)}`}>
                      <i aria-hidden className="size-1.5 rounded-full bg-current" />
                      {queueStatusLabel(queueStatus)}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-extrabold ${memoContent.className}`}>
                      <i aria-hidden className="size-1.5 rounded-full bg-current" />
                      {memoContent.label}
                    </span>
                    {/* 행이 눌린다는 것을 알리는 펼침 표시다. 선택되면 코랄로 바뀐다. */}
                    <span
                      aria-hidden
                      className={`text-sm font-black ${selected ? 'text-[var(--color-primary-coral)]' : 'text-[var(--color-text-tertiary)]'}`}
                    >
                      {selected ? '⌄' : '⟩'}
                    </span>
                  </button>

                  {/* 행을 누르면 바로 아래로 펼쳐지는 상세 카드다. 옆 패널 대신 손가락이 있던 자리에서 열린다. */}
                  {selected && selectedParticipant ? (
                    <div className="mb-3 mt-1.5 overflow-hidden rounded-2xl border border-[var(--color-primary-coral-soft-border)] bg-[var(--color-primary-coral-soft)] p-5 motion-safe:animate-[mj-settle-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]">
                      {/* 대기·장비 상태는 칩 한 줄로 요약한다. */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-panel)] px-3 py-1 text-[12px] font-extrabold shadow-[inset_0_0_0_1px_var(--color-border-row)] ${queueStatusClass(selectedQueueStatus)}`}>
                          <i aria-hidden className="size-1.5 rounded-full bg-current" />
                          {queueStatusLabel(selectedQueueStatus)}
                        </span>
                        {[
                          // 대기열 접속만 상태 문구가 다르므로(접속/미접속) 라벨이 아니라 kind로 구분한다.
                          { kind: 'device' as const, label: t('influencerFanListPage.t55'), ok: selectedParticipant.cameraOk },
                          { kind: 'device' as const, label: t('influencerFanListPage.t56'), ok: selectedParticipant.microphoneOk },
                          { kind: 'queueEntry' as const, label: t('influencerFanListPage.t57'), ok: Boolean(selectedQueueEntry?.enteredAt) },
                        ].map((item) => (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-panel)] px-3 py-1 text-[12px] font-bold shadow-[inset_0_0_0_1px_var(--color-border-row)] ${
                              item.ok === true
                                ? 'text-[var(--color-success)]'
                                : item.ok === false
                                  ? 'text-[var(--color-warning)]'
                                  : 'text-[var(--color-text-muted)]'
                            }`}
                            key={item.label}
                          >
                            {item.label}{' '}
                            {item.ok === true
                              ? item.kind === 'queueEntry' ? t('influencerFanListPage.t58') : t('influencerFanListPage.t59')
                              : item.ok === false
                                ? item.kind === 'queueEntry' ? t('influencerFanListPage.t60') : t('influencerFanListPage.t61')
                                : t('influencerFanListPage.t62')}
                          </span>
                        ))}
                      </div>

                      {equipmentWarning ? (
                        <p className="mt-3 rounded-[var(--radius-control)] bg-[var(--color-warning-soft)] px-3 py-2 text-sm font-semibold leading-6 text-[var(--color-warning)]" role="status">
                          {t('influencerFanListPage.t31')}
                        </p>
                      ) : null}

                      {canUseFanRecords ? (
                        <>
                          <div className="mt-3.5 rounded-xl bg-[var(--color-surface-panel)] px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-primary-coral-soft-border)]">
                            <p className="text-[10.5px] font-extrabold tracking-[0.16em] text-[var(--color-primary-coral)]">
                              {t('influencerFanListPage.t24')}
                            </p>
                            {detailLoading ? (
                              <div className="mt-2">
                                <Spinner label={t('influencerFanListPage.t26')} />
                              </div>
                            ) : recentMemo ? (
                              // 긴 메모가 카드 레이아웃을 밀어내지 않도록 박스 안에서만 스크롤한다.
                              <div className="mt-1.5 max-h-40 overflow-y-auto">
                                <p className="whitespace-pre-line text-sm font-medium leading-7 text-[var(--color-text-body)]">
                                  {recentMemo.content}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-1.5 text-sm font-medium leading-6 text-[var(--color-text-muted)]">
                                {t('influencerFanListPage.expand.noMemo')}
                              </p>
                            )}
                          </div>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[12.5px] font-semibold text-[var(--color-text-muted)]">
                              {t('influencerFanListPage.expand.hint')}
                            </p>
                            <button
                              className="inline-flex min-h-10 items-center rounded-[10px] bg-[var(--color-primary-coral)] px-5 text-sm font-extrabold text-white transition-colors hover:bg-[var(--color-primary-coral-hover)]"
                              onClick={openMemo}
                              type="button"
                            >
                              {t('influencerFanListPage.expand.cta')}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="mt-3.5 text-sm font-medium leading-6 text-[var(--color-text-secondary)]">
                          {t('influencerFanListPage.t25')}
                        </p>
                      )}
                    </div>
                  ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mt-4 grid min-h-72 place-items-center border-t border-[var(--color-border-control)] px-5 text-center" role="status">
              <div>
                <strong className="text-lg font-extrabold tracking-[-0.03em]">{t('influencerFanListPage.t18')}</strong>
                <span className="mt-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  {t('influencerFanListPage.t19')}
                </span>
                <Button className="mt-4" onClick={resetFilters} variant="outline">{t('influencerFanListPage.t20')}</Button>
              </div>
            </div>
          )}

          {visibleViews.length ? (
            <div className="mt-6">
              <Pagination
                currentPage={safePage}
                onPageChange={setPage}
                totalPages={totalPages}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
