package com.ssafy.backend.queue.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionRequest;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionResponse;
import com.ssafy.backend.queue.service.QueueChangeRequestService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 접수된 순서 변경 요청의 승인·거절 처리 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/queue-change-requests")
public class QueueChangeRequestController {

    private final QueueChangeRequestService changeRequestService;

    /**
     * 순서 변경 요청 서비스를 주입받는다.
     *
     * @param changeRequestService 순서 변경 요청 서비스
     */
    public QueueChangeRequestController(QueueChangeRequestService changeRequestService) {
        this.changeRequestService = changeRequestService;
    }

    /**
     * 매니저가 순서 변경 요청을 승인하거나 거절하고 승인 시 대기 순번을 이동시킨다.
     *
     * @param requestId 처리할 순서 변경 요청 식별자
     * @param request 승인 또는 거절 결정과 새 순번
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 요청 처리 결과
     */
    @PatchMapping("/{requestId}")
    public ApiResponse<QueueChangeRequestDecisionResponse> process(
            @PathVariable Long requestId,
            @Valid @RequestBody QueueChangeRequestDecisionRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                changeRequestService.process(requestId, request, principal));
    }
}
