package com.ssafy.backend.auth.jwt;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/** 폐기된 Access Token이 원문 노출 없이 Redis에 저장되고 조회되는지 검증한다. */
class RevokedAccessTokenStoreTest {
    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> valueOperations;
    private JwtTokenProvider jwtTokenProvider;
    private RevokedAccessTokenStore store;

    /** mock Redis, 토큰 제공자와 고정 시계로 폐기 토큰 저장소를 구성한다. */
    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        valueOperations = mock(ValueOperations.class);
        jwtTokenProvider = mock(JwtTokenProvider.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        store = new RevokedAccessTokenStore(
                redisTemplate,
                jwtTokenProvider,
                Clock.fixed(Instant.parse("2026-07-24T00:00:00Z"), ZoneOffset.UTC)
        );
    }

    /** 토큰 원문 대신 SHA-256 해시 키를 Access Token 잔여 유효시간 동안 저장하는지 검증한다. */
    @Test
    void storesHashedTokenWithRemainingAccessTokenLifetime() {
        when(jwtTokenProvider.getAccessTokenExpiresAt("access-token"))
                .thenReturn(Instant.parse("2026-07-24T00:10:00Z"));

        store.revoke("access-token");

        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(keyCaptor.capture(), eq("revoked"), eq(Duration.ofMinutes(10)));
        assertThat(keyCaptor.getValue())
                .isEqualTo("auth:revoked-access-token:"
                        + "3f16bed7089f4653e5ef21bfd2824d7f3aaaecc7a598e7e89c580e1606a9cc52");
    }

    /** 이미 만료된 Access Token은 Redis에 저장하지 않는지 검증한다. */
    @Test
    void doesNotStoreExpiredAccessToken() {
        when(jwtTokenProvider.getAccessTokenExpiresAt("expired-token"))
                .thenReturn(Instant.parse("2026-07-23T23:59:59Z"));

        store.revoke("expired-token");

        verifyNoInteractions(valueOperations);
    }

    /** 같은 Access Token의 해시 키가 Redis에 존재하면 폐기된 토큰으로 판단하는지 검증한다. */
    @Test
    void reportsWhetherTokenWasRevoked() {
        when(redisTemplate.hasKey(anyString())).thenReturn(true, false);

        assertThat(store.isRevoked("revoked-token")).isTrue();
        assertThat(store.isRevoked("active-token")).isFalse();
    }

    /** Redis 조회 장애가 정상 토큰으로 오인되지 않고 호출부로 전파되는지 검증한다. */
    @Test
    void propagatesRedisFailureWhenCheckingRevocation() {
        DataAccessResourceFailureException failure =
                new DataAccessResourceFailureException("Redis unavailable");
        when(redisTemplate.hasKey(anyString())).thenThrow(failure);

        assertThatThrownBy(() -> store.isRevoked("access-token"))
                .isSameAs(failure);
    }
}
