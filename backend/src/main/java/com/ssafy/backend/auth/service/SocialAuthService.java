package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.domain.SocialAccount;
import com.ssafy.backend.auth.domain.SocialProvider;
import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.dto.SocialAuthorizeUrlResponse;
import com.ssafy.backend.auth.dto.SocialLinkRequest;
import com.ssafy.backend.auth.dto.SocialLoginRequest;
import com.ssafy.backend.auth.dto.SocialLoginResponse;
import com.ssafy.backend.auth.dto.SocialSignupRequest;
import com.ssafy.backend.auth.exception.AccountUnavailableException;
import com.ssafy.backend.auth.exception.TooManyLoginAttemptsException;
import com.ssafy.backend.auth.jwt.IssuedTokens;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.auth.repository.SocialAccountRepository;
import com.ssafy.backend.auth.support.EmailMask;
import com.ssafy.backend.auth.support.PendingSocialAuthStore;
import com.ssafy.backend.auth.support.SocialAuthorizeUrlFactory;
import com.ssafy.backend.auth.support.SocialProfile;
import com.ssafy.backend.auth.support.SocialProfileClient;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.config.oauth.OAuthProperties;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * 소셜 로그인 인증 URL 발급, 인증 코드 처리, 신규 가입과 기존 계정 연결을 담당한다.
 *
 * <p>로그인 처리(AUTH-010)에는 클래스 단위 트랜잭션을 걸지 않는다. 공급자 HTTP 호출이 최대 8초까지
 * 걸릴 수 있어 그 시간 동안 DB 커넥션을 붙잡으면 공급자 지연이 커넥션 고갈로 번진다.
 * 반대로 가입(AUTH-011)과 연결(AUTH-012)은 공급자를 호출하지 않고 임시 보관된 결과만 읽으므로
 * 여러 테이블 쓰기를 하나의 트랜잭션으로 묶는다.
 */
@Service
public class SocialAuthService {

    /** 합성 로그인 ID가 이미 쓰이고 있을 때 덧붙일 임의 문자열 길이다. */
    private static final int LOGIN_ID_SUFFIX_LENGTH = 8;

    private final SocialProfileClient socialProfileClient;
    private final SocialAuthorizeUrlFactory authorizeUrlFactory;
    private final PendingSocialAuthStore pendingSocialAuthStore;
    private final SocialAccountRepository socialAccountRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final TokenSessionStore tokenSessionStore;
    private final LoginAttemptStore loginAttemptStore;
    private final OAuthProperties properties;
    private final Clock clock;

