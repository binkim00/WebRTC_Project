package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.EmailVerificationConfirmRequest;
import com.ssafy.backend.auth.dto.EmailVerificationSendResponse;
import com.ssafy.backend.auth.dto.EmailVerificationStatusResponse;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.service.EmailVerificationService;
import com.ssafy.backend.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 로그인한 사용자의 이메일 인증 메일 발송과 토큰 확인 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/auth/email-verifications")
public class EmailVerificationController {

    private final EmailVerificationService emailVerificationService;

    /**
     * 이메일 인증 서비스를 주입받는다.
     *
     * @param emailVerificationService 이메일 인증 서비스
     */
    public EmailVerificationController(EmailVerificationService emailVerificationService) {
        this.emailVerificationService = emailVerificationService;
    }

    /**
     * 현재 로그인한 사용자의 이메일로 인증 링크를 발송한다.
     *
     * <p>API 명세 AUTH-005에 해당한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 만료 시각과 재발송 가능 시각
     */
    @PostMapping
    public ApiResponse<EmailVerificationSendResponse> send(
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(emailVerificationService.send(principal));
    }

    /**
     * 인증 메일을 다시 발송한다.
     *
     * <p>API 명세 AUTH-006에 해당하며, 재발송 간격과 시간당 상한은 최초 발송과 같은 정책을 적용한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 만료 시각과 재발송 가능 시각
     */
    @PostMapping("/resend")
    public ApiResponse<EmailVerificationSendResponse> resend(
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(emailVerificationService.send(principal));
    }

    /**
     * 메일로 받은 토큰을 검증해 이메일 인증을 완료한다.
     *
     * <p>API 명세 AUTH-007에 해당한다.
     *
     * @param request 인증 토큰 원문
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 인증 완료 상태
     */
    @PostMapping("/confirm")
    public ApiResponse<EmailVerificationStatusResponse> confirm(
            @Valid @RequestBody EmailVerificationConfirmRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(emailVerificationService.confirm(principal, request));
    }

    /**
     * 현재 로그인한 사용자의 이메일 인증 상태를 조회한다.
     *
     * <p>API 명세 AUTH-008에 해당하며, 프로필 조회에서 뺀 인증 완료 시각을 여기서 제공한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 인증 상태
     */
    @GetMapping
    public ApiResponse<EmailVerificationStatusResponse> status(
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(emailVerificationService.status(principal));
    }
}
