import {
  ArrowRight,
  Bell,
  Buildings,
  CalendarBlank,
  ChartLineUp,
  CheckCircle,
  Clock,
  FileText,
  Gear,
  Heart,
  ListChecks,
  Megaphone,
  Monitor,
  PencilSimple,
  PlayCircle,
  Plus,
  ShieldCheck,
  Sparkle,
  Star,
  Ticket,
  UserPlus,
  Users,
  VideoCamera,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getMyApplications, type MyApplicationSummaryResponse } from '../../api/applications'
import type { LoginResponse, LoginRole } from '../../api/authSession'
import {
  fetchPublicFanMeetings,
  type PublicFanMeetingSummary,
} from '../../api/fanMeetings'
import {
  getInfluencers,
  getMyFollowers,
  type FollowerSummaryResponse,
  type InfluencerSummaryResponse,
} from '../../api/influencers'
import {
  fetchOwnedMeetings,
  type ManagerMeetingSummary,
} from '../../api/managerMeetings'
import { getServiceNotices, type NoticeSummaryResponse } from '../../api/notices'
import { getNotifications, type NotificationResponse } from '../../api/notifications'
import {
  getMyOrganization,
  type MyOrganizationMembers,
} from '../../api/organizations'
import mainEventImage from '../../assets/main-event-seoun.webp'
import jellyDuo from '../../assets/landing/jelly-duo-selected-transparent.png'
import { Avatar } from '../../components/data-display/Avatar'
import { useTranslation } from '../../i18n'
import './role-dashboard.css'

type DashboardData = {
  applications: MyApplicationSummaryResponse[]
  followers: FollowerSummaryResponse[]
  influencers: InfluencerSummaryResponse[]
  notices: NoticeSummaryResponse[]
  notifications: NotificationResponse[]
  organization: MyOrganizationMembers | null
  ownedMeetings: ManagerMeetingSummary[]
  publicMeetings: PublicFanMeetingSummary[]
  loading: boolean
}

type Copy = (typeof dashboardCopy)[keyof typeof dashboardCopy]

