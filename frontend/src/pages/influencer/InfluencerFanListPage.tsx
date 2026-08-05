import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession, type LoginRole } from '../../api/auth'
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
import { useTranslation } from '../../i18n'

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

const statusOptions = [
  { label: '전체 상태', value: 'ALL' },
  { label: '대기', value: 'WAITING' },
  { label: '호출', value: 'CALLED' },
  { label: '통화 중', value: 'IN_CALL' },
  { label: '완료', value: 'COMPLETED' },
  { label: '노쇼', value: 'NO_SHOW' },
] as const

const memoOptions = [
  { label: '전체', value: 'ALL' },
  { label: '메모 있음', value: 'HAS_MEMO' },
  { label: '메모 없음', value: 'NO_MEMO' },
] as const

function queueStatusLabel(status?: QueueStatus) {
  switch (status) {
    case 'WAITING':
      return '대기'
    case 'CALLED':
      return '호출'
    case 'IN_CALL':
      return '통화 중'
    case 'COMPLETED':
      return '완료'
    case 'NO_SHOW':
      return '노쇼'
    default:
      return '확인 전'
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
    DRAFT: { label: '작성 중', className: 'text-[var(--color-text-secondary)]' },
    PUBLISHED: { label: '발행됨', className: 'text-[var(--color-text-secondary)]' },
    APPLICATION_OPEN: { label: '응모 접수 중', className: 'text-[var(--color-primary-coral)]' },
    APPLICATION_CLOSED: { label: '응모 마감', className: 'text-[var(--color-warning)]' },
    READY: { label: '시작 대기', className: 'text-[var(--color-warning)]' },
    LIVE: { label: '진행 중', className: 'text-[var(--color-success)]' },
    IN_PROGRESS: { label: '진행 중', className: 'text-[var(--color-success)]' },
    ENDED: { label: '종료', className: 'text-[var(--color-text-secondary)]' },
    CANCELED: { label: '취소됨', className: 'text-[var(--color-error)]' },
  }
  return status && labels[status]
    ? labels[status]
    : { label: '확인 중', className: 'text-[var(--color-text-secondary)]' }
}

function equipmentContent(participant: FanMeetingParticipant) {
  if (participant.cameraOk === true && participant.microphoneOk === true) {
    return { label: '완료', className: 'text-[var(--color-success)]' }
  }
  if (participant.cameraOk === false || participant.microphoneOk === false) {
    return { label: '미완료', className: 'text-[var(--color-warning)]' }
  }
  return { label: '확인 전', className: 'text-[var(--color-text-secondary)]' }
}

