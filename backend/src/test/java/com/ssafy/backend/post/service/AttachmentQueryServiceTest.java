package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.domain.AttachmentType;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.post.storage.AttachmentFileStorage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AttachmentQueryServiceTest {

    private static final long ATTACHMENT_ID = 7L;
    private static final String STORAGE_KEY = "2026/08/02/uuid.png";
    private static final AuthenticatedUser UPLOADER_PRINCIPAL =
            new AuthenticatedUser(1L, UserRole.MANAGER);
    private static final AuthenticatedUser OTHER_PRINCIPAL =
            new AuthenticatedUser(2L, UserRole.FAN);
    private static final AuthenticatedUser ADMIN_PRINCIPAL =
            new AuthenticatedUser(3L, UserRole.ADMIN);

    private CurrentUserService currentUserService;
    private AttachmentRepository attachmentRepository;
    private AttachmentFileStorage fileStorage;
    private AttachmentQueryService service;
    private User uploader;

    /** 각 테스트마다 mock 협력 객체로 첨부파일 조회 서비스를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        attachmentRepository = mock(AttachmentRepository.class);
        fileStorage = mock(AttachmentFileStorage.class);
        service = new AttachmentQueryService(
                currentUserService, attachmentRepository, fileStorage);
        uploader = user(1L, UserRole.MANAGER);
    }

    /** 공개된 공지에 연결된 첨부는 비로그인 조회자도 볼 수 있는지 검증한다. */
    @Test
    void allowsAnonymousAccessForPublishedNoticeAttachment() {
        Attachment attachment = attachment();
        attachment.attachTo(notice(uploader), 1);
        stubFound(attachment);
        stubStoredFile();

        AttachmentQueryService.AttachmentContent content =
                service.openContent(ATTACHMENT_ID, null);

        assertThat(content.fileName()).isEqualTo("cover.png");
        assertThat(content.contentType()).isEqualTo("image/png");
        assertThat(content.sizeBytes()).isEqualTo(1024L);
    }

    /** 아직 공지에 연결되지 않은 첨부를 업로더 본인이 볼 수 있는지 검증한다. */
    @Test
    void allowsUploaderToReadUnlinkedAttachment() {
        stubFound(attachment());
        stubStoredFile();
        when(currentUserService.requireActiveUser(UPLOADER_PRINCIPAL)).thenReturn(uploader);

        assertThat(service.openContent(ATTACHMENT_ID, UPLOADER_PRINCIPAL).fileName())
                .isEqualTo("cover.png");
    }

    /** 아직 연결되지 않은 첨부를 비로그인 조회자가 볼 수 없는지 검증한다. */
    @Test
    void rejectsAnonymousAccessForUnlinkedAttachment() {
        stubFound(attachment());

        assertThatThrownBy(() -> service.openContent(ATTACHMENT_ID, null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.AUTHENTICATION_REQUIRED);
    }

    /** 아직 연결되지 않은 첨부를 다른 사용자가 볼 수 없는지 검증한다. */
    @Test
    void rejectsOtherUserForUnlinkedAttachment() {
        stubFound(attachment());
        User other = user(2L, UserRole.FAN);
        when(currentUserService.requireActiveUser(OTHER_PRINCIPAL)).thenReturn(other);

        assertThatThrownBy(() -> service.openContent(ATTACHMENT_ID, OTHER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ACCESS_DENIED);
    }

    /** 서비스 운영자는 아직 연결되지 않은 첨부도 볼 수 있는지 검증한다. */
    @Test
    void allowsAdminToReadUnlinkedAttachment() {
        stubFound(attachment());
        stubStoredFile();
        User admin = user(3L, UserRole.ADMIN);
        when(currentUserService.requireActiveUser(ADMIN_PRINCIPAL)).thenReturn(admin);

        assertThat(service.openContent(ATTACHMENT_ID, ADMIN_PRINCIPAL).fileName())
                .isEqualTo("cover.png");
    }

    /** 숨김 처리된 공지의 첨부는 비로그인 조회자가 볼 수 없는지 검증한다. */
    @Test
    void rejectsAnonymousAccessForHiddenNoticeAttachment() {
        Attachment attachment = attachment();
        Post hidden = notice(uploader);
        attachment.attachTo(hidden, 1);
        hidden.hide();
        stubFound(attachment);

        assertThatThrownBy(() -> service.openContent(ATTACHMENT_ID, null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.AUTHENTICATION_REQUIRED);
    }

    /** 삭제 처리된 첨부는 업로더에게도 없는 것으로 응답하는지 검증한다. */
    @Test
    void rejectsDeletedAttachment() {
        Attachment attachment = attachment();
        attachment.softDelete(LocalDateTime.of(2026, 8, 2, 12, 0));
        stubFound(attachment);

        assertThatThrownBy(() -> service.openContent(ATTACHMENT_ID, UPLOADER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    /** 메타데이터는 있지만 실제 파일이 없으면 없는 것으로 응답하는지 검증한다. */
    @Test
    void rejectsWhenStoredFileMissing() {
        Attachment attachment = attachment();
        attachment.attachTo(notice(uploader), 1);
        stubFound(attachment);
        when(fileStorage.exists(STORAGE_KEY)).thenReturn(false);

        assertThatThrownBy(() -> service.openContent(ATTACHMENT_ID, null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    /** 존재하지 않는 첨부를 조회하면 없는 것으로 응답하는지 검증한다. */
    @Test
    void rejectsUnknownAttachment() {
        when(attachmentRepository.findAccessContextById(ATTACHMENT_ID))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.openContent(ATTACHMENT_ID, UPLOADER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    /**
     * 팬미팅 커버 이미지는 게시글에 붙지 않아도 비로그인 조회자가 볼 수 있는지 검증한다.
     *
     * <p>커버는 공개 팬미팅 화면에 그려지므로 연결된 게시글이 없다는 이유로 막히면 안 된다.
     */
    @Test
    void allowsAnonymousAccessForMeetingCover() {
        stubFound(coverAttachment());
        stubStoredFile();

        assertThat(service.openContent(ATTACHMENT_ID, null).fileName()).isEqualTo("cover.png");
    }

    /** 팬미팅 커버 이미지도 삭제 처리되면 비로그인에게 없는 것으로 응답하는지 검증한다. */
    @Test
    void rejectsDeletedMeetingCover() {
        Attachment cover = coverAttachment();
        cover.softDelete(LocalDateTime.of(2026, 8, 2, 12, 0));
        stubFound(cover);

        assertThatThrownBy(() -> service.openContent(ATTACHMENT_ID, null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    /** 게시글에 붙지 않는 팬미팅 커버 이미지 첨부를 만든다. */
    private Attachment coverAttachment() {
        Attachment attachment = Attachment.createUploaded(
                uploader, AttachmentType.MEETING_COVER, "cover.png",
                STORAGE_KEY, 1024L, "image/png");
        ReflectionTestUtils.setField(attachment, "id", ATTACHMENT_ID);
        return attachment;
    }

    /** 첨부파일 조회가 주어진 엔티티를 반환하도록 대역을 설정한다. */
    private void stubFound(Attachment attachment) {
        when(attachmentRepository.findAccessContextById(ATTACHMENT_ID))
                .thenReturn(Optional.of(attachment));
    }

    /** 저장된 파일이 존재하고 크기를 읽을 수 있도록 대역을 설정한다. */
    private void stubStoredFile() {
        Path path = Paths.get("/srv/melly/attachments").resolve(STORAGE_KEY);
        when(fileStorage.exists(STORAGE_KEY)).thenReturn(true);
        when(fileStorage.resolve(STORAGE_KEY)).thenReturn(path);
        when(fileStorage.size(STORAGE_KEY)).thenReturn(1024L);
    }

    /** 테스트용 첨부파일을 만든다. */
    private Attachment attachment() {
        Attachment attachment = Attachment.createUploaded(
                uploader, AttachmentType.NOTICE, "cover.png", STORAGE_KEY, 1024L, "image/png");
        ReflectionTestUtils.setField(attachment, "id", ATTACHMENT_ID);
        return attachment;
    }

    /** 테스트용 공개 팬미팅 공지를 만든다. */
    private Post notice(User author) {
        Post post = Post.createNotice(
                author, mock(FanMeeting.class), PostType.MEETING_NOTICE, "공지", "본문");
        ReflectionTestUtils.setField(post, "id", 100L);
        return post;
    }

    /** 식별자와 역할을 가진 테스트용 사용자를 만든다. */
    private User user(Long id, UserRole role) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        when(user.getRole()).thenReturn(role);
        return user;
    }
}
