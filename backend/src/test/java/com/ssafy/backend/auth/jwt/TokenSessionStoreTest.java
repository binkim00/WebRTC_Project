package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.config.jwt.JwtProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/** 사용자별 토큰 세션이 원문 노출 없이 Redis에 저장되고 비교되는지 검증한다. */
class TokenSessionStoreTest {
    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> valueOperations;
    private TokenSessionStore store;

    /** mock Redis와 14일 Refresh Token 설정으로 세션 저장소를 구성한다. */
    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        store = new TokenSessionStore(
                redisTemplate,
                new JwtProperties("0123456789abcdef0123456789abcdef", 3600, 1209600)
        );
    }

    /** Access·Refresh Token 해시만 Refresh Token TTL로 저장하는지 검증한다. */
    @Test
    void storesOnlyTokenHashesWithRefreshTokenTtl() {
        store.save(1L, "access-token", "refresh-token");

        ArgumentCaptor<String> valueCaptor = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(
                eq("auth:token-session:1"), valueCaptor.capture(), eq(Duration.ofDays(14))
        );
        assertThat(valueCaptor.getValue())
                .doesNotContain("access-token", "refresh-token")
                .matches("[0-9a-f]{64}:[0-9a-f]{64}");
    }

    /** 저장된 최신 토큰만 현재 세션 토큰으로 인정하는지 검증한다. */
    @Test
    void recognizesOnlyTokensFromCurrentSession() {
        store.save(1L, "current-access", "current-refresh");
        ArgumentCaptor<String> valueCaptor = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(anyString(), valueCaptor.capture(), any(Duration.class));
        when(valueOperations.get("auth:token-session:1")).thenReturn(valueCaptor.getValue());

        assertThat(store.isCurrentAccessToken(1L, "current-access")).isTrue();
        assertThat(store.isCurrentAccessToken(1L, "old-access")).isFalse();
        assertThat(store.isCurrentRefreshToken(1L, "current-refresh")).isTrue();
        assertThat(store.isCurrentRefreshToken(1L, "old-refresh")).isFalse();
    }

    /** 로그아웃 시 사용자 토큰 세션 키를 삭제하는지 검증한다. */
    @Test
    void deletesUserTokenSession() {
        store.delete(1L);

        verify(redisTemplate).delete("auth:token-session:1");
    }
}