    /**
     * 소셜 로그인 처리에 필요한 공급자 클라이언트, 저장소, 토큰 발급기와 시계를 주입받는다.
     *
     * @param socialProfileClient 공급자 사용자 정보 조회 클라이언트
     * @param authorizeUrlFactory 공급자 인증 화면 주소 생성기
     * @param pendingSocialAuthStore 소셜 인증 결과 임시 저장소
     * @param socialAccountRepository 소셜 연결 저장소
     * @param userRepository 사용자 저장소
     * @param passwordEncoder 기존 계정 연결 시 비밀번호 비교기
     * @param jwtTokenProvider JWT 발급기
     * @param tokenSessionStore 현재 토큰 세션 저장소
     * @param loginAttemptStore 비밀번호 확인 실패 누적 저장소
     * @param properties 공급자 설정
     * @param clock 마지막 로그인 시각 계산용 시계
     */
    public SocialAuthService(SocialProfileClient socialProfileClient,
                             SocialAuthorizeUrlFactory authorizeUrlFactory,
                             PendingSocialAuthStore pendingSocialAuthStore,
                             SocialAccountRepository socialAccountRepository,
                             UserRepository userRepository,
                             PasswordEncoder passwordEncoder,
                             JwtTokenProvider jwtTokenProvider,
                             TokenSessionStore tokenSessionStore,
                             LoginAttemptStore loginAttemptStore,
                             OAuthProperties properties,
                             Clock clock) {
        this.socialProfileClient = socialProfileClient;
        this.authorizeUrlFactory = authorizeUrlFactory;
        this.pendingSocialAuthStore = pendingSocialAuthStore;
        this.socialAccountRepository = socialAccountRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.tokenSessionStore = tokenSessionStore;
        this.loginAttemptStore = loginAttemptStore;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * 공급자 인증 화면으로 이동할 주소를 만든다. (AUTH-009)
     *
     * @param rawProvider 경로로 받은 공급자 문자열
     * @param state 프론트가 만들어 콜백에서 대조할 CSRF 방어용 값
     * @return 브라우저를 이동시킬 인증 URL
     * @throws BusinessException 지원하지 않거나 설정되지 않은 공급자인 경우
     */
    public SocialAuthorizeUrlResponse authorizeUrl(String rawProvider, String state) {
        SocialProvider provider = resolveUsableProvider(rawProvider);
        return new SocialAuthorizeUrlResponse(provider, authorizeUrlFactory.create(provider, state));
    }

    /**
     * 인증 코드를 검증하고 이미 연결된 계정인지에 따라 다음 단계를 결정한다. (AUTH-010)
     *
     * @param rawProvider 경로로 받은 공급자 문자열
     * @param request 인증 코드와 state
     * @return 로그인 완료, 신규 가입 필요, 기존 계정 연결 필요 중 하나
     * @throws BusinessException 공급자 설정이 없거나 인증 코드를 사용할 수 없는 경우
     * @throws AccountUnavailableException 연결된 계정이 활성 상태가 아닌 경우
     */
    public SocialLoginResponse login(String rawProvider, SocialLoginRequest request) {
        SocialProvider provider = resolveUsableProvider(rawProvider);
        // 공급자 호출을 트랜잭션 밖에서 먼저 끝낸다.
        SocialProfile profile = socialProfileClient.fetchProfile(provider, request.code(), request.state());

        Optional<SocialAccount> linked = socialAccountRepository
                .findWithUserByProviderAndProviderUserId(provider, profile.providerUserId());
        if (linked.isPresent()) {
            User user = linked.get().getUser();
            requireLoginable(user);
            return SocialLoginResponse.login(provider, issueTokens(user));
        }

        // 이메일이 같은 계정이 있으면 자동으로 붙이지 않는다. 공급자 이메일은 우리 계정의 소유를
        // 증명하지 않으므로 자동 연결은 그대로 계정 탈취 경로가 된다.
        if (profile.hasEmail()) {
            Optional<User> existing = userRepository.findByEmail(profile.email());
            if (existing.isPresent()) {
                // 계정 상태는 비밀번호 확인을 통과한 뒤에 본다. 이메일만으로 정지 여부를 알려주지 않는다.
                String maskedEmail = EmailMask.of(existing.get().getEmail());
                String token = pendingSocialAuthStore.issue(profile);
                return SocialLoginResponse.linkRequired(provider, token, maskedEmail,
                        linkRequiredMessage(provider, maskedEmail));
            }
        }

        String token = pendingSocialAuthStore.issue(profile);
        return SocialLoginResponse.signupRequired(provider, token, profile.email(),
                signupRequiredMessage(provider, profile.hasEmail()));
    }

    /**
     * 임시 보관된 소셜 인증 결과와 추가 입력값으로 신규 회원을 만든다. (AUTH-011)
     *
     * <p>역할은 요청값을 받지 않고 {@link UserRole#FAN}으로 고정한다. 인플루언서·매니저는 조직 초대
     * 흐름과 얽혀 있어 소셜 가입 경로로 만들면 권한 정책이 무너진다.
     *
     * @param request 임시 토큰과 추가 입력값
     * @return 가입과 동시에 발급된 토큰과 사용자 정보
     * @throws BusinessException 임시 토큰이 만료되었거나 이메일이 중복되는 경우
     */
    @Transactional
    public LoginResponse signup(SocialSignupRequest request) {
        SocialProfile profile = requirePending(request.socialToken());

        String email;
        boolean emailVerified;
        if (profile.hasEmail()) {
            email = profile.email();
            emailVerified = profile.emailVerified();
        } else {
            // 공급자가 이메일을 주지 않은 경우다. 직접 입력받되 공급자가 보증하지 않으므로 미인증으로 둔다.
            if (request.email() == null || request.email().isBlank()) {
                throw new BusinessException(ErrorCode.INVALID_REQUEST,
                        profile.provider().displayName()
                                + "에서 이메일을 받지 못했어요. 알림 받을 이메일을 직접 입력해 주세요.");
            }
            email = request.email().trim().toLowerCase(Locale.ROOT);
            emailVerified = false;
        }

        if (userRepository.existsByEmail(email)) {
            throw new BusinessException(ErrorCode.SOCIAL_EMAIL_ALREADY_REGISTERED,
                    EmailMask.of(email) + "은 이미 가입된 이메일이에요. 기존 방식으로 로그인한 뒤"
                            + " 마이페이지에서 " + profile.provider().displayName() + " 계정을 연결해 주세요.");
        }
        // 같은 임시 토큰이 동시에 두 번 들어오는 경우를 막는다. 유니크 제약이 최종 방어선이지만
        // 여기서 걸러야 사용자에게 원인을 설명할 수 있다.
        requireNotLinkedToOthers(profile);

        User user = User.createSocialOnly(
                uniqueLoginId(profile),
                email,
                request.nickname().trim(),
                UserRole.FAN,
                request.preferredLanguage()
        );
        if (emailVerified) {
            user.verifyEmail(LocalDateTime.now(clock));
        }
        if (profile.profileImageUrl() != null) {
            user.updateProfile(null, null, profile.profileImageUrl(), null);
        }
        User saved = userRepository.save(user);
        socialAccountRepository.save(
                SocialAccount.link(saved, profile.provider(), profile.providerUserId()));

        LoginResponse response = issueTokens(saved);
        pendingSocialAuthStore.consume(request.socialToken());
        return response;
    }

    /**
     * 비밀번호를 확인한 뒤 기존 계정에 소셜 계정을 연결하고 로그인시킨다. (AUTH-012)
     *
     * @param request 임시 토큰과 기존 계정 비밀번호
     * @return 연결과 동시에 발급된 토큰과 사용자 정보
     * @throws BusinessException 임시 토큰이 만료되었거나 비밀번호가 다른 경우
     * @throws TooManyLoginAttemptsException 비밀번호 확인 실패가 누적되어 차단된 경우
     * @throws AccountUnavailableException 대상 계정이 활성 상태가 아닌 경우
     */
    @Transactional
    public LoginResponse link(SocialLinkRequest request) {
        SocialProfile profile = requirePending(request.socialToken());
        if (!profile.hasEmail()) {
            // 이메일이 없으면 연결 대상 계정을 특정할 수 없다. 신규 가입 흐름으로 돌려보낸다.
            throw new BusinessException(ErrorCode.SOCIAL_TOKEN_INVALID,
                    "연결할 계정을 확인할 수 없어요. 처음부터 다시 "
                            + profile.provider().displayName() + " 로그인을 진행해 주세요.");
        }

        User user = userRepository.findByEmail(profile.email())
                .orElseThrow(() -> new BusinessException(ErrorCode.SOCIAL_TOKEN_INVALID,
                        "연결할 계정을 찾지 못했어요. 처음부터 다시 "
                                + profile.provider().displayName() + " 로그인을 진행해 주세요."));

        String maskedEmail = EmailMask.of(user.getEmail());
        // 비밀번호 확인도 무차별 대입 대상이므로 로그인과 같은 실패 누적·차단 정책을 적용한다.
        if (loginAttemptStore.isBlocked(user.getLoginId())) {
            throw new TooManyLoginAttemptsException();
        }
        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            if (loginAttemptStore.recordFailure(user.getLoginId())) {
                throw new TooManyLoginAttemptsException();
            }
            throw new BusinessException(ErrorCode.SOCIAL_LINK_PASSWORD_MISMATCH,
                    "비밀번호가 일치하지 않아요. " + maskedEmail + " 계정의 비밀번호를 입력해 주세요.");
        }
        loginAttemptStore.clear(user.getLoginId());
        requireLoginable(user);

        linkToUser(user, profile);
        LoginResponse response = issueTokens(user);
        pendingSocialAuthStore.consume(request.socialToken());
        return response;
    }

