package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import com.ssafy.backend.post.dto.CommunityPostCreateResponse;
import com.ssafy.backend.post.dto.CommunityPostDetailResponse;
import com.ssafy.backend.post.dto.CommunityPostSummaryResponse;
import com.ssafy.backend.post.dto.PostDeleteResponse;
import com.ssafy.backend.post.dto.PostUpdateResponse;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 커뮤니티 게시글 API 경로에 적용된 URL 단위 규칙과 요청 값 검증 결과를 확인한다.
 *
 * <p>{@code SecurityConfig}의 규칙이 바뀌면 이 테스트가 함께 실패하도록 실제 보안 설정을 불러온다.
 * 수정·삭제는 URL 단계에서 인증만 요구하고 작성자·소유 운영자 판정은 서비스가 담당하므로,
 * 여기서는 인증 여부와 작성 역할 규칙만 검증한다.
 */
@WebMvcTest(CommunityPostController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class CommunityPostSecurityTest {

    private static final String CREATE_BODY = """
            {"title":"커뮤니티 제목","content":"커뮤니티 본문"}
            """;

    private static final String UPDATE_BODY = """
            {"title":"수정 제목"}
            """;

    private static final String LIST_PATH = "/api/v1/fan-meetings/10/community/posts";
    private static final String DETAIL_PATH = "/api/v1/community/posts/20";

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

    /** 인증 없이 커뮤니티 목록을 조회할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousCommunityList() throws Exception {
        when(postQueryService.getCommunityPosts(eq(10L), isNull(), eq(0), eq(20)))
                .thenReturn(emptyPage());

        mockMvc.perform(get(LIST_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    /** 인증 없이 커뮤니티 상세를 조회할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousCommunityDetail() throws Exception {
        when(postQueryService.getCommunityPost(eq(20L), isNull())).thenReturn(detail());

        mockMvc.perform(get(DETAIL_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.postId").value(20L));
    }

    /** 인증 없는 작성 요청이 401을 반환하는지 검증한다. */
    @Test
    void rejectsAnonymousCreate() throws Exception {
        mockMvc.perform(post(LIST_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(postCommandService);
    }

    /** 팬 역할의 작성 요청이 403을 반환하는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanCreate() throws Exception {
        mockMvc.perform(post(LIST_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(postCommandService);
    }

    /** 인플루언서 역할의 작성 요청이 403을 반환하는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void rejectsInfluencerCreate() throws Exception {
        mockMvc.perform(post(LIST_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(postCommandService);
    }

    /** 매니저 역할의 작성 요청이 통과하는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerCreate() throws Exception {
        when(postCommandService.createCommunityPost(eq(10L), any(), any()))
                .thenReturn(new CommunityPostCreateResponse(20L, 10L, "커뮤니티 제목",
                        LocalDateTime.of(2026, 7, 31, 10, 0)));

        mockMvc.perform(post(LIST_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.postId").value(20L));
    }

    /** 1인 인플루언서 역할의 작성 요청이 통과하는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerCreate() throws Exception {
        when(postCommandService.createCommunityPost(eq(10L), any(), any()))
                .thenReturn(new CommunityPostCreateResponse(21L, 10L, "커뮤니티 제목",
                        LocalDateTime.of(2026, 7, 31, 10, 0)));

        mockMvc.perform(post(LIST_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_BODY))
                .andExpect(status().isCreated());
    }

    /** 인증 없는 수정·삭제 요청이 401을 반환하는지 검증한다. */
    @Test
    void rejectsAnonymousUpdateAndDelete() throws Exception {
        mockMvc.perform(patch(DETAIL_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(UPDATE_BODY))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete(DETAIL_PATH))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(postCommandService);
    }

    /**
     * 인증된 사용자의 수정·삭제 요청이 URL 단계를 통과해 서비스까지 도달하는지 검증한다.
     *
     * <p>작성자·소유 운영자 판정은 서비스가 하므로 URL 규칙은 역할을 제한하지 않는다.
     * 팬도 자신의 글이 없으면 서비스에서 거부되지만 여기서는 도달 여부만 확인한다.
     */
    @Test
    @WithMockUser(roles = "FAN")
    void routesAuthenticatedUpdateAndDeleteToService() throws Exception {
        when(postCommandService.updateCommunityPost(eq(20L), any(), any()))
                .thenReturn(new PostUpdateResponse(20L, 10L, "수정 제목", "본문",
                        LocalDateTime.of(2026, 7, 31, 11, 0)));
        when(postCommandService.deleteCommunityPost(eq(20L), any()))
                .thenReturn(new PostDeleteResponse(20L, "PUBLISHED",
                        LocalDateTime.of(2026, 7, 31, 11, 0)));

        mockMvc.perform(patch(DETAIL_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(UPDATE_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("수정 제목"));
        mockMvc.perform(delete(DETAIL_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"));
    }

    /** 제목과 본문이 비어 있는 작성 요청이 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsBlankCreateBody() throws Exception {
        mockMvc.perform(post(LIST_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"\",\"content\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(postCommandService);
    }

    /** 수정할 항목이 없는 요청이 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsEmptyUpdateBody() throws Exception {
        mockMvc.perform(patch(DETAIL_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(postCommandService);
    }

    /** 검증 실패 시 서비스가 호출되지 않는 빈 페이지 응답을 만든다. */
    private PageResponse<CommunityPostSummaryResponse> emptyPage() {
        return new PageResponse<>(List.of(), 0, 20, 0L, 0, false);
    }

    /** 상세 응답 고정값을 만든다. */
    private CommunityPostDetailResponse detail() {
        return new CommunityPostDetailResponse(20L, 10L, "제목", "본문", 1L, "작성자",
                null, List.of(), 0L, LocalDateTime.of(2026, 7, 31, 10, 0),
                LocalDateTime.of(2026, 7, 31, 10, 0), false, false, false);
    }
}
