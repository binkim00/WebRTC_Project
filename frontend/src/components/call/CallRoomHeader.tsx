import { Badge, type BadgeVariant } from '../data-display'

type CallRoomHeaderProps = {
  screenId: string
  meetingId: string
  status?: {
    label: string
    variant: BadgeVariant
  }
}

export function CallRoomHeader({ screenId, meetingId, status }: CallRoomHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Badge variant="primary">{screenId}</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight !text-slate-950">영상 통화</h1>
        <p className="mt-3 text-slate-600">
          팬미팅 ID: <span className="font-mono text-slate-800">{meetingId}</span>
        </p>
      </div>
      {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
    </header>
  )
}
