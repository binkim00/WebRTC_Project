package com.ssafy.backend.queue.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;
import com.ssafy.backend.queue.dto.QueueChangeRequestSummaryResponse;
import com.ssafy.backend.queue.service.QueueChangeRequestService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 팬미팅 단위 순서 변경 요청 목록 조회 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}/queue-change-requests")
public class FanMeetingQueueChangeRequestController {

    private final QueueChangeRequestService changeRequestService;

    /**
     * 순서 변경 요청 서비스를 주입받는다.
     *
     * @param changeRequestService 순서 변경 요청 서비스
     */
    public FanMeetingQueueChangeRequestController(QueueChangeRequestService changeRequestService) {
        this.changeRequestService = changeRequestService;
    }

    /**
     * 매니저가 팬미팅에 접수된 순서 변경 요청을 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 조회할 처리 상태이며 생략하면 전체를 조회한다
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 순서 변경 요청 페이지
     */
    @GetMapping
    public ApiResponse<PageResponse<QueueChangeRequestSummaryResponse>> getChangeRequests(
            @PathVariable Long meetingId,
            @RequestParam(required = false) QueueChangeRequestStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                changeRequestService.getRequests(meetingId, status, page, size, principal));
    }
}