const dashboardCopy = {
  ko: {
    fanGreeting: (name: string) => `${name}님, 오늘도 설레는 만남을 준비해요`,
    fanLead: '좋아하는 인플루언서의 새로운 이벤트와 내 응모 소식을 한눈에 확인하세요.',
    influencerGreeting: (name: string) => `${name}님, 오늘 팬들과 만날 준비가 되었나요?`,
    influencerLead: '다가오는 팬미팅을 점검하고 팬들과 쌓아 온 기록을 확인해 보세요.',
    soloGreeting: (name: string) => `${name}님, 다음 만남도 직접 만들어 볼까요?`,
    soloLead: '기획부터 모집, 운영까지 혼자서도 놓치지 않도록 MELLY가 함께할게요.',
    managerGreeting: (name: string) => `좋은 하루예요, ${name} 매니저님`,
    managerLead: '오늘의 팬미팅과 조직 운영에서 확인할 일을 먼저 모았습니다.',
    adminGreeting: '서비스 운영 현황',
    adminLead: '전체 공지와 서비스 운영 신호를 빠르게 확인하세요.',
    browseEvents: '이벤트 둘러보기',
    createMeeting: '팬미팅 만들기',
    createNotice: '새 공지 작성',
    upcomingMeeting: '다가오는 팬미팅',
    todayMeeting: '오늘의 팬미팅',
    noUpcoming: '예정된 팬미팅이 아직 없어요',
    noUpcomingLead: '새로운 이벤트를 둘러보며 다음 만남을 찾아보세요.',
    enterReady: '입장 준비',
    viewDetails: '상세 보기',
    myApplications: '내 응모 현황',
    applications: '응모',
    selected: '당첨',
    waitingResult: '결과 대기',
    recommended: '추천 이벤트',
    newStories: '새로운 소식',
    viewAll: '전체 보기',
    apply: '응모하기',
    activityThisMonth: '이번 달 활동',
    meetings: '팬미팅',
    metFans: '만난 팬',
    newFans: '새로운 팬',
    upcomingSchedule: '다가오는 일정',
    fanRecords: '팬과의 기록',
    newNotifications: '새로운 알림',
    cameraCheck: '카메라 확인',
    micCheck: '마이크 확인',
    waitingRoom: '대기실 입장',
    inProgress: '진행 중인 팬미팅',
    recruiting: '모집 중',
    preparing: '준비 중',
    scheduled: '진행 예정',
    operationSettings: '운영 설정',
    monthlyOperation: '이번 달 운영',
    participationRate: '참여율',
    todayTasks: '오늘 할 일',
    checkForm: '응모 폼 확인',
    decideWinners: '당첨자 확정',
    deviceCheck: '장비 사전 점검',
    applicationTrend: '응모 추이',
    fanNews: '새로운 팬 소식',
    planned: '진행 예정',
    todayLive: '오늘 진행',
    totalApplicants: '전체 응모자',
    needsReview: '확인 필요',
    operationToday: '오늘의 운영 현황',
    meetingName: '팬미팅',
    time: '시간',
    status: '상태',
    participation: '참여 현황',
    management: '관리',
    monitoring: '모니터링',
    tasksToReview: '확인할 업무',
    externalList: '외부 참여자 명단',
    noticeReview: '공지 검토',
    organization: '조직 현황',
    influencers: '인플루언서',
    invitationPending: '초대 대기',
    weekSchedule: '이번 주 일정',
    recentActivity: '최근 활동',
    adminNotices: '전체 공지 관리',
    publishedNotices: '게시 중 공지',
    todayMeetings: '오늘 팬미팅',
    liveCalls: '진행 중 통화',
    published: '게시 중',
    title: '제목',
    publishedAt: '게시일',
    author: '작성자',
    edit: '수정',
    operationAlerts: '운영 알림',
    riskCall: '위험 감지 통화 1건',
    delayedQueue: '지연 중 대기열 1건',
    checkNow: '확인하기',
    serviceTrend: '서비스 이용 추이',
    recentOperations: '최근 운영 기록',
    serviceStatus: '서비스 상태',
    api: 'API',
    videoConnection: '영상 연결',
    notificationService: '알림',
    normal: '정상',
    emptyNotice: '등록된 공지가 없습니다.',
    loading: '홈 데이터를 불러오는 중입니다.',
  },
  en: {
    fanGreeting: (name: string) => `${name}, get ready for another exciting meeting`,
    fanLead: 'See new events and your application updates at a glance.',
    influencerGreeting: (name: string) => `${name}, ready to meet your fans today?`,
    influencerLead: 'Check upcoming meetings and the memories you have built with fans.',
    soloGreeting: (name: string) => `${name}, shall we create your next meeting?`,
    soloLead: 'MELLY helps you stay on top of planning, recruitment, and operations.',
    managerGreeting: (name: string) => `Good day, manager ${name}`,
    managerLead: 'Here are the fan meeting and organization tasks that need attention today.',
    adminGreeting: 'Service operations',
    adminLead: 'Quickly review service notices and operational signals.',
    browseEvents: 'Browse events', createMeeting: 'Create meeting', createNotice: 'New notice', upcomingMeeting: 'Upcoming meeting', todayMeeting: "Today's meeting", noUpcoming: 'No upcoming meetings', noUpcomingLead: 'Browse new events and find your next meeting.', enterReady: 'Get ready', viewDetails: 'View details', myApplications: 'My applications', applications: 'Applied', selected: 'Selected', waitingResult: 'Pending', recommended: 'Recommended events', newStories: 'Latest news', viewAll: 'View all', apply: 'Apply', activityThisMonth: 'This month', meetings: 'Meetings', metFans: 'Fans met', newFans: 'New fans', upcomingSchedule: 'Upcoming schedule', fanRecords: 'Fan records', newNotifications: 'New notifications', cameraCheck: 'Check camera', micCheck: 'Check microphone', waitingRoom: 'Enter waiting room', inProgress: 'Active meetings', recruiting: 'Recruiting', preparing: 'Preparing', scheduled: 'Scheduled', operationSettings: 'Operations', monthlyOperation: 'Monthly operations', participationRate: 'Participation', todayTasks: "Today's tasks", checkForm: 'Review form', decideWinners: 'Confirm winners', deviceCheck: 'Device check', applicationTrend: 'Application trend', fanNews: 'New fan activity', planned: 'Scheduled', todayLive: 'Today', totalApplicants: 'Applicants', needsReview: 'Needs review', operationToday: "Today's operations", meetingName: 'Meeting', time: 'Time', status: 'Status', participation: 'Participation', management: 'Manage', monitoring: 'Monitor', tasksToReview: 'Tasks to review', externalList: 'External participants', noticeReview: 'Review notice', organization: 'Organization', influencers: 'Influencers', invitationPending: 'Pending invites', weekSchedule: 'This week', recentActivity: 'Recent activity', adminNotices: 'Service notices', publishedNotices: 'Published notices', todayMeetings: 'Meetings today', liveCalls: 'Live calls', published: 'Published', title: 'Title', publishedAt: 'Published', author: 'Author', edit: 'Edit', operationAlerts: 'Operation alerts', riskCall: '1 risky call detected', delayedQueue: '1 delayed queue', checkNow: 'Review', serviceTrend: 'Service trend', recentOperations: 'Recent operations', serviceStatus: 'Service status', api: 'API', videoConnection: 'Video connection', notificationService: 'Notifications', normal: 'Healthy', emptyNotice: 'No notices yet.', loading: 'Loading your home dashboard.',
  },
} as const

