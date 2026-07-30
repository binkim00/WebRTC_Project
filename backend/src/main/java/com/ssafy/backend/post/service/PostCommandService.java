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
import com.ssafy.backend.post.dto.NoticeCreateRequest;
import com.ssafy.backend.post.dto.NoticeCreateResponse;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 공지 게시글 작성을 처리한다. */
@Service
public class PostCommandService {

    private final CurrentUserService currentUserService;
    private final MeetingAccessService meetingAccessService;
    private final PostRepository postRepository;

    /**
     * 공지 작성에 필요한 사용자·팬미팅 권한 서비스와 게시글 저장소를 주입받는다.
     *
     * @param currentUserService 현재 사용자 조회 서비스
     * @param meetingAccessService 팬미팅 조회·운영 권한 검증 서비스
     * @param postRepository 게시글 저장소
     */
    public PostCommandService(CurrentUserService currentUserService,
                              MeetingAccessService meetingAccessService,
                              PostRepository postRepository) {
        this.currentUserService = currentUserService;
        this.meetingAccessService = meetingAccessService;
        this.postRepository = postRepository;
    }

    /**
     * 해당 팬미팅 운영자가 작성한 팬미팅 공지를 공개 상태로 저장한다.
     *
     * <p>URL 역할 검사만으로는 다른 팬미팅의 운영자를 걸러낼 수 없으므로
     * {@link MeetingAccessService#requireOperator}로 팬미팅 단위 권한을 다시 검증한다.
     *
     * @param meetingId 공지를 등록할 팬미팅 식별자
     * @param request 제목과 본문을 담은 작성 요청
     * @param principal 로그인 사용자 정보
     * @return 생성된 공지 정보
     * @throws BusinessException 팬미팅이 없거나 삭제·취소되었거나 운영 권한이 없는 경우
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
        return NoticeCreateResponse.from(postRepository.save(notice));
    }
}
