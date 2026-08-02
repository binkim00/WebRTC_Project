package com.ssafy.backend.application.controller;

import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.dto.ApplicantListResponse;
import com.ssafy.backend.application.dto.ApplicationStatisticsResponse;
import com.ssafy.backend.application.dto.MyApplicationResponse;
import com.ssafy.backend.application.dto.MyApplicationSummaryResponse;
import com.ssafy.backend.application.service.ApplicationQueryService;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 팬의 응모 결과 조회와 운영자의 응모자 목록·통계 조회 API를 제공한다. */
@RestController
@RequestMapping("/api/v1")
public class ApplicationQueryController {

    private final ApplicationQueryService applicationQueryService;

    /**
     * 응모 조회 서비스를 주입받는다.
     *
     * @param applicationQueryService 응모 조회 서비스
     */
    public ApplicationQueryController(ApplicationQueryService applicationQueryService) {
        this.applicationQueryService = applicationQueryService;
    }

    /**
     * 팬이 특정 팬미팅에 제출한 자신의 응모 결과를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 내 응모 결과
     */
    @GetMapping("/fan-meetings/{meetingId}/applications/me")
    public ApiResponse<MyApplicationResponse> getMyApplication(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                applicationQueryService.getMyApplication(meetingId, principal)
        );
    }

    /**
     * 팬 자신의 전체 응모 내역을 페이지 조회한다.
     *
     * @param applicationStatus 응모 상태 필터이며 없으면 전체 상태를 조회한다
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 내 응모 내역 페이지
     */
    @GetMapping("/users/me/applications")
    public ApiResponse<PageResponse<MyApplicationSummaryResponse>> getMyApplications(
            @RequestParam(required = false) ApplicationStatus applicationStatus,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                applicationQueryService.getMyApplications(applicationStatus, page, size, principal)
        );
    }

    /**
     * 소유 운영자가 팬미팅 응모자 목록과 제출 답변을 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param applicationStatus 응모 상태 필터이며 없으면 취소를 제외한 전체를 조회한다
     * @param keyword 팬 닉네임 검색어
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 응모자 목록
     */
    @GetMapping("/fan-meetings/{meetingId}/applications")
    public ApiResponse<ApplicantListResponse> getApplicants(
            @PathVariable Long meetingId,
            @RequestParam(required = false) ApplicationStatus applicationStatus,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(applicationQueryService.getApplicants(
                meetingId, applicationStatus, keyword, page, size, principal
        ));
    }

    /**
     * 소유 운영자가 팬미팅의 응모 현황과 질문별 응답 통계를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 응모 현황·통계
     */
    @GetMapping("/fan-meetings/{meetingId}/applications/statistics")
    public ApiResponse<ApplicationStatisticsResponse> getStatistics(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(applicationQueryService.getStatistics(meetingId, principal));
    }
}