const previewPublicMeetings: PublicFanMeetingSummary[] = [
  { meetingId: 101, title: '서윤 여름 팬미팅', coverImageUrl: mainEventImage, influencerName: '서윤', scheduledStartAt: '2026-08-12T19:00:00', status: 'APPLICATION_OPEN', applicationStartAt: null, applicationEndAt: null, applicationStatus: null, applicationCount: 24, participantCount: 30 },
  { meetingId: 102, title: '하준의 토크타임', coverImageUrl: mainEventImage, influencerName: '하준', scheduledStartAt: '2026-08-15T20:00:00', status: 'APPLICATION_OPEN', applicationStartAt: null, applicationEndAt: null, applicationStatus: null, applicationCount: 18, participantCount: 20 },
  { meetingId: 103, title: '채린과 함께하는 밤', coverImageUrl: mainEventImage, influencerName: '채린', scheduledStartAt: '2026-08-16T18:00:00', status: 'PUBLISHED', applicationStartAt: null, applicationEndAt: null, applicationStatus: null, applicationCount: 12, participantCount: 20 },
  { meetingId: 104, title: '도현의 여름밤', coverImageUrl: mainEventImage, influencerName: '도현', scheduledStartAt: '2026-08-24T19:30:00', status: 'APPLICATION_OPEN', applicationStartAt: null, applicationEndAt: null, applicationStatus: null, applicationCount: 22, participantCount: 30 },
]

const previewOwnedMeetings: ManagerMeetingSummary[] = previewPublicMeetings.map((meeting, index) => ({
  meetingId: String(meeting.meetingId),
  title: meeting.title,
  influencerName: meeting.influencerName,
  scheduledStartAt: meeting.scheduledStartAt,
  status: index === 0 ? 'READY' : index === 1 ? 'PUBLISHED' : 'APPLICATION_OPEN',
  applicationStartAt: null,
  applicationEndAt: null,
  applicationCount: meeting.applicationCount,
  participantCount: meeting.participantCount,
}))

const previewApplications: MyApplicationSummaryResponse[] = [
  { applicationId: 1, meetingId: 101, meetingTitle: '서윤 여름 팬미팅', coverImageUrl: mainEventImage, influencerName: '서윤', scheduledStartAt: '2026-08-12T19:00:00', applicationStatus: 'SELECTED', resultDecidedAt: '2026-08-05T09:00:00', callOrder: 3 },
  { applicationId: 2, meetingId: 103, meetingTitle: '채린과 함께하는 밤', coverImageUrl: mainEventImage, influencerName: '채린', scheduledStartAt: '2026-08-16T18:00:00', applicationStatus: 'SUBMITTED', resultDecidedAt: null, callOrder: null },
  { applicationId: 3, meetingId: 104, meetingTitle: '도현의 여름밤', coverImageUrl: mainEventImage, influencerName: '도현', scheduledStartAt: '2026-08-24T19:30:00', applicationStatus: 'SUBMITTED', resultDecidedAt: null, callOrder: null },
]

const previewNotices: NoticeSummaryResponse[] = [
  { noticeId: 1, meetingId: null, title: '8월 서비스 업데이트 안내', authorId: 1, authorNickname: '관리자', thumbnailUrl: null, createdAt: '2026-08-05T10:00:00', pinned: true },
  { noticeId: 2, meetingId: null, title: '영상 통화 입장 방법 안내', authorId: 1, authorNickname: '관리자', thumbnailUrl: null, createdAt: '2026-08-02T10:00:00', pinned: false },
  { noticeId: 3, meetingId: null, title: '개인정보 처리방침 변경 안내', authorId: 1, authorNickname: '관리자', thumbnailUrl: null, createdAt: '2026-07-28T10:00:00', pinned: false },
]

const previewNotifications: NotificationResponse[] = [
  { notificationId: 1, type: 'MEETING_PUBLISHED', title: '새 팬미팅이 공개되었어요', message: '서윤 여름 팬미팅이 공개되었습니다.', messageKey: null, messageArgs: null, meetingId: 101, readAt: null, createdAt: '2026-08-07T11:30:00' },
  { notificationId: 2, type: 'APPLICATION_RESULT', title: '팬미팅 응모 결과', message: '응모 결과를 확인해 보세요.', messageKey: null, messageArgs: null, meetingId: 101, readAt: null, createdAt: '2026-08-07T09:20:00' },
  { notificationId: 3, type: 'MEETING_CHANGED', title: '일정이 업데이트되었어요', message: '팬미팅 일정을 확인해 주세요.', messageKey: null, messageArgs: null, meetingId: 102, readAt: null, createdAt: '2026-08-06T18:00:00' },
]

const previewFollowers: FollowerSummaryResponse[] = [
  { fanId: 1, nickname: '지민', profileImageUrl: null, followedAt: '2026-08-07T10:00:00' },
  { fanId: 2, nickname: '하늘', profileImageUrl: null, followedAt: '2026-08-06T10:00:00' },
  { fanId: 3, nickname: '수빈', profileImageUrl: null, followedAt: '2026-08-05T10:00:00' },
]

const previewInfluencers: InfluencerSummaryResponse[] = [
  { influencerId: 1, influencerName: '서윤', profileImageUrl: mainEventImage, introduction: null, followerCount: 1240, isFollowing: true },
  { influencerId: 2, influencerName: '하준', profileImageUrl: null, introduction: null, followerCount: 930, isFollowing: false },
  { influencerId: 3, influencerName: '채린', profileImageUrl: null, introduction: null, followerCount: 850, isFollowing: false },
]

