package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import com.ssafy.backend.post.domain.CommentReport;
import com.ssafy.backend.post.dto.CommentCreateRequest;
import com.ssafy.backend.post.dto.CommentCreateResponse;
import com.ssafy.backend.post.dto.CommentReportCreateRequest;
import com.ssafy.backend.post.dto.CommentReportCreateResponse;
import com.ssafy.backend.post.dto.CommentSummaryResponse;
import com.ssafy.backend.post.service.CommentReportService;
import com.ssafy.backend.post.service.CommentService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 댓글 API 경로에 적용된 URL 단위 접근 규칙과 요청 값 검증 결과를 확인한다.
 *
 * <p>{@code SecurityConfig}의 규칙이 바뀌면 이 테스트가 함께 실패하도록 실제 보안 설정을 불러온다.
 * 참가 자격 검증은 서비스 계층 책임이므로 여기서는 인증 요구 여부만 확인한다.
 */
@WebMvcTest(CommentController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class CommentSecurityTest {

    private static final String COMMENTS_PATH = "/api/v1/community/posts/1/comments";
    private static final String REPORTS_PATH = "/api/v1/comments/200/reports";
    private static final String CREATE_BODY = """
            {"content":"댓글 본문"}
            """;
    private static final String REPORT_BODY = """
            {"reason":"욕설","detail":"심한 표현"}
            """;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CommentService commentService;

    @MockitoBean
    private CommentReportService commentReportService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** 인증 없이 댓글 목록을 조회할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousCommentList() throws Exception {
        when(commentService.getComments(eq(1L), eq(0), eq(20), isNull())).thenReturn(emptyPage());

        mockMvc.perform(get(COMMENTS_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content").isEmpty());
    }

    /** 인증 정보가 없으면 댓글 작성이 HTTP 401을 반환하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedCommentCreation() throws Exception {
        mockMvc.perform(post(COMMENTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(commentService);
    }

    /** 인증된 FAN이 댓글 작성 Controller까지 접근하고 HTTP 201을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsAuthenticatedFanToReachCommentCreation() throws Exception {
        when(commentService.createComment(eq(1L), any(), isNull())).thenReturn(createResponse());

        mockMvc.perform(post(COMMENTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.commentId").value(100));
    }

    /** 인증된 MANAGER가 댓글 작성 Controller까지 접근하고 HTTP 201을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsAuthenticatedManagerToReachCommentCreation() throws Exception {
        when(commentService.createComment(eq(1L), any(), isNull())).thenReturn(createResponse());

        mockMvc.perform(post(COMMENTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.commentId").value(100));
    }

    /** 인증 정보가 없으면 댓글 신고가 HTTP 401을 반환하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedCommentReport() throws Exception {
        mockMvc.perform(post(REPORTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(REPORT_BODY))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(commentReportService);
    }

    /** 인증된 FAN이 댓글 신고 Controller까지 접근하고 HTTP 201을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsAuthenticatedUserToReachCommentReport() throws Exception {
        when(commentReportService.reportComment(eq(200L), any(), isNull()))
                .thenReturn(reportResponse());

        mockMvc.perform(post(REPORTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(REPORT_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.reportId").value(300))
                .andExpect(jsonPath("$.data.reportStatus").value(CommentReport.STATUS_RECEIVED));
    }

    /** 빈 댓글 본문은 Controller 진입 전 검증에서 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsBlankCommentContent() throws Exception {
        mockMvc.perform(post(COMMENTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(commentService);
    }

    /** 최대 길이를 한 글자 넘긴 댓글 본문이 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsTooLongCommentContent() throws Exception {
        String tooLong = "가".repeat(CommentCreateRequest.CONTENT_MAX_LENGTH + 1);

        mockMvc.perform(post(COMMENTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"" + tooLong + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(commentService);
    }

    /** 빈 신고 사유는 Controller 진입 전 검증에서 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsBlankReportReason() throws Exception {
        mockMvc.perform(post(REPORTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"  \",\"detail\":\"설명\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(commentReportService);
    }

    /** 최대 길이를 한 글자 넘긴 신고 사유가 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsTooLongReportReason() throws Exception {
        String tooLong = "가".repeat(CommentReportCreateRequest.REASON_MAX_LENGTH + 1);

        mockMvc.perform(post(REPORTS_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"" + tooLong + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(commentReportService);
    }

    /** 테스트에 사용할 빈 댓글 목록 페이지를 생성한다. */
    private PageResponse<CommentSummaryResponse> emptyPage() {
        return new PageResponse<>(List.of(), 0, 20, 0, 0, false);
    }

    /** 테스트에 사용할 댓글 작성 응답을 생성한다. */
    private CommentCreateResponse createResponse() {
        return new CommentCreateResponse(
                100L, 1L, "작성자", "댓글 본문", LocalDateTime.of(2026, 7, 31, 10, 0)
        );
    }

    /** 테스트에 사용할 댓글 신고 접수 응답을 생성한다. */
    private CommentReportCreateResponse reportResponse() {
        return new CommentReportCreateResponse(
                300L, 200L, CommentReport.STATUS_RECEIVED, LocalDateTime.of(2026, 7, 31, 10, 0)
        );
    }
}
