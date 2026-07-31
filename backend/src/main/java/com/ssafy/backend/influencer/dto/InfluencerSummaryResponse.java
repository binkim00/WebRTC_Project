package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.InfluencerProfile;

/**
 * 인플루언서 탐색 목록의 요약 항목을 전달한다.
 *
 * @param influencerId 인플루언서 사용자 식별자
 * @param influencerName 인플루언서 활동명
 * @param profileImageUrl 인플루언서 프로필 이미지 URL
 * @param introduction 인플루언서 소개
 * @param followerCount 현재 팔로워 수
 * @param isFollowing 조회한 팬의 팔로우 여부이며 비로그인 사용자는 false
 */
public record InfluencerSummaryResponse(
        Long influencerId,
        String influencerName,
        String profileImageUrl,
        String introduction,
        long followerCount,
        boolean isFollowing
) {

    /**
     * 공개 프로필과 집계 값을 인플루언서 요약 응답으로 변환한다.
     *
     * @param profile 인플루언서 공개 프로필
     * @param followerCount 현재 팔로워 수
     * @param following 조회한 팬의 팔로우 여부
     * @return 인플루언서 요약 응답
     */
    public static InfluencerSummaryResponse of(
            InfluencerProfile profile, long followerCount, boolean following
    ) {
        return new InfluencerSummaryResponse(
                profile.getUser().getId(),
                profile.getActivityName(),
                profile.getUser().getProfileImageUrl(),
                profile.getIntroduction(),
                followerCount,
                following
        );
    }
}
