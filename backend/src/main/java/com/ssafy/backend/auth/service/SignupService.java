package com.ssafy.backend.auth.service;

import com.ssafy.backend.auth.dto.SignupRequest;
import com.ssafy.backend.auth.dto.SignupResponse;
import com.ssafy.backend.auth.exception.DuplicateEmailException;
import com.ssafy.backend.auth.exception.DuplicateLoginIdException;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.support.RequestRateLimiter;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;

@Service
public class SignupService {

    /** 가입 요청 제한을 관리하는 제한 이름이다. */
    private static final String SIGNUP_SCOPE = "auth:signup";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final RequestRateLimiter rateLimiter;
    private final int rateLimitCount;
    private final Duration rateLimitWindow;

    /**
     * 사용자 저장소, 비밀번호 암호화기와 가입 요청 제한 정책을 주입받는다.
     *
     * @param userRepository 사용자 저장소
     * @param passwordEncoder 비밀번호 암호화기
     * @param rateLimiter 요청 제한기
     * @param rateLimitCount 구간당 허용할 가입 요청 수
     * @param rateLimitWindowSeconds 가입 요청을 집계할 구간(초)
     */
    public SignupService(UserRepository userRepository,
                         PasswordEncoder passwordEncoder,
                         RequestRateLimiter rateLimiter,
                         @Value("${app.auth.signup-rate-limit-count}") int rateLimitCount,
                         @Value("${app.auth.signup-rate-limit-window-seconds}") long rateLimitWindowSeconds) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.rateLimiter = rateLimiter;
        this.rateLimitCount = rateLimitCount;
        this.rateLimitWindow = Duration.ofSeconds(rateLimitWindowSeconds);
    }

    /**
     * 중복값을 검사하고 비밀번호를 암호화한 뒤 신규 사용자를 저장한다.
     *
     * <p>다계정을 대량으로 만드는 시도를 억제하기 위해 같은 IP의 짧은 구간 반복 가입을 제한한다.
     *
     * @param request 회원가입 요청 값
     * @param clientIp 요청 제한에 사용할 클라이언트 IP
     * @return 생성된 사용자 정보
     * @throws BusinessException 같은 IP의 가입 요청이 제한을 넘은 경우
     * @throws DuplicateLoginIdException 로그인 ID가 이미 사용 중인 경우
     * @throws DuplicateEmailException 이메일이 이미 사용 중인 경우
     */
    @Transactional
        public SignupResponse signup(SignupRequest request, String clientIp) {
        if (!rateLimiter.tryConsume(SIGNUP_SCOPE, clientIp, rateLimitCount, rateLimitWindow)) {
            throw new BusinessException(
                    ErrorCode.TOO_MANY_REQUESTS, rateLimiter.retryAfterSeconds(SIGNUP_SCOPE, clientIp));
        }
        // 앞뒤 공백과 이메일 대소문자 차이로 중복 검사가 우회되지 않도록 값을 정규화한다.
        String loginId = request.loginId().trim();
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByLoginId(loginId)) {
            throw new DuplicateLoginIdException();
        }
        if (userRepository.existsByEmail(email)) {
            throw new DuplicateEmailException();
        }
        // 비밀번호 원문은 저장하지 않고 PasswordEncoder가 만든 해시만 엔티티에 전달한다.
        User user = User.createActive(
                loginId,
                email,
                passwordEncoder.encode(request.password()),
                request.nickname().trim(),
                request.role(),
                request.preferredLanguage()
        );
        // 저장 과정에서 생성된 ID와 createdAt을 포함하도록 저장 결과로 응답 DTO를 만든다.
        return SignupResponse.from(userRepository.save(user));
    }
}
