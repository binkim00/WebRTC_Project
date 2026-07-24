package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.LoginRequest;
import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.dto.SignupRequest;
import com.ssafy.backend.auth.dto.SignupResponse;
import com.ssafy.backend.auth.service.LoginService;
import com.ssafy.backend.auth.service.LogoutService;
import com.ssafy.backend.auth.service.SignupService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private static final String BEARER_PREFIX = "Bearer ";

    private final SignupService signupService;
    private final LoginService loginService;
    private final LogoutService logoutService;

    /**
     * 회원가입, 로그인과 로그아웃 비즈니스 로직을 처리할 서비스를 주입받는다.
     *
     * @param signupService 회원가입 서비스
     * @param loginService 로그인 서비스
     * @param logoutService 로그아웃 서비스
     */
    public AuthController(SignupService signupService, LoginService loginService, LogoutService logoutService) {
        this.signupService = signupService;
        this.loginService = loginService;
        this.logoutService = logoutService;
    }

    /** 회원가입 요청값을 검증한 뒤 사용자를 생성하고 HTTP 201 응답을 반환한다. */
    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
        public SignupResponse signup(@Valid @RequestBody SignupRequest request) {
        return signupService.signup(request);
    }

    /**
     * 로그인 요청을 인증하고 발급된 토큰과 사용자 정보를 반환한다.
     *
     * @param request 로그인 ID와 비밀번호를 담은 요청
     * @return Access·Refresh Token과 로그인 사용자 정보
     */
    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return loginService.login(request);
    }

    /**
     * 현재 요청의 Access Token을 폐기하고 본문 없는 HTTP 204 응답을 반환한다.
     *
     * @param authorization Bearer Access Token을 포함한 Authorization 헤더
     */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader("Authorization") String authorization) {
        logoutService.logout(authorization.substring(BEARER_PREFIX.length()).trim());
    }
}
