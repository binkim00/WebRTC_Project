package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.influencer.dto.InfluencerSummaryResponse;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:influencer-query;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class InfluencerQueryIntegrationTest {

    @Autowired
    private InfluencerService influencerService;

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

    private User fan;
    private User singer;
    private User dancer;

    @BeforeEach
    void setUp() {
        fan = saveUser("discovery-fan", UserRole.FAN, UserStatus.ACTIVE);
        singer = saveUser("discovery-singer", UserRole.INFLUENCER, UserStatus.ACTIVE);
        dancer = saveUser("discovery-dancer", UserRole.SOLO_INFLUENCER, UserStatus.ACTIVE);
        saveProfile(singer, "가수 알파", "노래하는 사람", "MUSIC");
        saveProfile(dancer, "댄서 베타", "춤추는 사람", "DANCE");
        entityManager.flush();
    }

    /** 비로그인 사용자가 활성 인플루언서 목록을 최신순으로 조회하는지 검증한다. */
    @Test
    void returnsActiveInfluencersForAnonymousUser() {
        PageResponse<InfluencerSummaryResponse> response =
                influencerService.getInfluencers(0, 20, null, null);

        assertThat(response.content()).extracting(InfluencerSummaryResponse::influencerId)
                .containsExactly(dancer.getId(), singer.getId());
        assertThat(response.content()).extracting(InfluencerSummaryResponse::isFollowing)
                .containsOnly(false);
        assertThat(response.totalElements()).isEqualTo(2L);
    }

    /** 탈퇴·정지 사용자의 프로필이 목록에서 제외되는지 검증한다. */
    @Test
    void excludesWithdrawnAndSuspendedInfluencers() {
        User withdrawn = saveUser("discovery-withdrawn", UserRole.INFLUENCER, UserStatus.WITHDRAWN);
        User suspended = saveUser("discovery-suspended", UserRole.INFLUENCER, UserStatus.SUSPENDED);
        saveProfile(withdrawn, "탈퇴 감마", "탈퇴한 사람", "MUSIC");
        saveProfile(suspended, "정지 델타", "정지된 사람", "MUSIC");
        entityManager.flush();

        PageResponse<InfluencerSummaryResponse> response =
                influencerService.getInfluencers(0, 20, null, null);

        assertThat(response.content()).extracting(InfluencerSummaryResponse::influencerId)
                .containsExactly(dancer.getId(), singer.getId());
    }

    /**
     * 공개 프로필을 아직 등록하지 않은 인플루언서도 목록에 노출되는지 검증한다.
     * 노출 여부는 프로필이 아니라 계정 상태·역할로 판단한다.
     */
    @Test
    void includesInfluencerWithoutProfileUsingNickname() {
        User noProfile = saveUser("discovery-no-profile", UserRole.INFLUENCER, UserStatus.ACTIVE);
        entityManager.flush();

        PageResponse<InfluencerSummaryResponse> response =
                influencerService.getInfluencers(0, 20, null, null);

        assertThat(response.content()).extracting(InfluencerSummaryResponse::influencerId)
                .contains(noProfile.getId());
        assertThat(response.content())
                .filteredOn(summary -> summary.influencerId().equals(noProfile.getId()))
                .singleElement()
                .satisfies(summary -> {
                    // 활동명이 없으므로 계정 닉네임으로 대체된다.
                    assertThat(summary.influencerName()).isEqualTo("discovery-no-profile");
                    assertThat(summary.introduction()).isNull();
                });
    }

    /** 프로필이 없는 인플루언서도 닉네임으로 검색되는지 검증한다. */
    @Test
    void findsInfluencerWithoutProfileByNickname() {
        User noProfile = saveUser("discovery-no-profile", UserRole.INFLUENCER, UserStatus.ACTIVE);
        entityManager.flush();

        PageResponse<InfluencerSummaryResponse> response =
                influencerService.getInfluencers(0, 20, "no-profile", null);

        assertThat(response.content()).extracting(InfluencerSummaryResponse::influencerId)
                .containsExactly(noProfile.getId());
    }

    /** 인플루언서가 아닌 역할은 프로필 유무와 무관하게 제외되는지 검증한다. */
    @Test
    void excludesNonInfluencerRoles() {
        PageResponse<InfluencerSummaryResponse> response =
                influencerService.getInfluencers(0, 20, null, null);

        // setUp에서 만든 팬 계정은 목록에 없어야 한다.
        assertThat(response.content()).extracting(InfluencerSummaryResponse::influencerId)
                .doesNotContain(fan.getId());
    }

    /** 로그인한 팬의 팔로우 여부와 인플루언서별 팔로워 수가 각각 반영되는지 검증한다. */
    @Test
    void marksFollowingAndCountsFollowersPerInfluencer() {
        User otherFan = saveUser("discovery-other-fan", UserRole.FAN, UserStatus.ACTIVE);
        followingRepository.saveAllAndFlush(List.of(
                Following.follow(fan, singer),
                Following.follow(otherFan, singer)
        ));
        entityManager.flush();

        PageResponse<InfluencerSummaryResponse> response = influencerService.getInfluencers(
                0, 20, null, new AuthenticatedUser(fan.getId(), UserRole.FAN)
        );

        InfluencerSummaryResponse singerSummary = summaryOf(response, singer.getId());
        InfluencerSummaryResponse dancerSummary = summaryOf(response, dancer.getId());
        assertThat(singerSummary.followerCount()).isEqualTo(2L);
        assertThat(singerSummary.isFollowing()).isTrue();
        assertThat(dancerSummary.followerCount()).isZero();
        assertThat(dancerSummary.isFollowing()).isFalse();
    }

    /** 검색어가 활동명·소개·닉네임에 적용되는지 검증한다. */
    @Test
    void filtersByKeyword() {
        PageResponse<InfluencerSummaryResponse> byActivityName =
                influencerService.getInfluencers(0, 20, "댄서", null);
        PageResponse<InfluencerSummaryResponse> byIntroduction =
                influencerService.getInfluencers(0, 20, "노래하는", null);
        PageResponse<InfluencerSummaryResponse> byNickname =
                influencerService.getInfluencers(0, 20, "discovery-singer", null);

        assertThat(byActivityName.content()).extracting(InfluencerSummaryResponse::influencerId)
                .containsExactly(dancer.getId());
        assertThat(byIntroduction.content()).extracting(InfluencerSummaryResponse::influencerId)
                .containsExactly(singer.getId());
        assertThat(byNickname.content()).extracting(InfluencerSummaryResponse::influencerId)
                .containsExactly(singer.getId());
    }

    /** 검색 결과가 없으면 빈 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyPageWhenKeywordMatchesNothing() {
        PageResponse<InfluencerSummaryResponse> response =
                influencerService.getInfluencers(0, 20, "존재하지않는검색어", null);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }

    /** 인플루언서 수가 늘어나도 실행되는 SQL 수가 동일하게 유지되는지 검증한다. */
    @Test
    void keepsQueryCountConstantAsInfluencerCountGrows() {
        AuthenticatedUser principal = new AuthenticatedUser(fan.getId(), UserRole.FAN);
        followingRepository.saveAndFlush(Following.follow(fan, singer));
        entityManager.flush();

        long baseline = countQueriesFor(principal, 2);

        List<User> extras = new ArrayList<>();
        for (int index = 1; index <= 4; index++) {
            User extra = saveUser("discovery-extra-" + index, UserRole.INFLUENCER, UserStatus.ACTIVE);
            saveProfile(extra, "추가 인플루언서 " + index, "소개 " + index, "MUSIC");
            extras.add(extra);
        }
        followingRepository.saveAllAndFlush(
                extras.stream().map(extra -> Following.follow(fan, extra)).toList()
        );
        entityManager.flush();

        long grown = countQueriesFor(principal, 6);

        // 목록·팔로워 수 집계·팔로우 여부를 각각 한 번씩만 조회하므로 대상이 늘어도 SQL 수가 같아야 한다.
        assertThat(grown).isEqualTo(baseline);
    }

    /** 페이지 번호가 음수이거나 크기가 허용 범위를 벗어나면 요청이 거부되는지 검증한다. */
    @Test
    void rejectsOutOfRangePageRequest() {
        assertThat(catchInvalidRequest(-1, 20)).isTrue();
        assertThat(catchInvalidRequest(0, 0)).isTrue();
        assertThat(catchInvalidRequest(0, 101)).isTrue();
        assertThat(catchInvalidRequest(0, 100)).isFalse();
    }

    /**
     * 지정한 사용자로 목록을 조회하면서 실행된 SQL 수를 센다.
     *
     * @param principal 조회 주체
     * @param expectedSize 조회 결과로 기대하는 인플루언서 수
     * @return 조회 중 실행된 SQL 수
     */
    private long countQueriesFor(AuthenticatedUser principal, int expectedSize) {
        entityManager.clear();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        PageResponse<InfluencerSummaryResponse> response =
                influencerService.getInfluencers(0, 20, null, principal);

        assertThat(response.content()).hasSize(expectedSize);
        return statistics.getPrepareStatementCount();
    }

    /**
     * 잘못된 페이지 요청이 거부되는지 확인한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @return 요청이 거부되면 true
     */
    private boolean catchInvalidRequest(int page, int size) {
        try {
            influencerService.getInfluencers(page, size, null, null);
            return false;
        } catch (com.ssafy.backend.common.exception.BusinessException exception) {
            return exception.getErrorCode()
                    == com.ssafy.backend.common.exception.ErrorCode.INVALID_REQUEST;
        }
    }

    /**
     * 응답에서 특정 인플루언서의 요약 항목을 찾는다.
     *
     * @param response 목록 응답
     * @param influencerId 찾을 인플루언서 사용자 식별자
     * @return 해당 인플루언서의 요약 항목
     */
    private InfluencerSummaryResponse summaryOf(
            PageResponse<InfluencerSummaryResponse> response, Long influencerId
    ) {
        return response.content().stream()
                .filter(summary -> summary.influencerId().equals(influencerId))
                .findFirst()
                .orElseThrow();
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
    private void saveProfile(User influencer, String activityName, String introduction, String category) {
        InfluencerProfile profile = BeanUtils.instantiateClass(InfluencerProfile.class);
        ReflectionTestUtils.setField(profile, "user", influencer);
        ReflectionTestUtils.setField(profile, "activityName", activityName);
        ReflectionTestUtils.setField(profile, "introduction", introduction);
        ReflectionTestUtils.setField(profile, "category", category);
        influencerProfileRepository.saveAndFlush(profile);
    }
}
