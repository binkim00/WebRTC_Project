package com.ssafy.backend.livekit.service;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/** 동일 팬미팅 Room에 AI Agent가 중복 배치되지 않도록 Redis 선점 상태를 관리한다. */
@Component
public class LiveKitAgentDispatchStore {

    private static final Duration DISPATCH_MARKER_TTL = Duration.ofHours(12);
    private static final String KEY_PREFIX = "livekit:agent-dispatch:";

    private final StringRedisTemplate redisTemplate;

    /**
     * Redis 클라이언트를 주입받아 Agent 배치 상태 저장소를 구성한다.
     *
     * @param redisTemplate 문자열 기반 Redis 클라이언트
     */
    public LiveKitAgentDispatchStore(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * 해당 Room의 Agent 배치 권한을 원자적으로 선점한다.
     *
     * @param roomName LiveKit Room 이름
     * @return 최초 선점에 성공하면 {@code true}
     */
    public boolean claim(String roomName) {
        return Boolean.TRUE.equals(redisTemplate.opsForValue().setIfAbsent(
                key(roomName),
                "1",
                DISPATCH_MARKER_TTL
        ));
    }

    /**
     * Agent 배치가 실패한 Room의 선점 상태를 제거해 다음 요청에서 재시도할 수 있게 한다.
     *
     * @param roomName LiveKit Room 이름
     */
    public void release(String roomName) {
        redisTemplate.delete(key(roomName));
    }

    /**
     * Room 이름에 대응하는 Redis 키를 생성한다.
     *
     * @param roomName LiveKit Room 이름
     * @return Agent 배치 선점 Redis 키
     */
    private String key(String roomName) {
        return KEY_PREFIX + roomName;
    }
}