function previewData(role: LoginRole): DashboardData {
  return {
    applications: role === 'FAN' ? previewApplications : [],
    followers: role === 'INFLUENCER' || role === 'SOLO_INFLUENCER' ? previewFollowers : [],
    influencers: role === 'FAN' ? previewInfluencers : [],
    notices: previewNotices,
    notifications: previewNotifications,
    organization: role === 'MANAGER' ? {
      organization: { organizationId: 1, name: 'MELLY STUDIO', businessNumber: '000-00-00000', representativeName: '민준', contactEmail: 'hello@melly.test', contactPhone: '010-0000-0000', logoUrl: null, description: null, status: 'ACTIVE', createdAt: '2026-01-01T00:00:00' },
      members: previewFollowers.map((fan, index) => ({ organizationMemberId: index + 1, userId: fan.fanId, nickname: ['서윤', '도현', '채린'][index] ?? fan.nickname, profileImageUrl: null, userRole: 'INFLUENCER', memberType: 'MEMBER', status: 'ACTIVE', joinedAt: fan.followedAt, leftAt: null })),
    } : null,
    ownedMeetings: role === 'INFLUENCER' || role === 'SOLO_INFLUENCER' || role === 'MANAGER' ? previewOwnedMeetings : [],
    publicMeetings: previewPublicMeetings,
    loading: false,
  }
}

function useDashboardData(session: LoginResponse, preview: boolean): DashboardData {
  const [data, setData] = useState<DashboardData>(() => preview ? previewData(session.role) : {
    applications: [], followers: [], influencers: [], notices: [], notifications: [], organization: null, ownedMeetings: [], publicMeetings: [], loading: true,
  })

  useEffect(() => {
    if (preview) {
      setData(previewData(session.role))
      return
    }

    const controller = new AbortController()
    const requests: Promise<unknown>[] = []
    const update = (partial: Partial<DashboardData>) => setData((current) => ({ ...current, ...partial }))

    requests.push(fetchPublicFanMeetings({ page: 0, size: 8 }, session.accessToken, controller.signal).then((result) => update({ publicMeetings: result.content })))
    requests.push(getServiceNotices({ page: 0, size: 5 }, controller.signal).then((result) => update({ notices: result.content })))

    if (session.role !== 'ADMIN') {
      requests.push(getNotifications({ page: 0, size: 5 }, session.accessToken, controller.signal).then((result) => update({ notifications: result.content })))
    }
    if (session.role === 'FAN') {
      requests.push(getMyApplications({ page: 0, size: 100 }, session.accessToken, controller.signal).then((result) => update({ applications: result.content })))
      requests.push(getInfluencers({ page: 0, size: 8 }, session.accessToken, controller.signal).then((result) => update({ influencers: result.content })))
    }
    if (session.role === 'INFLUENCER' || session.role === 'SOLO_INFLUENCER' || session.role === 'MANAGER') {
      requests.push(fetchOwnedMeetings({ page: 0, size: 10 }, session.accessToken, controller.signal).then((result) => update({ ownedMeetings: result.content })))
    }
    if (session.role === 'INFLUENCER' || session.role === 'SOLO_INFLUENCER') {
      requests.push(getMyFollowers({ page: 0, size: 8 }, session.accessToken, controller.signal).then((result) => update({ followers: result.content })))
    }
    if (session.role === 'MANAGER') {
      requests.push(getMyOrganization(session.accessToken, controller.signal).then((result) => update({ organization: result })))
    }

    void Promise.allSettled(requests).then(() => {
      if (!controller.signal.aborted) update({ loading: false })
    })
    return () => controller.abort()
  }, [preview, session.accessToken, session.role])

  return data
}

function formatDate(value: string, locale: string, includeTime = true) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ko-KR', {
    month: 'short', day: 'numeric', weekday: includeTime ? 'short' : undefined,
    hour: includeTime ? 'numeric' : undefined, minute: includeTime ? '2-digit' : undefined,
  }).format(date)
}

function meetingStatus(status?: string) {
  if (status === 'LIVE') return { label: 'LIVE', tone: 'danger' }
  if (status === 'READY') return { label: '준비 중', tone: 'info' }
  if (status === 'APPLICATION_OPEN') return { label: '모집 중', tone: 'success' }
  if (status === 'ENDED') return { label: '종료', tone: 'neutral' }
  return { label: '예정', tone: 'warning' }
}

function Panel({ title, icon: IconComponent, action, className = '', children }: { title: string; icon?: Icon; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`rd-panel ${className}`}><header className="rd-panel-header"><h2>{IconComponent ? <IconComponent aria-hidden size={21} weight="duotone" /> : null}{title}</h2>{action}</header>{children}</section>
}

function ActionLink({ to, children, variant = 'primary', className = '' }: { to: string; children: ReactNode; variant?: 'primary' | 'outline' | 'quiet'; className?: string }) {
  return <Link className={`rd-action rd-action-${variant} ${className}`} to={to}>{children}<ArrowRight aria-hidden size={16} weight="bold" /></Link>
}

function MoreLink({ to, label }: { to: string; label: string }) {
  return <Link className="rd-more" to={to}>{label}<ArrowRight aria-hidden size={14} /></Link>
}

