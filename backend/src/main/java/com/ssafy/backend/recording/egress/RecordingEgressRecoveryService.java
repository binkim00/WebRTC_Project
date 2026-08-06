package com.ssafy.backend.recording.egress;

import com.ssafy.backend.recording.config.RecordingEgressProperties;
import com.ssafy.backend.recording.domain.RecordingSource;
import com.ssafy.backend.recording.domain.RecordingStatus;
import com.ssafy.backend.recording.repository.RecordingRepository;
import livekit.LivekitEgress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

/** Reconciles stale database state when an Egress API response or webhook was lost. */
@Service
public class RecordingEgressRecoveryService {

    private static final Logger log = LoggerFactory.getLogger(RecordingEgressRecoveryService.class);
    private static final List<RecordingStatus> RECOVERABLE_STATUSES = List.of(
            RecordingStatus.STARTING,
            RecordingStatus.RECORDING,
            RecordingStatus.PROCESSING);
    private static final long NANOS_PER_SECOND = 1_000_000_000L;

    private final RecordingRepository recordingRepository;
    private final RecordingEgressStateService stateService;
    private final LiveKitEgressClient client;
    private final RecordingEgressCapacityGuard capacityGuard;
    private final RecordingEgressProperties properties;
    private final Clock clock;

    public RecordingEgressRecoveryService(
            RecordingRepository recordingRepository,
            RecordingEgressStateService stateService,
            LiveKitEgressClient client,
            RecordingEgressCapacityGuard capacityGuard,
            RecordingEgressProperties properties,
            Clock clock) {
        this.recordingRepository = recordingRepository;
        this.stateService = stateService;
        this.client = client;
        this.capacityGuard = capacityGuard;
        this.properties = properties;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString =
            "${app.recording.egress.recovery-check-delay-ms:30000}")
    public void recoverStaleRecordings() {
        if (!properties.enabled()) {
            return;
        }
        for (Long recordingId : findCandidateIds()) {
            try {
                recoverOne(recordingId);
            } catch (RuntimeException exception) {
                // A transient LiveKit or Redis error is retried on the next scheduled pass.
                log.warn("Egress recovery attempt failed. recordingId={}",
                        recordingId, exception);
            }
        }
    }

    void recoverOne(Long recordingId) {
        RecordingEgressStateService.RecoveryContext context =
                stateService.getRecoveryContext(recordingId);
        if (context == null) {
            return;
        }

        boolean ownsCapacity = capacityGuard.claimOrRenew(recordingId);
        LivekitEgress.EgressInfo info = findEgress(context);
        if (info == null) {
            stateService.failRecovery(recordingId, "EGRESS_RECOVERY_NOT_FOUND",
                    "No matching Egress job was found during recovery.");
            return;
        }

        boolean mustStop = !ownsCapacity || context.status() == RecordingStatus.PROCESSING;
        if (mustStop && requiresStopRequest(info)) {
            stateService.prepareRecoveryStop(recordingId);
        }

        RecordingEgressStateService.ApplyResult result =
                stateService.applyApiResult(recordingId, info);
        if (mustStop && requiresStopRequest(info) && result.applied()) {
            LivekitEgress.EgressInfo stopped = client.stop(result.egressId());
            stateService.applyApiResult(recordingId, stopped);
        }
    }

    private LivekitEgress.EgressInfo findEgress(
            RecordingEgressStateService.RecoveryContext context) {
        if (context.egressId() != null) {
            return client.listByEgressId(context.egressId()).stream()
                    .findFirst().orElse(null);
        }

        long requestedAt = context.requestedAt() == null ? 0L
                : context.requestedAt().atZone(clock.getZone()).toInstant().getEpochSecond()
                * NANOS_PER_SECOND;
        long earliest = Math.max(0L, requestedAt - 30L * NANOS_PER_SECOND);
        return client.listByRoom(context.roomName()).stream()
                .filter(info -> info.getEgressId() != null && !info.getEgressId().isBlank())
                .filter(info -> info.getStartedAt() == 0 || info.getStartedAt() >= earliest)
                .filter(info -> matchesRequestedOutput(info, context.storageKey()))
                .max(Comparator.comparingLong(this::latestTimestamp))
                .orElse(null);
    }

    /** 공유 Room의 다른 통화를 연결하지 않도록 시작 요청의 출력 경로까지 대조한다. */
    private boolean matchesRequestedOutput(LivekitEgress.EgressInfo info, String storageKey) {
        if (!info.hasRoomComposite()) {
            return false;
        }
        String expected = outputPath(storageKey);
        LivekitEgress.RoomCompositeEgressRequest request = info.getRoomComposite();
        if (request.getFileOutputsList().stream()
                .anyMatch(output -> expected.equals(normalizePath(output.getFilepath())))) {
            return true;
        }
        return request.hasFile()
                && expected.equals(normalizePath(request.getFile().getFilepath()));
    }

    private String outputPath(String storageKey) {
        String root = normalizePath(properties.outputRoot());
        return root.endsWith("/") ? root + storageKey : root + "/" + storageKey;
    }

    private String normalizePath(String value) {
        if (value == null) {
            return "";
        }
        String normalized = value.trim().replace('\\', '/');
        while (normalized.length() > 1 && normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private long latestTimestamp(LivekitEgress.EgressInfo info) {
        return Math.max(info.getStartedAt(), info.getEndedAt());
    }

    private boolean requiresStopRequest(LivekitEgress.EgressInfo info) {
        return info.getStatus() == LivekitEgress.EgressStatus.EGRESS_STARTING
                || info.getStatus() == LivekitEgress.EgressStatus.EGRESS_ACTIVE;
    }

    @Transactional(readOnly = true)
    protected List<Long> findCandidateIds() {
        LocalDateTime cutoff = LocalDateTime.now(clock)
                .minusSeconds(properties.recoveryStaleSeconds());
        return recordingRepository.findEgressRecoveryCandidateIds(
                RecordingSource.LIVEKIT_EGRESS,
                RECOVERABLE_STATUSES,
                cutoff,
                PageRequest.of(0, properties.recoveryBatchSize()));
    }
}
