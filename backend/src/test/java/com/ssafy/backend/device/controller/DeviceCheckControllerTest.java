package com.ssafy.backend.device.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.device.dto.DeviceCheckRequest;
import com.ssafy.backend.device.dto.DeviceCheckResponse;
import com.ssafy.backend.device.service.DeviceCheckService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeviceCheckControllerTest {

    private static final AuthenticatedUser FAN = new AuthenticatedUser(30L, UserRole.FAN);

    /** 장비 점검 요청과 인증 정보를 서비스에 전달하고 공통 성공 응답을 반환하는지 검증한다. */
    @Test
    void delegatesDeviceCheck() {
        DeviceCheckService service = mock(DeviceCheckService.class);
        DeviceCheckController controller = new DeviceCheckController(service);
        DeviceCheckRequest request = new DeviceCheckRequest(true, true, null, true);
        DeviceCheckResponse expected = new DeviceCheckResponse(
                500L, true, true, null, true, false, true,
                LocalDateTime.of(2026, 7, 30, 15, 0));
        when(service.saveDeviceCheck(1L, request, FAN)).thenReturn(expected);

        ApiResponse<DeviceCheckResponse> response =
                controller.saveDeviceCheck(1L, request, FAN);

        verify(service).saveDeviceCheck(1L, request, FAN);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }
}
