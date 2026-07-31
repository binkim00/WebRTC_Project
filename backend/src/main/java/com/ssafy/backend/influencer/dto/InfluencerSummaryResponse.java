package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import org.springframework.util.StringUtils;

/**
 * 인플루언서 탐색 목록의 요약 항목을 전달한다.
 *
 * @param influencerId 인플루언서 사용자 식별자
 * @param influencerName 인플루언서 활동명이며 공개 프로필이 없으면 계정 닉네임
 * @param profileImageUrl 인플루언서 프로필 이미지 URL
 * @param introduction 인플루언서 소개이며 공개 프로필이 없으면 null
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
     * 조회 결과와 집계 값을 인플루언서 요약 응답으로 변환한다.
     *
     * @param view 계정과 공개 프로필을 함께 담은 조회 결과
     * @param followerCount 현재 팔로워 수
     * @param following 조회한 팬의 팔로우 여부
     * @return 인플루언서 요약 응답
     */
    public static InfluencerSummaryResponse of(
            InfluencerProfileRepository.InfluencerSummaryView view, long followerCount, boolean following
    ) {
        return new InfluencerSummaryResponse(
                view.getInfluencerId(),
                displayName(view),
                view.getProfileImageUrl(),
                view.getIntroduction(),
                followerCount,
                following
        );
    }

    /**
     * 화면에 표시할 이름을 정한다.
     * 공개 프로필을 아직 등록하지 않은 인플루언서는 활동명이 없으므로 계정 닉네임으로 대체한다.
     *
     * @param view 계정과 공개 프로필을 함께 담은 조회 결과
     * @return 활동명이 있으면 활동명, 없으면 계정 닉네임
     */
    static String displayName(InfluencerProfileRepository.InfluencerSummaryView view) {
        return StringUtils.hasText(view.getActivityName())
                ? view.getActivityName()
                : view.getNickname();
    }
}
