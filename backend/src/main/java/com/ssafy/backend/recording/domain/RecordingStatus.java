package com.ssafy.backend.recording.domain;

/**
 * 녹화 파일의 생성 및 제공 상태다.
 */
public enum RecordingStatus {
    STARTING,
    RECORDING,
    PROCESSING,
    AVAILABLE,
    FAILED,
    DELETED,

    /**
     * 보관 기간이 지나 실제 파일이 삭제된 상태다.
     *
     * <p>운영자가 직접 지운 {@link #DELETED}와 구분해, 만료 스케줄러가 자동으로 정리한 건임을 남긴다.
     * {@code status} 컬럼은 문자열이라 값 추가만으로 저장할 수 있고 스키마 변경이 필요하지 않다.
     */
    EXPIRED
}
