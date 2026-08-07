package com.ssafy.backend.post.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.post.domain.Attachment;
import com.ssafy.backend.post.domain.AttachmentType;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.user.domain.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AttachmentLinkServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 2, 11, 0);
    private static final long POST_ID = 100L;

    private AttachmentRepository attachmentRepository;
    private AttachmentLinkService service;
    private User author;
    private Post notice;

    /** 각 테스트마다 mock 저장소로 첨부 연결 서비스와 대상 공지를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        attachmentRepository = mock(AttachmentRepository.class);
        service = new AttachmentLinkService(attachmentRepository);
        author = user(1L);
        notice = notice(author);
        when(attachmentRepository
                .findAllByPost_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(POST_ID))
                .thenReturn(List.of());
    }

    /** 첨부 목록을 보내지 않으면 연결 상태를 건드리지 않는지 검증한다. */
    @Test
    void keepsLinksWhenRequestIsNull() {
        Attachment attached = attachment(10L, author);
        attached.attachTo(notice, 1);

        service.replaceLinks(notice, null, author, NOW);

        assertThat(attached.isDeleted()).isFalse();
        assertThat(attached.getDisplayOrder()).isEqualTo(1);
    }

    /** 업로더가 올린 첨부가 보낸 순서대로 공지에 연결되는지 검증한다. */
    @Test
    void linksAttachmentsInRequestedOrder() {
        Attachment first = attachment(10L, author);
        Attachment second = attachment(11L, author);
        stubRequested(List.of(first, second));

        service.replaceLinks(notice, List.of(11L, 10L), author, NOW);

        assertThat(second.getPost()).isSameAs(notice);
        assertThat(second.getDisplayOrder()).isEqualTo(1);
        assertThat(first.getPost()).isSameAs(notice);
        assertThat(first.getDisplayOrder()).isEqualTo(2);
    }

    /** 목록에서 빠진 기존 첨부가 해제되며 삭제 처리되는지 검증한다. */
    @Test
    void detachesAttachmentMissingFromRequest() {
        Attachment kept = attachment(10L, author);
        Attachment removed = attachment(11L, author);
        kept.attachTo(notice, 1);
        removed.attachTo(notice, 2);
        when(attachmentRepository
                .findAllByPost_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(POST_ID))
                .thenReturn(List.of(kept, removed));
        stubRequested(List.of(kept));

        service.replaceLinks(notice, List.of(10L), author, NOW);

        assertThat(removed.isDeleted()).isTrue();
        assertThat(removed.getDeletedAt()).isEqualTo(NOW);
        assertThat(kept.isDeleted()).isFalse();
    }

    /** 빈 목록을 보내면 연결된 첨부가 모두 해제되는지 검증한다. */
    @Test
    void detachesAllWhenRequestIsEmpty() {
        Attachment attached = attachment(10L, author);
        attached.attachTo(notice, 1);
        when(attachmentRepository
                .findAllByPost_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(POST_ID))
                .thenReturn(List.of(attached));

        service.replaceLinks(notice, List.of(), author, NOW);

        assertThat(attached.isDeleted()).isTrue();
    }

    /** 이미 연결된 첨부를 다시 보내면 표시 순서만 바뀌는지 검증한다. */
    @Test
    void reordersAlreadyLinkedAttachment() {
        Attachment first = attachment(10L, author);
        Attachment second = attachment(11L, author);
        first.attachTo(notice, 1);
        second.attachTo(notice, 2);
        when(attachmentRepository
                .findAllByPost_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(POST_ID))
                .thenReturn(List.of(first, second));
        stubRequested(List.of(first, second));

        service.replaceLinks(notice, List.of(11L, 10L), author, NOW);

        assertThat(second.getDisplayOrder()).isEqualTo(1);
        assertThat(first.getDisplayOrder()).isEqualTo(2);
        assertThat(first.isDeleted()).isFalse();
    }

    /** 같은 첨부를 중복해서 보내면 거부하는지 검증한다. */
    @Test
    void rejectsDuplicatedAttachmentId() {
        assertThatThrownBy(() -> service.replaceLinks(notice, List.of(10L, 10L), author, NOW))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_DUPLICATED);
    }

    /** 존재하지 않거나 이미 삭제된 첨부를 보내면 거부하는지 검증한다. */
    @Test
    void rejectsMissingAttachment() {
        stubRequested(List.of());

        assertThatThrownBy(() -> service.replaceLinks(notice, List.of(10L), author, NOW))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_NOT_FOUND);
    }

    /** 다른 사람이 올린 첨부는 연결할 수 없는지 검증한다. */
    @Test
    void rejectsAttachmentUploadedByOtherUser() {
        Attachment other = attachment(10L, user(2L));
        stubRequested(List.of(other));

        assertThatThrownBy(() -> service.replaceLinks(notice, List.of(10L), author, NOW))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ACCESS_DENIED);
    }

    /** 다른 공지에 이미 연결된 첨부는 재사용할 수 없는지 검증한다. */
    @Test
    void rejectsAttachmentLinkedToAnotherPost() {
        Post otherNotice = notice(author);
        ReflectionTestUtils.setField(otherNotice, "id", POST_ID + 1);
        Attachment attached = attachment(10L, author);
        attached.attachTo(otherNotice, 1);
        stubRequested(List.of(attached));

        assertThatThrownBy(() -> service.replaceLinks(notice, List.of(10L), author, NOW))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_ALREADY_ATTACHED);
    }

    /** 커뮤니티용으로 올린 첨부를 공지에 붙이려 하면 용도 불일치로 거부하는지 검증한다. */
    @Test
    void rejectsAttachmentWithMismatchedType() {
        Attachment community = attachment(10L, author, AttachmentType.COMMUNITY);
        stubRequested(List.of(community));

        assertThatThrownBy(() -> service.replaceLinks(notice, List.of(10L), author, NOW))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_TYPE_MISMATCH);
        assertThat(community.isAttached()).isFalse();
    }

    /** 커버 이미지 첨부는 어떤 게시글에도 붙일 수 없는지 검증한다. */
    @Test
    void rejectsMeetingCoverAttachment() {
        stubRequested(List.of(attachment(10L, author, AttachmentType.MEETING_COVER)));

        assertThatThrownBy(() -> service.replaceLinks(notice, List.of(10L), author, NOW))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_TYPE_MISMATCH);
    }

    /** 한 게시글에 붙일 수 있는 개수를 넘기면 조회하기 전에 거부하는지 검증한다. */
    @Test
    void rejectsMoreAttachmentsThanLimit() {
        List<Long> tooMany = java.util.stream.LongStream
                .rangeClosed(1, AttachmentLinkService.MAX_ATTACHMENT_COUNT + 1)
                .boxed()
                .toList();

        assertThatThrownBy(() -> service.replaceLinks(notice, tooMany, author, NOW))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.ATTACHMENT_TOO_MANY);
    }

    /** 요청한 첨부파일을 저장소가 반환하도록 대역을 설정한다. */
    private void stubRequested(List<Attachment> attachments) {
        when(attachmentRepository.findAllByIdInAndDeletedAtIsNull(anyCollection()))
                .thenReturn(attachments);
    }

    /** 식별자와 업로더를 가진 공지용 테스트 첨부파일을 만든다. */
    private Attachment attachment(Long id, User uploader) {
        return attachment(id, uploader, AttachmentType.NOTICE);
    }

    /** 식별자·업로더·용도를 지정한 테스트용 첨부파일을 만든다. */
    private Attachment attachment(Long id, User uploader, AttachmentType attachmentType) {
        Attachment attachment = Attachment.createUploaded(
                uploader, attachmentType, "cover.png",
                "2026/08/02/" + id + ".png", 1024L, "image/png");
        ReflectionTestUtils.setField(attachment, "id", id);
        return attachment;
    }

    /** 식별자를 가진 테스트용 팬미팅 공지를 만든다. */
    private Post notice(User author) {
        FanMeeting meeting = mock(FanMeeting.class);
        Post post = Post.createNotice(
                author, meeting, PostType.MEETING_NOTICE, "공지 제목", "공지 본문");
        ReflectionTestUtils.setField(post, "id", POST_ID);
        return post;
    }

    /** 식별자를 가진 테스트용 사용자를 만든다. */
    private User user(Long id) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        return user;
    }
}
