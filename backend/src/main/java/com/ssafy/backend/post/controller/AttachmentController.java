package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.post.domain.AttachmentType;
import com.ssafy.backend.post.dto.AttachmentUploadResponse;
import com.ssafy.backend.post.service.AttachmentCommandService;
import com.ssafy.backend.post.service.AttachmentQueryService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * 공지 첨부파일 업로드와 콘텐츠 조회 API를 제공한다(ATTACH-001).
 *
 * <p>업로드는 공지를 작성하기 전에 호출하고, 반환된 {@code attachmentId}를 공지 작성·수정의
 * {@code attachmentIds}로 넘겨 연결한다.
 */
@RestController
@RequestMapping("/api/v1/attachments")
public class AttachmentController {

    private final AttachmentCommandService commandService;
    private final AttachmentQueryService queryService;

    /**
     * 첨부파일 업로드·조회 서비스를 주입받는다.
     *
     * @param commandService 첨부파일 업로드 서비스
     * @param queryService 첨부파일 콘텐츠 조회 서비스
     */
    public AttachmentController(AttachmentCommandService commandService,
                                AttachmentQueryService queryService) {
        this.commandService = commandService;
        this.queryService = queryService;
    }

    /**
     * 로그인 사용자가 공지에 첨부할 파일을 업로드한다(ATTACH-001).
     *
     * @param file 업로드할 JPG, JPEG, PNG, WEBP 또는 PDF 파일
     * @param attachmentType 첨부파일 사용 유형이며 현재는 {@code NOTICE}만 허용한다
     * @param principal 로그인 사용자 정보
     * @return 저장된 첨부파일 정보
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<AttachmentUploadResponse> uploadAttachment(
            @RequestPart("file") MultipartFile file,
            @RequestParam AttachmentType attachmentType,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commandService.upload(file, attachmentType, principal));
    }

    /**
     * 첨부파일 콘텐츠를 내려준다.
     *
     * <p>공개된 공지에 연결된 첨부는 비로그인도 볼 수 있고, 아직 연결되지 않았거나 공개되지 않은
     * 공지의 첨부는 업로더·작성자·서비스 운영자만 볼 수 있다. 권한과 상태 검증은 응답 본문을
     * 쓰기 전에 끝내야 오류를 JSON으로 돌려줄 수 있다.
     *
     * @param attachmentId 첨부파일 식별자
     * @param download true면 첨부파일로 내려받게 한다
     * @param principal 선택적 로그인 사용자 정보
     * @param response 파일을 쓸 응답
     * @throws IOException 전송에 실패한 경우
     */
    @GetMapping("/{attachmentId}/content")
    public void getAttachmentContent(
            @PathVariable Long attachmentId,
            @RequestParam(defaultValue = "false") boolean download,
            @AuthenticationPrincipal AuthenticatedUser principal,
            HttpServletResponse response
    ) throws IOException {
        AttachmentQueryService.AttachmentContent content =
                queryService.openContent(attachmentId, principal);

        response.setStatus(HttpStatus.OK.value());
        response.setContentType(content.contentType());
        response.setContentLengthLong(content.sizeBytes());
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
                contentDisposition(content.fileName(), download));
        try (InputStream source = Files.newInputStream(content.path())) {
            StreamUtils.copy(source, response.getOutputStream());
        }
    }

    /**
     * 다운로드 파일명 헤더를 만든다.
     *
     * <p>{@link ContentDisposition}이 파일명을 규격에 맞게 인코딩해 헤더 주입을 막는다.
     *
     * @param fileName 원본 파일명
     * @param download 첨부파일로 내려받을지 여부
     * @return Content-Disposition 헤더 값
     */
    private String contentDisposition(String fileName, boolean download) {
        ContentDisposition.Builder builder = download
                ? ContentDisposition.attachment()
                : ContentDisposition.inline();
        return builder.filename(fileName, StandardCharsets.UTF_8).build().toString();
    }
}