function StatCard({ icon: IconComponent, label, value, tone = 'coral' }: { icon: Icon; label: string; value: ReactNode; tone?: 'coral' | 'mint' | 'violet' | 'amber' }) {
  return <article className="rd-stat"><span className={`rd-icon rd-icon-${tone}`}><IconComponent aria-hidden size={23} weight="duotone" /></span><span><small>{label}</small><strong>{value}</strong></span></article>
}

function Mascot() {
  return <img alt="" aria-hidden className="rd-mascot" src={jellyDuo} />
}

function Hero({ title, lead, role, action }: { title: string; lead: string; role: string; action?: ReactNode }) {
  return <section className="rd-hero"><div><span className="rd-role-chip">{role}</span><h1>{title}</h1><p>{lead}</p>{action ? <div className="rd-hero-action">{action}</div> : null}</div><Mascot /></section>
}

function EventImage({ src, alt, className = '' }: { src?: string | null; alt: string; className?: string }) {
  return <img alt={alt} className={`rd-event-image ${className}`} src={src || mainEventImage} />
}

function FanDashboard({ session, data, copy, locale }: { session: LoginResponse; data: DashboardData; copy: Copy; locale: string }) {
  const selected = data.applications.filter((item) => item.applicationStatus === 'SELECTED')
  const pending = data.applications.filter((item) => item.applicationStatus === 'SUBMITTED')
  const upcoming = selected[0] ?? data.applications[0]
  const recommendations = data.publicMeetings.slice(0, 4)
  return <div className="rd-page"><div className="rd-fan-top"><Hero title={copy.fanGreeting(session.nickname || 'MELLY')} lead={copy.fanLead} role="FAN" action={<ActionLink to="/fan/events">{copy.browseEvents}</ActionLink>} />
    <Panel title={copy.upcomingMeeting} icon={CalendarBlank} className="rd-upcoming">{upcoming ? <div className="rd-upcoming-body"><EventImage alt={upcoming.meetingTitle} src={upcoming.coverImageUrl} /><div className="rd-upcoming-copy"><span className="rd-kicker">{upcoming.applicationStatus === 'SELECTED' ? copy.selected : copy.waitingResult}</span><h3>{upcoming.meetingTitle}</h3><p>{upcoming.influencerName}</p><time>{formatDate(upcoming.scheduledStartAt, locale)}</time><ActionLink to={`/fan/events/${upcoming.meetingId}`} variant="outline">{upcoming.applicationStatus === 'SELECTED' ? copy.enterReady : copy.viewDetails}</ActionLink></div></div> : <div className="rd-empty"><CalendarBlank size={34} weight="duotone" /><strong>{copy.noUpcoming}</strong><span>{copy.noUpcomingLead}</span></div>}</Panel></div>
    <Panel title={copy.myApplications} icon={Ticket}><div className="rd-metric-strip"><StatCard icon={PencilSimple} label={copy.applications} value={data.applications.length} /><StatCard icon={Star} label={copy.selected} value={selected.length} tone="mint" /><StatCard icon={Clock} label={copy.waitingResult} value={pending.length} tone="violet" /></div></Panel>
    <div className="rd-bottom-grid rd-fan-bottom"><Panel title={copy.recommended} icon={Sparkle} action={<MoreLink label={copy.viewAll} to="/fan/events" />}><div className="rd-event-grid">{recommendations.length ? recommendations.map((meeting) => <article className="rd-event-card" key={meeting.meetingId}><EventImage alt="" src={meeting.coverImageUrl} /><div><span className="rd-kicker">{meeting.influencerName}</span><h3>{meeting.title}</h3><time>{formatDate(meeting.scheduledStartAt, locale)}</time><ActionLink to={`/fan/events/${meeting.meetingId}`}>{copy.apply}</ActionLink></div></article>) : <div className="rd-empty rd-empty-compact"><Sparkle size={28} /><strong>{copy.noUpcoming}</strong></div>}</div></Panel>
      <Panel title={copy.newStories} icon={Megaphone} action={<MoreLink label={copy.viewAll} to="/service-notices" />}><NoticeList notices={data.notices} copy={copy} locale={locale} /></Panel></div></div>
}

function NoticeList({ notices, copy, locale }: { notices: NoticeSummaryResponse[]; copy: Copy; locale: string }) {
  if (!notices.length) return <div className="rd-empty rd-empty-compact"><FileText size={28} /><strong>{copy.emptyNotice}</strong></div>
  return <ul className="rd-list">{notices.slice(0, 5).map((notice) => <li key={notice.noticeId}><Link to={`/service-notices/${notice.noticeId}`}><span className="rd-list-dot" /><strong>{notice.title}</strong><time>{formatDate(notice.createdAt, locale, false)}</time></Link></li>)}</ul>
}

