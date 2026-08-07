package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.post.config.AttachmentStorageProperties;
import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.domain.AttachmentContentType;
import com.ssafy.backend.post.domain.AttachmentType;
import com.ssafy.backend.post.dto.AttachmentDeleteResponse;
import com.ssafy.backend.post.dto.AttachmentUploadResponse;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.post.storage.AttachmentFileStorage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
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
import java.time.LocalDateTime;

/** 첨부파일의 업로드·교체·삭제를 처리한다. */
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
     * 로그인 사용자가 게시글이나 팬미팅 커버에 사용할 파일을 미리 업로드한다(ATTACH-001).
     *
     * <p>게시글을 작성하기 전에 호출하므로 이 시점에는 연결할 게시글이 없다. 저장된 첨부파일은
     * 작성·수정에서 {@code attachmentIds}로 연결될 때까지 업로더만 조회할 수 있다.
     * 커버 이미지({@link AttachmentType#MEETING_COVER})는 게시글에 연결하지 않고 업로드 응답의
     * {@code fileUrl}을 팬미팅 커버 URL로 그대로 쓴다.
     *
     * <p>파일은 임시 파일에 받은 뒤 최종 경로로 옮기며, 메타데이터 저장이 실패하면 옮긴 파일도
     * 지워 고아 파일을 남기지 않는다.
     *
     * @param file 업로드된 첨부파일
     * @param attachmentType 첨부파일 사용 유형
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

        AttachmentContentType contentType = resolveContentType(file, attachmentType);
        requireAllowedSize(file);

        String storageKey = newStorageKey(contentType);
        long storedSize = storeFile(file, storageKey);

        try {
            Attachment attachment = Attachment.createUploaded(
                    uploader,
                    attachmentType,
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
     * 이미 올린 첨부파일의 내용을 새 파일로 교체한다(ATTACH-002).
     *
     * <p>첨부 식별자와 콘텐츠 URL이 그대로이므로 게시글 연결과 표시 순서, 커버 이미지 URL을
     * 다시 저장하지 않아도 새 그림이 보인다. 새 파일을 저장한 뒤에만 옛 파일을 지워, 교체가
     * 중간에 실패해도 내려줄 파일이 사라지지 않게 한다. 용도는 바꿀 수 없으므로 원래 유형의
     * 형식 제한을 그대로 적용한다.
     *
     * @param attachmentId 교체할 첨부파일 식별자
     * @param file 새로 올릴 파일
     * @param principal 로그인 사용자 정보
     * @return 교체된 첨부파일 정보
     * @throws BusinessException 첨부가 없거나 권한이 없거나 형식·크기 검증에 실패한 경우
     */
    @Transactional
    public AttachmentUploadResponse replace(Long attachmentId, MultipartFile file,
                                            AuthenticatedUser principal) {
        Attachment attachment = requireModifiable(attachmentId, principal);
        requireUploadedFile(file);

        AttachmentContentType contentType = resolveContentType(file, attachment.getAttachmentType());
        requireAllowedSize(file);

        String previousKey = attachment.getStorageKey();
        String storageKey = newStorageKey(contentType);
        long storedSize = storeFile(file, storageKey);

        try {
            attachment.replaceFile(
                    safeFileName(file.getOriginalFilename()),
                    storageKey,
                    storedSize,
                    contentType.mimeType()
            );
        } catch (IllegalStateException exception) {
            fileStorage.delete(storageKey);
            throw new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND);
        } catch (RuntimeException exception) {
            fileStorage.delete(storageKey);
            throw exception;
        }

        // 교체가 확정된 뒤에만 옛 파일을 지운다. 트랜잭션이 뒤에서 롤백되면 지운 파일은
        // 돌아오지 않지만, 그 경우 첨부 행도 옛 키로 되돌아가므로 조회는 404가 된다.
        fileStorage.delete(previousKey);
        return AttachmentUploadResponse.from(attachment);
    }

    /**
     * 첨부파일을 삭제한다(ATTACH-003).
     *
     * <p>게시글에 연결되어 있으면 그 게시글에서도 함께 사라진다. 행과 실제 파일은 남기고 삭제
     * 시각만 기록하는 논리 삭제이며, 이는 공지 수정에서 첨부를 뺐을 때와 같은 처리다. 실제 파일을
     * 지우지 않는 이유는 롤백 가능성 때문이며, 조회는 삭제 시각으로 이미 차단된다.
     *
     * @param attachmentId 삭제할 첨부파일 식별자
     * @param principal 로그인 사용자 정보
     * @return 삭제 처리 결과
     * @throws BusinessException 첨부가 없거나 권한이 없는 경우
     */
    @Transactional
    public AttachmentDeleteResponse delete(Long attachmentId, AuthenticatedUser principal) {
        Attachment attachment = requireModifiable(attachmentId, principal);
        attachment.softDelete(LocalDateTime.now(clock));
        return AttachmentDeleteResponse.from(attachment);
    }

    /**
     * 교체·삭제할 수 있는 첨부파일을 조회하고 권한을 검증한다.
     *
     * <p>업로더 본인, 연결된 게시글의 작성자, 서비스 운영자만 바꿀 수 있다. 첨부 콘텐츠 조회
     * ({@code AttachmentQueryService})가 비공개 첨부에 적용하는 기준과 같아, 볼 수 있는 사람과
     * 바꿀 수 있는 사람이 어긋나지 않는다.
     *
     * @param attachmentId 첨부파일 식별자
     * @param principal 로그인 사용자 정보
     * @return 권한 검증을 통과한 첨부파일
     * @throws BusinessException 첨부가 없거나 이미 삭제되었거나 권한이 없는 경우
     */
    private Attachment requireModifiable(Long attachmentId, AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        Attachment attachment = attachmentRepository.findAccessContextById(attachmentId)
                .filter(found -> !found.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND));

        boolean postAuthor = attachment.isAttached()
                && attachment.getPost().getAuthor().getId().equals(actor.getId());
        if (attachment.isUploadedBy(actor) || postAuthor || actor.getRole() == UserRole.ADMIN) {
            return attachment;
        }
        throw new BusinessException(ErrorCode.ACCESS_DENIED);
    }

    /**
     * 첨부 유형이 요구하는 형식 제한까지 반영해 파일 형식을 판정한다.
     *
     * @param file 업로드된 파일
     * @param attachmentType 첨부파일 사용 유형
     * @return 확인된 첨부파일 형식
     * @throws BusinessException 허용 형식이 아니거나 이미지 전용 유형에 이미지가 아닌 파일이 온 경우
     */
    private AttachmentContentType resolveContentType(MultipartFile file,
                                                     AttachmentType attachmentType) {
        AttachmentContentType contentType = AttachmentContentType.resolve(
                file.getOriginalFilename(), file.getContentType());
        if (attachmentType.requiresImage() && !contentType.isImage()) {
            throw new BusinessException(ErrorCode.ATTACHMENT_IMAGE_REQUIRED);
        }
        return contentType;
    }

    /**
     * 오늘 날짜를 기준으로 새 저장 키를 만든다.
     *
     * @param contentType 확인된 첨부파일 형식
     * @return 다른 첨부와 겹치지 않는 저장 키
     */
    private String newStorageKey(AttachmentContentType contentType) {
        LocalDate today = LocalDate.now(clock);
        return fileStorage.newStorageKey(contentType.extension(), today);
    }

    /**
     * 현재 지원하는 첨부 유형인지 확인한다.
     *
     * @param attachmentType 요청이 보낸 첨부 유형
     * @throws BusinessException 유형이 없는 경우
     */
    private void requireSupportedType(AttachmentType attachmentType) {
        if (attachmentType == null) {
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
     * 선언된 파일 크기가 허용 범위인지 확인한다.
     *
     * <p>선언된 크기로 먼저 걸러 초과 파일을 디스크에 쓰지 않는다.
     *
     * @param file 업로드된 파일
     * @throws BusinessException 허용 크기를 초과한 경우
     */
    private void requireAllowedSize(MultipartFile file) {
        if (file.getSize() > properties.maxFileSizeBytes()) {
            throw new BusinessException(ErrorCode.ATTACHMENT_FILE_TOO_LARGE);
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
