package com.ssafy.backend.meeting.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.meeting.dto.FanMeetingManagementResponse;
import com.ssafy.backend.meeting.dto.FanMeetingTestControlRequest;
import com.ssafy.backend.meeting.dto.FanMeetingUpdateRequest;
import com.ssafy.backend.meeting.service.FanMeetingManagementService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 팬미팅 수정·게시·삭제·취소·시작·종료 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}")
public class FanMeetingManagementController {

    private final FanMeetingManagementService managementService;

    /**
     * 팬미팅 관리 명령 서비스를 주입받는다.
     *
     * @param managementService 팬미팅 관리 명령 서비스
     */
    public FanMeetingManagementController(FanMeetingManagementService managementService) {
        this.managementService = managementService;
    }

    /**
     * 초안 또는 응모 시작 전 팬미팅을 수정한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 로그인 사용자 정보
     * @param request 팬미팅 부분 수정 요청
     * @return 수정된 팬미팅 관리 정보
     */
    @PatchMapping
    public ApiResponse<FanMeetingManagementResponse> update(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody FanMeetingUpdateRequest request
    ) {
        return ApiResponse.success(managementService.update(meetingId, principal, request));
    }

    /** 테스트용 상태와 일정을 강제로 변경한다. */
    @PatchMapping("/test-control")
    public ApiResponse<FanMeetingManagementResponse> controlForTest(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody FanMeetingTestControlRequest request
    ) {
        return ApiResponse.success(managementService.controlForTest(meetingId, principal, request));
    }

    /**
     * 초안 팬미팅을 공개한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 로그인 사용자 정보
     * @return 공개된 팬미팅 관리 정보
     */
    @PostMapping("/publish")
    public ApiResponse<FanMeetingManagementResponse> publish(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(managementService.publish(meetingId, principal));
    }

    /**
     * 초안 팬미팅을 논리 삭제한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 로그인 사용자 정보
     * @return 논리 삭제된 팬미팅 관리 정보
     */
    @DeleteMapping
    public ApiResponse<FanMeetingManagementResponse> deleteDraft(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(managementService.deleteDraft(meetingId, principal));
    }

    /**
     * 공개 후 진행 전 팬미팅을 취소한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 로그인 사용자 정보
     * @return 취소된 팬미팅 관리 정보
     */
    @PostMapping("/cancel")
    public ApiResponse<FanMeetingManagementResponse> cancel(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(managementService.cancel(meetingId, principal));
    }

    /**
     * 준비가 끝난 팬미팅을 진행 상태로 시작한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 로그인 사용자 정보
     * @return 시작된 팬미팅 관리 정보
     */
    @PostMapping("/start")
    public ApiResponse<FanMeetingManagementResponse> start(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(managementService.start(meetingId, principal));
    }

    /**
     * 진행 중인 팬미팅과 연결된 개별 영상통화 자원을 종료한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 로그인 사용자 정보
     * @return 종료된 팬미팅 관리 정보
     */
    @PostMapping("/end")
    public ApiResponse<FanMeetingManagementResponse> end(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(managementService.end(meetingId, principal));
    }
}
