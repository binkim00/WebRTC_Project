package com.ssafy.backend.auth.support;

import com.ssafy.backend.auth.domain.SocialProvider;
import com.ssafy.backend.config.oauth.OAuthProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * 검증이 끝난 소셜 인증 결과를 추가 입력이 끝날 때까지 Redis에 임시 보관한다.
 *
 * <p>공급자 인증 코드는 1회용이라 추가정보 입력이나 비밀번호 확인 단계에서 다시 쓸 수 없다.
 * 그래서 서버가 검증 결과를 짧은 시간 들고 있다가, 사용자가 다음 단계를 마치면 그 결과로 가입·연결을 끝낸다.
 *
 * <p>발급한 토큰 원문은 저장하지 않고 SHA-256 해시만 키로 쓴다. Redis 내용이 유출되어도
 * 저장된 값으로 가입·연결을 진행할 토큰을 되돌려 만들 수 없어야 한다.
 */
@Component
public class PendingSocialAuthStore {

    private static final String KEY_PREFIX = "auth:social-pending:";
    private static final String FIELD_PROVIDER = "provider";
    private static final String FIELD_PROVIDER_USER_ID = "providerUserId";
    private static final String FIELD_EMAIL = "email";
    private static final String FIELD_EMAIL_VERIFIED = "emailVerified";
    private static final String FIELD_NICKNAME = "nickname";
    private static final String FIELD_PROFILE_IMAGE_URL = "profileImageUrl";

    /** 토큰 원문 길이다. 추측이 불가능하도록 256비트를 사용한다. */
    private static final int TOKEN_BYTE_LENGTH = 32;

    private final StringRedisTemplate redisTemplate;
    private final OAuthProperties properties;
    private final SecureRandom secureRandom = new SecureRandom();

    /**
     * Redis 접근 객체와 임시 보관 시간 설정을 주입받는다.
     *
     * @param redisTemplate 인증 결과를 저장할 Redis 접근 객체
     * @param properties 보관 시간이 담긴 소셜 로그인 설정
     */
    public PendingSocialAuthStore(StringRedisTemplate redisTemplate, OAuthProperties properties) {
        this.redisTemplate = redisTemplate;
        this.properties = properties;
    }

    /**
     * 공급자 프로필을 보관하고 다음 단계에서 사용할 토큰 원문을 발급한다.
     *
     * @param profile 공급자에서 검증이 끝난 사용자 정보
     * @return 클라이언트에 전달할 토큰 원문
     */
    public String issue(SocialProfile profile) {
        byte[] raw = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put(FIELD_PROVIDER, profile.provider().name());
        fields.put(FIELD_PROVIDER_USER_ID, profile.providerUserId());
        fields.put(FIELD_EMAIL_VERIFIED, Boolean.toString(profile.emailVerified()));
        // Redis 해시는 null 을 담을 수 없어 값이 없는 항목은 아예 넣지 않고, 조회할 때 없음으로 읽는다.
        if (profile.email() != null) {
            fields.put(FIELD_EMAIL, profile.email());
        }
        if (profile.nickname() != null) {
            fields.put(FIELD_NICKNAME, profile.nickname());
        }
        if (profile.profileImageUrl() != null) {
            fields.put(FIELD_PROFILE_IMAGE_URL, profile.profileImageUrl());
        }

        String key = key(token);
        redisTemplate.opsForHash().putAll(key, fields);
        redisTemplate.expire(key, properties.pendingTtl());
        return token;
    }

    /**
     * 토큰에 해당하는 보관된 인증 결과를 조회한다.
     *
     * @param token 클라이언트가 제시한 토큰 원문
     * @return 유효한 보관 결과가 있으면 해당 프로필, 만료·위조된 토큰이면 비어 있는 결과
     */
    public Optional<SocialProfile> find(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        Map<Object, Object> stored = redisTemplate.opsForHash().entries(key(token));
        if (stored.isEmpty()) {
            return Optional.empty();
        }
        Optional<SocialProvider> provider = SocialProvider.from(text(stored.get(FIELD_PROVIDER)));
        String providerUserId = text(stored.get(FIELD_PROVIDER_USER_ID));
        if (provider.isEmpty() || providerUserId == null) {
            return Optional.empty();
        }
        return Optional.of(new SocialProfile(
                provider.get(),
                providerUserId,
                text(stored.get(FIELD_EMAIL)),
                Boolean.parseBoolean(text(stored.get(FIELD_EMAIL_VERIFIED))),
                text(stored.get(FIELD_NICKNAME)),
                text(stored.get(FIELD_PROFILE_IMAGE_URL))
        ));
    }

    /**
     * 보관된 인증 결과를 삭제해 같은 토큰을 두 번 쓰지 못하게 한다.
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

    /** Redis 해시 값을 문자열로 바꾸고 빈 값은 {@code null}로 만든다. */
    private String text(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }
}
