package com.ssafy.backend.recording.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.recording.config.RecordingStorageProperties;
import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.recording.domain.RecordingMediaType;
import com.ssafy.backend.recording.dto.RecordingUploadResponse;
import com.ssafy.backend.recording.dto.RecordingConsentResponse;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.recording.storage.RecordingFileStorage;
import com.ssafy.backend.user.domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Paths;
import java.time.Clock;
import java.time.LocalDateTime;

/** 통화 녹화 파일 업로드를 처리한다. */
@Service
public class RecordingCommandService {

    private static final Logger log = LoggerFactory.getLogger(RecordingCommandService.class);

    private final CurrentUserService currentUserService;
    private final CallSessionRepository callSessionRepository;
    private final RecordingRepository recordingRepository;
    private final RecordingFileStorage fileStorage;
    private final RecordingAccessPolicy accessPolicy;
    private final RecordingStorageProperties properties;
    private final Clock clock;

    /**
     * 업로드에 필요한 사용자·통화·녹화 저장소와 파일 스토리지, 설정, 시계를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param callSessionRepository 통화 세션 저장소
     * @param recordingRepository 녹화 저장소
     * @param fileStorage 녹화 파일 스토리지
     * @param accessPolicy 녹화 접근 권한 판정
     * @param properties 녹화 저장 설정
     * @param clock 완료·만료 시각 기준 시계
     */
    public RecordingCommandService(CurrentUserService currentUserService,
                                   CallSessionRepository callSessionRepository,
                                   RecordingRepository recordingRepository,
                                   RecordingFileStorage fileStorage,
                                   RecordingAccessPolicy accessPolicy,
                                   RecordingStorageProperties properties,
                                   Clock clock) {
        this.currentUserService = currentUserService;
        this.callSessionRepository = callSessionRepository;
        this.recordingRepository = recordingRepository;
        this.fileStorage = fileStorage;
        this.accessPolicy = accessPolicy;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * 통화에 참여한 팬이 자신의 녹화 파일을 업로드한다(REC-001).
     *
     * <p>WEBM과 MP4만 허용하고 통화당 한 건만 저장한다. 파일은 임시 파일에 받은 뒤 최종 경로로
     * 옮기며, 실패하면 임시 파일과 이미 옮긴 파일을 정리해 반쪽짜리 결과를 남기지 않는다.
     *
     * @param callSessionId 녹화 대상 통화 세션 식별자
     * @param file 업로드된 녹화 파일
     * @param durationSec 녹화 길이(초)이며 알 수 없으면 null
     * @param principal 로그인 사용자 정보
     * @return 저장된 녹화 정보
     * @throws BusinessException 통화가 없거나 참여한 팬이 아니거나 형식·크기·중복 검증에 실패한 경우
     */
    @Transactional
    public RecordingUploadResponse upload(Long callSessionId, MultipartFile file,
                                          Integer durationSec, AuthenticatedUser principal) {
        User uploader = currentUserService.requireActiveUser(principal);
        CallSession callSession = callSessionRepository.findAccessContextById(callSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        accessPolicy.requireParticipantFan(callSession, uploader);

        if (recordingRepository.existsByCallSession_Id(callSessionId)) {
            // 통화당 녹화 파일은 1개만 허용한다.
            throw new BusinessException(ErrorCode.RECORDING_ALREADY_EXISTS);
        }
        requireUploadedFile(file);

        RecordingMediaType mediaType =
                RecordingMediaType.resolve(file.getOriginalFilename(), file.getContentType());
        if (file.getSize() > properties.maxFileSizeBytes()) {
            // 선언된 크기로 먼저 걸러 초과 파일을 디스크에 쓰지 않는다.
            throw new BusinessException(ErrorCode.RECORDING_FILE_TOO_LARGE);
        }

        LocalDateTime now = LocalDateTime.now(clock);
        String storageKey = fileStorage.newStorageKey(mediaType.extension(), now.toLocalDate());
        long storedSize = storeFile(file, storageKey);

        try {
            Recording recording = Recording.createAvailable(
                    callSession,
                    safeFileName(file.getOriginalFilename()),
                    mediaType.mimeType(),
                    storageKey,
                    storedSize,
                    durationSec,
                    now,
                    now.plusDays(properties.retentionDays())
            );
            return RecordingUploadResponse.from(recordingRepository.save(recording));
        } catch (RuntimeException exception) {
            // 메타데이터 저장이 실패하면 이미 옮긴 파일도 지워 고아 파일을 남기지 않는다.
            fileStorage.delete(storageKey);
            throw exception;
        }
    }

    /**
     * 통화 시작 전에 참여 팬의 녹화 동의를 기록한다.
     *
     * @param callSessionId 동의할 통화 세션 식별자
     * @param principal 로그인 팬
     * @return 최초 동의 시각
     */
    @Transactional
    public RecordingConsentResponse consent(Long callSessionId,
                                             AuthenticatedUser principal) {
        User fan = currentUserService.requireActiveUser(principal);
        CallSession callSession = callSessionRepository.findAccessContextById(callSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        accessPolicy.requireParticipantFan(callSession, fan);
        if (callSession.getStatus() != CallSessionStatus.CONNECTING) {
            throw new BusinessException(ErrorCode.CALL_SESSION_STATE_CONFLICT);
        }
        LocalDateTime consentedAt = callSession.getQueueEntry().getParticipant()
                .consentToRecording(LocalDateTime.now(clock));
        return new RecordingConsentResponse(callSessionId, consentedAt);
    }

    /**
     * 업로드된 파일이 실제로 있는지 확인한다.
     *
     * @param file 업로드된 파일
     * @throws BusinessException 파일이 없거나 비어 있는 경우
     */
    private void requireUploadedFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.RECORDING_FILE_REQUIRED);
        }
    }

    /**
     * 업로드 스트림을 스토리지에 저장한다.
     *
     * @param file 업로드된 파일
     * @param storageKey 저장 키
     * @return 실제 저장된 바이트 수
     * @throws BusinessException 스트림을 읽지 못하거나 저장에 실패한 경우
     */
    private long storeFile(MultipartFile file, String storageKey) {
        try (InputStream source = file.getInputStream()) {
            return fileStorage.store(storageKey, source, properties.maxFileSizeBytes());
        } catch (IOException exception) {
            log.warn("녹화 업로드 스트림을 읽지 못했습니다. storageKey={}", storageKey, exception);
            throw new BusinessException(ErrorCode.RECORDING_STORAGE_FAILED);
        }
    }

    /**
     * 원본 파일명에서 경로 요소와 제어문자를 제거한다.
     *
     * <p>저장 경로에는 이 값을 쓰지 않지만 다운로드 파일명 헤더에 들어가므로 미리 정리한다.
     *
     * @param originalFilename 업로드된 원본 파일명
     * @return 경로 구분자와 제어문자가 없는 파일명
     */
    private String safeFileName(String originalFilename) {
        String candidate = originalFilename == null ? "recording" : originalFilename;
        String withoutPath = Paths.get(candidate.replace('\\', '/')).getFileName().toString();
        String cleaned = withoutPath.replaceAll("[\\p{Cntrl}\"]", "").trim();
        return cleaned.isEmpty() ? "recording" : cleaned;
    }
}
