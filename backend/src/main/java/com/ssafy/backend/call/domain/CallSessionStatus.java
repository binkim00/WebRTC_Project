package com.ssafy.backend.call.domain;

/**
 * 영상통화 세션의 연결 상태다.
 */
public enum CallSessionStatus {
    CONNECTING,
    ACTIVE,
    ENDED,
    FAILED
}
