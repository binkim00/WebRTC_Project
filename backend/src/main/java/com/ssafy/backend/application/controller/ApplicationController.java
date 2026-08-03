package com.ssafy.backend.application.controller;

import com.ssafy.backend.application.dto.ApplicationSubmitRequest;
import com.ssafy.backend.application.dto.ApplicationSubmitResponse;
import com.ssafy.backend.application.dto.ApplicationWithdrawResponse;
import com.ssafy.backend.application.service.ApplicationService;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.support.DeviceTokenService;
import com.ssafy.backend.common.api.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 팬의 응모 제출, 취소, 재응모 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}/applications")
public class ApplicationController {

    private final ApplicationService applicationService;
    private final DeviceTokenService deviceTokenService;

    /**
     * 응모 서비스와 기기 토큰 서비스를 주입받는다.
     *
     * @param applicationService 응모 서비스
     * @param deviceTokenService 기기 토큰 쿠키 서비스
     */
    public ApplicationController(ApplicationService applicationService,
                                 DeviceTokenService deviceTokenService) {
        this.applicationService = applicationService;
        this.deviceTokenService = deviceTokenService;
    }

    /**
     * 팬의 최초 응모 또는 취소 후 재응모를 접수한다.
     *
     * <p>기기 식별값은 프론트가 보내는 값이 아니라 서버가 발급한 HttpOnly 쿠키에서만 읽는다.
     * 쿠키가 없으면 이번 응답에서 새로 발급해 다음 요청부터 같은 기기로 묶이게 한다.
     *
     * @param meetingId 응모 대상 팬미팅 식별자
     * @param request 개인정보 동의와 질문 답변
     * @param principal JWT 인증 사용자 정보
     * @param httpRequest 기기 토큰 쿠키를 읽을 HTTP 요청
     * @param httpResponse 기기 토큰 쿠키를 실을 HTTP 응답
     * @return 공통 성공 형식으로 감싼 응모 접수 결과
     */
    @PostMapping
    public ApiResponse<ApplicationSubmitResponse> submit(
            @PathVariable Long meetingId,
            @Valid @RequestBody ApplicationSubmitRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        String deviceHash = deviceTokenService.resolveOrIssueHash(httpRequest, httpResponse);
        return ApiResponse.success(
                applicationService.submit(meetingId, request, principal, deviceHash));
    }

    /**
     * 응모 기간 중인 현재 팬의 접수 건을 취소한다.
     *
     * @param meetingId 취소할 응모의 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 응모 취소 결과
     */
    @DeleteMapping("/me")
    public ApiResponse<ApplicationWithdrawResponse> withdraw(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(applicationService.withdraw(meetingId, principal));
    }
}
