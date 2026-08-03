package com.ssafy.backend.call.service;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.livekit.service.LiveKitRoomParticipantService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.user.domain.User;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CallSessionFinalizerTest {

    /** 모든 종료 경로가 팬 퇴장과 DB·Redis 완료 상태를 동일하게 적용하는지 검증한다. */
    @Test
    void finalizesCallAndQueueRealtimeState() {
        LiveKitRoomParticipantService participantService =
                mock(LiveKitRoomParticipantService.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        CallSessionFinalizer finalizer = new CallSessionFinalizer(
                participantService, realtimeStore);
        CallSession callSession = mock(CallSession.class);
        QueueEntry queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        User endedBy = mock(User.class);
        LocalDateTime endedAt = LocalDateTime.of(2026, 7, 28, 11, 0);
        when(callSession.getId()).thenReturn(100L);
        when(callSession.getRoomId()).thenReturn("meeting-room-7");
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(queueEntry.getId()).thenReturn(20L);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(meeting.getId()).thenReturn(7L);

        finalizer.end(callSession, endedAt, CallEndReason.FORCED, endedBy);

        verify(participantService).removeFan("meeting-room-7", 100L);
        verify(callSession).end(endedAt, CallEndReason.FORCED, endedBy);
        verify(queueEntry).complete();
        verify(realtimeStore).updateStatus(7L, 20L, QueueEntryStatus.DONE);
        verify(realtimeStore).clearCurrent(7L, 20L);
        verify(realtimeStore).clearFanConnected(100L);
        verify(realtimeStore).clearDisconnectRole(100L);
    }

    /** 연결되지 못한 통화를 노쇼로 마감하고 Redis 호출 선점을 비우는지 검증한다. */
    @Test
    void failsConnectingCallAndReleasesCurrentClaim() {
        LiveKitRoomParticipantService participantService =
                mock(LiveKitRoomParticipantService.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        CallSessionFinalizer finalizer = new CallSessionFinalizer(
                participantService, realtimeStore);
        CallSession callSession = mock(CallSession.class);
        QueueEntry queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        LocalDateTime failedAt = LocalDateTime.of(2026, 7, 28, 11, 0);
        when(callSession.getId()).thenReturn(100L);
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(queueEntry.getId()).thenReturn(20L);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(meeting.getId()).thenReturn(7L);

        finalizer.failConnecting(callSession, failedAt, CallEndReason.CONNECTION_FAILED, null);

        verify(queueEntry).markNoShow(failedAt);
        verify(callSession).failConnecting(failedAt, CallEndReason.CONNECTION_FAILED, null);
        verify(realtimeStore).updateStatus(7L, 20L, QueueEntryStatus.NO_SHOW);
        verify(realtimeStore).clearCurrent(7L, 20L);
        verify(realtimeStore).clearFanConnected(100L);
        verify(realtimeStore).clearDisconnectRole(100L);
        verifyNoInteractions(participantService);
    }
}
