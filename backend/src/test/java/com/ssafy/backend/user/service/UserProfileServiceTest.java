package com.ssafy.backend.user.service;

import com.ssafy.backend.auth.exception.DuplicateEmailException;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.service.LogoutService;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.dto.MyProfileUpdateRequest;
import com.ssafy.backend.user.dto.UserWithdrawRequest;
import com.ssafy.backend.user.dto.UserWithdrawResponse;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collection;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class UserProfileServiceTest {
    private static final AuthenticatedUser PRINCIPAL = new AuthenticatedUser(1L, UserRole.FAN);
    private static final String ACCESS_TOKEN = "access-token";
    private static final String RAW_PASSWORD = "test1234";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 2, 15, 30);

    private CurrentUserService currentUserService;
    private UserRepository userRepository;
    private FanMeetingRepository fanMeetingRepository;
    private InfluencerProfileRepository influencerProfileRepository;
    private PasswordEncoder passwordEncoder;
    private LogoutService logoutService;
    private UserProfileService service;

    /** 각 테스트가 독립적으로 실행되도록 협력 객체를 새 mock으로 구성하고 시각을 고정한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        userRepository = mock(UserRepository.class);
        fanMeetingRepository = mock(FanMeetingRepository.class);
        influencerProfileRepository = mock(InfluencerProfileRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        logoutService = mock(LogoutService.class);
        Clock clock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        service = new UserProfileService(currentUserService, userRepository, fanMeetingRepository,
                influencerProfileRepository, passwordEncoder, logoutService, clock);
    }

    /** 인증 사용자 식별자로 조회한 활성 회원의 공개 정보만 응답하는지 검증한다. */
    @Test
    void returnsCurrentActiveUserProfile() {
        User user = user();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);

        var response = service.getMyProfile(PRINCIPAL);

        assertThat(response.userId()).isEqualTo(1L);
        assertThat(response.loginId()).isEqualTo("fan01");
        assertThat(response.email()).isEqualTo("fan@example.com");
        assertThat(response.role()).isEqualTo(UserRole.FAN);
        assertThat(response.preferredLanguage()).isEqualTo(PreferredLanguage.KOREAN);
    }

    /** 닉네임만 전달하면 나머지 회원 정보가 유지되는지 검증한다. */
    @Test
    void updatesOnlyProvidedNickname() {
        User user = user();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(userRepository.saveAndFlush(user)).thenReturn(user);

        var response = service.updateMyProfile(PRINCIPAL,
                new MyProfileUpdateRequest(" 새닉네임 ", null, null, null));

        assertThat(response.nickname()).isEqualTo("새닉네임");
        assertThat(response.email()).isEqualTo("fan@example.com");
        assertThat(response.preferredLanguage()).isEqualTo(PreferredLanguage.KOREAN);
    }

    /** 이메일·프로필 이미지·선호 언어 변경과 이메일 정규화를 검증한다. */
    @Test
    void updatesEmailImageAndPreferredLanguage() {
        User user = user();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(userRepository.saveAndFlush(user)).thenReturn(user);

        var response = service.updateMyProfile(PRINCIPAL, new MyProfileUpdateRequest(
                null, " New@Example.com ", " https://cdn.example.com/new.png ",
                PreferredLanguage.ENGLISH));

        assertThat(response.email()).isEqualTo("new@example.com");
        assertThat(response.profileImageUrl()).isEqualTo("https://cdn.example.com/new.png");
        assertThat(response.preferredLanguage()).isEqualTo(PreferredLanguage.ENGLISH);
        verify(userRepository).existsByEmailAndIdNot("new@example.com", 1L);
    }

    /** 이메일을 다른 주소로 바꾸면 기존 이메일 인증이 무효가 되는지 검증한다. */
    @Test
    void resetsEmailVerificationWhenEmailChanges() {
        User user = user();
        user.verifyEmail(LocalDateTime.of(2026, 8, 1, 10, 0));
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(userRepository.saveAndFlush(user)).thenReturn(user);

        var response = service.updateMyProfile(PRINCIPAL,
                new MyProfileUpdateRequest(null, "changed@example.com", null, null));

        assertThat(response.emailVerified()).isFalse();
        assertThat(user.getEmailVerifiedAt()).isNull();
    }

    /** 같은 이메일을 다시 보내면 기존 인증 상태를 유지하는지 검증한다. */
    @Test
    void keepsEmailVerificationWhenEmailUnchanged() {
        User user = user();
        LocalDateTime verifiedAt = LocalDateTime.of(2026, 8, 1, 10, 0);
        user.verifyEmail(verifiedAt);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(userRepository.saveAndFlush(user)).thenReturn(user);

        var response = service.updateMyProfile(PRINCIPAL,
                new MyProfileUpdateRequest("새닉네임", " Fan@Example.com ", null, null));

        assertThat(response.emailVerified()).isTrue();
        assertThat(user.getEmailVerifiedAt()).isEqualTo(verifiedAt);
    }

    /** 다른 사용자의 이메일은 거부하고 자신의 기존 이메일은 허용하는지 검증한다. */
    @Test
    void validatesEmailUniquenessExcludingCurrentUser() {
        User user = user();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(userRepository.saveAndFlush(user)).thenReturn(user);

        service.updateMyProfile(PRINCIPAL,
                new MyProfileUpdateRequest(null, " FAN@EXAMPLE.COM ", null, null));
        verify(userRepository, never()).existsByEmailAndIdNot(any(), any());

        when(userRepository.existsByEmailAndIdNot("used@example.com", 1L)).thenReturn(true);
        assertThatThrownBy(() -> service.updateMyProfile(PRINCIPAL,
                new MyProfileUpdateRequest(null, "used@example.com", null, null)))
                .isInstanceOf(DuplicateEmailException.class);
    }

    /** 비활성 계정 오류와 공백 입력이 서비스 계층에서 거부되는지 검증한다. */
    @Test
    void rejectsUnavailableUserAndBlankValue() {
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user());
        assertThatThrownBy(() -> service.updateMyProfile(PRINCIPAL,
                new MyProfileUpdateRequest("   ", null, null, null)))
                .isInstanceOf(BusinessException.class);

        when(currentUserService.requireActiveUser(PRINCIPAL)).thenThrow(BusinessException.class);
        assertThatThrownBy(() -> service.getMyProfile(PRINCIPAL))
                .isInstanceOf(BusinessException.class);
    }

    /** 탈퇴가 계정을 비식별화하고 공개 프로필 삭제와 세션 종료까지 수행하는지 검증한다. */
    @Test
    void withdrawsAndAnonymizesAccount() {
        User user = user();
        stubActiveUser(user);
        stubPasswordMatch(user, true);
        when(fanMeetingRepository.existsOperatingMeeting(eq(1L), anyCollection())).thenReturn(false);

        UserWithdrawResponse response = service.withdraw(request(), ACCESS_TOKEN, PRINCIPAL);

        assertThat(response.withdrawnAt()).isEqualTo(NOW);
        assertThat(response.success()).isTrue();
        assertThat(user.getStatus()).isEqualTo(UserStatus.WITHDRAWN);
        assertThat(user.getWithdrawnAt()).isEqualTo(NOW);
        assertThat(user.getLoginId()).isEqualTo("withdrawn_1");
        assertThat(user.getEmail()).isEqualTo("withdrawn_1@withdrawn.invalid");
        assertThat(user.getNickname()).isEqualTo("탈퇴한 사용자");
        assertThat(user.getProfileImageUrl()).isNull();
        assertThat(user.getPassword()).isNotEqualTo("encoded");
        verify(influencerProfileRepository).deleteByUser_Id(1L);
        verify(logoutService).logout(ACCESS_TOKEN);
    }

    /** 운영 책임이 남은 팬미팅 상태만 차단 대상으로 넘기는지 검증한다. */
    @Test
    void checksOnlyUnfinishedMeetingStatuses() {
        User user = user(UserRole.INFLUENCER);
        stubActiveUser(user);
        stubPasswordMatch(user, true);
        when(fanMeetingRepository.existsOperatingMeeting(eq(1L), anyCollection())).thenReturn(false);

        service.withdraw(request(), ACCESS_TOKEN, PRINCIPAL);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<FanMeetingStatus>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(fanMeetingRepository).existsOperatingMeeting(eq(1L), captor.capture());
        assertThat(captor.getValue()).containsExactlyInAnyOrder(
                FanMeetingStatus.PUBLISHED, FanMeetingStatus.APPLICATION_OPEN,
                FanMeetingStatus.APPLICATION_CLOSED, FanMeetingStatus.READY, FanMeetingStatus.LIVE);
    }

    /** 비밀번호가 다르면 이후 검증과 처리를 전혀 수행하지 않는지 검증한다. */
    @Test
    void rejectsPasswordMismatchBeforeAnyOtherCheck() {
        User user = user();
        stubActiveUser(user);
        stubPasswordMatch(user, false);

        assertThatThrownBy(() -> service.withdraw(request(), ACCESS_TOKEN, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.USER_PASSWORD_MISMATCH));

        assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
        verifyNoInteractions(fanMeetingRepository, influencerProfileRepository, logoutService);
        verify(userRepository, never()).countByRoleAndStatus(any(), any());
    }

    /** 미종료 팬미팅을 책임지고 있으면 탈퇴가 거부되는지 검증한다. */
    @Test
    void rejectsWithdrawalWhileOperatingMeetingExists() {
        User user = user(UserRole.INFLUENCER);
        stubActiveUser(user);
        stubPasswordMatch(user, true);
        when(fanMeetingRepository.existsOperatingMeeting(eq(1L), anyCollection())).thenReturn(true);

        assertThatThrownBy(() -> service.withdraw(request(), ACCESS_TOKEN, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode())
                        .isEqualTo(ErrorCode.USER_WITHDRAW_MEETING_IN_PROGRESS));

        assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
        verifyNoInteractions(influencerProfileRepository, logoutService);
    }

    /** 활성 관리자가 본인 한 명뿐이면 탈퇴가 거부되는지 검증한다. */
    @Test
    void rejectsLastActiveAdminWithdrawal() {
        User user = user(UserRole.ADMIN);
        stubActiveUser(user);
        stubPasswordMatch(user, true);
        when(fanMeetingRepository.existsOperatingMeeting(eq(1L), anyCollection())).thenReturn(false);
        when(userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(1L);

        assertThatThrownBy(() -> service.withdraw(request(), ACCESS_TOKEN, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode())
                        .isEqualTo(ErrorCode.LAST_ADMIN_WITHDRAW_NOT_ALLOWED));

        assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
        verifyNoInteractions(influencerProfileRepository, logoutService);
    }

    /** 관리자가 여러 명이면 탈퇴가 허용되는지 검증한다. */
    @Test
    void allowsAdminWithdrawalWhenAnotherAdminRemains() {
        User user = user(UserRole.ADMIN);
        stubActiveUser(user);
        stubPasswordMatch(user, true);
        when(fanMeetingRepository.existsOperatingMeeting(eq(1L), anyCollection())).thenReturn(false);
        when(userRepository.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(2L);

        service.withdraw(request(), ACCESS_TOKEN, PRINCIPAL);

        assertThat(user.getStatus()).isEqualTo(UserStatus.WITHDRAWN);
    }

    /** 관리자가 아닌 계정은 관리자 수를 조회하지 않는지 검증한다. */
    @Test
    void skipsAdminCountForNonAdminRole() {
        User user = user();
        stubActiveUser(user);
        stubPasswordMatch(user, true);
        when(fanMeetingRepository.existsOperatingMeeting(eq(1L), anyCollection())).thenReturn(false);

        service.withdraw(request(), ACCESS_TOKEN, PRINCIPAL);

        verify(userRepository, never()).countByRoleAndStatus(any(), any());
    }

    /** 활성 사용자가 아니면 탈퇴 처리 전에 거부되는지 검증한다. */
    @Test
    void rejectsWithdrawalForInactiveUser() {
        when(currentUserService.requireActiveUser(PRINCIPAL))
                .thenThrow(new BusinessException(ErrorCode.ACTIVE_USER_NOT_FOUND));

        assertThatThrownBy(() -> service.withdraw(request(), ACCESS_TOKEN, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ACTIVE_USER_NOT_FOUND));

        verifyNoInteractions(fanMeetingRepository, influencerProfileRepository, logoutService);
    }

    /** 이미 탈퇴한 엔티티의 상태 예외를 비즈니스 예외로 변환하는지 검증한다. */
    @Test
    void translatesAlreadyWithdrawnStateException() {
        User user = user();
        ReflectionTestUtils.setField(user, "status", UserStatus.WITHDRAWN);
        stubActiveUser(user);
        stubPasswordMatch(user, true);
        when(fanMeetingRepository.existsOperatingMeeting(eq(1L), anyCollection())).thenReturn(false);

        assertThatThrownBy(() -> service.withdraw(request(), ACCESS_TOKEN, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.USER_ALREADY_WITHDRAWN));

        verifyNoInteractions(influencerProfileRepository, logoutService);
    }

    /** 인증 사용자 조회가 대상 사용자를 반환하도록 스텁을 구성한다. */
    private void stubActiveUser(User user) {
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
    }

    /** 비밀번호 비교 결과를 지정한 값으로 고정한다. */
    private void stubPasswordMatch(User user, boolean matches) {
        when(passwordEncoder.matches(RAW_PASSWORD, user.getPassword())).thenReturn(matches);
    }

    /** 본인 확인 비밀번호를 담은 탈퇴 요청을 생성한다. */
    private UserWithdrawRequest request() {
        return new UserWithdrawRequest(RAW_PASSWORD);
    }

    /** 테스트에 사용할 활성 팬 엔티티를 생성한다. */
    private User user() {
        return user(UserRole.FAN);
    }

    /** 테스트에 사용할 활성 사용자 엔티티를 생성하고 식별자와 프로필 이미지를 설정한다. */
    private User user(UserRole role) {
        User user = User.createActive("fan01", "fan@example.com", "encoded", "originalNickname",
                role, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", 1L);
        ReflectionTestUtils.setField(user, "profileImageUrl", "https://cdn.example.com/profile.png");
        return user;
    }
}
