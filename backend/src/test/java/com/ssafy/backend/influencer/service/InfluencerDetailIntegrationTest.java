package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.influencer.dto.InfluencerDetailResponse;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:influencer-detail;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef"
})
@Transactional
class InfluencerDetailIntegrationTest {

    @Autowired
    private InfluencerQueryService influencerQueryService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FollowingRepository followingRepository;

    @Autowired
    private InfluencerProfileRepository influencerProfileRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @Autowired
    private EntityManager entityManager;

    private User fan;
    private User influencer;

    @BeforeEach
    void setUp() {
        fan = saveUser("detail-fan", UserRole.FAN, UserStatus.ACTIVE);
        influencer = saveUser("detail-influencer", UserRole.INFLUENCER, UserStatus.ACTIVE);
        saveProfile(influencer);
        entityManager.flush();
    }

    /** 비로그인 사용자가 공개 프로필과 팔로워 수를 조회하는지 검증한다. */
    @Test
    void returnsPublicProfileForAnonymousUser() {
        followingRepository.saveAndFlush(Following.follow(fan, influencer));
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.influencerId()).isEqualTo(influencer.getId());
        assertThat(response.activityName()).isEqualTo("상세 인플루언서");
        assertThat(response.introduction()).isEqualTo("상세 소개");
        assertThat(response.category()).isEqualTo("MUSIC");
        assertThat(response.socialUrl()).isEqualTo("https://social.example.com");
        assertThat(response.followerCount()).isEqualTo(1L);
        assertThat(response.isFollowing()).isFalse();
    }

    /** 로그인한 팬의 팔로우 여부가 상세 응답에 반영되는지 검증한다. */
    @Test
    void marksFollowingForAuthenticatedFan() {
        followingRepository.saveAndFlush(Following.follow(fan, influencer));
        entityManager.flush();

        InfluencerDetailResponse response = influencerQueryService.getInfluencer(
                influencer.getId(), new AuthenticatedUser(fan.getId(), UserRole.FAN)
        );

        assertThat(response.isFollowing()).isTrue();
    }

    /** 공개 상태 팬미팅만 예정 시각 순으로 노출되는지 검증한다. */
    @Test
    void exposesOnlyPublicMeetingsInScheduleOrder() {
        LocalDateTime base = LocalDateTime.of(2026, 8, 1, 12, 0);
        FanMeeting live = saveMeeting("진행 중", FanMeetingStatus.LIVE, base.plusDays(1), false);
        FanMeeting open = saveMeeting("응모 중", FanMeetingStatus.APPLICATION_OPEN, base.plusDays(2), false);
        saveMeeting("초안", FanMeetingStatus.DRAFT, base.plusDays(3), false);
        saveMeeting("취소", FanMeetingStatus.CANCELED, base.plusDays(4), false);
        saveMeeting("종료", FanMeetingStatus.ENDED, base.plusDays(5), false);
        saveMeeting("삭제", FanMeetingStatus.READY, base.plusDays(6), true);
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.upcomingMeetings())
                .extracting(InfluencerDetailResponse.UpcomingMeetingResponse::meetingId)
                .containsExactly(live.getId(), open.getId());
        assertThat(response.upcomingMeetings())
                .extracting(InfluencerDetailResponse.UpcomingMeetingResponse::title)
                .containsExactly("진행 중", "응모 중");
    }

    /** 다른 인플루언서의 팬미팅이 상세 응답에 섞이지 않는지 검증한다. */
    @Test
    void excludesOtherInfluencersMeetings() {
        User other = saveUser("detail-other", UserRole.INFLUENCER, UserStatus.ACTIVE);
        FanMeeting mine = saveMeeting("내 팬미팅", FanMeetingStatus.READY,
                LocalDateTime.of(2026, 8, 2, 12, 0), false);
        fanMeetingRepository.saveAndFlush(meeting(other, "남의 팬미팅", FanMeetingStatus.READY,
                LocalDateTime.of(2026, 8, 3, 12, 0), false));
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.upcomingMeetings())
                .extracting(InfluencerDetailResponse.UpcomingMeetingResponse::meetingId)
                .containsExactly(mine.getId());
    }

    /** 존재하지 않는 인플루언서 조회가 거부되는지 검증한다. */
    @Test
    void rejectsUnknownInfluencer() {
        assertThatThrownBy(() -> influencerQueryService.getInfluencer(999_999L, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INFLUENCER_NOT_FOUND));
    }

    /** 탈퇴한 인플루언서 조회가 거부되는지 검증한다. */
    @Test
    void rejectsWithdrawnInfluencer() {
        User withdrawn = saveUser("detail-withdrawn", UserRole.INFLUENCER, UserStatus.WITHDRAWN);
        saveProfile(withdrawn);
        entityManager.flush();

        assertThatThrownBy(() -> influencerQueryService.getInfluencer(withdrawn.getId(), null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INFLUENCER_NOT_FOUND));
    }

    /** 팬 역할 사용자를 인플루언서로 조회하려는 요청이 거부되는지 검증한다. */
    @Test
    void rejectsFanAsInfluencer() {
        assertThatThrownBy(() -> influencerQueryService.getInfluencer(fan.getId(), null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INFLUENCER_NOT_FOUND));
    }

    /** 통합 테스트에 사용할 사용자를 지정한 상태로 저장한다. */
    private User saveUser(String loginId, UserRole role, UserStatus status) {
        User user = User.createActive(
                loginId, loginId + "@example.com", "encoded-password", loginId, role, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(user, "status", status);
        return userRepository.saveAndFlush(user);
    }

    /** 통합 테스트에 사용할 인플루언서 공개 프로필을 저장한다. */
    private void saveProfile(User owner) {
        InfluencerProfile profile = BeanUtils.instantiateClass(InfluencerProfile.class);
        ReflectionTestUtils.setField(profile, "user", owner);
        ReflectionTestUtils.setField(profile, "activityName", "상세 인플루언서");
        ReflectionTestUtils.setField(profile, "introduction", "상세 소개");
        ReflectionTestUtils.setField(profile, "category", "MUSIC");
        ReflectionTestUtils.setField(profile, "bannerImageUrl", "https://banner.example.com/1.png");
        ReflectionTestUtils.setField(profile, "socialUrl", "https://social.example.com");
        influencerProfileRepository.saveAndFlush(profile);
    }

    /** 기준 인플루언서의 팬미팅을 저장한다. */
    private FanMeeting saveMeeting(
            String title, FanMeetingStatus status, LocalDateTime scheduledStartAt, boolean deleted
    ) {
        return fanMeetingRepository.saveAndFlush(
                meeting(influencer, title, status, scheduledStartAt, deleted));
    }

    /** 지정한 상태와 삭제 여부를 가진 팬미팅을 생성한다. */
    private FanMeeting meeting(
            User owner, String title, FanMeetingStatus status,
            LocalDateTime scheduledStartAt, boolean deleted
    ) {
        FanMeeting fanMeeting = FanMeeting.create(
                null, null, owner, title, "설명", null, scheduledStartAt);
        ReflectionTestUtils.setField(fanMeeting, "status", status);
        if (deleted) {
            ReflectionTestUtils.setField(fanMeeting, "deletedAt", LocalDateTime.of(2026, 7, 30, 0, 0));
        }
        return fanMeeting;
    }
}
