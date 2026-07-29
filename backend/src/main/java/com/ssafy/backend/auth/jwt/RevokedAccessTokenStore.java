package com.ssafy.backend.auth.jwt;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

/** 로그아웃된 Access Token의 해시를 Redis에 보관하고 재사용 여부를 확인한다. */
@Component
public class RevokedAccessTokenStore {
    private static final String KEY_PREFIX = "auth:revoked-access-token:";
    private static final String REVOKED_VALUE = "revoked";

    private final StringRedisTemplate redisTemplate;
    private final JwtTokenProvider jwtTokenProvider;
    private final Clock clock;

    /**
     * Redis 접근 객체, Access Token 검증기와 잔여 유효시간 계산용 시계를 주입받는다.
     *
     * @param redisTemplate 로그아웃 토큰을 저장할 Redis 접근 객체
     * @param jwtTokenProvider Access Token 검증 및 만료 시각 제공자
     * @param clock 현재 시각을 제공할 시계
     */
    public RevokedAccessTokenStore(StringRedisTemplate redisTemplate,
                                   JwtTokenProvider jwtTokenProvider,
                                   Clock clock) {
        this.redisTemplate = redisTemplate;
        this.jwtTokenProvider = jwtTokenProvider;
        this.clock = clock;
    }

    /**
     * 로그아웃된 Access Token의 해시를 남은 유효시간 동안 저장한다.
     *
     * @param accessToken 로그아웃 처리할 Access Token
     */
    public void revoke(String accessToken) {
        Instant expiresAt = jwtTokenProvider.getAccessTokenExpiresAt(accessToken);
        Duration remainingTime = Duration.between(clock.instant(), expiresAt);
        if (remainingTime.isZero() || remainingTime.isNegative()) {
            return;
        }
        redisTemplate.opsForValue().set(key(accessToken), REVOKED_VALUE, remainingTime);
    }

    /**
     * Access Token이 로그아웃으로 폐기되었는지 확인한다.
     *
     * @param accessToken 확인할 Access Token
     * @return 폐기된 토큰이면 true
     */
    public boolean isRevoked(String accessToken) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(key(accessToken)));
    }

    /**
     * 토큰 원문을 노출하지 않는 Redis 키를 생성한다.
     *
     * @param accessToken Redis 키로 변환할 Access Token
     * @return SHA-256 해시가 포함된 Redis 키
     */
    private String key(String accessToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(accessToken.getBytes(StandardCharsets.UTF_8));
            return KEY_PREFIX + HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available.", exception);
        }
    }
}
