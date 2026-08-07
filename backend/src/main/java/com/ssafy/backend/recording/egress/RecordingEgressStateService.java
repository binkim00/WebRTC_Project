package com.ssafy.backend.recording.egress;

import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.recording.domain.RecordingStatus;
import com.ssafy.backend.recording.config.RecordingEgressProperties;
import com.ssafy.backend.recording.config.RecordingStorageProperties;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.recording.storage.RecordingFileStorage;
import livekit.LivekitEgress;
import org.springframework.stereotype.Service;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;

/** Egress API·webhook 결과를 쓰기 잠금과 상태 전이 규칙에 따라 저장한다. */
@Service
public class RecordingEgressStateService {

    private static final long NANOS_PER_SECOND = 1_000_000_000L;

    private final RecordingRepository recordingRepository;
    private final RecordingFileStorage fileStorage;
    private final RecordingStorageProperties storageProperties;
    private final RecordingEgressProperties egressProperties;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    public RecordingEgressStateService(RecordingRepository recordingRepository,
                                       RecordingFileStorage fileStorage,
                                       RecordingStorageProperties storageProperties,
                                       RecordingEgressProperties egressProperties,
                                       ApplicationEventPublisher eventPublisher,
                                       Clock clock) {
        this.recordingRepository = recordingRepository;
        this.fileStorage = fileStorage;
        this.storageProperties = storageProperties;
        this.egressProperties = egressProperties;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    /** 외부 시작 호출에 필요한 불변 값만 읽어 트랜잭션 밖으로 반환한다. */
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public StartContext getStartContext(Long recordingId) {
        Recording recording = recordingRepository.findById(recordingId).orElse(null);
        if (recording == null
                || (recording.getStatus() != RecordingStatus.STARTING
                    && !(recording.getStatus() == RecordingStatus.PROCESSING
                         && recording.getEgressId() == null))) {
            return null;
        }
        return new StartContext(
                recording.getId(), recording.getRoomName(), recording.getStorageKey());
    }

    /** 외부 중지 호출에 필요한 Egress ID를 반환한다. 아직 ID가 없으면 시작 응답이 중지한다. */
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public StopContext getStopContext(Long recordingId) {
        Recording recording = recordingRepository.findById(recordingId).orElse(null);
        if (recording == null || recording.isTerminal()
                || recording.getEgressId() == null) {
            return null;
        }
        return new StopContext(recording.getId(), recording.getEgressId());
    }

    /** 시작·중지 API 응답을 녹화 ID로 반영하고 즉시 중지가 필요한지 반환한다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ApplyResult applyApiResult(Long recordingId, LivekitEgress.EgressInfo info) {
        Recording recording = recordingRepository.findByIdForUpdate(recordingId).orElse(null);
        if (recording == null) {
            return ApplyResult.ignored();
        }
        apply(recording, info);
        publishCapacityReleaseIfTerminal(recording);
        boolean stopImmediately = recording.getStatus() == RecordingStatus.PROCESSING
                && recording.getEgressId() != null
                && (info.getStatus() == LivekitEgress.EgressStatus.EGRESS_STARTING
                    || info.getStatus() == LivekitEgress.EgressStatus.EGRESS_ACTIVE);
        return new ApplyResult(true, stopImmediately, recording.getEgressId());
    }

    /** Egress webhook payload를 작업 ID로 찾아 반영한다. 알 수 없는 PoC 작업은 무시한다. */
    @Transactional
    public ApplyResult applyWebhook(LivekitEgress.EgressInfo info) {
        if (info.getEgressId().isBlank()) {
            return ApplyResult.ignored();
        }
        Recording recording = recordingRepository
                .findByEgressIdForUpdate(info.getEgressId()).orElse(null);
        if (recording == null) {
            return ApplyResult.ignored();
        }
        apply(recording, info);
        publishCapacityReleaseIfTerminal(recording);
        return new ApplyResult(true, false, recording.getEgressId());
    }

    /** 시작 RPC 실패를 통화와 분리된 녹화 실패로 저장한다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failStart(Long recordingId, String failureCode, String failureMessage) {
        recordingRepository.findByIdForUpdate(recordingId)
                .ifPresent(recording -> {
                    recording.markFailed(failureCode, failureMessage, LocalDateTime.now(clock));
                    publishCapacityReleaseIfTerminal(recording);
                });
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failRecovery(Long recordingId, String failureCode, String failureMessage) {
        recordingRepository.findByIdForUpdate(recordingId)
                .ifPresent(recording -> {
                    if (!recording.isTerminal()) {
                        recording.markFailed(failureCode, failureMessage, LocalDateTime.now(clock));
                    }
                    publishCapacityReleaseIfTerminal(recording);
                });
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public RecoveryContext getRecoveryContext(Long recordingId) {
        Recording recording = recordingRepository.findById(recordingId).orElse(null);
        if (recording == null || recording.isTerminal()) {
            return null;
        }
        return new RecoveryContext(recording.getId(), recording.getEgressId(),
                recording.getRoomName(), recording.getStorageKey(), recording.getStatus(),
                recording.getRequestedAt());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void prepareRecoveryStop(Long recordingId) {
        recordingRepository.findByIdForUpdate(recordingId)
                .filter(recording -> !recording.isTerminal())
                .ifPresent(Recording::markProcessing);
    }

    private void apply(Recording recording, LivekitEgress.EgressInfo info) {
        recording.assignEgressId(info.getEgressId());
        switch (info.getStatus()) {
            case EGRESS_STARTING -> {
                // ID만 저장하고 egress_started webhook을 기다린다.
            }
            case EGRESS_ACTIVE -> recording.markRecording(
                    fromUnixNanos(info.getStartedAt()));
            case EGRESS_ENDING -> recording.markProcessing();
            case EGRESS_COMPLETE -> complete(recording, info);
            case EGRESS_FAILED, EGRESS_ABORTED, EGRESS_LIMIT_REACHED ->
                    recording.markFailed(failureCode(info), info.getError(),
                            fromUnixNanos(info.getEndedAt()));
            case UNRECOGNIZED -> recording.markFailed(
                    "EGRESS_STATUS_UNRECOGNIZED", "알 수 없는 Egress 상태입니다.",
                    LocalDateTime.now(clock));
        }
    }

    private void publishCapacityReleaseIfTerminal(Recording recording) {
        if (recording.isTerminal()) {
            eventPublisher.publishEvent(
                    new RecordingEgressEvent.CapacityReleaseRequested(recording.getId()));
        }
    }

    private void complete(Recording recording, LivekitEgress.EgressInfo info) {
        LocalDateTime endedAt = fromUnixNanos(info.getEndedAt());
        if (endedAt == null) {
            endedAt = LocalDateTime.now(clock);
        }
        recording.markEgressEnded(endedAt);

        LivekitEgress.FileInfo output = info.getFileResultsList().stream()
                .filter(file -> matchesExpectedOutput(file, recording.getStorageKey()))
                .findFirst()
                .orElse(null);
        if (output == null) {
            recording.markFailed("EGRESS_OUTPUT_MISMATCH",
                    "Egress result does not contain the expected output file.", endedAt);
            return;
        }
        if (!fileStorage.exists(recording.getStorageKey())) {
            recording.markFailed("EGRESS_OUTPUT_MISSING",
                    "Egress completed but the output file is missing.", endedAt);
            return;
        }

        long actualSize = fileStorage.size(recording.getStorageKey());
        if (actualSize <= 0) {
            recording.markFailed("EGRESS_OUTPUT_EMPTY",
                    "Egress output file is empty.", endedAt);
            return;
        }
        recording.markAvailable(actualSize, durationSeconds(output.getDuration()),
                endedAt, endedAt.plusDays(storageProperties.retentionDays()));
    }

    private boolean matchesExpectedOutput(LivekitEgress.FileInfo file, String storageKey) {
        String root = normalizePath(egressProperties.outputRoot());
        String expected = root.endsWith("/") ? root + storageKey : root + "/" + storageKey;
        String filename = normalizePath(file.getFilename());
        String location = normalizePath(file.getLocation());
        return expected.equals(filename) || expected.equals(location);
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

    private Integer durationSeconds(long durationNanos) {
        if (durationNanos <= 0) {
            return null;
        }
        long roundedUp = durationNanos / NANOS_PER_SECOND
                + (durationNanos % NANOS_PER_SECOND == 0 ? 0 : 1);
        return (int) Math.min(roundedUp, Integer.MAX_VALUE);
    }

    private String failureCode(LivekitEgress.EgressInfo info) {
        if (info.getErrorCode() != 0) {
            return "LIVEKIT_" + info.getErrorCode();
        }
        return info.getStatus().name();
    }

    private LocalDateTime fromUnixNanos(long value) {
        if (value <= 0) {
            return null;
        }
        long seconds = value / NANOS_PER_SECOND;
        int nanos = (int) (value % NANOS_PER_SECOND);
        return LocalDateTime.ofInstant(Instant.ofEpochSecond(seconds, nanos), clock.getZone());
    }

    public record StartContext(Long recordingId, String roomName, String storageKey) {
    }

    public record StopContext(Long recordingId, String egressId) {
    }

    public record RecoveryContext(Long recordingId, String egressId, String roomName,
                                  String storageKey, RecordingStatus status,
                                  LocalDateTime requestedAt) {
    }

    public record ApplyResult(boolean applied, boolean stopImmediately, String egressId) {
        static ApplyResult ignored() {
            return new ApplyResult(false, false, null);
        }
    }
}
