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
import { DeviceCheckPage } from '../pages/common/DeviceCheckPage'
import { LiveKitTestPage } from '../pages/common/LiveKitTestPage'
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
import {
  ManagerApplicationsPage,
  ManagerEventCreatePage,
  ManagerEventEditPage,
  ManagerEventListPage,
  ManagerMeetingSettingsPage,
  ManagerMyPage,
  ManagerNoticesPage,
  ManagerRiskIncidentPage,
  ManagerStatisticsPage,
} from '../pages/manager/ManagerRoutePages'
import { ManagerMeetingListPage } from '../pages/manager/ManagerMeetingListPage'
import {
  ManagerEventHubPage,
  ManagerMeetingHubPage,
} from '../pages/manager/ManagerManagementHubPage'
import { ManagerMeetingMonitorPage as LiveManagerMeetingMonitorPage } from '../pages/manager/ManagerMeetingMonitorPage'

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
      {
        path: 'fan/events/:eventId',
        Component: FanEventDetailPage,
      },
      {
        path: 'fan/events/:eventId/application-result',
        Component: FanApplicationResultPage,
      },
      {
        path: 'fan-meetings/:fanMeetingId',
        children: [
          {
            path: 'fans',
            Component: FanMeetingParticipantsPage,
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
        path: 'rtc/livekit-test',
        Component: LiveKitTestPage,
      },
      {
        path: 'influencer/fan-meetings',
        Component: InfluencerMyMeetingPage,
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/fans',
        Component: FanMeetingParticipantsPage,
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
          {
            path: 'events',
            Component: ManagerEventHubPage,
          },
          {
            path: 'events/manage',
            Component: ManagerEventListPage,
          },
          {
            path: 'events/new',
            Component: ManagerEventCreatePage,
          },
          {
            path: 'events/:eventId/edit',
            Component: ManagerEventEditPage,
          },
          {
            path: 'events/:eventId/applications',
            Component: ManagerApplicationsPage,
          },
          {
            path: 'fan-meetings',
            Component: ManagerMeetingHubPage,
          },
          {
            path: 'fan-meetings/manage',
            Component: ManagerMeetingListPage,
          },
          {
            path: 'fan-meetings/new',
            // 예전 팬미팅 생성 주소를 북마크한 사용자를 실제 이벤트 생성 흐름으로 보낸다.
            element: <Navigate replace to="/manager/events/new" />,
          },
          {
            path: 'fan-meetings/:fanMeetingId/edit',
            Component: ManagerMeetingSettingsPage,
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
            path: 'mypage',
            Component: ManagerMyPage,
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
