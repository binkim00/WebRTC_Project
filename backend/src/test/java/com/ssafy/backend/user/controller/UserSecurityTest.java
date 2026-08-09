package com.ssafy.backend.user.controller;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import com.ssafy.backend.user.service.UserProfileService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(UserController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class UserSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserProfileService userProfileService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** 미인증 사용자의 내 정보 조회와 수정 요청이 모두 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedProfileRequests() throws Exception {
        mockMvc.perform(get("/api/v1/users/me"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/api/v1/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(userProfileService);
    }

    /** 미인증 사용자의 회원탈퇴 요청이 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedWithdrawRequest() throws Exception {
        mockMvc.perform(delete("/api/v1/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"test1234\"}"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(userProfileService);
    }
}
