package com.ssafy.backend.queue.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.queue.dto.QueueEnterResponse;
import com.ssafy.backend.queue.dto.QueueSnapshotResponse;
import com.ssafy.backend.queue.service.QueueCommandService;
import com.ssafy.backend.queue.service.QueueQueryService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 팬 참가자의 대기실 입장과 본인 대기 상태 조회 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}/queue")
public class FanMeetingQueueController {

    private final QueueCommandService commandService;
    private final QueueQueryService queryService;

    /**
     * 대기실 입장과 상태 조회 서비스를 주입받는다.
     *
     * @param commandService 대기열 상태 변경 서비스
     * @param queryService 대기열 상태 조회 서비스
     */
    public FanMeetingQueueController(
            QueueCommandService commandService, QueueQueryService queryService
    ) {
        this.commandService = commandService;
        this.queryService = queryService;
    }

    /**
     * 확정 참가 팬을 팬미팅 대기실에 입장시킨다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 최초 대기실 입장 결과
     */
    @PostMapping("/enter")
    public ApiResponse<QueueEnterResponse> enter(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commandService.enter(meetingId, principal));
    }

    /**
     * 로그인 팬의 현재 순번과 호출 가능 상태를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 현재 대기 정보
     */
    @GetMapping("/me")
    public ApiResponse<QueueSnapshotResponse> getMyQueue(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(queryService.getMySnapshot(meetingId, principal));
    }
}
