package com.ssafy.backend.recording.egress;

import com.ssafy.backend.recording.config.RecordingEgressProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RecordingEgressCapacityGuardTest {

    private StringRedisTemplate redisTemplate;
    private ValueOperations<String, String> values;
    private RecordingEgressCapacityGuard guard;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        redisTemplate = mock(StringRedisTemplate.class);
        values = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(values);
        guard = new RecordingEgressCapacityGuard(redisTemplate,
                new RecordingEgressProperties(true, "/out", "grid",
                        1, 7200, 30000, 60, 20));
    }

    @Test
    void claimsEmptySlotWithLease() {
        when(redisTemplate.execute(
                org.mockito.ArgumentMatchers.<RedisScript<Long>>any(),
                anyList(), any(), any())).thenReturn(0L);
        when(values.setIfAbsent("recording:egress:capacity:0", "10",
                Duration.ofSeconds(7200))).thenReturn(true);

        assertThat(guard.claimOrRenew(10L)).isTrue();

        verify(values).setIfAbsent("recording:egress:capacity:0", "10",
                Duration.ofSeconds(7200));
    }

    @Test
    void rejectsWhenEverySlotHasAnotherOwner() {
        when(redisTemplate.execute(
                org.mockito.ArgumentMatchers.<RedisScript<Long>>any(),
                anyList(), any(), any())).thenReturn(0L);
        when(values.setIfAbsent(any(), any(), any(Duration.class))).thenReturn(false);

        assertThat(guard.claimOrRenew(10L)).isFalse();
    }

    @Test
    void releasesWithCompareAndDeleteScript() {
        when(redisTemplate.execute(
                org.mockito.ArgumentMatchers.<RedisScript<Long>>any(),
                anyList(), any())).thenReturn(1L);

        guard.release(10L);

        verify(redisTemplate).execute(
                org.mockito.ArgumentMatchers.<RedisScript<Long>>any(),
                org.mockito.ArgumentMatchers.eq(List.of("recording:egress:capacity:0")),
                org.mockito.ArgumentMatchers.eq("10"));
    }
}
