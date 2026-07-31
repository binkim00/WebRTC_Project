import {
  BellRinging,
  Check,
  HourglassMedium,
  ListNumbers,
  UsersThree,
  WifiHigh,
  Wrench,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { AlertBanner, Badge, Button, Card } from '../../components'
import { useNavigate, useParams } from 'react-router-dom'
import { getAuthSession } from '../../api/authSession'
import { ApiError } from '../../api/ApiError'
import { fetchMeetingDetail, type MeetingDetail } from '../../api/fanMeetingParticipants'
import { getMyQueue, type QueueSnapshotResponse } from '../../api/queue'

const deviceStatusMock = {
  connectionHealthy: true,
  deviceChecked: true,
}

export function FanMeetingWaitingPage() {
  const { fanMeetingId } = useParams()
  const navigate = useNavigate()
  const [meetingInfo, setMeetingInfo] = useState<MeetingDetail>()
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshotResponse>()
  const [error, setError] = useState<string>()

  const loadWaitingState = useCallback(async (signal?: AbortSignal) => {
    if (!fanMeetingId) return

    const session = getAuthSession()
    if (!session || session.role !== 'FAN') {
      setError('팬 계정으로 로그인한 뒤 대기실을 이용해 주세요.')
      return
    }

    try {
      const [nextMeetingInfo, nextQueueSnapshot] = await Promise.all([
        fetchMeetingDetail(fanMeetingId, session.accessToken, signal),
        getMyQueue(fanMeetingId, session.accessToken, signal),
      ])

      setMeetingInfo(nextMeetingInfo)
      setQueueSnapshot(nextQueueSnapshot)
      setError(undefined)

      if (nextQueueSnapshot.displayStatus === 'COMPLETED') {
        navigate(`/fan/fan-meetings/${fanMeetingId}/complete`, { replace: true })
      }
    } catch (reason) {
      if (signal?.aborted) return
      setError(
        reason instanceof ApiError || reason instanceof TypeError
          ? reason.message
          : '대기열 상태를 불러오지 못했습니다.',
      )
    }
  }, [fanMeetingId, navigate])

  useEffect(() => {
    const controller = new AbortController()
    void loadWaitingState(controller.signal)

    const timer = window.setInterval(() => {
      void loadWaitingState(controller.signal)
    }, 3_000)

    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [loadWaitingState])

  if (!fanMeetingId) {
    return null
  }

  const currentPosition = queueSnapshot?.position ?? 0
  const estimatedWaitMinutes = Math.ceil((queueSnapshot?.estimatedWaitSec ?? 0) / 60)
  const isCalled = Boolean(queueSnapshot?.canEnterCall && queueSnapshot.callSessionId)

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
                  deviceStatusMock.connectionHealthy
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-warning)]'
                }
                size={21}
                weight="bold"
              />
              연결 상태
              <strong
                className={
                  deviceStatusMock.connectionHealthy
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-warning)]'
                }
              >
                {deviceStatusMock.connectionHealthy ? '정상' : '확인 필요'}
              </strong>
            </p>
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-secondary)]">
              <Wrench
                aria-hidden
                className={
                  deviceStatusMock.deviceChecked
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-warning)]'
                }
                size={21}
                weight="bold"
              />
              장비 상태
              <strong
                className={
                  deviceStatusMock.deviceChecked
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-warning)]'
                }
              >
                {deviceStatusMock.deviceChecked ? '점검 완료' : '점검 필요'}
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
    </div>
  )
}
