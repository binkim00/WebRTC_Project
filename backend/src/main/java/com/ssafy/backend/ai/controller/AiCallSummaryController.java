package com.ssafy.backend.ai.controller;

import com.ssafy.backend.ai.dto.AiCallSummaryGeneratingResponse;
import com.ssafy.backend.ai.dto.AiCallSummaryResponse;
import com.ssafy.backend.ai.service.AiCallSummaryService;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

/** 팬미팅 운영자에게 AI 통화 요약을 제공하는 API다. */
@RestController
@RequestMapping("/api/v1/call-sessions")
public class AiCallSummaryController {

    private final AiCallSummaryService aiCallSummaryService;

    /**
     * AI 통화 요약 조회 서비스를 주입받는다.
     *
     * @param aiCallSummaryService 통화 요약 조회 서비스
     */
    public AiCallSummaryController(AiCallSummaryService aiCallSummaryService) {
        this.aiCallSummaryService = aiCallSummaryService;
    }

    /**
     * 통화 요약을 조회하고 아직 생성 중이면 생성 상태를 알린다.
     * 생성 완료 여부에 따라 상태 코드가 달라져 이 API만 ResponseEntity를 사용한다.
     *
     * @param callSessionId 조회할 통화 세션 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 생성이 끝났으면 200과 요약, 생성 중이면 202와 진행 상태
     */
    @GetMapping("/{callSessionId}/summary")
    public ResponseEntity<ApiResponse<?>> getSummary(
            @PathVariable Long callSessionId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        Optional<AiCallSummaryResponse> summary =
                aiCallSummaryService.getSummary(callSessionId, principal);
        if (summary.isPresent()) {
            return ResponseEntity.ok(ApiResponse.success(summary.get()));
        }
        return ResponseEntity.accepted()
                .body(ApiResponse.success(AiCallSummaryGeneratingResponse.generating()));
    }
}
