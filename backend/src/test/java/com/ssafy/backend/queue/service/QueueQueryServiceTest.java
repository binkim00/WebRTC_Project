package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.queue.domain.QueueDisplayStatus;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueSnapshotResponse;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QueueQueryServiceTest {
    private static final AuthenticatedUser PRINCIPAL =
            new AuthenticatedUser(10L, UserRole.FAN);

    /** 명세 필드에 맞춰 호출 횟수와 입장 가능 여부를 포함한 스냅샷을 반환하는지 검증한다. */
    @Test
    void returnsSpecificationAlignedSnapshot() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        CallSessionRepository callSessionRepository = mock(CallSessionRepository.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        QueueQueryService service = new QueueQueryService(
                currentUserService, entryRepository, callSessionRepository,
                settingRepository, realtimeStore);
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
        QueueQueryService service = new QueueQueryService(
                currentUserService, entryRepository, callSessionRepository,
                settingRepository, realtimeStore);
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
        QueueQueryService service = new QueueQueryService(
                currentUserService, entryRepository, callSessionRepository,
                settingRepository, realtimeStore);
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
}
