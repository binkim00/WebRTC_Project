import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from '../App'
import { AuthLayout } from '../layouts/AuthLayout'
import { FanLayout } from '../layouts/FanLayout'
import { InfluencerLayout } from '../layouts/InfluencerLayout'
import { ManagerLayout } from '../layouts/ManagerLayout'
import { LoginPage, SignupPage } from '../pages/auth/AuthRoutePages'
import {
  HomePage,
  MeetingStatisticsPage,
} from '../pages/common/CommonRoutePages'
import { CommunityPostDetailPage } from '../pages/common/CommunityPostDetailPage'
import { DeviceCheckPage } from '../pages/common/DeviceCheckPage'
import { FanMeetingCommunityPage } from '../pages/common/FanMeetingCommunityPage'
import { LiveKitTestPage } from '../pages/common/LiveKitTestPage'
import { NotificationsPage } from '../pages/common/NotificationsPage'
import {
  ServiceNoticeDetailPage,
  ServiceNoticesPage,
} from '../pages/common/ServiceNoticesPage'
import { YestalgiaHomeExamplePage } from '../pages/common/YestalgiaHomeExamplePage'
import {
  ForbiddenPage,
  NotFoundPage,
  RouterErrorPage,
} from '../pages/errors/ErrorRoutePages'
import {
  FanMeetingCallPage,
} from '../pages/fan/FanRoutePages'
import { FanEventListPage } from '../pages/fan/FanEventListPage'
import { FanInfluencerListPage } from '../pages/fan/FanInfluencerListPage'
import { FanInfluencerDetailPage } from '../pages/fan/FanInfluencerDetailPage'
import { FanEventDetailPage } from '../pages/fan/FanEventDetailPage'
import { FanApplicationResultPage } from '../pages/fan/FanApplicationResultPage'
import { FanProfilePage } from '../pages/fan/FanProfilePage'
import { FanApplicationsPage } from '../pages/fan/FanApplicationsPage'
import { FanMeetingWaitingPage } from '../pages/fan/FanMeetingWaitingPage'
import { InfluencerFanRecordPage } from '../pages/influencer/InfluencerFanRecordPage'
import { FanMeetingParticipantsPage } from '../pages/common/FanMeetingParticipantsPage'
import { ManagerFanListPage } from '../pages/manager/ManagerFanListPage'
import { FanMeetingCompletePage } from '../pages/fan/FanMeetingCompletePage'
import { FanMeetingListPage } from '../pages/fan/FanMeetingListPage'
import { InfluencerMyMeetingPage } from '../pages/influencer/InfluencerMyMeetingPage'
import {
  InfluencerMeetingCallPage,
} from '../pages/influencer/InfluencerRoutePages'
import { InfluencerMeetingReadyPage } from '../pages/influencer/InfluencerMeetingReadyPage'
import { InfluencerProfilePage } from '../pages/influencer/InfluencerProfilePage'
import { InfluencerMeetingHistoryPage } from '../pages/influencer/InfluencerMeetingHistoryPage'
import { InfluencerOrganizationInvitationPage } from '../pages/influencer/InfluencerOrganizationInvitationPage'
import {
  ManagerMeetingCreatePage,
  ManagerMyPage,
  ManagerNoticesPage,
  ManagerRiskIncidentPage,
  ManagerStatisticsPage,
} from '../pages/manager/ManagerRoutePages'
import { ManagerMeetingListPage } from '../pages/manager/ManagerMeetingListPage'
import { ManagerMeetingDetailPage } from '../pages/manager/ManagerMeetingDetailPage'
import { ManagerMeetingMonitorPage as LiveManagerMeetingMonitorPage } from '../pages/manager/ManagerMeetingMonitorPage'
import { ManagerOrganizationPage } from '../pages/manager/ManagerOrganizationPage'
import {
  LegacyEventRedirect,
  LegacyMeetingSettingsRedirect,
} from './legacyRedirects'

