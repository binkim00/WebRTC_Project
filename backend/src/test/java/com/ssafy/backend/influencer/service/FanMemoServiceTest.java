package com.ssafy.backend.influencer.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.influencer.domain.FanMemo;
import com.ssafy.backend.influencer.dto.FanMemoCreateRequest;
import com.ssafy.backend.influencer.dto.FanMemoResponse;
import com.ssafy.backend.influencer.dto.FanMemoUpdateRequest;
import com.ssafy.backend.influencer.repository.FanMemoRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class FanMemoServiceTest {

    private static final Long INFLUENCER_ID = 10L;
    private static final Long MEMO_ID = 1L;
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 30, 12, 0);

    private FanMemoRepository fanMemoRepository;
    private MeetingAccessService meetingAccessService;
    private CurrentUserService currentUserService;
    private FanMemoService service;
    private AuthenticatedUser principal;
    private User loginInfluencer;

    @BeforeEach
    void setUp() {
        fanMemoRepository = mock(FanMemoRepository.class);
        meetingAccessService = mock(MeetingAccessService.class);
        currentUserService = mock(CurrentUserService.class);
        Clock clock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        service = new FanMemoService(
                fanMemoRepository,
                mock(UserRepository.class),
                meetingAccessService,
                currentUserService,
                clock
        );
        principal = new AuthenticatedUser(INFLUENCER_ID, UserRole.INFLUENCER);

        loginInfluencer = mock(User.class);
        when(loginInfluencer.getId()).thenReturn(INFLUENCER_ID);
        when(currentUserService.requireActiveUser(principal)).thenReturn(loginInfluencer);
    }

    /**
     * 다른 인플루언서가 주최한 회차 ID로 메모를 작성하려는 요청이 거부되는지 검증한다.
     * 회차 소유권 검증이 중복 검사보다 먼저 실행되어야 하므로 저장소 조회도 일어나지 않는다.
     */
    @Test
    void rejectsMemoOnOtherInfluencersMeeting() {
        when(meetingAccessService.requireInfluencer(100L, loginInfluencer))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> service.createMemo(
                7L, new FanMemoCreateRequest(100L, "내용"), principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));

        verifyNoInteractions(fanMemoRepository);
    }

    /** 작성자 본인의 수정 요청이 메모 내용에 반영되는지 검증한다. */
    @Test
    void updatesContentByAuthor() {
        FanMemo memo = memoOwnedBy(INFLUENCER_ID, null);
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        FanMemoResponse response = service.updateMemo(MEMO_ID, new FanMemoUpdateRequest("수정된 메모"), principal);

        assertThat(memo.getContent()).isEqualTo("수정된 메모");
        assertThat(response.content()).isEqualTo("수정된 메모");
    }

    /** 작성자 본인의 삭제 요청이 주입된 시계 기준으로 소프트 삭제되는지 검증한다. */
    @Test
    void softDeletesByAuthor() {
        FanMemo memo = memoOwnedBy(INFLUENCER_ID, null);
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        service.deleteMemo(MEMO_ID, principal);

        assertThat(memo.getDeletedAt()).isEqualTo(NOW);
    }

    /** 존재하지 않는 메모 수정 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMissingMemo() {
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateMemo(MEMO_ID, new FanMemoUpdateRequest("내용"), principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FAN_MEMO_NOT_FOUND));
    }

    /** 이미 소프트 삭제된 메모의 재삭제 요청이 거부되는지 검증한다. */
    @Test
    void rejectsAlreadyDeletedMemo() {
        FanMemo memo = memoOwnedBy(INFLUENCER_ID, NOW.minusDays(1));
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        assertThatThrownBy(() -> service.deleteMemo(MEMO_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEMO_ALREADY_DELETED));
    }

    /** 작성자가 아닌 인플루언서의 수정 요청이 거부되는지 검증한다. */
    @Test
    void rejectsNonAuthor() {
        FanMemo memo = memoOwnedBy(999L, null);
        when(fanMemoRepository.findWithMeetingById(MEMO_ID)).thenReturn(Optional.of(memo));

        assertThatThrownBy(() -> service.updateMemo(MEMO_ID, new FanMemoUpdateRequest("내용"), principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEMO_ACCESS_DENIED));
    }

    /**
     * 지정한 작성자와 삭제 시각을 가진 메모를 만든다.
     *
     * @param authorId 작성자인 인플루언서의 ID
     * @param deletedAt 소프트 삭제 시각이며 null이면 삭제되지 않은 상태
     * @return 검증에 사용할 팬 메모
     */
    private FanMemo memoOwnedBy(Long authorId, LocalDateTime deletedAt) {
        User author = mock(User.class);
        when(author.getId()).thenReturn(authorId);
        FanMeeting meeting = mock(FanMeeting.class);
        when(meeting.getId()).thenReturn(100L);
        FanMemo memo = FanMemo.create(author, mock(User.class), meeting, "원본 메모");
        if (deletedAt != null) {
            memo.delete(deletedAt);
        }
        return memo;
    }
}
