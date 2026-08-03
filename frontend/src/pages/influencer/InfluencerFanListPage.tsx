import {
  Camera,
  CheckCircle,
  MagnifyingGlass,
  Microphone,
  NotePencil,
  WarningCircle,
  WifiHigh,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/auth'
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
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Pagination,
  Select,
  Spinner,
  TextField,
} from '../../components'

type ParticipantView = FanMeetingParticipant & {
  queueEntry?: QueueEntry
  hasMemo?: boolean
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

function queueStatusVariant(status?: QueueStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'success' as const
    case 'CALLED':
      return 'warning' as const
    case 'IN_CALL':
      return 'primary' as const
    case 'NO_SHOW':
      return 'danger' as const
    default:
      return 'neutral' as const
  }
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

export function InfluencerFanListPage() {
  const { fanMeetingId } = useParams<{ fanMeetingId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === '1'
  const authToken = getAuthSession()?.accessToken

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
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
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
      const filtered = previewParticipants.filter((participant) => {
        const matchesKeyword =
          !normalizedKeyword || participant.nickname.toLowerCase().includes(normalizedKeyword)
        const matchesMemo =
          memoFilter === 'ALL' ||
          (memoFilter === 'HAS_MEMO' && previewMemoFanIds.has(participant.fanId)) ||
          (memoFilter === 'NO_MEMO' && !previewMemoFanIds.has(participant.fanId))
        return matchesKeyword && matchesMemo
      })

      setMeeting(previewMeeting)
      setParticipants(filtered)
      setQueue(previewQueue)
      setTotalElements(32)
      setTotalPages(2)
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

    void Promise.all([
      fetchMeetingDetail(fanMeetingId, authToken, controller.signal),
      fetchParticipants(
        fanMeetingId,
        { keyword, page: page - 1, size: PAGE_SIZE },
        authToken,
        controller.signal,
      ),
      fetchMeetingQueue(fanMeetingId, authToken, controller.signal),
    ])
      .then(([meetingResponse, participantResponse, queueResponse]) => {
        setMeeting(meetingResponse)
        setParticipants(participantResponse.content)
        setQueue(queueResponse)
        setTotalElements(participantResponse.totalElements)
        setTotalPages(participantResponse.totalPages)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [authToken, fanMeetingId, isPreview, keyword, memoFilter, page])

  const participantViews = useMemo<ParticipantView[]>(() => {
    const queueByParticipant = new Map(
      queue.entries.map((entry) => [entry.participantId, entry]),
    )

    return participants
      .map((participant) => ({
        ...participant,
        queueEntry: queueByParticipant.get(participant.participantId),
        hasMemo: isPreview ? previewMemoFanIds.has(participant.fanId) : undefined,
      }))
      .filter((participant) => {
        if (statusFilter === 'ALL') return true
        return (participant.queueEntry?.status ?? participant.queueStatus) === statusFilter
      })
  }, [isPreview, participants, queue.entries, statusFilter])

  useEffect(() => {
    if (!participantViews.length) {
      setSelectedParticipant(undefined)
      setSelectedMemos([])
      return
    }

    const currentStillVisible = participantViews.some(
      (participant) => participant.participantId === selectedParticipant?.participantId,
    )
    if (!currentStillVisible) setSelectedParticipant(participantViews[0])
  }, [participantViews, selectedParticipant?.participantId])

  const selectedParticipantId = selectedParticipant?.participantId
  const selectedFanId = selectedParticipant?.fanId

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
      fetchFanMemos(selectedFanId, authToken, controller.signal),
    ])
      .then(([participantDetail, memoResponse]) => {
        setSelectedParticipant((current) => ({
          ...current,
          ...participantDetail,
          cameraOk: participantDetail.cameraOk ?? current?.cameraOk,
          microphoneOk: participantDetail.microphoneOk ?? current?.microphoneOk,
        }))
        setSelectedMemos(memoResponse.content)
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
  const completedDeviceCheck =
    selectedParticipant?.cameraOk === true && selectedParticipant.microphoneOk === true

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
    return `/influencer/fan-meetings/${fanMeetingId}/fans/${participant.fanId}/records?tab=memo${callSessionQuery}`
  }

  function openMemo() {
    if (!fanMeetingId || !selectedParticipant) return
    navigate(recordsPath(selectedParticipant))
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-extrabold text-[var(--color-primary-coral)]">
            {meeting?.title ?? '팬미팅'}
          </p>
          <h1 className="mt-2 text-[clamp(2.25rem,4vw,2.65rem)] font-black tracking-[-0.055em]">
            팬 리스트
          </h1>
          <p className="mt-2 text-base text-[var(--color-text-secondary)]">
            참가자의 진행 상태와 입장 준비 정보를 한눈에 확인하세요.
          </p>
        </div>
        <Button
          onClick={() => navigate('/influencer/mypage/profile')}
          size="sm"
          variant="secondary"
        >
          인플루언서 보기
        </Button>
      </header>

      {loadError ? (
        <AlertBanner className="mt-6" title="팬 리스트를 불러오지 못했습니다" variant="error">
          {loadError}
        </AlertBanner>
      ) : null}

      <Card className="mt-7 grid overflow-hidden md:grid-cols-4">
        {[
          ['팬미팅명', meeting?.title ?? '불러오는 중'],
          ['인플루언서', meeting?.influencer.influencerName ?? '불러오는 중'],
          ['진행 상태', meeting?.status === 'IN_PROGRESS' ? '● 진행 중' : meeting?.status ?? '확인 중'],
          ['전체 참가자', `${meeting?.application?.capacity ?? totalElements ?? 0}명`],
        ].map(([label, value], index) => (
          <dl
            className={[
              'px-6 py-5',
              index ? 'border-t border-[var(--color-divider)] md:border-l md:border-t-0' : '',
            ].join(' ')}
            key={label}
          >
            <dt className="text-xs font-bold text-[var(--color-text-tertiary)]">{label}</dt>
            <dd
              className={[
                'mt-2 text-lg font-extrabold',
                label === '진행 상태' ? 'text-[var(--color-primary-coral)]' : '',
              ].join(' ')}
            >
              {value}
            </dd>
          </dl>
        ))}
      </Card>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 overflow-hidden">
          <form
            className="grid gap-4 border-b border-[var(--color-divider)] p-5 lg:grid-cols-[minmax(280px,1fr)_190px_190px_92px]"
            onSubmit={handleSearch}
            role="search"
          >
            <TextField
              endAdornment={
                <span className="px-3 text-[var(--color-text-tertiary)]">
                  <MagnifyingGlass aria-hidden size={20} />
                </span>
              }
              label="팬 검색"
              onChange={(event) => setKeywordInput(event.currentTarget.value)}
              placeholder="팬 이름 또는 닉네임"
              value={keywordInput}
            />
            <Select
              label="상태"
              onChange={(event) => {
                setPage(1)
                setStatusFilter(event.currentTarget.value)
              }}
              options={statusOptions}
              value={statusFilter}
            />
            <Select
              disabled={!isPreview}
              helperText={!isPreview ? '현재 API 필터 미지원' : undefined}
              label="메모"
              onChange={(event) => {
                setPage(1)
                setMemoFilter(event.currentTarget.value)
              }}
              options={memoOptions}
              value={memoFilter}
            />
            <Button className="self-start lg:mt-[27px]" type="submit">
              검색
            </Button>
          </form>

          <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-4 pt-6">
            <div>
              <h2 className="text-xl font-extrabold">참가자 목록</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                팬미팅 참가자 {totalElements}명 중 현재 페이지입니다.
              </p>
            </div>
            <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
              {participantViews.length}명 표시
            </p>
          </div>

          {loading ? (
            <div className="flex min-h-80 items-center justify-center">
              <Spinner label="팬 목록을 불러오는 중" />
            </div>
          ) : participantViews.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <caption className="sr-only">팬미팅 참가자 목록</caption>
                <thead className="bg-[var(--color-surface-page)] text-xs text-[var(--color-text-secondary)]">
                  <tr>
                    <th className="px-5 py-4 font-bold" scope="col">순번</th>
                    <th className="px-5 py-4 font-bold" scope="col">팬</th>
                    <th className="px-5 py-4 font-bold" scope="col">상태</th>
                    <th className="px-5 py-4 font-bold" scope="col">장비 점검</th>
                    <th className="px-5 py-4 font-bold" scope="col">메모</th>
                    <th className="px-5 py-4 font-bold" scope="col">최근 접속</th>
                    <th className="px-5 py-4 font-bold" scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {participantViews.map((participant) => {
                    const queueStatus =
                      participant.queueEntry?.status ?? participant.queueStatus
                    const selected =
                      participant.participantId === selectedParticipant?.participantId
                    const deviceIssue =
                      participant.cameraOk === false || participant.microphoneOk === false

                    return (
                      <tr
                        className={[
                          'border-t border-[var(--color-divider)] transition-colors',
                          selected
                            ? 'bg-[var(--color-primary-coral-soft)] shadow-[inset_3px_0_var(--color-primary-coral)]'
                            : 'hover:bg-[var(--color-surface-page)]',
                        ].join(' ')}
                        key={participant.participantId}
                      >
                        <td className="px-5 py-4 font-extrabold">
                          {String(participant.callOrder).padStart(2, '0')}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-extrabold">{participant.nickname}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                            @{participant.fanId}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant={queueStatusVariant(queueStatus)}>
                            {queueStatusLabel(queueStatus)}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={[
                              'inline-flex items-center gap-1.5 font-bold',
                              deviceIssue
                                ? 'text-[var(--color-warning)]'
                                : participant.cameraOk === true &&
                                    participant.microphoneOk === true
                                  ? 'text-[var(--color-success)]'
                                  : 'text-[var(--color-text-tertiary)]',
                            ].join(' ')}
                          >
                            {deviceIssue ? (
                              <WarningCircle aria-hidden size={17} weight="fill" />
                            ) : (
                              <CheckCircle aria-hidden size={17} weight="fill" />
                            )}
                            {deviceIssue
                              ? '문제 있음'
                              : participant.cameraOk === true &&
                                  participant.microphoneOk === true
                                ? '완료'
                                : '확인 전'}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-semibold">
                          {participant.hasMemo === true
                            ? '있음'
                            : participant.hasMemo === false
                              ? '없음'
                              : '선택 후 확인'}
                        </td>
                        <td className="px-5 py-4 text-[var(--color-text-secondary)]">
                          {formatEnteredAt(participant.queueEntry?.enteredAt)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <button
                              className="font-bold hover:text-[var(--color-primary-coral)] hover:underline"
                              onClick={() => setSelectedParticipant(participant)}
                              type="button"
                            >
                              상세 보기
                            </button>
                            <button
                              className="font-bold hover:text-[var(--color-primary-coral)] hover:underline"
                              onClick={() => {
                                setSelectedParticipant(participant)
                                navigate(recordsPath(participant))
                              }}
                              type="button"
                            >
                              메모 보기
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center px-5 text-center">
              <div>
                <p className="text-lg font-extrabold">조건에 맞는 팬이 없습니다.</p>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  검색어나 상태 필터를 변경해 보세요.
                </p>
              </div>
            </div>
          )}

          <div className="border-t border-[var(--color-divider)] px-5 py-5">
            <Pagination
              currentPage={page}
              onPageChange={setPage}
              totalPages={totalPages}
            />
          </div>
        </Card>

        <Card className="overflow-hidden xl:sticky xl:top-[calc(var(--service-header-height)+24px)]">
          <div className="p-6">
            <p className="text-sm font-extrabold text-[var(--color-primary-coral)]">
              선택한 팬 요약
            </p>
            {selectedParticipant ? (
              <>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-[-0.035em]">
                      {selectedParticipant.nickname}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      @{selectedParticipant.fanId} · {selectedParticipant.callOrder}번째
                    </p>
                  </div>
                  <Badge variant={queueStatusVariant(selectedQueueStatus)}>
                    {queueStatusLabel(selectedQueueStatus)}
                  </Badge>
                </div>

                <section className="mt-6 border-t border-[var(--color-divider)] pt-5">
                  <h3 className="flex items-center gap-2 font-extrabold">
                    <NotePencil
                      aria-hidden
                      className="text-[var(--color-primary-coral)]"
                      size={20}
                    />
                    최근 메모
                  </h3>
                  {detailLoading ? (
                    <div className="mt-4">
                      <Spinner label="팬 메모를 불러오는 중" />
                    </div>
                  ) : recentMemo ? (
                    <>
                      <p className="mt-4 text-sm leading-7 text-[var(--color-text-secondary)]">
                        {recentMemo.content}
                      </p>
                      <Button
                        className="mt-4 w-full"
                        leadingIcon={<NotePencil aria-hidden size={18} />}
                        onClick={openMemo}
                        variant="secondary"
                      >
                        메모 보기
                      </Button>
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                      작성된 이전 메모가 없습니다.
                    </p>
                  )}
                </section>

                <section className="mt-6 border-t border-[var(--color-divider)] pt-5">
                  <h3 className="flex items-center gap-2 font-extrabold">
                    <CheckCircle
                      aria-hidden
                      className="text-[var(--color-primary-coral)]"
                      size={20}
                    />
                    장비 점검 상태
                  </h3>
                  <dl className="mt-4 grid gap-3">
                    {[
                      {
                        label: '카메라',
                        icon: <Camera aria-hidden size={19} />,
                        ok: selectedParticipant.cameraOk,
                        goodLabel: '완료',
                      },
                      {
                        label: '마이크',
                        icon: <Microphone aria-hidden size={19} />,
                        ok: selectedParticipant.microphoneOk,
                        goodLabel: '완료',
                      },
                      {
                        label: '대기열 접속',
                        icon: <WifiHigh aria-hidden size={19} />,
                        ok: Boolean(selectedQueueEntry?.enteredAt),
                        goodLabel: '접속',
                      },
                    ].map((item) => (
                      <div className="flex items-center justify-between gap-4" key={item.label}>
                        <dt className="flex items-center gap-3 text-sm font-semibold text-[var(--color-text-secondary)]">
                          <span className="inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-surface-page)]">
                            {item.icon}
                          </span>
                          {item.label}
                        </dt>
                        <dd
                          className={[
                            'text-sm font-extrabold',
                            item.ok
                              ? 'text-[var(--color-success)]'
                              : 'text-[var(--color-warning)]',
                          ].join(' ')}
                        >
                          {item.ok ? item.goodLabel : '확인 필요'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 text-xs leading-5 text-[var(--color-text-tertiary)]">
                    {completedDeviceCheck
                      ? '카메라와 마이크 점검이 완료되었습니다.'
                      : '장비 이상은 입장을 차단하지 않으며 운영자가 상태를 확인합니다.'}
                  </p>
                </section>
              </>
            ) : (
              <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                목록에서 팬을 선택해 주세요.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
