package com.ssafy.backend.participant.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.participant.dto.ExternalParticipantConfirmResponse;
import com.ssafy.backend.participant.dto.ExternalParticipantPreviewResponse;
import com.ssafy.backend.participant.service.ExternalParticipantService;
import com.ssafy.backend.participant.support.ExternalParticipantCsvParser;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

/** 외부 선별 참가자 명단 CSV의 양식 제공과 검증·확정 요청을 처리한다. */
@RestController
@RequestMapping("/api/v1/fan-meetings")
public class ExternalParticipantController {

    /** 운영자가 내려받는 명단 양식 파일 이름이다. */
    private static final String TEMPLATE_FILE_NAME = "external-participant-template.csv";

    private final ExternalParticipantService externalParticipantService;
    private final ExternalParticipantCsvParser csvParser;

    /**
     * 명단 처리 서비스와 양식 생성을 담당하는 파서를 주입받는다.
     *
     * @param externalParticipantService 외부 선별 명단 서비스
     * @param csvParser 명단 CSV 파서
     */
    public ExternalParticipantController(ExternalParticipantService externalParticipantService,
                                         ExternalParticipantCsvParser csvParser) {
        this.externalParticipantService = externalParticipantService;
        this.csvParser = csvParser;
    }

    /**
     * 운영자가 채워 넣을 명단 CSV 양식을 내려준다.
     *
     * <p>특정 팬미팅과 무관한 공통 양식이므로 팬미팅 식별자를 받지 않는다.
     * 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 포함한다.
     *
     * @return 명단 양식 CSV 파일 응답
     */
    @GetMapping("/external-participants/csv-template")
    public ResponseEntity<byte[]> downloadTemplate() {
        byte[] body = csvParser.template().getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(TEMPLATE_FILE_NAME, StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(body);
    }

    /**
     * 업로드한 명단 CSV를 저장하지 않고 검증 결과만 확인한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param file 업로드된 명단 CSV
     * @param principal JWT 인증 사용자 정보
     * @return 행별 검증 결과와 확정 가능 여부
     */
    @PostMapping("/{meetingId}/external-participants/csv/preview")
    public ApiResponse<ExternalParticipantPreviewResponse> preview(
            @PathVariable Long meetingId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                externalParticipantService.preview(meetingId, file, principal));
    }

    /**
     * 업로드한 명단 CSV를 다시 검증하고 참가자와 대기열을 확정한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param file 업로드된 명단 CSV
     * @param principal JWT 인증 사용자 정보
     * @return 생성된 참가자 수와 확정 후 팬미팅 상태
     */
    @PostMapping("/{meetingId}/external-participants/csv/confirm")
    public ApiResponse<ExternalParticipantConfirmResponse> confirm(
            @PathVariable Long meetingId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                externalParticipantService.confirm(meetingId, file, principal));
    }
}
