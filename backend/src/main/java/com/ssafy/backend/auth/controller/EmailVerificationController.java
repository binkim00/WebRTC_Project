package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.EmailVerificationConfirmRequest;
import com.ssafy.backend.auth.dto.EmailVerificationConfirmResponse;
import com.ssafy.backend.auth.dto.EmailVerificationSendResponse;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.service.EmailVerificationService;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.support.ClientIpResolver;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 이메일 인증 메일 발송과 링크 확인 API를 제공한다. */
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
     * 현재 로그인 사용자의 이메일로 인증 메일을 발송한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 발송 결과
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
     * <p>발송과 동일한 처리이며 이전 링크는 무효화된다. 명세가 별도 경로를 요구해 따로 노출한다.
     *
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 재발송 결과
     */
    @PostMapping("/resend")
    public ApiResponse<EmailVerificationSendResponse> resend(
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(emailVerificationService.send(principal));
    }

    /**
     * 메일 링크의 토큰으로 이메일 소유 확인을 완료한다.
     *
     * @param request 인증 토큰을 담은 요청
     * @param httpRequest 확인 시도 제한에 사용할 요청 정보
     * @return 공통 성공 형식으로 감싼 인증 완료 결과
     */
    @PostMapping("/confirm")
    public ApiResponse<EmailVerificationConfirmResponse> confirm(
            @Valid @RequestBody EmailVerificationConfirmRequest request,
            HttpServletRequest httpRequest
    ) {
        return ApiResponse.success(emailVerificationService.confirm(
                request.token(), ClientIpResolver.resolve(httpRequest)));
    }
}
