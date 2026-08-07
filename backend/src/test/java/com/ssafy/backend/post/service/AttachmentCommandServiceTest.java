package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.post.config.AttachmentStorageProperties;
import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.domain.AttachmentType;
import com.ssafy.backend.post.dto.AttachmentDeleteResponse;
import com.ssafy.backend.post.dto.AttachmentUploadResponse;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.post.storage.AttachmentFileStorage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AttachmentCommandServiceTest {

    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-02T02:00:00Z"), ZoneOffset.UTC);
    private static final long MAX_FILE_SIZE_BYTES = 10L * 1024 * 1024;
    private static final AuthenticatedUser PRINCIPAL =
            new AuthenticatedUser(1L, UserRole.MANAGER);

    private CurrentUserService currentUserService;
    private AttachmentRepository attachmentRepository;
    private AttachmentFileStorage fileStorage;
    private AttachmentCommandService service;

    /** 각 테스트마다 mock 협력 객체로 첨부파일 업로드 서비스를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        attachmentRepository = mock(AttachmentRepository.class);
        fileStorage = mock(AttachmentFileStorage.class);
        service = new AttachmentCommandService(
                currentUserService,
                attachmentRepository,
                fileStorage,
                new AttachmentStorageProperties("/srv/melly/attachments", MAX_FILE_SIZE_BYTES),
                CLOCK
        );
    }

    /** 허용 형식의 파일이 게시글 없이 저장되고 콘텐츠 조회 URL을 반환하는지 검증한다. */
    @Test
    void uploadsImageWithoutPost() {
        User uploader = stubUploader();
        when(fileStorage.newStorageKey("png", LocalDate.of(2026, 8, 2)))
                .thenReturn("2026/08/02/uuid.png");
        when(fileStorage.store(eq("2026/08/02/uuid.png"), any(InputStream.class),
                eq(MAX_FILE_SIZE_BYTES))).thenReturn(1024L);
        when(attachmentRepository.save(any(Attachment.class))).thenAnswer(invocation -> {
            Attachment saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 7L);
            return saved;
        });

        AttachmentUploadResponse response = service.upload(
                imageFile("cover.png", "image/png"), AttachmentType.NOTICE, PRINCIPAL);

        assertThat(response.attachmentId()).isEqualTo(7L);
        assertThat(response.originalFileName()).isEqualTo("cover.png");
        assertThat(response.fileUrl()).isEqualTo("/api/v1/attachments/7/content");
        assertThat(response.contentType()).isEqualTo("image/png");
        assertThat(response.fileSize()).isEqualTo(1024L);
        assertThat(uploader.getId()).isEqualTo(1L);
    }

    /** 업로드된 첨부파일이 아직 어떤 게시글에도 연결되지 않은 상태로 저장되는지 검증한다. */
    @Test
    void savesAttachmentDetachedFromPost() {
        stubUploader();
        stubStorage("2026/08/02/uuid.pdf", "pdf");
        when(attachmentRepository.save(any(Attachment.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        service.upload(imageFile("guide.pdf", "application/pdf"),
                AttachmentType.NOTICE, PRINCIPAL);

        verify(attachmentRepository).save(any(Attachment.class));
    }

    /** 허용하지 않는 확장자는 저장하지 않고 거부하는지 검증한다. */
    @Test
    void rejectsUnsupportedExtension() {
        stubUploader();

        assertThatThrownBy(() -> service.upload(
                imageFile("malware.exe", "application/octet-stream"),
                AttachmentType.NOTICE, PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_FORMAT_NOT_ALLOWED);
        verify(fileStorage, never()).store(anyString(), any(InputStream.class), anyLong());
    }

    /** 확장자만 허용 형식으로 바꾼 파일을 MIME 타입 불일치로 거부하는지 검증한다. */
    @Test
    void rejectsExtensionAndMimeTypeMismatch() {
        stubUploader();

        assertThatThrownBy(() -> service.upload(
                imageFile("fake.png", "application/pdf"), AttachmentType.NOTICE, PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_FORMAT_NOT_ALLOWED);
        verify(fileStorage, never()).store(anyString(), any(InputStream.class), anyLong());
    }

    /** 선언된 크기가 허용 한도를 넘으면 디스크에 쓰지 않고 거부하는지 검증한다. */
    @Test
    void rejectsFileLargerThanLimit() {
        stubUploader();
        MockMultipartFile file = new MockMultipartFile(
                "file", "big.png", "image/png", new byte[(int) MAX_FILE_SIZE_BYTES + 1]);

        assertThatThrownBy(() ->
                service.upload(file, AttachmentType.NOTICE, PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_FILE_TOO_LARGE);
        verify(fileStorage, never()).store(anyString(), any(InputStream.class), anyLong());
    }

    /** 빈 파일이 오면 파일이 필요하다는 오류로 거부하는지 검증한다. */
    @Test
    void rejectsEmptyFile() {
        stubUploader();
        MockMultipartFile file = new MockMultipartFile(
                "file", "empty.png", "image/png", new byte[0]);

        assertThatThrownBy(() ->
                service.upload(file, AttachmentType.NOTICE, PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_FILE_REQUIRED);
    }

    /** 첨부 유형을 보내지 않으면 잘못된 요청으로 거부하는지 검증한다. */
    @Test
    void rejectsMissingAttachmentType() {
        stubUploader();

        assertThatThrownBy(() -> service.upload(
                imageFile("cover.png", "image/png"), null, PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_REQUEST);
    }

    /** 메타데이터 저장이 실패하면 이미 옮긴 파일을 지워 고아 파일을 남기지 않는지 검증한다. */
    @Test
    void deletesStoredFileWhenSaveFails() {
        stubUploader();
        stubStorage("2026/08/02/uuid.png", "png");
        when(attachmentRepository.save(any(Attachment.class)))
                .thenThrow(new IllegalStateException("저장 실패"));

        assertThatThrownBy(() -> service.upload(
                imageFile("cover.png", "image/png"), AttachmentType.NOTICE, PRINCIPAL))
                .isInstanceOf(IllegalStateException.class);
        verify(fileStorage).delete("2026/08/02/uuid.png");
    }

    /** 업로드 스트림을 읽지 못하면 저장 실패 오류로 변환하는지 검증한다. */
    @Test
    void translatesStreamFailureToStorageError() throws IOException {
        stubUploader();
        when(fileStorage.newStorageKey(anyString(), any(LocalDate.class)))
                .thenReturn("2026/08/02/uuid.png");
        MockMultipartFile file = new MockMultipartFile(
                "file", "cover.png", "image/png", new byte[] {1, 2, 3}) {
            @Override
            public InputStream getInputStream() throws IOException {
                throw new IOException("스트림 오류");
            }
        };

        assertThatThrownBy(() ->
                service.upload(file, AttachmentType.NOTICE, PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_STORAGE_FAILED);
    }

    /** 커뮤니티 첨부 유형도 업로드를 허용하고 유형을 그대로 저장하는지 검증한다. */
    @Test
    void uploadsCommunityAttachment() {
        stubUploader();
        stubStorage("2026/08/02/uuid.png", "png");
        when(attachmentRepository.save(any(Attachment.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        service.upload(imageFile("photo.png", "image/png"),
                AttachmentType.COMMUNITY, PRINCIPAL);

        ArgumentCaptor<Attachment> captor = ArgumentCaptor.forClass(Attachment.class);
        verify(attachmentRepository).save(captor.capture());
        assertThat(captor.getValue().getAttachmentType()).isEqualTo(AttachmentType.COMMUNITY);
    }

    /** 커버 이미지 유형은 화면에 그릴 수 없는 PDF를 거부하는지 검증한다. */
    @Test
    void rejectsNonImageForMeetingCover() {
        stubUploader();

        assertThatThrownBy(() -> service.upload(
                imageFile("guide.pdf", "application/pdf"),
                AttachmentType.MEETING_COVER, PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_IMAGE_REQUIRED);
        verify(fileStorage, never()).store(anyString(), any(InputStream.class), anyLong());
    }

    /** 첨부 교체가 식별자를 유지한 채 새 파일로 바뀌고 옛 파일을 지우는지 검증한다. */
    @Test
    void replacesFileKeepingAttachmentId() {
        User uploader = stubUploader();
        Attachment attachment = attachment(uploader, AttachmentType.NOTICE);
        when(attachmentRepository.findAccessContextById(7L)).thenReturn(Optional.of(attachment));
        stubStorage("2026/08/02/new.png", "png");

        AttachmentUploadResponse response = service.replace(
                7L, imageFile("new-cover.png", "image/png"), PRINCIPAL);

        assertThat(response.attachmentId()).isEqualTo(7L);
        assertThat(response.fileUrl()).isEqualTo("/api/v1/attachments/7/content");
        assertThat(attachment.getStorageKey()).isEqualTo("2026/08/02/new.png");
        assertThat(attachment.getOriginalFileName()).isEqualTo("new-cover.png");
        verify(fileStorage).delete("2026/08/02/old.png");
    }

    /** 교체 요청이 형식 검증에서 막히면 옛 파일을 그대로 두는지 검증한다. */
    @Test
    void keepsPreviousFileWhenReplaceRejected() {
        User uploader = stubUploader();
        Attachment attachment = attachment(uploader, AttachmentType.MEETING_COVER);
        when(attachmentRepository.findAccessContextById(7L)).thenReturn(Optional.of(attachment));

        assertThatThrownBy(() -> service.replace(
                7L, imageFile("guide.pdf", "application/pdf"), PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_IMAGE_REQUIRED);
        assertThat(attachment.getStorageKey()).isEqualTo("2026/08/02/old.png");
        verify(fileStorage, never()).delete(anyString());
    }

    /** 업로더도 작성자도 운영자도 아니면 교체를 거부하는지 검증한다. */
    @Test
    void rejectsReplaceByOtherUser() {
        User other = mock(User.class);
        when(other.getId()).thenReturn(2L);
        when(other.getRole()).thenReturn(UserRole.FAN);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(other);
        User uploader = mock(User.class);
        when(uploader.getId()).thenReturn(1L);
        when(attachmentRepository.findAccessContextById(7L))
                .thenReturn(Optional.of(attachment(uploader, AttachmentType.NOTICE)));

        assertThatThrownBy(() -> service.replace(
                7L, imageFile("new.png", "image/png"), PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ACCESS_DENIED);
    }

    /** 첨부 삭제가 논리 삭제로 처리되고 삭제 시각을 시계에서 가져오는지 검증한다. */
    @Test
    void deletesAttachmentLogically() {
        User uploader = stubUploader();
        Attachment attachment = attachment(uploader, AttachmentType.NOTICE);
        when(attachmentRepository.findAccessContextById(7L)).thenReturn(Optional.of(attachment));

        AttachmentDeleteResponse response = service.delete(7L, PRINCIPAL);

        assertThat(response.attachmentId()).isEqualTo(7L);
        assertThat(response.deletedAt()).isEqualTo(LocalDateTime.now(CLOCK));
        assertThat(attachment.isDeleted()).isTrue();
    }

    /** 이미 삭제된 첨부는 없는 것으로 취급해 다시 삭제하지 못하는지 검증한다. */
    @Test
    void rejectsDeleteOfAlreadyDeletedAttachment() {
        User uploader = stubUploader();
        Attachment attachment = attachment(uploader, AttachmentType.NOTICE);
        attachment.softDelete(LocalDateTime.now(CLOCK));
        when(attachmentRepository.findAccessContextById(7L)).thenReturn(Optional.of(attachment));

        assertThatThrownBy(() -> service.delete(7L, PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    /** 식별자 7번을 가진 테스트용 첨부파일을 만든다. */
    private Attachment attachment(User uploader, AttachmentType attachmentType) {
        Attachment attachment = Attachment.createUploaded(
                uploader, attachmentType, "old-cover.png",
                "2026/08/02/old.png", 1024L, "image/png");
        ReflectionTestUtils.setField(attachment, "id", 7L);
        return attachment;
    }

    /** 저장 키 생성과 파일 저장이 성공하도록 대역을 설정한다. */
    private void stubStorage(String storageKey, String extension) {
        when(fileStorage.newStorageKey(eq(extension), any(LocalDate.class)))
                .thenReturn(storageKey);
        when(fileStorage.store(eq(storageKey), any(InputStream.class), eq(MAX_FILE_SIZE_BYTES)))
                .thenReturn(2048L);
    }

    /** 활성 업로더를 반환하도록 대역을 설정한다. */
    private User stubUploader() {
        User uploader = mock(User.class);
        when(uploader.getId()).thenReturn(1L);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(uploader);
        return uploader;
    }

    /** 지정한 이름과 MIME 타입을 가진 업로드 파일을 만든다. */
    private MockMultipartFile imageFile(String fileName, String contentType) {
        return new MockMultipartFile("file", fileName, contentType,
                new ByteArrayInputStream(new byte[] {1, 2, 3}).readAllBytes());
    }
}
