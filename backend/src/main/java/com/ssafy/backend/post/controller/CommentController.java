package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.post.dto.CommentCreateRequest;
import com.ssafy.backend.post.dto.CommentCreateResponse;
import com.ssafy.backend.post.dto.CommentDeleteResponse;
import com.ssafy.backend.post.dto.CommentReportCreateRequest;
import com.ssafy.backend.post.dto.CommentReportCreateResponse;
import com.ssafy.backend.post.dto.CommentSummaryResponse;
import com.ssafy.backend.post.dto.CommentUpdateRequest;
import com.ssafy.backend.post.dto.CommentUpdateResponse;
import com.ssafy.backend.post.service.CommentReportService;
import com.ssafy.backend.post.service.CommentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 커뮤니티 게시글 댓글 조회·작성과 댓글 신고 API를 제공한다.
 *
 * <p>댓글 목록은 게시글 하위 경로를, 댓글 신고는 댓글 단독 경로를 사용하므로
 * 메서드마다 전체 경로를 지정한다.
 */
@RestController
@RequestMapping("/api/v1")
public class CommentController {

    private final CommentService commentService;
    private final CommentReportService commentReportService;

    /**
     * 댓글 조회·작성 서비스와 댓글 신고 서비스를 주입받는다.
     *
     * @param commentService 댓글 조회·작성 서비스
     * @param commentReportService 댓글 신고 서비스
     */
    public CommentController(CommentService commentService,
                             CommentReportService commentReportService) {
        this.commentService = commentService;
        this.commentReportService = commentReportService;
    }

    /**
     * 커뮤니티 게시글의 댓글 목록을 조회한다(COMMENT-001).
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param page 페이지 번호이며 기본값 0
     * @param size 페이지 크기이며 기본값 20, 최대 100
     * @param principal 선택적 로그인 사용자 정보
     * @return 댓글 목록 페이지
     */
    @GetMapping("/community/posts/{postId}/comments")
    public ApiResponse<PageResponse<CommentSummaryResponse>> getComments(
            @PathVariable Long postId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commentService.getComments(postId, page, size, principal));
    }

    /**
     * 해당 팬미팅의 확정 참가자나 운영자가 커뮤니티 게시글에 댓글을 작성한다(COMMENT-002).
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param request 댓글 본문을 담은 작성 요청
     * @param principal 로그인 사용자 정보
     * @return 생성된 댓글 정보
     */
    @PostMapping("/community/posts/{postId}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CommentCreateResponse> createComment(
            @PathVariable Long postId,
            @Valid @RequestBody CommentCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commentService.createComment(postId, request, principal));
    }

    /**
     * 로그인 사용자가 다른 사용자의 댓글을 신고한다(COMMENT-004).
     *
     * @param commentId 신고 대상 댓글 식별자
     * @param request 신고 사유와 상세 설명을 담은 요청
     * @param principal 로그인 사용자 정보
     * @return 접수된 신고 정보
     */
    @PostMapping("/comments/{commentId}/reports")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CommentReportCreateResponse> reportComment(
            @PathVariable Long commentId,
            @Valid @RequestBody CommentReportCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                commentReportService.reportComment(commentId, request, principal)
        );
    }

    /**
     * 작성자가 자신의 댓글 본문을 수정한다(COMMENT-003a).
     *
     * @param commentId 댓글 식별자
     * @param request 새 댓글 본문을 담은 요청
     * @param principal 로그인 사용자 정보
     * @return 수정된 댓글 정보
     */
    @PatchMapping("/comments/{commentId}")
    public ApiResponse<CommentUpdateResponse> updateComment(
            @PathVariable Long commentId,
            @Valid @RequestBody CommentUpdateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commentService.updateComment(commentId, request, principal));
    }

    /**
     * 작성자나 해당 팬미팅 소유 운영자가 댓글을 삭제한다(COMMENT-003b).
     *
     * @param commentId 댓글 식별자
     * @param principal 로그인 사용자 정보
     * @return 삭제 처리 결과
     */
    @DeleteMapping("/comments/{commentId}")
    public ApiResponse<CommentDeleteResponse> deleteComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(commentService.deleteComment(commentId, principal));
    }
}
