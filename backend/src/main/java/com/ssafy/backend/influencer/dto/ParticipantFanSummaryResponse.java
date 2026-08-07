package com.ssafy.backend.influencer.dto;

import java.time.LocalDateTime;

/**
 * 인플루언서가 개최한 팬미팅에 참가한 팬의 요약 정보와 참여 집계를 전달한다.
 *
 * <p>같은 팬이 여러 회차에 참가했어도 한 건으로 합쳐지며, 참여 시각은 팬미팅 개최일을 기준으로
 * 계산한다. 실제 시작 시각이 없는 팬미팅은 예정 시작 시각을 사용한다. 팔로우 관계와 무관하게
 * 참가 이력만으로 집계하므로 팔로워 목록과는 결과가 다르다.
 *
 * @param fanId 팬 사용자 식별자
 * @param nickname 팬 닉네임
 * @param profileImageUrl 팬 프로필 이미지 URL이며 등록하지 않았으면 null
 * @param participatedMeetingCount 참가한 팬미팅 수이며 중복 참가를 합치지 않고 회차 수로 센다
 * @param firstParticipatedAt 가장 먼저 참가한 팬미팅의 개최일
 * @param lastParticipatedAt 가장 최근에 참가한 팬미팅의 개최일
 */
public record ParticipantFanSummaryResponse(
        Long fanId,
        String nickname,
        String profileImageUrl,
        long participatedMeetingCount,
        LocalDateTime firstParticipatedAt,
        LocalDateTime lastParticipatedAt
) {
}
