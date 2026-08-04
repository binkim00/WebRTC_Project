package com.ssafy.backend.recording.egress;

import com.ssafy.backend.recording.config.RecordingEgressProperties;
import com.ssafy.backend.recording.domain.RecordingStatus;
import com.ssafy.backend.recording.repository.RecordingRepository;
import livekit.LivekitEgress;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RecordingEgressRecoveryServiceTest {

    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-08-04T02:00:00Z"), ZoneId.of("Asia/Seoul"));

    private RecordingEgressStateService stateService;
    private LiveKitEgressClient client;
    private RecordingEgressCapacityGuard capacityGuard;
    private RecordingEgressRecoveryService service;

    @BeforeEach
    void setUp() {
        stateService = mock(RecordingEgressStateService.class);
        client = mock(LiveKitEgressClient.class);
        capacityGuard = mock(RecordingEgressCapacityGuard.class);
        service = new RecordingEgressRecoveryService(
                mock(RecordingRepository.class), stateService, client, capacityGuard,
                properties(), CLOCK);
    }

    @Test
    void retriesStopWhenStopResponseOrWebhookWasLost() {
        var context = context("EG_1", RecordingStatus.PROCESSING);
        var active = info("EG_1", LivekitEgress.EgressStatus.EGRESS_ACTIVE);
        var ending = info("EG_1", LivekitEgress.EgressStatus.EGRESS_ENDING);
        when(stateService.getRecoveryContext(10L)).thenReturn(context);
        when(capacityGuard.claimOrRenew(10L)).thenReturn(true);
        when(client.listByEgressId("EG_1")).thenReturn(List.of(active));
        when(stateService.applyApiResult(10L, active)).thenReturn(
                new RecordingEgressStateService.ApplyResult(true, true, "EG_1"));
        when(client.stop("EG_1")).thenReturn(ending);

        service.recoverOne(10L);

        verify(stateService).prepareRecoveryStop(10L);
        verify(client).stop("EG_1");
        verify(stateService).applyApiResult(10L, ending);
    }

    @Test
    void reconnectsLostStartResponseUsingRoomLookup() {
        var context = context(null, RecordingStatus.STARTING);
        var active = LivekitEgress.EgressInfo.newBuilder()
                .setEgressId("EG_recovered")
                .setRoomName("room-1")
                .setStartedAt(Instant.parse("2026-08-04T02:00:02Z").toEpochMilli()
                        * 1_000_000L)
                .setStatus(LivekitEgress.EgressStatus.EGRESS_ACTIVE)
                .build();
        when(stateService.getRecoveryContext(10L)).thenReturn(context);
        when(capacityGuard.claimOrRenew(10L)).thenReturn(true);
        when(client.listByRoom("room-1")).thenReturn(List.of(active));
        when(stateService.applyApiResult(10L, active)).thenReturn(
                new RecordingEgressStateService.ApplyResult(true, false, "EG_recovered"));

        service.recoverOne(10L);

        verify(stateService).applyApiResult(10L, active);
        verify(client, never()).stop("EG_recovered");
    }

    @Test
    void failsStaleRowWhenLiveKitHasNoMatchingJob() {
        when(stateService.getRecoveryContext(10L))
                .thenReturn(context("EG_missing", RecordingStatus.RECORDING));
        when(capacityGuard.claimOrRenew(10L)).thenReturn(true);
        when(client.listByEgressId("EG_missing")).thenReturn(List.of());

        service.recoverOne(10L);

        verify(stateService).failRecovery(10L, "EGRESS_RECOVERY_NOT_FOUND",
                "No matching Egress job was found during recovery.");
    }

    @Test
    void stopsRecoveredJobWhenCapacityLeaseIsOwnedByAnotherRecording() {
        var context = context("EG_conflict", RecordingStatus.RECORDING);
        var active = info("EG_conflict", LivekitEgress.EgressStatus.EGRESS_ACTIVE);
        var ending = info("EG_conflict", LivekitEgress.EgressStatus.EGRESS_ENDING);
        when(stateService.getRecoveryContext(10L)).thenReturn(context);
        when(capacityGuard.claimOrRenew(10L)).thenReturn(false);
        when(client.listByEgressId("EG_conflict")).thenReturn(List.of(active));
        when(stateService.applyApiResult(10L, active)).thenReturn(
                new RecordingEgressStateService.ApplyResult(true, true, "EG_conflict"));
        when(client.stop("EG_conflict")).thenReturn(ending);

        service.recoverOne(10L);

        verify(stateService).prepareRecoveryStop(10L);
        verify(client).stop("EG_conflict");
    }

    private RecordingEgressStateService.RecoveryContext context(
            String egressId, RecordingStatus status) {
        return new RecordingEgressStateService.RecoveryContext(
                10L, egressId, "room-1", "egress/2026/08/04/a.mp4", status,
                LocalDateTime.of(2026, 8, 4, 11, 0));
    }

    private LivekitEgress.EgressInfo info(
            String egressId, LivekitEgress.EgressStatus status) {
        return LivekitEgress.EgressInfo.newBuilder()
                .setEgressId(egressId)
                .setStatus(status)
                .build();
    }

    private RecordingEgressProperties properties() {
        return new RecordingEgressProperties(true, "/out", "grid",
                1, 7200, 30000, 60, 20);
    }
}