    /**
     * 소셜 계정을 사용자에게 연결한다.
     *
     * <p>마이페이지에서 직접 연결하는 흐름과 비밀번호 확인 후 연결하는 흐름이 같은 검증을 쓰도록 분리했다.
     *
     * @param user 연결 대상 사용자
     * @param profile 공급자에서 검증이 끝난 사용자 정보
     * @throws BusinessException 이미 다른 계정에 연결되었거나 같은 공급자가 이미 연결된 경우
     */
    SocialAccount linkToUser(User user, SocialProfile profile) {
        requireNotLinkedToOthers(profile);
        socialAccountRepository.findByUser_IdAndProvider(user.getId(), profile.provider())
                .ifPresent(existing -> {
                    throw new BusinessException(ErrorCode.SOCIAL_PROVIDER_ALREADY_LINKED,
                            "이 계정에는 이미 다른 " + profile.provider().displayName()
                                    + " 계정이 연결되어 있어요. 마이페이지에서 기존 연결을 해제한 뒤"
                                    + " 다시 연결해 주세요.");
                });
        try {
            return socialAccountRepository.saveAndFlush(
                    SocialAccount.link(user, profile.provider(), profile.providerUserId()));
        } catch (DataIntegrityViolationException exception) {
            // 위 조회와 저장 사이에 같은 연결이 들어온 경우다. 유니크 제약이 막아 주지만
            // 그대로 500을 내보내지 않고 사용자가 이해할 수 있는 문구로 바꾼다.
            throw new BusinessException(ErrorCode.SOCIAL_ACCOUNT_LINKED_TO_OTHER_USER,
                    "이 " + profile.provider().displayName()
                            + " 계정은 이미 연결되어 있어요. 잠시 후 다시 확인해 주세요.");
        }
    }

