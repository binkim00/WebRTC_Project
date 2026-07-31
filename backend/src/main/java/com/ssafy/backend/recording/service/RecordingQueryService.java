package com.ssafy.backend.recording.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.recording.dto.RecordingDetailResponse;
import com.ssafy.backend.recording.dto.RecordingDownloadUrlResponse;
import com.ssafy.backend.recording.dto.RecordingSummaryResponse;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.recording.storage.RecordingFileStorage;
import com.ssafy.backend.user.domain.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;

/** 녹화 상세·목록 조회와 재생·다운로드 준비를 처리한다. */
@Service
public class RecordingQueryService {

    /** 목록 조회가 허용하는 최대 페이지 크기이며 다른 목록 API와 기준을 맞춘다. */
    static final int MAX_PAGE_SIZE = 100;

    /** 최근에 끝난 통화의 녹화를 먼저 보여 준다. */
    private static final Sort RECORDING_SORT = Sort.by(
            Sort.Order.desc("completedAt"),
            Sort.Order.desc("id")
    );

    private final CurrentUserService currentUserService;
    private final RecordingRepository recordingRepository;
    private final RecordingFileStorage fileStorage;
    private final RecordingAccessPolicy accessPolicy;
    private final RecordingDownloadTokenService downloadTokenService;
    private final Clock clock;

    /**
     * 조회에 필요한 사용자·녹화 저장소와 파일 스토리지, 권한 판정, 토큰 서비스, 시계를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param recordingRepository 녹화 저장소
     * @param fileStorage 녹화 파일 스토리지
     * @param accessPolicy 녹화 접근 권한 판정
     * @param downloadTokenService 다운로드 토큰 서비스
     * @param clock 재생 가능 판정 기준 시계
     */
    public RecordingQueryService(CurrentUserService currentUserService,
                                 RecordingRepository recordingRepository,
                                 RecordingFileStorage fileStorage,
                                 RecordingAccessPolicy accessPolicy,
                                 RecordingDownloadTokenService downloadTokenService,
                                 Clock clock) {
        this.currentUserService = currentUserService;
        this.recordingRepository = recordingRepository;
        this.fileStorage = fileStorage;
        this.accessPolicy = accessPolicy;
        this.downloadTokenService = downloadTokenService;
        this.clock = clock;
    }

    /**
     * 통화에 참여한 팬이 자신의 녹화 상세를 조회한다(REC-002).
     *
     * @param recordingId 녹화 식별자
     * @param principal 로그인 사용자 정보
     * @return 녹화 상세
     * @throws BusinessException 녹화가 없거나 소유한 팬이 아닌 경우
     */
    @Transactional(readOnly = true)
    public RecordingDetailResponse getRecording(Long recordingId, AuthenticatedUser principal) {
        User viewer = currentUserService.requireActiveUser(principal);
        Recording recording = requireOwnedRecording(recordingId, viewer.getId());
        return RecordingDetailResponse.of(recording, isPlayable(recording));
    }

    /**
     * 로그인한 팬이 자신의 녹화 목록을 최신순으로 페이지 조회한다(REC-004).
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal 로그인 사용자 정보
     * @return 내 녹화 목록 페이지
     * @throws BusinessException 페이지 값이 허용 범위를 벗어난 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<RecordingSummaryResponse> getMyRecordings(int page, int size,
                                                                 AuthenticatedUser principal) {
        validatePage(page, size);
        User viewer = currentUserService.requireActiveUser(principal);
        LocalDateTime now = LocalDateTime.now(clock);
        Page<RecordingSummaryResponse> result = recordingRepository
                .findAllByFanId(viewer.getId(), PageRequest.of(page, size, RECORDING_SORT))
                .map(recording -> RecordingSummaryResponse.of(recording, recording.isPlayableAt(now)));
        return PageResponse.from(result);
    }

    /**
     * 재생·다운로드에 사용할 단기 URL을 발급한다(REC-003).
     *
     * <p>URL은 서명된 토큰을 담고 있어 브라우저가 헤더 없이 바로 요청할 수 있다.
     *
     * @param recordingId 녹화 식별자
     * @param principal 로그인 사용자 정보
     * @return 토큰이 포함된 재생·다운로드 URL
     * @throws BusinessException 녹화가 없거나 소유한 팬이 아니거나 재생할 수 없는 상태인 경우
     */
    @Transactional(readOnly = true)
    public RecordingDownloadUrlResponse issueDownloadUrl(Long recordingId,
                                                         AuthenticatedUser principal) {
        User viewer = currentUserService.requireActiveUser(principal);
        Recording recording = requireOwnedRecording(recordingId, viewer.getId());
        requirePlayable(recording);

        var issued = downloadTokenService.issue(recording.getId(), viewer.getId());
        String downloadUrl = "/api/v1/recordings/%d/content?token=%s"
                .formatted(recording.getId(), issued.token());
        return new RecordingDownloadUrlResponse(
                recording.getId(),
                downloadUrl,
                LocalDateTime.ofInstant(issued.expiresAt(), ZoneId.systemDefault()),
                issued.expiresInSeconds()
        );
    }

