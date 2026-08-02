package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueDisplayStatus;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueManagementResponse;
import com.ssafy.backend.queue.dto.QueueSnapshotResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class QueueQueryServiceTest {
    private static final AuthenticatedUser PRINCIPAL =
            new AuthenticatedUser(10L, UserRole.FAN);
    private static final AuthenticatedUser OPERATOR_PRINCIPAL =
            new AuthenticatedUser(20L, UserRole.MANAGER);

    /** 명세 필드에 맞춰 호출 횟수와 입장 가능 여부를 포함한 스냅샷을 반환하는지 검증한다. */
    @Test
    void returnsSpecificationAlignedSnapshot() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        CallSessionRepository callSessionRepository = mock(CallSessionRepository.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        MeetingAccessService meetingAccessService = mock(MeetingAccessService.class);
        QueueQueryService service = new QueueQueryService(
                currentUserService, entryRepository, callSessionRepository,
                settingRepository, realtimeStore, meetingAccessService);
        User fan = mock(User.class);
        QueueEntry entry = mock(QueueEntry.class);
        CallSession callSession = mock(CallSession.class);
        MeetingOperationSetting setting = mock(MeetingOperationSetting.class);
        LocalDateTime calledAt = LocalDateTime.of(2026, 7, 27, 10, 0);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(fan);
        when(fan.getId()).thenReturn(10L);
        when(entryRepository.findByMeeting_IdAndParticipant_Fan_Id(1L, 10L))
                .thenReturn(Optional.of(entry));
        when(entry.getId()).thenReturn(7L);
        when(entry.getCallAttemptCount()).thenReturn(2);
        when(entry.getCalledAt()).thenReturn(calledAt);
        when(callSessionRepository.findByQueueEntry_Id(7L))
                .thenReturn(Optional.of(callSession));
        when(callSession.getId()).thenReturn(100L);
        when(realtimeStore.isInitialized(1L)).thenReturn(true);
        when(realtimeStore.getStatus(1L, 7L)).thenReturn(QueueEntryStatus.CALLED);
        when(realtimeStore.getPosition(1L, 7L)).thenReturn(3);
        when(realtimeStore.countAhead(1L, 7L)).thenReturn(2L);
        when(settingRepository.findById(1L)).thenReturn(Optional.of(setting));
        when(setting.getCallDurationSec()).thenReturn(60);

        QueueSnapshotResponse response = service.getMySnapshot(1L, PRINCIPAL);

        assertThat(response.queueEntryId()).isEqualTo(7L);
        assertThat(response.position()).isEqualTo(3);
        assertThat(response.aheadCount()).isEqualTo(2);
        assertThat(response.estimatedWaitSec()).isEqualTo(120);
        assertThat(response.displayStatus()).isEqualTo(QueueDisplayStatus.WAITING);
        assertThat(response.callAttemptCount()).isEqualTo(2);
        assertThat(response.calledAt()).isEqualTo(calledAt);
        assertThat(response.callSessionId()).isEqualTo(100L);
        assertThat(response.canEnterCall()).isTrue();
    }

    /** 통화 중인 팬이 새로고침하거나 재접속할 때 기존 통화 세션 식별자를 복구하는지 검증한다. */
    @Test
    void returnsCallSessionIdWhileCallIsInProgress() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        CallSessionRepository callSessionRepository = mock(CallSessionRepository.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        MeetingAccessService meetingAccessService = mock(MeetingAccessService.class);
        QueueQueryService service = new QueueQueryService(
                currentUserService, entryRepository, callSessionRepository,
                settingRepository, realtimeStore, meetingAccessService);
        User fan = mock(User.class);
        QueueEntry entry = mock(QueueEntry.class);
        CallSession callSession = mock(CallSession.class);
        MeetingOperationSetting setting = mock(MeetingOperationSetting.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(fan);
        when(fan.getId()).thenReturn(10L);
        when(entryRepository.findByMeeting_IdAndParticipant_Fan_Id(1L, 10L))
                .thenReturn(Optional.of(entry));
        when(entry.getId()).thenReturn(7L);
        when(realtimeStore.isInitialized(1L)).thenReturn(true);
        when(realtimeStore.getStatus(1L, 7L)).thenReturn(QueueEntryStatus.IN_CALL);
        when(realtimeStore.getPosition(1L, 7L)).thenReturn(1);
        when(realtimeStore.countAhead(1L, 7L)).thenReturn(0L);
        when(settingRepository.findById(1L)).thenReturn(Optional.of(setting));
        when(setting.getCallDurationSec()).thenReturn(60);
        when(callSessionRepository.findByQueueEntry_Id(7L))
                .thenReturn(Optional.of(callSession));
        when(callSession.getId()).thenReturn(100L);

        QueueSnapshotResponse response = service.getMySnapshot(1L, PRINCIPAL);

        assertThat(response.callSessionId()).isEqualTo(100L);
        assertThat(response.canEnterCall()).isTrue();
    }

    /** 대기열을 초기화했어도 아직 입장하지 않은 팬의 상태 조회를 차단하는지 검증한다. */
    @Test
    void rejectsSnapshotBeforeQueueEntry() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        CallSessionRepository callSessionRepository = mock(CallSessionRepository.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        MeetingAccessService meetingAccessService = mock(MeetingAccessService.class);
        QueueQueryService service = new QueueQueryService(
                currentUserService, entryRepository, callSessionRepository,
                settingRepository, realtimeStore, meetingAccessService);
        User fan = mock(User.class);
        QueueEntry entry = mock(QueueEntry.class);
        MeetingOperationSetting setting = mock(MeetingOperationSetting.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(fan);
        when(fan.getId()).thenReturn(10L);
        when(entryRepository.findByMeeting_IdAndParticipant_Fan_Id(1L, 10L))
                .thenReturn(Optional.of(entry));
        when(entry.getId()).thenReturn(7L);
        when(realtimeStore.isInitialized(1L)).thenReturn(true);
        when(realtimeStore.getStatus(1L, 7L)).thenReturn(QueueEntryStatus.NOT_ENTERED);
        when(realtimeStore.getPosition(1L, 7L)).thenReturn(3);
        when(realtimeStore.countAhead(1L, 7L)).thenReturn(2L);
        when(settingRepository.findById(1L)).thenReturn(Optional.of(setting));
        when(setting.getCallDurationSec()).thenReturn(60);

        assertThatThrownBy(() -> service.getMySnapshot(1L, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_ENTRY_NOT_ENTERED));
    }

    /** 운영자 대기열 조회가 현재 통화와 실시간 순번·상태를 명세 형식으로 반환하는지 검증한다. */
    @Test
    void returnsManagementQueueWithCurrentCall() {
        ManagementFixture fixture = new ManagementFixture();
        QueueEntry inCallEntry = managementEntry(8L, 28L, 108L, "통화팬", "in-call.png", 1, 1,
                LocalDateTime.of(2026, 7, 30, 9, 55));
        QueueEntry waitingEntry = managementEntry(7L, 27L, 107L, "대기팬", "waiting.png", 2, 0,
                LocalDateTime.of(2026, 7, 30, 9, 58));
        QueueEntry doneEntry = managementEntry(9L, 29L, 109L, "완료팬", null, 3, 2,
                LocalDateTime.of(2026, 7, 30, 9, 50));
        CallSession callSession = mock(CallSession.class);
        fixture.givenOperator();
        fixture.givenEntries(List.of(inCallEntry, waitingEntry, doneEntry));
        fixture.givenRealtimeState(8L, QueueEntryStatus.IN_CALL, 1);
        fixture.givenRealtimeState(7L, QueueEntryStatus.WAITING, 2);
        fixture.givenRealtimeState(9L, QueueEntryStatus.DONE, 3);
        when(fixture.realtimeStore.getCurrentEntryId(1L)).thenReturn(8L);
        when(fixture.entryRepository.findByMeeting_IdAndId(1L, 8L))
                .thenReturn(Optional.of(inCallEntry));
        when(fixture.callSessionRepository.findByQueueEntry_Id(8L))
                .thenReturn(Optional.of(callSession));
        when(callSession.getId()).thenReturn(100L);
        when(callSession.getStartedAt()).thenReturn(LocalDateTime.of(2026, 7, 30, 10, 0));
        when(callSession.getEndsAt()).thenReturn(LocalDateTime.of(2026, 7, 30, 10, 1));

        QueueManagementResponse response =
                fixture.service.getManagementQueue(1L, OPERATOR_PRINCIPAL);

        assertThat(response.currentCall()).isNotNull();
        assertThat(response.currentCall().callSessionId()).isEqualTo(100L);
        assertThat(response.currentCall().participantId()).isEqualTo(28L);
        assertThat(response.currentCall().nickname()).isEqualTo("통화팬");
        assertThat(response.currentCall().startedAt())
                .isEqualTo(LocalDateTime.of(2026, 7, 30, 10, 0));
        assertThat(response.currentCall().endsAt())
                .isEqualTo(LocalDateTime.of(2026, 7, 30, 10, 1));
        assertThat(response.entries()).extracting(
                        QueueManagementResponse.Entry::queueEntryId,
                        QueueManagementResponse.Entry::participantId,
                        QueueManagementResponse.Entry::fanId,
                        QueueManagementResponse.Entry::nickname,
                        QueueManagementResponse.Entry::position,
                        QueueManagementResponse.Entry::status,
                        QueueManagementResponse.Entry::callAttemptCount)
                .containsExactly(
                        tuple(8L, 28L, 108L, "통화팬", 1, "IN_CALL", 1),
                        tuple(7L, 27L, 107L, "대기팬", 2, "WAITING", 0),
                        tuple(9L, 29L, 109L, "완료팬", 3, "COMPLETED", 2));
    }

    /** 아직 대기실에 입장하지 않은 참가자를 운영자 대기열에서 제외하는지 검증한다. */
    @Test
    void excludesNotEnteredParticipantsFromManagementQueue() {
        ManagementFixture fixture = new ManagementFixture();
        QueueEntry waitingEntry = managementEntry(7L, 27L, 107L, "대기팬", null, 1, 0,
                LocalDateTime.of(2026, 7, 30, 9, 58));
        QueueEntry notEnteredEntry = managementEntry(8L, 28L, 108L, "미입장팬", null, 2, 0, null);
        fixture.givenOperator();
        fixture.givenEntries(List.of(waitingEntry, notEnteredEntry));
        fixture.givenRealtimeState(7L, QueueEntryStatus.WAITING, 1);
        fixture.givenRealtimeState(8L, QueueEntryStatus.NOT_ENTERED, 2);
        when(fixture.realtimeStore.getCurrentEntryId(1L)).thenReturn(null);

        QueueManagementResponse response =
                fixture.service.getManagementQueue(1L, OPERATOR_PRINCIPAL);

        assertThat(response.currentCall()).isNull();
        assertThat(response.entries())
                .extracting(QueueManagementResponse.Entry::queueEntryId)
                .containsExactly(7L);
    }

    /** 입장한 참가자와 진행 중인 통화가 모두 없으면 빈 대기열을 반환하는지 검증한다. */
    @Test
    void returnsEmptyManagementQueueWhenNobodyEntered() {
        ManagementFixture fixture = new ManagementFixture();
        QueueEntry notEnteredEntry = managementEntry(7L, 27L, 107L, "미입장팬", null, 1, 0, null);
        fixture.givenOperator();
        fixture.givenEntries(List.of(notEnteredEntry));
        fixture.givenRealtimeState(7L, QueueEntryStatus.NOT_ENTERED, 1);
        when(fixture.realtimeStore.getCurrentEntryId(1L)).thenReturn(null);

        QueueManagementResponse response =
                fixture.service.getManagementQueue(1L, OPERATOR_PRINCIPAL);

        assertThat(response.currentCall()).isNull();
        assertThat(response.entries()).isEmpty();
    }

    /** Redis에 실시간 순번이 없으면 DB에 저장된 순번으로 대체하는지 검증한다. */
    @Test
    void fallsBackToStoredPositionWhenRealtimePositionMissing() {
        ManagementFixture fixture = new ManagementFixture();
        QueueEntry waitingEntry = managementEntry(7L, 27L, 107L, "대기팬", null, 4, 0,
                LocalDateTime.of(2026, 7, 30, 9, 58));
        fixture.givenOperator();
        fixture.givenEntries(List.of(waitingEntry));
        fixture.givenRealtimeState(7L, QueueEntryStatus.WAITING, null);
        when(fixture.realtimeStore.getCurrentEntryId(1L)).thenReturn(null);

        QueueManagementResponse response =
                fixture.service.getManagementQueue(1L, OPERATOR_PRINCIPAL);

        assertThat(response.entries())
                .extracting(QueueManagementResponse.Entry::position)
                .containsExactly(4);
    }

    /** 현재 참가자의 통화 세션이 아직 없으면 현재 통화를 비워서 반환하는지 검증한다. */
    @Test
    void omitsCurrentCallWhenCallSessionMissing() {
        ManagementFixture fixture = new ManagementFixture();
        QueueEntry calledEntry = managementEntry(7L, 27L, 107L, "호출팬", null, 1, 1,
                LocalDateTime.of(2026, 7, 30, 9, 58));
        fixture.givenOperator();
        fixture.givenEntries(List.of(calledEntry));
        fixture.givenRealtimeState(7L, QueueEntryStatus.CALLED, 1);
        when(fixture.realtimeStore.getCurrentEntryId(1L)).thenReturn(7L);
        when(fixture.entryRepository.findByMeeting_IdAndId(1L, 7L))
                .thenReturn(Optional.of(calledEntry));
        when(fixture.callSessionRepository.findByQueueEntry_Id(7L)).thenReturn(Optional.empty());

        QueueManagementResponse response =
                fixture.service.getManagementQueue(1L, OPERATOR_PRINCIPAL);

        assertThat(response.currentCall()).isNull();
        assertThat(response.entries())
                .extracting(QueueManagementResponse.Entry::status)
                .containsExactly("CALLED");
    }

    /** 대기열이 초기화되지 않은 팬미팅의 운영자 조회를 차단하는지 검증한다. */
    @Test
    void rejectsManagementQueueWhenQueueNotInitialized() {
        ManagementFixture fixture = new ManagementFixture();
        User operator = mock(User.class);
        when(fixture.currentUserService.requireActiveUser(OPERATOR_PRINCIPAL)).thenReturn(operator);
        when(fixture.realtimeStore.isInitialized(1L)).thenReturn(false);

        assertThatThrownBy(() -> fixture.service.getManagementQueue(1L, OPERATOR_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_NOT_INITIALIZED));
        verifyNoInteractions(fixture.entryRepository);
    }

    /** 팬미팅 운영자가 아닌 사용자의 대기열 조회를 권한 검증에서 차단하는지 검증한다. */
    @Test
    void rejectsManagementQueueForNonOperator() {
        ManagementFixture fixture = new ManagementFixture();
        User other = mock(User.class);
        when(fixture.currentUserService.requireActiveUser(OPERATOR_PRINCIPAL)).thenReturn(other);
        when(fixture.meetingAccessService.requireOperator(1L, other))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> fixture.service.getManagementQueue(1L, OPERATOR_PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));
        verifyNoInteractions(fixture.entryRepository);
    }

    /**
     * 운영자 대기열 조회 테스트에 필요한 팬 정보가 연결된 대기열 항목 mock을 만든다.
     *
     * @param entryId 대기열 항목 식별자
     * @param participantId 참가자 식별자
     * @param fanId 팬 사용자 식별자
     * @param nickname 팬 닉네임
     * @param profileImageUrl 팬 프로필 이미지 주소
     * @param storedPosition DB에 저장된 대기 순번
     * @param callAttemptCount 누적 호출 시도 횟수
     * @param enteredAt 대기열 입장 시각
     * @return 조회 응답 변환에 필요한 값이 설정된 대기열 항목 mock
     */
    private QueueEntry managementEntry(Long entryId, Long participantId, Long fanId,
                                       String nickname, String profileImageUrl,
                                       int storedPosition, int callAttemptCount,
                                       LocalDateTime enteredAt) {
        QueueEntry entry = mock(QueueEntry.class);
        Participant participant = mock(Participant.class);
        User fan = mock(User.class);
        when(entry.getId()).thenReturn(entryId);
        when(entry.getParticipant()).thenReturn(participant);
        when(participant.getId()).thenReturn(participantId);
        when(participant.getFan()).thenReturn(fan);
        when(fan.getId()).thenReturn(fanId);
        when(fan.getNickname()).thenReturn(nickname);
        when(fan.getProfileImageUrl()).thenReturn(profileImageUrl);
        when(entry.getQueuePosition()).thenReturn(storedPosition);
        when(entry.getCallAttemptCount()).thenReturn(callAttemptCount);
        when(entry.getEnteredAt()).thenReturn(enteredAt);
        return entry;
    }

    /** 운영자 대기열 조회 테스트에서 반복되는 mock 구성과 서비스 생성을 담는다. */
    private static final class ManagementFixture {
        private final CurrentUserService currentUserService = mock(CurrentUserService.class);
        private final QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        private final CallSessionRepository callSessionRepository =
                mock(CallSessionRepository.class);
        private final MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        private final QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        private final MeetingAccessService meetingAccessService = mock(MeetingAccessService.class);
        private final QueueQueryService service = new QueueQueryService(
                currentUserService, entryRepository, callSessionRepository,
                settingRepository, realtimeStore, meetingAccessService);

        /** 운영 권한을 통과하는 로그인 사용자와 초기화된 대기열을 준비한다. */
        private void givenOperator() {
            User operator = mock(User.class);
            when(currentUserService.requireActiveUser(OPERATOR_PRINCIPAL)).thenReturn(operator);
            when(realtimeStore.isInitialized(1L)).thenReturn(true);
        }

        /** 팬미팅 대기열 조회 결과로 반환할 항목 목록을 준비한다. */
        private void givenEntries(List<QueueEntry> entries) {
            when(entryRepository.findByMeeting_IdOrderByQueuePositionAsc(1L)).thenReturn(entries);
        }

        /** 특정 대기열 항목의 Redis 상태와 순번을 준비한다. */
        private void givenRealtimeState(Long entryId, QueueEntryStatus status, Integer position) {
            when(realtimeStore.getStatus(1L, entryId)).thenReturn(status);
            when(realtimeStore.getPosition(1L, entryId)).thenReturn(position);
        }
    }
}
