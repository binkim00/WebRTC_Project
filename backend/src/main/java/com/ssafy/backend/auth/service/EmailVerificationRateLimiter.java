package com.ssafy.backend.auth.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 인증 메일 발송과 토큰 확인 시도의 빈도를 Redis에서 제한한다.
 *
 * <p>메일 발송은 비용과 스팸 신고로 이어지고, 토큰 확인은 무차별 대입 통로가 되므로
 * 사용자 단위로 재발송 간격, 시간당 발송 상한, 연속 실패 상한을 함께 건다.
 */
@Component
public class EmailVerificationRateLimiter {

    private static final String COOLDOWN_KEY_PREFIX = "auth:email-verify:cooldown:";
    private static final String SEND_COUNT_KEY_PREFIX = "auth:email-verify:send-count:";
    private static final String CONFIRM_FAILURE_KEY_PREFIX = "auth:email-verify:confirm-failure:";

    private final StringRedisTemplate redisTemplate;
    private final Duration resendCooldown;
    private final int maxSendPerWindow;
    private final Duration sendWindow;
    private final int maxConfirmFailures;
    private final Duration confirmFailureWindow;

    /**
     * Redis 접근 객체와 인증 메일 빈도 제한 정책을 주입받는다.
     *
     * @param redisTemplate 제한 카운터를 저장할 Redis 접근 객체
     * @param resendCooldownSeconds 같은 사용자의 재발송 최소 간격(초)
     * @param maxSendPerWindow 집계 구간 안에서 허용할 최대 발송 횟수
     * @param sendWindowSeconds 발송 횟수를 집계할 구간(초)
     * @param maxConfirmFailures 집계 구간 안에서 허용할 최대 확인 실패 횟수
     * @param confirmFailureWindowSeconds 확인 실패를 집계할 구간(초)
     * @throws IllegalArgumentException 정책 값이 1보다 작은 경우
     */
    public EmailVerificationRateLimiter(
            StringRedisTemplate redisTemplate,
            @Value("${app.email-verification.resend-cooldown-seconds:60}") long resendCooldownSeconds,
            @Value("${app.email-verification.max-send-per-window:5}") int maxSendPerWindow,
            @Value("${app.email-verification.send-window-seconds:3600}") long sendWindowSeconds,
            @Value("${app.email-verification.max-confirm-failures:10}") int maxConfirmFailures,
            @Value("${app.email-verification.confirm-failure-window-seconds:600}")
            long confirmFailureWindowSeconds
    ) {
        if (resendCooldownSeconds < 1 || maxSendPerWindow < 1 || sendWindowSeconds < 1
                || maxConfirmFailures < 1 || confirmFailureWindowSeconds < 1) {
            throw new IllegalArgumentException("Email verification rate limit values must be positive.");
        }
        this.redisTemplate = redisTemplate;
        this.resendCooldown = Duration.ofSeconds(resendCooldownSeconds);
        this.maxSendPerWindow = maxSendPerWindow;
        this.sendWindow = Duration.ofSeconds(sendWindowSeconds);
        this.maxConfirmFailures = maxConfirmFailures;
        this.confirmFailureWindow = Duration.ofSeconds(confirmFailureWindowSeconds);
    }

    /** 같은 사용자의 재발송 최소 간격을 반환한다. */
    public Duration resendCooldown() {
        return resendCooldown;
    }

    /**
     * 재발송 간격과 구간별 발송 상한을 모두 만족하는지 확인한다.
     *
     * @param userId 발송을 요청한 사용자 식별자
     * @return 지금 발송할 수 있으면 {@code true}
     */
    public boolean canSend(Long userId) {
        if (Boolean.TRUE.equals(redisTemplate.hasKey(COOLDOWN_KEY_PREFIX + userId))) {
            return false;
        }
        String sent = redisTemplate.opsForValue().get(SEND_COUNT_KEY_PREFIX + userId);
        return sent == null || parseCount(sent) < maxSendPerWindow;
    }

    /**
     * 발송 성공을 기록해 재발송 대기와 구간 카운터를 갱신한다.
     *
     * @param userId 발송한 사용자 식별자
     */
    public void recordSend(Long userId) {
        redisTemplate.opsForValue().set(COOLDOWN_KEY_PREFIX + userId, "1", resendCooldown);
        String countKey = SEND_COUNT_KEY_PREFIX + userId;
        Long sent = redisTemplate.opsForValue().increment(countKey);
        if (sent != null && sent == 1L) {
            // 구간의 첫 발송에만 TTL을 걸어 고정 구간 방식으로 집계한다.
            redisTemplate.expire(countKey, sendWindow);
        }
    }

    /**
     * 다음 재발송이 가능한 시각까지 남은 시간을 반환한다.
     *
     * @param userId 조회할 사용자 식별자
     * @return 남은 대기 시간이며 대기 중이 아니면 {@link Duration#ZERO}
     */
    public Duration remainingCooldown(Long userId) {
        Long seconds = redisTemplate.getExpire(COOLDOWN_KEY_PREFIX + userId);
        return seconds == null || seconds <= 0 ? Duration.ZERO : Duration.ofSeconds(seconds);
    }

    /**
     * 토큰 확인 시도가 연속 실패 상한에 도달했는지 확인한다.
     *
     * @param userId 확인을 요청한 사용자 식별자
     * @return 아직 시도할 수 있으면 {@code true}
     */
    public boolean canConfirm(Long userId) {
        String failures = redisTemplate.opsForValue().get(CONFIRM_FAILURE_KEY_PREFIX + userId);
        return failures == null || parseCount(failures) < maxConfirmFailures;
    }

    /**
     * 토큰 확인 실패를 누적한다.
     *
     * @param userId 실패한 사용자 식별자
     */
    public void recordConfirmFailure(Long userId) {
        String key = CONFIRM_FAILURE_KEY_PREFIX + userId;
        Long failures = redisTemplate.opsForValue().increment(key);
        if (failures != null && failures == 1L) {
            redisTemplate.expire(key, confirmFailureWindow);
        }
    }

    /**
     * 인증에 성공한 사용자의 실패 카운터와 재발송 제한을 정리한다.
     *
     * @param userId 인증에 성공한 사용자 식별자
     */
    public void clear(Long userId) {
        redisTemplate.delete(CONFIRM_FAILURE_KEY_PREFIX + userId);
        redisTemplate.delete(COOLDOWN_KEY_PREFIX + userId);
        redisTemplate.delete(SEND_COUNT_KEY_PREFIX + userId);
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
