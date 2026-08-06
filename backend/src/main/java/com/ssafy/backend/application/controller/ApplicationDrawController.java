package com.ssafy.backend.application.controller;

import com.ssafy.backend.application.dto.DrawResultResponse;
import com.ssafy.backend.application.dto.ResultPublishResponse;
import com.ssafy.backend.application.service.ApplicationDrawService;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 운영자의 당첨자 추첨과 응모 결과 공개 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}/applications")
public class ApplicationDrawController {

    private final ApplicationDrawService applicationDrawService;

    /**
     * 추첨 서비스를 주입받는다.
     *
     * @param applicationDrawService 추첨·결과 공개 서비스
     */
    public ApplicationDrawController(ApplicationDrawService applicationDrawService) {
        this.applicationDrawService = applicationDrawService;
    }

    /**
     * 소유 운영자가 모집 정원만큼 당첨자를 추첨한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 추첨 결과
     */
    @PostMapping("/draw")
    public ApiResponse<DrawResultResponse> draw(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(applicationDrawService.draw(meetingId, principal));
    }

    /**
     * 소유 운영자가 응모 결과를 공개하고 응모자에게 알림을 보낸다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 결과 공개 정보
     */
    @PostMapping("/results/publish")
    public ApiResponse<ResultPublishResponse> publishResults(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(applicationDrawService.publishResults(meetingId, principal));
    }
}
