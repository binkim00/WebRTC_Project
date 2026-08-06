package com.ssafy.backend.call.service;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.livekit.service.LiveKitRoomParticipantService;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.recording.egress.RecordingEgressCoordinator;
import com.ssafy.backend.user.domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/** 모든 종료 경로에서 통화·대기열·LiveKit·Redis 상태를 동일하게 마무리한다. */
@Component
public class CallSessionFinalizer {

    private static final Logger log = LoggerFactory.getLogger(CallSessionFinalizer.class);

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
        removeFanQuietly(callSession);
        callSession.end(endedAt, endReason, endedBy);
        queueEntry.complete();
        realtimeStore.updateStatus(meetingId, queueEntry.getId(), QueueEntryStatus.DONE);
        realtimeStore.clearCurrent(meetingId, queueEntry.getId());
        realtimeStore.clearFanConnected(callSession.getId());
        realtimeStore.clearDisconnectRole(callSession.getId());
    }

    /**
     * 공유 Room에서 팬을 내보낸다. 실패해도 통화 마감을 막지 않는다.
     *
     * <p>이 호출이 예외를 올리면 아래의 통화 종료와 대기열 정리가 함께 롤백된다. 그러면 통화는
     * ACTIVE, 대기열은 IN_CALL 로 남아 <b>다음 팬을 호출할 수 없다.</b> 통화 시간 만료·팬의 종료·
     * 운영자 강제 종료가 모두 이 경로를 지나므로, LiveKit 이 잠깐 흔들리면 팬미팅 진행 전체가
     * 멈춘다. 마감을 막는 대가가 정리를 못 하는 대가보다 크다.
     *
     * <p>정리를 못 한 팬은 방에 남는다. 방이 팬미팅당 하나라 다음 통화와 겹칠 수 있지만, 팬 화면은
     * 통화 상태를 확인해 종료를 알아채면 스스로 나가고, 남더라도 운영자가 강제 종료로 정리할 수
     * 있다. 팬미팅이 멈추는 쪽이 훨씬 나쁘다.
     *
     * @param callSession 마감 중인 통화 세션
     */
    private void removeFanQuietly(CallSession callSession) {
        try {
            participantService.removeFan(callSession.getRoomId(), callSession.getId());
        } catch (RuntimeException exception) {
            log.warn("통화를 마감하며 팬을 Room에서 내보내지 못했습니다. 마감은 계속합니다."
                    + " callSessionId={} roomId={}",
                    callSession.getId(), callSession.getRoomId(), exception);
        }
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
