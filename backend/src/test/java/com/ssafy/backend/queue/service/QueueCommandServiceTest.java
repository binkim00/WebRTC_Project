package com.ssafy.backend.queue.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueOperationResponse;
import com.ssafy.backend.queue.redis.QueueClaimResult;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
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
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        QueueCommandService service = new QueueCommandService(
                currentUserService, accessService, settingRepository, entryRepository,
                realtimeStore, queryService, CLOCK);
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

    /** 매니저가 지정한 대기열 항목만 Redis에서 선점하여 호출하는지 검증한다. */
    @Test
    void callsSpecifiedQueueEntry() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        MeetingAccessService accessService = mock(MeetingAccessService.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        QueueCommandService service = new QueueCommandService(
                currentUserService, accessService, settingRepository, entryRepository,
                realtimeStore, queryService, CLOCK);
        User manager = mock(User.class);
        QueueEntry entry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        QueueOperationResponse response = mock(QueueOperationResponse.class);
        when(currentUserService.requireActiveUser(PRINCIPAL)).thenReturn(manager);
        when(entryRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(entry));
        when(entry.getMeeting()).thenReturn(meeting);
        when(meeting.getId()).thenReturn(1L);
        when(entry.getStatus()).thenReturn(QueueEntryStatus.WAITING);
        when(realtimeStore.claimEntry(1L, 7L)).thenReturn(QueueClaimResult.CLAIMED);
        when(queryService.toOperationResponse(entry)).thenReturn(response);

        service.call(7L, PRINCIPAL);

        verify(accessService).requireManager(1L, manager);
        verify(realtimeStore).claimEntry(1L, 7L);
        verify(entry).call(LocalDateTime.of(2026, 7, 27, 1, 0));
    }

    /** 최초 호출과 재호출을 마친 참가자의 세 번째 호출을 차단하는지 검증한다. */
    @Test
    void rejectsThirdCallAttempt() {
        CurrentUserService currentUserService = mock(CurrentUserService.class);
        MeetingAccessService accessService = mock(MeetingAccessService.class);
        MeetingOperationSettingRepository settingRepository =
                mock(MeetingOperationSettingRepository.class);
        QueueEntryRepository entryRepository = mock(QueueEntryRepository.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        QueueCommandService service = new QueueCommandService(
                currentUserService, accessService, settingRepository, entryRepository,
                realtimeStore, queryService, CLOCK);
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
