package com.ssafy.backend.livekit.controller;

import com.ssafy.backend.livekit.dto.LiveKitTokenRequest;
import com.ssafy.backend.livekit.dto.LiveKitTokenResponse;
import com.ssafy.backend.livekit.service.LiveKitTokenService;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/livekit")
@ConditionalOnProperty(prefix = "livekit", name = "test-token-enabled", havingValue = "true")
public class LiveKitTokenController {

    private final LiveKitTokenService tokenService;

    /** 테스트용 LiveKit 토큰 생성 서비스를 주입받는다. */
    public LiveKitTokenController(LiveKitTokenService tokenService) {
        this.tokenService = tokenService;
    }

    /** 검증된 사용자 식별자로 테스트 방 입장용 LiveKit 토큰을 발급한다. */
    @PostMapping("/test-token")
    public LiveKitTokenResponse createTestToken(@Valid @RequestBody LiveKitTokenRequest request) {
        return tokenService.createTestToken(request.identity(), request.displayName(), request.metadata());
    }
}
