package com.ssafy.backend.meeting.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.meeting.dto.FanMeetingStatisticsResponse;
import com.ssafy.backend.meeting.service.FanMeetingStatisticsService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;

/** 팬미팅 결과 통계 조회 API를 제공한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings/{meetingId}/statistics")
public class FanMeetingStatisticsController {

    private final FanMeetingStatisticsService statisticsService;

    /**
     * 팬미팅 결과 통계 서비스를 주입받는다.
     *
     * @param statisticsService 팬미팅 결과 통계 서비스
     */
    public FanMeetingStatisticsController(FanMeetingStatisticsService statisticsService) {
        this.statisticsService = statisticsService;
    }

    /**
     * 소유 운영자가 팬미팅의 응모·참가·통화 결과 통계를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 로그인 사용자 정보
     * @return 팬미팅 결과 통계
     */
    @GetMapping
    public ApiResponse<FanMeetingStatisticsResponse> getStatistics(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(statisticsService.getStatistics(meetingId, principal));
    }

    /**
     * 소유 운영자가 참가자별 운영 결과를 CSV 파일로 내려받는다.
     *
     * <p>개인정보는 포함하지 않으며 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인다.
     *
     * @param meetingId 팬미팅 식별자
     * @param principal 로그인 사용자 정보
     * @return 참가자 운영 결과 CSV 파일 응답
     */
    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> exportStatistics(
            @PathVariable Long meetingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        byte[] body = statisticsService.exportParticipantResultCsv(meetingId, principal)
                .getBytes(StandardCharsets.UTF_8);
        String fileName = "fan-meeting-" + meetingId + "-statistics.csv";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(fileName, StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(body);
    }
}
