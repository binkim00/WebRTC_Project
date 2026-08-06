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

/** 팔로우 등록·취소 응답이다. 두 응답 모두 갱신된 팔로워 수를 함께 준다. */
export type FollowMutationResponse = {
  influencerId: number
  isFollowing: boolean
  followerCount: number
  /** 취소 응답에는 없다. */
  followedAt?: string
}

/**
 * 팬이 인플루언서를 팔로우한다. (FAN 전용)
 *
 * 이미 팔로우한 대상이면 백엔드가 409로 거부하므로 호출 측에서 현재 상태를 보고 분기한다.
 */
export async function followInfluencer(
  influencerId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FollowMutationResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/influencers/${encodeURIComponent(String(influencerId))}/follow`,
    { method: 'POST', authToken, signal },
  )

  return unwrapEnvelope<FollowMutationResponse>(response)
}

/** 팬이 인플루언서 팔로우를 취소한다. (FAN 전용) */
export async function unfollowInfluencer(
  influencerId: string | number,
  authToken: string,
  signal?: AbortSignal,
): Promise<FollowMutationResponse> {
  const response = await apiRequest<unknown>(
    `/api/v1/influencers/${encodeURIComponent(String(influencerId))}/follow`,
    { method: 'DELETE', authToken, signal },
  )

  return unwrapEnvelope<FollowMutationResponse>(response)
}

/**
 * 팬이 팔로우한 인플루언서 요약이다.
 *
 * 탐색 목록과 달리 팔로워 수와 팔로우 여부가 없다(이 목록은 전부 팔로우 중이다).
 * 활동명을 등록하지 않은 인플루언서는 백엔드가 닉네임으로 대체해 내려준다.
 */
export type FollowingSummaryResponse = {
  influencerId: number
  influencerName: string
  profileImageUrl: string | null
  introduction: string | null
  followedAt: string
}

/** 인플루언서를 팔로우한 팬 요약이다. */
export type FollowerSummaryResponse = {
  fanId: number
  nickname: string
  profileImageUrl: string | null
  followedAt: string
}

/** page는 0부터 시작한다. */
type PageQuery = {
  page?: number
  size?: number
}

/** 현재 팬이 팔로우하는 인플루언서를 최신 팔로우순으로 조회한다. (FAN 전용) */
export async function getMyFollowings(
  query: PageQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<PageResponse<FollowingSummaryResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/users/me/followings${buildQuery(query)}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<PageResponse<FollowingSummaryResponse>>(response)
}

/** 현재 인플루언서를 팔로우하는 팬을 최신 팔로우순으로 조회한다. (INFLUENCER·SOLO 전용) */
export async function getMyFollowers(
  query: PageQuery,
  authToken: string,
  signal?: AbortSignal,
): Promise<PageResponse<FollowerSummaryResponse>> {
  const response = await apiRequest<unknown>(
    `/api/v1/influencers/me/followers${buildQuery(query)}`,
    { method: 'GET', authToken, signal },
  )

  return unwrapEnvelope<PageResponse<FollowerSummaryResponse>>(response)
}