function formatEnteredAt(value?: string) {
  if (!value) return '미접속'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '확인 불가'

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof TypeError) return error.message
  return '팬 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
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
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>()

  useEffect(() => {
    if (!fanMeetingId) {
      setLoadError('팬미팅 식별자가 없습니다.')
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
      setLoadError('로그인 정보가 없습니다. 로그인 후 다시 시도해 주세요.')
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
  const memoScanScope = useMemo(() => {
    if (!canUseFanRecords || isPreview) return []
    if (memoFilter !== 'ALL') return participantViews
    const pageStart = (Math.min(page, Math.max(1, Math.ceil(participantViews.length / PAGE_SIZE))) - 1) * PAGE_SIZE
    return participantViews.slice(pageStart, pageStart + PAGE_SIZE)
  }, [canUseFanRecords, isPreview, memoFilter, page, participantViews])

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

  const roleLabel = effectiveRole === 'MANAGER' ? '매니저 보기' : '인플루언서 보기'
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
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-bold text-[var(--color-text-secondary)]">
            {meeting?.title ?? '팬미팅'}
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.035em]">
            {t('influencerFanListPage.t1')}
          </h1>
          <p className="mt-2 text-sm font-medium text-[var(--color-text-secondary)]">
            {t('influencerFanListPage.t2')}
          </p>
        </div>
        <p className="whitespace-nowrap text-sm font-bold text-[var(--color-text-secondary)]">
          {roleLabel}
        </p>
      </header>

      {loadError ? (
        <AlertBanner className="mt-6" title={t('influencerFanListPage.t3')} variant="error">
          {loadError}
        </AlertBanner>
      ) : null}

      <section
        aria-label={t('influencerFanListPage.t4')}
        className="mt-6 grid grid-cols-2 border-y border-[var(--color-divider)] lg:grid-cols-4"
      >
        {[
          ['팬미팅명', meeting?.title ?? '불러오는 중'],
          ['인플루언서', meeting?.influencer.influencerName ?? '불러오는 중'],
          ['진행 상태', currentMeetingStatus.label],
          ['전체 참가자', `${participantTotal}명`],
        ].map(([label, value], index) => (
          <dl
            className={[
              'min-w-0 py-4',
              index % 2 ? 'border-l border-[var(--color-divider)] pl-5' : 'pr-5',
              index >= 2 ? 'border-t border-[var(--color-divider)] lg:border-t-0' : '',
              index ? 'lg:border-l lg:border-[var(--color-divider)] lg:px-5' : '',
              index === 3 ? 'lg:pr-0' : '',
            ].join(' ')}
            key={label}
          >
            <dt className="text-xs font-bold text-[var(--color-text-secondary)]">{label}</dt>
            <dd
              className={[
                'mt-2 truncate text-base font-extrabold',
                label === '진행 상태' ? currentMeetingStatus.className : '',
              ].join(' ')}
            >
              {value}
            </dd>
          </dl>
        ))}
      </section>

      <div className="mt-7 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
        <div className="min-w-0">
          <form
            className="grid grid-cols-2 items-end gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px_auto]"
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
              options={statusOptions}
              value={statusFilter}
            />
            <Select
              disabled={!canUseFanRecords}
              label={t('influencerFanListPage.t8')}
              onChange={(event) => {
                setPage(1)
                setMemoFilter(event.currentTarget.value)
              }}
              options={memoOptions}
              value={memoFilter}
            />
            <Button className="whitespace-nowrap" type="submit">
              {t('influencerFanListPage.t9')}
            </Button>
          </form>

          {/*
            * 비활성 사유는 필드 안(helperText)에 두면 그 칸만 높아져 bottom 정렬이 밀리므로
            * 폼 아래 한 줄로 뺀다.
            */}
          {!canUseFanRecords ? (
            <p className="mt-2 text-sm font-medium text-[var(--color-text-secondary)]">
              {t('influencerFanListPage.t10')}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold tracking-[-0.028em]">{t('influencerFanListPage.t11')}</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {t('influencerFanListPage.t12')} {participantTotal}{t('influencerFanListPage.t13')}
              </p>
            </div>
            <p className="whitespace-nowrap text-sm font-extrabold">
              {visibleViews.length}{t('influencerFanListPage.t14')}
            </p>
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
            <div className="mt-4" role="table" aria-label={t('influencerFanListPage.t17')}>
              <div
                className="hidden grid-cols-[52px_minmax(0,1fr)_84px_96px_66px_74px] gap-3 border-b border-[var(--color-border-control)] pb-3 md:grid"
                role="row"
              >
                {['순번', '팬', '상태', '장비 점검', '메모', '최근 접속'].map((label) => (
                  <span
                    className={`text-xs font-bold text-[var(--color-text-secondary)] ${label === '최근 접속' ? 'text-right' : ''}`}
                    key={label}
                    role="columnheader"
                  >
                    {label}
                  </span>
                ))}
              </div>
              {visibleViews.map((participant) => {
                const queueStatus = participant.queueEntry?.status ?? participant.queueStatus
                const selected = participant.participantId === selectedParticipant?.participantId
                const equipment = equipmentContent(participant)
                const hasMemo = memoPresence[participant.fanId]
                const memoLabel = !canUseFanRecords
                  ? '확인 불가'
                  : hasMemo === true
                    ? '있음'
                    : hasMemo === false
                      ? '없음'
                      : '확인 전'

                return (
                  <button
                    aria-current={selected ? 'true' : undefined}
                    aria-label={`${participant.nickname} ${selected ? '선택 해제' : '상세 보기'}`}
                    className={`relative grid w-full grid-cols-2 items-center gap-2 border-b border-[var(--color-border-row)] px-2 py-3 text-left hover:bg-[var(--color-surface-subtle)] md:grid-cols-[52px_minmax(0,1fr)_84px_96px_66px_74px] md:gap-3 ${selected ? 'bg-[var(--color-surface-subtle)]' : ''}`}
                    key={participant.participantId}
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
                    role="row"
                    type="button"
                  >
                    {/* 배경 음영만으로는 선택 여부가 거의 보이지 않아, 앱 전역의 "선택 항목 = 코랄 좌측 바" 관례를 따른다. */}
                    {selected ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-[3px] bg-[var(--color-primary-coral)]"
                      />
                    ) : null}
                    <span className="text-sm font-extrabold tabular-nums text-[var(--color-text-secondary)]" role="cell">
                      {String(participant.callOrder).padStart(2, '0')}
                    </span>
                    <span className="min-w-0" role="cell">
                      <span className={`block truncate text-base ${selected ? 'font-extrabold' : 'font-semibold'}`}>
                        {participant.nickname}
                      </span>
                      <span className="mt-1 block truncate text-sm font-medium text-[var(--color-text-secondary)]">
                        @{participant.fanId}
                      </span>
                    </span>
                    <span className={`whitespace-nowrap text-sm font-extrabold ${queueStatusClass(queueStatus)}`} role="cell">
                      {queueStatusLabel(queueStatus)}
                    </span>
                    <span className={`whitespace-nowrap text-sm font-bold ${equipment.className}`} role="cell">
                      {equipment.label}
                    </span>
                    <span className="whitespace-nowrap text-sm font-bold text-[var(--color-text-secondary)]" role="cell">
                      {memoLabel}
                    </span>
                    <span className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-[var(--color-text-secondary)]" role="cell">
                      {formatEnteredAt(participant.queueEntry?.enteredAt)}
                    </span>
                  </button>
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

        <aside
          aria-label={t('influencerFanListPage.t21')}
          className="min-w-0 rounded-[var(--radius-control)] border border-[var(--color-divider)] p-5"
        >
          {selectedParticipant ? (
            <>
                <p className="text-xs font-bold text-[var(--color-text-secondary)]">{t('influencerFanListPage.t22')}</p>
                <div className="mt-2 flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-black tracking-[-0.032em]">
                      {selectedParticipant.nickname}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-[var(--color-text-secondary)]">
                      @{selectedParticipant.fanId} · {selectedParticipant.callOrder}{t('influencerFanListPage.t23')}
                    </p>
                  </div>
                  <span className={`whitespace-nowrap text-sm font-extrabold ${queueStatusClass(selectedQueueStatus)}`}>
                    {queueStatusLabel(selectedQueueStatus)}
                  </span>
                </div>

                <section className="mt-5 border-t border-[var(--color-divider)] pt-4">
                  <h3 className="text-sm font-extrabold">{t('influencerFanListPage.t24')}</h3>
                  {!canUseFanRecords ? (
                    <p className="mt-3 text-sm font-medium leading-6 text-[var(--color-text-secondary)]">
                      {t('influencerFanListPage.t25')}
                    </p>
                  ) : detailLoading ? (
                    <div className="mt-3">
                      <Spinner label={t('influencerFanListPage.t26')} />
                    </div>
                  ) : recentMemo ? (
                    <>
                      <p className="mt-3 text-sm font-medium leading-7 text-[var(--color-text-body)]">
                        {recentMemo.content}
                      </p>
                      <button className="mt-3 min-h-11 font-bold hover:text-[var(--color-primary-coral)]" onClick={openMemo} type="button">
                        {t('influencerFanListPage.t27')}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-sm font-medium leading-6 text-[var(--color-text-secondary)]">
                        {t('influencerFanListPage.t28')}
                      </p>
                      <button className="mt-2 min-h-11 font-extrabold text-[var(--color-primary-coral)]" onClick={openMemo} type="button">
                        {t('influencerFanListPage.t29')}
                      </button>
                    </>
                  )}
                </section>

                <section className="mt-5 border-t border-[var(--color-divider)] pt-4">
                  <h3 className="text-sm font-extrabold">{t('influencerFanListPage.t30')}</h3>
                  <dl className="mt-3 grid gap-3">
                    {[
                      {
                        label: '카메라',
                        ok: selectedParticipant.cameraOk,
                      },
                      {
                        label: '마이크',
                        ok: selectedParticipant.microphoneOk,
                      },
                      {
                        label: '대기열 접속',
                        ok: Boolean(selectedQueueEntry?.enteredAt),
                      },
                    ].map((item) => (
                      <div className="flex items-center justify-between gap-4" key={item.label}>
                        <dt className="text-sm font-semibold text-[var(--color-text-body)]">
                          {item.label}
                        </dt>
                        <dd
                          className={[
                            'text-sm font-extrabold',
                            item.ok === true
                              ? 'text-[var(--color-success)]'
                              : item.ok === false
                                ? 'text-[var(--color-warning)]'
                                : 'text-[var(--color-text-tertiary)]',
                          ].join(' ')}
                        >
                          {item.ok === true
                            ? item.label === '대기열 접속' ? '접속' : '완료'
                            : item.ok === false
                              ? item.label === '대기열 접속' ? '미접속' : '미완료'
                              : '확인 전'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {equipmentWarning ? (
                    <p className="mt-4 rounded-[var(--radius-control)] bg-[var(--color-warning-soft)] px-3 py-2 text-sm font-semibold leading-6 text-[var(--color-warning)]" role="status">
                      {t('influencerFanListPage.t31')}
                    </p>
                  ) : null}
                </section>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
