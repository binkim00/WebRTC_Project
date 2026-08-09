package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.post.domain.AttachmentType;
import com.ssafy.backend.post.dto.AttachmentDeleteResponse;
import com.ssafy.backend.post.dto.AttachmentUploadResponse;
import com.ssafy.backend.post.service.AttachmentCommandService;
import com.ssafy.backend.post.service.AttachmentQueryService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
 * 첨부파일 업로드·교체·삭제와 콘텐츠 조회 API를 제공한다(ATTACH-001~003).
 *
 * <p>업로드는 게시글을 작성하기 전에 호출하고, 반환된 {@code attachmentId}를 공지·커뮤니티
 * 게시글 작성·수정의 {@code attachmentIds}로 넘겨 연결한다. 팬미팅 커버 이미지는 게시글에
 * 연결하지 않고 업로드 응답의 {@code fileUrl}을 커버 URL로 그대로 쓴다.
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
     * 로그인 사용자가 게시글이나 팬미팅 커버에 사용할 파일을 업로드한다(ATTACH-001).
     *
     * @param file 업로드할 JPG, JPEG, PNG, WEBP 또는 PDF 파일이며
     *             {@code MEETING_COVER}는 이미지만 받는다
     * @param attachmentType 첨부파일 사용 유형이며 {@code NOTICE}, {@code COMMUNITY},
     *                       {@code MEETING_COVER}를 허용한다
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
     * 이미 올린 첨부파일의 내용을 새 파일로 교체한다(ATTACH-002).
     *
     * <p>첨부 식별자와 콘텐츠 URL이 그대로이므로 게시글을 다시 저장하거나 커버 이미지 URL을
     * 고치지 않아도 새 파일이 보인다. 업로더 본인, 연결된 게시글의 작성자, 서비스 운영자만
     * 교체할 수 있고 첨부 용도는 바꿀 수 없다.
     *
     * @param attachmentId 교체할 첨부파일 식별자
     * @param file 새로 올릴 파일
     * @param principal 로그인 사용자 정보
     * @return 교체된 첨부파일 정보
     */
    @PutMapping("/{attachmentId}")
    public ApiResponse<AttachmentUploadResponse> replaceAttachment(
            @PathVariable Long attachmentId,
            @RequestPart("file") MultipartFile file,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commandService.replace(attachmentId, file, principal));
    }

    /**
     * 첨부파일을 삭제한다(ATTACH-003).
     *
     * <p>게시글에 연결된 첨부를 지우면 그 게시글에서도 함께 사라진다. 업로더 본인, 연결된
     * 게시글의 작성자, 서비스 운영자만 삭제할 수 있다.
     *
     * @param attachmentId 삭제할 첨부파일 식별자
     * @param principal 로그인 사용자 정보
     * @return 삭제 처리 결과
     */
    @DeleteMapping("/{attachmentId}")
    public ApiResponse<AttachmentDeleteResponse> deleteAttachment(
            @PathVariable Long attachmentId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commandService.delete(attachmentId, principal));
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
