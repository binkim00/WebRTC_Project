package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.config.jwt.JwtProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

/** 사용자별 최신 Access·Refresh Token 해시를 Redis에 보관해 단일 세션을 보장한다. */
@Component
public class TokenSessionStore {
    private static final String KEY_PREFIX = "auth:token-session:";
    private static final String HASH_SEPARATOR = ":";

    private final StringRedisTemplate redisTemplate;
    private final Duration retention;

    /**
     * Redis 접근 객체와 Refresh Token 유효시간을 주입받는다.
     *
     * @param redisTemplate 토큰 세션을 저장할 Redis 접근 객체
     * @param properties Refresh Token 만료시간 설정
     */
    public TokenSessionStore(StringRedisTemplate redisTemplate, JwtProperties properties) {
        this.redisTemplate = redisTemplate;
        this.retention = Duration.ofSeconds(properties.refreshExpiration());
    }

    /**
     * 사용자의 최신 Access·Refresh Token 해시를 Refresh Token 유효시간 동안 저장한다.
     *
     * @param userId 사용자 식별자
     * @param accessToken 새로 발급된 Access Token
     * @param refreshToken 새로 발급된 Refresh Token
     */
    public void save(Long userId, String accessToken, String refreshToken) {
        String value = hash(accessToken) + HASH_SEPARATOR + hash(refreshToken);
        redisTemplate.opsForValue().set(key(userId), value, retention);
    }

    /**
     * Access Token이 사용자의 현재 세션에 속하는지 확인한다.
     *
     * @param userId 사용자 식별자
     * @param accessToken 확인할 Access Token
     * @return 현재 세션의 Access Token이면 true
     */
    public boolean isCurrentAccessToken(Long userId, String accessToken) {
        String[] hashes = storedHashes(userId);
        return hashes != null && constantTimeEquals(hashes[0], hash(accessToken));
    }

    /**
     * Refresh Token이 사용자의 현재 세션에 속하는지 확인한다.
     *
     * @param userId 사용자 식별자
     * @param refreshToken 확인할 Refresh Token
     * @return 현재 세션의 Refresh Token이면 true
     */
    public boolean isCurrentRefreshToken(Long userId, String refreshToken) {
        String[] hashes = storedHashes(userId);
        return hashes != null && constantTimeEquals(hashes[1], hash(refreshToken));
    }

    /**
     * 사용자의 현재 토큰 세션을 삭제한다.
     *
     * @param userId 사용자 식별자
     */
    public void delete(Long userId) {
        redisTemplate.delete(key(userId));
    }

    /** 사용자 식별자를 포함한 Redis 키를 생성한다. */
    private String key(Long userId) {
        return KEY_PREFIX + userId;
    }

    /** 저장된 Access·Refresh Token 해시를 안전하게 분리한다. */
    private String[] storedHashes(Long userId) {
        String value = redisTemplate.opsForValue().get(key(userId));
        if (value == null) {
            return null;
        }
        String[] hashes = value.split(HASH_SEPARATOR, -1);
        return hashes.length == 2 ? hashes : null;
    }

    /** 토큰을 원문 복원이 불가능한 SHA-256 16진수 문자열로 변환한다. */
    private String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available.", exception);
        }
    }

    /** 두 해시 문자열을 처리 시간 차이가 드러나지 않도록 비교한다. */
    private boolean constantTimeEquals(String expected, String actual) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8)
        );
    }
}
