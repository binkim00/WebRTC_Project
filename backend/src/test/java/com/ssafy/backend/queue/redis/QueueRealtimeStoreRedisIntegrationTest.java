package com.ssafy.backend.queue.redis;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.support.QueueRedisTestSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 순번 재정렬 Lua 스크립트를 실제 Redis에 실행해 원자성과 검증 순서를 확인한다.
 *
 * <p>로컬 Redis가 없으면 테스트를 건너뛰며 사용한 Key만 삭제해 정리한다.
 */
class QueueRealtimeStoreRedisIntegrationTest {
    private static final Long MEETING_ID = 990001L;
    private static final Long EMPTY_MEETING_ID = 990002L;

    private StringRedisTemplate redisTemplate;
    private QueueRealtimeStore store;

    /** 실제 Redis에 연결하고 이전 실행에서 남은 Key를 정리한다. */
    @BeforeEach
    void setUp() {
        redisTemplate = QueueRedisTestSupport.connect();
        assumeTrue(QueueRedisTestSupport.isAvailable(redisTemplate),
                "로컬 Redis(localhost:6379 database 5)가 없어 실제 Redis 검증을 건너뛴다.");
        store = new QueueRealtimeStore(redisTemplate);
        deleteTestKeys();
    }

    /** 테스트에서 만든 Key만 삭제하고 연결을 닫는다. */
    @AfterEach
    void tearDown() {
        if (redisTemplate == null) {
            return;
        }
        if (QueueRedisTestSupport.isAvailable(redisTemplate)) {
            deleteTestKeys();
        }
        QueueRedisTestSupport.close(redisTemplate);
    }

    /** Lua 재정렬이 Sorted Set 순번과 정렬 순서를 함께 갱신하는지 실제 Redis로 검증한다. */
    @Test
    void reordersSortedSetPositionsOnRealRedis() {
        store.initialize(MEETING_ID, List.of(
                waitingEntry(11L, 1), waitingEntry(12L, 2),
                waitingEntry(13L, 3), waitingEntry(14L, 4)));

        QueueReorderResult result = store.reorder(MEETING_ID, 14L,
                positions(11L, 1, 14L, 2, 12L, 3, 13L, 4));

        assertThat(result).isEqualTo(QueueReorderResult.REORDERED);
        assertThat(store.getPosition(MEETING_ID, 11L)).isEqualTo(1);
        assertThat(store.getPosition(MEETING_ID, 14L)).isEqualTo(2);
        assertThat(store.getPosition(MEETING_ID, 12L)).isEqualTo(3);
        assertThat(store.getPosition(MEETING_ID, 13L)).isEqualTo(4);
        assertThat(orderedEntryIds()).containsExactly("11", "14", "12", "13");
    }

    /** 이동 대상이 통화 중이면 어떤 순번도 바꾸지 않는지 실제 Redis로 검증한다. */
    @Test
    void keepsAllPositionsWhenTargetIsInCall() {
        store.initialize(MEETING_ID, List.of(
                waitingEntry(11L, 1), waitingEntry(12L, 2), waitingEntry(13L, 3)));
        store.updateStatus(MEETING_ID, 12L, QueueEntryStatus.IN_CALL);

        QueueReorderResult result = store.reorder(MEETING_ID, 12L,
                positions(12L, 1, 11L, 2, 13L, 3));

        assertThat(result).isEqualTo(QueueReorderResult.STATE_CONFLICT);
        assertThat(orderedEntryIds()).containsExactly("11", "12", "13");
        assertThat(store.getPosition(MEETING_ID, 11L)).isEqualTo(1);
        assertThat(store.getPosition(MEETING_ID, 12L)).isEqualTo(2);
        assertThat(store.getPosition(MEETING_ID, 13L)).isEqualTo(3);
    }

    /** Sorted Set에 없는 참가자가 섞이면 전체를 반영하지 않는지 실제 Redis로 검증한다. */
    @Test
    void appliesNoPositionWhenAnyEntryIsMissing() {
        store.initialize(MEETING_ID, List.of(waitingEntry(11L, 1), waitingEntry(12L, 2)));

        QueueReorderResult result = store.reorder(MEETING_ID, 12L,
                positions(12L, 1, 11L, 2, 99L, 3));

        assertThat(result).isEqualTo(QueueReorderResult.ENTRY_MISSING);
        assertThat(store.getPosition(MEETING_ID, 11L)).isEqualTo(1);
        assertThat(store.getPosition(MEETING_ID, 12L)).isEqualTo(2);
        assertThat(store.getPosition(MEETING_ID, 99L)).isNull();
    }

