package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.LoginRequest;
import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.exception.AccountUnavailableException;
import com.ssafy.backend.auth.exception.InvalidCredentialsException;
import com.ssafy.backend.auth.jwt.IssuedTokens;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
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
    private final Clock clock;

    /** 로그인에 필요한 사용자 저장소, 암호 비교기, 토큰 발급기와 서버 시계를 주입받는다. */
    public LoginService(UserRepository userRepository, PasswordEncoder passwordEncoder,
                        JwtTokenProvider jwtTokenProvider, Clock clock) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.clock = clock;
    }

    /** 요청을 인증하고 토큰을 발급한 뒤 성공한 경우에만 마지막 로그인 시각을 갱신한다. */
    @Transactional
        public LoginResponse login(LoginRequest request) {
        String loginId = request.loginId().trim();
        // 사용자 존재 여부와 비밀번호 불일치를 같은 예외로 처리해 계정 정보 노출을 막는다.
        User user = userRepository.findByLoginId(loginId)
                .orElseThrow(InvalidCredentialsException::new);

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new InvalidCredentialsException();
        }
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new AccountUnavailableException();
        }

        // 인증과 계정 상태 검증을 모두 통과한 뒤에만 토큰 발급과 로그인 시각 갱신을 수행한다.
        IssuedTokens tokens = jwtTokenProvider.issue(user);
        user.updateLastLoginAt(LocalDateTime.now(clock));
        return LoginResponse.of(user, tokens);
    }
}
