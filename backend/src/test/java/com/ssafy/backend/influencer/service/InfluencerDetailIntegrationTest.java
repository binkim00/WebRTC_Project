package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.influencer.dto.InfluencerDetailResponse;
import com.ssafy.backend.influencer.dto.MeetingSummaryResponse;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
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
import java.util.List;

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

    private static final LocalDateTime BASE = LocalDateTime.of(2026, 8, 1, 12, 0);

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
    private MeetingApplicationSettingRepository meetingApplicationSettingRepository;

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
        assertThat(response.influencerName()).isEqualTo("상세 인플루언서");
        assertThat(response.introduction()).isEqualTo("상세 소개");
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

    /**
     * 예정·진행 팬미팅 뒤에 종료 이력이 이어지고, 비공개 팬미팅은 어느 구간에도 없는지 검증한다.
     * 종료 이력 노출 정책이 확정되기 전에는 ENDED 제외를 검증하던 케이스를 이 검증으로 대체했다.
     */
    @Test
    void exposesUpcomingThenPastMeetingsAndHidesPrivateOnes() {
        FanMeeting live = saveMeeting("진행 중", FanMeetingStatus.LIVE, BASE.plusDays(1), false);
        FanMeeting open = saveMeeting("응모 중", FanMeetingStatus.APPLICATION_OPEN, BASE.plusDays(2), false);
        FanMeeting recentlyEnded = saveMeeting("최근 종료", FanMeetingStatus.ENDED, BASE.minusDays(1), false);
        FanMeeting longAgoEnded = saveMeeting("예전 종료", FanMeetingStatus.ENDED, BASE.minusDays(10), false);
        saveMeeting("초안", FanMeetingStatus.DRAFT, BASE.plusDays(3), false);
        saveMeeting("취소", FanMeetingStatus.CANCELED, BASE.plusDays(4), false);
        saveMeeting("삭제된 예정", FanMeetingStatus.READY, BASE.plusDays(5), true);
        saveMeeting("삭제된 종료", FanMeetingStatus.ENDED, BASE.minusDays(2), true);
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        // 예정은 가까운 순, 종료는 최근 순으로 이어 붙는다.
        assertThat(response.meetings()).extracting(MeetingSummaryResponse::meetingId)
                .containsExactly(live.getId(), open.getId(),
                        recentlyEnded.getId(), longAgoEnded.getId());
        assertThat(response.meetings()).extracting(MeetingSummaryResponse::title)
                .doesNotContain("초안", "취소", "삭제된 예정", "삭제된 종료");
    }

    /** 종료 팬미팅이 상태와 함께 목록에 포함되는지 검증한다. */
    @Test
    void includesEndedMeetingWithStatus() {
        FanMeeting ended = saveMeeting("종료된 팬미팅", FanMeetingStatus.ENDED, BASE.minusDays(3), false);
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.meetings()).singleElement().satisfies(meeting -> {
            assertThat(meeting.meetingId()).isEqualTo(ended.getId());
            assertThat(meeting.status()).isEqualTo(FanMeetingStatus.ENDED);
            assertThat(meeting.title()).isEqualTo("종료된 팬미팅");
        });
    }

    /** 종료 이력이 상한을 넘으면 최근 건만 남는지 검증한다. */
    @Test
    void limitsPastMeetingsToMostRecent() {
        for (int index = 1; index <= 13; index++) {
            saveMeeting("종료 " + index, FanMeetingStatus.ENDED, BASE.minusDays(index), false);
        }
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.meetings()).hasSize(10);
        assertThat(response.meetings()).extracting(MeetingSummaryResponse::title)
                .containsExactly("종료 1", "종료 2", "종료 3", "종료 4", "종료 5",
                        "종료 6", "종료 7", "종료 8", "종료 9", "종료 10")
                .doesNotContain("종료 11", "종료 12", "종료 13");
    }

    /** 종료 이력이 없으면 예정 팬미팅만 반환되는지 검증한다. */
    @Test
    void returnsOnlyUpcomingWhenNoPastMeetingExists() {
        FanMeeting ready = saveMeeting("예정", FanMeetingStatus.READY, BASE.plusDays(1), false);
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.meetings()).extracting(MeetingSummaryResponse::meetingId)
                .containsExactly(ready.getId());
    }

    /** 공개 팬미팅이 하나도 없으면 빈 배열을 반환하는지 검증한다. */
    @Test
    void returnsEmptyMeetingsWhenNothingPublic() {
        saveMeeting("초안", FanMeetingStatus.DRAFT, BASE.plusDays(1), false);
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.meetings()).isEmpty();
    }

    /** 응모 설정이 있으면 응모 기간이 함께 노출되는지 검증한다. */
    @Test
    void exposesApplicationPeriodWhenSettingExists() {
        FanMeeting meeting = saveMeeting("응모 있는 팬미팅",
                FanMeetingStatus.APPLICATION_OPEN, BASE.plusDays(1), false);
        saveApplicationSetting(meeting, BASE.minusDays(5), BASE.minusDays(1));
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.meetings()).singleElement().satisfies(item -> {
            assertThat(item.applicationStartAt()).isEqualTo(BASE.minusDays(5));
            assertThat(item.applicationEndAt()).isEqualTo(BASE.minusDays(1));
        });
    }

    /** 응모 설정이 없는 팬미팅은 응모 기간이 null로 나가는지 검증한다. */
    @Test
    void leavesApplicationPeriodNullWhenSettingMissing() {
        saveMeeting("응모 없는 팬미팅", FanMeetingStatus.READY, BASE.plusDays(1), false);
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.meetings()).singleElement().satisfies(item -> {
            assertThat(item.applicationStartAt()).isNull();
            assertThat(item.applicationEndAt()).isNull();
        });
    }

    /** 다른 인플루언서의 팬미팅이 상세 응답에 섞이지 않는지 검증한다. */
    @Test
    void excludesOtherInfluencersMeetings() {
        User other = saveUser("detail-other", UserRole.INFLUENCER, UserStatus.ACTIVE);
        FanMeeting mine = saveMeeting("내 팬미팅", FanMeetingStatus.READY, BASE.plusDays(1), false);
        fanMeetingRepository.saveAndFlush(
                meeting(other, "남의 팬미팅", FanMeetingStatus.READY, BASE.plusDays(2), false));
        entityManager.flush();

        InfluencerDetailResponse response =
                influencerQueryService.getInfluencer(influencer.getId(), null);

        assertThat(response.meetings()).extracting(MeetingSummaryResponse::meetingId)
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

    /** 팬미팅에 응모 기간 설정을 저장한다. */
    private void saveApplicationSetting(FanMeeting meeting, LocalDateTime openAt, LocalDateTime closeAt) {
        meetingApplicationSettingRepository.saveAndFlush(MeetingApplicationSetting.create(
                meeting, true, openAt, closeAt, closeAt.plusDays(1), 10
        ));
    }
}
