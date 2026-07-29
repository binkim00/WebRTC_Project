package com.ssafy.backend.queue.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.queue.dto.QueueCallResponse;
import com.ssafy.backend.queue.dto.QueueOperationResponse;
import com.ssafy.backend.queue.service.QueueCommandService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 개별 대기열 항목의 운영 상태 변경 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/queue-entries")
public class QueueEntryCommandController {

    private final QueueCommandService commandService;

    /**
     * 대기열 상태 변경 서비스를 주입받는다.
     *
     * @param commandService 참가자 호출 등 대기열 상태 변경 서비스
     */
    public QueueEntryCommandController(QueueCommandService commandService) {
        this.commandService = commandService;
    }

    /**
     * 매니저가 참가자를 호출하고 최초 호출이면 영상통화 세션도 함께 생성한다.
     *
     * @param queueEntryId 호출할 대기열 항목 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 호출 결과
     */
    @PostMapping("/{queueEntryId}/call")
    public ApiResponse<QueueCallResponse> call(
            @PathVariable Long queueEntryId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commandService.call(queueEntryId, principal));
    }

    /**
     * 매니저가 호출에 응답하지 않은 팬과 연결 대기 중인 영상통화 세션을 노쇼 처리한다.
     *
     * @param queueEntryId 노쇼 처리할 대기열 항목 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 노쇼 처리 결과
     */
    @PostMapping("/{queueEntryId}/no-show")
    public ApiResponse<QueueOperationResponse> markNoShow(
            @PathVariable Long queueEntryId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commandService.markNoShow(queueEntryId, principal));
    }
}
