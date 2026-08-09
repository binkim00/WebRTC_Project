package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.CommunityPostCreateRequest;
import com.ssafy.backend.post.dto.CommunityPostCreateResponse;
import com.ssafy.backend.post.dto.NoticeCreateRequest;
import com.ssafy.backend.post.dto.NoticeCreateResponse;
import com.ssafy.backend.post.dto.PostDeleteResponse;
import com.ssafy.backend.post.dto.PostUpdateRequest;
import com.ssafy.backend.post.dto.PostUpdateResponse;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

/** 공지와 커뮤니티 게시글의 작성·수정·삭제를 처리한다. */
@Service
public class PostCommandService {

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final PostRepository postRepository;
    private final AttachmentLinkService attachmentLinkService;
    private final Clock clock;

    /**
     * 게시글 작성·수정·삭제에 필요한 사용자·팬미팅 권한 서비스와 게시글 저장소, 시계를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 조회·운영 권한 검증 서비스
     * @param postRepository 게시글 저장소
     * @param attachmentLinkService 공지 첨부파일 연결·해제 서비스
     * @param clock 논리 삭제 시각 기준 시계
     */
    public PostCommandService(CurrentUserService currentUserService,
                              MeetingAccessService meetingAccessService,
                              PostRepository postRepository,
                              AttachmentLinkService attachmentLinkService,
                              Clock clock) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.postRepository = postRepository;
        this.attachmentLinkService = attachmentLinkService;
        this.clock = clock;
    }

    /**
     * 서비스 운영자가 작성한 서비스 공지를 공개 상태로 저장한다(POST-003c).
     *
     * <p>서비스 전체에 노출되는 공지라 팬미팅 단위 운영자가 아니라 ADMIN만 작성할 수 있다.
     * 팬미팅 공지가 팬미팅 소유권을 다시 확인하는 것과 같은 기준으로, URL 역할 검사와 별개로
     * 서비스 계층에서도 역할을 한 번 더 검증한다.
     *
     * <p>서비스 공지는 대상 팬미팅이 없으므로 {@code meeting_id}는 NULL로 저장된다.
     *
     * <p>{@code attachmentIds}를 보내면 미리 업로드한 첨부파일(ATTACH-001)을 보낸 순서대로
     * 이 공지에 연결한다. 첨부 연결이 실패하면 공지 저장도 함께 롤백된다.
     *
     * @param request 제목·본문과 연결할 첨부파일 식별자를 담은 작성 요청
     * @param principal 로그인 사용자 정보
     * @return 생성된 공지 정보
     * @throws BusinessException 활성 사용자가 아니거나 ADMIN이 아니거나
     *                           첨부파일을 연결할 수 없는 경우
     */
    @Transactional
    public NoticeCreateResponse createServiceNotice(NoticeCreateRequest request,
                                                    AuthenticatedUser principal) {
        User author = requireAdmin(principal);

        Post notice = Post.createNotice(
                author, null, PostType.SERVICE_NOTICE,
                request.title().trim(), request.content().trim()
        );
        // 첨부 연결은 게시글 식별자를 사용하므로 저장 이후에 처리한다.
        Post saved = postRepository.save(notice);
        attachmentLinkService.replaceLinks(
                saved, request.attachmentIds(), author, LocalDateTime.now(clock));
        return NoticeCreateResponse.from(saved);
    }

    /**
     * 해당 팬미팅 운영자가 작성한 팬미팅 공지를 공개 상태로 저장한다.
     *
     * <p>URL 역할 검사만으로는 다른 팬미팅의 운영자를 걸러낼 수 없으므로
     * {@link MeetingAccessService#requireOperator}로 팬미팅 단위 권한을 다시 검증한다.
     *
     * <p>{@code attachmentIds}를 보내면 미리 업로드한 첨부파일(ATTACH-001)을 보낸 순서대로
     * 이 공지에 연결한다. 첨부 연결이 실패하면 공지 저장도 함께 롤백된다.
     *
     * @param meetingId 공지를 등록할 팬미팅 식별자
     * @param request 제목·본문과 연결할 첨부파일 식별자를 담은 작성 요청
     * @param principal 로그인 사용자 정보
     * @return 생성된 공지 정보
     * @throws BusinessException 팬미팅이 없거나 삭제·취소되었거나 운영 권한이 없거나
     *                           첨부파일을 연결할 수 없는 경우
     */
    @Transactional
    public NoticeCreateResponse createMeetingNotice(Long meetingId,
                                                    NoticeCreateRequest request,
                                                    AuthenticatedUser principal) {
        User author = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = meetingAccessService.requireOperator(meetingId, author);
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }
        if (meeting.getStatus() == FanMeetingStatus.CANCELED) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }

        Post notice = Post.createNotice(
                author, meeting, PostType.MEETING_NOTICE,
                request.title().trim(), request.content().trim()
        );
        // 첨부 연결은 게시글 식별자를 사용하므로 저장 이후에 처리한다.
        Post saved = postRepository.save(notice);
        attachmentLinkService.replaceLinks(
                saved, request.attachmentIds(), author, LocalDateTime.now(clock));
        return NoticeCreateResponse.from(saved);
    }

    /**
     * 해당 팬미팅 소유 운영자가 작성한 커뮤니티 게시글을 공개 상태로 저장한다(POST-003b).
     *
     * <p>게시글은 요청 경로의 팬미팅에 연결한다. 공지 작성과 같은 기준으로 팬미팅 단위
     * 운영 권한을 다시 검증하고 삭제·취소된 팬미팅에는 작성을 허용하지 않는다.
     *
     * @param meetingId 게시글을 등록할 팬미팅 식별자
     * @param request 제목과 본문을 담은 작성 요청
     * @param principal 로그인 사용자 정보
     * @return 생성된 커뮤니티 게시글 정보
     * @throws BusinessException 팬미팅이 없거나 삭제·취소되었거나 운영 권한이 없는 경우
     */
    @Transactional
    public CommunityPostCreateResponse createCommunityPost(Long meetingId,
                                                           CommunityPostCreateRequest request,
                                                           AuthenticatedUser principal) {
        User author = currentUserService.requireActiveUser(principal);
        FanMeeting meeting = requireWritableMeeting(meetingId, author);

        Post post = Post.createCommunity(
                author, meeting, request.title().trim(), request.content().trim()
        );
        return CommunityPostCreateResponse.from(postRepository.save(post));
    }

    /**
     * 작성한 서비스 운영자가 서비스 공지를 부분 수정한다(POST-004c).
     *
     * <p>수정 권한은 팬미팅 공지와 같은 기준인 작성자 본인 또는 ADMIN이며, 서비스 공지는
     * ADMIN만 작성하므로 실질적으로는 ADMIN 전용이다.
     *
     * <p>{@code attachmentIds}를 보내면 그 목록이 첨부 연결 상태 전체를 대신하므로, 목록에서
     * 빠진 기존 첨부는 해제되고 빈 목록을 보내면 모든 첨부가 해제된다. 보내지 않으면 그대로 둔다.
     *
     * @param noticeId 공지 식별자
     * @param request 수정할 제목·본문과 첨부파일 식별자를 담은 요청
     * @param principal 로그인 사용자 정보
     * @return 수정된 공지 정보
     * @throws BusinessException 공지가 없거나 서비스 공지가 아니거나 수정 권한이 없거나
     *                           첨부파일을 연결할 수 없는 경우
     */
    @Transactional
    public PostUpdateResponse updateServiceNotice(Long noticeId, PostUpdateRequest request,
                                                  AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        Post notice = requireVisiblePost(noticeId, PostType.SERVICE_NOTICE);
        requireNoticeModifier(notice, actor);

        notice.update(trimmedOrNull(request.title()), trimmedOrNull(request.content()));
        attachmentLinkService.replaceLinks(
                notice, request.attachmentIds(), actor, LocalDateTime.now(clock));
        return PostUpdateResponse.from(notice);
    }

    /**
     * 작성한 서비스 운영자가 서비스 공지를 삭제한다(POST-005c).
     *
     * <p>실제 행을 지우지 않는다. 작성자 본인이 삭제하면 삭제 시각을 기록하고,
     * 작성자가 아닌 ADMIN이 내리면 상태만 숨김으로 바꾼다.
     *
     * @param noticeId 공지 식별자
     * @param principal 로그인 사용자 정보
     * @return 삭제 처리 결과
     * @throws BusinessException 공지가 없거나 서비스 공지가 아니거나 삭제 권한이 없는 경우
     */
    @Transactional
    public PostDeleteResponse deleteServiceNotice(Long noticeId, AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        Post notice = requireVisiblePost(noticeId, PostType.SERVICE_NOTICE);
        requireNoticeModifier(notice, actor);

        removeByActor(notice, actor);
        return PostDeleteResponse.from(notice);
    }

    /**
     * 작성한 운영자나 서비스 운영자가 팬미팅 공지를 부분 수정한다(POST-004a).
     *
     * <p>수정 권한은 공지 상세가 알려 주는 {@code canEdit}과 같은 기준인 작성자 본인 또는
     * ADMIN이다. 다른 팬미팅 경로로 들어온 공지는 존재하지 않는 것으로 취급한다.
     *
     * <p>{@code attachmentIds}를 보내면 그 목록이 첨부 연결 상태 전체를 대신하므로, 목록에서
     * 빠진 기존 첨부는 해제되고 빈 목록을 보내면 모든 첨부가 해제된다. 보내지 않으면 그대로 둔다.
     *
     * @param meetingId 공지가 속한 팬미팅 식별자
     * @param noticeId 공지 식별자
     * @param request 수정할 제목·본문과 첨부파일 식별자를 담은 요청
     * @param principal 로그인 사용자 정보
     * @return 수정된 공지 정보
     * @throws BusinessException 공지가 없거나 다른 팬미팅의 공지이거나 수정 권한이 없거나
     *                           첨부파일을 연결할 수 없는 경우
     */
    @Transactional
    public PostUpdateResponse updateMeetingNotice(Long meetingId, Long noticeId,
                                                 PostUpdateRequest request,
                                                 AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        Post notice = requireMeetingNotice(meetingId, noticeId);
        requireNoticeModifier(notice, actor);

        notice.update(trimmedOrNull(request.title()), trimmedOrNull(request.content()));
        attachmentLinkService.replaceLinks(
                notice, request.attachmentIds(), actor, LocalDateTime.now(clock));
        return PostUpdateResponse.from(notice);
    }

    /**
     * 작성한 운영자나 서비스 운영자가 팬미팅 공지를 삭제한다(POST-005a).
     *
     * <p>실제 행을 지우지 않는다. 작성자 본인이 삭제하면 삭제 시각을 기록하고,
     * 작성자가 아닌 ADMIN이 내리면 상태만 숨김으로 바꾼다.
     *
     * @param meetingId 공지가 속한 팬미팅 식별자
     * @param noticeId 공지 식별자
     * @param principal 로그인 사용자 정보
     * @return 삭제 처리 결과
     * @throws BusinessException 공지가 없거나 다른 팬미팅의 공지이거나 삭제 권한이 없는 경우
     */
    @Transactional
    public PostDeleteResponse deleteMeetingNotice(Long meetingId, Long noticeId,
                                                  AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        Post notice = requireMeetingNotice(meetingId, noticeId);
        requireNoticeModifier(notice, actor);

        removeByActor(notice, actor);
        return PostDeleteResponse.from(notice);
    }

    /**
     * 작성자가 자신의 커뮤니티 게시글을 부분 수정한다(POST-004b).
     *
     * <p>운영자라도 다른 사람의 글 내용은 바꿀 수 없으므로 작성자 본인만 허용한다.
     * 첨부파일은 MVP에서 공지에만 허용하므로 {@code attachmentIds}를 보내면 거부한다.
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param request 수정할 제목·본문을 담은 요청
     * @param principal 로그인 사용자 정보
     * @return 수정된 게시글 정보
     * @throws BusinessException 게시글이 없거나 커뮤니티 게시글이 아니거나 작성자가 아니거나
     *                           첨부파일 연결을 요청한 경우
     */
    @Transactional
    public PostUpdateResponse updateCommunityPost(Long postId, PostUpdateRequest request,
                                                  AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        if (request.attachmentIds() != null) {
            throw new BusinessException(ErrorCode.POST_ATTACHMENT_NOT_ALLOWED);
        }
        Post post = requireVisiblePost(postId, PostType.COMMUNITY);
        if (!isAuthor(post, actor)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }

        post.update(trimmedOrNull(request.title()), trimmedOrNull(request.content()));
        return PostUpdateResponse.from(post);
    }

    /**
     * 작성자나 해당 팬미팅 소유 운영자가 커뮤니티 게시글을 삭제한다(POST-005b).
     *
     * <p>실제 행을 지우지 않는다. 작성자 본인이 삭제하면 삭제 시각을 기록하고,
     * 작성자가 아닌 소유 운영자가 내리면 상태만 숨김으로 바꾼다.
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param principal 로그인 사용자 정보
     * @return 삭제 처리 결과
     * @throws BusinessException 게시글이 없거나 커뮤니티 게시글이 아니거나 삭제 권한이 없는 경우
     */
    @Transactional
    public PostDeleteResponse deleteCommunityPost(Long postId, AuthenticatedUser principal) {
        User actor = currentUserService.requireActiveUser(principal);
        Post post = requireVisiblePost(postId, PostType.COMMUNITY);
        if (!isAuthor(post, actor)) {
            // 작성자가 아니면 해당 팬미팅의 소유 운영자만 글을 내릴 수 있다.
            // 쓰기 트랜잭션이므로 권한이 없을 때 예외를 던지는 검증을 그대로 사용한다.
            Long meetingId = post.getMeeting() == null ? null : post.getMeeting().getId();
            if (meetingId == null) {
                throw new BusinessException(ErrorCode.ACCESS_DENIED);
            }
            meetingAccessService.requireOperator(meetingId, actor);
        }

        removeByActor(post, actor);
        return PostDeleteResponse.from(post);
    }

    /**
     * 게시글을 작성할 수 있는 팬미팅인지 확인하고 운영 권한을 검증한다.
     *
     * @param meetingId 대상 팬미팅 식별자
     * @param author 작성자
     * @return 작성이 허용된 팬미팅
     * @throws BusinessException 팬미팅이 없거나 삭제·취소되었거나 운영 권한이 없는 경우
     */
    private FanMeeting requireWritableMeeting(Long meetingId, User author) {
        FanMeeting meeting = meetingAccessService.requireOperator(meetingId, author);
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }
        if (meeting.getStatus() == FanMeetingStatus.CANCELED) {
            throw new BusinessException(ErrorCode.FAN_MEETING_STATE_CONFLICT);
        }
        return meeting;
    }

    /**
     * 요청 경로의 팬미팅에 속한 노출 가능한 공지를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param noticeId 공지 식별자
     * @return 노출 가능한 팬미팅 공지
     * @throws BusinessException 공지가 없거나 삭제·숨김 상태이거나 다른 팬미팅의 공지인 경우
     */
    private Post requireMeetingNotice(Long meetingId, Long noticeId) {
        Post notice = requireVisiblePost(noticeId, PostType.MEETING_NOTICE);
        if (notice.getMeeting() == null || !meetingId.equals(notice.getMeeting().getId())) {
            // 다른 팬미팅의 공지는 이 경로에 존재하지 않는 것으로 취급한다.
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        return notice;
    }

    /**
     * 요청 경로가 고정한 유형과 일치하고 노출 가능한 게시글을 조회한다.
     *
     * <p>삭제·숨김 게시글은 존재하지 않는 것으로 취급하므로 이미 삭제한 글을 다시
     * 수정·삭제하면 조회 API와 같은 {@code POST_NOT_FOUND}가 반환된다.
     *
     * @param postId 게시글 식별자
     * @param expectedType 요청 경로가 고정한 게시글 유형
     * @return 노출 가능한 게시글
     * @throws BusinessException 게시글이 없거나 삭제·숨김 상태이거나 유형이 다른 경우
     */
    private Post requireVisiblePost(Long postId, PostType expectedType) {
        Post post = postRepository.findDetailById(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.POST_NOT_FOUND));
        if (post.getType() != expectedType) {
            throw new BusinessException(ErrorCode.POST_TYPE_MISMATCH);
        }
        if (!post.isVisibleToPublic()) {
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        return post;
    }

    /**
     * 서비스 공지를 작성할 수 있는 서비스 운영자인지 검증한다.
     *
     * <p>서비스 공지는 팬미팅에 속하지 않아 {@link MeetingAccessService}로 소유권을 확인할 수
     * 없으므로 역할만으로 판정한다.
     *
     * @param principal 로그인 사용자 정보
     * @return 검증을 통과한 ADMIN 사용자
     * @throws BusinessException 활성 사용자가 아니거나 ADMIN이 아닌 경우
     */
    private User requireAdmin(AuthenticatedUser principal) {
        User user = currentUserService.requireActiveUser(principal);
        if (user.getRole() != UserRole.ADMIN) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED);
        }
        return user;
    }

    /**
     * 공지를 수정·삭제할 수 있는 사용자인지 검증한다.
     *
     * <p>공지 상세가 반환하는 {@code canEdit}·{@code canDelete}와 같은 기준을 사용해
     * 응답 계약과 실제 권한이 어긋나지 않도록 한다.
     *
     * @param notice 대상 공지
     * @param actor 요청 사용자
     * @throws BusinessException 작성자도 ADMIN도 아닌 경우
     */
    private void requireNoticeModifier(Post notice, User actor) {
        if (actor.getRole() == UserRole.ADMIN || isAuthor(notice, actor)) {
            return;
        }
        throw new BusinessException(ErrorCode.ACCESS_DENIED);
    }

    /**
     * 요청 사용자가 게시글 작성자인지 확인한다.
     *
     * @param post 대상 게시글
     * @param actor 요청 사용자
     * @return 작성자 본인이면 true
     */
    private boolean isAuthor(Post post, User actor) {
        return post.getAuthor().getId().equals(actor.getId());
    }

    /**
     * 요청 사용자의 지위에 따라 게시글을 논리 삭제하거나 숨김 처리한다.
     *
     * @param post 대상 게시글
     * @param actor 요청 사용자
     */
    private void removeByActor(Post post, User actor) {
        if (isAuthor(post, actor)) {
            post.softDelete(LocalDateTime.now(clock));
            return;
        }
        post.hide();
    }

    /**
     * 값이 있으면 앞뒤 공백을 제거하고 없으면 null을 유지한다.
     *
     * <p>PATCH 요청에서 보내지 않은 항목은 null로 남겨 기존 값을 유지하도록 한다.
     *
     * @param value 요청으로 받은 값이며 없으면 null
     * @return 공백을 제거한 값이며 입력이 null이면 null
     */
    private String trimmedOrNull(String value) {
        return value == null ? null : value.trim();
    }
}
