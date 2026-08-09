package com.ssafy.backend.auth.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

/**
 * 비밀번호 재설정 메일 발송 빈도를 Redis에서 제한한다.
 *
 * <p>이 요청은 로그인 없이 이메일만으로 보낼 수 있어, 막지 않으면 남의 메일함으로 재설정 메일을
 * 계속 보낼 수 있다. 사용자 식별자 대신 요청에 담긴 이메일을 기준으로 제한한다.
 *
 * <p>키에는 이메일 원문 대신 해시를 넣는다. Redis 키 목록만 보고 가입 여부를 알 수 없어야 한다.
 */
@Component
public class PasswordResetRateLimiter {

    private static final String COOLDOWN_KEY_PREFIX = "auth:password-reset:cooldown:";
    private static final String SEND_COUNT_KEY_PREFIX = "auth:password-reset:send-count:";

    private final StringRedisTemplate redisTemplate;
    private final Duration resendCooldown;
    private final int maxSendPerWindow;
    private final Duration sendWindow;

    /**
     * Redis 접근 객체와 발송 빈도 제한 정책을 주입받는다.
     *
     * @param redisTemplate 제한 카운터를 저장할 Redis 접근 객체
     * @param resendCooldownSeconds 같은 이메일의 재요청 최소 간격(초)
     * @param maxSendPerWindow 집계 구간 안에서 허용할 최대 발송 횟수
     * @param sendWindowSeconds 발송 횟수를 집계할 구간(초)
     * @throws IllegalArgumentException 정책 값이 1보다 작은 경우
     */
    public PasswordResetRateLimiter(
            StringRedisTemplate redisTemplate,
            @Value("${app.password-reset.resend-cooldown-seconds:60}") long resendCooldownSeconds,
            @Value("${app.password-reset.max-send-per-window:5}") int maxSendPerWindow,
            @Value("${app.password-reset.send-window-seconds:3600}") long sendWindowSeconds
    ) {
        if (resendCooldownSeconds < 1 || maxSendPerWindow < 1 || sendWindowSeconds < 1) {
            throw new IllegalArgumentException("Password reset rate limit values must be positive.");
        }
        this.redisTemplate = redisTemplate;
        this.resendCooldown = Duration.ofSeconds(resendCooldownSeconds);
        this.maxSendPerWindow = maxSendPerWindow;
        this.sendWindow = Duration.ofSeconds(sendWindowSeconds);
    }

    /** 같은 이메일의 재요청 최소 간격을 반환한다. */
    public Duration resendCooldown() {
        return resendCooldown;
    }

    /**
     * 지금 이 이메일로 재설정 메일을 보낼 수 있는지 확인한다.
     *
     * @param email 요청에 담긴 정규화된 이메일
     * @return 재요청 간격과 구간 상한을 모두 만족하면 {@code true}
     */
    public boolean canSend(String email) {
        String hashed = hash(email);
        if (Boolean.TRUE.equals(redisTemplate.hasKey(COOLDOWN_KEY_PREFIX + hashed))) {
            return false;
        }
        String sent = redisTemplate.opsForValue().get(SEND_COUNT_KEY_PREFIX + hashed);
        return sent == null || parseCount(sent) < maxSendPerWindow;
    }

    /**
     * 발송을 기록해 재요청 대기와 구간 카운터를 갱신한다.
     *
     * @param email 발송한 이메일
     */
    public void recordSend(String email) {
        String hashed = hash(email);
        redisTemplate.opsForValue().set(COOLDOWN_KEY_PREFIX + hashed, "1", resendCooldown);
        String countKey = SEND_COUNT_KEY_PREFIX + hashed;
        Long sent = redisTemplate.opsForValue().increment(countKey);
        if (sent != null && sent == 1L) {
            // 구간의 첫 발송에만 TTL을 걸어 고정 구간 방식으로 집계한다.
            redisTemplate.expire(countKey, sendWindow);
        }
    }

    /**
     * 재설정을 마친 이메일의 제한 카운터를 정리한다.
     *
     * @param email 재설정을 마친 이메일
     */
    public void clear(String email) {
        String hashed = hash(email);
        redisTemplate.delete(COOLDOWN_KEY_PREFIX + hashed);
        redisTemplate.delete(SEND_COUNT_KEY_PREFIX + hashed);
    }

    /** 이메일 원문이 키에 남지 않도록 SHA-256 해시로 바꾼다. */
    private String hash(String email) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(email.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available.", exception);
        }
    }

    /** 손상된 카운터 값은 상한에 도달한 것으로 보아 보수적으로 차단한다. */
    private long parseCount(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return Long.MAX_VALUE;
        }
    }
}
