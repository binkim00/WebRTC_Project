package com.ssafy.backend.recording.domain;

/**
 * 녹화 파일의 생성 및 제공 상태다.
 */
public enum RecordingStatus {
    RECORDING,
    PROCESSING,
    AVAILABLE,
    FAILED,
    DELETED
}
