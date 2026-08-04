package com.ssafy.backend.call.service;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.livekit.service.LiveKitRoomParticipantService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.recording.egress.RecordingEgressCoordinator;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/** 모든 종료 경로에서 통화·대기열·LiveKit·Redis 상태를 동일하게 마무리한다. */
@Component
public class CallSessionFinalizer {

    private final LiveKitRoomParticipantService participantService;
    private final QueueRealtimeStore realtimeStore;
    private final RecordingEgressCoordinator recordingEgressCoordinator;

    /**
     * LiveKit 참가자 관리와 대기열 실시간 저장소를 주입받는다.
     *
     * @param participantService LiveKit 팬 참가자 제거 서비스
     * @param realtimeStore 대기열 실시간 상태 저장소
     */
    public CallSessionFinalizer(
            LiveKitRoomParticipantService participantService,
            QueueRealtimeStore realtimeStore,
            RecordingEgressCoordinator recordingEgressCoordinator
    ) {
        this.participantService = participantService;
        this.realtimeStore = realtimeStore;
        this.recordingEgressCoordinator = recordingEgressCoordinator;
    }

    /**
     * 활성 통화를 종료하고 공유 Room의 현재 팬과 Redis 활성 상태를 정리한다.
     *
     * @param callSession 종료할 활성 통화 세션
     * @param endedAt 서버 기준 종료 시각
     * @param endReason 통화 종료 사유
     * @param endedBy 종료 사용자이며 자동 종료라면 null
     */
    public void end(
            CallSession callSession,
            LocalDateTime endedAt,
            CallEndReason endReason,
            User endedBy
    ) {
        QueueEntry queueEntry = callSession.getQueueEntry();
        Long meetingId = queueEntry.getMeeting().getId();
        recordingEgressCoordinator.prepareStop(callSession);
        participantService.removeFan(callSession.getRoomId(), callSession.getId());
        callSession.end(endedAt, endReason, endedBy);
        queueEntry.complete();
        realtimeStore.updateStatus(meetingId, queueEntry.getId(), QueueEntryStatus.DONE);
        realtimeStore.clearCurrent(meetingId, queueEntry.getId());
        realtimeStore.clearFanConnected(callSession.getId());
        realtimeStore.clearDisconnectRole(callSession.getId());
    }

    /**
     * 통화가 시작되지 못한 세션을 실패로 마감하고 대기열 항목을 노쇼로 정리한다.
     *
     * <p>연결 시간 초과와 운영자의 강제 종료가 같은 뒤처리를 거치도록 모아 둔 경로다.
     * 팬이 아직 Room에 들어오지 않은 상태이므로 LiveKit 참가자 제거는 하지 않는다.
     *
     * @param callSession 연결 대기 상태의 통화 세션
     * @param failedAt 서버 기준 종료 시각
     * @param endReason 통화 종료 사유
     * @param endedBy 종료를 요청한 사용자이며 자동 종료라면 null
     * @throws IllegalStateException 통화나 대기열이 실패 처리할 수 있는 상태가 아닌 경우
     */
    public void failConnecting(
            CallSession callSession,
            LocalDateTime failedAt,
            CallEndReason endReason,
            User endedBy
    ) {
        QueueEntry queueEntry = callSession.getQueueEntry();
        Long meetingId = queueEntry.getMeeting().getId();
        queueEntry.markNoShow(failedAt);
        callSession.failConnecting(failedAt, endReason, endedBy);
        realtimeStore.updateStatus(meetingId, queueEntry.getId(), QueueEntryStatus.NO_SHOW);
        realtimeStore.clearCurrent(meetingId, queueEntry.getId());
        realtimeStore.clearFanConnected(callSession.getId());
        realtimeStore.clearDisconnectRole(callSession.getId());
    }
}
