package com.ssafy.backend.recording.egress;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.recording.domain.RecordingStatus;
import com.ssafy.backend.recording.config.RecordingEgressProperties;
import com.ssafy.backend.recording.config.RecordingStorageProperties;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.recording.storage.RecordingFileStorage;
import livekit.LivekitEgress;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecordingEgressStateServiceTest {

    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-04T02:00:00Z"), ZoneId.of("Asia/Seoul"));
    private RecordingRepository repository;
    private RecordingFileStorage fileStorage;
    private RecordingEgressStateService service;

    @BeforeEach
    void setUp() {
        repository = mock(RecordingRepository.class);
        fileStorage = mock(RecordingFileStorage.class);
        service = new RecordingEgressStateService(
                repository,
                fileStorage,
                new RecordingStorageProperties("build/test-recordings", 7, 600, 600_000,
                        2_147_483_648L),
                new RecordingEgressProperties(true, "/out", "grid"),
                CLOCK);
    }

    /** EGRESS_ACTIVE 응답이 ID와 실제 시작 시각을 기록하는지 검증한다. */
    @Test
    void appliesActiveStatus() {
        Recording recording = startingRecording();
        when(repository.findByIdForUpdate(10L)).thenReturn(Optional.of(recording));
        long startedAt = Instant.parse("2026-08-04T02:00:03Z").toEpochMilli()
                * 1_000_000L;
        LivekitEgress.EgressInfo info = LivekitEgress.EgressInfo.newBuilder()
                .setEgressId("EG_active")
                .setStatus(LivekitEgress.EgressStatus.EGRESS_ACTIVE)
                .setStartedAt(startedAt)
                .build();

        service.applyApiResult(10L, info);

        assertThat(recording.getStatus()).isEqualTo(RecordingStatus.RECORDING);
        assertThat(recording.getEgressId()).isEqualTo("EG_active");
        assertThat(recording.getEgressStartedAt())
                .isEqualTo(LocalDateTime.of(2026, 8, 4, 11, 0, 3));
    }

    /** EGRESS_LIMIT_REACHED가 통화와 별개인 녹화 실패로 저장되는지 검증한다. */
    @Test
    void appliesCapacityFailure() {
        Recording recording = startingRecording();
        when(repository.findByEgressIdForUpdate("EG_limit"))
                .thenReturn(Optional.of(recording));
        recording.assignEgressId("EG_limit");
        LivekitEgress.EgressInfo info = LivekitEgress.EgressInfo.newBuilder()
                .setEgressId("EG_limit")
                .setStatus(LivekitEgress.EgressStatus.EGRESS_LIMIT_REACHED)
                .setError("no resource available")
                .build();

        service.applyWebhook(info);

        assertThat(recording.getStatus()).isEqualTo(RecordingStatus.FAILED);
        assertThat(recording.getFailureCode()).isEqualTo("EGRESS_LIMIT_REACHED");
        assertThat(recording.getFailureMessage()).isEqualTo("no resource available");
    }

    /** 통화가 먼저 끝난 PROCESSING 행도 시작 후 즉시 중지할 수 있게 컨텍스트를 반환한다. */
    @Test
    void returnsStartContextWhenStopWasRequestedBeforeEgressId() {
        Recording recording = startingRecording();
        recording.markProcessing();
        when(repository.findById(10L)).thenReturn(Optional.of(recording));

        RecordingEgressStateService.StartContext context = service.getStartContext(10L);

        assertThat(context).isNotNull();
        assertThat(context.roomName()).isEqualTo("meeting-room-1");
        assertThat(context.storageKey()).isEqualTo("egress/2026/08/04/file.mp4");
    }

    @Test
    void completesOnlyAfterExpectedFileExists() {
        Recording recording = startingRecording();
        recording.assignEgressId("EG_complete");
        when(repository.findByEgressIdForUpdate("EG_complete"))
                .thenReturn(Optional.of(recording));
        when(fileStorage.exists(recording.getStorageKey())).thenReturn(true);
        when(fileStorage.size(recording.getStorageKey())).thenReturn(12_345L);
        long endedAt = Instant.parse("2026-08-04T02:01:00Z").toEpochMilli() * 1_000_000L;
        LivekitEgress.EgressInfo info = LivekitEgress.EgressInfo.newBuilder()
                .setEgressId("EG_complete")
                .setStatus(LivekitEgress.EgressStatus.EGRESS_COMPLETE)
                .setEndedAt(endedAt)
                .addFileResults(LivekitEgress.FileInfo.newBuilder()
                        .setFilename("/out/egress/2026/08/04/file.mp4")
                        .setDuration(42_100_000_000L)
                        .setSize(12_345L))
                .build();

        service.applyWebhook(info);

        assertThat(recording.getStatus()).isEqualTo(RecordingStatus.AVAILABLE);
        assertThat(recording.getFileSizeBytes()).isEqualTo(12_345L);
        assertThat(recording.getDurationSec()).isEqualTo(43);
        assertThat(recording.getCompletedAt())
                .isEqualTo(LocalDateTime.of(2026, 8, 4, 11, 1));
        assertThat(recording.getAvailableUntil())
                .isEqualTo(LocalDateTime.of(2026, 8, 11, 11, 1));
        assertThat(recording.isPlayableAt(LocalDateTime.of(2026, 8, 4, 12, 0))).isTrue();
    }

    @Test
    void failsWhenCompletedOutputIsMissing() {
        Recording recording = startingRecording();
        recording.assignEgressId("EG_missing");
        when(repository.findByEgressIdForUpdate("EG_missing"))
                .thenReturn(Optional.of(recording));
        when(fileStorage.exists(recording.getStorageKey())).thenReturn(false);
        LivekitEgress.EgressInfo info = LivekitEgress.EgressInfo.newBuilder()
                .setEgressId("EG_missing")
                .setStatus(LivekitEgress.EgressStatus.EGRESS_COMPLETE)
                .addFileResults(LivekitEgress.FileInfo.newBuilder()
                        .setFilename("/out/egress/2026/08/04/file.mp4"))
                .build();

        service.applyWebhook(info);

        assertThat(recording.getStatus()).isEqualTo(RecordingStatus.FAILED);
        assertThat(recording.getFailureCode()).isEqualTo("EGRESS_OUTPUT_MISSING");
    }

    @Test
    void failsWhenCompletedOutputPathDoesNotMatchStorageKey() {
        Recording recording = startingRecording();
        recording.assignEgressId("EG_wrong_path");
        when(repository.findByEgressIdForUpdate("EG_wrong_path"))
                .thenReturn(Optional.of(recording));
        LivekitEgress.EgressInfo info = LivekitEgress.EgressInfo.newBuilder()
                .setEgressId("EG_wrong_path")
                .setStatus(LivekitEgress.EgressStatus.EGRESS_COMPLETE)
                .addFileResults(LivekitEgress.FileInfo.newBuilder()
                        .setFilename("/out/other/file.mp4"))
                .build();

        service.applyWebhook(info);

        assertThat(recording.getStatus()).isEqualTo(RecordingStatus.FAILED);
        assertThat(recording.getFailureCode()).isEqualTo("EGRESS_OUTPUT_MISMATCH");
    }

    private Recording startingRecording() {
        CallSession callSession = mock(CallSession.class);
        when(callSession.getRoomId()).thenReturn("meeting-room-1");
        return Recording.createEgressStarting(callSession, "call-1.mp4",
                "egress/2026/08/04/file.mp4", LocalDateTime.of(2026, 8, 4, 11, 0));
    }
}
