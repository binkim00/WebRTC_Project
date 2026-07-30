package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.organization.domain.OrganizationMemberStatus;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostComment;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.CommentCreateRequest;
import com.ssafy.backend.post.dto.CommentCreateResponse;
import com.ssafy.backend.post.dto.CommentSummaryResponse;
import com.ssafy.backend.post.repository.PostCommentRepository;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 커뮤니티 게시글 댓글의 목록 조회와 작성을 처리한다. */
@Service
public class CommentService {

    /** 목록 조회가 허용하는 최대 페이지 크기이며 공지 목록과 기준을 맞춘다. */
    static final int MAX_PAGE_SIZE = 100;

    /** 댓글은 대화 흐름을 그대로 읽을 수 있도록 작성순으로 정렬한다. */
    private static final Sort COMMENT_SORT = Sort.by(
            Sort.Order.asc("createdAt"),
            Sort.Order.asc("id")
    );

    private final CurrentUserService currentUserService;
    private final OrganizationMemberRepository organizationMemberRepository;
    private final ParticipantRepository participantRepository;
    private final PostRepository postRepository;
    private final PostCommentRepository postCommentRepository;

    /**
     * 댓글 조회·작성에 필요한 사용자 서비스와 조직·참가자·게시글·댓글 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param organizationMemberRepository 조직 구성원 저장소
     * @param participantRepository 참가자 저장소
     * @param postRepository 게시글 저장소
     * @param postCommentRepository 댓글 저장소
     */
    public CommentService(CurrentUserService currentUserService,
                          OrganizationMemberRepository organizationMemberRepository,
                          ParticipantRepository participantRepository,
                          PostRepository postRepository,
                          PostCommentRepository postCommentRepository) {
        this.currentUserService = currentUserService;
        this.organizationMemberRepository = organizationMemberRepository;
        this.participantRepository = participantRepository;
        this.postRepository = postRepository;
        this.postCommentRepository = postCommentRepository;
    }

    /**
     * 커뮤니티 게시글의 노출 가능한 댓글을 작성순으로 페이지 조회한다(COMMENT-001).
     *
     * <p>삭제되거나 운영자가 숨긴 댓글은 목록에서 제외하며 비로그인 조회도 허용한다.
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param page 페이지 번호
     * @param size 페이지 크기
     * @param principal 선택적 로그인 사용자 정보
     * @return 댓글 목록 페이지
     * @throws BusinessException 페이지 값이 허용 범위를 벗어났거나 게시글이 없거나 커뮤니티 게시글이 아닌 경우
     */
    @Transactional(readOnly = true)
    public PageResponse<CommentSummaryResponse> getComments(Long postId, int page, int size,
                                                           AuthenticatedUser principal) {
        validatePage(page, size);
        Post post = requireCommunityPost(postId);
        User viewer = principal == null ? null : currentUserService.requireActiveUser(principal);
        // 운영자 여부는 게시글 하나에 대해 한 번만 확인하고 모든 댓글에 재사용한다.
        boolean operator = viewer != null && isMeetingOperator(post.getMeeting(), viewer);

        Page<CommentSummaryResponse> result = postCommentRepository
                .findVisibleByPost(postId, PageRequest.of(page, size, COMMENT_SORT))
                .map(comment -> toSummary(comment, viewer, operator));
        return PageResponse.from(result);
    }

    /**
     * 해당 팬미팅의 확정 참가자나 운영자가 커뮤니티 게시글에 댓글을 작성한다(COMMENT-002).
     *
     * <p>대댓글은 MVP 범위에서 제외되어 상위 댓글 없이 저장한다.
     *
     * @param postId 커뮤니티 게시글 식별자
     * @param request 댓글 본문을 담은 작성 요청
     * @param principal 로그인 사용자 정보
     * @return 생성된 댓글 정보
     * @throws BusinessException 게시글이 없거나 커뮤니티 게시글이 아니거나 댓글 작성 자격이 없는 경우
     */
    @Transactional
    public CommentCreateResponse createComment(Long postId, CommentCreateRequest request,
                                               AuthenticatedUser principal) {
        User author = currentUserService.requireActiveUser(principal);
        Post post = requireCommunityPost(postId);
        requireCommentWriter(post, author);

        PostComment comment = PostComment.createComment(post, author, request.content().trim());
        return CommentCreateResponse.from(postCommentRepository.save(comment));
    }

