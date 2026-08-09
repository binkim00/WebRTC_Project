package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.post.storage.AttachmentFileStorage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;

/** 공지 첨부파일의 콘텐츠 조회와 접근 권한 판정을 처리한다. */
@Service
public class AttachmentQueryService {

    private final CurrentUserService currentUserService;
    private final AttachmentRepository attachmentRepository;
    private final AttachmentFileStorage fileStorage;

    /**
     * 콘텐츠 조회에 필요한 사용자 서비스와 첨부파일 저장소, 파일 스토리지를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param attachmentRepository 첨부파일 저장소
     * @param fileStorage 첨부파일 스토리지
     */
    public AttachmentQueryService(CurrentUserService currentUserService,
                                  AttachmentRepository attachmentRepository,
                                  AttachmentFileStorage fileStorage) {
        this.currentUserService = currentUserService;
        this.attachmentRepository = attachmentRepository;
        this.fileStorage = fileStorage;
    }

    /**
     * 첨부파일을 내려주기 전에 접근 권한과 실제 파일 존재를 확인한다.
     *
     * <p>공개된 공지에 연결된 첨부는 공지 상세가 비로그인에게도 열려 있으므로 누구나 볼 수 있다.
     * 아직 연결되지 않았거나 숨김·삭제된 공지의 첨부는 업로더 본인, 공지 작성자, 서비스 운영자만
     * 접근할 수 있다.
     *
     * @param attachmentId 첨부파일 식별자
     * @param principal 선택적 로그인 사용자 정보
     * @return 내려줄 파일 경로와 메타데이터
     * @throws BusinessException 첨부파일이 없거나 접근 권한이 없거나 실제 파일이 없는 경우
     */
    @Transactional(readOnly = true)
    public AttachmentContent openContent(Long attachmentId, AuthenticatedUser principal) {
        Attachment attachment = attachmentRepository.findAccessContextById(attachmentId)
                .filter(found -> !found.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND));
        requireReadable(attachment, principal);

        String storageKey = attachment.getStorageKey();
        if (!fileStorage.exists(storageKey)) {
            throw new BusinessException(ErrorCode.ATTACHMENT_NOT_FOUND);
        }
        return new AttachmentContent(
                fileStorage.resolve(storageKey),
                attachment.getOriginalFileName(),
                attachment.getMimeType(),
                fileStorage.size(storageKey)
        );
    }

    /**
     * 조회자가 첨부파일을 볼 수 있는지 검증한다.
     *
     * @param attachment 대상 첨부파일
     * @param principal 선택적 로그인 사용자 정보
     * @throws BusinessException 비로그인이거나 접근 권한이 없는 경우
     */
    private void requireReadable(Attachment attachment, AuthenticatedUser principal) {
        if (isPubliclyVisible(attachment)) {
            return;
        }
        if (principal == null) {
            throw new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED);
        }

        User viewer = currentUserService.requireActiveUser(principal);
        if (attachment.isUploadedBy(viewer)
                || viewer.getRole() == UserRole.ADMIN
                || isPostAuthor(attachment, viewer)) {
            return;
        }
        throw new BusinessException(ErrorCode.ACCESS_DENIED);
    }

    /**
     * 누구나 볼 수 있는 첨부파일인지 확인한다.
     *
     * <p>팬미팅 커버 이미지는 게시글에 연결하지 않아 공개 여부를 판정할 게시글이 없지만
     * 비로그인 팬에게도 보여야 하므로 유형 자체를 공개로 본다
     * ({@code AttachmentType.isPubliclyReadable}).
     *
     * @param attachment 대상 첨부파일
     * @return 유형이 공개이거나 공개 상태의 게시글에 연결되어 있으면 true
     */
    private boolean isPubliclyVisible(Attachment attachment) {
        if (attachment.getAttachmentType().isPubliclyReadable()) {
            return true;
        }
        return attachment.isAttached() && attachment.getPost().isVisibleToPublic();
    }

    /**
     * 조회자가 첨부파일이 연결된 게시글의 작성자인지 확인한다.
     *
     * @param attachment 대상 첨부파일
     * @param viewer 조회자
     * @return 연결된 게시글의 작성자면 true
     */
    private boolean isPostAuthor(Attachment attachment, User viewer) {
        if (!attachment.isAttached()) {
            return false;
        }
        Post post = attachment.getPost();
        return post.getAuthor().getId().equals(viewer.getId());
    }

    /**
     * 내려줄 첨부파일의 실제 경로와 메타데이터다.
     *
     * @param path 서버 디스크의 파일 경로
     * @param fileName 응답 헤더에 사용할 원본 파일명
     * @param contentType 응답 Content-Type
     * @param sizeBytes 파일 크기(바이트)
     */
    public record AttachmentContent(Path path, String fileName, String contentType,
                                    long sizeBytes) {
    }
}
