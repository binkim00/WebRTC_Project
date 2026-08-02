package com.ssafy.backend.user.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.user.dto.MyProfileResponse;
import com.ssafy.backend.user.dto.MyProfileUpdateRequest;
import com.ssafy.backend.user.dto.MyProfileUpdateResponse;
import com.ssafy.backend.user.dto.UserWithdrawRequest;
import com.ssafy.backend.user.dto.UserWithdrawResponse;
import com.ssafy.backend.user.service.UserProfileService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 현재 사용자의 공통 회원 정보 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/users/me")
public class UserController {

    private static final String BEARER_PREFIX = "Bearer ";

    private final UserProfileService userProfileService;

    /**
     * 내 정보 조회·수정과 회원탈퇴 서비스를 주입받는다.
     *
     * @param userProfileService 사용자 회원 정보 서비스
     */
    public UserController(UserProfileService userProfileService) {
        this.userProfileService = userProfileService;
    }

    /**
     * 현재 로그인한 사용자의 공통 회원 정보를 조회한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 내 정보
     */
    @GetMapping
    public ApiResponse<MyProfileResponse> getMyProfile(
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(userProfileService.getMyProfile(principal));
    }

    /**
     * 현재 로그인한 사용자의 전달된 회원 정보만 수정한다.
     *
     * @param request 부분 수정할 회원 정보
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 수정 후 내 정보
     */
    @PatchMapping
    public ApiResponse<MyProfileUpdateResponse> updateMyProfile(
            @Valid @RequestBody MyProfileUpdateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(userProfileService.updateMyProfile(principal, request));
    }

    /**
     * 비밀번호를 재확인한 뒤 현재 로그인한 사용자의 계정을 탈퇴 상태로 전환한다.
     *
     * @param request 본인 확인용 비밀번호
     * @param authorization Bearer Access Token을 포함한 Authorization 헤더
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 탈퇴 결과
     */
    @DeleteMapping
    public ApiResponse<UserWithdrawResponse> withdraw(
            @Valid @RequestBody UserWithdrawRequest request,
            @RequestHeader("Authorization") String authorization,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(userProfileService.withdraw(
                request, authorization.substring(BEARER_PREFIX.length()).trim(), principal));
    }
}