    /**
     * 요청 경로가 고정한 커뮤니티 유형이고 일반 사용자에게 노출 가능한 게시글을 조회한다.
     *
     * @param postId 게시글 식별자
     * @return 노출 가능한 커뮤니티 게시글
     * @throws BusinessException 게시글이 없거나 삭제·숨김 상태이거나 공지 게시글인 경우
     */
    private Post requireCommunityPost(Long postId) {
        Post post = postRepository.findDetailById(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.POST_NOT_FOUND));
        if (post.getType() != PostType.COMMUNITY) {
            // 공지에는 댓글을 달 수 없고 공지의 댓글 목록도 제공하지 않는다.
            throw new BusinessException(ErrorCode.POST_TYPE_MISMATCH);
        }
        if (!post.isVisibleToPublic()) {
            // 삭제되었거나 숨김 처리된 게시글은 일반 사용자에게 노출하지 않는다.
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        return post;
    }

    /**
     * 작성자가 해당 팬미팅의 확정 참가자이거나 운영자인지 검증한다.
     *
     * <p>경로 보안 규칙은 인증만 요구하므로 일반 로그인 사용자를 여기서 걸러낸다.
     * 커뮤니티 게시글에 팬미팅이 연결되지 않으면 참가 자격을 확인할 수 없어 작성을 거부한다.
     *
     * @param post 댓글을 달 커뮤니티 게시글
     * @param author 댓글 작성자
     * @throws BusinessException 확정 참가자도 해당 팬미팅 운영자도 아닌 경우
     */
    private void requireCommentWriter(Post post, User author) {
        FanMeeting meeting = post.getMeeting();
        if (meeting != null
                && participantRepository
                .findByMeeting_IdAndFan_Id(meeting.getId(), author.getId()).isPresent()) {
            return;
        }
        if (isMeetingOperator(meeting, author)) {
            return;
        }
        throw new BusinessException(ErrorCode.COMMENT_WRITE_NOT_ALLOWED);
    }

    /**
     * 사용자가 해당 팬미팅의 운영자인지 예외 없이 판정한다.
     *
     * <p>판정 기준은 {@code MeetingAccessService.requireOperator}와 같은 서비스 운영자·주최
     * 인플루언서·담당 매니저·활성 조직 구성원이다. 그 메서드는 권한이 없을 때 예외를 던지므로
     * 이 서비스의 읽기 전용 트랜잭션 안에서 호출한 뒤 예외를 삼키면 트랜잭션이 rollback-only로
     * 표시되어 커밋 시점에 {@code UnexpectedRollbackException}이 발생한다. 그래서 예외 대신
     * 같은 조건을 boolean으로 직접 평가한다.
     *
     * @param meeting 대상 팬미팅이며 연결된 팬미팅이 없으면 null
     * @param user 판정할 활성 사용자
     * @return 해당 팬미팅의 운영자이면 true
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
     * 댓글과 조회자의 수정·삭제 가능 여부를 목록 응답으로 변환한다.
     *
     * <p>수정은 작성자 본인만 가능하고 삭제는 작성자 본인과 해당 팬미팅 운영자가 가능하다.
     * 비로그인 조회는 두 값이 모두 false다.
     *
     * @param comment 작성자를 함께 조회한 댓글
     * @param viewer 조회자이며 비로그인은 null
     * @param operator 조회자가 해당 팬미팅 운영자인지 여부
     * @return 댓글 목록 응답
     */
    private CommentSummaryResponse toSummary(PostComment comment, User viewer, boolean operator) {
        boolean owner = viewer != null && viewer.getId().equals(comment.getAuthor().getId());
        return CommentSummaryResponse.of(comment, owner, owner || operator);
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
