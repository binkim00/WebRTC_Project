package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.dto.RefreshTokenRequest;
import com.ssafy.backend.auth.exception.InvalidRefreshTokenException;
import com.ssafy.backend.auth.jwt.IssuedTokens;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RefreshTokenPrincipal;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Refresh Token을 검증하고 회전된 Access·Refresh Token을 재발급한다. */
@Service
public class RefreshTokenService {
    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final TokenSessionStore tokenSessionStore;

    /**
     * 사용자 저장소, JWT 제공자와 Redis 토큰 세션 저장소를 주입받는다.
     *
     * @param userRepository 사용자 저장소
     * @param jwtTokenProvider Refresh Token 검증 및 토큰 발급기
     * @param tokenSessionStore 현재 토큰 세션 저장소
     */
    public RefreshTokenService(UserRepository userRepository,
                               JwtTokenProvider jwtTokenProvider,
                               TokenSessionStore tokenSessionStore) {
        this.userRepository = userRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.tokenSessionStore = tokenSessionStore;
    }

    /**
     * 현재 세션의 Refresh Token을 검증하고 새 토큰 쌍으로 회전한다.
     *
     * @param request 재발급에 사용할 Refresh Token 요청
     * @return 새 Access·Refresh Token과 사용자 정보
     * @throws InvalidRefreshTokenException 토큰 또는 사용자 세션이 유효하지 않은 경우
     */
    @Transactional(readOnly = true)
    public LoginResponse refresh(RefreshTokenRequest request) {
        String refreshToken = request.refreshToken();
        RefreshTokenPrincipal principal = jwtTokenProvider.parseRefreshToken(refreshToken);
        if (!tokenSessionStore.isCurrentRefreshToken(principal.userId(), refreshToken)) {
            throw new InvalidRefreshTokenException();
        }

        User user = userRepository.findById(principal.userId())
                .filter(candidate -> candidate.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(InvalidRefreshTokenException::new);
        IssuedTokens tokens = jwtTokenProvider.issue(user);
        tokenSessionStore.save(user.getId(), tokens.accessToken(), tokens.refreshToken());
        return LoginResponse.of(user, tokens);
    }
}
