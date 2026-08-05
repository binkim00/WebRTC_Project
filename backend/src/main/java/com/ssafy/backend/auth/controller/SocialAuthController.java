package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.dto.SocialAuthorizeUrlResponse;
import com.ssafy.backend.auth.dto.SocialLinkRequest;
import com.ssafy.backend.auth.dto.SocialLoginRequest;
import com.ssafy.backend.auth.dto.SocialLoginResponse;
import com.ssafy.backend.auth.dto.SocialSignupRequest;
import com.ssafy.backend.auth.service.SocialAuthService;
import com.ssafy.backend.auth.support.DeviceTokenService;
import com.ssafy.backend.common.api.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 소셜 로그인 인증 시작, 인증 코드 처리, 신규 가입과 기존 계정 연결 API다. (AUTH-009~012) */
@RestController
@RequestMapping("/api/v1/auth/social")
public class SocialAuthController {

    private final SocialAuthService socialAuthService;
    private final DeviceTokenService deviceTokenService;

    /**
     * 소셜 인증 서비스와 기기 토큰 발급 서비스를 주입받는다.
     *
     * @param socialAuthService 소셜 로그인 처리 서비스
     * @param deviceTokenService 기기 토큰 쿠키 발급 서비스
     */
    public SocialAuthController(SocialAuthService socialAuthService,
                                DeviceTokenService deviceTokenService) {
        this.socialAuthService = socialAuthService;
        this.deviceTokenService = deviceTokenService;
    }

    /**
     * 공급자 인증 화면으로 이동할 주소를 발급한다. (AUTH-009)
     *
     * <p>{@code state}는 프론트가 만들어 세션 저장소에 보관한 뒤 콜백에서 대조해야 CSRF 방어가 성립한다.
     * 서버는 전달받은 값을 인증 URL에 실어 주기만 한다.
     *
     * @param provider 공급자 경로 변수(google, kakao, naver)
     * @param state 프론트가 생성한 CSRF 방어용 값
     * @return 브라우저를 이동시킬 인증 URL
     */
    @GetMapping("/{provider}/authorize-url")
    public ApiResponse<SocialAuthorizeUrlResponse> authorizeUrl(@PathVariable String provider,
                                                                @RequestParam(required = false) String state) {
        return ApiResponse.success(socialAuthService.authorizeUrl(provider, state));
    }

    /**
     * 콜백으로 받은 인증 코드를 검증해 로그인하거나 다음 단계를 안내한다. (AUTH-010)
     *
     * <p>이미 연결된 계정이면 기기 토큰 쿠키까지 발급해 아이디·비밀번호 로그인과 동일한 상태로 만든다.
     *
     * @param provider 공급자 경로 변수
     * @param request 인증 코드와 state
     * @param httpRequest 기기 토큰 쿠키를 읽을 HTTP 요청
     * @param httpResponse 기기 토큰 쿠키를 실을 HTTP 응답
     * @return 로그인 완료, 신규 가입 필요, 기존 계정 연결 필요 중 하나
     */
    @PostMapping("/{provider}/login")
    public ApiResponse<SocialLoginResponse> login(@PathVariable String provider,
                                                  @Valid @RequestBody SocialLoginRequest request,
                                                  HttpServletRequest httpRequest,
                                                  HttpServletResponse httpResponse) {
        SocialLoginResponse response = socialAuthService.login(provider, request);
        if (response.login() != null) {
            deviceTokenService.resolveOrIssueHash(httpRequest, httpResponse);
        }
        return ApiResponse.success(response);
    }

    /**
     * 추가정보를 받아 소셜 전용 계정을 만들고 곧바로 로그인시킨다. (AUTH-011)
     *
     * @param request 임시 토큰과 추가 입력값
     * @param httpRequest 기기 토큰 쿠키를 읽을 HTTP 요청
     * @param httpResponse 기기 토큰 쿠키를 실을 HTTP 응답
     * @return 발급된 토큰과 사용자 정보
     */
    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<LoginResponse> signup(@Valid @RequestBody SocialSignupRequest request,
                                             HttpServletRequest httpRequest,
                                             HttpServletResponse httpResponse) {
        LoginResponse response = socialAuthService.signup(request);
        deviceTokenService.resolveOrIssueHash(httpRequest, httpResponse);
        return ApiResponse.success(response);
    }

    /**
     * 비밀번호를 확인해 기존 계정에 소셜 계정을 연결하고 로그인시킨다. (AUTH-012)
     *
     * @param request 임시 토큰과 기존 계정 비밀번호
     * @param httpRequest 기기 토큰 쿠키를 읽을 HTTP 요청
     * @param httpResponse 기기 토큰 쿠키를 실을 HTTP 응답
     * @return 발급된 토큰과 사용자 정보
     */
    @PostMapping("/link")
    public ApiResponse<LoginResponse> link(@Valid @RequestBody SocialLinkRequest request,
                                           HttpServletRequest httpRequest,
                                           HttpServletResponse httpResponse) {
        LoginResponse response = socialAuthService.link(request);
        deviceTokenService.resolveOrIssueHash(httpRequest, httpResponse);
        return ApiResponse.success(response);
    }
}
