package com.ssafy.backend.queue.redis;

/** Redis에서 지정 참가자 호출 선점을 시도한 결과다. */
public enum QueueClaimResult {
    CLAIMED,
    ACTIVE_CALL,
    STATE_CONFLICT
}
