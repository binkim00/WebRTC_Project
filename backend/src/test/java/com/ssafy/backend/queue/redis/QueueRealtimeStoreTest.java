package com.ssafy.backend.queue.redis;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 순번 재정렬 스크립트 결과 해석 규칙을 검증한다. */
class QueueRealtimeStoreTest {

    /** 스크립트 결과를 받지 못하면 상태 충돌로 처리해 DB 반영을 막는지 검증한다. */
    @Test
    void treatsMissingScriptResultAsStateConflict() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        when(redisTemplate.<Long>execute(any(RedisScript.class), anyList(), any(Object[].class)))
                .thenReturn(null);
        QueueRealtimeStore store = new QueueRealtimeStore(redisTemplate);

        QueueReorderResult result = store.reorder(1L, 7L, Map.of(7L, 1));

        assertThat(result).isEqualTo(QueueReorderResult.STATE_CONFLICT);
    }

    /** 스크립트가 반영한 참가자 수를 재정렬 성공으로 해석하는지 검증한다. */
    @Test
    void treatsAppliedCountAsReordered() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        when(redisTemplate.<Long>execute(any(RedisScript.class), anyList(), any(Object[].class)))
                .thenReturn(2L);
        QueueRealtimeStore store = new QueueRealtimeStore(redisTemplate);

        QueueReorderResult result = store.reorder(1L, 7L, Map.of(7L, 1, 8L, 2));

        assertThat(result).isEqualTo(QueueReorderResult.REORDERED);
    }

    /** 되돌리기 요청을 순번 Key 하나만 대상으로 실행하는지 검증한다. */
    @Test
    void restoresPositionsWithOrderKeyOnly() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        when(redisTemplate.<Long>execute(any(RedisScript.class), anyList(), any(Object[].class)))
                .thenReturn(1L);
        QueueRealtimeStore store = new QueueRealtimeStore(redisTemplate);

        store.restorePositions(1L, Map.of(7L, 3));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> keyCaptor = ArgumentCaptor.forClass(List.class);
        verify(redisTemplate).execute(
                any(RedisScript.class), keyCaptor.capture(), any(Object[].class));
        assertThat(keyCaptor.getValue()).containsExactly(QueueRedisKeys.order(1L));
    }
}
