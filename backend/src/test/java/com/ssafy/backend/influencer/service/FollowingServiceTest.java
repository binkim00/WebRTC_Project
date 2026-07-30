package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.domain.Following;
import com.ssafy.backend.influencer.domain.InfluencerProfile;
import com.ssafy.backend.influencer.dto.FollowCreateResponse;
import com.ssafy.backend.influencer.dto.FollowDeleteResponse;
import com.ssafy.backend.influencer.dto.FollowerSummaryResponse;
import com.ssafy.backend.influencer.dto.FollowingSummaryResponse;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FollowingServiceTest {

    private CurrentUserService currentUserService;
    private UserRepository userRepository;
    private FollowingRepository followingRepository;
    private InfluencerProfileRepository influencerProfileRepository;
    private FollowingService followingService;
    private AuthenticatedUser fanPrincipal;
    private User fan;
    private User influencer;

    /** 각 테스트에서 사용할 저장소 목과 기본 팬·인플루언서 사용자를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        userRepository = mock(UserRepository.class);
        followingRepository = mock(FollowingRepository.class);
        influencerProfileRepository = mock(InfluencerProfileRepository.class);
        followingService = new FollowingService(
                currentUserService,
                userRepository,
                followingRepository,
                influencerProfileRepository
        );
        fanPrincipal = new AuthenticatedUser(1L, UserRole.FAN);
        fan = user(1L, UserRole.FAN, UserStatus.ACTIVE, "팬");
        influencer = user(2L, UserRole.INFLUENCER, UserStatus.ACTIVE, "인플루언서");
        when(currentUserService.requireActiveUser(fanPrincipal)).thenReturn(fan);
        when(userRepository.findById(2L)).thenReturn(Optional.of(influencer));
    }

    /** 팬이 활성 인플루언서를 팔로우하고 생성 시각과 집계된 팔로워 수를 받는지 검증한다. */
    @Test
    void followsActiveInfluencer() {
        LocalDateTime followedAt = LocalDateTime.of(2026, 7, 30, 15, 0);
        when(followingRepository.existsByFollower_IdAndFollowedInfluencer_Id(1L, 2L))
                .thenReturn(false);
        when(followingRepository.saveAndFlush(any(Following.class))).thenAnswer(invocation -> {
            Following following = invocation.getArgument(0);
            ReflectionTestUtils.setField(following, "createdAt", followedAt);
            return following;
        });
        when(followingRepository.countByFollowedInfluencer_Id(2L)).thenReturn(3L);

        FollowCreateResponse response = followingService.follow(2L, fanPrincipal);

        assertThat(response.influencerId()).isEqualTo(2L);
        assertThat(response.isFollowing()).isTrue();
        assertThat(response.followedAt()).isEqualTo(followedAt);
        assertThat(response.followerCount()).isEqualTo(3L);
    }

    /** 팬이 활성 SOLO_INFLUENCER를 정상적으로 팔로우할 수 있는지 검증한다. */
    @Test
    void followsActiveSoloInfluencer() {
        User soloInfluencer = user(2L, UserRole.SOLO_INFLUENCER,
                UserStatus.ACTIVE, "솔로 인플루언서");
        when(userRepository.findById(2L)).thenReturn(Optional.of(soloInfluencer));
        when(followingRepository.existsByFollower_IdAndFollowedInfluencer_Id(1L, 2L))
                .thenReturn(false);
        when(followingRepository.saveAndFlush(any(Following.class))).thenAnswer(invocation -> {
            Following following = invocation.getArgument(0);
            ReflectionTestUtils.setField(following, "createdAt",
                    LocalDateTime.of(2026, 7, 30, 15, 0));
            return following;
        });
        when(followingRepository.countByFollowedInfluencer_Id(2L)).thenReturn(1L);

        FollowCreateResponse response = followingService.follow(2L, fanPrincipal);

        assertThat(response.influencerId()).isEqualTo(2L);
        assertThat(response.isFollowing()).isTrue();
        assertThat(response.followerCount()).isEqualTo(1L);
    }

    /** 이미 존재하는 팔로우 관계를 다시 생성하지 않고 충돌로 처리하는지 검증한다. */
    @Test
    void rejectsDuplicateFollow() {
        when(followingRepository.existsByFollower_IdAndFollowedInfluencer_Id(1L, 2L))
                .thenReturn(true);

        assertError(() -> followingService.follow(2L, fanPrincipal),
                ErrorCode.FOLLOW_ALREADY_EXISTS);
    }

    /** 동시 요청으로 DB 유니크 제약이 위반돼도 중복 팔로우 오류로 변환하는지 검증한다. */
    @Test
    void translatesConcurrentDuplicateFollow() {
        when(followingRepository.existsByFollower_IdAndFollowedInfluencer_Id(1L, 2L))
                .thenReturn(false);
        when(followingRepository.saveAndFlush(any(Following.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate"));

        assertError(() -> followingService.follow(2L, fanPrincipal),
                ErrorCode.FOLLOW_ALREADY_EXISTS);
    }

    /** 비활성 사용자나 인플루언서 역할이 아닌 사용자를 팔로우할 수 없는지 검증한다. */
    @Test
    void rejectsInvalidInfluencerTarget() {
        User inactive = user(2L, UserRole.INFLUENCER, UserStatus.SUSPENDED, "중지 계정");
        when(userRepository.findById(2L)).thenReturn(Optional.of(inactive));

        assertError(() -> followingService.follow(2L, fanPrincipal),
                ErrorCode.INFLUENCER_NOT_FOUND);
    }

    /** FAN과 MANAGER 역할 사용자를 팔로우 대상으로 지정할 수 없는지 검증한다. */
    @Test
    void rejectsFanAndManagerTargets() {
        for (UserRole targetRole : List.of(UserRole.FAN, UserRole.MANAGER)) {
            User invalidTarget = user(2L, targetRole, UserStatus.ACTIVE, "잘못된 대상");
            when(userRepository.findById(2L)).thenReturn(Optional.of(invalidTarget));
            assertError(() -> followingService.follow(2L, fanPrincipal),
                    ErrorCode.INFLUENCER_NOT_FOUND);
        }
    }

    /** 팬이 자기 자신을 팔로우하려는 요청을 거부하는지 검증한다. */
    @Test
    void rejectsSelfFollow() {
        assertError(() -> followingService.follow(1L, fanPrincipal),
                ErrorCode.SELF_FOLLOW_NOT_ALLOWED);
    }

    /** 팬 이외 역할 사용자의 팔로우 요청을 권한 오류로 거부하는지 검증한다. */
    @Test
    void rejectsFollowFromNonFan() {
        AuthenticatedUser managerPrincipal = new AuthenticatedUser(3L, UserRole.MANAGER);
        User manager = user(3L, UserRole.MANAGER, UserStatus.ACTIVE, "매니저");
        when(currentUserService.requireActiveUser(managerPrincipal))
                .thenReturn(manager);

        assertError(() -> followingService.follow(2L, managerPrincipal),
                ErrorCode.ACCESS_DENIED);
    }

    /** 기존 팔로우 관계를 삭제한 뒤 감소한 팔로워 수를 반환하는지 검증한다. */
    @Test
    void unfollowsInfluencer() {
        Following following = Following.follow(fan, influencer);
        when(followingRepository.findByFollower_IdAndFollowedInfluencer_Id(1L, 2L))
                .thenReturn(Optional.of(following));
        when(followingRepository.countByFollowedInfluencer_Id(2L)).thenReturn(2L);

        FollowDeleteResponse response = followingService.unfollow(2L, fanPrincipal);

        verify(followingRepository).delete(following);
        verify(followingRepository).flush();
        assertThat(response.isFollowing()).isFalse();
        assertThat(response.followerCount()).isEqualTo(2L);
    }

    /** 존재하지 않는 팔로우 관계의 취소 요청을 찾을 수 없음 오류로 처리하는지 검증한다. */
    @Test
    void rejectsMissingFollowOnUnfollow() {
        when(followingRepository.findByFollower_IdAndFollowedInfluencer_Id(1L, 2L))
                .thenReturn(Optional.empty());

        assertError(() -> followingService.unfollow(2L, fanPrincipal),
                ErrorCode.FOLLOW_NOT_FOUND);
    }

    /** 팔로잉 목록이 인플루언서 공개 프로필과 페이지 정보로 변환되는지 검증한다. */
    @Test
    void getsMyFollowings() {
        Following following = Following.follow(fan, influencer);
        ReflectionTestUtils.setField(following, "createdAt",
                LocalDateTime.of(2026, 7, 30, 15, 0));
        InfluencerProfile profile = mock(InfluencerProfile.class);
        when(profile.getUser()).thenReturn(influencer);
        when(profile.getActivityName()).thenReturn("활동명");
        when(profile.getIntroduction()).thenReturn("소개");
        PageRequest pageable = PageRequest.of(0, 20);
        when(followingRepository.findAllByFollower_IdOrderByCreatedAtDescIdDesc(1L, pageable))
                .thenReturn(new PageImpl<>(List.of(following), pageable, 1));
        when(influencerProfileRepository.findAllByUser_IdIn(List.of(2L)))
                .thenReturn(List.of(profile));

        PageResponse<FollowingSummaryResponse> response =
                followingService.getMyFollowings(0, 20, fanPrincipal);

        assertThat(response.content()).singleElement().satisfies(item -> {
            assertThat(item.influencerId()).isEqualTo(2L);
            assertThat(item.influencerName()).isEqualTo("활동명");
            assertThat(item.introduction()).isEqualTo("소개");
        });
        assertThat(response.totalElements()).isEqualTo(1L);
    }

    /** 팔로잉 목록이 최신순을 유지하고 모든 페이지 메타데이터를 정확히 반환하는지 검증한다. */
    @Test
    void getsMyFollowingsInLatestOrderWithPageMetadata() {
        User olderInfluencer = user(2L, UserRole.INFLUENCER, UserStatus.ACTIVE, "이전");
        User newerInfluencer = user(3L, UserRole.INFLUENCER, UserStatus.ACTIVE, "최근");
        Following newerFollowing = Following.follow(fan, newerInfluencer);
        Following olderFollowing = Following.follow(fan, olderInfluencer);
        ReflectionTestUtils.setField(newerFollowing, "createdAt",
                LocalDateTime.of(2026, 7, 30, 16, 0));
        ReflectionTestUtils.setField(olderFollowing, "createdAt",
                LocalDateTime.of(2026, 7, 30, 15, 0));
        InfluencerProfile newerProfile = mock(InfluencerProfile.class);
        when(newerProfile.getUser()).thenReturn(newerInfluencer);
        InfluencerProfile olderProfile = mock(InfluencerProfile.class);
        when(olderProfile.getUser()).thenReturn(olderInfluencer);
        PageRequest pageable = PageRequest.of(1, 2);
        when(followingRepository.findAllByFollower_IdOrderByCreatedAtDescIdDesc(1L, pageable))
                .thenReturn(new PageImpl<>(List.of(newerFollowing, olderFollowing), pageable, 5));
        when(influencerProfileRepository.findAllByUser_IdIn(List.of(3L, 2L)))
                .thenReturn(List.of(newerProfile, olderProfile));

        PageResponse<FollowingSummaryResponse> response =
                followingService.getMyFollowings(1, 2, fanPrincipal);

        assertThat(response.content()).extracting(FollowingSummaryResponse::influencerId)
                .containsExactly(3L, 2L);
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(2);
        assertThat(response.totalElements()).isEqualTo(5L);
        assertThat(response.totalPages()).isEqualTo(3);
        assertThat(response.hasNext()).isTrue();
    }

    /** 1인 인플루언서가 자신의 팔로워 팬 목록을 조회할 수 있는지 검증한다. */
    @Test
    void getsFollowersForSoloInfluencer() {
        AuthenticatedUser principal = new AuthenticatedUser(2L, UserRole.SOLO_INFLUENCER);
        User soloInfluencer = user(
                2L, UserRole.SOLO_INFLUENCER, UserStatus.ACTIVE, "1인 인플루언서"
        );
        Following following = Following.follow(fan, soloInfluencer);
        when(currentUserService.requireActiveUser(principal)).thenReturn(soloInfluencer);
        PageRequest pageable = PageRequest.of(0, 20);
        when(followingRepository
                .findAllByFollowedInfluencer_IdOrderByCreatedAtDescIdDesc(2L, pageable))
                .thenReturn(new PageImpl<>(List.of(following), pageable, 1));

        PageResponse<FollowerSummaryResponse> response =
                followingService.getMyFollowers(0, 20, principal);

        assertThat(response.content()).singleElement()
                .satisfies(item -> assertThat(item.fanId()).isEqualTo(1L));
    }

    /** 관리자에게 인플루언서 팔로워 목록을 공개하지 않는지 검증한다. */
    @Test
    void rejectsFollowersForManager() {
        AuthenticatedUser principal = new AuthenticatedUser(3L, UserRole.MANAGER);
        User manager = user(3L, UserRole.MANAGER, UserStatus.ACTIVE, "매니저");
        when(currentUserService.requireActiveUser(principal))
                .thenReturn(manager);

        assertError(() -> followingService.getMyFollowers(0, 20, principal),
                ErrorCode.ACCESS_DENIED);
    }

    /** 최대 크기를 초과하는 페이지 요청을 잘못된 요청으로 처리하는지 검증한다. */
    @Test
    void rejectsOversizedPage() {
        assertError(() -> followingService.getMyFollowings(0, 101, fanPrincipal),
                ErrorCode.INVALID_REQUEST);
    }

    /** 지정한 속성의 사용자 목을 생성한다. */
    private User user(Long id, UserRole role, UserStatus status, String nickname) {
        User result = mock(User.class);
        when(result.getId()).thenReturn(id);
        when(result.getRole()).thenReturn(role);
        when(result.getStatus()).thenReturn(status);
        when(result.getNickname()).thenReturn(nickname);
        return result;
    }

    /** 실행 결과가 지정한 비즈니스 오류 코드인지 검증한다. */
    private void assertError(Runnable action, ErrorCode errorCode) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(
                BusinessException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(errorCode)
        );
    }
}
