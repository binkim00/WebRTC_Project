package com.ssafy.backend.recording.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.recording.dto.RecordingDetailResponse;
import com.ssafy.backend.recording.dto.RecordingDownloadUrlResponse;
import com.ssafy.backend.recording.dto.RecordingSummaryResponse;
import com.ssafy.backend.recording.dto.RecordingUploadResponse;
import com.ssafy.backend.recording.service.RecordingCommandService;
import com.ssafy.backend.recording.service.RecordingQueryService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * 녹화 업로드·조회와 재생·다운로드 API를 제공한다.
 *
 * <p>업로드는 통화 하위 경로를, 조회와 재생은 녹화 단독 경로를, 내 목록은 사용자 경로를 쓰므로
 * 메서드마다 전체 경로를 지정한다.
 */
@RestController
@RequestMapping("/api/v1")
public class RecordingController {

    private final RecordingCommandService commandService;
    private final RecordingQueryService queryService;

    /**
     * 녹화 업로드·조회 서비스를 주입받는다.
     *
     * @param commandService 녹화 업로드 서비스
     * @param queryService 녹화 조회·재생 준비 서비스
     */
    public RecordingController(RecordingCommandService commandService,
                               RecordingQueryService queryService) {
        this.commandService = commandService;
        this.queryService = queryService;
    }

