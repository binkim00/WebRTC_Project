package com.ssafy.backend.participant.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.participant.domain.ParticipantSource;
import com.ssafy.backend.participant.dto.ParticipantSummaryResponse;
import com.ssafy.backend.participant.service.ParticipantQueryService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 팬미팅 운영자용 확정 참가자 조회 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}/participants")
public class FanMeetingParticipantController {

    private final ParticipantQueryService participantQueryService;

    /**
     * 참가자 조회 서비스를 주입받는다.
     *
     * @param participantQueryService 참가자 조회 서비스
     */
    public FanMeetingParticipantController(ParticipantQueryService participantQueryService) {
        this.participantQueryService = participantQueryService;
    }

    /**
     * 팬미팅의 확정 참가자를 배정 순번대로 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param participantStatus 참가자 상태 필터이며 생략하면 전체 상태를 조회한다
     * @param keyword 팬 닉네임 검색어이며 생략하면 전체 참가자를 조회한다
     * @param participantSource 참가자 출처 필터이며 생략하면 출처를 구분하지 않는다
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 참가자 페이지
     */
    @GetMapping
    public ApiResponse<PageResponse<ParticipantSummaryResponse>> getParticipants(
            @PathVariable Long meetingId,
            @RequestParam(required = false) String participantStatus,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) ParticipantSource participantSource,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(participantQueryService.getParticipants(
                meetingId, participantStatus, keyword, participantSource, page, size, principal));
    }

    /**
     * 팬미팅의 확정 참가자 한 명을 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param participantId 참가자 식별자
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 참가자 정보
     */
    @GetMapping("/{participantId}")
    public ApiResponse<ParticipantSummaryResponse> getParticipant(
            @PathVariable Long meetingId,
            @PathVariable Long participantId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                participantQueryService.getParticipant(meetingId, participantId, principal));
    }
}