/**
 * 브라우저 URL과 페이지 컴포넌트를 연결하는 애플리케이션 최상위 라우터다.
 * 공통 App 아래에 인증·역할별 Layout을 중첩하고 각 Layout의 Outlet에 자식 화면을 렌더링한다.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    Component: App,
    errorElement: <RouterErrorPage />,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: 'examples/yestalgia-home',
        Component: YestalgiaHomeExamplePage,
      },
      {
        Component: AuthLayout,
        children: [
          {
            path: 'login',
            Component: LoginPage,
          },
          {
            path: 'signup',
            Component: SignupPage,
          },
        ],
      },
      {
        path: 'fan/fan-meetings/:fanMeetingId/complete',
        Component: FanMeetingCompletePage,
      },
      {
        path: 'fan/fan-meetings/:fanMeetingId/waiting',
        Component: FanMeetingWaitingPage,
      },
      {
        path: 'fan/mypage/fan-meetings',
        Component: FanMeetingListPage,
      },
      {
        path: 'fan/mypage/profile',
        Component: FanProfilePage,
      },
      {
        path: 'fan/mypage/applications',
        Component: FanApplicationsPage,
      },
      {
        path: 'fan/events',
        Component: FanEventListPage,
      },
      // 팬 화면 용어는 '이벤트'를 유지하되, 실제 식별자는 팬미팅 ID이므로 파라미터명을 통일한다.
      {
        path: 'fan/events/:meetingId',
        Component: FanEventDetailPage,
      },
      {
        path: 'fan/events/:meetingId/application-result',
        Component: FanApplicationResultPage,
      },
      // 인플루언서 탐색은 로그인 없이도 볼 수 있는 공개 화면이다.
      {
        path: 'fan/influencers',
        Component: FanInfluencerListPage,
      },
      {
        path: 'fan/influencers/:influencerId',
        Component: FanInfluencerDetailPage,
      },
      {
        path: 'notifications',
        Component: NotificationsPage,
      },
      // 서비스 공지는 로그인 없이도 볼 수 있는 공개 화면이다.
      {
        path: 'service-notices',
        Component: ServiceNoticesPage,
      },
      {
        path: 'service-notices/:noticeId',
        Component: ServiceNoticeDetailPage,
      },
      {
        path: 'community/posts/:postId',
        Component: CommunityPostDetailPage,
      },
      {
        path: 'fan-meetings/:fanMeetingId',
        children: [
          {
            path: 'fans',
            Component: FanMeetingParticipantsPage,
          },
          {
            path: 'community',
            Component: FanMeetingCommunityPage,
          },
          {
            path: 'device-check',
            Component: DeviceCheckPage,
          },
          {
            path: 'statistics',
            Component: MeetingStatisticsPage,
          },
        ],
      },
      {
        path: 'influencer/my-fan-meetings',
        Component: InfluencerMyMeetingPage,
      },
      {
        path: 'influencer/mypage/profile',
        Component: InfluencerProfilePage,
      },
      {
        path: 'influencer/mypage/fan-meetings',
        Component: InfluencerMeetingHistoryPage,
      },
      {
        path: 'influencer/organization/invitations/:token',
        Component: InfluencerOrganizationInvitationPage,
      },
      // LiveKit 연결 점검용 개발 도구다. 백엔드도 test-token API를 기본 비활성(LIVEKIT_TEST_TOKEN_ENABLED=false)
      // 으로 두므로, 운영 빌드에서는 경로 자체를 등록하지 않아 404로 남긴다.
      ...(import.meta.env.DEV
        ? [
            {
              path: 'rtc/livekit-test',
              Component: LiveKitTestPage,
            },
          ]
        : []),
      {
        path: 'influencer/fan-meetings',
        Component: InfluencerMyMeetingPage,
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/fans',
        Component: FanMeetingParticipantsPage,
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/community',
        Component: FanMeetingCommunityPage,
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/device-check',
        Component: DeviceCheckPage,
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/ready',
        Component: InfluencerMeetingReadyPage,
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/fans/:fanId/records',
        Component: InfluencerFanRecordPage,
      },
      {
        path: 'fan',
        Component: FanLayout,
        children: [
          {
            index: true,
            element: <Navigate replace to="events" />,
          },
          {
            path: 'fan-meetings/:fanMeetingId/call',
            Component: FanMeetingCallPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/calls/:callSessionId',
            Component: FanMeetingCallPage,
          },
        ],
      },
      {
        path: 'influencer',
        Component: InfluencerLayout,
        children: [
          {
            index: true,
            element: <Navigate replace to="mypage/profile" />,
          },
          {
            path: 'fan-meetings/:fanMeetingId/call',
            Component: InfluencerMeetingCallPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/calls/:callSessionId',
            Component: InfluencerMeetingCallPage,
          },
        ],
      },
      {
        path: 'manager',
        Component: ManagerLayout,
        children: [
          {
            index: true,
            element: <Navigate replace to="fan-meetings" />,
          },
          // 홍보·응모와 팬미팅은 같은 한 건이므로 관리 화면도 fan-meetings 하나로 통합한다.
          {
            path: 'events',
            element: <LegacyEventRedirect />,
          },
          {
            path: 'events/manage',
            element: <LegacyEventRedirect />,
          },
          {
            path: 'events/new',
            element: <Navigate replace to="/manager/fan-meetings/new" />,
          },
          {
            path: 'events/:eventId/edit',
            element: <LegacyEventRedirect tab="settings" />,
          },
          {
            path: 'events/:eventId/applications',
            element: <LegacyEventRedirect tab="applicants" />,
          },
          {
            path: 'fan-meetings',
            Component: ManagerMeetingListPage,
          },
          {
            path: 'fan-meetings/manage',
            element: <Navigate replace to="/manager/fan-meetings" />,
          },
          {
            path: 'fan-meetings/new',
            Component: ManagerMeetingCreatePage,
          },
          {
            path: 'fan-meetings/:fanMeetingId',
            Component: ManagerMeetingDetailPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/edit',
            element: <LegacyMeetingSettingsRedirect />,
          },
          {
            path: 'fan-meetings/:fanMeetingId/notices',
            Component: ManagerNoticesPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/statistics',
            Component: ManagerStatisticsPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/monitor/risk',
            Component: ManagerRiskIncidentPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/monitor',
            Component: LiveManagerMeetingMonitorPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/fans',
            Component: ManagerFanListPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/community',
            Component: FanMeetingCommunityPage,
          },
          {
            path: 'mypage',
            Component: ManagerMyPage,
          },
          {
            path: 'organization',
            Component: ManagerOrganizationPage,
          },
        ],
      },
      {
        path: '403',
        Component: ForbiddenPage,
      },
      {
        path: '*',
        Component: NotFoundPage,
      },
    ],
  },
])
