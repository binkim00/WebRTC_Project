package com.ssafy.backend.user.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.GlobalExceptionHandler;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.dto.MyProfileResponse;
import com.ssafy.backend.user.dto.MyProfileUpdateRequest;
import com.ssafy.backend.user.dto.MyProfileUpdateResponse;
import com.ssafy.backend.user.dto.UserWithdrawResponse;
import com.ssafy.backend.user.service.UserProfileService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.core.MethodParameter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class UserControllerTest {
    private static final AuthenticatedUser PRINCIPAL = new AuthenticatedUser(1L, UserRole.FAN);
    private UserProfileService userProfileService;
    private MockMvc mockMvc;

    /** 인증 principal과 검증·예외 처리가 적용된 독립 MockMvc를 구성한다. */
    @BeforeEach
    void setUp() {
        userProfileService = mock(UserProfileService.class);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(PRINCIPAL, null, List.of()));
        mockMvc = MockMvcBuilders.standaloneSetup(new UserController(userProfileService))
                .setCustomArgumentResolvers(new PrincipalArgumentResolver())
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    /** 테스트 종료 후 다른 테스트에 인증 정보가 남지 않도록 정리한다. */
    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    /** 내 정보 조회가 민감 필드를 제외한 최종 계약으로 응답하는지 검증한다. */
    @Test
    void returnsMyProfileWithoutSensitiveFields() throws Exception {
        when(userProfileService.getMyProfile(PRINCIPAL)).thenReturn(new MyProfileResponse(
                1L, "fan01", "fan@example.com", "fan", null,
                UserRole.FAN, PreferredLanguage.KOREAN,
                true, LocalDateTime.of(2026, 8, 4, 9, 0)));

        mockMvc.perform(get("/api/v1/users/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.loginId").value("fan01"))
                .andExpect(jsonPath("$.data.role").value("FAN"))
                // 프론트가 인증 안내 노출을 결정할 수 있도록 인증 상태를 함께 내려준다.
                .andExpect(jsonPath("$.data.emailVerified").value(true))
                .andExpect(jsonPath("$.data.emailVerifiedAt").value("2026-08-04T09:00:00"))
                .andExpect(jsonPath("$.data.password").doesNotExist())
                .andExpect(jsonPath("$.data.status").doesNotExist())
                .andExpect(jsonPath("$.data.lastLoginAt").doesNotExist())
                .andExpect(jsonPath("$.data.withdrawnAt").doesNotExist());
    }

    /** 내 정보 수정이 인증 사용자와 요청을 전달하고 수정 후 값을 반환하는지 검증한다. */
    @Test
    void updatesMyProfileWithFinalContract() throws Exception {
        when(userProfileService.updateMyProfile(eq(PRINCIPAL), any())).thenReturn(
                new MyProfileUpdateResponse(1L, "new@example.com", "새닉네임",
                        "https://cdn.example.com/profile.png", PreferredLanguage.ENGLISH,
                        LocalDateTime.of(2026, 7, 30, 15, 0)));

        mockMvc.perform(patch("/api/v1/users/me").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"nickname":"새닉네임","email":"new@example.com",
                                 "profileImageUrl":"https://cdn.example.com/profile.png",
                                 "preferredLanguage":"ENGLISH"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userId").value(1))
                .andExpect(jsonPath("$.data.email").value("new@example.com"))
                .andExpect(jsonPath("$.data.preferredLanguage").value("ENGLISH"))
                .andExpect(jsonPath("$.data.updatedAt").value("2026-07-30T15:00:00"));
    }

    /** 빈 문자열과 HTTP가 아닌 이미지 URL을 컨트롤러 검증에서 거부하는지 검증한다. */
    @Test
    void rejectsBlankValueAndInvalidProfileImageUrl() throws Exception {
        mockMvc.perform(patch("/api/v1/users/me").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"nickname":"   ","profileImageUrl":"file:///profile.png"}
                                """))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(userProfileService);
    }

    /** 회원탈퇴가 Bearer 접두사를 제거한 Access Token과 함께 위임되고 탈퇴 시각을 응답하는지 검증한다. */
    @Test
    void withdrawsWithBearerTokenStripped() throws Exception {
        when(userProfileService.withdraw(any(), eq("access-token"), eq(PRINCIPAL)))
                .thenReturn(new UserWithdrawResponse(LocalDateTime.of(2026, 8, 2, 15, 30), true));

        mockMvc.perform(delete("/api/v1/users/me")
                        .header("Authorization", "Bearer access-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"password":"test1234"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.withdrawnAt").value("2026-08-02T15:30:00"))
                .andExpect(jsonPath("$.data.success").value(true));
    }

    /** 비밀번호를 비운 탈퇴 요청을 컨트롤러 검증에서 거부하는지 검증한다. */
    @Test
    void rejectsWithdrawalWithoutPassword() throws Exception {
        mockMvc.perform(delete("/api/v1/users/me")
                        .header("Authorization", "Bearer access-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"password":"   "}
                                """))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(userProfileService);
    }

    /** PATCH 요청 DTO가 명세의 수정 가능 필드만 갖는지 검증한다. */
    @Test
    void updateRequestHasOnlyEditableFields() {
        assertThat(MyProfileUpdateRequest.class.getRecordComponents())
                .extracting(component -> component.getName())
                .containsExactly("nickname", "email", "profileImageUrl", "preferredLanguage");
    }

    /** 독립 MockMvc에서 인증 principal을 컨트롤러 매개변수로 전달한다. */
    private static class PrincipalArgumentResolver implements HandlerMethodArgumentResolver {

        /** @AuthenticationPrincipal 매개변수만 이 해석기가 처리하는지 판단한다. */
        @Override
        public boolean supportsParameter(MethodParameter parameter) {
            return parameter.hasParameterAnnotation(AuthenticationPrincipal.class);
        }

        /** 테스트용 인증 사용자 정보를 컨트롤러 인자로 반환한다. */
        @Override
        public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                      NativeWebRequest webRequest,
                                      org.springframework.web.bind.support.WebDataBinderFactory binderFactory) {
            return PRINCIPAL;
        }
    }
}
