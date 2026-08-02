package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.FollowCreateResponse;
import com.ssafy.backend.influencer.dto.FollowDeleteResponse;
import com.ssafy.backend.influencer.dto.FollowerSummaryResponse;
import com.ssafy.backend.influencer.dto.FollowingSummaryResponse;
import com.ssafy.backend.influencer.service.FollowingService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 인플루언서 팔로우 등록·취소와 팔로잉·팔로워 목록 API를 제공한다. */
@RestController
@RequestMapping("/api/v1")
public class FollowingController {

    private final FollowingService followingService;

    /**
     * 팔로우 서비스를 주입받는다.
     *
     * @param followingService 팔로우 서비스
     */
    public FollowingController(FollowingService followingService) {
        this.followingService = followingService;
    }

    /** 현재 팬이 지정한 인플루언서를 팔로우한다. */
    @PostMapping("/influencers/{influencerId}/follow")
    public ApiResponse<FollowCreateResponse> follow(
            @PathVariable Long influencerId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(followingService.follow(influencerId, principal));
    }

    /** 현재 팬이 지정한 인플루언서 팔로우를 취소한다. */
    @DeleteMapping("/influencers/{influencerId}/follow")
    public ApiResponse<FollowDeleteResponse> unfollow(
            @PathVariable Long influencerId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(followingService.unfollow(influencerId, principal));
    }

    /** 현재 팬의 팔로잉 목록을 조회한다. */
    @GetMapping("/users/me/followings")
    public ApiResponse<PageResponse<FollowingSummaryResponse>> getMyFollowings(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(followingService.getMyFollowings(page, size, principal));
    }

    /** 현재 인플루언서의 팔로워 목록을 조회한다. */
    @GetMapping("/influencers/me/followers")
    public ApiResponse<PageResponse<FollowerSummaryResponse>> getMyFollowers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(followingService.getMyFollowers(page, size, principal));
    }
}
