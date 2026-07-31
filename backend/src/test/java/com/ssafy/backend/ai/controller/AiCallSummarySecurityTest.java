package com.ssafy.backend.ai.controller;

import com.ssafy.backend.ai.dto.AiCallSummaryResponse;
import com.ssafy.backend.ai.service.AiCallSummaryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:ai-summary-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class AiCallSummarySecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AiCallSummaryService aiCallSummaryService;

    /** 팬의 요약 조회가 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanRequest() throws Exception {
        mockMvc.perform(get("/api/v1/call-sessions/1/summary"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(aiCallSummaryService);
    }

    /** 인증되지 않은 요약 조회가 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedRequest() throws Exception {
        mockMvc.perform(get("/api/v1/call-sessions/1/summary"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(aiCallSummaryService);
    }

    /** 인플루언서가 생성 완료된 요약을 HTTP 200으로 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void returnsSummaryForInfluencer() throws Exception {
        when(aiCallSummaryService.getSummary(eq(1L), any())).thenReturn(Optional.of(
                new AiCallSummaryResponse(7L, 1L, "요약 본문", "[\"키워드\"]",
                        LocalDateTime.of(2026, 7, 31, 12, 0))
        ));

        mockMvc.perform(get("/api/v1/call-sessions/1/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.callSummaryId").value(7))
                .andExpect(jsonPath("$.data.callSessionId").value(1))
                .andExpect(jsonPath("$.data.summary").value("요약 본문"))
                .andExpect(jsonPath("$.data.keywords").value("[\"키워드\"]"));
    }

    /** 매니저가 생성 중인 요약에 대해 HTTP 202와 진행 상태를 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void returnsAcceptedWhileGenerating() throws Exception {
        when(aiCallSummaryService.getSummary(eq(1L), any())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/call-sessions/1/summary"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("GENERATING"))
                .andExpect(jsonPath("$.data.message").value("요약을 생성 중입니다"));
    }
}
