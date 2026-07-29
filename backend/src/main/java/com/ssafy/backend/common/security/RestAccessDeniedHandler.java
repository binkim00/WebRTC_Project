package com.ssafy.backend.common.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** 역할 기반 접근 거부를 일관된 JSON 오류 응답으로 작성한다. */
@Component
public class RestAccessDeniedHandler implements AccessDeniedHandler {

    /**
     * 권한 부족 응답에 공통 오류 코드를 기록한다.
     *
     * @param request 거부된 HTTP 요청
     * @param response 오류를 작성할 HTTP 응답
     * @param exception 발생한 접근 거부 예외
     * @throws IOException 응답 본문 작성에 실패한 경우
     */
    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException exception) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write("""
                {"type":"about:blank","title":"ACCESS_DENIED","status":403,
                "detail":"요청한 기능에 접근할 권한이 없습니다.","code":"ACCESS_DENIED"}
                """);
    }
}
