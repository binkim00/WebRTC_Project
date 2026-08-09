package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.post.config.AttachmentStorageProperties;
import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.domain.AttachmentContentType;
import com.ssafy.backend.post.domain.AttachmentType;
import com.ssafy.backend.post.dto.AttachmentUploadResponse;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.post.storage.AttachmentFileStorage;
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
import java.time.LocalDate;

/** 공지 첨부파일 업로드를 처리한다. */
@Service
public class AttachmentCommandService {

    private static final Logger log = LoggerFactory.getLogger(AttachmentCommandService.class);

    /** 원본 파일명을 알 수 없을 때 사용할 이름이다. */
    private static final String FALLBACK_FILE_NAME = "attachment";

    private final CurrentUserService currentUserService;
    private final AttachmentRepository attachmentRepository;
    private final AttachmentFileStorage fileStorage;
    private final AttachmentStorageProperties properties;
    private final Clock clock;

    /**
     * 업로드에 필요한 사용자 서비스와 첨부파일 저장소, 파일 스토리지, 설정, 시계를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param attachmentRepository 첨부파일 저장소
     * @param fileStorage 첨부파일 스토리지
     * @param properties 첨부파일 저장 설정
     * @param clock 저장 키 날짜 기준 시계
     */
    public AttachmentCommandService(CurrentUserService currentUserService,
                                    AttachmentRepository attachmentRepository,
                                    AttachmentFileStorage fileStorage,
                                    AttachmentStorageProperties properties,
                                    Clock clock) {
        this.currentUserService = currentUserService;
        this.attachmentRepository = attachmentRepository;
        this.fileStorage = fileStorage;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * 로그인 사용자가 공지에 첨부할 파일을 미리 업로드한다(ATTACH-001).
     *
     * <p>공지를 작성하기 전에 호출하므로 이 시점에는 연결할 게시글이 없다. 저장된 첨부파일은
     * 공지 작성·수정에서 {@code attachmentIds}로 연결될 때까지 업로더만 조회할 수 있다.
     * 파일은 임시 파일에 받은 뒤 최종 경로로 옮기며, 메타데이터 저장이 실패하면 옮긴 파일도
     * 지워 고아 파일을 남기지 않는다.
     *
     * @param file 업로드된 첨부파일
     * @param attachmentType 첨부파일 사용 유형이며 현재는 공지만 허용한다
     * @param principal 로그인 사용자 정보
     * @return 저장된 첨부파일 정보
     * @throws BusinessException 파일이 없거나 형식·크기 검증에 실패하거나 저장에 실패한 경우
     */
    @Transactional
    public AttachmentUploadResponse upload(MultipartFile file, AttachmentType attachmentType,
                                           AuthenticatedUser principal) {
        User uploader = currentUserService.requireActiveUser(principal);
        requireSupportedType(attachmentType);
        requireUploadedFile(file);

        AttachmentContentType contentType = AttachmentContentType.resolve(
                file.getOriginalFilename(), file.getContentType());
        if (file.getSize() > properties.maxFileSizeBytes()) {
            // 선언된 크기로 먼저 걸러 초과 파일을 디스크에 쓰지 않는다.
            throw new BusinessException(ErrorCode.ATTACHMENT_FILE_TOO_LARGE);
        }

        LocalDate today = LocalDate.now(clock);
        String storageKey = fileStorage.newStorageKey(contentType.extension(), today);
        long storedSize = storeFile(file, storageKey);

        try {
            Attachment attachment = Attachment.createUploaded(
                    uploader,
                    safeFileName(file.getOriginalFilename()),
                    storageKey,
                    storedSize,
                    contentType.mimeType()
            );
            return AttachmentUploadResponse.from(attachmentRepository.save(attachment));
        } catch (RuntimeException exception) {
            // 메타데이터 저장이 실패하면 이미 옮긴 파일도 지워 고아 파일을 남기지 않는다.
            fileStorage.delete(storageKey);
            throw exception;
        }
    }

    /**
     * 현재 지원하는 첨부 유형인지 확인한다.
     *
     * <p>첨부는 MVP에서 공지에만 허용하므로 다른 유형이 들어오면 거부한다.
     *
     * @param attachmentType 요청이 보낸 첨부 유형
     * @throws BusinessException 유형이 없거나 공지 첨부가 아닌 경우
     */
    private void requireSupportedType(AttachmentType attachmentType) {
        if (attachmentType != AttachmentType.NOTICE) {
            throw new BusinessException(ErrorCode.INVALID_REQUEST);
        }
    }

    /**
     * 업로드된 파일이 실제로 있는지 확인한다.
     *
     * @param file 업로드된 파일
     * @throws BusinessException 파일이 없거나 비어 있는 경우
     */
    private void requireUploadedFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.ATTACHMENT_FILE_REQUIRED);
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
            log.warn("첨부파일 업로드 스트림을 읽지 못했습니다. storageKey={}", storageKey, exception);
            throw new BusinessException(ErrorCode.ATTACHMENT_STORAGE_FAILED);
        }
    }

    /**
     * 원본 파일명에서 경로 요소와 제어문자를 제거한다.
     *
     * <p>저장 경로에는 이 값을 쓰지 않지만 조회 응답의 파일명 헤더에 들어가므로 미리 정리한다.
     *
     * @param originalFilename 업로드된 원본 파일명
     * @return 경로 구분자와 제어문자가 없는 파일명
     */
    private String safeFileName(String originalFilename) {
        String candidate = originalFilename == null ? FALLBACK_FILE_NAME : originalFilename;
        String withoutPath = Paths.get(candidate.replace('\\', '/')).getFileName().toString();
        String cleaned = withoutPath.replaceAll("[\\p{Cntrl}\"]", "").trim();
        return cleaned.isEmpty() ? FALLBACK_FILE_NAME : cleaned;
    }
}
