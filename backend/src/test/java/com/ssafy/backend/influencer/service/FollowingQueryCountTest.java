package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.service.CallSessionExpirationScheduler;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.influencer.dto.FollowingSummaryResponse;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.service.MeetingApplicationOpeningScheduler;
import com.ssafy.backend.recording.egress.RecordingEgressRecoveryService;
import com.ssafy.backend.recording.service.RecordingExpirationScheduler;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:following-query-count;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.sql.init.mode=never",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef"
})
@Transactional
class FollowingQueryCountTest {

    /*
     * SchedulingConfig의 전역 @EnableScheduling 때문에 이 컨텍스트에서도 배치 잡이 함께 뜬다.
     * 기본 스케줄러 풀은 스레드 1개라 1초 주기 잡에 밀린 다른 잡의 첫 실행이 측정 구간으로 들어오면,
     * 팔로잉 조회와 무관한 SQL이 Hibernate 통계에 섞여 이 테스트가 무작위로 깨진다.
     * 실제로 녹화 만료 잡의 조회가 섞여 4건으로 측정된 적이 있어 스케줄러 빈을 목으로 대체한다.
     */
    @MockitoBean
    private CallSessionExpirationScheduler callSessionExpirationScheduler;

    @MockitoBean
    private MeetingApplicationOpeningScheduler meetingApplicationOpeningScheduler;

    @MockitoBean
    private RecordingExpirationScheduler recordingExpirationScheduler;

    @MockitoBean
    private RecordingEgressRecoveryService recordingEgressRecoveryService;

    @Autowired
    private FollowingService followingService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FollowingRepository followingRepository;

    @Autowired
    private InfluencerProfileRepository influencerProfileRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    /** 여러 팔로잉을 조회해도 사용자·프로필 조회가 N+1로 증가하지 않는지 실제 SQL 수로 검증한다. */
    @Test
    void getsFollowingsWithoutNPlusOneQueries() {
        User fan = saveUser("query-fan", UserRole.FAN);
        List<Following> followings = new ArrayList<>();
        List<Long> influencerIds = new ArrayList<>();
        for (int index = 1; index <= 3; index++) {
            User influencer = saveUser("query-influencer-" + index, UserRole.INFLUENCER);
            influencerIds.add(influencer.getId());
            influencerProfileRepository.save(profile(influencer, "활동명 " + index));
            followings.add(Following.follow(fan, influencer));
        }
        followingRepository.saveAllAndFlush(followings);
        influencerProfileRepository.flush();
        entityManager.clear();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        PageResponse<FollowingSummaryResponse> response = followingService.getMyFollowings(
                0, 20, new AuthenticatedUser(fan.getId(), UserRole.FAN)
        );

        assertThat(response.content()).extracting(FollowingSummaryResponse::influencerId)
                .containsExactly(influencerIds.get(2), influencerIds.get(1), influencerIds.get(0));
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(3L);
    }

    /** 통합 테스트에 사용할 활성 사용자를 저장한다. */
    private User saveUser(String loginId, UserRole role) {
        return userRepository.saveAndFlush(User.createActive(
                loginId,
                loginId + "@example.com",
                "encoded-password",
                loginId,
                role,
                PreferredLanguage.KOREAN
        ));
    }

    /** 통합 테스트에 사용할 인플루언서 공개 프로필을 생성한다. */
    private InfluencerProfile profile(User influencer, String activityName) {
        InfluencerProfile profile = BeanUtils.instantiateClass(InfluencerProfile.class);
        ReflectionTestUtils.setField(profile, "user", influencer);
        ReflectionTestUtils.setField(profile, "activityName", activityName);
        ReflectionTestUtils.setField(profile, "introduction", "소개");
        return profile;
    }
}
