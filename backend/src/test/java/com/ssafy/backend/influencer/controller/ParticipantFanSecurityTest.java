package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.ParticipantFanSummaryResponse;
import com.ssafy.backend.influencer.service.ParticipantFanService;
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
        "spring.datasource.url=jdbc:h2:mem:participant-fan-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class ParticipantFanSecurityTest {

    private static final String PARTICIPANT_FANS_URL = "/api/v1/influencers/me/participant-fans";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ParticipantFanService participantFanService;

    /** 인증되지 않은 참가 팬 목록 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedRequest() throws Exception {
        mockMvc.perform(get(PARTICIPANT_FANS_URL))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(participantFanService);
    }

    /** 팬 역할의 참가 팬 목록 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanRequest() throws Exception {
        mockMvc.perform(get(PARTICIPANT_FANS_URL))
                .andExpect(status().isForbidden());

        verifyNoInteractions(participantFanService);
    }

    /** 매니저 역할의 참가 팬 목록 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerRequest() throws Exception {
        mockMvc.perform(get(PARTICIPANT_FANS_URL))
                .andExpect(status().isForbidden());

        verifyNoInteractions(participantFanService);
    }

    /** 인플루언서 역할이 참가 팬 목록 API 에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void allowsInfluencerRequest() throws Exception {
        when(participantFanService.getMyParticipantFans(eq(0), eq(20), isNull()))
                .thenReturn(new PageResponse<ParticipantFanSummaryResponse>(
                        List.of(), 0, 20, 0L, 0, false
                ));

        mockMvc.perform(get(PARTICIPANT_FANS_URL))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0));
    }

    /** 1인 인플루언서 역할이 참가 팬 목록 API 에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerRequest() throws Exception {
        when(participantFanService.getMyParticipantFans(eq(0), eq(20), isNull()))
                .thenReturn(new PageResponse<ParticipantFanSummaryResponse>(
                        List.of(), 0, 20, 0L, 0, false
                ));

        mockMvc.perform(get(PARTICIPANT_FANS_URL))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0));
    }

    /**
     * 페이지 파라미터를 명시한 요청이 서비스로 그대로 전달되는지 검증한다.
     * 팔로워 목록과 같은 페이징 관례를 따르는지 함께 확인한다.
     */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void passesPageParameters() throws Exception {
        when(participantFanService.getMyParticipantFans(eq(2), eq(5), isNull()))
                .thenReturn(new PageResponse<ParticipantFanSummaryResponse>(
                        List.of(), 2, 5, 0L, 0, false
                ));

        mockMvc.perform(get(PARTICIPANT_FANS_URL + "?page=2&size=5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(2))
                .andExpect(jsonPath("$.data.size").value(5));
    }
}