function InfluencerDashboard({ session, data, copy, locale }: { session: LoginResponse; data: DashboardData; copy: Copy; locale: string }) {
  const meeting = data.ownedMeetings[0]
  const metFans = data.ownedMeetings.reduce((sum, item) => sum + item.participantCount, 0)
  return <div className="rd-page"><Hero title={copy.influencerGreeting(session.nickname || 'MELLY')} lead={copy.influencerLead} role="INFLUENCER" />
    <div className="rd-two-column"><Panel title={copy.todayMeeting} icon={CalendarBlank} className="rd-feature-meeting">{meeting ? <div className="rd-feature-row"><div><span className="rd-kicker">{meetingStatus(meeting.status).label}</span><h3>{meeting.title}</h3><time>{formatDate(meeting.scheduledStartAt, locale)}</time><p><Users size={17} /> {meeting.participantCount}명</p></div><ul className="rd-check-list"><li><CheckCircle weight="fill" />{copy.cameraCheck}</li><li><CheckCircle weight="fill" />{copy.micCheck}</li><li><Clock />{copy.waitingRoom}</li></ul><ActionLink to={`/influencer/fan-meetings/${meeting.meetingId}/ready`}>{copy.enterReady}</ActionLink></div> : <div className="rd-empty"><CalendarBlank size={34} /><strong>{copy.noUpcoming}</strong></div>}</Panel>
      <Panel title={copy.activityThisMonth} icon={ChartLineUp}><div className="rd-metric-strip rd-metric-vertical"><StatCard icon={VideoCamera} label={copy.meetings} value={data.ownedMeetings.length} tone="violet" /><StatCard icon={Users} label={copy.metFans} value={metFans} tone="mint" /><StatCard icon={UserPlus} label={copy.newFans} value={data.followers.length} /></div></Panel></div>
    <div className="rd-three-column"><Panel title={copy.upcomingSchedule} icon={CalendarBlank} action={<MoreLink label={copy.viewAll} to="/influencer/fan-meetings" />}><MeetingSchedule meetings={data.ownedMeetings} locale={locale} base="/influencer/fan-meetings" /></Panel><Panel title={copy.fanRecords} icon={Heart} action={<MoreLink label={copy.viewAll} to="/influencer/fans" />}><FanList followers={data.followers} /></Panel><Panel title={copy.newNotifications} icon={Bell} action={<MoreLink label={copy.viewAll} to="/notifications" />}><NotificationList notifications={data.notifications} /></Panel></div></div>
}

function MeetingSchedule({ meetings, locale, base }: { meetings: ManagerMeetingSummary[]; locale: string; base: string }) {
  if (!meetings.length) return <div className="rd-empty rd-empty-compact"><CalendarBlank size={28} /><strong>예정된 일정이 없습니다.</strong></div>
  return <ul className="rd-schedule">{meetings.slice(0, 4).map((meeting) => <li key={meeting.meetingId}><Link to={`${base}/${meeting.meetingId}`}><time>{formatDate(meeting.scheduledStartAt, locale, false)}</time><span><strong>{meeting.title}</strong><small>{formatDate(meeting.scheduledStartAt, locale)}</small></span><ArrowRight size={15} /></Link></li>)}</ul>
}

function FanList({ followers }: { followers: FollowerSummaryResponse[] }) {
  if (!followers.length) return <div className="rd-empty rd-empty-compact"><Users size={28} /><strong>새로운 팬을 기다리고 있어요.</strong></div>
  return <ul className="rd-fan-list">{followers.slice(0, 4).map((fan) => <li key={fan.fanId}><Avatar name={fan.nickname} src={fan.profileImageUrl ?? undefined} /><span><strong>{fan.nickname}</strong><small>새롭게 팔로우했어요</small></span><Heart size={18} weight="duotone" /></li>)}</ul>
}

function NotificationList({ notifications }: { notifications: NotificationResponse[] }) {
  if (!notifications.length) return <div className="rd-empty rd-empty-compact"><Bell size={28} /><strong>새로운 알림이 없습니다.</strong></div>
  return <ul className="rd-notification-list">{notifications.slice(0, 4).map((notification) => <li key={notification.notificationId}><span className="rd-icon rd-icon-coral"><Bell size={18} weight="duotone" /></span><span><strong>{notification.title}</strong><small>{notification.message}</small></span>{notification.readAt ? null : <i />}</li>)}</ul>
}

