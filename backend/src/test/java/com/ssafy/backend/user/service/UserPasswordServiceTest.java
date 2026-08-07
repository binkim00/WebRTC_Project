package com.ssafy.backend.user.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.service.LogoutService;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.dto.PasswordChangeRequest;
import com.ssafy.backend.user.dto.PasswordChangeResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class UserPasswordServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 7, 11, 30);
    private static final AuthenticatedUser PRINCIPAL = new AuthenticatedUser(7L, UserRole.FAN);

    private CurrentUserService currentUserService;
    private PasswordEncoder passwordEncoder;
    private LogoutService logoutService;
    private UserPasswordService userPasswordService;

    /** 각 테스트가 고정 시계와 새 mock으로 독립 실행되도록 협력 객체를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        passwordEncoder = mock(PasswordEncoder.class);
        logoutService = mock(LogoutService.class);
        Clock clock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        userPasswordService = new UserPasswordService(
                currentUserService, passwordEncoder, logoutService, clock);
    }

    /** 현재 비밀번호가 맞으면 새 해시를 저장하고 로그인 세션을 끊는지 확인한다. */
    @Test
    void changesPasswordAndEndsSession() {
        User user = activeUser();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(passwordEncoder.matches("current123", "encoded-old")).thenReturn(true);
        when(passwordEncoder.matches("newPass123", "encoded-old")).thenReturn(false);
        when(passwordEncoder.encode("newPass123")).thenReturn("encoded-new");

        PasswordChangeResponse response = userPasswordService.changePassword(
                new PasswordChangeRequest("current123", "newPass123"), "access-token", PRINCIPAL);

        assertThat(user.getPassword()).isEqualTo("encoded-new");
        assertThat(response.changedAt()).isEqualTo(NOW);
        assertThat(response.reloginRequired()).isTrue();
        verify(logoutService).logout("access-token");
    }

    /** 현재 비밀번호가 다르면 변경하지 않고 거부하는지 확인한다. */
    @Test
    void rejectsWrongCurrentPassword() {
        User user = activeUser();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(passwordEncoder.matches("wrong", "encoded-old")).thenReturn(false);

        assertThatThrownBy(() -> userPasswordService.changePassword(
                new PasswordChangeRequest("wrong", "newPass123"), "access-token", PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.USER_PASSWORD_MISMATCH));
        assertThat(user.getPassword()).isEqualTo("encoded-old");
        verifyNoInteractions(logoutService);
    }

    /** 정책을 만족하지 않는 새 비밀번호를 거부하는지 확인한다. */
    @Test
    void rejectsWeakNewPassword() {
        User user = activeUser();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(passwordEncoder.matches("current123", "encoded-old")).thenReturn(true);

        assertThatThrownBy(() -> userPasswordService.changePassword(
                new PasswordChangeRequest("current123", "onlyletters"), "access-token", PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.PASSWORD_POLICY_VIOLATION));
        assertThat(user.getPassword()).isEqualTo("encoded-old");
    }

    /** 현재 비밀번호와 같은 값으로는 바꾸지 못하게 막는지 확인한다. */
    @Test
    void rejectsSamePassword() {
        User user = activeUser();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(passwordEncoder.matches("current123", "encoded-old")).thenReturn(true);

        assertThatThrownBy(() -> userPasswordService.changePassword(
                new PasswordChangeRequest("current123", "current123"), "access-token", PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.PASSWORD_SAME_AS_CURRENT));
        verifyNoInteractions(logoutService);
    }

    /** 비밀번호가 없는 소셜 전용 계정은 변경 대상이 아님을 알리는지 확인한다. */
    @Test
    void rejectsSocialOnlyAccount() {
        User socialOnly = User.createSocialOnly("kakao_1", "social@example.com", "소셜",
                UserRole.FAN, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(socialOnly, "id", 7L);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(socialOnly);

        assertThatThrownBy(() -> userPasswordService.changePassword(
                new PasswordChangeRequest("anything", "newPass123"), "access-token", PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.PASSWORD_CHANGE_NOT_AVAILABLE));
        verifyNoInteractions(passwordEncoder);
        verifyNoInteractions(logoutService);
    }

    /** 인증 사용자를 찾지 못하면 비밀번호 확인 없이 그대로 실패하는지 확인한다. */
    @Test
    void propagatesMissingActiveUser() {
        when(currentUserService.requireActiveUser(any()))
                .thenThrow(new BusinessException(ErrorCode.ACTIVE_USER_NOT_FOUND));

        assertThatThrownBy(() -> userPasswordService.changePassword(
                new PasswordChangeRequest("current123", "newPass123"), "access-token", PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACTIVE_USER_NOT_FOUND));
        verifyNoInteractions(logoutService);
    }

    /**
     * 테스트에서 쓸 활성 사용자를 만든다.
     *
     * @return 식별자가 주입된 활성 사용자
     */
    private User activeUser() {
        User user = User.createActive("fan-login", "fan@example.com", "encoded-old", "팬",
                UserRole.FAN, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", 7L);
        return user;
    }
}
