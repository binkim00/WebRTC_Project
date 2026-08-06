package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.post.dto.CommunityPostCreateRequest;
import com.ssafy.backend.post.dto.CommunityPostCreateResponse;
import com.ssafy.backend.post.dto.CommunityPostDetailResponse;
import com.ssafy.backend.post.dto.CommunityPostSummaryResponse;
import com.ssafy.backend.post.dto.PostDeleteResponse;
import com.ssafy.backend.post.dto.PostUpdateRequest;
import com.ssafy.backend.post.dto.PostUpdateResponse;
import com.ssafy.backend.post.service.PostCommandService;
import com.ssafy.backend.post.service.PostQueryService;
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
 * 커뮤니티 게시글 조회·작성·수정·삭제 API를 제공한다.
 *
 * <p>목록과 작성은 팬미팅 하위 경로를, 상세·수정·삭제는 게시글 단독 경로를 사용하므로
 * 메서드마다 전체 경로를 지정한다. 게시글 유형은 경로가 {@code COMMUNITY}로 고정한다.
 */
@RestController
@RequestMapping("/api/v1")
public class CommunityPostController {

    private final PostQueryService postQueryService;
    private final PostCommandService postCommandService;

    /**
     * 커뮤니티 게시글 조회·명령 서비스를 주입받는다.
     *
     * @param postQueryService 게시글 조회 서비스
     * @param postCommandService 게시글 작성·수정·삭제 서비스
     */
    public CommunityPostController(PostQueryService postQueryService,
                                   PostCommandService postCommandService) {
        this.postQueryService = postQueryService;
        this.postCommandService = postCommandService;
    }

    /**
     * 특정 팬미팅의 커뮤니티 게시글 목록을 조회한다(POST-001c).
     *
     * @param meetingId 팬미팅 식별자
     * @param keyword 제목·본문 검색어
     * @param page 페이지 번호이며 기본값 0
     * @param size 페이지 크기이며 기본값 20, 최대 100
     * @return 해당 팬미팅의 커뮤니티 게시글 목록 페이지
     */
    @GetMapping("/fan-meetings/{meetingId}/community/posts")
    public ApiResponse<PageResponse<CommunityPostSummaryResponse>> getCommunityPosts(
            @PathVariable Long meetingId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.success(
                postQueryService.getCommunityPosts(meetingId, keyword, page, size)
        );
    }

    /**
     * 커뮤니티 게시글 상세를 조회한다(POST-002c).
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param principal 선택적 로그인 사용자 정보
     * @return 커뮤니티 게시글 상세
     */
    @GetMapping("/community/posts/{postId}")
    public ApiResponse<CommunityPostDetailResponse> getCommunityPost(
            @PathVariable Long postId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(postQueryService.getCommunityPost(postId, principal));
    }

    /**
     * 해당 팬미팅 소유 운영자가 커뮤니티 게시글을 작성한다(POST-003b).
     *
     * @param meetingId 팬미팅 식별자
     * @param request 제목과 본문을 담은 작성 요청
     * @param principal 로그인 사용자 정보
     * @return 생성된 커뮤니티 게시글 정보
     */
    @PostMapping("/fan-meetings/{meetingId}/community/posts")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CommunityPostCreateResponse> createCommunityPost(
            @PathVariable Long meetingId,
            @Valid @RequestBody CommunityPostCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                postCommandService.createCommunityPost(meetingId, request, principal)
        );
    }

    /**
     * 작성자가 자신의 커뮤니티 게시글을 부분 수정한다(POST-004b).
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param request 수정할 제목·본문을 담은 요청
     * @param principal 로그인 사용자 정보
     * @return 수정된 게시글 정보
     */
    @PatchMapping("/community/posts/{postId}")
    public ApiResponse<PostUpdateResponse> updateCommunityPost(
            @PathVariable Long postId,
            @Valid @RequestBody PostUpdateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                postCommandService.updateCommunityPost(postId, request, principal)
        );
    }

    /**
     * 작성자나 해당 팬미팅 소유 운영자가 커뮤니티 게시글을 삭제한다(POST-005b).
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param principal 로그인 사용자 정보
     * @return 삭제 처리 결과
     */
    @DeleteMapping("/community/posts/{postId}")
    public ApiResponse<PostDeleteResponse> deleteCommunityPost(
            @PathVariable Long postId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(postCommandService.deleteCommunityPost(postId, principal));
    }
}
