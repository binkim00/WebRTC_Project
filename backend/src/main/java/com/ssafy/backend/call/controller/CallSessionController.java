package com.ssafy.backend.call.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.dto.CallSessionEndResponse;
import com.ssafy.backend.call.dto.CallSessionStatusResponse;
import com.ssafy.backend.call.dto.ForceEndCallRequest;
import com.ssafy.backend.call.service.CallSessionService;
import com.ssafy.backend.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 통화 상태 조회와 강제 종료 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/call-sessions")
public class CallSessionController {

    private final CallSessionService callSessionService;

    /**
     * 통화 세션 애플리케이션 서비스를 주입받는다.
     *
     * @param callSessionService 통화 상태 조회·종료 서비스
     */
    public CallSessionController(CallSessionService callSessionService) {
        this.callSessionService = callSessionService;
    }

    /**
     * 통화 관계 사용자에게 서버 기준 현재 통화 상태를 반환한다.
     *
     * @param callSessionId 조회할 통화 세션 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 통화 상태
     */
    @GetMapping("/{callSessionId}")
    public ApiResponse<CallSessionStatusResponse> getStatus(
            @PathVariable Long callSessionId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(callSessionService.getStatus(callSessionId, principal));
    }

    /**
     * 매니저 또는 인플루언서가 활성 통화를 즉시 종료한다.
     *
     * @param callSessionId 종료할 통화 세션 식별자
     * @param request 강제 종료 사유
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 종료 결과
     */
    @PostMapping("/{callSessionId}/force-end")
    public ApiResponse<CallSessionEndResponse> forceEnd(
            @PathVariable Long callSessionId,
            @Valid @RequestBody ForceEndCallRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                callSessionService.forceEnd(callSessionId, request.reason(), principal));
    }
}
