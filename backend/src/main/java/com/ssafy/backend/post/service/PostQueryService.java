package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.CommunityPostDetailResponse;
import com.ssafy.backend.post.dto.CommunityPostSummaryResponse;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.post.repository.PostCommentRepository;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/** 서비스 공지와 팬미팅 공지의 목록·상세 조회를 처리한다. */
@Service
public class PostQueryService {

    /** 목록 조회가 허용하는 최대 페이지 크기다. */
    static final int MAX_PAGE_SIZE = 100;

    /** 검색어가 없을 때 모든 행과 일치시키기 위해 사용하는 LIKE 패턴이다. */
    private static final String MATCH_ALL_KEYWORD = "%";

    /** 공지는 상단 고정 글을 먼저 보여 주고 같은 조건에서는 최신순으로 정렬한다. */
    private static final Sort NOTICE_SORT = Sort.by(
            Sort.Order.desc("pinned"),
            Sort.Order.desc("createdAt"),
            Sort.Order.desc("id")
    );

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final OrganizationMemberRepository organizationMemberRepository;
    private final PostRepository postRepository;
    private final PostCommentRepository postCommentRepository;
    private final AttachmentRepository attachmentRepository;

    /**
     * 공지·커뮤니티 조회에 필요한 사용자·팬미팅 서비스와 조직·게시글·댓글·첨부 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 조회 서비스
     * @param organizationMemberRepository 조직 구성원 저장소이며 소유 운영자 판정에 사용한다
     * @param postRepository 게시글 저장소
     * @param postCommentRepository 댓글 저장소이며 상세의 댓글 수 집계에 사용한다
     * @param attachmentRepository 첨부파일 저장소이며 공지 상세의 첨부 목록에 사용한다
     */
    public PostQueryService(CurrentUserService currentUserService,
                            MeetingAccessService meetingAccessService,
                            OrganizationMemberRepository organizationMemberRepository,
                            PostRepository postRepository,
                            PostCommentRepository postCommentRepository,
                            AttachmentRepository attachmentRepository) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.organizationMemberRepository = organizationMemberRepository;
        this.postRepository = postRepository;
        this.postCommentRepository = postCommentRepository;
        this.attachmentRepository = attachmentRepository;
    }

    /**
     * 공개된 서비스 공지를 검색 조건과 함께 페이지 조회한다.
     *
     * @param keyword 제목·본문 검색어이며 없으면 전체 조회
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @return 서비스 공지 목록 페이지
     * @throws BusinessException 페이지 번호나 크기가 허용 범위를 벗어난 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<NoticeSummaryResponse> getServiceNotices(String keyword, int page, int size) {
        validatePage(page, size);
        Page<NoticeSummaryResponse> result = postRepository.findVisibleServiceNotices(
                PostType.SERVICE_NOTICE,
                PostStatus.PUBLISHED,
                keywordPattern(keyword),
                PageRequest.of(page, size, NOTICE_SORT)
        ).map(NoticeSummaryResponse::from);
        return PageResponse.from(result);
    }

    /**
     * 특정 팬미팅의 공개된 공지를 검색 조건과 함께 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param keyword 제목·본문 검색어이며 없으면 전체 조회
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @return 해당 팬미팅의 공지 목록 페이지
     * @throws BusinessException 팬미팅이 없거나 페이지 값이 허용 범위를 벗어난 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<NoticeSummaryResponse> getMeetingNotices(Long meetingId, String keyword,
                                                                 int page, int size) {
        validatePage(page, size);
        requireActiveMeeting(meetingId);
        Page<NoticeSummaryResponse> result = postRepository.findVisibleMeetingNotices(
                PostType.MEETING_NOTICE,
                meetingId,
                PostStatus.PUBLISHED,
                keywordPattern(keyword),
                PageRequest.of(page, size, NOTICE_SORT)
        ).map(NoticeSummaryResponse::from);
        return PageResponse.from(result);
    }

    /**
     * 서비스 공지 한 건의 상세를 조회한다.
     *
     * @param noticeId 공지 식별자
     * @param principal 선택적 로그인 사용자 정보
     * @return 서비스 공지 상세
     * @throws BusinessException 공지가 없거나 노출할 수 없거나 유형이 경로와 다른 경우
     */
    @Transactional(readOnly = true)
    public NoticeDetailResponse getServiceNotice(Long noticeId, AuthenticatedUser principal) {
        Post notice = requireNotice(noticeId, PostType.SERVICE_NOTICE);
        return toDetail(notice, principal);
    }

    /**
     * 특정 팬미팅의 공지 한 건의 상세를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param noticeId 공지 식별자
     * @param principal 선택적 로그인 사용자 정보
     * @return 팬미팅 공지 상세
     * @throws BusinessException 팬미팅·공지가 없거나 다른 팬미팅의 공지이거나 유형이 경로와 다른 경우
     */
    @Transactional(readOnly = true)
    public NoticeDetailResponse getMeetingNotice(Long meetingId, Long noticeId,
                                                 AuthenticatedUser principal) {
        requireActiveMeeting(meetingId);
        Post notice = requireNotice(noticeId, PostType.MEETING_NOTICE);
        if (!meetingId.equals(notice.getMeeting().getId())) {
            // 다른 팬미팅의 공지는 이 경로에 존재하지 않는 것으로 취급한다.
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        return toDetail(notice, principal);
    }

    /**
     * 특정 팬미팅의 공개된 커뮤니티 게시글을 검색 조건과 함께 페이지 조회한다(POST-001c).
     *
     * <p>정렬은 공지와 같은 기준으로 상단 고정 글을 먼저 보여 주고 최신순으로 이어진다.
     * 삭제되거나 숨겨진 게시글은 목록에 노출하지 않는다.
     *
     * @param meetingId 팬미팅 식별자
     * @param keyword 제목·본문 검색어이며 없으면 전체 조회
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @return 해당 팬미팅의 커뮤니티 게시글 목록 페이지
     * @throws BusinessException 팬미팅이 없거나 페이지 값이 허용 범위를 벗어난 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<CommunityPostSummaryResponse> getCommunityPosts(Long meetingId, String keyword,
                                                                       int page, int size) {
        validatePage(page, size);
        requireActiveMeeting(meetingId);
        Page<CommunityPostSummaryResponse> result = postRepository.findVisibleCommunityPosts(
                meetingId,
                PostStatus.PUBLISHED,
                keywordPattern(keyword),
                PageRequest.of(page, size, NOTICE_SORT)
        ).map(CommunityPostSummaryResponse::from);
        return PageResponse.from(result);
    }

    /**
     * 커뮤니티 게시글 한 건의 상세를 조회한다(POST-002c).
     *
     * <p>수정은 작성자 본인만, 삭제는 작성자 본인과 해당 팬미팅 소유 운영자가 할 수 있으므로
     * 두 가능 여부를 따로 계산한다. 비로그인 조회는 두 값이 모두 false다.
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param principal 선택적 로그인 사용자 정보
     * @return 커뮤니티 게시글 상세
     * @throws BusinessException 게시글이 없거나 삭제·숨김 상태이거나 커뮤니티 게시글이 아닌 경우
     */
    @Transactional(readOnly = true)
    public CommunityPostDetailResponse getCommunityPost(Long postId, AuthenticatedUser principal) {
        Post post = requireVisiblePost(postId, PostType.COMMUNITY);
        User viewer = principal == null ? null : currentUserService.requireActiveUser(principal);
        boolean owner = viewer != null && viewer.getId().equals(post.getAuthor().getId());
        boolean operator = viewer != null && isMeetingOperator(post.getMeeting(), viewer);
        long commentCount = postCommentRepository.countVisibleByPost(postId);
        return CommunityPostDetailResponse.of(post, commentCount, owner, owner || operator);
    }

    /**
     * 사용자가 해당 팬미팅의 소유 운영자인지 예외 없이 판정한다.
     *
     * <p>판정 기준은 {@code MeetingAccessService.requireOperator}와 같은 서비스 운영자·주최
     * 인플루언서·담당 매니저·활성 조직 구성원이다. 그 메서드는 권한이 없을 때 예외를 던지므로
     * 읽기 전용 트랜잭션 안에서 호출한 뒤 예외를 삼키면 트랜잭션이 rollback-only로 표시되어
     * 커밋 시점에 {@code UnexpectedRollbackException}이 발생한다. 그래서 예외 대신 같은
     * 조건을 boolean으로 직접 평가한다.
     *
     * @param meeting 대상 팬미팅이며 연결된 팬미팅이 없으면 null
     * @param user 판정할 활성 사용자
     * @return 해당 팬미팅의 소유 운영자이면 true
     */
    private boolean isMeetingOperator(FanMeeting meeting, User user) {
        if (meeting == null) {
            return false;
        }
        if (user.getRole() == UserRole.ADMIN
                || sameUser(meeting.getInfluencer(), user)
                || sameUser(meeting.getManager(), user)) {
            return true;
        }
        return meeting.getOrganization() != null
                && organizationMemberRepository.existsByOrganization_IdAndUser_IdAndStatus(
                meeting.getOrganization().getId(), user.getId(), OrganizationMemberStatus.ACTIVE);
    }

    /**
     * 두 사용자의 영속 식별자가 같은지 확인한다.
     *
     * @param left 비교 대상이며 없으면 null
     * @param right 비교할 활성 사용자
     * @return 같은 사용자이면 true
     */
    private boolean sameUser(User left, User right) {
        return left != null && left.getId().equals(right.getId());
    }

    /**
     * 삭제되지 않은 팬미팅을 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 삭제되지 않은 팬미팅
     * @throws BusinessException 팬미팅이 없거나 이미 삭제된 경우
     */
    private FanMeeting requireActiveMeeting(Long meetingId) {
        FanMeeting meeting = meetingAccessService.requireMeeting(meetingId);
        if (meeting.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND);
        }
        return meeting;
    }

    /**
     * 요청 경로가 고정한 유형과 일치하고 일반 사용자에게 노출 가능한 공지를 조회한다.
     *
     * @param noticeId 공지 식별자
     * @param expectedType 요청 경로가 고정한 공지 유형
     * @return 노출 가능한 공지 게시글
     * @throws BusinessException 공지가 없거나 삭제·숨김 상태이거나 유형이 다른 경우
     */
    private Post requireNotice(Long noticeId, PostType expectedType) {
        return requireVisiblePost(noticeId, expectedType);
    }

    /**
     * 요청 경로가 고정한 유형과 일치하고 일반 사용자에게 노출 가능한 게시글을 조회한다.
     *
     * <p>공지와 커뮤니티 게시글이 같은 테이블을 쓰므로 검증 규칙을 한곳에서 처리한다.
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
            // 삭제되었거나 숨김 처리된 글은 일반 사용자에게 노출하지 않는다.
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        return post;
    }

    /**
     * 공지와 조회자의 수정·삭제 가능 여부를 상세 응답으로 변환한다.
     *
     * @param notice 노출 가능한 공지 게시글
     * @param principal 선택적 로그인 사용자 정보
     * @return 공지 상세 응답
     */
    private NoticeDetailResponse toDetail(Post notice, AuthenticatedUser principal) {
        boolean editable = canModify(notice, principal);
        return NoticeDetailResponse.of(
                notice,
                attachmentRepository
                        .findAllByPost_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(notice.getId()),
                editable,
                editable
        );
    }

    /**
     * 조회자가 공지를 수정·삭제할 수 있는지 계산한다.
     *
     * <p>공지 수정·삭제(POST-004) 권한은 작성한 운영자 또는 서비스 운영자이므로
     * 작성자 본인과 ADMIN만 true가 되며 비로그인 조회는 항상 false다.
     *
     * @param notice 대상 공지 게시글
     * @param principal 선택적 로그인 사용자 정보
     * @return 수정·삭제 가능 여부
     */
    private boolean canModify(Post notice, AuthenticatedUser principal) {
        if (principal == null) {
            return false;
        }
        User viewer = currentUserService.requireActiveUser(principal);
        return viewer.getRole() == UserRole.ADMIN
                || viewer.getId().equals(notice.getAuthor().getId());
    }

    /**
     * 검색어를 소문자 LIKE 패턴으로 변환하고 검색어가 없으면 전체 일치 패턴을 반환한다.
     *
     * @param keyword 제목·본문 검색어
     * @return LIKE 절에 사용할 패턴
     */
    private String keywordPattern(String keyword) {
        if (!StringUtils.hasText(keyword)) {
            return MATCH_ALL_KEYWORD;
        }
        return MATCH_ALL_KEYWORD + keyword.trim().toLowerCase() + MATCH_ALL_KEYWORD;
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
