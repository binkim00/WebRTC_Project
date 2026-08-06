package com.ssafy.backend.ai.controller;

import com.ssafy.backend.ai.dto.FanCardCandidatesResponse;
import com.ssafy.backend.ai.dto.FanCardResponse;
import com.ssafy.backend.ai.dto.FanCardSaveRequest;
import com.ssafy.backend.ai.service.FanCardService;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 팬에게 통화 기념 카드 문구 후보를 제공하고 선택한 문구를 저장하는 API다. */
@RestController
@RequestMapping("/api/v1/call-sessions")
public class FanCardController {

    private final FanCardService fanCardService;

    /**
     * 기념 카드 서비스를 주입받는다.
     *
     * @param fanCardService 기념 카드 조회·저장 서비스
     */
    public FanCardController(FanCardService fanCardService) {
        this.fanCardService = fanCardService;
    }

    /**
     * 팬이 고를 수 있는 기념 카드 문구 후보와 이미 저장한 카드를 조회한다.
     *
     * <p>AI 추천이 아직 준비되지 않아도 자막에서 직접 고를 수 있어야 하므로 항상 200으로 응답하고,
     * 추천 준비 상태는 응답의 {@code suggestionStatus}로 알린다.
     *
     * @param callSessionId 카드를 만들 통화 세션 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 추천 문구, 인플루언서 발화 목록, 저장된 카드
     */
    @GetMapping("/{callSessionId}/fan-card-candidates")
    public ApiResponse<FanCardCandidatesResponse> getCandidates(
            @PathVariable Long callSessionId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(fanCardService.getCandidates(callSessionId, principal));
    }

    /**
     * 팬이 고른 문구를 기념 카드로 저장한다.
     *
     * <p>카드는 통화 세션당 한 장이며 다시 고르면 문구를 교체하므로 멱등한 PUT으로 받는다.
     *
     * @param callSessionId 카드를 만들 통화 세션 식별자
     * @param request 팬이 고른 문구
     * @param principal JWT 인증 사용자 정보
     * @return 저장된 기념 카드
     */
    @PutMapping("/{callSessionId}/fan-card")
    public ApiResponse<FanCardResponse> saveCard(
            @PathVariable Long callSessionId,
            @Valid @RequestBody FanCardSaveRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                fanCardService.saveCard(callSessionId, request.text(), principal));
    }
}
