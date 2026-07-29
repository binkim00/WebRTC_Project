import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from '../App'
import { AuthLayout } from '../layouts/AuthLayout'
import { FanLayout } from '../layouts/FanLayout'
import { InfluencerLayout } from '../layouts/InfluencerLayout'
import { ManagerLayout } from '../layouts/ManagerLayout'
import { LoginPage, SignupPage } from '../pages/auth/AuthRoutePages'
import {
  HomePage,
  MeetingFanListPage,
  MeetingStatisticsPage,
} from '../pages/common/CommonRoutePages'
import { DeviceCheckPage } from '../pages/common/DeviceCheckPage'
import {
  ForbiddenPage,
  NotFoundPage,
  RouterErrorPage,
} from '../pages/errors/ErrorRoutePages'
import {
  FanApplicationResultPage,
  FanApplicationsPage,
  FanEventDetailPage,
  FanMeetingCallPage,
  FanProfilePage,
} from '../pages/fan/FanRoutePages'
import { FanEventListPage } from '../pages/fan/FanEventListPage'
import { FanMeetingWaitingPage } from '../pages/fan/FanMeetingWaitingPage'
import { InfluencerFanRecordPage } from '../pages/influencer/InfluencerFanRecordPage'
import { FanMeetingCompletePage } from '../pages/fan/FanMeetingCompletePage'
import { FanMeetingListPage } from '../pages/fan/FanMeetingListPage'
import { InfluencerMyMeetingPage } from '../pages/influencer/InfluencerMyMeetingPage'
import {
  InfluencerMeetingCallPage,
  InfluencerMeetingHistoryPage,
  InfluencerProfilePage,
} from '../pages/influencer/InfluencerRoutePages'
import { InfluencerMeetingReadyPage } from '../pages/influencer/InfluencerMeetingReadyPage'
import {
  ManagerApplicationsPage,
  ManagerEventFormPage,
  ManagerEventListPage,
  ManagerMeetingFormPage,
  ManagerMeetingListPage,
  ManagerMeetingMonitorPage,
  ManagerMyPage,
  ManagerNoticesPage,
} from '../pages/manager/ManagerRoutePages'

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
        path: 'fan/events',
        Component: FanEventListPage,
      },
      {
        path: 'fan-meetings/:fanMeetingId',
        children: [
          {
            path: 'fans',
            Component: MeetingFanListPage,
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
            path: 'events/:eventId',
            Component: FanEventDetailPage,
          },
          {
            path: 'events/:eventId/application-result',
            Component: FanApplicationResultPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/call',
            Component: FanMeetingCallPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/calls/:callSessionId',
            Component: FanMeetingCallPage,
          },
          {
            path: 'mypage/profile',
            Component: FanProfilePage,
          },
          {
            path: 'mypage/applications',
            Component: FanApplicationsPage,
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
          {
            path: 'mypage/fan-meetings',
            Component: InfluencerMeetingHistoryPage,
          },
          {
            path: 'mypage/profile',
            Component: InfluencerProfilePage,
          },
        ],
      },
      {
        path: 'manager',
        Component: ManagerLayout,
        children: [
          {
            index: true,
            element: <Navigate replace to="events" />,
          },
          {
            path: 'events',
            Component: ManagerEventListPage,
          },
          {
            path: 'events/new',
            element: <ManagerEventFormPage mode="create" />,
          },
          {
            path: 'events/:eventId/edit',
            element: <ManagerEventFormPage mode="edit" />,
          },
          {
            path: 'events/:eventId/applications',
            Component: ManagerApplicationsPage,
          },
          {
            path: 'fan-meetings',
            Component: ManagerMeetingListPage,
          },
          {
            path: 'fan-meetings/new',
            element: <ManagerMeetingFormPage mode="create" />,
          },
          {
            path: 'fan-meetings/:fanMeetingId/edit',
            element: <ManagerMeetingFormPage mode="edit" />,
          },
          {
            path: 'fan-meetings/:fanMeetingId/notices',
            Component: ManagerNoticesPage,
          },
          {
            path: 'fan-meetings/:fanMeetingId/monitor',
            Component: ManagerMeetingMonitorPage,
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
