package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.auth.jwt.JwtTokenProvider;
import com.ssafy.backend.auth.jwt.RevokedAccessTokenStore;
import com.ssafy.backend.auth.jwt.TokenSessionStore;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import com.ssafy.backend.config.SecurityConfig;
import com.ssafy.backend.post.domain.AttachmentType;
import com.ssafy.backend.post.dto.AttachmentUploadResponse;
import com.ssafy.backend.post.service.AttachmentCommandService;
import com.ssafy.backend.post.service.AttachmentQueryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Path;
import java.nio.file.Paths;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 첨부파일 API 경로에 적용된 URL 단위 권한 규칙을 확인한다(ATTACH-001).
 *
 * <p>{@code SecurityConfig}의 규칙이 바뀌면 이 테스트가 함께 실패하도록 실제 보안 설정을 불러온다.
 */
@WebMvcTest(AttachmentController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class AttachmentSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AttachmentCommandService attachmentCommandService;

    @MockitoBean
    private AttachmentQueryService attachmentQueryService;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private RevokedAccessTokenStore revokedAccessTokenStore;

    @MockitoBean
    private TokenSessionStore tokenSessionStore;

    /** 비로그인 사용자의 첨부파일 업로드가 401로 막히는지 검증한다. */
    @Test
    void rejectsAnonymousUpload() throws Exception {
        mockMvc.perform(multipart("/api/v1/attachments")
                        .file(pngFile())
                        .param("attachmentType", "NOTICE"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(attachmentCommandService);
    }

    /** 로그인한 팬도 첨부파일을 업로드할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsAuthenticatedUpload() throws Exception {
        when(attachmentCommandService.upload(any(), eq(AttachmentType.NOTICE), any()))
                .thenReturn(uploadResponse());

        mockMvc.perform(multipart("/api/v1/attachments")
                        .file(pngFile())
                        .param("attachmentType", "NOTICE"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.attachmentId").value(7));
    }

    /** 첨부파일 콘텐츠 조회가 URL 단위로 열려 있는지 검증한다. */
    @Test
    void allowsAnonymousContentRequest() throws Exception {
        when(attachmentQueryService.openContent(eq(7L), isNull())).thenReturn(content());

        mockMvc.perform(get("/api/v1/attachments/7/content"))
                .andExpect(status().isOk());
    }

    /** 업로드 요청에 사용할 PNG 파일을 만든다. */
    private MockMultipartFile pngFile() {
        return new MockMultipartFile("file", "cover.png", "image/png", new byte[] {1, 2, 3});
    }

    /** 업로드 응답 대역을 만든다. */
    private AttachmentUploadResponse uploadResponse() {
        return new AttachmentUploadResponse(
                7L, "cover.png", "/api/v1/attachments/7/content", "image/png", 3L);
    }

    /** 콘텐츠 조회 대역을 만든다. */
    private AttachmentQueryService.AttachmentContent content() {
        Path path = Paths.get("src", "test", "resources", "attachment-security-sample.png");
        return new AttachmentQueryService.AttachmentContent(path, "cover.png", "image/png", 3L);
    }
}
