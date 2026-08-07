package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.post.dto.NoticeCreateRequest;
import com.ssafy.backend.post.dto.NoticeCreateResponse;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
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
 * 서비스 공지 조회·작성 API를 제공한다.
 *
 * <p>경로가 게시글 유형을 {@code SERVICE_NOTICE}로 고정하므로 클라이언트는 유형을 보내지 않는다.
 * 조회는 비로그인 사용자에게도 열려 있고 작성·수정·삭제는 서비스 운영자(ADMIN)만 할 수 있다.
 */
@RestController
@RequestMapping("/api/v1/service-notices")
public class ServiceNoticeController {

    private final PostQueryService postQueryService;
    private final PostCommandService postCommandService;

    /**
     * 공지 조회·작성 서비스를 주입받는다.
     *
     * @param postQueryService 공지 조회 서비스
     * @param postCommandService 공지 작성 서비스
     */
    public ServiceNoticeController(PostQueryService postQueryService,
                                   PostCommandService postCommandService) {
        this.postQueryService = postQueryService;
        this.postCommandService = postCommandService;
    }

    /**
     * 서비스 공지 목록을 조회한다(POST-001a).
     *
     * @param keyword 제목·본문 검색어
     * @param page 페이지 번호이며 기본값 0
     * @param size 페이지 크기이며 기본값 20, 최대 100
     * @return 서비스 공지 목록 페이지
     */
    @GetMapping
    public ApiResponse<PageResponse<NoticeSummaryResponse>> getServiceNotices(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.success(postQueryService.getServiceNotices(keyword, page, size));
    }

    /**
     * 서비스 공지 상세를 조회한다(POST-002a).
     *
     * @param noticeId 공지 식별자
     * @param principal 선택적 로그인 사용자 정보
     * @return 서비스 공지 상세
     */
    @GetMapping("/{noticeId}")
    public ApiResponse<NoticeDetailResponse> getServiceNotice(
            @PathVariable Long noticeId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(postQueryService.getServiceNotice(noticeId, principal));
    }

    /**
     * 서비스 운영자가 서비스 공지를 작성한다(POST-003c).
     *
     * @param request 제목과 본문을 담은 작성 요청
     * @param principal 로그인 사용자 정보
     * @return 생성된 공지 정보
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<NoticeCreateResponse> createServiceNotice(
            @Valid @RequestBody NoticeCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(postCommandService.createServiceNotice(request, principal));
    }

    /**
     * 작성한 서비스 운영자가 서비스 공지를 부분 수정한다(POST-004c).
     *
     * @param noticeId 공지 식별자
     * @param request 수정할 제목·본문을 담은 요청
     * @param principal 로그인 사용자 정보
     * @return 수정된 공지 정보
     */
    @PatchMapping("/{noticeId}")
    public ApiResponse<PostUpdateResponse> updateServiceNotice(
            @PathVariable Long noticeId,
            @Valid @RequestBody PostUpdateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                postCommandService.updateServiceNotice(noticeId, request, principal)
        );
    }

    /**
     * 작성한 서비스 운영자가 서비스 공지를 삭제한다(POST-005c).
     *
     * @param noticeId 공지 식별자
     * @param principal 로그인 사용자 정보
     * @return 삭제 처리 결과
     */
    @DeleteMapping("/{noticeId}")
    public ApiResponse<PostDeleteResponse> deleteServiceNotice(
            @PathVariable Long noticeId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(postCommandService.deleteServiceNotice(noticeId, principal));
    }
}