    /** 초기화되지 않은 팬미팅의 재정렬 요청을 실제 Redis에서 거부하는지 검증한다. */
    @Test
    void rejectsReorderWhenQueueNotInitialized() {
        QueueReorderResult result =
                store.reorder(EMPTY_MEETING_ID, 11L, positions(11L, 1));

        assertThat(result).isEqualTo(QueueReorderResult.NOT_INITIALIZED);
        assertThat(store.isInitialized(EMPTY_MEETING_ID)).isFalse();
    }

    /** 되돌리기 스크립트가 이전 순번을 실제 Redis에 그대로 복원하는지 검증한다. */
    @Test
    void restoresPreviousPositionsOnRealRedis() {
        store.initialize(MEETING_ID, List.of(
                waitingEntry(11L, 1), waitingEntry(12L, 2), waitingEntry(13L, 3)));
        store.reorder(MEETING_ID, 13L, positions(13L, 1, 11L, 2, 12L, 3));

        store.restorePositions(MEETING_ID, positions(11L, 1, 12L, 2, 13L, 3));

        assertThat(orderedEntryIds()).containsExactly("11", "12", "13");
        assertThat(store.getPosition(MEETING_ID, 13L)).isEqualTo(3);
    }

    /** 대기자가 한 명이면 자기 순번 재정렬만 반영되는지 실제 Redis로 검증한다. */
    @Test
    void keepsSingleEntryPositionOnRealRedis() {
        store.initialize(MEETING_ID, List.of(waitingEntry(11L, 1)));

        QueueReorderResult result = store.reorder(MEETING_ID, 11L, positions(11L, 1));

        assertThat(result).isEqualTo(QueueReorderResult.REORDERED);
        assertThat(store.getPosition(MEETING_ID, 11L)).isEqualTo(1);
        assertThat(orderedEntryIds()).containsExactly("11");
    }

    /**
     * Redis에 저장된 순번 오름차순 참가자 식별자 목록을 읽는다.
     *
     * @return 순번 순서대로 정렬된 대기열 항목 식별자 문자열
     */
    private List<String> orderedEntryIds() {
        Set<String> range = redisTemplate.opsForZSet()
                .range(QueueRedisKeys.order(MEETING_ID), 0, -1);
        return range == null ? List.of() : List.copyOf(range);
    }

    /**
     * 대기열 항목 식별자와 순번을 번갈아 받아 재정렬 인자를 만든다.
     *
     * @param values 식별자와 순번이 번갈아 오는 값 목록
     * @return 대기열 항목 식별자별 순번
     */
    private Map<Long, Integer> positions(Object... values) {
        Map<Long, Integer> positions = new LinkedHashMap<>();
        for (int index = 0; index < values.length; index += 2) {
            positions.put(((Number) values[index]).longValue(),
                    ((Number) values[index + 1]).intValue());
        }
        return positions;
    }

    /**
     * 대기 상태의 대기열 항목을 만든다.
     *
     * @param entryId 대기열 항목 식별자
     * @param position 초기 대기 순번
     * @return 대기 상태 대기열 항목
     */
    private QueueEntry waitingEntry(long entryId, int position) {
        FanMeeting meeting = mock(FanMeeting.class);
        Participant participant = mock(Participant.class);
        when(participant.getAssignedOrder()).thenReturn(position);
        QueueEntry queueEntry = QueueEntry.create(meeting, participant);
        ReflectionTestUtils.setField(queueEntry, "id", entryId);
        ReflectionTestUtils.setField(queueEntry, "status", QueueEntryStatus.WAITING);
        return queueEntry;
    }

    /** 테스트가 사용한 대기열 Key를 삭제한다. */
    private void deleteTestKeys() {
        redisTemplate.delete(List.of(
                QueueRedisKeys.initialized(MEETING_ID),
                QueueRedisKeys.order(MEETING_ID),
                QueueRedisKeys.status(MEETING_ID),
                QueueRedisKeys.current(MEETING_ID),
                QueueRedisKeys.initialized(EMPTY_MEETING_ID),
                QueueRedisKeys.order(EMPTY_MEETING_ID),
                QueueRedisKeys.status(EMPTY_MEETING_ID),
                QueueRedisKeys.current(EMPTY_MEETING_ID)
        ));
    }
}
