package com.ssafy.backend.call.domain;

/**
 * 영상통화가 종료된 이유다.
 */
public enum CallEndReason {
    NORMAL,
    TIMEOUT,
    FORCED,
    CONNECTION_FAILED,
    FAN_LEFT,
    INFLUENCER_LEFT
}
