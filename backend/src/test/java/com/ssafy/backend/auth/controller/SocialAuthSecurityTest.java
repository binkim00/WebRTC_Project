package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.domain.SocialProvider;
import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.dto.SocialLoginResponse;
import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.auth.service.SocialAccountService;
import com.ssafy.backend.auth.service.SocialAuthService;
import com.ssafy.backend.auth.support.DeviceTokenService;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 소셜 로그인 API의 URL 단위 권한 규칙을 검증한다. (AUTH-009~012, USER-004~006)
 *
 * <p>로그인 전 흐름은 열려 있어야 하고 연결 관리는 로그인을 요구해야 한다. 두 규칙이 뒤바뀌면
 * 각각 "소셜 로그인 자체가 불가능"과 "남의 계정에 연결 시도 가능"이라는 심각한 회귀가 된다.
 */
@WebMvcTest({SocialAuthController.class, SocialAccountController.class})
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class SocialAuthSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SocialAuthService socialAuthService;

    @MockitoBean
    private SocialAccountService socialAccountService;

    @MockitoBean
    private DeviceTokenService deviceTokenService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** 인증 URL 발급이 비로그인 상태에서 열려 있는지 검증한다. */
    @Test
    void allowsAnonymousAuthorizeUrl() throws Exception {
        mockMvc.perform(get("/api/v1/auth/social/kakao/authorize-url").param("state", "abc"))
                .andExpect(status().isOk());
    }

    /**
     * 소셜 로그인 요청이 비로그인 상태에서 열려 있고, 다음 단계가 필요한 응답에서는
     * 기기 토큰을 발급하지 않는지 검증한다.
     */
    @Test
    void allowsAnonymousSocialLogin() throws Exception {
        when(socialAuthService.login(anyString(), any())).thenReturn(
                SocialLoginResponse.signupRequired(SocialProvider.KAKAO, "token", null, "안내"));

        mockMvc.perform(post("/api/v1/auth/social/kakao/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"auth-code\"}"))
                .andExpect(status().isOk());

        // 아직 로그인이 끝나지 않았으므로 기기 토큰을 심지 않는다.
        verifyNoInteractions(deviceTokenService);
    }

    /** 소셜 신규 가입이 비로그인 상태에서 열려 있는지 검증한다. */
    @Test
    void allowsAnonymousSocialSignup() throws Exception {
        mockMvc.perform(post("/api/v1/auth/social/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"socialToken":"token","nickname":"영빈",
                                 "preferredLanguage":"KOREAN",
                                 "termsOfServiceAgreed":true,"privacyPolicyAgreed":true}
                                """))
                .andExpect(status().isCreated());
    }

    /** 기존 계정 연결이 비로그인 상태에서 열려 있는지 검증한다. */
    @Test
    void allowsAnonymousExistingAccountLink() throws Exception {
        mockMvc.perform(post("/api/v1/auth/social/link")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"socialToken\":\"token\",\"password\":\"test1234\"}"))
                .andExpect(status().isOk());
    }

    /** 필수 약관에 동의하지 않은 소셜 가입을 요청 검증에서 거부하는지 검증한다. */
    @Test
    void rejectsSocialSignupWithoutRequiredConsents() throws Exception {
        mockMvc.perform(post("/api/v1/auth/social/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"socialToken":"token","nickname":"영빈",
                                 "preferredLanguage":"KOREAN",
                                 "termsOfServiceAgreed":false,"privacyPolicyAgreed":true}
                                """))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(socialAuthService);
    }

    /** 연결 목록 조회가 미인증 요청을 HTTP 401로 거부하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedSocialAccountList() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/social-accounts"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(socialAccountService);
    }

    /** 연결 추가가 미인증 요청을 HTTP 401로 거부하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedSocialAccountLink() throws Exception {
        mockMvc.perform(post("/api/v1/users/me/social-accounts/kakao")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"auth-code\"}"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(socialAccountService);
    }

    /** 연결 해제가 미인증 요청을 HTTP 401로 거부하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedSocialAccountUnlink() throws Exception {
        mockMvc.perform(delete("/api/v1/users/me/social-accounts/kakao"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(socialAccountService);
    }

    /** 연결 관리는 역할을 제한하지 않고 로그인만 요구하는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsAnyAuthenticatedRoleToManageSocialAccounts() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/social-accounts"))
                .andExpect(status().isOk());
        mockMvc.perform(delete("/api/v1/users/me/social-accounts/kakao"))
                .andExpect(status().isNoContent());
    }

    /** 인플루언서 계정도 자기 연결을 관리할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void allowsInfluencerToManageSocialAccounts() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/social-accounts"))
                .andExpect(status().isOk());
    }

    /**
     * 소셜 로그인이 완료된 응답에서는 기기 토큰 쿠키를 발급하는지 검증한다.
     *
     * <p>아이디·비밀번호 로그인과 같은 상태로 만들어야 동일 기기 다계정 응모 탐지가 소셜 로그인에도 적용된다.
     */
    @Test
    void issuesDeviceTokenWhenSocialLoginCompletes() throws Exception {
        when(socialAuthService.login(anyString(), any())).thenReturn(
                SocialLoginResponse.login(SocialProvider.KAKAO,
                        new LoginResponse("access", "refresh", 3600L, 1L, UserRole.FAN, "영빈")));

        mockMvc.perform(post("/api/v1/auth/social/kakao/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"auth-code\"}"))
                .andExpect(status().isOk());

        verify(deviceTokenService).resolveOrIssueHash(any(), any());
    }
}
