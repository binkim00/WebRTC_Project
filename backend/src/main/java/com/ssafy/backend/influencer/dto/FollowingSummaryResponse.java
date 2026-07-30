package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;

/**
 * 팬이 팔로우하는 인플루언서 요약 정보를 전달한다.
 *
 * @param influencerId 인플루언서 사용자 식별자
 * @param influencerName 인플루언서 활동명
 * @param profileImageUrl 인플루언서 프로필 이미지 URL
 * @param introduction 인플루언서 소개
 * @param followedAt 팔로우한 시각
 */
public record FollowingSummaryResponse(
        Long influencerId,
        String influencerName,
        String profileImageUrl,
        String introduction,
        LocalDateTime followedAt
) {

    /**
     * 팔로우 관계와 공개 프로필을 인플루언서 요약 응답으로 변환한다.
     *
     * @param following 팔로우 관계
     * @param profile 인플루언서 공개 프로필
     * @return 인플루언서 요약 응답
     */
    public static FollowingSummaryResponse from(Following following, InfluencerProfile profile) {
        User influencer = following.getFollowedInfluencer();
        return new FollowingSummaryResponse(
                influencer.getId(),
                profile.getActivityName(),
                influencer.getProfileImageUrl(),
                profile.getIntroduction(),
                following.getCreatedAt()
        );
    }
}
