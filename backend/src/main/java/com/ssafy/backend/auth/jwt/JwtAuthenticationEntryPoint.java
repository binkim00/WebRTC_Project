package com.ssafy.backend.auth.jwt;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** JWT 인증 실패를 일관된 HTTP 401 ProblemDetail 응답으로 변환한다. */
@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {
    private static final String RESPONSE_BODY = """
            {"type":"about:blank","title":"Authentication failed","status":401,"detail":"Invalid or expired access token."}
            """;

    /** 인증 실패 세부 원인을 노출하지 않고 고정된 Access Token 오류 응답을 작성한다. */
    @Override
        public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write(RESPONSE_BODY);
    }
}
