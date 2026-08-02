package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;

/**
 * 인플루언서를 팔로우하는 팬 요약 정보를 전달한다.
 *
 * @param fanId 팬 사용자 식별자
 * @param nickname 팬 닉네임
 * @param profileImageUrl 팬 프로필 이미지 URL
 * @param followedAt 팔로우한 시각
 */
public record FollowerSummaryResponse(
        Long fanId,
        String nickname,
        String profileImageUrl,
        LocalDateTime followedAt
) {

    /**
     * 팔로우 관계를 팬 요약 응답으로 변환한다.
     *
     * @param following 팔로우 관계
     * @return 팬 요약 응답
     */
    public static FollowerSummaryResponse from(Following following) {
        User fan = following.getFollower();
        return new FollowerSummaryResponse(
                fan.getId(),
                fan.getNickname(),
                fan.getProfileImageUrl(),
                following.getCreatedAt()
        );
    }
}
