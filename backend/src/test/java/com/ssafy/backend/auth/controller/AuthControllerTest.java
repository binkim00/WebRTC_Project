package com.ssafy.backend.auth.controller;

import com.ssafy.backend.auth.dto.LoginResponse;
import com.ssafy.backend.auth.dto.SignupRequest;
import com.ssafy.backend.auth.dto.SignupResponse;
import com.ssafy.backend.auth.exception.AuthExceptionHandler;
import com.ssafy.backend.auth.exception.DuplicateEmailException;
import com.ssafy.backend.auth.exception.DuplicateLoginIdException;
import com.ssafy.backend.auth.exception.AccountUnavailableException;
import com.ssafy.backend.auth.exception.InvalidCredentialsException;
import com.ssafy.backend.auth.exception.InvalidRefreshTokenException;
import com.ssafy.backend.auth.exception.TooManyLoginAttemptsException;
import com.ssafy.backend.auth.service.LoginService;
import com.ssafy.backend.auth.service.LogoutService;
import com.ssafy.backend.auth.service.RefreshTokenService;
import com.ssafy.backend.auth.service.SignupService;
import com.ssafy.backend.auth.support.DeviceTokenService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthControllerTest {
    private SignupService signupService;
    private LoginService loginService;
    private LogoutService logoutService;
    private RefreshTokenService refreshTokenService;
    private DeviceTokenService deviceTokenService;
    private MockMvc mockMvc;

    /** 서비스 mock과 전역 예외 처리가 적용된 standalone MockMvc를 구성한다. */
    @BeforeEach
    void setUp() {
        signupService = mock(SignupService.class);
        loginService = mock(LoginService.class);
        logoutService = mock(LogoutService.class);
        refreshTokenService = mock(RefreshTokenService.class);
        deviceTokenService = mock(DeviceTokenService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(
                        new AuthController(signupService, loginService, logoutService,
                                refreshTokenService, deviceTokenService))
                .setControllerAdvice(new AuthExceptionHandler())
                .build();
    }

    /** Bearer Access Token을 로그아웃 서비스에 전달하고 HTTP 204를 반환하는지 검증한다. */
    @Test
    void revokesAccessTokenAndReturnsNoContent() throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout")
                        .header("Authorization", "Bearer access-token"))
                .andExpect(status().isNoContent());

        verify(logoutService).logout("access-token");
    }

    /** 정상 로그인 요청이 최종 계약에 정의된 토큰과 사용자 정보를 반환하는지 검증한다. */
    @Test
    void returnsLoginResponseWithFinalContract() throws Exception {
        when(loginService.login(any())).thenReturn(new LoginResponse(
                "access-token", "refresh-token", 3600, 1L, UserRole.FAN, "melly"
        ));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"loginId":"melly01","password":"password123"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("access-token"))
                .andExpect(jsonPath("$.refreshToken").value("refresh-token"))
                .andExpect(jsonPath("$.expiresIn").value(3600))
                .andExpect(jsonPath("$.userId").value(1))
                .andExpect(jsonPath("$.role").value("FAN"))
                .andExpect(jsonPath("$.nickname").value("melly"));
    }

    /** 명세 경로 /api/v1/auth/reissue 로 보낸 유효한 Refresh Token 요청이 회전된 토큰 응답을 반환하는지 검증한다. */
    @Test
    void returnsRotatedTokensForValidRefreshToken() throws Exception {
        when(refreshTokenService.refresh(any())).thenReturn(new LoginResponse(
                "new-access", "new-refresh", 3600, 1L, UserRole.FAN, "melly"
        ));

        mockMvc.perform(post("/api/v1/auth/reissue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"current-refresh"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("new-access"))
                .andExpect(jsonPath("$.refreshToken").value("new-refresh"));
    }

    /** 로그인 ID와 비밀번호의 공백·길이 제약을 위반한 요청이 서비스 호출 전에 거부되는지 검증한다. */
    @Test
    void rejectsBlankOrTooLongLoginIdAndBlankPassword() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"loginId":"   ","password":"password123"}
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"loginId":"%s","password":"password123"}
                                """.formatted("a".repeat(101))))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"loginId":"melly01","password":"   "}
                                """))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(loginService);
    }

    /** 로그인 인증 및 계정 상태 예외가 각각 약속된 ProblemDetail 응답으로 변환되는지 검증한다. */
    @Test
    void mapsLoginFailuresToProblemDetails() throws Exception {
        when(loginService.login(any())).thenThrow(new InvalidCredentialsException());
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"loginId":"melly01","password":"wrong"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid login ID or password."));

        reset(loginService);
        when(loginService.login(any())).thenThrow(new AccountUnavailableException());
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"loginId":"melly01","password":"password123"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("This account is not available."));
    }

    /** 임시 로그인 차단과 잘못된 Refresh Token을 약속된 오류 응답으로 변환하는지 검증한다. */
    @Test
    void mapsRedisAuthenticationFailuresToProblemDetails() throws Exception {
        when(loginService.login(any())).thenThrow(new TooManyLoginAttemptsException());
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"loginId":"melly01","password":"wrong"}
                                """))
                .andExpect(status().isTooManyRequests());

        when(refreshTokenService.refresh(any())).thenThrow(new InvalidRefreshTokenException());
        mockMvc.perform(post("/api/v1/auth/reissue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"invalid-refresh"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid or expired refresh token."));
    }

    /** 정상 가입 요청이 HTTP 201과 명세에 정의된 응답 필드만 반환하는지 확인한다. */
    @Test
    void returnsCreatedResponseWithFinalContract() throws Exception {
        when(signupService.signup(any())).thenReturn(new SignupResponse(
                1L, UserRole.FAN, LocalDateTime.of(2026, 7, 23, 10, 0)
        ));

        mockMvc.perform(validSignup("FAN"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(1))
                .andExpect(jsonPath("$.role").value("FAN"))
                .andExpect(jsonPath("$.createdAt").value("2026-07-23T10:00:00"))
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    /** 중복 로그인 ID 예외가 HTTP 409로 변환되는지 확인한다. */
    @Test
    void returnsConflictForDuplicateLoginId() throws Exception {
        when(signupService.signup(any())).thenThrow(new DuplicateLoginIdException());
        mockMvc.perform(validSignup("FAN")).andExpect(status().isConflict());
    }

    /** 중복 이메일 예외가 HTTP 409로 변환되는지 확인한다. */
    @Test
    void returnsConflictForDuplicateEmail() throws Exception {
        when(signupService.signup(any())).thenThrow(new DuplicateEmailException());
        mockMvc.perform(validSignup("FAN")).andExpect(status().isConflict());
    }

    /** 동시 요청으로 발생할 수 있는 DB UNIQUE 예외가 공통 HTTP 409 응답으로 변환되는지 확인한다. */
    @Test
    void returnsConflictWhenDatabaseUniqueConstraintIsViolated() throws Exception {
        when(signupService.signup(any())).thenThrow(new DataIntegrityViolationException("unique constraint"));

        mockMvc.perform(validSignup("FAN"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Duplicate user value"))
                .andExpect(jsonPath("$.detail").value("Login ID or email is already in use."));
    }

    /** 시스템 역할인 ADMIN을 일반 회원가입 요청에서 거부하는지 확인한다. */
    @Test
    void rejectsAdminRole() throws Exception {
        mockMvc.perform(validSignup("ADMIN")).andExpect(status().isBadRequest());
        verifyNoInteractions(signupService);
    }

    /** Enum에 정의되지 않은 역할 문자열을 HTTP 400으로 거부하는지 확인한다. */
    @Test
    void rejectsUnknownRole() throws Exception {
        mockMvc.perform(validSignup("UNKNOWN")).andExpect(status().isBadRequest());
        verifyNoInteractions(signupService);
    }

    /** 지원하지 않는 선호 언어 문자열이면 요청을 거부하는지 확인한다. */
    @Test
    void rejectsUnknownPreferredLanguage() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("FAN").replace("\"KOREAN\"", "\"SPANISH\"")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(signupService);
    }

    /** 로그인 ID가 공백뿐이면 Bean Validation이 요청을 거부하는지 확인한다. */
    @Test
    void rejectsBlankLoginId() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("FAN").replace("\"login-user\"", "\"   \"")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(signupService);
    }

    /** 로그인 ID가 DB 컬럼 길이인 100자를 초과하면 HTTP 400을 반환하는지 확인한다. */
    @Test
    void rejectsLoginIdLongerThan100Characters() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("FAN").replace("login-user", "a".repeat(101))))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(signupService);
    }

    /** 이메일이 DB 컬럼 길이인 255자를 초과하면 HTTP 400을 반환하는지 확인한다. */
    @Test
    void rejectsEmailLongerThan255Characters() throws Exception {
        String longEmail = "a".repeat(250) + "@x.com";
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("FAN").replace("user@example.com", longEmail)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(signupService);
    }

    /** 긴 문자열도 지원 언어 enum 값이 아니면 HTTP 400을 반환하는지 확인한다. */
    @Test
    void rejectsUnsupportedLongPreferredLanguage() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("FAN").replace("\"KOREAN\"", "\"" + "a".repeat(51) + "\"")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(signupService);
    }

    /** 필수 약관 중 하나라도 false이면 서비스 호출 전에 요청을 거부하는지 확인한다. */
    @Test
    void rejectsFalseOrMissingFinalAgreementFields() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("FAN").replace("\"privacyPolicyAgreed\":true", "\"privacyPolicyAgreed\":false")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(signupService);
    }

    /** SignupRequest가 최종 API 명세에 정의된 필드만 정확한 순서로 갖는지 확인한다. */
    @Test
    void signupRequestHasExactlyTheFinalFields() {
        assertThat(SignupRequest.class.getRecordComponents())
                .extracting(component -> component.getName())
                .containsExactly("loginId", "password", "email", "nickname", "role", "preferredLanguage",
                        "termsOfServiceAgreed", "privacyPolicyAgreed");
    }

    /** 지정한 역할로 정상 회원가입 HTTP 요청을 생성한다. */
    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder validSignup(String role) {
        return post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON).content(json(role));
    }

    /** 컨트롤러 테스트에서 재사용할 유효한 회원가입 JSON 본문을 생성한다. */
    private String json(String role) {
        return """
                {"loginId":"login-user","password":"password123","email":"user@example.com",
                 "nickname":"tester","role":"%s","preferredLanguage":"KOREAN",
                 "termsOfServiceAgreed":true,"privacyPolicyAgreed":true}
                """.formatted(role);
    }
}
