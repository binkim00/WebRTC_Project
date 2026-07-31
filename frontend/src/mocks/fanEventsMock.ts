import localPreviewImage from '../assets/call-preview-local.jpg'
import remotePreviewImage from '../assets/call-preview-remote.jpg'

export type RecruitmentStatus = 'RECRUITING' | 'ANNOUNCED' | 'CLOSED'

export type FanEventMock = {
  eventId: number
  title: string
  influencerName: string
  recruitmentStatus: RecruitmentStatus
  thumbnailUrl: string
  meetingAt: string
  applicationDeadline: string
  callDuration: string
  applicationPeriod: string
  capacity: number
  description: string[]
  participationConditions: string[]
  notices: string[]
}

const commonParticipationConditions = [
  '본인 명의 계정으로 응모해 주세요.',
  '팬미팅 시작 전에 장비 점검을 완료해 주세요.',
  '안내된 시간에 대기실에 입장해 주세요.',
]

const commonNotices = [
  '영상통화는 행사 운영 및 안전 관리를 위해 녹화될 수 있습니다.',
  '부적절한 상황이 발생하면 운영자가 통화를 종료할 수 있습니다.',
  '당첨자 본인이 아닌 경우 팬미팅 참여가 제한됩니다.',
]

export const fanEventsMock: FanEventMock[] = [
  {
    eventId: 1,
    title: 'Melly와의 봄날 팬미팅',
    influencerName: 'Melly',
    recruitmentStatus: 'RECRUITING',
    thumbnailUrl: remotePreviewImage,
    meetingAt: '2026.08.02 19:00',
    applicationDeadline: '2026.07.25',
    callDuration: '02:00',
    applicationPeriod: '2026.07.15 - 2026.07.25',
    capacity: 30,
    description: [
      'Melly와 함께 1:1 영상통화로 만나는 온라인 팬미팅입니다.',
      '행사 운영을 위해 응모 정보와 참여 기록이 사용됩니다.',
    ],
    participationConditions: commonParticipationConditions,
    notices: commonNotices,
  },
  {
    eventId: 2,
    title: '여름밤 라이브 콜',
    influencerName: 'Hana',
    recruitmentStatus: 'ANNOUNCED',
    thumbnailUrl: localPreviewImage,
    meetingAt: '2026.08.05 20:00',
    applicationDeadline: '2026.07.28',
    callDuration: '02:00',
    applicationPeriod: '2026.07.18 - 2026.07.28',
    capacity: 24,
    description: [
      'Hana와 여름밤의 이야기를 나누는 1:1 라이브 팬미팅입니다.',
      '당첨 결과와 참여 일정은 응모 내역에서 확인할 수 있습니다.',
    ],
    participationConditions: commonParticipationConditions,
    notices: commonNotices,
  },
  {
    eventId: 3,
    title: '첫 만남 온라인 팬사인회',
    influencerName: 'Hana',
    recruitmentStatus: 'RECRUITING',
    thumbnailUrl: localPreviewImage,
    meetingAt: '2026.08.10 19:30',
    applicationDeadline: '2026.08.01',
    callDuration: '03:00',
    applicationPeriod: '2026.07.22 - 2026.08.01',
    capacity: 20,
    description: [
      'Hana와 처음 만나는 팬을 위한 온라인 팬사인회입니다.',
      '짧은 영상통화 동안 전하고 싶은 이야기를 미리 준비해 주세요.',
    ],
    participationConditions: commonParticipationConditions,
    notices: commonNotices,
  },
  {
    eventId: 4,
    title: 'Melly Special Call',
    influencerName: 'Melly',
    recruitmentStatus: 'CLOSED',
    thumbnailUrl: remotePreviewImage,
    meetingAt: '2026.08.12 16:00',
    applicationDeadline: '2026.08.03',
    callDuration: '02:00',
    applicationPeriod: '2026.07.24 - 2026.08.03',
    capacity: 30,
    description: [
      'Melly와 특별한 오후를 함께하는 1:1 영상통화 팬미팅입니다.',
      '현재 응모가 마감되어 기존 응모자만 결과를 확인할 수 있습니다.',
    ],
    participationConditions: commonParticipationConditions,
    notices: commonNotices,
  },
  {
    eventId: 5,
    title: 'Weekend Fan Talk',
    influencerName: 'Sora',
    recruitmentStatus: 'ANNOUNCED',
    thumbnailUrl: localPreviewImage,
    meetingAt: '2026.08.15 21:00',
    applicationDeadline: '2026.08.05',
    callDuration: '02:30',
    applicationPeriod: '2026.07.26 - 2026.08.05',
    capacity: 25,
    description: [
      'Sora와 주말 저녁을 함께하는 온라인 팬 토크입니다.',
      '응모 결과가 발표되었으며 당첨자는 장비 점검을 준비해 주세요.',
    ],
    participationConditions: commonParticipationConditions,
    notices: commonNotices,
  },
  {
    eventId: 6,
    title: 'Hello Again 팬미팅',
    influencerName: 'Min',
    recruitmentStatus: 'CLOSED',
    thumbnailUrl: remotePreviewImage,
    meetingAt: '2026.07.17 20:00',
    applicationDeadline: '2026.08.08',
    callDuration: '02:00',
    applicationPeriod: '2026.07.29 - 2026.08.08',
    capacity: 30,
    description: [
      'Min과 다시 만나 근황을 나누는 1:1 영상통화 팬미팅입니다.',
      '원활한 참여를 위해 안내된 일정과 유의사항을 확인해 주세요.',
    ],
    participationConditions: commonParticipationConditions,
    notices: commonNotices,
  },
]
