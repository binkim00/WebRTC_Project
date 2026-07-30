package com.ssafy.backend.post.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.post.domain.Post;
import com.ssafy.backend.post.domain.PostStatus;
import com.ssafy.backend.post.domain.PostType;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
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
    private final PostRepository postRepository;

    /**
     * 공지 조회에 필요한 사용자·팬미팅 서비스와 게시글 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 조회 서비스
     * @param postRepository 게시글 저장소
     */
    public PostQueryService(CurrentUserService currentUserService,
                            MeetingAccessService meetingAccessService,
                            PostRepository postRepository) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.postRepository = postRepository;
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
        Post notice = postRepository.findDetailById(noticeId)
                .orElseThrow(() -> new BusinessException(ErrorCode.POST_NOT_FOUND));
        if (notice.getType() != expectedType) {
            throw new BusinessException(ErrorCode.POST_TYPE_MISMATCH);
        }
        if (!notice.isVisibleToPublic()) {
            // 삭제되었거나 숨김 처리된 글은 일반 사용자에게 노출하지 않는다.
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }
        return notice;
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
        return NoticeDetailResponse.of(notice, editable, editable);
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
