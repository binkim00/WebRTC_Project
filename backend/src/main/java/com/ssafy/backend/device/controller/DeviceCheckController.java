package com.ssafy.backend.device.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.device.dto.DeviceCheckRequest;
import com.ssafy.backend.device.dto.DeviceCheckResponse;
import com.ssafy.backend.device.service.DeviceCheckService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 팬미팅 입장 전 장비 점검 결과 저장 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}/device-checks")
public class DeviceCheckController {

    private final DeviceCheckService deviceCheckService;

    /**
     * 장비 점검 서비스를 주입받는다.
     *
     * @param deviceCheckService 장비 점검 저장 서비스
     */
    public DeviceCheckController(DeviceCheckService deviceCheckService) {
        this.deviceCheckService = deviceCheckService;
    }

    /**
     * 참가 팬 또는 배정 인플루언서의 장비 점검 결과를 저장한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param request 카메라·마이크·스피커·네트워크 점검 결과
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 장비 점검 저장 결과
     */
    @PostMapping
    public ApiResponse<DeviceCheckResponse> saveDeviceCheck(
            @PathVariable Long meetingId,
            @Valid @RequestBody DeviceCheckRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                deviceCheckService.saveDeviceCheck(meetingId, request, principal));
    }
}
