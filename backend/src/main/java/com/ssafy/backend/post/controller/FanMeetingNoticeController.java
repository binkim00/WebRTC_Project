package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.post.dto.NoticeCreateRequest;
import com.ssafy.backend.post.dto.NoticeCreateResponse;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
import com.ssafy.backend.post.service.PostCommandService;
import com.ssafy.backend.post.service.PostQueryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 팬미팅 공지 조회·작성 API를 제공한다.
 *
 * <p>경로가 게시글 유형을 {@code MEETING_NOTICE}로 고정하므로 클라이언트는 유형을 보내지 않는다.
 */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}/notices")
public class FanMeetingNoticeController {

    private final PostQueryService postQueryService;
    private final PostCommandService postCommandService;

    /**
     * 공지 조회·작성 서비스를 주입받는다.
     *
     * @param postQueryService 공지 조회 서비스
     * @param postCommandService 공지 작성 서비스
     */
    public FanMeetingNoticeController(PostQueryService postQueryService,
                                      PostCommandService postCommandService) {
        this.postQueryService = postQueryService;
        this.postCommandService = postCommandService;
    }

    /**
     * 특정 팬미팅의 공지 목록을 조회한다(POST-001b).
     *
     * @param meetingId 팬미팅 식별자
     * @param keyword 제목·본문 검색어
     * @param page 페이지 번호이며 기본값 0
     * @param size 페이지 크기이며 기본값 20, 최대 100
     * @return 해당 팬미팅의 공지 목록 페이지
     */
    @GetMapping
    public ApiResponse<PageResponse<NoticeSummaryResponse>> getMeetingNotices(
            @PathVariable Long meetingId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.success(
                postQueryService.getMeetingNotices(meetingId, keyword, page, size)
        );
    }

    /**
     * 특정 팬미팅의 공지 상세를 조회한다(POST-002b).
     *
     * @param meetingId 팬미팅 식별자
     * @param noticeId 공지 식별자
     * @param principal 선택적 로그인 사용자 정보
     * @return 팬미팅 공지 상세
     */
    @GetMapping("/{noticeId}")
    public ApiResponse<NoticeDetailResponse> getMeetingNotice(
            @PathVariable Long meetingId,
            @PathVariable Long noticeId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                postQueryService.getMeetingNotice(meetingId, noticeId, principal)
        );
    }

    /**
     * 해당 팬미팅 운영자가 공지를 작성한다(POST-003a).
     *
     * @param meetingId 팬미팅 식별자
     * @param request 제목과 본문을 담은 작성 요청
     * @param principal 로그인 사용자 정보
     * @return 생성된 공지 정보
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<NoticeCreateResponse> createMeetingNotice(
            @PathVariable Long meetingId,
            @Valid @RequestBody NoticeCreateRequest request,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                postCommandService.createMeetingNotice(meetingId, request, principal)
        );
    }
}
