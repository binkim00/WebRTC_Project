package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.domain.SocialAccount;
import com.ssafy.backend.auth.domain.SocialProvider;
import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.dto.SocialLinkRequest;
import com.ssafy.backend.auth.dto.SocialLoginRequest;
import com.ssafy.backend.auth.dto.SocialLoginResponse;
import com.ssafy.backend.auth.dto.SocialLoginStatus;
import com.ssafy.backend.auth.dto.SocialSignupRequest;
import com.ssafy.backend.auth.exception.AccountUnavailableException;
import com.ssafy.backend.auth.exception.TooManyLoginAttemptsException;
import com.ssafy.backend.auth.jwt.IssuedTokens;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.auth.repository.SocialAccountRepository;
import com.ssafy.backend.auth.support.PendingSocialAuthStore;
import com.ssafy.backend.auth.support.SocialAuthorizeUrlFactory;
import com.ssafy.backend.auth.support.SocialProfile;
import com.ssafy.backend.auth.support.SocialProfileClient;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.config.oauth.OAuthProperties;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 소셜 로그인의 분기 결정, 신규 가입, 기존 계정 연결 규칙을 검증한다. */
class SocialAuthServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 5, 14, 0);
    private static final String CODE = "auth-code";
    private static final String SOCIAL_TOKEN = "pending-token";
    private static final String PROVIDER_USER_ID = "4360777246";
    /** 로컬 파트가 3자를 넘는 흔한 형태를 쓴다. 3자 이하는 한 글자만 남기는 별도 분기를 타서 예시로 부적절하다. */
    private static final String EMAIL = "fanuser@example.com";

    /** {@link EMAIL}을 가린 결과다. */
    private static final String MASKED_EMAIL = "fan***@example.com";

    private SocialProfileClient socialProfileClient;
    private PendingSocialAuthStore pendingSocialAuthStore;
    private SocialAccountRepository socialAccountRepository;
    private UserRepository userRepository;
    private PasswordEncoder passwordEncoder;
    private JwtTokenProvider jwtTokenProvider;
    private TokenSessionStore tokenSessionStore;
    private LoginAttemptStore loginAttemptStore;
    private SocialAuthService service;

    /** 각 테스트가 독립적으로 실행되도록 협력 객체를 새 mock으로 구성하고 시각을 고정한다. */
    @BeforeEach
    void setUp() {
        socialProfileClient = mock(SocialProfileClient.class);
        SocialAuthorizeUrlFactory authorizeUrlFactory = mock(SocialAuthorizeUrlFactory.class);
        pendingSocialAuthStore = mock(PendingSocialAuthStore.class);
        socialAccountRepository = mock(SocialAccountRepository.class);
        userRepository = mock(UserRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        jwtTokenProvider = mock(JwtTokenProvider.class);
        tokenSessionStore = mock(TokenSessionStore.class);
        loginAttemptStore = mock(LoginAttemptStore.class);
        // 설정은 값 객체라 mock 대신 실제 값을 넣어 공급자 사용 가능 판정까지 함께 검증한다.
        OAuthProperties properties = new OAuthProperties(
                "http://localhost:5173/oauth/callback", 300,
                new OAuthProperties.Registration("google-id", "google-secret"),
                new OAuthProperties.Registration("kakao-id", "kakao-secret"),
                new OAuthProperties.Registration("naver-id", "naver-secret"));
        Clock clock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());

        service = new SocialAuthService(socialProfileClient, authorizeUrlFactory,
                pendingSocialAuthStore, socialAccountRepository, userRepository, passwordEncoder,
                jwtTokenProvider, tokenSessionStore, loginAttemptStore, properties, clock);
    }

    /** 이미 연결된 소셜 계정은 추가 화면 없이 토큰을 발급받는지 검증한다. */
    @Test
    void logsInWhenSocialAccountAlreadyLinked() {
        User user = activeUser(7L);
        stubProfile(profile(EMAIL, true));
        when(socialAccountRepository.findWithUserByProviderAndProviderUserId(
                SocialProvider.KAKAO, PROVIDER_USER_ID))
                .thenReturn(Optional.of(SocialAccount.link(user, SocialProvider.KAKAO, PROVIDER_USER_ID)));
        stubIssuedTokens();

        SocialLoginResponse response = service.login("kakao", new SocialLoginRequest(CODE, null));

        assertThat(response.status()).isEqualTo(SocialLoginStatus.LOGIN);
        assertThat(response.login()).isNotNull();
        assertThat(response.login().userId()).isEqualTo(7L);
        assertThat(response.socialToken()).isNull();
        assertThat(user.getLastLoginAt()).isEqualTo(NOW);
        verify(tokenSessionStore).save(eq(7L), anyString(), anyString());
        verify(pendingSocialAuthStore, never()).issue(any());
    }

    /** 연결도 같은 이메일 계정도 없으면 추가정보 입력 단계로 보내는지 검증한다. */
    @Test
    void requiresSignupWhenNoAccountExists() {
        stubProfile(profile(EMAIL, true));
        stubNotLinked();
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(pendingSocialAuthStore.issue(any())).thenReturn(SOCIAL_TOKEN);

        SocialLoginResponse response = service.login("kakao", new SocialLoginRequest(CODE, null));

        assertThat(response.status()).isEqualTo(SocialLoginStatus.SIGNUP_REQUIRED);
        assertThat(response.socialToken()).isEqualTo(SOCIAL_TOKEN);
        assertThat(response.email()).isEqualTo(EMAIL);
        assertThat(response.emailProvided()).isTrue();
        assertThat(response.message()).isNotBlank();
    }

    /** 공급자가 이메일을 주지 않으면 화면에서 직접 입력받도록 안내하는지 검증한다. */
    @Test
    void marksEmailNotProvidedWhenProviderOmitsEmail() {
        stubProfile(profile(null, false));
        stubNotLinked();
        when(pendingSocialAuthStore.issue(any())).thenReturn(SOCIAL_TOKEN);

        SocialLoginResponse response = service.login("kakao", new SocialLoginRequest(CODE, null));

        assertThat(response.status()).isEqualTo(SocialLoginStatus.SIGNUP_REQUIRED);
        assertThat(response.emailProvided()).isFalse();
        assertThat(response.message()).contains("카카오");
        // 이메일이 없으면 기존 계정을 찾을 수 없으므로 조회 자체를 하지 않는다.
        verify(userRepository, never()).findByEmail(anyString());
    }

    /**
     * 같은 이메일 계정이 있으면 자동 연결하지 않고 비밀번호 확인 단계로 보내는지 검증한다.
     *
     * <p>공급자 이메일은 우리 계정의 소유를 증명하지 않으므로 자동 연결은 계정 탈취 경로가 된다.
     */
    @Test
    void requiresLinkWhenEmailAlreadyRegistered() {
        stubProfile(profile(EMAIL, true));
        stubNotLinked();
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(activeUser(3L)));
        when(pendingSocialAuthStore.issue(any())).thenReturn(SOCIAL_TOKEN);

        SocialLoginResponse response = service.login("kakao", new SocialLoginRequest(CODE, null));

        assertThat(response.status()).isEqualTo(SocialLoginStatus.LINK_REQUIRED);
        assertThat(response.socialToken()).isEqualTo(SOCIAL_TOKEN);
        assertThat(response.maskedEmail()).isEqualTo(MASKED_EMAIL);
        // 전체 주소를 노출하지 않는지 확인한다.
        assertThat(response.message()).doesNotContain(EMAIL);
        verify(jwtTokenProvider, never()).issue(any());
    }

    /** 연결된 계정이 정지 상태면 로그인을 거부하는지 검증한다. */
    @Test
    void rejectsLoginWhenLinkedAccountIsNotActive() {
        User suspended = activeUser(9L);
        ReflectionTestUtils.setField(suspended, "status", UserStatus.SUSPENDED);
        stubProfile(profile(EMAIL, true));
        when(socialAccountRepository.findWithUserByProviderAndProviderUserId(
                SocialProvider.KAKAO, PROVIDER_USER_ID))
                .thenReturn(Optional.of(
                        SocialAccount.link(suspended, SocialProvider.KAKAO, PROVIDER_USER_ID)));

        assertThatThrownBy(() -> service.login("kakao", new SocialLoginRequest(CODE, null)))
                .isInstanceOf(AccountUnavailableException.class);
    }

    /** 지원하지 않는 공급자 경로를 안내와 함께 거부하는지 검증한다. */
    @Test
    void rejectsUnsupportedProvider() {
        assertThatThrownBy(() -> service.login("line", new SocialLoginRequest(CODE, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SOCIAL_PROVIDER_NOT_SUPPORTED));
    }

    /** 소셜 가입이 FAN 역할과 합성 로그인 ID로 계정을 만들고 이메일 인증까지 반영하는지 검증한다. */
    @Test
    void createsSocialOnlyUserAsFan() {
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(EMAIL, true)));
        when(userRepository.existsByEmail(EMAIL)).thenReturn(false);
        when(userRepository.existsByLoginId(anyString())).thenReturn(false);
        stubNotLinked();
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 11L);
            return saved;
        });
        stubIssuedTokens();

        LoginResponse response = service.signup(signupRequest(null));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        // 가입 저장과 마지막 로그인 시각 갱신으로 save 가 두 번 불린다. 같은 엔티티라 값 검증에는 영향이 없다.
        verify(userRepository, atLeastOnce()).save(captor.capture());
        User created = captor.getValue();
        assertThat(created.getRole()).isEqualTo(UserRole.FAN);
        assertThat(created.getLoginId()).isEqualTo("kakao_" + PROVIDER_USER_ID);
        assertThat(created.getEmail()).isEqualTo(EMAIL);
        assertThat(created.isSocialOnly()).isTrue();
        // 공급자가 인증했다고 알려 준 이메일이므로 인증 완료로 기록한다.
        assertThat(created.getEmailVerifiedAt()).isEqualTo(NOW);
        assertThat(response.userId()).isEqualTo(11L);
        verify(socialAccountRepository).save(any(SocialAccount.class));
        verify(pendingSocialAuthStore).consume(SOCIAL_TOKEN);
    }

    /** 공급자가 이메일을 보증하지 않으면 인증 완료로 기록하지 않는지 검증한다. */
    @Test
    void keepsEmailUnverifiedWhenProviderDoesNotVerify() {
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(EMAIL, false)));
        when(userRepository.existsByEmail(EMAIL)).thenReturn(false);
        when(userRepository.existsByLoginId(anyString())).thenReturn(false);
        stubNotLinked();
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 12L);
            return saved;
        });
        stubIssuedTokens();

        service.signup(signupRequest(null));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        // 가입 저장과 마지막 로그인 시각 갱신으로 save 가 두 번 불린다. 같은 엔티티라 값 검증에는 영향이 없다.
        verify(userRepository, atLeastOnce()).save(captor.capture());
        assertThat(captor.getValue().isEmailVerified()).isFalse();
    }

    /** 공급자 이메일이 없고 입력 이메일도 없으면 이유를 알려 주며 거부하는지 검증한다. */
    @Test
    void rejectsSignupWhenEmailIsMissingEverywhere() {
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(null, false)));

        assertThatThrownBy(() -> service.signup(signupRequest(null)))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST);
                    assertThat(exception.getMessage()).contains("카카오");
                });
        verify(userRepository, never()).save(any(User.class));
    }

    /** 공급자가 이메일을 주지 않은 경우 입력받은 이메일을 미인증으로 저장하는지 검증한다. */
    @Test
    void usesRequestedEmailWhenProviderOmitsEmail() {
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(null, false)));
        when(userRepository.existsByEmail("Typed@Example.com".toLowerCase())).thenReturn(false);
        when(userRepository.existsByLoginId(anyString())).thenReturn(false);
        stubNotLinked();
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 13L);
            return saved;
        });
        stubIssuedTokens();

        service.signup(signupRequest("Typed@Example.com"));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        // 가입 저장과 마지막 로그인 시각 갱신으로 save 가 두 번 불린다. 같은 엔티티라 값 검증에는 영향이 없다.
        verify(userRepository, atLeastOnce()).save(captor.capture());
        // 대소문자 차이로 중복 검사가 우회되지 않도록 소문자로 정규화한다.
        assertThat(captor.getValue().getEmail()).isEqualTo("typed@example.com");
        assertThat(captor.getValue().isEmailVerified()).isFalse();
    }

    /** 이미 가입된 이메일이면 연결 방법을 안내하며 가입을 거부하는지 검증한다. */
    @Test
    void rejectsSignupWhenEmailAlreadyRegistered() {
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(EMAIL, true)));
        when(userRepository.existsByEmail(EMAIL)).thenReturn(true);

        assertThatThrownBy(() -> service.signup(signupRequest(null)))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode())
                            .isEqualTo(ErrorCode.SOCIAL_EMAIL_ALREADY_REGISTERED);
                    assertThat(exception.getMessage()).contains("마이페이지");
                });
    }

    /** 만료된 임시 토큰을 사용할 수 없게 막는지 검증한다. */
    @Test
    void rejectsExpiredPendingToken() {
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.signup(signupRequest(null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SOCIAL_TOKEN_INVALID));
    }

    /** 비밀번호 확인을 통과하면 기존 계정에 연결하고 로그인시키는지 검증한다. */
    @Test
    void linksExistingAccountAfterPasswordCheck() {
        User user = activeUser(5L);
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(EMAIL, true)));
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(loginAttemptStore.isBlocked(user.getLoginId())).thenReturn(false);
        when(passwordEncoder.matches("test1234", user.getPassword())).thenReturn(true);
        stubNotLinked();
        when(socialAccountRepository.findByUser_IdAndProvider(5L, SocialProvider.KAKAO))
                .thenReturn(Optional.empty());
        when(socialAccountRepository.saveAndFlush(any(SocialAccount.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        stubIssuedTokens();

        LoginResponse response = service.link(new SocialLinkRequest(SOCIAL_TOKEN, "test1234"));

        assertThat(response.userId()).isEqualTo(5L);
        verify(socialAccountRepository).saveAndFlush(any(SocialAccount.class));
        verify(loginAttemptStore).clear(user.getLoginId());
        verify(pendingSocialAuthStore).consume(SOCIAL_TOKEN);
    }

    /** 비밀번호가 다르면 실패를 누적하고 가려진 이메일과 함께 안내하는지 검증한다. */
    @Test
    void rejectsLinkWhenPasswordMismatch() {
        User user = activeUser(5L);
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(EMAIL, true)));
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);
        when(loginAttemptStore.recordFailure(user.getLoginId())).thenReturn(false);

        assertThatThrownBy(() -> service.link(new SocialLinkRequest(SOCIAL_TOKEN, "wrong")))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode())
                            .isEqualTo(ErrorCode.SOCIAL_LINK_PASSWORD_MISMATCH);
                    assertThat(exception.getMessage()).contains(MASKED_EMAIL);
                });
        verify(loginAttemptStore).recordFailure(user.getLoginId());
        verify(socialAccountRepository, never()).saveAndFlush(any(SocialAccount.class));
    }

    /** 비밀번호 확인 실패가 누적되면 로그인과 같은 정책으로 차단하는지 검증한다. */
    @Test
    void blocksLinkAfterTooManyPasswordFailures() {
        User user = activeUser(5L);
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(EMAIL, true)));
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(loginAttemptStore.isBlocked(user.getLoginId())).thenReturn(true);

        assertThatThrownBy(() -> service.link(new SocialLinkRequest(SOCIAL_TOKEN, "test1234")))
                .isInstanceOf(TooManyLoginAttemptsException.class);
        verify(passwordEncoder, never()).matches(anyString(), anyString());
    }

    /** 이미 다른 Melly 계정에 연결된 소셜 계정을 다시 연결하지 못하게 막는지 검증한다. */
    @Test
    void rejectsLinkWhenSocialAccountBelongsToAnotherUser() {
        User user = activeUser(5L);
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(EMAIL, true)));
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(true);
        when(socialAccountRepository.findByProviderAndProviderUserId(
                SocialProvider.KAKAO, PROVIDER_USER_ID))
                .thenReturn(Optional.of(
                        SocialAccount.link(activeUser(99L), SocialProvider.KAKAO, PROVIDER_USER_ID)));

        assertThatThrownBy(() -> service.link(new SocialLinkRequest(SOCIAL_TOKEN, "test1234")))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SOCIAL_ACCOUNT_LINKED_TO_OTHER_USER));
    }

    /** 공급자가 이메일을 주지 않은 임시 토큰으로는 연결 대상을 특정할 수 없어 거부하는지 검증한다. */
    @Test
    void rejectsLinkWhenPendingProfileHasNoEmail() {
        when(pendingSocialAuthStore.find(SOCIAL_TOKEN))
                .thenReturn(Optional.of(profile(null, false)));

        assertThatThrownBy(() -> service.link(new SocialLinkRequest(SOCIAL_TOKEN, "test1234")))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SOCIAL_TOKEN_INVALID));
        verify(userRepository, never()).findByEmail(anyString());
    }

    /** 공급자 프로필 조회 결과를 고정한다. */
    private void stubProfile(SocialProfile profile) {
        when(socialProfileClient.fetchProfile(eq(SocialProvider.KAKAO), eq(CODE), any()))
                .thenReturn(profile);
    }

    /** 이 소셜 계정이 아직 어느 계정에도 연결되지 않은 상태를 고정한다. */
    private void stubNotLinked() {
        when(socialAccountRepository.findWithUserByProviderAndProviderUserId(
                SocialProvider.KAKAO, PROVIDER_USER_ID))
                .thenReturn(Optional.empty());
        when(socialAccountRepository.findByProviderAndProviderUserId(
                SocialProvider.KAKAO, PROVIDER_USER_ID))
                .thenReturn(Optional.empty());
    }

    /** 토큰 발급 결과를 고정한다. */
    private void stubIssuedTokens() {
        when(jwtTokenProvider.issue(any(User.class)))
                .thenReturn(new IssuedTokens("access", "refresh", 3600L));
    }

    /** 카카오 프로필을 만든다. */
    private SocialProfile profile(String email, boolean emailVerified) {
        return new SocialProfile(SocialProvider.KAKAO, PROVIDER_USER_ID, email, emailVerified,
                "영빈", null);
    }

    /** 식별자가 채워진 활성 회원을 만든다. */
    private User activeUser(Long id) {
        User user = User.createActive("fan01", EMAIL, "encoded-password", "팬",
                UserRole.FAN, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    /** 소셜 가입 요청을 만든다. */
    private SocialSignupRequest signupRequest(String email) {
        return new SocialSignupRequest(SOCIAL_TOKEN, "영빈", email,
                PreferredLanguage.KOREAN, true, true);
    }
}
