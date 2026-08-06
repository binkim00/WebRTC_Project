package com.ssafy.backend.organization.controller;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import com.ssafy.backend.organization.dto.OrganizationInvitationResponse;
import com.ssafy.backend.organization.service.OrganizationInvitationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OrganizationInvitationController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class OrganizationInvitationSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OrganizationInvitationService invitationService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** 미인증 사용자의 초대 발급과 수락 요청이 서비스 호출 전에 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedInvitationRequests() throws Exception {
        mockMvc.perform(post("/api/v1/organizations/3/invitations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"influencerId\":25}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/organization-invitations/token/accept"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(invitationService);
    }

    /** 인증된 매니저의 초대 발급 요청이 토큰과 만료 시각 응답으로 변환되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void returnsIssuedInvitationToAuthenticatedManager() throws Exception {
        when(invitationService.issue(eq(3L), any(), isNull())).thenReturn(
                new OrganizationInvitationResponse(
                        3L, 25L, "issued-token",
                        LocalDateTime.of(2026, 7, 31, 15, 0)));

        mockMvc.perform(post("/api/v1/organizations/3/invitations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"influencerId\":25}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token").value("issued-token"))
                .andExpect(jsonPath("$.data.expiresAt").value("2026-07-31T15:00:00"));
    }
}
