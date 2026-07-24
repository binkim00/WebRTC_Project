package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.config.jwt.JwtProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

/** 로그아웃된 Access Token의 해시를 Redis에 보관하고 재사용 여부를 확인한다. */
@Component
public class RevokedAccessTokenStore {
    private static final String KEY_PREFIX = "auth:revoked-access-token:";
    private static final String REVOKED_VALUE = "revoked";

    private final StringRedisTemplate redisTemplate;
    private final Duration retention;

    /**
     * Redis 접근 객체와 Access Token 최대 유효시간을 주입받는다.
     *
     * @param redisTemplate 로그아웃 토큰을 저장할 Redis 접근 객체
     * @param properties Access Token 만료시간 설정
     */
    public RevokedAccessTokenStore(StringRedisTemplate redisTemplate, JwtProperties properties) {
        this.redisTemplate = redisTemplate;
        this.retention = Duration.ofSeconds(properties.accessExpiration());
    }

    /**
     * 로그아웃된 Access Token의 해시를 최대 유효시간 동안 저장한다.
     *
     * @param accessToken 로그아웃 처리할 Access Token
     */
    public void revoke(String accessToken) {
        redisTemplate.opsForValue().set(key(accessToken), REVOKED_VALUE, retention);
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
