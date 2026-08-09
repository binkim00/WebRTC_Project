package com.ssafy.backend.meeting.service;

import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.dto.FanMeetingStatisticsResponse;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.domain.ParticipantSource;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FanMeetingStatisticsServiceTest {

    private static final long MEETING_ID = 1L;
    private static final LocalDateTime CALL_STARTED_AT = LocalDateTime.of(2026, 7, 30, 20, 0);
    private static final AuthenticatedUser PRINCIPAL =
            new AuthenticatedUser(30L, UserRole.MANAGER);

    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private ApplicationRepository applicationRepository;
    private ParticipantRepository participantRepository;
    private QueueEntryRepository queueEntryRepository;
    private CallSessionRepository callSessionRepository;
    private FanMeetingStatisticsService statisticsService;
    private User operator;

    /** 각 테스트에서 사용할 통계 서비스와 모든 협력 객체를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        applicationRepository = mock(ApplicationRepository.class);
        participantRepository = mock(ParticipantRepository.class);
        queueEntryRepository = mock(QueueEntryRepository.class);
        callSessionRepository = mock(CallSessionRepository.class);
        statisticsService = new FanMeetingStatisticsService(
                currentUserService,
                meetingAccessService,
                applicationRepository,
                participantRepository,
                queueEntryRepository,
                callSessionRepository
        );
        operator = mock(User.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(operator);
    }

    /** 응모·참가·대기열·통화 원본 데이터에서 여덟 개 집계 필드를 계산하는지 검증한다. */
    @Test
    void aggregatesStatisticsFromSourceData() {
        stubOperatorMeeting(meeting());
        when(applicationRepository.countByMeeting_IdAndStatusNot(
                MEETING_ID, ApplicationStatus.WITHDRAWN)).thenReturn(42L);
        when(applicationRepository.countByMeeting_IdAndStatus(
                MEETING_ID, ApplicationStatus.SELECTED)).thenReturn(10L);
        when(participantRepository.countByMeeting_Id(MEETING_ID)).thenReturn(9L);
        when(queueEntryRepository.countByMeeting_IdAndStatus(
                MEETING_ID, QueueEntryStatus.NO_SHOW)).thenReturn(2L);
        when(callSessionRepository.countByQueueEntry_Meeting_IdAndStatus(
                MEETING_ID, CallSessionStatus.FAILED)).thenReturn(1L);
        stubEndedSessions(List.of(endedSession(100L), endedSession(151L)));

        FanMeetingStatisticsResponse response =
                statisticsService.getStatistics(MEETING_ID, PRINCIPAL);

        assertThat(response.applicationCount()).isEqualTo(42L);
        assertThat(response.selectedCount()).isEqualTo(10L);
        assertThat(response.participantCount()).isEqualTo(9L);
        assertThat(response.completedCallCount()).isEqualTo(2L);
        assertThat(response.noShowCount()).isEqualTo(2L);
        assertThat(response.failedCallCount()).isEqualTo(1L);
        assertThat(response.totalMeetingDurationSec()).isEqualTo(251L);
        assertThat(response.averageCallDurationSec()).isEqualTo(126L);
    }

    /** 응모·참가자·종료 통화가 모두 없는 팬미팅이 여덟 필드를 0으로 반환하는지 검증한다. */
    @Test
    void returnsZeroesWhenMeetingHasNoData() {
        stubOperatorMeeting(meeting());
        stubEndedSessions(List.of());

        FanMeetingStatisticsResponse response =
                statisticsService.getStatistics(MEETING_ID, PRINCIPAL);

        assertThat(response.applicationCount()).isZero();
        assertThat(response.selectedCount()).isZero();
        assertThat(response.participantCount()).isZero();
        assertThat(response.completedCallCount()).isZero();
        assertThat(response.noShowCount()).isZero();
        assertThat(response.failedCallCount()).isZero();
        assertThat(response.averageCallDurationSec()).isZero();
        assertThat(response.totalMeetingDurationSec()).isZero();
    }

    /** 시작 또는 종료 시각이 없는 종료 통화를 통화 시간 집계에서 제외하는지 검증한다. */
    @Test
    void skipsCallsWithoutTimestampsFromDurationAggregation() {
        CallSession missingEndedAt = mock(CallSession.class);
        when(missingEndedAt.getStartedAt()).thenReturn(CALL_STARTED_AT);
        when(missingEndedAt.getEndedAt()).thenReturn(null);
        stubOperatorMeeting(meeting());
        stubEndedSessions(List.of(endedSession(120L), missingEndedAt));

        FanMeetingStatisticsResponse response =
                statisticsService.getStatistics(MEETING_ID, PRINCIPAL);

        assertThat(response.completedCallCount()).isEqualTo(1L);
        assertThat(response.totalMeetingDurationSec()).isEqualTo(120L);
        assertThat(response.averageCallDurationSec()).isEqualTo(120L);
    }

    /** 참가자 운영 결과 CSV가 한글 헤더와 한글 상태값으로 만들어지는지 검증한다. */
    @Test
    void exportsParticipantResultCsvWithKoreanHeaderAndStatuses() {
        stubOperatorMeeting(meeting());
        Participant participant = participant(7L, 1, "말랑젤리", ParticipantSource.APPLICATION);
        QueueEntry entry = queueEntry(11L, participant, QueueEntryStatus.DONE);
        CallSession session = endedSession(90L);
        when(session.getQueueEntry()).thenReturn(entry);
        when(session.getStatus()).thenReturn(CallSessionStatus.ENDED);
        when(participantRepository.findAllForExport(MEETING_ID))
                .thenReturn(List.of(participant));
        when(queueEntryRepository.findByMeeting_IdOrderByQueuePositionAsc(MEETING_ID))
                .thenReturn(List.of(entry));
        when(callSessionRepository.findByQueueEntry_Meeting_Id(MEETING_ID))
                .thenReturn(List.of(session));

        String csv = statisticsService.exportParticipantResultCsv(MEETING_ID, PRINCIPAL);

        List<String> lines = csv.lines().toList();
        assertThat(lines.get(0)).isEqualTo(
                "﻿참가자 ID,참가 경로,통화 순번,닉네임,참가 상태,대기열 상태,통화 상태,통화 시간(초)");
        assertThat(lines.get(1)).isEqualTo("7,응모 선정,1,말랑젤리,참가 확정,통화 완료,통화 종료,90");
    }

    /** 대기열과 통화 기록이 없는 참가자의 상태 칸을 빈 값으로 남기는지 검증한다. */
    @Test
    void exportsEmptyStatusColumnsWhenParticipantHasNoQueueEntry() {
        stubOperatorMeeting(meeting());
        Participant participant =
                participant(8L, 2, "젤리곰", ParticipantSource.EXTERNAL_SELECTION);
        when(participantRepository.findAllForExport(MEETING_ID))
                .thenReturn(List.of(participant));
        when(queueEntryRepository.findByMeeting_IdOrderByQueuePositionAsc(MEETING_ID))
                .thenReturn(List.of());
        when(callSessionRepository.findByQueueEntry_Meeting_Id(MEETING_ID))
                .thenReturn(List.of());

        String csv = statisticsService.exportParticipantResultCsv(MEETING_ID, PRINCIPAL);

        assertThat(csv.lines().toList().get(1)).isEqualTo("8,외부 선별,2,젤리곰,참가 확정,,,");
    }

    /** 담당 운영자가 아닌 사용자의 통계 조회를 권한 오류로 거부하는지 검증한다. */
    @Test
    void rejectsStatisticsFromNonOperator() {
        when(meetingAccessService.requireOperator(MEETING_ID, operator))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> statisticsService.getStatistics(MEETING_ID, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));
    }

    /** 존재하지 않는 팬미팅의 통계 조회를 조회 실패로 거부하는지 검증한다. */
    @Test
    void rejectsStatisticsForMissingMeeting() {
        when(meetingAccessService.requireOperator(MEETING_ID, operator))
                .thenThrow(new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));

        assertThatThrownBy(() -> statisticsService.getStatistics(MEETING_ID, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 논리 삭제된 팬미팅의 통계 조회를 조회 실패로 거부하는지 검증한다. */
    @Test
    void rejectsStatisticsForDeletedMeeting() {
        FanMeeting meeting = meeting();
        meeting.deleteDraft(CALL_STARTED_AT);
        stubOperatorMeeting(meeting);

        assertThatThrownBy(() -> statisticsService.getStatistics(MEETING_ID, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 권한 검증이 주어진 팬미팅을 통과시키도록 대역을 설정한다. */
    private void stubOperatorMeeting(FanMeeting meeting) {
        when(meetingAccessService.requireOperator(MEETING_ID, operator)).thenReturn(meeting);
    }

    /** 종료 상태 영상통화 세션 조회가 주어진 목록을 반환하도록 대역을 설정한다. */
    private void stubEndedSessions(List<CallSession> sessions) {
        when(callSessionRepository.findByQueueEntry_Meeting_IdAndStatus(
                MEETING_ID, CallSessionStatus.ENDED)).thenReturn(sessions);
    }

    /**
     * 지정한 통화 시간을 가진 종료 상태 영상통화 세션 대역을 생성한다.
     *
     * @param durationSec 시작 시각과 종료 시각의 차이(초)
     * @return 시작·종료 시각이 설정된 영상통화 세션 대역
     */
    private CallSession endedSession(long durationSec) {
        CallSession session = mock(CallSession.class);
        when(session.getStartedAt()).thenReturn(CALL_STARTED_AT);
        when(session.getEndedAt()).thenReturn(CALL_STARTED_AT.plusSeconds(durationSec));
        return session;
    }

    /**
     * 내보내기 검증에 쓸 참가자 대역을 만든다.
     *
     * @param participantId 참가자 식별자
     * @param assignedOrder 배정된 통화 순번
     * @param nickname 팬 닉네임
     * @param source 참가 경로
     * @return 참가 확정 상태의 참가자 대역
     */
    private Participant participant(long participantId, int assignedOrder,
                                    String nickname, ParticipantSource source) {
        User fan = mock(User.class);
        when(fan.getNickname()).thenReturn(nickname);
        Participant participant = mock(Participant.class);
        when(participant.getId()).thenReturn(participantId);
        when(participant.getFan()).thenReturn(fan);
        when(participant.getAssignedOrder()).thenReturn(assignedOrder);
        when(participant.getParticipantSource()).thenReturn(source);
        when(participant.getStatus()).thenReturn(Participant.READY_STATUS);
        return participant;
    }

    /**
     * 내보내기 검증에 쓸 대기열 항목 대역을 만든다.
     *
     * @param entryId 대기열 항목 식별자
     * @param participant 대기열 항목의 참가자
     * @param status 대기열 상태
     * @return 참가자와 상태가 설정된 대기열 항목 대역
     */
    private QueueEntry queueEntry(long entryId, Participant participant,
                                  QueueEntryStatus status) {
        QueueEntry entry = mock(QueueEntry.class);
        when(entry.getId()).thenReturn(entryId);
        when(entry.getParticipant()).thenReturn(participant);
        when(entry.getStatus()).thenReturn(status);
        return entry;
    }

    /** 테스트용 초안 팬미팅을 생성하고 영속 식별자를 설정한다. */
    private FanMeeting meeting() {
        FanMeeting meeting = FanMeeting.create(
                null, null, mock(User.class), "팬미팅", null, null,
                CALL_STARTED_AT.plusDays(10)
        );
        ReflectionTestUtils.setField(meeting, "id", MEETING_ID);
        return meeting;
    }
}
