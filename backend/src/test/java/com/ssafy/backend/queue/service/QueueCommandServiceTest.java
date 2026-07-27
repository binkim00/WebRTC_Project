package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueCallResponse;
import com.ssafy.backend.queue.redis.QueueClaimResult;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QueueCommandServiceTest {
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-07-27T01:00:00Z"), ZoneOffset.UTC);
    private static final AuthenticatedUser PRINCIPAL =
            new AuthenticatedUser(10L, UserRole.MANAGER);

    /** 대기실 오픈 시각 전에는 참가자의 입장을 차단하는지 검증한다. */
    @Test
    void rejectsEntryBeforeWaitingRoomOpens() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        MeetingAccessService accessService = mock(MeetingAccessService.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        CallSessionRepository callSessionRepository = mock(CallSessionRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        QueueCommandService service = new QueueCommandService(
                currentUserService, accessService, settingRepository, entryRepository,
                callSessionRepository, realtimeStore, queryService, CLOCK);
        User fan = mock(User.class);
        QueueEntry entry = mock(QueueEntry.class);
        MeetingOperationSetting setting = mock(MeetingOperationSetting.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(fan);
        when(fan.getId()).thenReturn(10L);
        when(entryRepository.findByMeeting_IdAndParticipant_Fan_Id(1L, 10L))
                .thenReturn(Optional.of(entry));
        when(settingRepository.findById(1L)).thenReturn(Optional.of(setting));
        when(setting.getWaitingRoomOpenAt()).thenReturn(
                LocalDateTime.of(2026, 7, 27, 10, 1));

        assertThatThrownBy(() -> service.enter(1L, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.WAITING_ROOM_NOT_OPEN));
    }

    /** 최초 호출 시 Redis 선점과 함께 팬 언어를 고정한 CallSession을 생성하는지 검증한다. */
    @Test
    void callsSpecifiedQueueEntry() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        MeetingAccessService accessService = mock(MeetingAccessService.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        CallSessionRepository callSessionRepository = mock(CallSessionRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        QueueCommandService service = new QueueCommandService(
                currentUserService, accessService, settingRepository, entryRepository,
                callSessionRepository, realtimeStore, queryService, CLOCK);
        User manager = mock(User.class);
        FanMeeting meeting = mock(FanMeeting.class);
        Participant participant = mock(Participant.class);
        User fan = mock(User.class);
        when(participant.getAssignedOrder()).thenReturn(1);
        when(participant.getFan()).thenReturn(fan);
        when(fan.getPreferredLanguage()).thenReturn(PreferredLanguage.ENGLISH);
        QueueEntry entry = spy(QueueEntry.create(meeting, participant));
        ReflectionTestUtils.setField(entry, "id", 7L);
        entry.enter(LocalDateTime.of(2026, 7, 27, 0, 50));
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(manager);
        when(entryRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(entry));
        when(meeting.getId()).thenReturn(1L);
        when(realtimeStore.claimEntry(1L, 7L)).thenReturn(QueueClaimResult.CLAIMED);
        when(callSessionRepository.saveAndFlush(any(CallSession.class)))
                .thenAnswer(invocation -> {
                    CallSession callSession = invocation.getArgument(0);
                    ReflectionTestUtils.setField(callSession, "id", 100L);
                    return callSession;
                });

        QueueCallResponse response = service.call(7L, PRINCIPAL);

        verify(accessService).requireManager(1L, manager);
        verify(realtimeStore).claimEntry(1L, 7L);
        verify(entry).call(LocalDateTime.of(2026, 7, 27, 1, 0));
        ArgumentCaptor<CallSession> captor = ArgumentCaptor.forClass(CallSession.class);
        verify(callSessionRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getQueueEntry()).isSameAs(entry);
        assertThat(captor.getValue().getRoomId()).isEqualTo("meeting-room-1");
        assertThat(captor.getValue().getFanLanguage()).isEqualTo("en");
        assertThat(captor.getValue().getStatus()).isEqualTo(CallSessionStatus.CONNECTING);
        assertThat(response.callSessionId()).isEqualTo(100L);
        assertThat(response.status()).isEqualTo(QueueEntryStatus.CALLED);
        assertThat(response.callAttemptCount()).isEqualTo(1);
        assertThat(response.notificationSent()).isFalse();
    }

    /** 재호출 시 새 CallSession을 만들지 않고 최초 호출에서 생성한 세션을 재사용하는지 검증한다. */
    @Test
    void reusesCallSessionWhenRecallingParticipant() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        MeetingAccessService accessService = mock(MeetingAccessService.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        CallSessionRepository callSessionRepository = mock(CallSessionRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        QueueCommandService service = new QueueCommandService(
                currentUserService, accessService, settingRepository, entryRepository,
                callSessionRepository, realtimeStore, queryService, CLOCK);
        User manager = mock(User.class);
        QueueEntry entry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        CallSession callSession = mock(CallSession.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(manager);
        when(entryRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(entry));
        when(entry.getId()).thenReturn(7L);
        when(entry.getMeeting()).thenReturn(meeting);
        when(entry.getStatus()).thenReturn(QueueEntryStatus.CALLED);
        when(entry.getCallAttemptCount()).thenReturn(2);
        when(meeting.getId()).thenReturn(1L);
        when(realtimeStore.getCurrentEntryId(1L)).thenReturn(7L);
        when(callSessionRepository.findByQueueEntry_Id(7L))
                .thenReturn(Optional.of(callSession));
        when(callSession.getId()).thenReturn(100L);

        QueueCallResponse response = service.call(7L, PRINCIPAL);

        verify(entry).recall(LocalDateTime.of(2026, 7, 27, 1, 0));
        verify(callSessionRepository, never()).saveAndFlush(any(CallSession.class));
        assertThat(response.callSessionId()).isEqualTo(100L);
        assertThat(response.callAttemptCount()).isEqualTo(2);
    }

    /** DB에 활성 통화 세션이 남아 있으면 호출을 취소하고 Redis 선점을 해제하는지 검증한다. */
    @Test
    void releasesRedisClaimWhenActiveCallSessionExists() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        MeetingAccessService accessService = mock(MeetingAccessService.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        CallSessionRepository callSessionRepository = mock(CallSessionRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        QueueCommandService service = new QueueCommandService(
                currentUserService, accessService, settingRepository, entryRepository,
                callSessionRepository, realtimeStore, queryService, CLOCK);
        User manager = mock(User.class);
        QueueEntry entry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(manager);
        when(entryRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(entry));
        when(entry.getMeeting()).thenReturn(meeting);
        when(entry.getStatus()).thenReturn(QueueEntryStatus.WAITING);
        when(meeting.getId()).thenReturn(1L);
        when(realtimeStore.claimEntry(1L, 7L)).thenReturn(QueueClaimResult.CLAIMED);
        when(callSessionRepository.existsByQueueEntry_Meeting_IdAndStatusIn(
                1L, Set.of(CallSessionStatus.CONNECTING, CallSessionStatus.ACTIVE)))
                .thenReturn(true);

        assertThatThrownBy(() -> service.call(7L, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACTIVE_CALL_SESSION_EXISTS));

        verify(realtimeStore).releaseClaim(1L, 7L);
        verify(callSessionRepository, never()).saveAndFlush(any(CallSession.class));
    }

    /** 최초 호출과 재호출을 마친 참가자의 세 번째 호출을 차단하는지 검증한다. */
    @Test
    void rejectsThirdCallAttempt() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        MeetingAccessService accessService = mock(MeetingAccessService.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        CallSessionRepository callSessionRepository = mock(CallSessionRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        QueueCommandService service = new QueueCommandService(
                currentUserService, accessService, settingRepository, entryRepository,
                callSessionRepository, realtimeStore, queryService, CLOCK);
        User manager = mock(User.class);
        QueueEntry entry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(manager);
        when(entryRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(entry));
        when(entry.getId()).thenReturn(7L);
        when(entry.getMeeting()).thenReturn(meeting);
        when(meeting.getId()).thenReturn(1L);
        when(entry.getStatus()).thenReturn(QueueEntryStatus.CALLED);
        when(entry.getRecallCount()).thenReturn(1);
        when(realtimeStore.getCurrentEntryId(1L)).thenReturn(7L);

        assertThatThrownBy(() -> service.call(7L, PRINCIPAL))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.CALL_ATTEMPT_LIMIT_EXCEEDED));
    }
}
