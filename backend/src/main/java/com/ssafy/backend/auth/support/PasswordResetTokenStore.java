package com.ssafy.backend.auth.support;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

/**
 * 비밀번호 재설정 링크의 1회용 토큰을 Redis에 보관한다.
 *
 * <p>이메일 인증 토큰과 달리 테이블을 새로 만들지 않는다. 운영은 {@code ddl-auto: validate}이고
 * 마이그레이션 도구가 없어 테이블 추가에는 수동 DDL이 필요한데, 이 토큰은 30분이면 사라지고
 * 남겨서 조회할 이력도 없다. TTL로 스스로 사라지는 Redis가 목적에 맞고 운영 반영도 필요 없다.
 *
 * <p>토큰 원문은 저장하지 않고 SHA-256 해시만 키로 쓴다. Redis 내용이 유출돼도 저장된 값으로
 * 남의 비밀번호를 바꿀 수 있는 링크를 되돌려 만들 수 없어야 하기 때문이다.
 */
@Component
public class PasswordResetTokenStore {

    private static final String KEY_PREFIX = "auth:password-reset:";

    /** 토큰 원문 길이다. 추측이 불가능하도록 256비트를 사용한다. */
    private static final int TOKEN_BYTE_LENGTH = 32;

    private final StringRedisTemplate redisTemplate;
    private final SecureRandom secureRandom = new SecureRandom();

    /**
     * 재설정 토큰을 보관할 Redis 접근 객체를 주입받는다.
     *
     * @param redisTemplate Redis 접근 객체
     */
    public PasswordResetTokenStore(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * 사용자에게 발급할 재설정 토큰을 만들어 보관하고 원문을 반환한다.
     *
     * @param userId 비밀번호를 재설정할 사용자 식별자
     * @param ttl 링크 유효 시간
     * @return 메일 링크에 실을 토큰 원문
     */
    public String issue(Long userId, Duration ttl) {
        byte[] raw = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        redisTemplate.opsForValue().set(key(token), String.valueOf(userId), ttl);
        return token;
    }

    /**
     * 토큰 원문에 해당하는 사용자 식별자를 조회한다.
     *
     * @param token 사용자가 제시한 토큰 원문
     * @return 유효한 토큰이면 사용자 식별자, 만료·위조된 토큰이면 비어 있는 결과
     */
    public Optional<Long> findUserId(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        String stored = redisTemplate.opsForValue().get(key(token));
        if (stored == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(Long.parseLong(stored));
        } catch (NumberFormatException exception) {
            // 손상된 값은 사용할 수 없는 토큰으로 취급한다.
            return Optional.empty();
        }
    }

    /**
     * 사용을 마친 토큰을 지워 같은 링크를 두 번 쓸 수 없게 한다.
     *
     * @param token 사용을 마친 토큰 원문
     */
    public void consume(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        redisTemplate.delete(key(token));
    }

    /** 토큰 원문을 복원할 수 없는 해시 키로 변환한다. */
    private String key(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return KEY_PREFIX + HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available.", exception);
        }
    }
}
