package com.ssafy.backend.organization.redis;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

/**
 * 조직 초대 토큰을 Redis에 만료 시간과 함께 저장하고 일회성으로 소비한다.
 */
@Component
public class OrganizationInvitationStore {

    private static final String INVITATION_KEY_PREFIX = "organization:invitation:";
    private static final String TARGET_KEY_PREFIX = "organization:invitation-target:";
    private static final String VALUE_SEPARATOR = ":";
    private static final int TOKEN_BYTE_LENGTH = 32;

    private final StringRedisTemplate redisTemplate;
    private final Clock clock;
    private final Duration invitationTtl;
    private final SecureRandom secureRandom;

    /**
     * Redis 접근 객체와 초대 만료 정책을 초기화한다.
     *
     * @param redisTemplate 조직 초대를 저장할 Redis 접근 객체
     * @param clock 현재 시각을 제공하는 시계
     * @param invitationTtlSeconds 초대 유효시간(초)
     */
    public OrganizationInvitationStore(
            StringRedisTemplate redisTemplate,
            Clock clock,
            @Value("${app.organization.invitation-ttl-seconds:86400}") long invitationTtlSeconds
    ) {
        if (invitationTtlSeconds < 1) {
            throw new IllegalArgumentException("Organization invitation TTL must be positive.");
        }
        this.redisTemplate = redisTemplate;
        this.clock = clock;
        this.invitationTtl = Duration.ofSeconds(invitationTtlSeconds);
        this.secureRandom = new SecureRandom();
    }

    /**
     * 대상 인플루언서의 기존 초대를 무효화하고 새로운 일회성 토큰을 발급한다.
     *
     * @param organizationId 초대할 조직 식별자
     * @param influencerId 초대 대상 인플루언서 식별자
     * @param invitedByUserId 초대를 발급한 매니저 식별자
     * @return 원본 토큰과 만료 시각이 포함된 발급 결과
     */
    public IssuedInvitation issue(
            Long organizationId,
            Long influencerId,
            Long invitedByUserId
    ) {
        invalidatePreviousInvitation(influencerId);

        String token = generateToken();
        String tokenHash = hash(token);
        String value = serialize(new InvitationData(
                organizationId, influencerId, invitedByUserId));
        redisTemplate.opsForValue().set(invitationKey(tokenHash), value, invitationTtl);
        redisTemplate.opsForValue().set(targetKey(influencerId), tokenHash, invitationTtl);
        LocalDateTime expiresAt = LocalDateTime.ofInstant(
                clock.instant().plus(invitationTtl), clock.getZone());
        return new IssuedInvitation(token, expiresAt);
    }

    /**
     * 토큰을 소비하지 않고 초대 대상을 확인한다.
     *
     * @param token 확인할 원본 초대 토큰
     * @return 유효한 초대 정보이며 없거나 만료된 경우 null
     */
    public InvitationData peek(String token) {
        String value = redisTemplate.opsForValue().get(invitationKey(hash(token)));
        return value == null ? null : deserialize(value);
    }

    /**
     * 초대 정보를 반환하면서 Redis 키를 제거해 토큰을 한 번만 사용할 수 있게 한다.
     *
     * @param token 소비할 원본 초대 토큰
     * @return 소비된 초대 정보이며 없거나 이미 사용된 경우 null
     */
    public InvitationData consume(String token) {
        String tokenHash = hash(token);
        String value = redisTemplate.opsForValue().getAndDelete(invitationKey(tokenHash));
        if (value == null) {
            return null;
        }
        InvitationData invitation = deserialize(value);
        String indexedHash = redisTemplate.opsForValue().get(targetKey(invitation.influencerId()));
        if (tokenHash.equals(indexedHash)) {
            redisTemplate.delete(targetKey(invitation.influencerId()));
        }
        return invitation;
    }

    /** 대상 인플루언서에게 이전에 발급된 초대 토큰을 무효화한다. */
    private void invalidatePreviousInvitation(Long influencerId) {
        String targetKey = targetKey(influencerId);
        String previousTokenHash = redisTemplate.opsForValue().get(targetKey);
        if (previousTokenHash != null) {
            redisTemplate.delete(invitationKey(previousTokenHash));
        }
        redisTemplate.delete(targetKey);
    }

    /** 암호학적으로 안전한 URL-safe 초대 토큰을 생성한다. */
    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** 원본 토큰을 Redis 키에 사용할 SHA-256 해시로 변환한다. */
    private String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available.", exception);
        }
    }

    /** 초대 정보를 Redis 문자열 값으로 직렬화한다. */
    private String serialize(InvitationData invitation) {
        return invitation.organizationId() + VALUE_SEPARATOR
                + invitation.influencerId() + VALUE_SEPARATOR
                + invitation.invitedByUserId();
    }

    /** Redis 문자열 값을 초대 정보로 역직렬화한다. */
    private InvitationData deserialize(String value) {
        String[] parts = value.split(VALUE_SEPARATOR, -1);
        if (parts.length != 3) {
            throw new IllegalStateException("Invalid organization invitation value.");
        }
        try {
            return new InvitationData(
                    Long.parseLong(parts[0]),
                    Long.parseLong(parts[1]),
                    Long.parseLong(parts[2])
            );
        } catch (NumberFormatException exception) {
            throw new IllegalStateException("Invalid organization invitation value.", exception);
        }
    }

    /** 토큰 해시로 초대 정보 Redis 키를 생성한다. */
    private String invitationKey(String tokenHash) {
        return INVITATION_KEY_PREFIX + tokenHash;
    }

    /** 초대 대상 사용자 식별자로 최신 초대 인덱스 키를 생성한다. */
    private String targetKey(Long influencerId) {
        return TARGET_KEY_PREFIX + influencerId;
    }

    /**
     * 초대 토큰 발급 결과를 전달한다.
     *
     * @param token 한 번만 노출하는 원본 초대 토큰
     * @param expiresAt 초대 만료 시각
     */
    public record IssuedInvitation(String token, LocalDateTime expiresAt) {
    }

    /**
     * Redis에 저장되는 조직 초대 대상을 전달한다.
     *
     * @param organizationId 초대 조직 식별자
     * @param influencerId 초대 대상 인플루언서 식별자
     * @param invitedByUserId 초대 발급 매니저 식별자
     */
    public record InvitationData(
            Long organizationId,
            Long influencerId,
            Long invitedByUserId
    ) {
    }
}
