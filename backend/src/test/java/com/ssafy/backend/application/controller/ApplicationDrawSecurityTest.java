package com.ssafy.backend.application.controller;

import com.ssafy.backend.application.dto.DrawResultResponse;
import com.ssafy.backend.application.dto.ResultPublishResponse;
import com.ssafy.backend.application.service.ApplicationDrawService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:application-draw-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class ApplicationDrawSecurityTest {

    private static final String DRAW_PATH = "/api/v1/fan-meetings/10/applications/draw";
    private static final String PUBLISH_PATH =
            "/api/v1/fan-meetings/10/applications/results/publish";
    private static final LocalDateTime COMPLETED_AT = LocalDateTime.of(2026, 7, 31, 11, 0);

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ApplicationDrawService applicationDrawService;

    /** 인증되지 않은 추첨 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedDraw() throws Exception {
        mockMvc.perform(post(DRAW_PATH)).andExpect(status().isUnauthorized());

        verifyNoInteractions(applicationDrawService);
    }

    /** 팬 역할의 추첨 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanDraw() throws Exception {
        mockMvc.perform(post(DRAW_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(applicationDrawService);
    }

    /** 소속 인플루언서 역할의 추첨 요청이 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void rejectsInfluencerDraw() throws Exception {
        mockMvc.perform(post(DRAW_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(applicationDrawService);
    }

    /** 매니저 역할이 추첨 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerDraw() throws Exception {
        when(applicationDrawService.draw(eq(10L), isNull()))
                .thenReturn(new DrawResultResponse(2L, 3L, 2L, COMPLETED_AT));

        mockMvc.perform(post(DRAW_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.selectedCount").value(2))
                .andExpect(jsonPath("$.data.notSelectedCount").value(3))
                .andExpect(jsonPath("$.data.participantCount").value(2));
    }

    /** 1인 인플루언서 역할이 추첨 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerDraw() throws Exception {
        when(applicationDrawService.draw(eq(10L), isNull()))
                .thenReturn(new DrawResultResponse(1L, 0L, 1L, COMPLETED_AT));

        mockMvc.perform(post(DRAW_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.participantCount").value(1));
    }

    /** 인증되지 않은 결과 공개 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedPublish() throws Exception {
        mockMvc.perform(post(PUBLISH_PATH)).andExpect(status().isUnauthorized());

        verifyNoInteractions(applicationDrawService);
    }

    /** 팬 역할의 결과 공개 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanPublish() throws Exception {
        mockMvc.perform(post(PUBLISH_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(applicationDrawService);
    }

    /** 매니저 역할이 결과 공개 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerPublish() throws Exception {
        when(applicationDrawService.publishResults(eq(10L), isNull()))
                .thenReturn(ResultPublishResponse.published(COMPLETED_AT, 5L));

        mockMvc.perform(post(PUBLISH_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.notificationCount").value(5))
                .andExpect(jsonPath("$.data.resultStatus").value("PUBLISHED"));
    }

    /** 1인 인플루언서 역할이 결과 공개 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerPublish() throws Exception {
        when(applicationDrawService.publishResults(eq(10L), isNull()))
                .thenReturn(ResultPublishResponse.published(COMPLETED_AT, 1L));

        mockMvc.perform(post(PUBLISH_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.resultStatus").value("PUBLISHED"));
    }
}
