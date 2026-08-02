import {
  BellRinging,
  Check,
  HourglassMedium,
  ListNumbers,
  UsersThree,
  WifiHigh,
  Wrench,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertBanner, Badge, Button, Card, Dialog, Textarea } from '../../components'
import { useNavigate, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/authSession'
import { ApiError } from '../../api/ApiError'
import { fetchMeetingDetail, type MeetingDetail } from '../../api/fanMeetingParticipants'
import { getMyQueue, type QueueSnapshotResponse } from '../../api/queue'
import { createQueueChangeRequest } from '../../api/queueManagement'

/** DeviceCheckPage가 sessionStorage에 저장하는 장비 점검 기록이다. */
type DeviceCheckRecord = {
  cameraOk: boolean
  microphoneOk: boolean
  speakerOk: boolean | null
  networkOk: boolean
  checkedAt: string
}

function readDeviceCheckRecord(meetingId: string): DeviceCheckRecord | null {
  try {
    const serialized = window.sessionStorage.getItem(`melly-device-check:${meetingId}`)
    if (!serialized) return null

    const parsed: unknown = JSON.parse(serialized)
    if (typeof parsed !== 'object' || parsed === null) return null

    const record = parsed as Record<string, unknown>
    if (
      typeof record.cameraOk !== 'boolean' ||
      typeof record.microphoneOk !== 'boolean' ||
      typeof record.networkOk !== 'boolean' ||
      typeof record.checkedAt !== 'string'
    ) {
      return null
    }

    return {
      cameraOk: record.cameraOk,
      microphoneOk: record.microphoneOk,
      speakerOk: typeof record.speakerOk === 'boolean' ? record.speakerOk : null,
      networkOk: record.networkOk,
      checkedAt: record.checkedAt,
    }
  } catch {
    return null
  }
}

const MAX_CHANGE_REASON_LENGTH = 500

export function FanMeetingWaitingPage() {
  const { fanMeetingId } = useParams()
  const navigate = useNavigate()
  const [meetingInfo, setMeetingInfo] = useState<MeetingDetail>()
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshotResponse>()
  const [meetingError, setMeetingError] = useState<string>()
  const [queueError, setQueueError] = useState<string>()
  const [changeDialogOpen, setChangeDialogOpen] = useState(false)
  const [changeReason, setChangeReason] = useState('')
  const [isRequestingChange, setIsRequestingChange] = useState(false)
  const [changeRequested, setChangeRequested] = useState(false)
  const [changeError, setChangeError] = useState<string>()

  const deviceCheck = useMemo(
    () => (fanMeetingId ? readDeviceCheckRecord(fanMeetingId) : null),
    [fanMeetingId],
  )

  const loadMeetingInfo = useCallback(async (signal?: AbortSignal) => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session || session.role !== 'FAN') {
      setMeetingError('팬 계정으로 로그인한 뒤 대기실을 이용해 주세요.')
      return
    }

    try {
      const nextMeetingInfo = await fetchMeetingDetail(
        fanMeetingId,
        session.accessToken,
        signal,
      )
      setMeetingInfo(nextMeetingInfo)
      setMeetingError(undefined)
    } catch (reason) {
      if (signal?.aborted) return
      setMeetingError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '팬미팅 정보를 불러오지 못했습니다.',
      )
    }
  }, [fanMeetingId])

  const loadQueueState = useCallback(async (signal?: AbortSignal) => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session || session.role !== 'FAN') {
      setQueueError('팬 계정으로 로그인한 뒤 대기실을 이용해 주세요.')
      return
    }

    try {
      const nextQueueSnapshot = await getMyQueue(
        fanMeetingId,
        session.accessToken,
        signal,
      )
      setQueueSnapshot(nextQueueSnapshot)
      setQueueError(undefined)

      if (nextQueueSnapshot.displayStatus === 'COMPLETED') {
        navigate(`/fan/fan-meetings/${fanMeetingId}/complete`, { replace: true })
      }
    } catch (reason) {
      if (signal?.aborted) return
      setQueueError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '대기열 상태를 불러오지 못했습니다.',
      )
    }
  }, [fanMeetingId, navigate])

  useEffect(() => {
    const controller = new AbortController()
    void loadMeetingInfo(controller.signal)

    return () => controller.abort()
  }, [loadMeetingInfo])

  useEffect(() => {
    const controller = new AbortController()
    void loadQueueState(controller.signal)

    const timer = window.setInterval(() => {
      void loadQueueState(controller.signal)
    }, 3_000)

    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [loadQueueState])

  if (!fanMeetingId) {
    return null
  }

  const currentPosition = queueSnapshot?.position ?? 0
  const estimatedWaitMinutes = Math.ceil((queueSnapshot?.estimatedWaitSec ?? 0) / 60)
  const isCalled = Boolean(queueSnapshot?.canEnterCall && queueSnapshot.callSessionId)
  // 장비 점검 기록이 없으면 미확인 상태로 표시한다.
  const connectionHealthy = deviceCheck ? deviceCheck.networkOk : undefined
  const deviceChecked = deviceCheck
    ? deviceCheck.cameraOk && deviceCheck.microphoneOk
    : undefined
  const trimmedChangeReason = changeReason.trim()
  const error = meetingError ?? queueError

  async function handleChangeRequestSubmit() {
    if (isRequestingChange || !queueSnapshot) return

    const session = getAuthSession()
    if (!session || session.role !== 'FAN') {
      setChangeError('팬 계정으로 로그인한 뒤 요청해 주세요.')
      return
    }

    if (!trimmedChangeReason) {
      setChangeError('요청 사유를 입력해 주세요.')
      return
    }

    if (trimmedChangeReason.length > MAX_CHANGE_REASON_LENGTH) {
      setChangeError(`요청 사유는 ${MAX_CHANGE_REASON_LENGTH}자 이하로 입력해 주세요.`)
      return
    }

    setIsRequestingChange(true)
    setChangeError(undefined)

    try {
      await createQueueChangeRequest(
        queueSnapshot.queueEntryId,
        trimmedChangeReason,
        session.accessToken,
      )
      setChangeRequested(true)
      setChangeDialogOpen(false)
      setChangeReason('')
    } catch (reason) {
      setChangeError(
        reason instanceof ApiError && reason.status === 409
          ? '이미 접수된 순서 변경 요청이 있습니다.'
          : reason instanceof ApiError || reason instanceof TypeError
            ? reason.message
            : '순서 변경 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setIsRequestingChange(false)
    }
  }

  const handleEnterCall = () => {
    if (!queueSnapshot?.canEnterCall || !queueSnapshot.callSessionId) return
    navigate(
      `/fan/fan-meetings/${fanMeetingId}/calls/${encodeURIComponent(String(queueSnapshot.callSessionId))}`,
    )
  }

  return (
    <div className="grid gap-6 pb-8">
      {error ? (
        <AlertBanner title="대기실 정보를 확인할 수 없습니다" variant="error">
          {error}
        </AlertBanner>
      ) : null}

      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.035em] sm:text-3xl">
              {meetingInfo?.title ?? '팬미팅 대기실'}
            </h1>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-secondary)]">
              인플루언서 {meetingInfo?.influencer.influencerName ?? '확인 중'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
              <WifiHigh
                aria-hidden
                className={
                  connectionHealthy
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-warning)]'
                }
                size={21}
                weight="bold"
              />
              연결 상태
              <strong
                className={
                  connectionHealthy
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-warning)]'
                }
              >
                {connectionHealthy === undefined
                  ? '미확인'
                  : connectionHealthy
                    ? '정상'
                    : '확인 필요'}
              </strong>
            </p>
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
              <Wrench
                aria-hidden
                className={
                  deviceChecked
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-warning)]'
                }
                size={21}
                weight="bold"
              />
              장비 상태
              <strong
                className={
                  deviceChecked
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-warning)]'
                }
              >
                {deviceChecked === undefined
                  ? '미확인'
                  : deviceChecked
                    ? '점검 완료'
                    : '점검 필요'}
              </strong>
            </p>
            <Badge variant="success">대기 중</Badge>
          </div>
        </div>
      </Card>

      <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="grid gap-8 p-5 sm:p-7 lg:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-[-0.035em] sm:text-3xl">
                  내 차례를 기다리고 있어요
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                  대기 위치가 변경되면 이 화면에 바로 반영됩니다.
                </p>
              </div>
              <Badge className="gap-1.5" variant="neutral">
                순번 확인 중
              </Badge>
            </header>

            <dl className="grid border-y border-[var(--color-divider)] sm:grid-cols-3">
              <div className="grid content-center gap-4 py-6 sm:border-r sm:border-[var(--color-divider)] sm:px-5 lg:py-8">
                <dt className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-tertiary)]">
                  <ListNumbers aria-hidden size={22} weight="bold" />
                  초기 배정 번호
                </dt>
                <dd className="text-4xl font-black tracking-[-0.04em] text-[var(--color-text-primary)]">
                  {queueSnapshot?.position ?? '-'}번
                </dd>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  팬미팅 참여 시 처음 배정된 번호예요
                </p>
              </div>

              <div className="grid content-center gap-4 border-t border-[var(--color-divider)] py-6 sm:border-r sm:border-t-0 sm:border-[var(--color-divider)] sm:px-5 lg:py-8">
                <dt className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-tertiary)]">
                  <UsersThree aria-hidden size={22} weight="bold" />
                  현재 대기 위치
                </dt>
                <dd className="text-4xl font-black tracking-[-0.04em] text-[var(--color-primary-coral)]">
                  {currentPosition}번째
                </dd>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  앞에 {queueSnapshot?.aheadCount ?? '-'}명이 기다리고 있어요
                </p>
              </div>

              <div className="grid content-center gap-4 border-t border-[var(--color-divider)] py-6 sm:border-t-0 sm:px-5 lg:py-8">
                <dt className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-tertiary)]">
                  <HourglassMedium aria-hidden size={22} weight="bold" />
                  예상 대기시간
                </dt>
                <dd className="text-4xl font-black tracking-[-0.04em]">
                  약 {estimatedWaitMinutes}분
                </dd>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  진행 상황에 따라 달라질 수 있어요
                </p>
              </div>
            </dl>

            <AlertBanner title="대기 중 유의사항" variant="warning">
              <ul className="grid gap-1.5 leading-6">
                <li>대기 순서와 예상 시간은 진행 상황에 따라 변경될 수 있습니다.</li>
                <li>호출되면 ‘팬미팅 입장’ 버튼이 활성화됩니다.</li>
                <li>재호출 후에도 입장하지 않으면 참여가 종료될 수 있습니다.</li>
              </ul>
            </AlertBanner>

            <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border-panel)] p-5">
              <div>
                <h3 className="font-bold">순서 변경 요청</h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  지금 통화가 어려우면 순서를 뒤로 미뤄 달라고 요청할 수 있어요.
                </p>
                {changeError && !changeDialogOpen ? (
                  <p className="mt-2 text-sm font-semibold text-[var(--color-error)]">
                    {changeError}
                  </p>
                ) : null}
              </div>
              {changeRequested ? (
                <Badge variant="success">요청 접수됨</Badge>
              ) : (
                <Button
                  disabled={!queueSnapshot || isRequestingChange}
                  onClick={() => {
                    setChangeError(undefined)
                    setChangeDialogOpen(true)
                  }}
                  variant="secondary"
                >
                  순서 변경 요청
                </Button>
              )}
            </section>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="grid h-full min-h-[420px] grid-rows-[1fr_auto]">
            <div className="grid content-center justify-items-center gap-6 px-6 py-10 text-center">
              <span
                className={`inline-flex size-16 items-center justify-center rounded-[var(--radius-panel)] ${isCalled
                    ? 'bg-[var(--color-primary-coral-soft)] text-[var(--color-primary-coral)]'
                    : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                  }`}
              >
                <BellRinging aria-hidden size={34} weight="duotone" />
              </span>
              <div>
                <h2 className="text-2xl font-black tracking-[-0.03em]">
                  {isCalled ? '팬미팅에 호출되었습니다' : '호출을 기다려 주세요'}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                  {isCalled ? '지금 팬미팅에 입장해 주세요' : '내 차례가 되면 이 화면에서 바로 알려드릴게요.'}
                </p>
              </div>
              <p
                className={`flex items-center gap-2 border-y border-[var(--color-divider)] py-5 text-sm font-bold ${
                  isCalled
                    ? 'text-[var(--color-primary-coral)]'
                    : 'text-[var(--color-success)]'
                }`}
              >
                <Check aria-hidden size={20} weight="bold" />
                {isCalled
                  ? '지금 팬미팅에 입장할 수 있습니다.'
                  : '현재 대기 상태를 유지하고 있습니다.'}
              </p>
            </div>

            <div className="border-t border-[var(--color-divider)] p-5 sm:p-6">
              <Button
                className="w-full"
                disabled={!isCalled}
                onClick={handleEnterCall}
                size="lg"
                variant={isCalled ? 'primary' : 'secondary'}
              >
                {isCalled ? '팬미팅 입장' : '호출 대기 중'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Dialog
        description="사유를 남기면 운영자가 확인 후 순서를 뒤로 조정해 드려요."
        footer={
          <div className="flex justify-end gap-3">
            <Button
              disabled={isRequestingChange}
              onClick={() => setChangeDialogOpen(false)}
              variant="secondary"
            >
              닫기
            </Button>
            <Button
              disabled={!trimmedChangeReason || isRequestingChange}
              loading={isRequestingChange}
              onClick={() => void handleChangeRequestSubmit()}
            >
              요청 보내기
            </Button>
          </div>
        }
        onOpenChange={setChangeDialogOpen}
        open={changeDialogOpen}
        title="순서 변경 요청"
      >
        <div className="grid gap-3">
          <Textarea
            label="요청 사유"
            maxLength={MAX_CHANGE_REASON_LENGTH}
            onChange={(event) => setChangeReason(event.target.value)}
            placeholder="예: 지금 통화가 어려워 순서를 뒤로 미루고 싶어요."
            rows={4}
            value={changeReason}
          />
          <p className="text-right text-xs text-[var(--color-text-secondary)]">
            {changeReason.length}/{MAX_CHANGE_REASON_LENGTH}자
          </p>
          {changeError ? (
            <AlertBanner title="요청 실패" variant="error">
              {changeError}
            </AlertBanner>
          ) : null}
        </div>
      </Dialog>
    </div>
  )
}
