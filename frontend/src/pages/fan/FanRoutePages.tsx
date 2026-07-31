import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/ApiError'
import { getAuthSession } from '../../api/auth'
import { enterQueue, getMyQueue, type QueueSnapshotResponse } from '../../api/queue'
import { AlertBanner, Badge, Button, Card, Spinner, VideoCallRoom } from '../../components'
import { InvalidRouteState, ScreenPage } from '../../components/routing/ScreenPage'

export function FanEventListPage() {
  return (
    <ScreenPage
      description="팬이 참여할 수 있는 홍보 이벤트 목록 화면입니다."
      screenId="FN-001"
      title="홍보 목록 화면"
    />
  )
}

export function FanEventDetailPage() {
  return (
    <ScreenPage
      description="선택한 이벤트의 상세 내용과 응모 진입점을 제공하는 화면입니다."
      requiredParams={['eventId']}
      screenId="FN-002"
      title="홍보 상세·응모 화면"
    />
  )
}

export function FanApplicationResultPage() {
  return (
    <ScreenPage
      description="특정 이벤트의 응모 결과를 확인하는 화면입니다."
      requiredParams={['eventId']}
      screenId="FN-003"
      title="응모 결과 확인 화면"
    />
  )
}

export function FanMeetingWaitingPage() {
  const { fanMeetingId } = useParams()
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState<QueueSnapshotResponse>()
  const [error, setError] = useState<string>()
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!fanMeetingId) return

    const authToken = getAuthSession()?.accessToken
    if (!authToken) {
      setError('로그인 정보가 없습니다. 다시 로그인해 주세요.')
      return
    }

    let active = true
    let intervalId: number | undefined

    const refresh = async () => {
      try {
        const nextSnapshot = await getMyQueue(fanMeetingId, authToken)
        if (!active) return
        setSnapshot(nextSnapshot)
        setError(undefined)
        if (nextSnapshot.canEnterCall && nextSnapshot.callSessionId) {
          navigate(
            `/fan/fan-meetings/${fanMeetingId}/calls/${nextSnapshot.callSessionId}`,
            { replace: true },
          )
        }
      } catch (requestError: unknown) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : '대기열을 조회하지 못했습니다.')
        }
      }
    }

    const start = async () => {
      setError(undefined)
      try {
        await enterQueue(fanMeetingId, authToken)
      } catch (requestError: unknown) {
        if (!(requestError instanceof ApiError) || requestError.status !== 409) {
          if (active) {
            setError(requestError instanceof Error ? requestError.message : '대기열에 입장하지 못했습니다.')
          }
          return
        }
      }

      await refresh()
      if (active) {
        intervalId = window.setInterval(() => void refresh(), 2000)
      }
    }

    void start()
    return () => {
      active = false
      if (intervalId !== undefined) window.clearInterval(intervalId)
    }
  }, [fanMeetingId, navigate, retryCount])

  if (!fanMeetingId) {
    return (
      <InvalidRouteState
        message="URL에 fanMeetingId가 없습니다."
        title="팬미팅 정보를 확인할 수 없습니다"
      />
    )
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-6 py-10">
      <header>
        <Badge variant="primary">FN-004</Badge>
        <h1 className="mt-3 text-3xl font-bold">영상 통화 대기실</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">
          호출되면 영상 통화 화면으로 자동 이동합니다.
        </p>
      </header>
      <Card className="grid gap-5 p-6">
        {snapshot ? (
          <>
            <p className="text-sm text-[var(--color-text-secondary)]">현재 대기 순번</p>
            <p className="text-5xl font-black text-[var(--color-primary-coral)]">
              {snapshot.position}번
            </p>
            <p>앞에 {snapshot.aheadCount}명이 기다리고 있습니다.</p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              상태: {snapshot.displayStatus}
            </p>
          </>
        ) : error ? null : (
          <div className="flex items-center gap-3">
            <Spinner />
            <span>대기열에 입장하는 중입니다.</span>
          </div>
        )}
      </Card>
      {error ? (
        <AlertBanner title="대기열 연결 실패" variant="error">
          {error}
        </AlertBanner>
      ) : null}
      {error ? <Button onClick={() => setRetryCount((count) => count + 1)}>다시 시도</Button> : null}
    </div>
  )
}

export function FanMeetingCallPage() {
  const { fanMeetingId, callSessionId } = useParams()
  const [searchParams] = useSearchParams()
  const isDesignPreview = import.meta.env.DEV && searchParams.get('preview') === '1'

  if (!fanMeetingId?.trim()) {
    return (
      <InvalidRouteState
        message="URL에 필요한 fanMeetingId 값이 없습니다. 이전 화면에서 올바른 팬미팅을 선택해 주세요."
        title="필수 URL 파라미터가 없습니다"
      />
    )
  }

  if (!callSessionId?.trim() && !isDesignPreview) {
    return (
      <InvalidRouteState
        message="실제 영상통화 입장에는 callSessionId가 필요합니다. 대기 화면에서 배정받은 통화 세션으로 입장해 주세요."
        title="통화 세션 ID가 없습니다"
      />
    )
  }

  return (
    <VideoCallRoom
      callSessionId={callSessionId}
      endTo={`/fan/fan-meetings/${fanMeetingId}/complete`}
      meetingId={fanMeetingId}
      participantLabel="인플루언서 영상"
      screenId="FN-005"
    />
  )
}

export function FanProfilePage() {
  return (
    <ScreenPage
      description="팬 마이페이지의 프로필 영역입니다."
      screenId="FN-007"
      title="팬 마이페이지 화면 - 프로필"
    />
  )
}

export function FanApplicationsPage() {
  return (
    <ScreenPage
      description="팬이 응모한 이벤트를 모아 보는 마이페이지 영역입니다."
      screenId="FN-007"
      title="응모한 이벤트"
    />
  )
}
