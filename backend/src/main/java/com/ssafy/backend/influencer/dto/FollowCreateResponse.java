package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.Following;

import java.time.LocalDateTime;

/**
 * 인플루언서 팔로우 생성 결과를 전달한다.
 *
 * @param influencerId 팔로우한 인플루언서 사용자 식별자
 * @param isFollowing 현재 팔로우 여부
 * @param followedAt 팔로우한 시각
 * @param followerCount 인플루언서의 현재 팔로워 수
 */
public record FollowCreateResponse(
        Long influencerId,
        boolean isFollowing,
        LocalDateTime followedAt,
        long followerCount
) {

    /**
     * 저장된 팔로우 관계를 생성 응답으로 변환한다.
     *
     * @param following 저장된 팔로우 관계
     * @param followerCount 인플루언서의 현재 팔로워 수
     * @return 팔로우 생성 응답
     */
    public static FollowCreateResponse from(Following following, long followerCount) {
        return new FollowCreateResponse(
                following.getFollowedInfluencer().getId(),
                true,
                following.getCreatedAt(),
                followerCount
        );
    }
}
