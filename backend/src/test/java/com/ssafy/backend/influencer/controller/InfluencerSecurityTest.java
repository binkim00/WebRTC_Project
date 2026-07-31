package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.InfluencerSummaryResponse;
import com.ssafy.backend.influencer.service.InfluencerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:influencer-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class InfluencerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private InfluencerService influencerQueryService;

    /** 비로그인 사용자의 인플루언서 목록 조회가 허용되는지 검증한다. */
    @Test
    void allowsAnonymousInfluencerList() throws Exception {
        when(influencerQueryService.getInfluencers(anyInt(), anyInt(), isNull(), isNull()))
                .thenReturn(new PageResponse<>(List.of(), 0, 20, 0L, 0, false));

        mockMvc.perform(get("/api/v1/influencers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    /** 로그인한 팬의 목록 조회 요청에 인증 주체가 서비스로 전달되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsAuthenticatedFanInfluencerList() throws Exception {
        when(influencerQueryService.getInfluencers(anyInt(), anyInt(), any(), any()))
                .thenReturn(new PageResponse<>(List.of(), 0, 20, 0L, 0, false));

        mockMvc.perform(get("/api/v1/influencers").param("keyword", "가수"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    /** 검색어와 페이지 파라미터가 서비스로 그대로 전달되는지 검증한다. */
    @Test
    void passesPagingParametersToService() throws Exception {
        when(influencerQueryService.getInfluencers(eq(2), eq(5), eq("댄서"), isNull()))
                .thenReturn(new PageResponse<>(List.of(
                        new InfluencerSummaryResponse(7L, "댄서 베타", null, "춤추는 사람", 3L, false)
                ), 2, 5, 11L, 3, false));

        mockMvc.perform(get("/api/v1/influencers")
                        .param("page", "2").param("size", "5").param("keyword", "댄서"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].influencerId").value(7))
                .andExpect(jsonPath("$.data.content[0].influencerName").value("댄서 베타"))
                .andExpect(jsonPath("$.data.content[0].introduction").value("춤추는 사람"))
                .andExpect(jsonPath("$.data.content[0].followerCount").value(3))
                .andExpect(jsonPath("$.data.page").value(2));
    }
}
