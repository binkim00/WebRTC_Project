package com.ssafy.backend.recording.domain;

import com.ssafy.backend.call.domain.CallSession;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RecordingEgressStateTest {

    private static final LocalDateTime REQUESTED_AT =
            LocalDateTime.of(2026, 8, 4, 11, 0);

    /** Egress 녹화가 사전 경로와 Room을 가진 STARTING 상태로 생성되는지 검증한다. */
    @Test
    void createsStartingRecording() {
        Recording recording = startingRecording();

        assertThat(recording.getSource()).isEqualTo(RecordingSource.LIVEKIT_EGRESS);
        assertThat(recording.getStatus()).isEqualTo(RecordingStatus.STARTING);
        assertThat(recording.getRoomName()).isEqualTo("meeting-room-1");
        assertThat(recording.getStorageKey()).isEqualTo("egress/2026/08/04/file.mp4");
        assertThat(recording.getContentType()).isEqualTo("video/mp4");
        assertThat(recording.getRequestedAt()).isEqualTo(REQUESTED_AT);
    }

    /** 시작·종료 webhook이 순서대로 와도 상태가 역행하지 않는지 검증한다. */
    @Test
    void followsMonotonicEgressTransitions() {
        Recording recording = startingRecording();
        LocalDateTime startedAt = REQUESTED_AT.plusSeconds(2);
        LocalDateTime endedAt = REQUESTED_AT.plusMinutes(1);

        recording.assignEgressId("EG_test");
        recording.markRecording(startedAt);
        recording.markProcessing();
        recording.markRecording(startedAt.plusSeconds(1));
        recording.markEgressEnded(endedAt);

        assertThat(recording.getEgressId()).isEqualTo("EG_test");
        assertThat(recording.getStatus()).isEqualTo(RecordingStatus.PROCESSING);
        assertThat(recording.getEgressStartedAt()).isEqualTo(startedAt);
        assertThat(recording.getEgressEndedAt()).isEqualTo(endedAt);
    }

    /** 실패가 확정된 뒤 늦은 active 이벤트가 상태를 되돌리지 않는지 검증한다. */
    @Test
    void ignoresLateActiveAfterFailure() {
        Recording recording = startingRecording();
        recording.markFailed("EGRESS_FAILED", "renderer failed", REQUESTED_AT.plusSeconds(5));

        recording.markRecording(REQUESTED_AT.plusSeconds(6));

        assertThat(recording.getStatus()).isEqualTo(RecordingStatus.FAILED);
        assertThat(recording.getFailureCode()).isEqualTo("EGRESS_FAILED");
    }

    private Recording startingRecording() {
        CallSession callSession = mock(CallSession.class);
        when(callSession.getRoomId()).thenReturn("meeting-room-1");
        return Recording.createEgressStarting(
                callSession,
                "call-1.mp4",
                "egress/2026/08/04/file.mp4",
                REQUESTED_AT
        );
    }
}
