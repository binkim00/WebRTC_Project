package com.ssafy.backend.influencer.dto;

/**
 * 인플루언서 팔로우 취소 결과를 전달한다.
 *
 * @param influencerId 팔로우를 취소한 인플루언서 사용자 식별자
 * @param isFollowing 현재 팔로우 여부
 * @param followerCount 인플루언서의 현재 팔로워 수
 */
public record FollowDeleteResponse(
        Long influencerId,
        boolean isFollowing,
        long followerCount
) {
}
