import type { FanMeetingDetailStatus } from '../../api/fanMeetings'

export type FanStatusVariant =
  | 'primary'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

/**
 * 팬에게 보여 줄 팬미팅 상태 표기다.
 *
 * 운영 화면(`manager/meetingLifecycle`의 `meetingStatusLabels`)은 발행·진행 준비처럼
 * 내부 진행 단계를 그대로 쓰지만, 팬에게는 응모 관점의 용어만 노출한다.
 * 팬이 볼 수 있는 화면은 모두 이 표를 써야 같은 상태가 화면마다 다르게 보이지 않는다.
 */
export const fanMeetingStatusContent: Record<
  FanMeetingDetailStatus,
  { label: string; variant: FanStatusVariant }
> = {
  DRAFT: { label: '임시 저장', variant: 'neutral' },
  PUBLISHED: { label: '모집 예정', variant: 'info' },
  APPLICATION_OPEN: { label: '모집 중', variant: 'success' },
  APPLICATION_CLOSED: { label: '모집 마감', variant: 'neutral' },
  READY: { label: '결과 발표', variant: 'warning' },
  // 진행 중·종료는 팬 입장에서 더 이상 응모할 수 없다는 뜻이라 모집 마감으로 묶는다.
  LIVE: { label: '모집 마감', variant: 'neutral' },
  ENDED: { label: '모집 마감', variant: 'neutral' },
  CANCELED: { label: '취소', variant: 'danger' },
}
