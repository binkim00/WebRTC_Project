package com.ssafy.backend.recording.egress;

import com.ssafy.backend.recording.config.RecordingEgressProperties;
import livekit.LivekitEgress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** DB 커밋 뒤 Egress API를 호출하고 결과를 새 트랜잭션으로 반영한다. */
@Component
public class RecordingEgressRunner {

    private static final Logger log = LoggerFactory.getLogger(RecordingEgressRunner.class);

    private final LiveKitEgressClient client;
    private final RecordingEgressStateService stateService;
    private final RecordingEgressProperties properties;
    private final RecordingEgressCapacityGuard capacityGuard;

    public RecordingEgressRunner(LiveKitEgressClient client,
                                 RecordingEgressStateService stateService,
                                 RecordingEgressProperties properties,
                                 RecordingEgressCapacityGuard capacityGuard) {
        this.client = client;
        this.stateService = stateService;
        this.properties = properties;
        this.capacityGuard = capacityGuard;
    }

    /** STARTING 행이 커밋된 뒤 Room Composite를 시작한다. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void start(RecordingEgressEvent.StartRequested event) {
        RecordingEgressStateService.StartContext context =
                stateService.getStartContext(event.recordingId());
        if (context == null) {
            return;
        }
        try {
            if (!capacityGuard.claimOrRenew(context.recordingId())) {
                stateService.failStart(context.recordingId(), "EGRESS_CONCURRENCY_LIMIT",
                        "No Egress capacity slot is available.");
                return;
            }
        } catch (RuntimeException exception) {
            stateService.failStart(context.recordingId(), "EGRESS_CAPACITY_GUARD_UNAVAILABLE",
                    exception.getMessage());
            log.warn("Egress capacity guard is unavailable. recordingId={}",
                    context.recordingId(), exception);
            return;
        }
        try {
            LivekitEgress.EgressInfo info = client.startRoomComposite(
                    context.roomName(), outputPath(context.storageKey()), properties.layout());
            RecordingEgressStateService.ApplyResult result =
                    stateService.applyApiResult(context.recordingId(), info);
            if (result.stopImmediately()) {
                stopNow(context.recordingId(), result.egressId());
            }
        } catch (RecordingEgressException exception) {
            stateService.failStart(context.recordingId(), exception.getFailureCode(),
                    exception.getMessage());
            log.warn("Egress 녹화 시작에 실패했습니다. recordingId={} code={}",
                    context.recordingId(), exception.getFailureCode());
        } catch (RuntimeException exception) {
            stateService.failStart(context.recordingId(), "EGRESS_START_UNEXPECTED",
                    exception.getMessage());
            log.warn("Egress 녹화 시작 중 예기치 않은 오류가 발생했습니다. recordingId={}",
                    context.recordingId(), exception);
        }
    }

    /** 통화 종료가 커밋된 뒤 현재 Egress 작업의 마감을 요청한다. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void stop(RecordingEgressEvent.StopRequested event) {
        RecordingEgressStateService.StopContext context =
                stateService.getStopContext(event.recordingId());
        if (context == null) {
            return;
        }
        stopNow(context.recordingId(), context.egressId());
    }

    private void stopNow(Long recordingId, String egressId) {
        try {
            LivekitEgress.EgressInfo info = client.stop(egressId);
            stateService.applyApiResult(recordingId, info);
        } catch (RuntimeException exception) {
            // 중지 RPC 실패만으로 녹화를 FAILED로 확정하지 않는다. webhook 또는 복구 조회가
            // 실제 Egress 결과를 반영할 수 있도록 PROCESSING 상태를 유지한다.
            log.warn("Egress 녹화 중지 요청에 실패했습니다. recordingId={} egressId={}",
                    recordingId, egressId, exception);
        }
    }

    private String outputPath(String storageKey) {
        String root = properties.outputRoot();
        while (root.endsWith("/")) {
            root = root.substring(0, root.length() - 1);
        }
        return root + "/" + storageKey;
    }
}
