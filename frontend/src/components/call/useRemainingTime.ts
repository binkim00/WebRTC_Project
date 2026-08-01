import { useEffect, useState } from 'react'
import type { CallSessionStatusResponse } from '../../api/callSessions'

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function useRemainingTime(status: CallSessionStatusResponse) {
  const [receivedAt, setReceivedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const nextNow = Date.now()
    setReceivedAt(nextNow)
    setNow(nextNow)
  }, [status.remainingSec, status.serverNow])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  const elapsedSeconds = Math.max(0, Math.floor((now - receivedAt) / 1000))
  return formatDuration(Math.max(0, status.remainingSec - elapsedSeconds))
}
