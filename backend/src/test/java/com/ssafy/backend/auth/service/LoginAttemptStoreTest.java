package com.ssafy.backend.auth.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** 로그인 실패 횟수의 Redis TTL, 차단 판정과 초기화를 검증한다. */
class LoginAttemptStoreTest {
    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> valueOperations;
    private LoginAttemptStore store;

    /** 최대 5회와 15분 차단 정책으로 mock 저장소를 구성한다. */
    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        store = new LoginAttemptStore(redisTemplate, 5, 900);
    }

    /** 첫 로그인 실패에만 차단 시간 TTL을 설정하는지 검증한다. */
    @Test
    void startsTtlOnFirstFailure() {
        when(valueOperations.increment(anyString())).thenReturn(1L);

        assertThat(store.recordFailure("melly01")).isFalse();

        verify(redisTemplate).expire(anyString(), eq(Duration.ofMinutes(15)));
    }

    /** 최대 실패 횟수에 도달하면 로그인 ID를 차단하는지 검증한다. */
    @Test
    void blocksAtConfiguredFailureThreshold() {
        when(valueOperations.increment(anyString())).thenReturn(5L);
        when(valueOperations.get(anyString())).thenReturn("5");

        assertThat(store.recordFailure("melly01")).isTrue();
        assertThat(store.isBlocked("melly01")).isTrue();
        verify(redisTemplate).expire(anyString(), eq(Duration.ofMinutes(15)));
    }

    /** 로그인 성공 시 해시된 로그인 ID 키를 삭제하는지 검증한다. */
    @Test
    void clearsFailuresWithoutExposingLoginIdInKey() {
        store.clear("melly01");

        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(redisTemplate).delete(keyCaptor.capture());
        assertThat(keyCaptor.getValue())
                .startsWith("auth:login-failure:")
                .doesNotContain("melly01");
    }
}
