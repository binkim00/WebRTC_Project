package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import com.ssafy.backend.post.dto.NoticeCreateResponse;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
import com.ssafy.backend.post.service.PostCommandService;
import com.ssafy.backend.post.service.PostQueryService;
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
 * 공지 API 경로에 적용된 URL 단위 역할 규칙과 요청 값 검증 결과를 확인한다.
 *
 * <p>{@code SecurityConfig}의 규칙이 바뀌면 이 테스트가 함께 실패하도록 실제 보안 설정을 불러온다.
 */
@WebMvcTest({ServiceNoticeController.class, FanMeetingNoticeController.class})
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class NoticeSecurityTest {

    private static final String CREATE_BODY = """
            {"title":"공지 제목","content":"공지 본문"}
            """;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PostQueryService postQueryService;

    @MockitoBean
    private PostCommandService postCommandService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** 인증 없이 서비스 공지 목록을 조회할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousServiceNoticeList() throws Exception {
        when(postQueryService.getServiceNotices(isNull(), eq(0), eq(20))).thenReturn(emptyPage());

        mockMvc.perform(get("/api/v1/service-notices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    /** 인증 없이 서비스 공지 상세를 조회할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousServiceNoticeDetail() throws Exception {
        when(postQueryService.getServiceNotice(eq(100L), isNull())).thenReturn(detail(null));

        mockMvc.perform(get("/api/v1/service-notices/100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.noticeId").value(100));
    }

    /** 인증 없이 팬미팅 공지 목록을 조회할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousMeetingNoticeList() throws Exception {
        when(postQueryService.getMeetingNotices(eq(1L), isNull(), eq(0), eq(20)))
                .thenReturn(emptyPage());

        mockMvc.perform(get("/api/v1/fan-meetings/1/notices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    /** 인증 없이 팬미팅 공지 상세를 조회할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousMeetingNoticeDetail() throws Exception {
        when(postQueryService.getMeetingNotice(eq(1L), eq(100L), isNull())).thenReturn(detail(1L));

        mockMvc.perform(get("/api/v1/fan-meetings/1/notices/100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meetingId").value(1));
    }

    /** 인증 정보가 없으면 팬미팅 공지 작성이 HTTP 401을 반환하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedNoticeCreation() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/notices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(postCommandService);
    }

    /** FAN 역할은 팬미팅 공지 작성에서 HTTP 403을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanFromNoticeCreation() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/notices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(postCommandService);
    }

    /** 소속 인플루언서(INFLUENCER) 역할은 팬미팅 공지 작성에서 HTTP 403을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void rejectsInfluencerFromNoticeCreation() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/notices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(postCommandService);
    }

    /** MANAGER 역할은 팬미팅 공지 작성 Controller까지 접근하고 HTTP 201을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerToCreateNotice() throws Exception {
        when(postCommandService.createMeetingNotice(eq(1L), any(), isNull()))
                .thenReturn(new NoticeCreateResponse(
                        100L, 1L, "공지 제목", LocalDateTime.of(2026, 7, 30, 10, 0)
                ));

        mockMvc.perform(post("/api/v1/fan-meetings/1/notices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.noticeId").value(100));
    }

    /** SOLO_INFLUENCER 역할은 팬미팅 공지 작성 Controller까지 접근하고 HTTP 201을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerToCreateNotice() throws Exception {
        when(postCommandService.createMeetingNotice(eq(1L), any(), isNull()))
                .thenReturn(new NoticeCreateResponse(
                        101L, 1L, "공지 제목", LocalDateTime.of(2026, 7, 30, 10, 0)
                ));

        mockMvc.perform(post("/api/v1/fan-meetings/1/notices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.noticeId").value(101));
    }

    /** 빈 제목은 Controller 진입 전 검증에서 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsBlankTitleWithBadRequest() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/notices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"   \",\"content\":\"본문\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(postCommandService);
    }

    /** 빈 본문은 Controller 진입 전 검증에서 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsBlankContentWithBadRequest() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/notices")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"제목\",\"content\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(postCommandService);
    }

    /** 테스트에 사용할 빈 목록 페이지를 생성한다. */
    private PageResponse<NoticeSummaryResponse> emptyPage() {
        return new PageResponse<>(List.of(), 0, 20, 0, 0, false);
    }

    /**
     * 테스트에 사용할 상세 응답을 생성한다.
     *
     * @param meetingId 대상 팬미팅 식별자이며 서비스 공지는 null
     * @return 공지 상세 응답
     */
    private NoticeDetailResponse detail(Long meetingId) {
        return new NoticeDetailResponse(
                100L, meetingId, "공지 제목", "본문", 1L, "작성자", null, List.of(),
                LocalDateTime.of(2026, 7, 30, 10, 0), LocalDateTime.of(2026, 7, 30, 10, 0),
                false, false, false
        );
    }
}
