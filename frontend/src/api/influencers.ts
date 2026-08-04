import { apiRequest } from './client'
import { buildQuery, unwrapEnvelope, type PageResponse } from './envelope'
import type { FanMeetingStatus } from './meetingManagement'

/** 인플루언서 목록 카드에 필요한 요약 정보다. */
export type InfluencerSummaryResponse = {
  influencerId: number
  /** 활동명이 없으면 백엔드가 닉네임으로 대체해 내려준다. */
  influencerName: string
  profileImageUrl: string | null
  introduction: string | null
  followerCount: number
  isFollowing: boolean
}

/** 인플루언서 상세에서 함께 내려오는 공개 팬미팅 요약이다. */
export type InfluencerMeetingSummaryResponse = {
  meetingId: number
  title: string
  coverImageUrl: string | null
  scheduledStartAt: string
  status: FanMeetingStatus
  applicationStartAt: string | null
  applicationEndAt: string | null
}

/** 인플루언서 프로필 화면에 필요한 상세 정보와 공개 팬미팅 목록이다. */
export type InfluencerDetailResponse = {
  influencerId: number
  influencerName: string
  profileImageUrl: string | null
  introduction: string | null
  socialUrl: string | null
  followerCount: number
  isFollowing: boolean
  meetings: InfluencerMeetingSummaryResponse[]
}

/** page는 0부터 시작하며 keyword는 활동명·소개·닉네임에 함께 적용된다. */
type InfluencersQuery = {
  keyword?: string
  page?: number
  size?: number
}

/**
 * 공개 인플루언서 목록을 조회한다. (인증 불필요)
 *
 * 토큰을 넘기면 백엔드가 isFollowing을 채워 주므로 로그인 상태면 함께 전달한다.
 */
export async function getInfluencers(
  query: InfluencersQuery,
  authToken?: string,
  signal?: AbortSignal,
): Promise<PageResponse<InfluencerSummaryResponse>> {
  const response = await apiRequest<unknown>(`/api/v1/influencers${buildQuery(query)}`, {
    method: 'GET',
    authToken,
    signal,
  })

  return unwrapEnvelope<PageResponse<InfluencerSummaryResponse>>(response)
}

/** 인플루언서 한 명의 상세와 공개 팬미팅 목록을 조회한다. (인증 불필요) */
export async function getInfluencer(
  influencerId: string | number,
  authToken?: string,
  signal?: AbortSignal,
): Promise<InfluencerDetailResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/influencers/${encodeURIComponent(String(influencerId))}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<InfluencerDetailResponse>(response)
}
