package com.ssafy.backend.ai.service;

import com.ssafy.backend.ai.domain.AiCallSummary;
import com.ssafy.backend.ai.domain.AiCallSummaryStatus;
import com.ssafy.backend.ai.dto.AiCallSummaryResponse;
import com.ssafy.backend.ai.repository.AiCallSummaryRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiCallSummaryServiceTest {

    private static final Long CALL_SESSION_ID = 1L;
    private static final Long MEETING_ID = 100L;
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 31, 12, 0);

    private AiCallSummaryRepository aiCallSummaryRepository;
    private CallSessionRepository callSessionRepository;
    private MeetingAccessService meetingAccessService;
    private AiCallSummaryService service;
    private AuthenticatedUser principal;
    private User operator;
    private CallSession callSession;

    @BeforeEach
    void setUp() {
        aiCallSummaryRepository = mock(AiCallSummaryRepository.class);
        callSessionRepository = mock(CallSessionRepository.class);
        meetingAccessService = mock(MeetingAccessService.class);
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        Clock clock = Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());
        service = new AiCallSummaryService(
                aiCallSummaryRepository, callSessionRepository,
                currentUserService, meetingAccessService, clock
        );

        principal = new AuthenticatedUser(10L, UserRole.INFLUENCER);
        operator = mock(User.class);
        when(currentUserService.requireActiveUser(principal)).thenReturn(operator);

        FanMeeting meeting = mock(FanMeeting.class);
        when(meeting.getId()).thenReturn(MEETING_ID);
        QueueEntry queueEntry = mock(QueueEntry.class);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        callSession = mock(CallSession.class);
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getId()).thenReturn(CALL_SESSION_ID);
        when(callSessionRepository.findAccessContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
    }

    /** 생성이 끝난 요약이 본문과 함께 반환되는지 검증한다. */
    @Test
    void returnsCompletedSummary() {
        AiCallSummary summary = summary(AiCallSummaryStatus.COMPLETED, NOW.minusMinutes(1));
        ReflectionTestUtils.setField(summary, "summary", "요약 본문");
        ReflectionTestUtils.setField(summary, "keywords", "[\"키워드\"]");
        when(aiCallSummaryRepository.findByCallSession_Id(CALL_SESSION_ID))
                .thenReturn(Optional.of(summary));

        Optional<AiCallSummaryResponse> response = service.getSummary(CALL_SESSION_ID, principal);

        assertThat(response).isPresent();
        assertThat(response.get().summary()).isEqualTo("요약 본문");
        assertThat(response.get().keywords()).isEqualTo("[\"키워드\"]");
        assertThat(response.get().callSessionId()).isEqualTo(CALL_SESSION_ID);
    }

    /** 생성 중인 요약이 본문 없이 진행 상태로 처리되는지 검증한다. */
    @Test
    void returnsEmptyWhileGenerating() {
        when(aiCallSummaryRepository.findByCallSession_Id(CALL_SESSION_ID))
                .thenReturn(Optional.of(summary(AiCallSummaryStatus.GENERATING, NOW.minusMinutes(1))));

        assertThat(service.getSummary(CALL_SESSION_ID, principal)).isEmpty();
    }

    /** 통화가 막 끝나 요약 행이 아직 없는 경우도 진행 중으로 처리되는지 검증한다. */
    @Test
    void returnsEmptyWhenAgentHasNotStartedYet() {
        when(callSession.getEndedAt()).thenReturn(NOW.minusMinutes(1));
        when(aiCallSummaryRepository.findByCallSession_Id(CALL_SESSION_ID))
                .thenReturn(Optional.empty());

        assertThat(service.getSummary(CALL_SESSION_ID, principal)).isEmpty();
    }

    /** 통화가 아직 끝나지 않았으면 진행 중으로 처리되는지 검증한다. */
    @Test
    void returnsEmptyWhileCallStillRunning() {
        when(callSession.getEndedAt()).thenReturn(null);
        when(aiCallSummaryRepository.findByCallSession_Id(CALL_SESSION_ID))
                .thenReturn(Optional.empty());

        assertThat(service.getSummary(CALL_SESSION_ID, principal)).isEmpty();
    }

    /** 생성에 실패한 요약이 조회 불가로 처리되는지 검증한다. */
    @Test
    void rejectsFailedSummary() {
        when(aiCallSummaryRepository.findByCallSession_Id(CALL_SESSION_ID))
                .thenReturn(Optional.of(summary(AiCallSummaryStatus.FAILED, NOW.minusMinutes(1))));

        assertThatThrownBy(() -> service.getSummary(CALL_SESSION_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.AI_CALL_SUMMARY_NOT_FOUND));
    }

    /** 생성 중 상태로 오래 방치된 요약이 실패로 처리되는지 검증한다. */
    @Test
    void rejectsStaleGeneratingSummary() {
        when(aiCallSummaryRepository.findByCallSession_Id(CALL_SESSION_ID))
                .thenReturn(Optional.of(summary(AiCallSummaryStatus.GENERATING, NOW.minusHours(1))));

        assertThatThrownBy(() -> service.getSummary(CALL_SESSION_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.AI_CALL_SUMMARY_NOT_FOUND));
    }

    /** 통화 종료 후 오래되도록 요약이 시작되지 않으면 실패로 처리되는지 검증한다. */
    @Test
    void rejectsWhenAgentNeverStarted() {
        when(callSession.getEndedAt()).thenReturn(NOW.minusHours(1));
        when(aiCallSummaryRepository.findByCallSession_Id(CALL_SESSION_ID))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getSummary(CALL_SESSION_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.AI_CALL_SUMMARY_NOT_FOUND));
    }

    /** 존재하지 않는 통화 세션 조회가 거부되는지 검증한다. */
    @Test
    void rejectsUnknownCallSession() {
        when(callSessionRepository.findAccessContextById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getSummary(999L, principal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.CALL_SESSION_NOT_FOUND));
    }

    /** 해당 팬미팅 운영자가 아닌 사용자의 조회가 거부되는지 검증한다. */
    @Test
    void rejectsNonOperator() {
        doThrow(new BusinessException(ErrorCode.ACCESS_DENIED))
                .when(meetingAccessService).requireOperator(eq(MEETING_ID), eq(operator));

        assertThatThrownBy(() -> service.getSummary(CALL_SESSION_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
    }

    /**
     * 지정한 상태와 생성 시각을 가진 요약을 만든다.
     *
     * @param status 요약 생성 상태
     * @param createdAt 생성 시작 시각
     * @return 검증에 사용할 통화 요약
     */
    private AiCallSummary summary(AiCallSummaryStatus status, LocalDateTime createdAt) {
        AiCallSummary callSummary = BeanUtils.instantiateClass(AiCallSummary.class);
        ReflectionTestUtils.setField(callSummary, "id", 7L);
        ReflectionTestUtils.setField(callSummary, "callSession", callSession);
        ReflectionTestUtils.setField(callSummary, "status", status);
        ReflectionTestUtils.setField(callSummary, "createdAt", createdAt);
        return callSummary;
    }
}
