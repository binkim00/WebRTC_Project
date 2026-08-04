import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from '../App'
import { AuthLayout } from '../layouts/AuthLayout'
import { FanLayout } from '../layouts/FanLayout'
import { InfluencerLayout } from '../layouts/InfluencerLayout'
import { ManagerLayout } from '../layouts/ManagerLayout'
import {
  ForbiddenPage,
  NotFoundPage,
  RouterErrorPage,
} from '../pages/errors/ErrorRoutePages'
import {
  LegacyEventRedirect,
  LegacyMeetingSettingsRedirect,
} from './legacyRedirects'
import { lazyPage } from './lazyPage'

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
        lazy: lazyPage(() => import('../pages/common/CommonRoutePages'), 'HomePage'),
      },
      {
        path: 'examples/yestalgia-home',
        lazy: lazyPage(
          () => import('../pages/common/YestalgiaHomeExamplePage'),
          'YestalgiaHomeExamplePage',
        ),
      },
      {
        Component: AuthLayout,
        children: [
          {
            path: 'login',
            lazy: lazyPage(() => import('../pages/auth/AuthRoutePages'), 'LoginPage'),
          },
          {
            path: 'signup',
            lazy: lazyPage(() => import('../pages/auth/AuthRoutePages'), 'SignupPage'),
          },
        ],
      },
      // 인증 메일 링크가 도착하는 화면이다. 백엔드 EMAIL_VERIFY_BASE_URL이 이 경로를 가리킨다.
      {
        path: 'email-verification',
        lazy: lazyPage(
          () => import('../pages/auth/EmailVerifiedPage'),
          'EmailVerifiedPage',
        ),
      },
      {
        path: 'fan/fan-meetings/:fanMeetingId/complete',
        lazy: lazyPage(
          () => import('../pages/fan/FanMeetingCompletePage'),
          'FanMeetingCompletePage',
        ),
      },
      {
        path: 'fan/fan-meetings/:fanMeetingId/waiting',
        lazy: lazyPage(
          () => import('../pages/fan/FanMeetingWaitingPage'),
          'FanMeetingWaitingPage',
        ),
      },
      {
        path: 'fan/mypage/fan-meetings',
        lazy: lazyPage(
          () => import('../pages/fan/FanMeetingListPage'),
          'FanMeetingListPage',
        ),
      },
      {
        path: 'fan/mypage/profile',
        lazy: lazyPage(() => import('../pages/fan/FanProfilePage'), 'FanProfilePage'),
      },
      {
        path: 'fan/mypage/applications',
        lazy: lazyPage(
          () => import('../pages/fan/FanApplicationsPage'),
          'FanApplicationsPage',
        ),
      },
      {
        path: 'fan/events',
        lazy: lazyPage(
          () => import('../pages/fan/FanEventListPage'),
          'FanEventListPage',
        ),
      },
      // 팬 화면 용어는 '이벤트'를 유지하되, 실제 식별자는 팬미팅 ID이므로 파라미터명을 통일한다.
      {
        path: 'fan/events/:meetingId',
        lazy: lazyPage(
          () => import('../pages/fan/FanEventDetailPage'),
          'FanEventDetailPage',
        ),
      },
      {
        path: 'fan/events/:meetingId/application-result',
        lazy: lazyPage(
          () => import('../pages/fan/FanApplicationResultPage'),
          'FanApplicationResultPage',
        ),
      },
      // 인플루언서 탐색은 로그인 없이도 볼 수 있는 공개 화면이다.
      {
        path: 'fan/influencers',
        lazy: lazyPage(
          () => import('../pages/fan/FanInfluencerListPage'),
          'FanInfluencerListPage',
        ),
      },
      {
        path: 'fan/influencers/:influencerId',
        lazy: lazyPage(
          () => import('../pages/fan/FanInfluencerDetailPage'),
          'FanInfluencerDetailPage',
        ),
      },
      {
        path: 'notifications',
        lazy: lazyPage(
          () => import('../pages/common/NotificationsPage'),
          'NotificationsPage',
        ),
      },
      // 서비스 공지는 로그인 없이도 볼 수 있는 공개 화면이다.
      {
        path: 'service-notices',
        lazy: lazyPage(
          () => import('../pages/common/ServiceNoticesPage'),
          'ServiceNoticesPage',
        ),
      },
      {
        path: 'service-notices/:noticeId',
        lazy: lazyPage(
          () => import('../pages/common/ServiceNoticesPage'),
          'ServiceNoticeDetailPage',
        ),
      },
      {
        path: 'community/posts/:postId',
        lazy: lazyPage(
          () => import('../pages/common/CommunityPostDetailPage'),
          'CommunityPostDetailPage',
        ),
      },
      {
        path: 'fan-meetings/:fanMeetingId',
        children: [
          {
            path: 'fans',
            lazy: lazyPage(
              () => import('../pages/common/FanMeetingParticipantsPage'),
              'FanMeetingParticipantsPage',
            ),
          },
          {
            path: 'community',
            lazy: lazyPage(
              () => import('../pages/common/FanMeetingCommunityPage'),
              'FanMeetingCommunityPage',
            ),
          },
          {
            path: 'device-check',
            lazy: lazyPage(
              () => import('../pages/common/DeviceCheckPage'),
              'DeviceCheckPage',
            ),
          },
          {
            path: 'statistics',
            lazy: lazyPage(
              () => import('../pages/common/CommonRoutePages'),
              'MeetingStatisticsPage',
            ),
          },
        ],
      },
      {
        path: 'influencer/my-fan-meetings',
        lazy: lazyPage(
          () => import('../pages/influencer/InfluencerMyMeetingPage'),
          'InfluencerMyMeetingPage',
        ),
      },
      {
        path: 'influencer/mypage/profile',
        lazy: lazyPage(
          () => import('../pages/influencer/InfluencerProfilePage'),
          'InfluencerProfilePage',
        ),
      },
      {
        path: 'influencer/mypage/fan-meetings',
        lazy: lazyPage(
          () => import('../pages/influencer/InfluencerMeetingHistoryPage'),
          'InfluencerMeetingHistoryPage',
        ),
      },
      {
        path: 'influencer/organization/invitations/:token',
        lazy: lazyPage(
          () => import('../pages/influencer/InfluencerOrganizationInvitationPage'),
          'InfluencerOrganizationInvitationPage',
        ),
      },
      // LiveKit 연결 점검용 개발 도구다. 백엔드도 test-token API를 기본 비활성(LIVEKIT_TEST_TOKEN_ENABLED=false)
      // 으로 두므로, 운영 빌드에서는 경로 자체를 등록하지 않아 404로 남긴다.
      ...(import.meta.env.DEV
        ? [
            {
              path: 'rtc/livekit-test',
              lazy: lazyPage(
                () => import('../pages/common/LiveKitTestPage'),
                'LiveKitTestPage',
              ),
            },
          ]
        : []),
      {
        path: 'influencer/fan-meetings',
        lazy: lazyPage(
          () => import('../pages/influencer/InfluencerMyMeetingPage'),
          'InfluencerMyMeetingPage',
        ),
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/fans',
        lazy: lazyPage(
          () => import('../pages/common/FanMeetingParticipantsPage'),
          'FanMeetingParticipantsPage',
        ),
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/community',
        lazy: lazyPage(
          () => import('../pages/common/FanMeetingCommunityPage'),
          'FanMeetingCommunityPage',
        ),
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/device-check',
        lazy: lazyPage(
          () => import('../pages/common/DeviceCheckPage'),
          'DeviceCheckPage',
        ),
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/ready',
        lazy: lazyPage(
          () => import('../pages/influencer/InfluencerMeetingReadyPage'),
          'InfluencerMeetingReadyPage',
        ),
      },
      {
        path: 'influencer/fan-meetings/:fanMeetingId/fans/:fanId/records',
        lazy: lazyPage(
          () => import('../pages/influencer/InfluencerFanRecordPage'),
          'InfluencerFanRecordPage',
        ),
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
            lazy: lazyPage(
              () => import('../pages/fan/FanRoutePages'),
              'FanMeetingCallPage',
            ),
          },
          {
            path: 'fan-meetings/:fanMeetingId/calls/:callSessionId',
            lazy: lazyPage(
              () => import('../pages/fan/FanRoutePages'),
              'FanMeetingCallPage',
            ),
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
            lazy: lazyPage(
              () => import('../pages/influencer/InfluencerRoutePages'),
              'InfluencerMeetingCallPage',
            ),
          },
          {
            path: 'fan-meetings/:fanMeetingId/calls/:callSessionId',
            lazy: lazyPage(
              () => import('../pages/influencer/InfluencerRoutePages'),
              'InfluencerMeetingCallPage',
            ),
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
            lazy: lazyPage(
              () => import('../pages/manager/ManagerMeetingListPage'),
              'ManagerMeetingListPage',
            ),
          },
          {
            path: 'fan-meetings/manage',
            element: <Navigate replace to="/manager/fan-meetings" />,
          },
          {
            path: 'fan-meetings/new',
            lazy: lazyPage(
              () => import('../pages/manager/ManagerRoutePages'),
              'ManagerMeetingCreatePage',
            ),
          },
          {
            path: 'fan-meetings/:fanMeetingId',
            lazy: lazyPage(
              () => import('../pages/manager/ManagerMeetingDetailPage'),
              'ManagerMeetingDetailPage',
            ),
          },
          {
            path: 'fan-meetings/:fanMeetingId/edit',
            element: <LegacyMeetingSettingsRedirect />,
          },
          {
            path: 'fan-meetings/:fanMeetingId/notices',
            lazy: lazyPage(
              () => import('../pages/manager/ManagerRoutePages'),
              'ManagerNoticesPage',
            ),
          },
          {
            path: 'fan-meetings/:fanMeetingId/statistics',
            lazy: lazyPage(
              () => import('../pages/manager/ManagerRoutePages'),
              'ManagerStatisticsPage',
            ),
          },
          {
            path: 'fan-meetings/:fanMeetingId/monitor/risk',
            lazy: lazyPage(
              () => import('../pages/manager/ManagerRoutePages'),
              'ManagerRiskIncidentPage',
            ),
          },
          {
            path: 'fan-meetings/:fanMeetingId/monitor',
            lazy: lazyPage(
              () => import('../pages/manager/ManagerMeetingMonitorPage'),
              'ManagerMeetingMonitorPage',
            ),
          },
          {
            path: 'fan-meetings/:fanMeetingId/fans',
            lazy: lazyPage(
              () => import('../pages/manager/ManagerFanListPage'),
              'ManagerFanListPage',
            ),
          },
          {
            path: 'fan-meetings/:fanMeetingId/community',
            lazy: lazyPage(
              () => import('../pages/common/FanMeetingCommunityPage'),
              'FanMeetingCommunityPage',
            ),
          },
          {
            path: 'mypage',
            lazy: lazyPage(
              () => import('../pages/manager/ManagerRoutePages'),
              'ManagerMyPage',
            ),
          },
          {
            path: 'organization',
            lazy: lazyPage(
              () => import('../pages/manager/ManagerOrganizationPage'),
              'ManagerOrganizationPage',
            ),
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
