package com.ssafy.backend.recording.egress;

import com.ssafy.backend.recording.config.RecordingEgressProperties;
import livekit.LivekitEgress;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;

class RecordingEgressRunnerTest {

    private LiveKitEgressClient client;
    private RecordingEgressStateService stateService;
    private RecordingEgressCapacityGuard capacityGuard;
    private RecordingEgressRunner runner;

    @BeforeEach
    void setUp() {
        client = mock(LiveKitEgressClient.class);
        stateService = mock(RecordingEgressStateService.class);
        capacityGuard = mock(RecordingEgressCapacityGuard.class);
        when(capacityGuard.claimOrRenew(10L)).thenReturn(true);
        runner = new RecordingEgressRunner(client, stateService,
                properties(), capacityGuard);
    }

    /** 시작 응답 전에 통화가 끝났다면 ID 수신 직후 같은 Egress를 중지하는지 검증한다. */
    @Test
    void stopsImmediatelyWhenCallEndedDuringStart() {
        var context = new RecordingEgressStateService.StartContext(
                10L, "room-1", "egress/2026/08/04/a.mp4");
        var info = LivekitEgress.EgressInfo.newBuilder()
                .setEgressId("EG_1")
                .setStatus(LivekitEgress.EgressStatus.EGRESS_STARTING)
                .build();
        when(stateService.getStartContext(10L)).thenReturn(context);
        when(client.startRoomComposite("room-1", "/out/egress/2026/08/04/a.mp4", "grid"))
                .thenReturn(info);
        when(stateService.applyApiResult(10L, info)).thenReturn(
                new RecordingEgressStateService.ApplyResult(true, true, "EG_1"));
        when(client.stop("EG_1")).thenReturn(info);

        runner.start(new RecordingEgressEvent.StartRequested(10L));

        verify(client).stop("EG_1");
        verify(stateService, times(2)).applyApiResult(10L, info);
    }

    /** 시작 RPC 실패가 예외로 통화를 깨뜨리지 않고 녹화 실패로 저장되는지 검증한다. */
    @Test
    void storesStartFailure() {
        var context = new RecordingEgressStateService.StartContext(
                10L, "room-1", "egress/2026/08/04/a.mp4");
        when(stateService.getStartContext(10L)).thenReturn(context);
        when(client.startRoomComposite("room-1", "/out/egress/2026/08/04/a.mp4", "grid"))
                .thenThrow(new RecordingEgressException("EGRESS_START_REJECTED", "rejected"));

        runner.start(new RecordingEgressEvent.StartRequested(10L));

        verify(stateService).failStart(10L, "EGRESS_START_REJECTED", "rejected");
    }

    @Test
    void rejectsSecondRecordingWhenCapacityIsFull() {
        var context = new RecordingEgressStateService.StartContext(
                10L, "room-1", "egress/2026/08/04/a.mp4");
        when(stateService.getStartContext(10L)).thenReturn(context);
        when(capacityGuard.claimOrRenew(10L)).thenReturn(false);

        runner.start(new RecordingEgressEvent.StartRequested(10L));

        verify(stateService).failStart(10L, "EGRESS_CONCURRENCY_LIMIT",
                "No Egress capacity slot is available.");
        verify(client, times(0)).startRoomComposite(
                "room-1", "/out/egress/2026/08/04/a.mp4", "grid");
    }

    private RecordingEgressProperties properties() {
        return new RecordingEgressProperties(true, "/out/", "grid",
                1, 7200, 30000, 60, 20);
    }
}
