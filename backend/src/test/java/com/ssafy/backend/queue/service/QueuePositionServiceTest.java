package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueuePositionChangeRequest;
import com.ssafy.backend.queue.dto.QueuePositionChangeResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.redis.QueueReorderResult;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class QueuePositionServiceTest {
    private static final Long MEETING_ID = 1L;
    private static final AuthenticatedUser PRINCIPAL =
            new AuthenticatedUser(20L, UserRole.MANAGER);
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 30, 12, 0);

    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final MeetingAccessService meetingAccessService = mock(MeetingAccessService.class);
    private final QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
    private final QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
    private final NotificationRepository notificationRepository =
            mock(NotificationRepository.class);
    private final QueuePositionService service = new QueuePositionService(
            currentUserService, meetingAccessService, entryRepository, notificationRepository,
            realtimeStore,
            Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault()));

    /** 뒤에 있던 참가자를 앞으로 옮기면 사이 참가자들이 한 칸씩 밀리는지 검증한다. */
    @Test
    void movesEntryForwardAndShiftsFollowingEntries() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        QueueEntry third = waitingEntry(13L, 3);
        QueueEntry fourth = waitingEntry(14L, 4);
        givenQueue(List.of(first, second, third, fourth));
        givenReorderSucceeds();

        QueuePositionChangeResponse response =
                service.changePosition(14L, new QueuePositionChangeRequest(2, null), PRINCIPAL);

        assertThat(response.previousPosition()).isEqualTo(4);
        assertThat(response.newPosition()).isEqualTo(2);
        assertThat(response.updatedAt()).isEqualTo(NOW);
        assertThat(first.getQueuePosition()).isEqualTo(1);
        assertThat(fourth.getQueuePosition()).isEqualTo(2);
        assertThat(second.getQueuePosition()).isEqualTo(3);
        assertThat(third.getQueuePosition()).isEqualTo(4);
        assertThat(capturedReorderPositions()).containsOnly(
                entry(11L, 1), entry(14L, 2), entry(12L, 3), entry(13L, 4));
        verify(entryRepository).flush();
    }

    /** 앞에 있던 참가자를 뒤로 옮기면 사이 참가자들이 한 칸씩 앞으로 오는지 검증한다. */
    @Test
    void movesEntryBackwardAndPullsPrecedingEntries() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        QueueEntry third = waitingEntry(13L, 3);
        givenQueue(List.of(first, second, third));
        givenReorderSucceeds();

        QueuePositionChangeResponse response =
                service.changePosition(11L, new QueuePositionChangeRequest(3, null), PRINCIPAL);

        assertThat(response.previousPosition()).isEqualTo(1);
        assertThat(response.newPosition()).isEqualTo(3);
        assertThat(second.getQueuePosition()).isEqualTo(1);
        assertThat(third.getQueuePosition()).isEqualTo(2);
        assertThat(first.getQueuePosition()).isEqualTo(3);
    }

    /** 첫 번째 순번으로 이동하면 나머지 대기자가 모두 한 칸씩 밀리는지 검증한다. */
    @Test
    void movesEntryToFirstPosition() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        QueueEntry third = waitingEntry(13L, 3);
        givenQueue(List.of(first, second, third));
        givenReorderSucceeds();

        QueuePositionChangeResponse response =
                service.changePosition(13L, new QueuePositionChangeRequest(1, null), PRINCIPAL);

        assertThat(response.newPosition()).isEqualTo(1);
        assertThat(third.getQueuePosition()).isEqualTo(1);
        assertThat(first.getQueuePosition()).isEqualTo(2);
        assertThat(second.getQueuePosition()).isEqualTo(3);
    }

    /** 마지막 순번으로 이동하는 경계값 요청을 정상 처리하는지 검증한다. */
    @Test
    void movesEntryToLastPosition() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        QueueEntry third = waitingEntry(13L, 3);
        givenQueue(List.of(first, second, third));
        givenReorderSucceeds();

        QueuePositionChangeResponse response =
                service.changePosition(11L, new QueuePositionChangeRequest(3, null), PRINCIPAL);

        assertThat(response.newPosition()).isEqualTo(3);
        assertThat(first.getQueuePosition()).isEqualTo(3);
    }

    /** 순번을 생략하면 대기열 마지막으로 이동시키는지 검증한다. */
    @Test
    void movesEntryToLastPositionWhenRequestedPositionIsOmitted() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        QueueEntry third = waitingEntry(13L, 3);
        givenQueue(List.of(first, second, third));
        givenReorderSucceeds();

        QueuePositionChangeResponse response = service.moveEntry(MEETING_ID, 11L, null, null);

        assertThat(response.previousPosition()).isEqualTo(1);
        assertThat(response.newPosition()).isEqualTo(3);
        assertThat(second.getQueuePosition()).isEqualTo(1);
        assertThat(third.getQueuePosition()).isEqualTo(2);
        assertThat(first.getQueuePosition()).isEqualTo(3);
    }

    /** 현재 순번과 같은 순번을 요청하면 순서를 유지하고 그대로 응답하는지 검증한다. */
    @Test
    void keepsPositionWhenRequestedPositionEqualsCurrentPosition() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        givenQueue(List.of(first, second));
        givenReorderSucceeds();

        QueuePositionChangeResponse response =
                service.changePosition(12L, new QueuePositionChangeRequest(2, null), PRINCIPAL);

        assertThat(response.previousPosition()).isEqualTo(2);
        assertThat(response.newPosition()).isEqualTo(2);
        assertThat(first.getQueuePosition()).isEqualTo(1);
        assertThat(second.getQueuePosition()).isEqualTo(2);
    }

    /** 대기자가 한 명뿐이면 자신의 순번 요청만 허용하는지 검증한다. */
    @Test
    void keepsPositionForSingleWaitingParticipant() {
        QueueEntry only = waitingEntry(11L, 1);
        givenQueue(List.of(only));
        givenReorderSucceeds();

        QueuePositionChangeResponse response =
                service.changePosition(11L, new QueuePositionChangeRequest(1, null), PRINCIPAL);

        assertThat(response.previousPosition()).isEqualTo(1);
        assertThat(response.newPosition()).isEqualTo(1);
    }

    /** 대기자가 한 명일 때 다른 순번 요청을 범위 초과로 거부하는지 검증한다. */
    @Test
    void rejectsSecondPositionForSingleWaitingParticipant() {
        QueueEntry only = waitingEntry(11L, 1);
        givenQueue(List.of(only));

        assertThatThrownBy(() ->
                service.changePosition(11L, new QueuePositionChangeRequest(2, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_POSITION_OUT_OF_RANGE));
        verify(realtimeStore, never()).reorder(eq(MEETING_ID), eq(11L), anyMap());
    }

    /** 0번 순번 요청을 범위를 벗어난 순번으로 거부하는지 검증한다. */
    @Test
    void rejectsZeroPosition() {
        givenQueue(List.of(waitingEntry(11L, 1), waitingEntry(12L, 2)));

        assertThatThrownBy(() ->
                service.changePosition(12L, new QueuePositionChangeRequest(0, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_POSITION_OUT_OF_RANGE));
    }

    /** 음수 순번 요청을 범위를 벗어난 순번으로 거부하는지 검증한다. */
    @Test
    void rejectsNegativePosition() {
        givenQueue(List.of(waitingEntry(11L, 1), waitingEntry(12L, 2)));

        assertThatThrownBy(() ->
                service.changePosition(12L, new QueuePositionChangeRequest(-1, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_POSITION_OUT_OF_RANGE));
    }

    /** 마지막 순번보다 큰 순번 요청을 범위를 벗어난 순번으로 거부하는지 검증한다. */
    @Test
    void rejectsPositionAfterLastPosition() {
        givenQueue(List.of(waitingEntry(11L, 1), waitingEntry(12L, 2)));

        assertThatThrownBy(() ->
                service.changePosition(11L, new QueuePositionChangeRequest(3, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_POSITION_OUT_OF_RANGE));
    }

    /** 통화 중인 참가자의 순서 이동 요청을 상태 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsMoveOfParticipantInCall() {
        QueueEntry inCall = entryWithStatus(11L, 1, QueueEntryStatus.IN_CALL);
        QueueEntry waiting = waitingEntry(12L, 2);
        givenQueue(List.of(inCall, waiting));

        assertThatThrownBy(() ->
                service.changePosition(11L, new QueuePositionChangeRequest(2, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_STATE_CONFLICT));
        verify(realtimeStore, never()).reorder(eq(MEETING_ID), eq(11L), anyMap());
    }

    /** 통화를 마친 참가자의 순서 이동 요청을 상태 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsMoveOfCompletedParticipant() {
        QueueEntry done = entryWithStatus(11L, 1, QueueEntryStatus.DONE);
        QueueEntry waiting = waitingEntry(12L, 2);
        givenQueue(List.of(done, waiting));

        assertThatThrownBy(() ->
                service.changePosition(11L, new QueuePositionChangeRequest(2, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_STATE_CONFLICT));
    }

    /** 통화 중·완료 참가자의 순번은 그대로 두고 대기자만 재배치하는지 검증한다. */
    @Test
    void keepsPositionsOfNonMovableParticipants() {
        QueueEntry done = entryWithStatus(11L, 1, QueueEntryStatus.DONE);
        QueueEntry inCall = entryWithStatus(12L, 2, QueueEntryStatus.IN_CALL);
        QueueEntry waitingThird = waitingEntry(13L, 3);
        QueueEntry waitingFourth = waitingEntry(14L, 4);
        givenQueue(List.of(done, inCall, waitingThird, waitingFourth));
        givenReorderSucceeds();

        QueuePositionChangeResponse response =
                service.changePosition(14L, new QueuePositionChangeRequest(3, null), PRINCIPAL);

        assertThat(response.newPosition()).isEqualTo(3);
        assertThat(done.getQueuePosition()).isEqualTo(1);
        assertThat(inCall.getQueuePosition()).isEqualTo(2);
        assertThat(waitingFourth.getQueuePosition()).isEqualTo(3);
        assertThat(waitingThird.getQueuePosition()).isEqualTo(4);
        assertThat(capturedReorderPositions()).containsOnly(entry(14L, 3), entry(13L, 4));
    }

    /** 완료 참가자가 차지한 순번으로 대기자를 옮기려는 요청을 거부하는지 검증한다. */
    @Test
    void rejectsMoveIntoPositionHeldByNonMovableParticipant() {
        QueueEntry done = entryWithStatus(11L, 1, QueueEntryStatus.DONE);
        QueueEntry waitingSecond = waitingEntry(12L, 2);
        QueueEntry waitingThird = waitingEntry(13L, 3);
        givenQueue(List.of(done, waitingSecond, waitingThird));

        assertThatThrownBy(() ->
                service.changePosition(13L, new QueuePositionChangeRequest(1, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_POSITION_OUT_OF_RANGE));
    }

    /** 존재하지 않는 대기열 항목의 순서 이동 요청을 404로 거부하는지 검증한다. */
    @Test
    void rejectsUnknownQueueEntry() {
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(mock(User.class));
        when(entryRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() ->
                service.changePosition(99L, new QueuePositionChangeRequest(1, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
    }

    /** 해당 팬미팅 매니저가 아니면 순서 이동을 시작하지 않는지 검증한다. */
    @Test
    void rejectsNonManagerRequest() {
        QueueEntry only = waitingEntry(11L, 1);
        User other = mock(User.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(other);
        when(entryRepository.findById(11L)).thenReturn(Optional.of(only));
        when(meetingAccessService.requireManager(MEETING_ID, other))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() ->
                service.changePosition(11L, new QueuePositionChangeRequest(1, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
        verify(entryRepository, never()).findAllByMeetingIdOrderByIdForUpdate(MEETING_ID);
    }

    /** 대기열이 초기화되지 않았으면 순서 이동을 거부하는지 검증한다. */
    @Test
    void rejectsMoveWhenQueueNotInitialized() {
        QueueEntry only = waitingEntry(11L, 1);
        User manager = mock(User.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(manager);
        when(entryRepository.findById(11L)).thenReturn(Optional.of(only));
        when(realtimeStore.isInitialized(MEETING_ID)).thenReturn(false);

        assertThatThrownBy(() ->
                service.changePosition(11L, new QueuePositionChangeRequest(1, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_NOT_INITIALIZED));
        verify(entryRepository, never()).findAllByMeetingIdOrderByIdForUpdate(MEETING_ID);
    }

    /** Redis 재정렬이 상태 충돌을 반환하면 DB를 수정하지 않는지 검증한다. */
    @Test
    void rejectsMoveWhenRealtimeReorderConflicts() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        givenQueue(List.of(first, second));
        when(realtimeStore.reorder(eq(MEETING_ID), eq(12L), anyMap()))
                .thenReturn(QueueReorderResult.STATE_CONFLICT);

        assertThatThrownBy(() ->
                service.changePosition(12L, new QueuePositionChangeRequest(1, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_STATE_CONFLICT));
        assertThat(first.getQueuePosition()).isEqualTo(1);
        assertThat(second.getQueuePosition()).isEqualTo(2);
        verify(entryRepository, never()).flush();
    }

    /** Redis에 순번이 없어 재정렬이 실패하면 상태 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsMoveWhenRealtimeEntryMissing() {
        givenQueue(List.of(waitingEntry(11L, 1), waitingEntry(12L, 2)));
        when(realtimeStore.reorder(eq(MEETING_ID), eq(12L), anyMap()))
                .thenReturn(QueueReorderResult.ENTRY_MISSING);

        assertThatThrownBy(() ->
                service.changePosition(12L, new QueuePositionChangeRequest(1, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_STATE_CONFLICT));
    }

    /** Redis 재정렬 결과가 미초기화면 대기열 미초기화 오류로 변환하는지 검증한다. */
    @Test
    void rejectsMoveWhenRealtimeReorderReportsNotInitialized() {
        givenQueue(List.of(waitingEntry(11L, 1), waitingEntry(12L, 2)));
        when(realtimeStore.reorder(eq(MEETING_ID), eq(12L), anyMap()))
                .thenReturn(QueueReorderResult.NOT_INITIALIZED);

        assertThatThrownBy(() ->
                service.changePosition(12L, new QueuePositionChangeRequest(1, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_NOT_INITIALIZED));
    }

    /** Redis 재정렬 후 DB 반영이 실패하면 이전 순번으로 되돌리는지 검증한다. */
    @Test
    void restoresRealtimePositionsWhenDatabaseUpdateFails() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        givenQueue(List.of(first, second));
        givenReorderSucceeds();
        doThrow(new IllegalStateException("DB 반영 실패")).when(entryRepository).flush();

        assertThatThrownBy(() ->
                service.changePosition(12L, new QueuePositionChangeRequest(1, null), PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_STATE_CONFLICT));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<Long, Integer>> captor = ArgumentCaptor.forClass(Map.class);
        verify(realtimeStore).restorePositions(eq(MEETING_ID), captor.capture());
        assertThat(captor.getValue()).containsOnly(entry(11L, 1), entry(12L, 2));
    }

    /** 순번이 바뀐 참가자마다 사유를 기록하고 알림을 만드는지 검증한다. */
    @Test
    void recordsReasonAndNotifiesEntriesWhosePositionChanged() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        QueueEntry third = waitingEntry(13L, 3);
        givenQueue(List.of(first, second, third));
        givenReorderSucceeds();

        service.changePosition(
                13L, new QueuePositionChangeRequest(1, "장비 점검이 늦어졌습니다."), PRINCIPAL);

        assertThat(third.getLastChangeReason())
                .contains("대기 순번이 3번에서 1번으로 변경되었습니다.")
                .contains("사유: 장비 점검이 늦어졌습니다.");
        assertThat(third.getLastChangedAt()).isEqualTo(NOW);
        assertThat(first.getLastChangeReason()).startsWith("다른 참가자의 순서 조정으로");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<Notification>> captor = ArgumentCaptor.forClass(Iterable.class);
        verify(notificationRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(3);
    }

    /** 순번이 그대로면 사유를 남기지 않고 알림도 만들지 않는지 검증한다. */
    @Test
    void skipsReasonAndNotificationWhenNoPositionChanged() {
        QueueEntry first = waitingEntry(11L, 1);
        QueueEntry second = waitingEntry(12L, 2);
        givenQueue(List.of(first, second));
        givenReorderSucceeds();

        service.changePosition(12L, new QueuePositionChangeRequest(2, null), PRINCIPAL);

        assertThat(first.getLastChangeReason()).isNull();
        assertThat(second.getLastChangeReason()).isNull();
        verifyNoInteractions(notificationRepository);
    }

    /**
     * 매니저 권한과 초기화된 대기열, 잠금 조회 결과를 준비한다.
     *
     * @param entries 팬미팅의 전체 대기열 항목
     */
    private void givenQueue(List<QueueEntry> entries) {
        User manager = mock(User.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(manager);
        entries.forEach(queueEntry ->
                when(entryRepository.findById(queueEntry.getId()))
                        .thenReturn(Optional.of(queueEntry)));
        when(realtimeStore.isInitialized(MEETING_ID)).thenReturn(true);
        when(entryRepository.findAllByMeetingIdOrderByIdForUpdate(MEETING_ID)).thenReturn(entries);
    }

    /** Redis 순번 재정렬이 성공하도록 준비한다. */
    private void givenReorderSucceeds() {
        when(realtimeStore.reorder(eq(MEETING_ID), anyLong(), anyMap()))
                .thenReturn(QueueReorderResult.REORDERED);
    }

    /**
     * Redis 재정렬에 전달된 대기열 항목별 새 순번을 확인한다.
     *
     * @return Lua 스크립트에 전달된 식별자별 새 순번
     */
    private Map<Long, Integer> capturedReorderPositions() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<Long, Integer>> captor = ArgumentCaptor.forClass(Map.class);
        verify(realtimeStore).reorder(eq(MEETING_ID), anyLong(), captor.capture());
        return captor.getValue();
    }

    /**
     * 대기 상태의 대기열 항목을 만든다.
     *
     * @param entryId 대기열 항목 식별자
     * @param position 현재 대기 순번
     * @return 대기 상태 대기열 항목
     */
    private QueueEntry waitingEntry(long entryId, int position) {
        return entryWithStatus(entryId, position, QueueEntryStatus.WAITING);
    }

    /**
     * 지정한 상태와 순번을 가진 대기열 항목을 만든다.
     *
     * @param entryId 대기열 항목 식별자
     * @param position 현재 대기 순번
     * @param status 대기열 상태
     * @return 조건에 맞는 대기열 항목
     */
    private QueueEntry entryWithStatus(long entryId, int position, QueueEntryStatus status) {
        FanMeeting meeting = mock(FanMeeting.class);
        when(meeting.getId()).thenReturn(MEETING_ID);
        Participant participant = mock(Participant.class);
        when(participant.getAssignedOrder()).thenReturn(position);
        when(participant.getFan()).thenReturn(mock(User.class));
        QueueEntry queueEntry = QueueEntry.create(meeting, participant);
        ReflectionTestUtils.setField(queueEntry, "id", entryId);
        ReflectionTestUtils.setField(queueEntry, "status", status);
        return queueEntry;
    }
}
