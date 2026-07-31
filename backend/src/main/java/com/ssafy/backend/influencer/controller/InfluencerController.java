package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.InfluencerDetailResponse;
import com.ssafy.backend.influencer.dto.InfluencerSummaryResponse;
import com.ssafy.backend.influencer.service.InfluencerQueryService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 비로그인 사용자도 접근하는 인플루언서 탐색 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/influencers")
public class InfluencerController {

    private final InfluencerQueryService influencerQueryService;

    /**
     * 인플루언서 탐색 서비스를 주입받는다.
     *
     * @param influencerQueryService 인플루언서 목록·상세 조회 서비스
     */
    public InfluencerController(InfluencerQueryService influencerQueryService) {
        this.influencerQueryService = influencerQueryService;
    }

    /**
     * 공개 대상 인플루언서를 검색어로 필터링해 최신순으로 조회한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param keyword 활동명·소개·닉네임에 적용할 검색어
     * @param principal JWT 인증 사용자 정보이며 비로그인 요청은 null
     * @return 공통 성공 형식으로 감싼 인플루언서 요약 페이지
     */
    @GetMapping
    public ApiResponse<PageResponse<InfluencerSummaryResponse>> getInfluencers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                influencerQueryService.getInfluencers(page, size, keyword, principal)
        );
    }

    /**
     * 공개 대상 인플루언서 한 명의 상세 정보와 공개 팬미팅을 조회한다.
     *
     * @param influencerId 인플루언서 사용자 식별자
     * @param principal JWT 인증 사용자 정보이며 비로그인 요청은 null
     * @return 공통 성공 형식으로 감싼 인플루언서 상세 정보
     */
    @GetMapping("/{influencerId}")
    public ApiResponse<InfluencerDetailResponse> getInfluencer(
            @PathVariable Long influencerId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(influencerQueryService.getInfluencer(influencerId, principal));
    }
}
