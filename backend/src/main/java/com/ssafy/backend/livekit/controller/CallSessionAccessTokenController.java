package com.ssafy.backend.livekit.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.livekit.dto.LiveKitAccessTokenResponse;
import com.ssafy.backend.livekit.service.LiveKitAccessTokenService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 실제 팬미팅 통화 세션의 LiveKit 입장 토큰 API를 제공한다.
 */
@RestController
@RequestMapping("/api/v1/call-sessions")
public class CallSessionAccessTokenController {

    private final LiveKitAccessTokenService accessTokenService;

    /**
     * 팬미팅 LiveKit 입장 토큰 발급 서비스를 주입받는다.
     *
     * @param accessTokenService 실제 통화 세션 입장 토큰 발급 서비스
     */
    public CallSessionAccessTokenController(LiveKitAccessTokenService accessTokenService) {
        this.accessTokenService = accessTokenService;
    }

    /**
     * 로그인 사용자가 참여할 수 있는 통화 세션의 LiveKit 입장 토큰을 발급한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @param principal     JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 LiveKit 연결 정보
     */
    @PostMapping("/{callSessionId}/access-token")
    public ApiResponse<LiveKitAccessTokenResponse> issueAccessToken(
            @PathVariable Long callSessionId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(accessTokenService.issue(callSessionId, principal));
    }
}
