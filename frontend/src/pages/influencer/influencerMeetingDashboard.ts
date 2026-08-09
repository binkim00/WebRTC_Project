import type { LoginRole } from '../../api/authSession'
import { parseServerDate } from '../../api/serverTime'
import type { ManagerMeetingSummary } from '../../api/managerMeetings'
import { translate } from '../../i18n'

export type InfluencerDashboardRole = Extract<
  LoginRole,
  'INFLUENCER' | 'SOLO_INFLUENCER'
>

export type DashboardMeetingAction =
  | { kind: 'navigate'; label: string; to: string }
  | { kind: 'publish-results'; label: string }
  | { kind: 'disabled'; label: string; reason: string }

function scheduledTime(meeting: ManagerMeetingSummary): number {
  const value = parseServerDate(meeting.scheduledStartAt).getTime()
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

/** 최근 카드에 올릴 한 건을 진행 중, 가까운 예정, 최근 지난 일정 순으로 고른다. */
export function selectRecentMeeting(
  meetings: readonly ManagerMeetingSummary[],
  now = new Date(),
): ManagerMeetingSummary | undefined {
  const available = meetings.filter(
    (meeting) =>
      meeting.status !== 'CANCELED' &&
      meeting.status !== 'ENDED' &&
      Number.isFinite(scheduledTime(meeting)),
  )
  const live = available
    .filter((meeting) => meeting.status === 'LIVE')
    .sort((left, right) => scheduledTime(right) - scheduledTime(left))[0]
  if (live) return live

  const nowTime = now.getTime()
  const upcoming = available
    .filter((meeting) => meeting.status !== 'ENDED' && scheduledTime(meeting) >= nowTime)
    .sort((left, right) => scheduledTime(left) - scheduledTime(right))[0]
  if (upcoming) return upcoming

  // 예정 시간을 지났더라도 READY 등 서버 상태가 아직 끝나지 않았다면 운영할 일정으로 유지한다.
  return available.sort((left, right) => scheduledTime(right) - scheduledTime(left))[0]
}

/** 역할과 상태에 맞는 다음 할 일 하나를 반환한다. */
export function getDashboardMeetingAction(
  meeting: ManagerMeetingSummary,
  role: InfluencerDashboardRole,
): DashboardMeetingAction {
  const id = encodeURIComponent(meeting.meetingId)

  if (meeting.status === 'LIVE') {
    // 통화 세션은 팬을 호출한 순간 만들어지므로 통화 화면으로 바로 가면 세션이 없다.
    // 진행 중에는 현재 팬을 확인하고 입장하는 대기실로 보낸다.
    return {
      kind: 'navigate',
      label: role === 'SOLO_INFLUENCER' ? translate('influencerMeetingDashboard.t1') : translate('influencerMeetingDashboard.t2'),
      to: `/influencer/fan-meetings/${id}/ready`,
    }
  }
  if (meeting.status === 'READY') {
    // 1인 운영자는 대기실이 열리기 전이면 상세에서 팬미팅을 직접 시작해야 한다.
    if (role === 'SOLO_INFLUENCER') {
      return {
        kind: 'navigate',
        label: translate('influencerMeetingDashboard.t3'),
        to: `/manager/fan-meetings/${id}`,
      }
    }
    return {
      kind: 'navigate',
      label: translate('influencerMeetingDashboard.t4'),
      to: `/influencer/fan-meetings/${id}/device-check`,
    }
  }

  if (role === 'INFLUENCER') {
    return {
      kind: 'disabled',
      label: translate('influencerMeetingDashboard.t5'),
      reason: translate('influencerMeetingDashboard.t6'),
    }
  }

  if (meeting.status === 'DRAFT') {
    return {
      kind: 'navigate',
      label: translate('influencerMeetingDashboard.t7'),
      to: `/manager/fan-meetings/${id}?tab=settings`,
    }
  }
  if (meeting.status === 'PUBLISHED') {
    return {
      kind: 'navigate',
      label: translate('influencerMeetingDashboard.t8'),
      to: `/fan/events/${id}`,
    }
  }
  if (meeting.status === 'APPLICATION_OPEN') {
    return {
      kind: 'navigate',
      label: translate('influencerMeetingDashboard.t9'),
      to: `/manager/fan-meetings/${id}`,
    }
  }
  if (meeting.status === 'APPLICATION_CLOSED') {
    return meeting.participantCount > 0
      ? { kind: 'publish-results', label: translate('influencerMeetingDashboard.t10') }
      : {
          kind: 'navigate',
          label: translate('influencerMeetingDashboard.t11'),
          to: `/manager/fan-meetings/${id}`,
        }
  }

  return {
    kind: 'disabled',
    label: translate('influencerMeetingDashboard.t12'),
    reason: translate('influencerMeetingDashboard.t13'),
  }
}
