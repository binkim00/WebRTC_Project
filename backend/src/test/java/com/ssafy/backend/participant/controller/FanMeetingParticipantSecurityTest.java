package com.ssafy.backend.participant.controller;

import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.participant.domain.ParticipantSource;
import com.ssafy.backend.participant.dto.ParticipantSummaryResponse;
import com.ssafy.backend.participant.service.ParticipantQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:participant-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class FanMeetingParticipantSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ParticipantQueryService participantQueryService;

    /** 인증되지 않은 참가자 목록 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedParticipantList() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/1/participants"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(participantQueryService);
    }

    /** 팬 역할의 참가자 목록 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanParticipantList() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/1/participants"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(participantQueryService);
    }

    /** 매니저 역할이 참가자 목록 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerParticipantList() throws Exception {
        when(participantQueryService.getParticipants(
                eq(1L), isNull(), isNull(), isNull(), eq(0), eq(20), isNull()))
                .thenReturn(new PageResponse<>(List.of(new ParticipantSummaryResponse(
                        100L, 30L, "첫째팬", null, 1, "READY", "WAITING", ParticipantSource.APPLICATION)),
                        0, 20, 1L, 1, false));

        mockMvc.perform(get("/api/v1/fan-meetings/1/participants"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].participantId").value(100))
                .andExpect(jsonPath("$.data.content[0].callOrder").value(1))
                .andExpect(jsonPath("$.data.content[0].participantStatus").value("READY"))
                .andExpect(jsonPath("$.data.content[0].queueStatus").value("WAITING"))
                .andExpect(jsonPath("$.data.page").value(0));
    }

    /** 인플루언서 역할이 참가자 목록 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void allowsInfluencerParticipantList() throws Exception {
        when(participantQueryService.getParticipants(
                eq(1L), isNull(), isNull(), isNull(), eq(0), eq(20), isNull()))
                .thenReturn(new PageResponse<>(List.of(), 0, 20, 0L, 0, false));

        mockMvc.perform(get("/api/v1/fan-meetings/1/participants"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    /** 검색 조건과 페이지 값을 그대로 서비스에 전달하는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void passesQueryParametersToService() throws Exception {
        when(participantQueryService.getParticipants(
                eq(1L), eq("READY"), eq("팬"), isNull(), eq(2), eq(6), isNull()))
                .thenReturn(new PageResponse<>(List.of(), 2, 6, 0L, 0, false));

        mockMvc.perform(get("/api/v1/fan-meetings/1/participants")
                        .param("participantStatus", "READY")
                        .param("keyword", "팬")
                        .param("page", "2")
                        .param("size", "6"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(2))
                .andExpect(jsonPath("$.data.size").value(6));
    }

    /** 허용 범위를 벗어난 페이지 크기가 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsOutOfRangePageSize() throws Exception {
        when(participantQueryService.getParticipants(
                eq(1L), isNull(), isNull(), isNull(), eq(0), eq(101), isNull()))
                .thenThrow(new BusinessException(ErrorCode.INVALID_REQUEST));

        mockMvc.perform(get("/api/v1/fan-meetings/1/participants").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 숫자가 아닌 페이지 값이 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsNonNumericPage() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/1/participants").param("page", "abc"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(participantQueryService);
    }

    /** 인증되지 않은 참가자 상세 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedParticipantDetail() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/1/participants/100"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(participantQueryService);
    }

    /** 팬 역할의 참가자 상세 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanParticipantDetail() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/1/participants/100"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(participantQueryService);
    }

    /** 매니저 역할이 참가자 상세 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerParticipantDetail() throws Exception {
        when(participantQueryService.getParticipant(eq(1L), eq(100L), isNull()))
                .thenReturn(new ParticipantSummaryResponse(
                        100L, 30L, "첫째팬", "https://cdn.melly.test/p.png", 1, "READY", "CALLED", ParticipantSource.APPLICATION));

        mockMvc.perform(get("/api/v1/fan-meetings/1/participants/100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fanId").value(30))
                .andExpect(jsonPath("$.data.nickname").value("첫째팬"))
                .andExpect(jsonPath("$.data.profileImageUrl")
                        .value("https://cdn.melly.test/p.png"))
                .andExpect(jsonPath("$.data.queueStatus").value("CALLED"));
    }

    /** 다른 팬미팅의 참가자 상세 요청이 HTTP 404로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsParticipantFromAnotherMeeting() throws Exception {
        when(participantQueryService.getParticipant(eq(1L), eq(999L), isNull()))
                .thenThrow(new BusinessException(ErrorCode.PARTICIPANT_NOT_IN_MEETING));

        mockMvc.perform(get("/api/v1/fan-meetings/1/participants/999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTICIPANT_NOT_IN_MEETING"));
    }

    /** 운영 권한이 없는 팬미팅의 참가자 목록 요청이 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsNonOperatorManager() throws Exception {
        when(participantQueryService.getParticipants(
                eq(2L), isNull(), isNull(), isNull(), eq(0), eq(20), isNull()))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        mockMvc.perform(get("/api/v1/fan-meetings/2/participants"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }
}
