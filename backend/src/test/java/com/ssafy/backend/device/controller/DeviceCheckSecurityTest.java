package com.ssafy.backend.device.controller;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.device.dto.DeviceCheckRequest;
import com.ssafy.backend.device.dto.DeviceCheckResponse;
import com.ssafy.backend.device.service.DeviceCheckService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:device-check-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef"
})
@AutoConfigureMockMvc
class DeviceCheckSecurityTest {

    private static final String VALID_BODY =
            "{\"cameraOk\":true,\"microphoneOk\":true,\"speakerOk\":true,\"networkOk\":true}";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DeviceCheckService deviceCheckService;

    /** 인증되지 않은 장비 점검 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedDeviceCheck() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/device-checks")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(deviceCheckService);
    }

    /** 매니저 역할의 장비 점검 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerDeviceCheck() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/device-checks")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(deviceCheckService);
    }

    /** 팬 역할이 장비 점검 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsFanDeviceCheck() throws Exception {
        when(deviceCheckService.saveDeviceCheck(eq(1L),
                eq(new DeviceCheckRequest(true, true, true, true)), isNull()))
                .thenReturn(new DeviceCheckResponse(500L, true, true, true, true, false, true,
                        LocalDateTime.of(2026, 7, 30, 15, 0)));

        mockMvc.perform(post("/api/v1/fan-meetings/1/device-checks")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.deviceCheckId").value(500))
                .andExpect(jsonPath("$.data.warningRequired").value(false))
                .andExpect(jsonPath("$.data.canEnter").value(true))
                .andExpect(jsonPath("$.data.checkedAt").value("2026-07-30T15:00:00"));
    }

    /** 인플루언서 역할이 장비 점검 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void allowsInfluencerDeviceCheck() throws Exception {
        when(deviceCheckService.saveDeviceCheck(eq(1L),
                eq(new DeviceCheckRequest(true, true, true, true)), isNull()))
                .thenReturn(new DeviceCheckResponse(501L, true, true, true, true, false, true,
                        LocalDateTime.of(2026, 7, 30, 15, 0)));

        mockMvc.perform(post("/api/v1/fan-meetings/1/device-checks")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.deviceCheckId").value(501));
    }

    /** 장비 이상이 있어도 입장 가능 여부가 참으로 유지되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void keepsCanEnterTrueWhenCheckFailed() throws Exception {
        when(deviceCheckService.saveDeviceCheck(eq(1L),
                eq(new DeviceCheckRequest(false, true, null, true)), isNull()))
                .thenReturn(new DeviceCheckResponse(502L, false, true, null, true, true, true,
                        LocalDateTime.of(2026, 7, 30, 15, 0)));

        mockMvc.perform(post("/api/v1/fan-meetings/1/device-checks")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cameraOk\":false,\"microphoneOk\":true,\"networkOk\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.warningRequired").value(true))
                .andExpect(jsonPath("$.data.canEnter").value(true));
    }

    /** 필수 점검 항목이 빠진 요청이 서비스 호출 전 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsRequestWithoutRequiredFlags() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/device-checks")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cameraOk\":true}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(deviceCheckService);
    }

    /** 참가자가 아닌 사용자의 장비 점검 요청이 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsNonParticipantDeviceCheck() throws Exception {
        when(deviceCheckService.saveDeviceCheck(eq(1L), any(DeviceCheckRequest.class), isNull()))
                .thenThrow(new BusinessException(ErrorCode.DEVICE_CHECK_NOT_ALLOWED));

        mockMvc.perform(post("/api/v1/fan-meetings/1/device-checks")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("DEVICE_CHECK_NOT_ALLOWED"));
    }

    /** 존재하지 않는 팬미팅의 장비 점검 요청이 HTTP 404로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsMissingMeetingDeviceCheck() throws Exception {
        when(deviceCheckService.saveDeviceCheck(eq(999L), any(DeviceCheckRequest.class), isNull()))
                .thenThrow(new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));

        mockMvc.perform(post("/api/v1/fan-meetings/999/device-checks")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
    }
}
