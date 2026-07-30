import {
  BellRinging,
  Check,
  HourglassMedium,
  ListNumbers,
  UsersThree,
  WifiHigh,
  Wrench,
} from '@phosphor-icons/react'
import { AlertBanner, Badge, Button, Card } from '../../components'
import { useParams } from 'react-router-dom'

/*
 * TODO: API 연동 후 처리
 * 1. 팬미팅·대기열·장비 mock을 실제 데이터로 교체한다.
 * 2. polling으로 순번, 예상 시간, 호출 가능 여부를 갱신한다.
 * 3. IN_CALL은 통화 화면, COMPLETED는 완료 화면으로 이동한다.
 * 4. 로딩·오류·연결 끊김 상태를 처리한다.
 * 5. 초기 배정 번호와 호출 제한시간 응답을 백엔드와 확정한다.
 */
type WaitingStatus = 'WAITING' | 'IN_CALL' | 'COMPLETED'
type QueueSnapshot = {
  queueEntryId: number
  position: number
  aheadCount: number
  estimatedWaitSec: number
  displayStatus: WaitingStatus
  callAttemptCount: number
  calledAt: string | null
  callSessionId: number | null
  canEnterCall: boolean
}

const meetingInfoMock = {
  meetingTitle: 'Melly와의 봄날 팬미팅',
  influencerName: 'Melly',
  assignedOrder: 12,
}

const queueSnapshotMock: QueueSnapshot = {
  queueEntryId: 1,
  position: 3,
  aheadCount: 2,
  estimatedWaitSec: 180,
  displayStatus: 'WAITING',
  callAttemptCount: 1,
  calledAt: '2026-07-29T14:00:00',
  callSessionId: 1,
  canEnterCall: true,
}

const deviceStatusMock = {
  connectionHealthy: true,
  deviceChecked: true,
}

export function FanMeetingWaitingPage() {
  const { fanMeetingId } = useParams()
  const currentPosition = queueSnapshotMock.position
  const estimatedWaitMinutes = Math.ceil(queueSnapshotMock.estimatedWaitSec / 60)
  const isCalled =
    queueSnapshotMock.displayStatus === 'WAITING' &&
    queueSnapshotMock.canEnterCall

  if (!fanMeetingId) {
    return null
  }

  return (
    <div className="grid gap-6 pb-8">
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.035em] sm:text-3xl">
              {meetingInfoMock.meetingTitle}
            </h1>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-secondary)]">
              인플루언서 {meetingInfoMock.influencerName}
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
                  {meetingInfoMock.assignedOrder}번
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
                  앞에 {queueSnapshotMock.aheadCount}명이 기다리고 있어요
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
              {/* TODO: canEnterCall이면 callSessionId를 사용해 통화 화면으로 이동 */}
              <Button
                className="w-full"
                disabled={!queueSnapshotMock.canEnterCall}
                size="lg"
                variant={queueSnapshotMock.canEnterCall ? 'primary' : 'secondary'}
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
