package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.domain.SocialAccount;
import com.ssafy.backend.auth.domain.SocialProvider;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.repository.SocialAccountRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 마이페이지 소셜 계정 연결 조회와 해제 규칙을 검증한다. (USER-004, USER-006) */
class SocialAccountServiceTest {

    private static final AuthenticatedUser PRINCIPAL = new AuthenticatedUser(1L, UserRole.FAN);

    private CurrentUserService currentUserService;
    private SocialAccountRepository socialAccountRepository;
    private SocialAccountService service;

    /** 각 테스트가 독립적으로 실행되도록 협력 객체를 새 mock으로 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        SocialAuthService socialAuthService = mock(SocialAuthService.class);
        socialAccountRepository = mock(SocialAccountRepository.class);
        service = new SocialAccountService(currentUserService, socialAuthService, socialAccountRepository);
    }

    /** 연결된 공급자 목록을 표시용 정보로 변환해 반환하는지 검증한다. */
    @Test
    void listsLinkedProvidersWithDisplayName() {
        User user = socialOnlyUser();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(socialAccountRepository.findAllByUser_IdOrderByProviderAsc(1L))
                .thenReturn(List.of(SocialAccount.link(user, SocialProvider.KAKAO, "1")));

        var responses = service.list(PRINCIPAL);

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).provider()).isEqualTo(SocialProvider.KAKAO);
        assertThat(responses.get(0).providerName()).isEqualTo("카카오");
    }

    /** 연결이 없는 공급자를 해제하려 하면 이유를 알려 주며 거부하는지 검증한다. */
    @Test
    void rejectsUnlinkWhenProviderIsNotLinked() {
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(socialOnlyUser());
        when(socialAccountRepository.findByUser_IdAndProvider(1L, SocialProvider.NAVER))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.unlink(PRINCIPAL, "naver"))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SOCIAL_ACCOUNT_NOT_LINKED);
                    assertThat(exception.getMessage()).contains("네이버");
                });
    }

    /**
     * 소셜 전용 계정의 마지막 연결 해제를 막는지 검증한다.
     *
     * <p>비밀번호 설정 API가 없어 이 연결을 지우면 사용자가 스스로 로그인할 방법이 사라진다.
     */
    @Test
    void rejectsUnlinkWhenItIsTheLastLoginMethod() {
        User user = socialOnlyUser();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        when(socialAccountRepository.findByUser_IdAndProvider(1L, SocialProvider.KAKAO))
                .thenReturn(Optional.of(SocialAccount.link(user, SocialProvider.KAKAO, "1")));
        when(socialAccountRepository.countByUser_Id(1L)).thenReturn(1L);

        assertThatThrownBy(() -> service.unlink(PRINCIPAL, "kakao"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SOCIAL_LAST_LOGIN_METHOD));
        verify(socialAccountRepository, never()).delete(any(SocialAccount.class));
    }

    /** 소셜 전용 계정이라도 다른 연결이 남아 있으면 해제를 허용하는지 검증한다. */
    @Test
    void allowsUnlinkWhenAnotherProviderRemains() {
        User user = socialOnlyUser();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        SocialAccount account = SocialAccount.link(user, SocialProvider.KAKAO, "1");
        when(socialAccountRepository.findByUser_IdAndProvider(1L, SocialProvider.KAKAO))
                .thenReturn(Optional.of(account));
        when(socialAccountRepository.countByUser_Id(1L)).thenReturn(2L);

        service.unlink(PRINCIPAL, "kakao");

        verify(socialAccountRepository).delete(account);
    }

    /** 비밀번호가 있는 계정은 마지막 연결이어도 해제할 수 있는지 검증한다. */
    @Test
    void allowsUnlinkForPasswordAccountEvenWhenItIsTheOnlyLink() {
        User user = passwordUser();
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(user);
        SocialAccount account = SocialAccount.link(user, SocialProvider.KAKAO, "1");
        when(socialAccountRepository.findByUser_IdAndProvider(1L, SocialProvider.KAKAO))
                .thenReturn(Optional.of(account));
        when(socialAccountRepository.countByUser_Id(1L)).thenReturn(1L);

        service.unlink(PRINCIPAL, "kakao");

        verify(socialAccountRepository).delete(account);
    }

    /** 지원하지 않는 공급자 경로를 거부하는지 검증한다. */
    @Test
    void rejectsUnsupportedProvider() {
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(socialOnlyUser());

        assertThatThrownBy(() -> service.unlink(PRINCIPAL, "line"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SOCIAL_PROVIDER_NOT_SUPPORTED));
    }

    /** 비밀번호로 로그인할 수 없는 소셜 전용 회원을 만든다. */
    private User socialOnlyUser() {
        User user = User.createSocialOnly("kakao_1", "fanuser@example.com", "영빈",
                UserRole.FAN, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", 1L);
        return user;
    }

    /** 비밀번호가 설정된 일반 회원을 만든다. */
    private User passwordUser() {
        User user = User.createActive("fan01", "fanuser@example.com", "encoded-password", "영빈",
                UserRole.FAN, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", 1L);
        return user;
    }
}
