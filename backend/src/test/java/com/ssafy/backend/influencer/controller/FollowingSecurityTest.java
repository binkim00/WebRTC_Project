package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.FollowCreateResponse;
import com.ssafy.backend.influencer.dto.FollowerSummaryResponse;
import com.ssafy.backend.influencer.dto.FollowingSummaryResponse;
import com.ssafy.backend.influencer.service.FollowingService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:following-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class FollowingSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FollowingService followingService;

    /** 인증되지 않은 팔로우 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedFollow() throws Exception {
        mockMvc.perform(post("/api/v1/influencers/2/follow"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(followingService);
    }

    /** 관리자 역할의 팔로우 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerFollow() throws Exception {
        mockMvc.perform(post("/api/v1/influencers/2/follow"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(followingService);
    }

    /** 팬 역할이 팔로우 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsFanFollow() throws Exception {
        when(followingService.follow(eq(2L), isNull())).thenReturn(
                new FollowCreateResponse(
                        2L, true, LocalDateTime.of(2026, 7, 30, 15, 0), 1L
                )
        );

        mockMvc.perform(post("/api/v1/influencers/2/follow"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isFollowing").value(true));
    }

    /** 인증되지 않은 팔로우 취소 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedUnfollow() throws Exception {
        mockMvc.perform(delete("/api/v1/influencers/2/follow"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(followingService);
    }

    /** 관리자 역할의 팔로우 취소 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerUnfollow() throws Exception {
        mockMvc.perform(delete("/api/v1/influencers/2/follow"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(followingService);
    }

    /** 팬 역할이 팔로우 취소 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsFanUnfollow() throws Exception {
        when(followingService.unfollow(eq(2L), isNull())).thenReturn(
                new com.ssafy.backend.influencer.dto.FollowDeleteResponse(2L, false, 0L)
        );
        mockMvc.perform(delete("/api/v1/influencers/2/follow"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isFollowing").value(false));
    }

    /** 팬 역할이 자신의 팔로잉 목록 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsFanFollowingList() throws Exception {
        when(followingService.getMyFollowings(eq(0), eq(20), isNull()))
                .thenReturn(new PageResponse<FollowingSummaryResponse>(
                        List.of(), 0, 20, 0L, 0, false
                ));

        mockMvc.perform(get("/api/v1/users/me/followings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0));
    }

    /** 팬 역할이 인플루언서 전용 팔로워 목록에 접근할 수 없는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanFollowerList() throws Exception {
        mockMvc.perform(get("/api/v1/influencers/me/followers"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(followingService);
    }

    /** 인플루언서 역할이 자신의 팔로워 목록 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void allowsInfluencerFollowerList() throws Exception {
        when(followingService.getMyFollowers(eq(0), eq(20), isNull()))
                .thenReturn(new PageResponse<FollowerSummaryResponse>(
                        List.of(), 0, 20, 0L, 0, false
                ));

        mockMvc.perform(get("/api/v1/influencers/me/followers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0));
    }

    /** SOLO_INFLUENCER 역할이 자신의 팔로워 목록 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerFollowerList() throws Exception {
        when(followingService.getMyFollowers(eq(0), eq(20), isNull()))
                .thenReturn(new PageResponse<FollowerSummaryResponse>(
                        List.of(), 0, 20, 0L, 0, false
                ));
        mockMvc.perform(get("/api/v1/influencers/me/followers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0));
    }

    /** MANAGER 역할의 팔로워 목록 접근이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerFollowerList() throws Exception {
        mockMvc.perform(get("/api/v1/influencers/me/followers"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(followingService);
    }
}
