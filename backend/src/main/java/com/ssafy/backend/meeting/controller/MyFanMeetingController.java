package com.ssafy.backend.meeting.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.dto.FanMeetingSummaryResponse;
import com.ssafy.backend.meeting.service.FanMeetingQueryService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 로그인한 매니저와 인플루언서의 담당 팬미팅 조회 API를 제공한다.
 */
@RestController
@RequestMapping("/api/v1/users/me/fan-meetings")
public class MyFanMeetingController {

    private final FanMeetingQueryService queryService;

    /**
     * 팬미팅 조회 서비스를 주입받는다.
     *
     * @param queryService 팬미팅 조회 서비스
     */
    public MyFanMeetingController(FanMeetingQueryService queryService) {
        this.queryService = queryService;
    }

    /**
     * 현재 사용자가 담당하는 팬미팅을 상태별로 페이지 조회한다.
     *
     * @param status 팬미팅 상태 필터
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal 로그인 사용자 정보
     * @return 담당 팬미팅 페이지
     */
    @GetMapping
    public ApiResponse<PageResponse<FanMeetingSummaryResponse>> getMyMeetings(
            @RequestParam(required = false) FanMeetingStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(queryService.getMyMeetings(status, page, size, principal));
    }
}
