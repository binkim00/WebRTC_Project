package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.SocialAccountResponse;
import com.ssafy.backend.auth.dto.SocialLoginRequest;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.service.SocialAccountService;
import com.ssafy.backend.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 마이페이지의 소셜 계정 연결 조회·추가·해제 API다. (USER-004~006) */
@RestController
@RequestMapping("/api/v1/users/me/social-accounts")
public class SocialAccountController {

    private final SocialAccountService socialAccountService;

    /**
     * 소셜 계정 연결 관리 서비스를 주입받는다.
     *
     * @param socialAccountService 연결 조회·추가·해제 서비스
     */
    public SocialAccountController(SocialAccountService socialAccountService) {
        this.socialAccountService = socialAccountService;
    }

    /**
     * 현재 사용자에게 연결된 소셜 계정 목록을 조회한다. (USER-004)
     *
     * @param principal JWT 인증 사용자 정보
     * @return 연결된 공급자 목록
     */
    @GetMapping
    public ApiResponse<List<SocialAccountResponse>> list(
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return ApiResponse.success(socialAccountService.list(principal));
    }

    /**
     * 로그인한 계정에 소셜 계정을 연결한다. (USER-005)
     *
     * @param principal JWT 인증 사용자 정보
     * @param provider 공급자 경로 변수(google, kakao, naver)
     * @param request 인증 코드와 state
     * @return 새로 만들어진 연결 정보
     */
    @PostMapping("/{provider}")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<SocialAccountResponse> link(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable String provider,
            @Valid @RequestBody SocialLoginRequest request) {
        return ApiResponse.success(socialAccountService.link(principal, provider, request));
    }

    /**
     * 연결된 소셜 계정을 해제하고 본문 없는 HTTP 204 응답을 반환한다. (USER-006)
     *
     * @param principal JWT 인증 사용자 정보
     * @param provider 공급자 경로 변수
     */
    @DeleteMapping("/{provider}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlink(@AuthenticationPrincipal AuthenticatedUser principal,
                       @PathVariable String provider) {
        socialAccountService.unlink(principal, provider);
    }
}
