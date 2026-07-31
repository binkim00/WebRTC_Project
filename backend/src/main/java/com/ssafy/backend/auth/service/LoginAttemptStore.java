package com.ssafy.backend.auth.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

/** 로그인 ID별 인증 실패 횟수와 임시 차단 시간을 Redis에서 관리한다. */
@Component
public class LoginAttemptStore {
    private static final String KEY_PREFIX = "auth:login-failure:";

    private final StringRedisTemplate redisTemplate;
    private final int maxFailures;
    private final Duration blockDuration;

    /**
     * Redis 접근 객체와 로그인 실패 차단 정책을 주입받는다.
     *
     * @param redisTemplate 로그인 실패 횟수를 저장할 Redis 접근 객체
     * @param maxFailures 임시 차단을 시작할 최대 실패 횟수
     * @param blockDurationSeconds 실패 횟수를 유지할 시간(초)
     * @throws IllegalArgumentException 차단 기준 또는 시간이 1보다 작은 경우
     */
    public LoginAttemptStore(
            StringRedisTemplate redisTemplate,
            @Value("${app.auth.login-max-failures:5}") int maxFailures,
            @Value("${app.auth.login-block-duration:900}") long blockDurationSeconds) {
        if (maxFailures < 1 || blockDurationSeconds < 1) {
            throw new IllegalArgumentException("Login failure policy values must be positive.");
        }
        this.redisTemplate = redisTemplate;
        this.maxFailures = maxFailures;
        this.blockDuration = Duration.ofSeconds(blockDurationSeconds);
    }

    /**
     * 로그인 ID가 현재 임시 차단 기준에 도달했는지 확인한다.
     *
     * @param loginId 정규화된 로그인 ID
     * @return 임시 차단 상태이면 true
     */
    public boolean isBlocked(String loginId) {
        String value = redisTemplate.opsForValue().get(key(loginId));
        if (value == null) {
            return false;
        }
        try {
            return Long.parseLong(value) >= maxFailures;
        } catch (NumberFormatException exception) {
            return true;
        }
    }

    /**
     * 로그인 실패 횟수를 증가시키고 차단 기준 도달 여부를 반환한다.
     *
     * @param loginId 정규화된 로그인 ID
     * @return 이번 실패로 임시 차단 상태가 되었으면 true
     */
    public boolean recordFailure(String loginId) {
        String key = key(loginId);
        Long failures = redisTemplate.opsForValue().increment(key);
        if (failures != null && (failures == 1L || failures == maxFailures)) {
            redisTemplate.expire(key, blockDuration);
        }
        return failures == null || failures >= maxFailures;
    }

    /**
     * 로그인 성공 후 누적된 실패 횟수를 삭제한다.
     *
     * @param loginId 정규화된 로그인 ID
     */
    public void clear(String loginId) {
        redisTemplate.delete(key(loginId));
    }

    /** 로그인 ID 원문을 노출하지 않는 Redis 키를 생성한다. */
    private String key(String loginId) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(loginId.getBytes(StandardCharsets.UTF_8));
            return KEY_PREFIX + HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available.", exception);
        }
    }
}
