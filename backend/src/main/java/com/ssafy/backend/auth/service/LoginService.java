package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.LoginRequest;
import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.exception.AccountUnavailableException;
import com.ssafy.backend.auth.exception.InvalidCredentialsException;
import com.ssafy.backend.auth.exception.TooManyLoginAttemptsException;
import com.ssafy.backend.auth.jwt.IssuedTokens;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 아이디·비밀번호 인증, 계정 상태 검증, JWT 발급과 마지막 로그인 갱신을 담당한다. */
@Service
public class LoginService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final TokenSessionStore tokenSessionStore;
    private final LoginAttemptStore loginAttemptStore;
    private final Clock clock;

    /**
     * 로그인에 필요한 사용자·세션·실패 저장소, 암호 비교기, 토큰 발급기와 시계를 주입받는다.
     *
     * @param userRepository 사용자 저장소
     * @param passwordEncoder 비밀번호 비교기
     * @param jwtTokenProvider JWT 발급기
     * @param tokenSessionStore 현재 토큰 세션 저장소
     * @param loginAttemptStore 로그인 실패 및 차단 저장소
     * @param clock 마지막 로그인 시각 계산용 시계
     */
    public LoginService(UserRepository userRepository, PasswordEncoder passwordEncoder,
                        JwtTokenProvider jwtTokenProvider, TokenSessionStore tokenSessionStore,
                        LoginAttemptStore loginAttemptStore, Clock clock) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.tokenSessionStore = tokenSessionStore;
        this.loginAttemptStore = loginAttemptStore;
        this.clock = clock;
    }

    /** 요청을 인증하고 토큰을 발급한 뒤 성공한 경우에만 마지막 로그인 시각을 갱신한다. */
    @Transactional
    public LoginResponse login(LoginRequest request) {
        String loginId = request.loginId().trim();
        if (loginAttemptStore.isBlocked(loginId)) {
            throw new TooManyLoginAttemptsException();
        }
        // 사용자 존재 여부와 비밀번호 불일치를 같은 예외로 처리해 계정 정보 노출을 막는다.
        User user = userRepository.findByLoginId(loginId)
                .orElse(null);

        if (user == null || !passwordEncoder.matches(request.password(), user.getPassword())) {
            rejectInvalidCredentials(loginId);
        }
        loginAttemptStore.clear(loginId);
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new AccountUnavailableException();
        }

        // 인증과 계정 상태 검증을 모두 통과한 뒤에만 토큰 발급과 로그인 시각 갱신을 수행한다.
        IssuedTokens tokens = jwtTokenProvider.issue(user);
        tokenSessionStore.save(user.getId(), tokens.accessToken(), tokens.refreshToken());
        user.updateLastLoginAt(LocalDateTime.now(clock));
        return LoginResponse.of(user, tokens);
    }

    /**
     * 로그인 실패를 누적하고 차단 기준에 따라 공통 인증 예외를 발생시킨다.
     *
     * @param loginId 실패 횟수를 기록할 정규화된 로그인 ID
     */
    private void rejectInvalidCredentials(String loginId) {
        if (loginAttemptStore.recordFailure(loginId)) {
            throw new TooManyLoginAttemptsException();
        }
        throw new InvalidCredentialsException();
    }
}
