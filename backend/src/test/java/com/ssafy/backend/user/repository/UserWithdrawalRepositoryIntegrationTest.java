package com.ssafy.backend.user.repository;

import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 회원탈퇴(USER-003)가 새로 추가한 조회·삭제 쿼리를 실제 JPA 실행으로 검증한다.
 * Mockito 단위 테스트로는 파생 쿼리와 JPQL의 정확성을 확인할 수 없어 별도로 둔다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:user-withdrawal;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class UserWithdrawalRepositoryIntegrationTest {

    private static final Set<FanMeetingStatus> BLOCKING_STATUSES = Set.of(
            FanMeetingStatus.PUBLISHED,
            FanMeetingStatus.APPLICATION_OPEN,
            FanMeetingStatus.APPLICATION_CLOSED,
            FanMeetingStatus.READY,
            FanMeetingStatus.LIVE
    );

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @Autowired
    private InfluencerProfileRepository influencerProfileRepository;

    @Autowired
    private EntityManager entityManager;

    private User influencer;
    private User manager;
    private User fan;

    @BeforeEach
    void setUp() {
        influencer = saveUser("withdraw-influencer", UserRole.INFLUENCER, UserStatus.ACTIVE);
        manager = saveUser("withdraw-manager", UserRole.MANAGER, UserStatus.ACTIVE);
        fan = saveUser("withdraw-fan", UserRole.FAN, UserStatus.ACTIVE);
        entityManager.flush();
    }

    /** 주최 인플루언서와 배정 매니저 모두 운영 중으로 판정되는지 검증한다. */
    @Test
    void detectsOperatingMeetingForInfluencerAndManager() {
        saveMeeting(FanMeetingStatus.APPLICATION_OPEN, null);

        assertThat(fanMeetingRepository.existsOperatingMeeting(influencer.getId(), BLOCKING_STATUSES))
                .isTrue();
        assertThat(fanMeetingRepository.existsOperatingMeeting(manager.getId(), BLOCKING_STATUSES))
                .isTrue();
    }

    /** 팬은 참가 대상일 뿐이라 운영 중으로 판정되지 않는지 검증한다. */
    @Test
    void doesNotDetectOperatingMeetingForFan() {
        saveMeeting(FanMeetingStatus.LIVE, null);

        assertThat(fanMeetingRepository.existsOperatingMeeting(fan.getId(), BLOCKING_STATUSES))
                .isFalse();
    }

    /** 초안·종료·취소 회차는 운영 책임이 없어 차단 대상에서 빠지는지 검증한다. */
    @Test
    void ignoresDraftEndedAndCanceledMeetings() {
        saveMeeting(FanMeetingStatus.DRAFT, null);
        saveMeeting(FanMeetingStatus.ENDED, null);
        saveMeeting(FanMeetingStatus.CANCELED, null);

        assertThat(fanMeetingRepository.existsOperatingMeeting(influencer.getId(), BLOCKING_STATUSES))
                .isFalse();
    }

    /** 소프트 삭제된 팬미팅이 차단 대상에서 빠지는지 검증한다. */
    @Test
    void ignoresSoftDeletedMeeting() {
        saveMeeting(FanMeetingStatus.READY, LocalDateTime.of(2026, 8, 1, 10, 0));

        assertThat(fanMeetingRepository.existsOperatingMeeting(influencer.getId(), BLOCKING_STATUSES))
                .isFalse();
    }

    /** 역할과 상태를 함께 만족하는 회원만 집계하는지 검증한다. */
    @Test
    void countsActiveAdminsOnly() {
        saveUser("withdraw-admin", UserRole.ADMIN, UserStatus.ACTIVE);
        saveUser("withdraw-admin-gone", UserRole.ADMIN, UserStatus.WITHDRAWN);
        entityManager.flush();

        assertThat(userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).isEqualTo(1L);
    }

    /** 공개 프로필 행이 사용자 식별자로 삭제되는지 검증한다. */
    @Test
    void deletesInfluencerProfileByUserId() {
        InfluencerProfile profile = BeanUtils.instantiateClass(InfluencerProfile.class);
        ReflectionTestUtils.setField(profile, "user", influencer);
        ReflectionTestUtils.setField(profile, "activityName", "가수 알파");
        influencerProfileRepository.save(profile);
        entityManager.flush();

        influencerProfileRepository.deleteByUser_Id(influencer.getId());
        entityManager.flush();

        assertThat(influencerProfileRepository.findAllByUser_IdIn(Set.of(influencer.getId()))).isEmpty();
    }

    /** 지정한 상태와 삭제 시각을 가진 팬미팅을 저장한다. */
    private FanMeeting saveMeeting(FanMeetingStatus status, LocalDateTime deletedAt) {
        FanMeeting meeting = FanMeeting.create(null, manager, influencer, "테스트 팬미팅",
                null, null, LocalDateTime.of(2026, 9, 1, 19, 0));
        ReflectionTestUtils.setField(meeting, "status", status);
        ReflectionTestUtils.setField(meeting, "deletedAt", deletedAt);
        fanMeetingRepository.save(meeting);
        entityManager.flush();
        return meeting;
    }

    /** 지정한 역할과 상태를 가진 사용자를 저장한다. */
    private User saveUser(String loginId, UserRole role, UserStatus status) {
        User user = User.createActive(loginId, loginId + "@example.com", "encoded", loginId,
                role, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "status", status);
        return userRepository.save(user);
    }
}
