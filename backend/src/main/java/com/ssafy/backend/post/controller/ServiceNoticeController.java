package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
import com.ssafy.backend.post.service.PostQueryService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 서비스 공지 조회 API를 제공한다.
 *
 * <p>경로가 게시글 유형을 {@code SERVICE_NOTICE}로 고정하므로 클라이언트는 유형을 보내지 않는다.
 */
@RestController
@RequestMapping("/api/v1/service-notices")
public class ServiceNoticeController {

    private final PostQueryService postQueryService;

    /**
     * 공지 조회 서비스를 주입받는다.
     *
     * @param postQueryService 공지 조회 서비스
     */
    public ServiceNoticeController(PostQueryService postQueryService) {
        this.postQueryService = postQueryService;
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
}
