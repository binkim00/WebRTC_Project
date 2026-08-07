package com.ssafy.backend.recording.egress;

/** LiveKit Egress 관리 API 호출 실패를 내부 실패 코드와 함께 전달한다. */
public class RecordingEgressException extends RuntimeException {

    private final String failureCode;

    public RecordingEgressException(String failureCode, String message) {
        super(message);
        this.failureCode = failureCode;
    }

    public RecordingEgressException(String failureCode, String message, Throwable cause) {
        super(message, cause);
        this.failureCode = failureCode;
    }

    public String getFailureCode() {
        return failureCode;
    }
}