function SoloDashboard({ session, data, copy, locale }: { session: LoginResponse; data: DashboardData; copy: Copy; locale: string }) {
  const meeting = data.ownedMeetings[0]
  const totalApplications = data.ownedMeetings.reduce((sum, item) => sum + item.applicationCount, 0)
  const totalParticipants = data.ownedMeetings.reduce((sum, item) => sum + item.participantCount, 0)
  const rate = totalApplications ? Math.min(100, Math.round(totalParticipants / totalApplications * 100)) : 0
  return <div className="rd-page"><Hero title={copy.soloGreeting(session.nickname || 'MELLY')} lead={copy.soloLead} role="SOLO INFLUENCER" action={<ActionLink to="/manager/fan-meetings/new"><Plus size={17} weight="bold" />{copy.createMeeting}</ActionLink>} />
    <div className="rd-two-column rd-solo-main"><Panel title={copy.inProgress} icon={PlayCircle}>{meeting ? <div className="rd-lifecycle"><div className="rd-lifecycle-tabs"><span className="active">1 {copy.recruiting}</span><span>2 {copy.preparing}</span><span>3 {copy.scheduled}</span></div><div className="rd-lifecycle-body"><EventImage alt="" src={mainEventImage} /><div><h3>{meeting.title}</h3><time>{formatDate(meeting.scheduledStartAt, locale)}</time><p><Users size={17} /> {meeting.applicationCount} / {Math.max(meeting.participantCount, 30)}명</p><progress max={Math.max(meeting.participantCount, 30)} value={meeting.applicationCount} /><ActionLink to={`/manager/fan-meetings/${meeting.meetingId}`} variant="outline">{copy.operationSettings}</ActionLink></div></div></div> : <div className="rd-empty"><PlayCircle size={34} /><strong>{copy.noUpcoming}</strong></div>}</Panel><div className="rd-stack"><Panel title={copy.monthlyOperation} icon={ChartLineUp}><div className="rd-metric-strip"><StatCard icon={VideoCamera} label={copy.meetings} value={data.ownedMeetings.length} /><StatCard icon={Users} label={copy.applications} value={totalApplications} tone="violet" /><StatCard icon={Heart} label={copy.participationRate} value={`${rate}%`} tone="mint" /></div></Panel><div className="rd-two-mini"><Panel title={copy.todayTasks} icon={ListChecks}><ul className="rd-task-list"><li><CheckCircle />{copy.checkForm}</li><li><CheckCircle />{copy.decideWinners}</li><li><CheckCircle />{copy.deviceCheck}</li></ul></Panel><Panel title={copy.applicationTrend} icon={ChartLineUp}><div className="rd-progress-group">{data.ownedMeetings.slice(0, 4).map((item) => <label key={item.meetingId}><span>{item.title}</span><progress max={Math.max(item.applicationCount, 30)} value={item.applicationCount} /></label>)}</div></Panel></div></div></div>
    <Panel title={copy.fanNews} icon={Heart} action={<MoreLink label={copy.viewAll} to="/influencer/fans" />}><FanList followers={data.followers} /></Panel></div>
}

function ManagerDashboard({ session, data, copy, locale }: { session: LoginResponse; data: DashboardData; copy: Copy; locale: string }) {
  const todayCount = data.ownedMeetings.filter((meeting) => new Date(meeting.scheduledStartAt).toDateString() === new Date().toDateString()).length
  const applications = data.ownedMeetings.reduce((sum, meeting) => sum + meeting.applicationCount, 0)
  return <div className="rd-page"><Hero title={copy.managerGreeting(session.nickname || 'MELLY')} lead={copy.managerLead} role={data.organization?.organization.name ?? 'MANAGER'} action={<ActionLink to="/manager/fan-meetings/new"><Plus size={17} weight="bold" />{copy.createMeeting}</ActionLink>} />
    <div className="rd-stat-grid"><StatCard icon={CalendarBlank} label={copy.planned} value={data.ownedMeetings.length} /><StatCard icon={PlayCircle} label={copy.todayLive} value={todayCount} tone="mint" /><StatCard icon={Users} label={copy.totalApplicants} value={applications} tone="violet" /><StatCard icon={WarningCircle} label={copy.needsReview} value={data.ownedMeetings.filter((meeting) => meeting.status === 'DRAFT').length} tone="amber" /></div>
    <Panel title={copy.operationToday} icon={Monitor} action={<MoreLink label={copy.viewAll} to="/manager/fan-meetings" />}><div className="rd-table-wrap"><table className="rd-table"><thead><tr><th>{copy.meetingName}</th><th>{copy.time}</th><th>{copy.status}</th><th>{copy.participation}</th><th>{copy.monitoring}</th><th>{copy.management}</th></tr></thead><tbody>{data.ownedMeetings.slice(0, 4).map((meeting) => { const status = meetingStatus(meeting.status); const capacity = Math.max(meeting.applicationCount, meeting.participantCount, 1); return <tr key={meeting.meetingId}><td><Avatar name={meeting.influencerName} /><span><strong>{meeting.title}</strong><small>{meeting.influencerName}</small></span></td><td>{formatDate(meeting.scheduledStartAt, locale)}</td><td><span className={`rd-status rd-status-${status.tone}`}>{status.label}</span></td><td><span className="rd-table-progress"><strong>{meeting.participantCount} / {capacity}명</strong><progress max={capacity} value={meeting.participantCount} /></span></td><td><ActionLink to={`/manager/fan-meetings/${meeting.meetingId}/monitor`} variant="quiet">{copy.monitoring}</ActionLink></td><td><ActionLink to={`/manager/fan-meetings/${meeting.meetingId}`} variant="outline">{copy.viewDetails}</ActionLink></td></tr>})}</tbody></table></div></Panel>
    <div className="rd-manager-bottom"><Panel title={copy.tasksToReview} icon={WarningCircle}><ul className="rd-task-links"><li><Link to="/manager/fan-meetings"><WarningCircle />{copy.decideWinners}<ArrowRight /></Link></li><li><Link to="/manager/fan-meetings"><WarningCircle />{copy.externalList}<ArrowRight /></Link></li><li><Link to="/service-notices"><WarningCircle />{copy.noticeReview}<ArrowRight /></Link></li></ul></Panel><Panel title={copy.organization} icon={Buildings} action={<MoreLink label={copy.viewAll} to="/manager/organization" />}><div className="rd-organization"><strong>{copy.influencers} {data.organization?.members.length ?? 0}명</strong><div className="rd-avatar-stack">{data.organization?.members.slice(0, 6).map((member) => <Avatar key={member.userId} name={member.nickname} src={member.profileImageUrl ?? undefined} />)}</div><span>{copy.invitationPending} 0명</span></div></Panel><Panel title={copy.weekSchedule} icon={CalendarBlank}><MeetingSchedule meetings={data.ownedMeetings} locale={locale} base="/manager/fan-meetings" /></Panel><Panel title={copy.recentActivity} icon={Bell}><NotificationList notifications={data.notifications} /></Panel></div></div>
}

