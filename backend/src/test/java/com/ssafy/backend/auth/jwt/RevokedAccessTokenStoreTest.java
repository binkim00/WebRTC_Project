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

/** 폐기된 Access Token이 원문 노출 없이 Redis에 저장되고 조회되는지 검증한다. */
class RevokedAccessTokenStoreTest {
    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> valueOperations;
    private RevokedAccessTokenStore store;

    /** mock Redis와 1시간 Access Token 설정으로 폐기 토큰 저장소를 구성한다. */
    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        store = new RevokedAccessTokenStore(
                redisTemplate,
                new JwtProperties("0123456789abcdef0123456789abcdef", 3600, 1209600)
        );
    }

    /** 토큰 원문 대신 SHA-256 해시 키를 Access Token 최대 유효시간 동안 저장하는지 검증한다. */
    @Test
    void storesHashedTokenWithAccessTokenRetention() {
        store.revoke("access-token");

        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(keyCaptor.capture(), eq("revoked"), eq(Duration.ofHours(1)));
        assertThat(keyCaptor.getValue())
                .startsWith("auth:revoked-access-token:")
                .doesNotEndWith(":access-token");
    }

    /** 같은 Access Token의 해시 키가 Redis에 존재하면 폐기된 토큰으로 판단하는지 검증한다. */
    @Test
    void reportsWhetherTokenWasRevoked() {
        when(redisTemplate.hasKey(anyString())).thenReturn(true, false);

        assertThat(store.isRevoked("revoked-token")).isTrue();
        assertThat(store.isRevoked("active-token")).isFalse();
    }
}
