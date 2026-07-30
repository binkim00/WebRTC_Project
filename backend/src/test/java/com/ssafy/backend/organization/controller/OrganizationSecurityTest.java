package com.ssafy.backend.organization.controller;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.domain.OrganizationMemberType;
import com.ssafy.backend.organization.dto.OrganizationMemberResponse;
import com.ssafy.backend.organization.dto.OrganizationResponse;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.organization.service.OrganizationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OrganizationController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class OrganizationSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OrganizationService organizationService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** 미인증 사용자의 조직 생성과 구성원 조회 요청이 모두 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedOrganizationRequests() throws Exception {
        mockMvc.perform(post("/api/v1/organizations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"멜리 엔터\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/organizations/me/members"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(organizationService);
    }

    /** 인증된 매니저의 유효한 조직 생성 요청이 컨트롤러 계약으로 전달되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsAuthenticatedManagerOrganizationCreation() throws Exception {
        when(organizationService.createOrganization(isNull(), any())).thenReturn(
                new OrganizationResponse(
                        10L, "멜리 엔터", null, null, null, null,
                        null, null, "ACTIVE", null
                ));

        mockMvc.perform(post("/api/v1/organizations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"멜리 엔터\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.organizationId").value(10))
                .andExpect(jsonPath("$.data.status").value("ACTIVE"));
    }

    /** 조직명이 비어 있는 생성 요청이 서비스 호출 전에 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsBlankOrganizationName() throws Exception {
        mockMvc.perform(post("/api/v1/organizations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"   \"}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(organizationService);
    }

    /** 일반 매니저의 직접 소속 등록 요청이 HTTP 403으로 차단되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerDirectMembershipRegistration() throws Exception {
        mockMvc.perform(post("/api/v1/organizations/10/members")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":2}"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(organizationService);
    }

    /** 관리자의 직접 소속 등록 요청만 컨트롤러까지 전달되는지 검증한다. */
    @Test
    @WithMockUser(roles = "ADMIN")
    void allowsAdminDirectMembershipRegistration() throws Exception {
        when(organizationService.addMember(any(), any(), isNull())).thenReturn(
                new OrganizationMemberResponse(
                        101L, 2L, "influencer", null, UserRole.INFLUENCER,
                        OrganizationMemberType.INFLUENCER,
                        OrganizationMemberStatus.ACTIVE, null, null
                ));

        mockMvc.perform(post("/api/v1/organizations/10/members")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.organizationMemberId").value(101))
                .andExpect(jsonPath("$.data.status").value("ACTIVE"));
    }
}
