package com.ssafy.backend.call.controller;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.dto.CallSessionEndResponse;
import com.ssafy.backend.call.service.CallSessionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:call-session-end-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class CallSessionEndSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CallSessionService callSessionService;

    /** 팬이 자신의 통화 종료 요청으로 HTTP 200과 종료 결과를 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsFanToEndOwnCall() throws Exception {
        when(callSessionService.endByFan(eq(1L), any())).thenReturn(new CallSessionEndResponse(
                1L, CallSessionStatus.ENDED,
                LocalDateTime.of(2026, 7, 31, 12, 0), CallEndReason.NORMAL));

        mockMvc.perform(post("/api/v1/call-sessions/1/end").with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("ENDED"))
                .andExpect(jsonPath("$.data.endReason").value("NORMAL"));
    }

    /** 매니저의 팬용 종료 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerRequest() throws Exception {
        mockMvc.perform(post("/api/v1/call-sessions/1/end").with(csrf()))
                .andExpect(status().isForbidden());

        verifyNoInteractions(callSessionService);
    }

    /** 인플루언서의 팬용 종료 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void rejectsInfluencerRequest() throws Exception {
        mockMvc.perform(post("/api/v1/call-sessions/1/end").with(csrf()))
                .andExpect(status().isForbidden());

        verifyNoInteractions(callSessionService);
    }

    /** 인증되지 않은 종료 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedRequest() throws Exception {
        mockMvc.perform(post("/api/v1/call-sessions/1/end").with(csrf()))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(callSessionService);
    }
}
