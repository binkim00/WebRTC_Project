package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.user.domain.User;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

/**
 * 팬이 팔로우하는 인플루언서 요약 정보를 전달한다.
 *
 * @param influencerId 인플루언서 사용자 식별자
 * @param influencerName 인플루언서 활동명이며 공개 프로필이 없으면 계정 닉네임
 * @param profileImageUrl 인플루언서 프로필 이미지 URL
 * @param introduction 인플루언서 소개이며 공개 프로필이 없으면 null
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
     * <p>탐색 목록이 프로필을 등록하지 않은 인플루언서까지 노출하므로 그 대상도 팔로우될 수 있다.
     * 프로필이 없다고 목록 조회를 실패시키면 한 명 때문에 팔로잉 목록 전체가 막히므로, 탐색 목록과
     * 같은 규칙으로 닉네임을 대신 표시한다.
     *
     * @param following 팔로우 관계
     * @param profile 인플루언서 공개 프로필이며 아직 등록하지 않았으면 null
     * @return 인플루언서 요약 응답
     */
    public static FollowingSummaryResponse from(Following following, InfluencerProfile profile) {
        User influencer = following.getFollowedInfluencer();
        return new FollowingSummaryResponse(
                influencer.getId(),
                displayName(profile, influencer),
                influencer.getProfileImageUrl(),
                profile == null ? null : profile.getIntroduction(),
                following.getCreatedAt()
        );
    }

    /**
     * 화면에 표시할 이름을 정한다.
     * 공개 프로필을 아직 등록하지 않은 인플루언서는 활동명이 없으므로 계정 닉네임으로 대체한다.
     *
     * @param profile 인플루언서 공개 프로필이며 아직 등록하지 않았으면 null
     * @param influencer 인플루언서 계정
     * @return 활동명이 있으면 활동명, 없으면 계정 닉네임
     */
    static String displayName(InfluencerProfile profile, User influencer) {
        return profile != null && StringUtils.hasText(profile.getActivityName())
                ? profile.getActivityName()
                : influencer.getNickname();
    }
}
