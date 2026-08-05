import type { FanMeetingDetailStatus } from '../../api/fanMeetings'
import { translate } from '../../i18n'

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
export const fanMeetingStatusContent = (): Record<
  FanMeetingDetailStatus,
  { label: string; variant: FanStatusVariant }
> => ({
  DRAFT: { label: translate('fanMeetingStatus.t1'), variant: 'neutral' },
  PUBLISHED: { label: translate('fanMeetingStatus.t2'), variant: 'info' },
  APPLICATION_OPEN: { label: translate('fanMeetingStatus.t3'), variant: 'success' },
  APPLICATION_CLOSED: { label: translate('fanMeetingStatus.t4'), variant: 'neutral' },
  READY: { label: translate('fanMeetingStatus.t5'), variant: 'warning' },
  // 참여 단계는 모집 상태와 구분해 팬이 지금 무엇을 해야 하는지 바로 알 수 있게 한다.
  LIVE: { label: translate('fanMeetingStatus.t6'), variant: 'primary' },
  ENDED: { label: translate('fanMeetingStatus.t7'), variant: 'neutral' },
  CANCELED: { label: translate('fanMeetingStatus.t8'), variant: 'danger' },
})
