package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.LoginRequest;
import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.dto.RefreshTokenRequest;
import com.ssafy.backend.auth.dto.SignupRequest;
import com.ssafy.backend.auth.dto.SignupResponse;
import com.ssafy.backend.auth.service.DeviceTokenService;
import com.ssafy.backend.auth.service.LoginService;
import com.ssafy.backend.auth.service.LogoutService;
import com.ssafy.backend.auth.service.RefreshTokenService;
import com.ssafy.backend.auth.service.SignupService;
import com.ssafy.backend.common.support.ClientIpResolver;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private static final String BEARER_PREFIX = "Bearer ";

    private final SignupService signupService;
    private final LoginService loginService;
    private final LogoutService logoutService;
    private final RefreshTokenService refreshTokenService;
    private final DeviceTokenService deviceTokenService;

    /**
     * 회원가입, 로그인과 로그아웃 비즈니스 로직을 처리할 서비스를 주입받는다.
     *
     * @param signupService 회원가입 서비스
     * @param loginService 로그인 서비스
     * @param logoutService 로그아웃 서비스
     * @param refreshTokenService 토큰 재발급 서비스
     * @param deviceTokenService 기기 토큰 발급 서비스
     */
    public AuthController(SignupService signupService, LoginService loginService,
                          LogoutService logoutService, RefreshTokenService refreshTokenService,
                          DeviceTokenService deviceTokenService) {
        this.signupService = signupService;
        this.loginService = loginService;
        this.logoutService = logoutService;
        this.refreshTokenService = refreshTokenService;
        this.deviceTokenService = deviceTokenService;
    }

    /**
     * 회원가입 요청값을 검증한 뒤 사용자를 생성하고 HTTP 201 응답을 반환한다.
     *
     * @param request 회원가입 요청 값
     * @param deviceToken 이미 발급된 기기 토큰 쿠키 값이며 없으면 {@code null}
     * @param httpRequest 요청 제한에 사용할 요청 정보
     * @param httpResponse 기기 쿠키를 내려줄 응답
     * @return 생성된 사용자 정보
     */
    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
        public SignupResponse signup(
            @Valid @RequestBody SignupRequest request,
            @CookieValue(value = DeviceTokenService.COOKIE_NAME, required = false) String deviceToken,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        SignupResponse response = signupService.signup(request, ClientIpResolver.resolve(httpRequest));
        attachDeviceCookie(deviceToken, httpResponse);
        return response;
    }

    /**
     * 로그인 요청을 인증하고 발급된 토큰과 사용자 정보를 반환한다.
     *
     * @param request 로그인 ID와 비밀번호를 담은 요청
     * @param deviceToken 이미 발급된 기기 토큰 쿠키 값이며 없으면 {@code null}
     * @param httpResponse 기기 쿠키를 내려줄 응답
     * @return Access·Refresh Token과 로그인 사용자 정보
     */
    @PostMapping("/login")
    public LoginResponse login(
            @Valid @RequestBody LoginRequest request,
            @CookieValue(value = DeviceTokenService.COOKIE_NAME, required = false) String deviceToken,
            HttpServletResponse httpResponse
    ) {
        LoginResponse response = loginService.login(request);
        attachDeviceCookie(deviceToken, httpResponse);
        return response;
    }

    /**
     * 유효한 Refresh Token을 새 Access·Refresh Token 쌍으로 교체한다.
     *
     * <p>경로는 API 명세(AUTH-003)의 {@code POST /api/v1/auth/reissue}를 따른다.
     * 이전 경로 {@code /api/v1/auth/refresh}는 프론트엔드 연동 전이므로 남겨 두지 않는다.
     *
     * @param request 현재 Refresh Token을 담은 요청
     * @return 회전된 토큰과 사용자 정보
     */
    @PostMapping("/reissue")
    public LoginResponse reissue(@Valid @RequestBody RefreshTokenRequest request) {
        return refreshTokenService.refresh(request);
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

    /**
     * 기기 쿠키가 없는 브라우저에만 새 기기 토큰을 내려준다.
     *
     * <p>기존 쿠키를 덮어쓰면 같은 브라우저가 매번 새 기기로 보여 중복 판정이 무력화되므로
     * 발급은 쿠키가 없을 때만 한다.
     *
     * @param deviceToken 요청에 담겨 온 기기 쿠키 값이며 없으면 {@code null}
     * @param httpResponse 쿠키를 추가할 응답
     */
    private void attachDeviceCookie(String deviceToken, HttpServletResponse httpResponse) {
        deviceTokenService.issueIfAbsent(deviceToken)
                .ifPresent(cookie -> httpResponse.addHeader(HttpHeaders.SET_COOKIE, cookie.toString()));
    }
}