function AdminDashboard({ data, copy, locale }: { data: DashboardData; copy: Copy; locale: string }) {
  const liveMeetings = data.publicMeetings.filter((meeting) => meeting.status === 'LIVE').length
  return <div className="rd-page"><Hero title={copy.adminGreeting} lead={copy.adminLead} role="ADMIN" action={<ActionLink to="/admin/service-notices"><Plus size={17} weight="bold" />{copy.createNotice}</ActionLink>} />
    <div className="rd-stat-grid"><StatCard icon={Megaphone} label={copy.publishedNotices} value={data.notices.length} /><StatCard icon={CalendarBlank} label={copy.todayMeetings} value={data.publicMeetings.length} /><StatCard icon={VideoCamera} label={copy.liveCalls} value={liveMeetings} tone="violet" /><StatCard icon={WarningCircle} label={copy.needsReview} value={0} tone="amber" /></div>
    <div className="rd-admin-main"><Panel title={copy.adminNotices} icon={Megaphone} action={<MoreLink label={copy.viewAll} to="/admin/service-notices" />}><div className="rd-table-wrap"><table className="rd-table rd-notice-table"><thead><tr><th>{copy.status}</th><th>{copy.title}</th><th>{copy.publishedAt}</th><th>{copy.author}</th><th>{copy.management}</th></tr></thead><tbody>{data.notices.map((notice) => <tr key={notice.noticeId}><td><span className="rd-status rd-status-success">{copy.published}</span></td><td><strong>{notice.title}</strong></td><td>{formatDate(notice.createdAt, locale)}</td><td>{notice.authorNickname}</td><td><ActionLink to="/admin/service-notices" variant="outline">{copy.edit}</ActionLink></td></tr>)}</tbody></table></div></Panel><Panel title={copy.operationAlerts} icon={WarningCircle}><div className="rd-alert-list"><article><span className="rd-icon rd-icon-coral"><WarningCircle size={22} weight="fill" /></span><span><strong>{copy.riskCall}</strong><small>즉시 확인이 필요한 운영 신호입니다.</small></span><ActionLink to="/admin/service-notices" variant="outline">{copy.checkNow}</ActionLink></article><article className="warning"><span className="rd-icon rd-icon-amber"><Clock size={22} weight="fill" /></span><span><strong>{copy.delayedQueue}</strong><small>대기 시간이 길어진 팬이 있습니다.</small></span><ActionLink to="/service-notices" variant="outline">{copy.checkNow}</ActionLink></article></div></Panel></div>
    <div className="rd-admin-bottom"><Panel title={copy.serviceTrend} icon={ChartLineUp}><div className="rd-service-bars">{[46, 58, 64, 78, 67, 61, 72].map((value, index) => <span key={index}><i style={{ height: `${value}%` }} /><small>{index + 1}</small></span>)}</div></Panel><Panel title={copy.recentOperations} icon={FileText}><NoticeList notices={data.notices} copy={copy} locale={locale} /></Panel><Panel title={copy.serviceStatus} icon={ShieldCheck}><ul className="rd-health"><li><Gear />{copy.api}<strong>{copy.normal}</strong></li><li><VideoCamera />{copy.videoConnection}<strong>{copy.normal}</strong></li><li><Bell />{copy.notificationService}<strong>{copy.normal}</strong></li></ul></Panel></div></div>
}

export function RoleDashboardPage({ session, preview = false }: { session: LoginResponse; preview?: boolean }) {
  const { locale } = useTranslation()
  const copy = dashboardCopy[locale]
  const data = useDashboardData(session, preview)
  const content = useMemo(() => {
    if (session.role === 'FAN') return <FanDashboard copy={copy} data={data} locale={locale} session={session} />
    if (session.role === 'INFLUENCER') return <InfluencerDashboard copy={copy} data={data} locale={locale} session={session} />
    if (session.role === 'SOLO_INFLUENCER') return <SoloDashboard copy={copy} data={data} locale={locale} session={session} />
    if (session.role === 'MANAGER') return <ManagerDashboard copy={copy} data={data} locale={locale} session={session} />
    return <AdminDashboard copy={copy} data={data} locale={locale} />
  }, [copy, data, locale, session])

  return <div aria-busy={data.loading} className="role-dashboard">{data.loading ? <div className="rd-loading"><span /><span>{copy.loading}</span></div> : null}{content}</div>
}
