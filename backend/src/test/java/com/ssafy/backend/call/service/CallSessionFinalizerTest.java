package com.ssafy.backend.call.service;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.livekit.service.LiveKitRoomParticipantService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.recording.egress.RecordingEgressCoordinator;
import com.ssafy.backend.user.domain.User;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.mockito.Mockito.doThrow;
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
        RecordingEgressCoordinator recordingEgressCoordinator =
                mock(RecordingEgressCoordinator.class);
        CallSessionFinalizer finalizer = new CallSessionFinalizer(
                participantService, realtimeStore, recordingEgressCoordinator);
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
        verify(recordingEgressCoordinator).prepareStop(callSession);
        verify(callSession).end(endedAt, CallEndReason.FORCED, endedBy);
        verify(queueEntry).complete();
        verify(realtimeStore).updateStatus(7L, 20L, QueueEntryStatus.DONE);
        verify(realtimeStore).clearCurrent(7L, 20L);
        verify(realtimeStore).clearFanConnected(100L);
        verify(realtimeStore).clearDisconnectRole(100L);
    }

    /**
     * 팬을 Room에서 내보내지 못해도 통화 마감을 끝까지 진행하는지 검증한다.
     *
     * <p>여기서 예외가 밖으로 나가면 통화는 ACTIVE, 대기열은 IN_CALL 로 롤백되어 다음 팬을
     * 호출할 수 없다. LiveKit 이 잠깐 흔들렸다고 팬미팅 진행이 멈추면 안 된다.
     */
    @Test
    void finalizesCallEvenWhenRoomCleanupFails() {
        LiveKitRoomParticipantService participantService =
                mock(LiveKitRoomParticipantService.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        RecordingEgressCoordinator recordingEgressCoordinator =
                mock(RecordingEgressCoordinator.class);
        CallSessionFinalizer finalizer = new CallSessionFinalizer(
                participantService, realtimeStore, recordingEgressCoordinator);
        CallSession callSession = mock(CallSession.class);
        QueueEntry queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        LocalDateTime endedAt = LocalDateTime.of(2026, 7, 28, 11, 0);
        when(callSession.getId()).thenReturn(100L);
        when(callSession.getRoomId()).thenReturn("meeting-room-7");
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(queueEntry.getId()).thenReturn(20L);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(meeting.getId()).thenReturn(7L);
        doThrow(new IllegalStateException("LiveKit 응답 없음"))
                .when(participantService).removeFan("meeting-room-7", 100L);

        finalizer.end(callSession, endedAt, CallEndReason.TIMEOUT, null);

        verify(callSession).end(endedAt, CallEndReason.TIMEOUT, null);
        verify(queueEntry).complete();
        verify(realtimeStore).updateStatus(7L, 20L, QueueEntryStatus.DONE);
        verify(realtimeStore).clearCurrent(7L, 20L);
    }

    /** 연결되지 못한 통화를 노쇼로 마감하고 Redis 호출 선점을 비우는지 검증한다. */
    @Test
    void failsConnectingCallAndReleasesCurrentClaim() {
        LiveKitRoomParticipantService participantService =
                mock(LiveKitRoomParticipantService.class);
        QueueRealtimeStore realtimeStore = mock(QueueRealtimeStore.class);
        RecordingEgressCoordinator recordingEgressCoordinator =
                mock(RecordingEgressCoordinator.class);
        CallSessionFinalizer finalizer = new CallSessionFinalizer(
                participantService, realtimeStore, recordingEgressCoordinator);
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