    /**
     * 서명 토큰을 검증하고 실제로 내려줄 파일 정보를 준비한다.
     *
     * <p>토큰의 사용자와 녹화 소유자가 같은지 다시 확인해, 토큰이 유출되어도 다른 사람의
     * 녹화를 받을 수 없게 한다.
     *
     * @param recordingId 녹화 식별자
     * @param token 재생·다운로드 토큰
     * @return 내려줄 파일 경로와 메타데이터
     * @throws BusinessException 토큰이 무효하거나 녹화를 내려줄 수 없는 상태인 경우
     */
    @Transactional(readOnly = true)
    public RecordingContent openContent(Long recordingId, String token) {
        Long tokenUserId = downloadTokenService.verifyAndGetUserId(token, recordingId);
        Recording recording = requireOwnedRecording(recordingId, tokenUserId);
        requirePlayable(recording);

        Path path = fileStorage.resolve(recording.getStorageKey());
        if (!fileStorage.exists(recording.getStorageKey())) {
            // 상태는 남아 있지만 파일이 사라진 경우로 재생할 수 없음을 알린다.
            throw new BusinessException(ErrorCode.RECORDING_NOT_AVAILABLE);
        }
        return new RecordingContent(
                path,
                recording.getFileName(),
                recording.getContentType(),
                fileStorage.size(recording.getStorageKey())
        );
    }

    /**
     * 내려줄 녹화 파일의 경로와 메타데이터다.
     *
     * @param path 실제 파일 경로
     * @param fileName 다운로드 파일명
     * @param contentType 응답 MIME 타입
     * @param sizeBytes 파일 크기
     */
    public record RecordingContent(Path path, String fileName, String contentType, long sizeBytes) {
    }

    /**
     * 요청자가 소유한 녹화를 조회한다.
     *
     * @param recordingId 녹화 식별자
     * @param userId 요청 사용자 식별자
     * @return 소유가 확인된 녹화
     * @throws BusinessException 녹화가 없거나 소유한 팬이 아닌 경우
     */
    private Recording requireOwnedRecording(Long recordingId, Long userId) {
        Recording recording = recordingRepository.findDetailById(recordingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RECORDING_NOT_FOUND));
        accessPolicy.requireOwnerFan(recording, userId);
        return recording;
    }

    /**
     * 녹화가 지금 재생·다운로드 가능한 상태인지 확인한다.
     *
     * @param recording 대상 녹화
     * @throws BusinessException 만료·삭제·실패 상태인 경우
     */
    private void requirePlayable(Recording recording) {
        if (!isPlayable(recording)) {
            throw new BusinessException(ErrorCode.RECORDING_NOT_AVAILABLE);
        }
    }

    /** 현재 시각 기준으로 재생 가능한지 판정한다. */
    private boolean isPlayable(Recording recording) {
        return recording.isPlayableAt(LocalDateTime.now(clock));
    }

    /**
     * 페이지 번호와 크기가 허용 범위인지 검증한다.
     *
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @throws BusinessException 페이지 번호가 음수이거나 크기가 1~100 범위를 벗어난 경우
     */
    private void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }
}
