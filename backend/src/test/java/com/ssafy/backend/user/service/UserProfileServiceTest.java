package com.ssafy.backend.user.service;

import com.ssafy.backend.auth.exception.DuplicateEmailException;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.dto.MyProfileUpdateRequest;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class UserProfileServiceTest {
    private static final AuthenticatedUser PRINCIPAL = new AuthenticatedUser(1L, UserRole.FAN);
    private CurrentUserService currentUserService;
    private UserRepository userRepository;
    private UserProfileService service;

    /** 각 테스트가 독립적으로 실행되도록 협력 객체를 새 mock으로 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        userRepository = mock(UserRepository.class);
        service = new UserProfileService(currentUserService, userRepository);
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
                null, " New@Example.com ", " https://cdn.example.com/profile.png ",
                PreferredLanguage.ENGLISH));

        assertThat(response.email()).isEqualTo("new@example.com");
        assertThat(response.profileImageUrl()).isEqualTo("https://cdn.example.com/profile.png");
        assertThat(response.preferredLanguage()).isEqualTo(PreferredLanguage.ENGLISH);
        verify(userRepository).existsByEmailAndIdNot("new@example.com", 1L);
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

    /** 테스트에 사용할 활성 팬 엔티티를 생성하고 식별자를 설정한다. */
    private User user() {
        User user = User.createActive("fan01", "fan@example.com", "encoded", "originalNickname",
                UserRole.FAN, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", 1L);
        return user;
    }
}
