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

    public LiveKitTokenController(LiveKitTokenService tokenService) {
        this.tokenService = tokenService;
    }

    @PostMapping("/test-token")
    public LiveKitTokenResponse createTestToken(@Valid @RequestBody LiveKitTokenRequest request) {
        return tokenService.createTestToken(request.identity(), request.displayName(), request.metadata());
    }
}