    /**
     * 공급자 인증 코드를 검증해 사용자 정보를 가져온다.
     *
     * <p>마이페이지에서 직접 연결하는 흐름(USER-005)이 같은 검증과 예외 문구를 쓰도록 공개한다.
     *
     * @param rawProvider 경로로 받은 공급자 문자열
     * @param request 인증 코드와 state
     * @return 검증이 끝난 공급자 사용자 정보
     * @throws BusinessException 공급자 설정이 없거나 인증 코드를 사용할 수 없는 경우
     */
    SocialProfile verifyProfile(String rawProvider, SocialLoginRequest request) {
        SocialProvider provider = resolveUsableProvider(rawProvider);
        return socialProfileClient.fetchProfile(provider, request.code(), request.state());
    }

    /**
     * 임시 토큰으로 보관된 소셜 인증 결과를 가져온다.
     *
     * @param socialToken 클라이언트가 제시한 임시 토큰
     * @return 보관된 공급자 사용자 정보
     * @throws BusinessException 토큰이 만료되었거나 위조된 경우
     */
    private SocialProfile requirePending(String socialToken) {
        return pendingSocialAuthStore.find(socialToken)
                .orElseThrow(() -> new BusinessException(ErrorCode.SOCIAL_TOKEN_INVALID,
                        "인증 후 시간이 너무 지났어요. 처음부터 다시 로그인해 주세요."));
    }

    /**
     * 이 소셜 계정이 다른 사용자에게 이미 연결되어 있지 않은지 확인한다.
     *
     * @param profile 확인할 공급자 사용자 정보
     * @throws BusinessException 이미 다른 계정에 연결된 경우
     */
    private void requireNotLinkedToOthers(SocialProfile profile) {
        socialAccountRepository
                .findByProviderAndProviderUserId(profile.provider(), profile.providerUserId())
                .ifPresent(existing -> {
                    throw new BusinessException(ErrorCode.SOCIAL_ACCOUNT_LINKED_TO_OTHER_USER,
                            "이 " + profile.provider().displayName()
                                    + " 계정은 이미 다른 Melly 계정에 연결되어 있어요. 그 계정으로 로그인하시거나,"
                                    + " 해당 계정에서 연결을 해제한 뒤 다시 시도해 주세요.");
                });
    }

