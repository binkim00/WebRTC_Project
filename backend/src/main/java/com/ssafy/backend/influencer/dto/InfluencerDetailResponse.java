package com.ssafy.backend.influencer.dto;

import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.user.domain.User;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 인플루언서 공개 상세 정보를 전달한다.
 *
 * @param influencerId 인플루언서 사용자 식별자
 * @param activityName 인플루언서 활동명
 * @param introduction 인플루언서 소개
 * @param profileImageUrl 인플루언서 프로필 이미지 URL
 * @param bannerImageUrl 인플루언서 배너 이미지 URL
 * @param category 인플루언서 활동 분야
 * @param socialUrl 인플루언서 외부 채널 URL
 * @param followerCount 현재 팔로워 수
 * @param isFollowing 조회한 팬의 팔로우 여부이며 비로그인 사용자는 false
 * @param upcomingMeetings 공개된 진행 예정·진행 중 팬미팅 목록
 */
public record InfluencerDetailResponse(
        Long influencerId,
        String activityName,
        String introduction,
        String profileImageUrl,
        String bannerImageUrl,
        String category,
        String socialUrl,
        long followerCount,
        boolean isFollowing,
        List<UpcomingMeetingResponse> upcomingMeetings
) {

    /**
     * 공개 프로필과 집계 값, 공개 팬미팅을 상세 응답으로 변환한다.
     *
     * @param profile 인플루언서 공개 프로필
     * @param followerCount 현재 팔로워 수
     * @param following 조회한 팬의 팔로우 여부
     * @param meetings 공개 대상 팬미팅 목록
     * @return 인플루언서 상세 응답
     */
    public static InfluencerDetailResponse of(
            InfluencerProfile profile, long followerCount, boolean following, List<FanMeeting> meetings
    ) {
        User influencer = profile.getUser();
        return new InfluencerDetailResponse(
                influencer.getId(),
                profile.getActivityName(),
                profile.getIntroduction(),
                influencer.getProfileImageUrl(),
                profile.getBannerImageUrl(),
                profile.getCategory(),
                profile.getSocialUrl(),
                followerCount,
                following,
                meetings.stream().map(UpcomingMeetingResponse::from).toList()
        );
    }

    /**
     * 인플루언서 상세에 노출하는 공개 팬미팅 요약이다.
     *
     * @param meetingId 팬미팅 식별자
     * @param title 팬미팅 제목
     * @param coverImageUrl 팬미팅 대표 이미지 URL
     * @param status 팬미팅 진행 상태
     * @param scheduledStartAt 팬미팅 예정 시작 시각
     */
    public record UpcomingMeetingResponse(
            Long meetingId,
            String title,
            String coverImageUrl,
            FanMeetingStatus status,
            LocalDateTime scheduledStartAt
    ) {

        /**
         * 팬미팅 엔티티를 공개 요약으로 변환한다.
         *
         * @param meeting 공개 대상 팬미팅
         * @return 팬미팅 공개 요약
         */
        public static UpcomingMeetingResponse from(FanMeeting meeting) {
            return new UpcomingMeetingResponse(
                    meeting.getId(),
                    meeting.getTitle(),
                    meeting.getCoverImageUrl(),
                    meeting.getStatus(),
                    meeting.getScheduledStartAt()
            );
        }
    }
}
