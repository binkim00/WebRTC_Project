package com.ssafy.backend.meeting.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.meeting.dto.FanMeetingManagementResponse;
import com.ssafy.backend.meeting.dto.FanMeetingTestControlRequest;
import com.ssafy.backend.meeting.service.FanMeetingManagementService;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 개발 환경에서만 팬미팅 상태와 일정을 제어하는 테스트 API를 제공한다.
 *
 * <p>운영 환경에서는 컨트롤러 자체가 등록되지 않아 해당 경로가 존재하지 않는다.
 */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}")
@ConditionalOnProperty(prefix = "app.test-control", name = "enabled", havingValue = "true")
@Profile("!prod")
public class FanMeetingTestControlController {

    private final FanMeetingManagementService managementService;

    /**
     * 테스트용 팬미팅 상태 변경 서비스를 주입받는다.
     *
     * @param managementService 팬미팅 관리 서비스
     */
    public FanMeetingTestControlController(FanMeetingManagementService managementService) {
        this.managementService = managementService;
    }

    /**
     * 테스트용 상태와 일정을 강제로 변경한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @param request 강제 변경할 상태와 일정
     * @return 변경된 팬미팅 관리 정보
     */
    @PatchMapping("/test-control")
    public ApiResponse<FanMeetingManagementResponse> controlForTest(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody FanMeetingTestControlRequest request
    ) {
        return ApiResponse.success(managementService.controlForTest(meetingId, principal, request));
    }
}
