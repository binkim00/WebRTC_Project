package com.ssafy.backend.organization.redis;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OrganizationInvitationStoreTest {

    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> valueOperations;
    private OrganizationInvitationStore invitationStore;

    /** 고정 시각과 Redis 모의 객체로 초대 저장소를 구성한다. */
    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        invitationStore = new OrganizationInvitationStore(
                redisTemplate,
                Clock.fixed(Instant.parse("2026-07-30T06:00:00Z"), ZoneId.of("Asia/Seoul")),
                86400
        );
    }

    /** 발급 토큰이 URL-safe 32바이트 값이고 Redis에는 해시 키와 TTL만 저장되는지 검증한다. */
    @Test
    void issuesHashedTokenWithExpiration() {
        var issued = invitationStore.issue(3L, 25L, 7L);
        String tokenHash = sha256(issued.token());

        assertThat(issued.token()).hasSize(43).doesNotContain("=", "/", "+");
        assertThat(issued.expiresAt()).isEqualTo("2026-07-31T15:00:00");
        verify(valueOperations).set(
                "organization:invitation:" + tokenHash,
                "3:25:7",
                java.time.Duration.ofHours(24)
        );
        verify(valueOperations).set(
                "organization:invitation-target:25",
                tokenHash,
                java.time.Duration.ofHours(24)
        );
    }

    /** 초대 소비 시 GETDEL 결과를 반환하고 대상 인덱스를 함께 제거하는지 검증한다. */
    @Test
    void consumesInvitationOnlyOnce() {
        String token = "test-invitation-token";
        String tokenHash = sha256(token);
        String invitationKey = "organization:invitation:" + tokenHash;
        when(valueOperations.getAndDelete(invitationKey))
                .thenReturn("3:25:7")
                .thenReturn(null);
        when(valueOperations.get("organization:invitation-target:25")).thenReturn(tokenHash);

        var first = invitationStore.consume(token);
        var second = invitationStore.consume(token);

        assertThat(first.organizationId()).isEqualTo(3L);
        assertThat(first.influencerId()).isEqualTo(25L);
        assertThat(second).isNull();
        verify(redisTemplate).delete("organization:invitation-target:25");
    }

    /** 테스트 토큰을 운영 코드와 같은 SHA-256 16진수 문자열로 변환한다. */
    private String sha256(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
