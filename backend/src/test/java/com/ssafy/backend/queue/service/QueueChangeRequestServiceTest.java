package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueChangeRequest;
import com.ssafy.backend.queue.domain.QueueChangeRequestDecision;
import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueChangeRequestCreateRequest;
import com.ssafy.backend.queue.dto.QueueChangeRequestCreateResponse;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionRequest;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionResponse;
import com.ssafy.backend.queue.dto.QueueChangeRequestSummaryResponse;
import com.ssafy.backend.queue.dto.QueuePositionChangeResponse;
import com.ssafy.backend.queue.repository.QueueChangeRequestRepository;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QueueChangeRequestServiceTest {
    private static final Long MEETING_ID = 1L;
    private static final AuthenticatedUser FAN_PRINCIPAL =
            new AuthenticatedUser(10L, UserRole.FAN);
    private static final AuthenticatedUser MANAGER_PRINCIPAL =
            new AuthenticatedUser(20L, UserRole.MANAGER);
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 30, 12, 0);

    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final MeetingAccessService meetingAccessService = mock(MeetingAccessService.class);
    private final QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
    private final QueueChangeRequestRepository changeRequestRepository =
            mock(QueueChangeRequestRepository.class);
    private final QueuePositionService positionService = mock(QueuePositionService.class);
    private final QueueChangeRequestService service = new QueueChangeRequestService(
            currentUserService, meetingAccessService, entryRepository, changeRequestRepository,
            positionService,
            Clock.fixed(NOW.atZone(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault()));

    /** 대기 중인 팬의 순서 미루기 요청을 대기 상태로 접수하는지 검증한다. */
    @Test
    void createsPendingChangeRequestForWaitingFan() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 3, QueueEntryStatus.WAITING);
        givenFan(queueEntry);
        when(changeRequestRepository.existsByQueueEntry_Id(7L)).thenReturn(false);
        when(changeRequestRepository.save(any(QueueChangeRequest.class)))
                .thenAnswer(invocation -> {
                    QueueChangeRequest saved = invocation.getArgument(0);
                    ReflectionTestUtils.setField(saved, "id", 5L);
                    return saved;
                });

        QueueChangeRequestCreateResponse response = service.create(
                7L, new QueueChangeRequestCreateRequest("이동 중이라 순서를 미루고 싶습니다."),
                FAN_PRINCIPAL);

        assertThat(response.requestId()).isEqualTo(5L);
        assertThat(response.status()).isEqualTo(QueueChangeRequestStatus.PENDING);
        assertThat(response.requestedAt()).isEqualTo(NOW);
        ArgumentCaptor<QueueChangeRequest> captor =
                ArgumentCaptor.forClass(QueueChangeRequest.class);
        verify(changeRequestRepository).save(captor.capture());
        assertThat(captor.getValue().getRequestReason())
                .isEqualTo("이동 중이라 순서를 미루고 싶습니다.");
        assertThat(captor.getValue().getPreviousQueuePosition()).isEqualTo(3);
        assertThat(captor.getValue().getQueueEntry()).isSameAs(queueEntry);
    }

    /** 다른 팬의 대기열 항목으로 들어온 순서 미루기 요청을 차단하는지 검증한다. */
    @Test
    void rejectsChangeRequestFromOtherFan() {
        QueueEntry queueEntry = queueEntry(7L, 99L, 3, QueueEntryStatus.WAITING);
        givenFan(queueEntry);

        assertThatThrownBy(() -> service.create(
                7L, new QueueChangeRequestCreateRequest("사유"), FAN_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
        verify(changeRequestRepository, never()).save(any(QueueChangeRequest.class));
    }

    /** 아직 대기실에 입장하지 않은 팬의 순서 미루기 요청을 차단하는지 검증한다. */
    @Test
    void rejectsChangeRequestBeforeQueueEntry() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 3, QueueEntryStatus.NOT_ENTERED);
        givenFan(queueEntry);

        assertThatThrownBy(() -> service.create(
                7L, new QueueChangeRequestCreateRequest("사유"), FAN_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_ENTRY_NOT_ENTERED));
    }

    /** 이미 호출된 팬의 순서 미루기 요청을 상태 충돌로 차단하는지 검증한다. */
    @Test
    void rejectsChangeRequestAfterCall() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 1, QueueEntryStatus.CALLED);
        givenFan(queueEntry);

        assertThatThrownBy(() -> service.create(
                7L, new QueueChangeRequestCreateRequest("사유"), FAN_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_STATE_CONFLICT));
    }

    /** 통화를 마친 팬의 순서 미루기 요청을 상태 충돌로 차단하는지 검증한다. */
    @Test
    void rejectsChangeRequestAfterCallCompleted() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 1, QueueEntryStatus.DONE);
        givenFan(queueEntry);

        assertThatThrownBy(() -> service.create(
                7L, new QueueChangeRequestCreateRequest("사유"), FAN_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_STATE_CONFLICT));
    }

    /** 팬미팅당 한 번만 허용하므로 두 번째 순서 미루기 요청을 차단하는지 검증한다. */
    @Test
    void rejectsSecondChangeRequestInSameFanMeeting() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 3, QueueEntryStatus.WAITING);
        givenFan(queueEntry);
        when(changeRequestRepository.existsByQueueEntry_Id(7L)).thenReturn(true);

        assertThatThrownBy(() -> service.create(
                7L, new QueueChangeRequestCreateRequest("사유"), FAN_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_CHANGE_REQUEST_ALREADY_EXISTS));
        verify(changeRequestRepository, never()).save(any(QueueChangeRequest.class));
    }

    /** 존재하지 않는 대기열 항목의 순서 미루기 요청을 404로 거부하는지 검증한다. */
    @Test
    void rejectsChangeRequestForUnknownQueueEntry() {
        User loginFan = fan(10L);
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(loginFan);
        when(entryRepository.findByIdForUpdate(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(
                99L, new QueueChangeRequestCreateRequest("사유"), FAN_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_ENTRY_NOT_FOUND));
    }

    /** 매니저 목록 조회가 팬 정보와 요청 당시 순번을 명세 형식으로 반환하는지 검증한다. */
    @Test
    void returnsChangeRequestsWithFanSummary() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 3, QueueEntryStatus.WAITING);
        QueueChangeRequest changeRequest = pendingRequest(5L, queueEntry);
        givenManager();
        when(changeRequestRepository.findByQueueEntry_Meeting_Id(eq(MEETING_ID), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(changeRequest), PageRequest.of(0, 20), 1));

        PageResponse<QueueChangeRequestSummaryResponse> response =
                service.getRequests(MEETING_ID, null, 0, 20, MANAGER_PRINCIPAL);

        assertThat(response.content()).hasSize(1);
        QueueChangeRequestSummaryResponse summary = response.content().get(0);
        assertThat(summary.requestId()).isEqualTo(5L);
        assertThat(summary.fanId()).isEqualTo(10L);
        assertThat(summary.nickname()).isEqualTo("테스트팬");
        assertThat(summary.profileImageUrl()).isEqualTo("profile.png");
        assertThat(summary.requestReason()).isEqualTo("순서를 미뤄주세요.");
        assertThat(summary.requestedAt()).isEqualTo(NOW);
        assertThat(summary.previousPosition()).isEqualTo(3);
        assertThat(summary.status()).isEqualTo(QueueChangeRequestStatus.PENDING);
        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.hasNext()).isFalse();
    }

    /** 처리 상태 조건이 있으면 상태별 조회 메서드를 사용하는지 검증한다. */
    @Test
    void filtersChangeRequestsByStatus() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 3, QueueEntryStatus.WAITING);
        QueueChangeRequest changeRequest = pendingRequest(5L, queueEntry);
        givenManager();
        when(changeRequestRepository.findByQueueEntry_Meeting_IdAndStatus(
                eq(MEETING_ID), eq(QueueChangeRequestStatus.PENDING), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(changeRequest), PageRequest.of(0, 20), 1));

        PageResponse<QueueChangeRequestSummaryResponse> response = service.getRequests(
                MEETING_ID, QueueChangeRequestStatus.PENDING, 0, 20, MANAGER_PRINCIPAL);

        assertThat(response.content()).hasSize(1);
        verify(changeRequestRepository, never())
                .findByQueueEntry_Meeting_Id(eq(MEETING_ID), any(Pageable.class));
    }

    /** 접수된 요청이 없으면 빈 페이지를 반환하는지 검증한다. */
    @Test
    void returnsEmptyPageWhenNoChangeRequestExists() {
        givenManager();
        when(changeRequestRepository.findByQueueEntry_Meeting_Id(eq(MEETING_ID), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        PageResponse<QueueChangeRequestSummaryResponse> response =
                service.getRequests(MEETING_ID, null, 0, 20, MANAGER_PRINCIPAL);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalElements()).isZero();
        assertThat(response.hasNext()).isFalse();
    }

    /** 요청 시각 오름차순 정렬로 목록을 조회하는지 검증한다. */
    @Test
    void readsChangeRequestsOrderedByRequestedAt() {
        givenManager();
        when(changeRequestRepository.findByQueueEntry_Meeting_Id(eq(MEETING_ID), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(1, 10), 0));

        service.getRequests(MEETING_ID, null, 1, 10, MANAGER_PRINCIPAL);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(changeRequestRepository)
                .findByQueueEntry_Meeting_Id(eq(MEETING_ID), captor.capture());
        Pageable pageable = captor.getValue();
        assertThat(pageable.getPageNumber()).isEqualTo(1);
        assertThat(pageable.getPageSize()).isEqualTo(10);
        assertThat(pageable.getSort().toString()).isEqualTo("requestedAt: ASC,id: ASC");
    }

    /** 페이지 크기가 허용 범위를 벗어나면 잘못된 요청으로 거부하는지 검증한다. */
    @Test
    void rejectsChangeRequestListWithInvalidPage() {
        givenManager();

        assertThatThrownBy(() -> service.getRequests(MEETING_ID, null, -1, 20, MANAGER_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST));
        assertThatThrownBy(() -> service.getRequests(MEETING_ID, null, 0, 0, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.getRequests(MEETING_ID, null, 0, 101, MANAGER_PRINCIPAL))
                .isInstanceOf(BusinessException.class);
    }

    /** 해당 팬미팅 매니저가 아니면 요청 목록 조회를 차단하는지 검증한다. */
    @Test
    void rejectsChangeRequestListForNonManager() {
        User other = mock(User.class);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(other);
        when(meetingAccessService.requireManager(MEETING_ID, other))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> service.getRequests(MEETING_ID, null, 0, 20, MANAGER_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
        verify(changeRequestRepository, never())
                .findByQueueEntry_Meeting_Id(anyLong(), any(Pageable.class));
    }

    /** 승인 시 요청한 순번으로 대기열 항목을 이동시키고 승인 결과를 반환하는지 검증한다. */
    @Test
    void approvesChangeRequestAndMovesEntryToRequestedPosition() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 2, QueueEntryStatus.WAITING);
        QueueChangeRequest changeRequest = pendingRequest(5L, queueEntry);
        givenManagerProcessing(changeRequest);
        when(positionService.moveEntry(MEETING_ID, 7L, 4))
                .thenReturn(new QueuePositionChangeResponse(2, 4, NOW));

        QueueChangeRequestDecisionResponse response = service.process(
                5L,
                new QueueChangeRequestDecisionRequest(QueueChangeRequestDecision.APPROVED, 4, null),
                MANAGER_PRINCIPAL);

        assertThat(response.requestId()).isEqualTo(5L);
        assertThat(response.status()).isEqualTo(QueueChangeRequestStatus.APPROVED);
        assertThat(response.previousPosition()).isEqualTo(2);
        assertThat(response.changedPosition()).isEqualTo(4);
        assertThat(response.processedAt()).isEqualTo(NOW);
        assertThat(changeRequest.getStatus()).isEqualTo(QueueChangeRequestStatus.APPROVED);
        assertThat(changeRequest.getChangedQueuePosition()).isEqualTo(4);
        assertThat(changeRequest.getProcessedAt()).isEqualTo(NOW);
        verify(positionService).moveEntry(MEETING_ID, 7L, 4);
    }

    /** 승인 요청에 새 순번이 없으면 대기열 마지막으로 이동시키는지 검증한다. */
    @Test
    void approvesChangeRequestAndMovesEntryToLastWhenPositionOmitted() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 2, QueueEntryStatus.WAITING);
        QueueChangeRequest changeRequest = pendingRequest(5L, queueEntry);
        givenManagerProcessing(changeRequest);
        when(positionService.moveEntry(eq(MEETING_ID), eq(7L), isNull()))
                .thenReturn(new QueuePositionChangeResponse(2, 5, NOW));

        QueueChangeRequestDecisionResponse response = service.process(
                5L,
                new QueueChangeRequestDecisionRequest(
                        QueueChangeRequestDecision.APPROVED, null, null),
                MANAGER_PRINCIPAL);

        assertThat(response.status()).isEqualTo(QueueChangeRequestStatus.APPROVED);
        assertThat(response.previousPosition()).isEqualTo(2);
        assertThat(response.changedPosition()).isEqualTo(5);
        verify(positionService).moveEntry(eq(MEETING_ID), eq(7L), isNull());
    }

    /** 거절 처리에서는 순번을 이동하지 않고 거절 결과만 반환하는지 검증한다. */
    @Test
    void rejectsChangeRequestWithoutMovingEntry() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 2, QueueEntryStatus.WAITING);
        QueueChangeRequest changeRequest = pendingRequest(5L, queueEntry);
        givenManagerProcessing(changeRequest);

        QueueChangeRequestDecisionResponse response = service.process(
                5L,
                new QueueChangeRequestDecisionRequest(
                        QueueChangeRequestDecision.REJECTED, null, "다음 참가자 통화가 예정되어 있습니다."),
                MANAGER_PRINCIPAL);

        assertThat(response.status()).isEqualTo(QueueChangeRequestStatus.REJECTED);
        assertThat(response.previousPosition()).isEqualTo(2);
        assertThat(response.changedPosition()).isNull();
        assertThat(response.processedAt()).isEqualTo(NOW);
        assertThat(changeRequest.getStatus()).isEqualTo(QueueChangeRequestStatus.REJECTED);
        assertThat(changeRequest.getChangedQueuePosition()).isNull();
        verify(positionService, never()).moveEntry(anyLong(), anyLong(), any());
    }

    /** 이미 처리된 요청을 다시 처리하려는 시도를 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsAlreadyProcessedChangeRequest() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 2, QueueEntryStatus.WAITING);
        QueueChangeRequest changeRequest = pendingRequest(5L, queueEntry);
        changeRequest.approve(mock(User.class), 4, NOW.minusMinutes(1));
        givenManagerProcessing(changeRequest);

        assertThatThrownBy(() -> service.process(
                5L,
                new QueueChangeRequestDecisionRequest(QueueChangeRequestDecision.APPROVED, 3, null),
                MANAGER_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_CHANGE_REQUEST_CONFLICT));
        verify(positionService, never()).moveEntry(anyLong(), anyLong(), any());
    }

    /** 존재하지 않는 순서 변경 요청 처리를 404로 거부하는지 검증한다. */
    @Test
    void rejectsUnknownChangeRequest() {
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(mock(User.class));
        when(changeRequestRepository.findByIdForUpdate(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.process(
                99L,
                new QueueChangeRequestDecisionRequest(QueueChangeRequestDecision.APPROVED, 1, null),
                MANAGER_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_CHANGE_REQUEST_NOT_FOUND));
    }

    /** 해당 팬미팅 매니저가 아니면 요청 처리와 순번 이동을 모두 차단하는지 검증한다. */
    @Test
    void rejectsChangeRequestProcessingForNonManager() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 2, QueueEntryStatus.WAITING);
        QueueChangeRequest changeRequest = pendingRequest(5L, queueEntry);
        User other = mock(User.class);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(other);
        when(changeRequestRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(changeRequest));
        when(meetingAccessService.requireManager(MEETING_ID, other))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> service.process(
                5L,
                new QueueChangeRequestDecisionRequest(QueueChangeRequestDecision.APPROVED, 3, null),
                MANAGER_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCESS_DENIED));
        assertThat(changeRequest.getStatus()).isEqualTo(QueueChangeRequestStatus.PENDING);
        verify(positionService, never()).moveEntry(anyLong(), anyLong(), any());
    }

    /** 승인 시점에 팬이 이미 호출되어 이동할 수 없으면 승인 처리를 중단하는지 검증한다. */
    @Test
    void keepsChangeRequestPendingWhenEntryIsNoLongerMovable() {
        QueueEntry queueEntry = queueEntry(7L, 10L, 1, QueueEntryStatus.CALLED);
        QueueChangeRequest changeRequest = pendingRequest(5L, queueEntry);
        givenManagerProcessing(changeRequest);
        when(positionService.moveEntry(MEETING_ID, 7L, 3))
                .thenThrow(new BusinessException(ErrorCode.QUEUE_STATE_CONFLICT));

        assertThatThrownBy(() -> service.process(
                5L,
                new QueueChangeRequestDecisionRequest(QueueChangeRequestDecision.APPROVED, 3, null),
                MANAGER_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_STATE_CONFLICT));
        assertThat(changeRequest.getStatus()).isEqualTo(QueueChangeRequestStatus.PENDING);
    }

    /**
     * 순서 미루기 요청을 보내는 팬과 잠금 조회 결과를 준비한다.
     *
     * @param queueEntry 요청 대상 대기열 항목
     */
    private void givenFan(QueueEntry queueEntry) {
        User loginFan = fan(10L);
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(loginFan);
        when(entryRepository.findByIdForUpdate(queueEntry.getId()))
                .thenReturn(Optional.of(queueEntry));
    }

    /** 목록 조회 권한을 통과하는 매니저를 준비한다. */
    private void givenManager() {
        User manager = mock(User.class);
        FanMeeting meeting = mock(FanMeeting.class);
        when(currentUserService.requireActiveUser(MANAGER_PRINCIPAL)).thenReturn(manager);
        when(meetingAccessService.requireManager(MEETING_ID, manager)).thenReturn(meeting);
    }

    /**
     * 요청 처리 권한을 통과하는 매니저와 잠금 조회 결과를 준비한다.
     *
     * @param changeRequest 처리 대상 순서 변경 요청
     */
    private void givenManagerProcessing(QueueChangeRequest changeRequest) {
        givenManager();
        when(changeRequestRepository.findByIdForUpdate(changeRequest.getId()))
                .thenReturn(Optional.of(changeRequest));
    }

    /**
     * 대기 상태의 순서 변경 요청을 만든다.
     *
     * @param requestId 순서 변경 요청 식별자
     * @param queueEntry 요청 대상 대기열 항목
     * @return 대기 상태 순서 변경 요청
     */
    private QueueChangeRequest pendingRequest(long requestId, QueueEntry queueEntry) {
        QueueChangeRequest changeRequest =
                QueueChangeRequest.create(queueEntry, "순서를 미뤄주세요.", NOW);
        ReflectionTestUtils.setField(changeRequest, "id", requestId);
        return changeRequest;
    }

    /**
     * 지정한 상태와 순번을 가진 대기열 항목을 만든다.
     *
     * @param entryId 대기열 항목 식별자
     * @param fanId 대기열 항목을 소유한 팬 사용자 식별자
     * @param position 현재 대기 순번
     * @param status 대기열 상태
     * @return 조건에 맞는 대기열 항목
     */
    private QueueEntry queueEntry(long entryId, long fanId, int position,
                                  QueueEntryStatus status) {
        FanMeeting meeting = mock(FanMeeting.class);
        when(meeting.getId()).thenReturn(MEETING_ID);
        Participant participant = mock(Participant.class);
        User entryFan = fan(fanId);
        when(participant.getAssignedOrder()).thenReturn(position);
        when(participant.getFan()).thenReturn(entryFan);
        QueueEntry queueEntry = QueueEntry.create(meeting, participant);
        ReflectionTestUtils.setField(queueEntry, "id", entryId);
        ReflectionTestUtils.setField(queueEntry, "status", status);
        return queueEntry;
    }

    /**
     * 목록 응답 검증에 사용할 팬 사용자 mock을 만든다.
     *
     * @param fanId 팬 사용자 식별자
     * @return 닉네임과 프로필 이미지가 설정된 팬 사용자
     */
    private User fan(long fanId) {
        User fan = mock(User.class);
        when(fan.getId()).thenReturn(fanId);
        when(fan.getNickname()).thenReturn("테스트팬");
        when(fan.getProfileImageUrl()).thenReturn("profile.png");
        return fan;
    }

}
