package com.ssafy.backend.meeting.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.dto.FanMeetingCreateRequest;
import com.ssafy.backend.meeting.dto.FanMeetingCreateResponse;
import com.ssafy.backend.meeting.dto.FanMeetingDetailResponse;
import com.ssafy.backend.meeting.dto.FanMeetingSummaryResponse;
import com.ssafy.backend.meeting.service.FanMeetingQueryService;
import com.ssafy.backend.meeting.service.FanMeetingService;
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

@RestController
@RequestMapping("/api/v1/fan-meetings")
public class FanMeetingController {
    private final FanMeetingService fanMeetingService;
    private final FanMeetingQueryService queryService;

    /**
     * 팬미팅 생성 및 조회 서비스를 주입받는다.
     *
     * @param fanMeetingService 팬미팅 생성 서비스
     * @param queryService 팬미팅 조회 서비스
     */
    public FanMeetingController(
            FanMeetingService fanMeetingService,
            FanMeetingQueryService queryService
    ) {
        this.fanMeetingService = fanMeetingService;
        this.queryService = queryService;
    }

    /**
     * 팬미팅을 초안 상태로 생성한다.
     *
     * @param authenticatedUser 로그인 사용자 정보
     * @param request 팬미팅 생성 요청
     * @return 생성된 팬미팅 정보
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FanMeetingCreateResponse create(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @Valid @RequestBody FanMeetingCreateRequest request
    ) {
        return fanMeetingService.create(authenticatedUser, request);
    }

    /**
     * 공개 팬미팅을 검색 조건에 따라 페이지 조회한다.
     *
     * @param keyword 제목 또는 인플루언서명 검색어
     * @param status 팬미팅 상태 필터
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal 선택적 로그인 사용자 정보
     * @return 공개 팬미팅 페이지
     */
    @GetMapping
    public ApiResponse<PageResponse<FanMeetingSummaryResponse>> getPublicMeetings(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) FanMeetingStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                queryService.getPublicMeetings(keyword, status, page, size, principal)
        );
    }

    /**
     * 팬미팅 상세와 현재 사용자의 응모·입장 가능 상태를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 선택적 로그인 사용자 정보
     * @return 팬미팅 상세 정보
     */
    @GetMapping("/{meetingId}")
    public ApiResponse<FanMeetingDetailResponse> getDetail(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(queryService.getDetail(meetingId, principal));
    }
}
