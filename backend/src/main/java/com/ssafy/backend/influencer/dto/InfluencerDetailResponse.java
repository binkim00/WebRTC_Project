package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;

import java.util.List;

/**
 * 인플루언서 공개 상세 정보를 전달한다.
 *
 * @param influencerId 인플루언서 사용자 식별자
 * @param influencerName 인플루언서 활동명이며 공개 프로필이 없으면 계정 닉네임
 * @param profileImageUrl 인플루언서 프로필 이미지 URL
 * @param introduction 인플루언서 소개이며 공개 프로필이 없으면 null
 * @param socialUrl 인플루언서 외부 채널 URL이며 공개 프로필이 없으면 null
 * @param followerCount 현재 팔로워 수
 * @param isFollowing 조회한 팬의 팔로우 여부이며 비로그인 사용자는 false
 * @param meetings 예정·진행·종료 팬미팅을 상태와 함께 담은 목록
 */
public record InfluencerDetailResponse(
        Long influencerId,
        String influencerName,
        String profileImageUrl,
        String introduction,
        String socialUrl,
        long followerCount,
        boolean isFollowing,
        List<MeetingSummaryResponse> meetings
) {

    /**
     * 공개 프로필과 집계 값, 공개 팬미팅을 상세 응답으로 변환한다.
     *
     * @param profile 인플루언서 공개 프로필
     * @param followerCount 현재 팔로워 수
     * @param following 조회한 팬의 팔로우 여부
     * @param meetings 상태 순서대로 정렬된 공개 팬미팅 목록
     * @return 인플루언서 상세 응답
     */
    public static InfluencerDetailResponse of(
            InfluencerProfileRepository.InfluencerDetailView view, long followerCount, boolean following,
            List<MeetingSummaryResponse> meetings
    ) {
        return new InfluencerDetailResponse(
                view.getInfluencerId(),
                InfluencerSummaryResponse.displayName(view),
                view.getProfileImageUrl(),
                view.getIntroduction(),
                view.getSocialUrl(),
                followerCount,
                following,
                meetings
        );
    }
}
