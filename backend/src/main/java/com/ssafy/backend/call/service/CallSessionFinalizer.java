package com.ssafy.backend.call.service;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.livekit.service.LiveKitRoomParticipantService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.user.domain.User;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/** 모든 종료 경로에서 통화·대기열·LiveKit·Redis 상태를 동일하게 마무리한다. */
@Component
public class CallSessionFinalizer {

    private final LiveKitRoomParticipantService participantService;
    private final QueueRealtimeStore realtimeStore;

    /**
     * LiveKit 참가자 관리와 대기열 실시간 저장소를 주입받는다.
     *
     * @param participantService LiveKit 팬 참가자 제거 서비스
     * @param realtimeStore 대기열 실시간 상태 저장소
     */
    public CallSessionFinalizer(
            LiveKitRoomParticipantService participantService,
            QueueRealtimeStore realtimeStore
    ) {
        this.participantService = participantService;
        this.realtimeStore = realtimeStore;
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
        participantService.removeFan(callSession.getRoomId(), callSession.getId());
        callSession.end(endedAt, endReason, endedBy);
        queueEntry.complete();
        realtimeStore.updateStatus(meetingId, queueEntry.getId(), QueueEntryStatus.DONE);
        realtimeStore.clearCurrent(meetingId, queueEntry.getId());
        realtimeStore.clearFanConnected(callSession.getId());
        realtimeStore.clearDisconnectRole(callSession.getId());
    }
}
