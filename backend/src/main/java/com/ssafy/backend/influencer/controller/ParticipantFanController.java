package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.ParticipantFanSummaryResponse;
import com.ssafy.backend.influencer.service.ParticipantFanService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 인플루언서가 자신이 개최한 팬미팅에 참가한 팬을 조회하는 API를 제공한다. */
@RestController
@RequestMapping("/api/v1")
public class ParticipantFanController {

    private final ParticipantFanService participantFanService;

    /**
     * 참가 팬 조회 서비스를 주입받는다.
     *
     * @param participantFanService 참가 팬 집계 조회 서비스
     */
    public ParticipantFanController(ParticipantFanService participantFanService) {
        this.participantFanService = participantFanService;
    }

    /**
     * 현재 인플루언서가 개최한 팬미팅에 참가한 팬을 중복 없이 최근 참여일 순으로 조회한다.
     *
     * <p>팔로워 목록(`/influencers/me/followers`)과 달리 팔로우 관계가 아니라 참가 이력을
     * 기준으로 하므로 두 API 의 결과는 서로 다르다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal JWT 인증 사용자 정보
     * @return 공통 성공 형식으로 감싼 참가 팬 요약 페이지
     */
    @GetMapping("/influencers/me/participant-fans")
    public ApiResponse<PageResponse<ParticipantFanSummaryResponse>> getMyParticipantFans(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                participantFanService.getMyParticipantFans(page, size, principal)
        );
    }
}
