package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.influencer.dto.FanMemoCreateRequest;
import com.ssafy.backend.influencer.dto.FanMemoResponse;
import com.ssafy.backend.influencer.service.FanMemoService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 인플루언서 본인이 팬에 대해 남기는 메모 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/influencers/me/fans/{fanId}/memos")
public class FanMemoController {

    private final FanMemoService fanMemoService;

    /**
     * 팬 메모 서비스를 주입받는다.
     *
     * @param fanMemoService 팬 메모 조회·작성 서비스
     */
    public FanMemoController(FanMemoService fanMemoService) {
        this.fanMemoService = fanMemoService;
    }

    /**
     * 로그인한 인플루언서가 특정 팬에 대해 작성한 메모 목록을 조회한다.
     *
     * @param fanId 조회 대상 팬의 ID
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 삭제되지 않은 메모 목록
     */
    @GetMapping
    public ApiResponse<List<FanMemoResponse>> getMemos(
            @PathVariable Long fanId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(fanMemoService.getMemos(fanId, principal));
    }

    /**
     * 팬미팅 회차에 대한 팬 메모를 작성한다.
     *
     * @param fanId 메모 대상 팬의 ID
     * @param request 메모 내용과 회차 정보
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 생성된 메모 정보
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<FanMemoResponse> createMemo(
            @PathVariable Long fanId,
            @Valid @RequestBody FanMemoCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(fanMemoService.createMemo(fanId, request, principal));
    }
}
