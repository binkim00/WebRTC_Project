package com.ssafy.backend.queue.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.queue.dto.QueueCallResponse;
import com.ssafy.backend.queue.dto.QueueChangeRequestCreateRequest;
import com.ssafy.backend.queue.dto.QueueChangeRequestCreateResponse;
import com.ssafy.backend.queue.dto.QueueOperationResponse;
import com.ssafy.backend.queue.dto.QueuePositionChangeRequest;
import com.ssafy.backend.queue.dto.QueuePositionChangeResponse;
import com.ssafy.backend.queue.service.QueueChangeRequestService;
import com.ssafy.backend.queue.service.QueueCommandService;
import com.ssafy.backend.queue.service.QueuePositionService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 개별 대기열 항목의 운영 상태 변경 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/queue-entries")
public class QueueEntryCommandController {

    private final QueueCommandService commandService;
    private final QueuePositionService positionService;
    private final QueueChangeRequestService changeRequestService;

    /**
     * 대기열 상태 변경과 순서 이동, 순서 변경 요청 서비스를 주입받는다.
     *
     * @param commandService 참가자 호출 등 대기열 상태 변경 서비스
     * @param positionService 대기 순서 이동 서비스
     * @param changeRequestService 순서 변경 요청 서비스
     */
    public QueueEntryCommandController(QueueCommandService commandService,
                                       QueuePositionService positionService,
                                       QueueChangeRequestService changeRequestService) {
        this.commandService = commandService;
        this.positionService = positionService;
        this.changeRequestService = changeRequestService;
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

    /**
     * 매니저가 참가자 한 명의 대기 순번을 바꾸고 사이 순서를 서버가 자동으로 조정한다.
     *
     * @param queueEntryId 순서를 변경할 대기열 항목 식별자
     * @param request 이동할 새 대기 순번
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 순서 변경 결과
     */
    @PatchMapping("/{queueEntryId}/position")
    public ApiResponse<QueuePositionChangeResponse> changePosition(
            @PathVariable Long queueEntryId,
            @Valid @RequestBody QueuePositionChangeRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                positionService.changePosition(queueEntryId, request, principal));
    }

    /**
     * 대기 중인 팬이 자신의 순서를 미뤄달라고 요청한다.
     *
     * @param queueEntryId 요청할 본인의 대기열 항목 식별자
     * @param request 순서 미루기 요청 사유
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 요청 접수 결과
     */
    @PostMapping("/{queueEntryId}/change-requests")
    public ApiResponse<QueueChangeRequestCreateResponse> createChangeRequest(
            @PathVariable Long queueEntryId,
            @Valid @RequestBody QueueChangeRequestCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                changeRequestService.create(queueEntryId, request, principal));
    }
}
