package com.ssafy.backend.recording.egress;

/** DB 커밋 뒤에 외부 Egress API를 호출하기 위한 내부 이벤트다. */
public sealed interface RecordingEgressEvent {

    Long recordingId();

    record StartRequested(Long recordingId) implements RecordingEgressEvent {
    }

    record StopRequested(Long recordingId) implements RecordingEgressEvent {
    }
}