    /**
     * 지원하며 자격 증명이 설정된 공급자인지 확인해 열거형으로 변환한다.
     *
     * @param rawProvider 경로로 받은 공급자 문자열
     * @return 사용할 수 있는 공급자
     * @throws BusinessException 지원하지 않거나 설정되지 않은 공급자인 경우
     */
    private SocialProvider resolveUsableProvider(String rawProvider) {
        SocialProvider provider = SocialProvider.from(rawProvider)
                .orElseThrow(() -> new BusinessException(ErrorCode.SOCIAL_PROVIDER_NOT_SUPPORTED,
                        "지원하지 않는 소셜 로그인이에요."));
        if (!properties.registration(provider).isUsable()) {
            // 설정 누락은 사용자가 해결할 수 없는 문제라 어느 공급자가 막혔는지만 알린다.
            throw new BusinessException(ErrorCode.SOCIAL_PROVIDER_NOT_SUPPORTED,
                    provider.displayName() + " 로그인은 현재 사용할 수 없어요. 다른 방법으로 로그인해 주세요.");
        }
        return provider;
    }

    /**
     * 계정이 로그인할 수 있는 상태인지 확인한다.
     *
     * @param user 확인할 사용자
     * @throws AccountUnavailableException 활성 상태가 아닌 경우
     */
    private void requireLoginable(User user) {
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new AccountUnavailableException();
        }
    }

    /**
     * 소셜 전용 계정에 쓸 충돌하지 않는 합성 로그인 ID를 만든다.
     *
     * <p>{@code (provider, provider_user_id)} 유니크 제약 덕분에 기본값끼리는 충돌하지 않지만,
     * 누군가 같은 문자열을 로그인 ID로 직접 가입했을 가능성까지 막는다.
     *
     * @param profile 공급자 사용자 정보
     * @return 아직 쓰이지 않은 로그인 ID
     */
    private String uniqueLoginId(SocialProfile profile) {
        String candidate = profile.provider().keyPrefix() + "_" + profile.providerUserId();
        if (!userRepository.existsByLoginId(candidate)) {
            return candidate;
        }
        return candidate + "_"
                + UUID.randomUUID().toString().replace("-", "").substring(0, LOGIN_ID_SUFFIX_LENGTH);
    }

    /**
     * 토큰을 발급하고 세션을 저장한 뒤 마지막 로그인 시각을 갱신한다.
     *
     * @param user 로그인시킬 사용자
     * @return 발급된 토큰과 사용자 정보
     */
    private LoginResponse issueTokens(User user) {
        IssuedTokens tokens = jwtTokenProvider.issue(user);
        tokenSessionStore.save(user.getId(), tokens.accessToken(), tokens.refreshToken());
        user.updateLastLoginAt(LocalDateTime.now(clock));
        // 트랜잭션이 없는 로그인 경로에서도 갱신이 반영되도록 명시적으로 저장한다.
        userRepository.save(user);
        return LoginResponse.of(user, tokens);
    }

    /** 신규 가입 화면으로 보낼 때 띄울 안내 문구를 만든다. */
    private String signupRequiredMessage(SocialProvider provider, boolean emailProvided) {
        if (!emailProvided) {
            return provider.displayName()
                    + "에서 이메일을 받지 못했어요. 알림 받을 이메일과 닉네임을 입력해 주세요.";
        }
        return "Melly가 처음이시네요. 닉네임과 사용할 언어만 정하면 바로 시작할 수 있어요.";
    }

    /** 기존 계정 연결 화면으로 보낼 때 띄울 안내 문구를 만든다. */
    private String linkRequiredMessage(SocialProvider provider, String maskedEmail) {
        String name = provider.displayName();
        return maskedEmail + "으로 이미 가입하셨네요. 비밀번호를 입력하면 " + name
                + " 계정을 이 계정에 연결해 드릴게요. 다음부터는 " + name + " 버튼 한 번으로 로그인됩니다.";
    }
}