    /**
     * 통화에 참여한 팬이 녹화 파일을 업로드한다(REC-001).
     *
     * @param callSessionId 통화 세션 식별자
     * @param file 업로드할 WEBM 또는 MP4 파일
     * @param durationSec 녹화 길이(초)이며 없으면 null
     * @param principal 로그인 사용자 정보
     * @return 저장된 녹화 정보
     */
    @PostMapping("/call-sessions/{callSessionId}/recordings/upload")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<RecordingUploadResponse> uploadRecording(
            @PathVariable Long callSessionId,
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false) Integer durationSec,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(
                commandService.upload(callSessionId, file, durationSec, principal)
        );
    }

    /**
     * 통화에 참여한 팬이 자신의 녹화 상세를 조회한다(REC-002).
     *
     * @param recordingId 녹화 식별자
     * @param principal 로그인 사용자 정보
     * @return 녹화 상세
     */
    @GetMapping("/recordings/{recordingId}")
    public ApiResponse<RecordingDetailResponse> getRecording(
            @PathVariable Long recordingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(queryService.getRecording(recordingId, principal));
    }

    /**
     * 재생·다운로드에 사용할 단기 URL을 발급한다(REC-003).
     *
     * @param recordingId 녹화 식별자
     * @param principal 로그인 사용자 정보
     * @return 토큰이 포함된 재생·다운로드 URL
     */
    @PostMapping("/recordings/{recordingId}/download-url")
    public ApiResponse<RecordingDownloadUrlResponse> issueDownloadUrl(
            @PathVariable Long recordingId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(queryService.issueDownloadUrl(recordingId, principal));
    }

    /**
     * 로그인한 팬이 자신의 녹화 목록을 조회한다(REC-004).
     *
     * @param page 페이지 번호이며 기본값 0
     * @param size 페이지 크기이며 기본값 20, 최대 100
     * @param principal 로그인 사용자 정보
     * @return 내 녹화 목록 페이지
     */
    @GetMapping("/users/me/recordings")
    public ApiResponse<PageResponse<RecordingSummaryResponse>> getMyRecordings(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        return ApiResponse.success(queryService.getMyRecordings(page, size, principal));
    }

    /**
     * 발급된 토큰으로 녹화 파일을 내려준다.
     *
     * <p>{@code POST /recordings/{id}/download-url}이 돌려준 URL의 수신 지점이다. 브라우저의
     * {@code <video>} 태그는 Authorization 헤더를 보낼 수 없어 URL의 서명 토큰으로 인가한다.
     * Range 요청에는 206과 {@code Content-Range}로 응답해 탐색과 이어보기를 지원한다.
     *
     * @param recordingId 녹화 식별자
     * @param token 재생·다운로드 토큰
     * @param download true면 첨부파일로 내려받게 한다
     * @param rangeHeader 요청의 Range 헤더이며 없으면 null
     * @return 전체 응답 200 또는 부분 응답 206
     */
    @GetMapping("/recordings/{recordingId}/content")
    public void downloadRecording(
            @PathVariable Long recordingId,
            @RequestParam String token,
            @RequestParam(defaultValue = "false") boolean download,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader,
            HttpServletResponse response
    ) throws IOException {
        // 권한과 상태 검증은 응답 본문을 쓰기 전에 끝내야 오류를 JSON으로 돌려줄 수 있다.
        RecordingQueryService.RecordingContent content =
                queryService.openContent(recordingId, token);
        long size = content.sizeBytes();

        response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
                contentDisposition(content.fileName(), download));
        response.setContentType(content.contentType());

        HttpRange range = firstRange(rangeHeader);
        if (range == null) {
            writeFull(content.path(), size, response);
            return;
        }

        long start = range.getRangeStart(size);
        long end = range.getRangeEnd(size);
        if (start >= size || start > end) {
            writeUnsatisfiableRange(size, response);
            return;
        }
        writeRange(content.path(), start, end, size, response);
    }

    /**
     * Range 헤더에서 처리할 첫 구간을 읽는다.
     *
     * <p>브라우저 재생은 단일 구간만 요청하므로 첫 구간만 사용한다. 헤더가 없거나 형식이
     * 잘못되면 전체 응답으로 처리하도록 null을 돌려준다.
     *
     * @param rangeHeader 요청의 Range 헤더
     * @return 첫 구간이며 Range 요청이 아니면 null
     */
    private HttpRange firstRange(String rangeHeader) {
        if (rangeHeader == null || rangeHeader.isBlank()) {
            return null;
        }
        try {
            List<HttpRange> ranges = HttpRange.parseRanges(rangeHeader);
            return ranges.isEmpty() ? null : ranges.get(0);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    /**
     * 파일 전체를 200으로 내려준다.
     *
     * @param path 파일 경로
     * @param size 파일 크기
     * @param response 응답
     * @throws IOException 전송에 실패한 경우
     */
    private void writeFull(Path path, long size, HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.OK.value());
        response.setContentLengthLong(size);
        try (InputStream source = Files.newInputStream(path)) {
            StreamUtils.copy(source, response.getOutputStream());
        }
    }

    /**
     * 요청한 구간만 206으로 내려주고 {@code Content-Range}를 설정한다.
     *
     * @param path 파일 경로
     * @param start 시작 바이트 위치
     * @param end 끝 바이트 위치이며 이 위치도 포함한다
     * @param size 전체 파일 크기
     * @param response 응답
     * @throws IOException 전송에 실패한 경우
     */
    private void writeRange(Path path, long start, long end, long size,
                            HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.PARTIAL_CONTENT.value());
        response.setHeader(HttpHeaders.CONTENT_RANGE,
                "bytes %d-%d/%d".formatted(start, end, size));
        response.setContentLengthLong(end - start + 1);
        try (InputStream source = Files.newInputStream(path)) {
            StreamUtils.copyRange(source, response.getOutputStream(), start, end);
        }
    }

    /**
     * 파일 크기를 벗어난 Range 요청에 416으로 응답한다.
     *
     * @param size 실제 파일 크기
     * @param response 응답
     */
    private void writeUnsatisfiableRange(long size, HttpServletResponse response) {
        response.setStatus(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE.value());
        response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes */" + size);
    }

    /**
     * 다운로드 파일명 헤더를 만든다.
     *
     * <p>{@link ContentDisposition}이 파일명을 규격에 맞게 인코딩해 헤더 주입을 막는다.
     *
     * @param fileName 원본 파일명
     * @param download 첨부파일로 내려받을지 여부
     * @return Content-Disposition 헤더 값
     */
    private String contentDisposition(String fileName, boolean download) {
        ContentDisposition.Builder builder = download
                ? ContentDisposition.attachment()
                : ContentDisposition.inline();
        return builder.filename(fileName, StandardCharsets.UTF_8).build().toString();
    }
}
