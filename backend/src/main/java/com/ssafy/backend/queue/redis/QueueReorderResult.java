package com.ssafy.backend.queue.redis;

/** Redis에서 대기 순번 재정렬을 시도한 결과다. */
public enum QueueReorderResult {
    REORDERED,
    NOT_INITIALIZED,
    ENTRY_MISSING,
    STATE_CONFLICT
}
