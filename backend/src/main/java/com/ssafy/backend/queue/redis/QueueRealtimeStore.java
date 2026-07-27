package com.ssafy.backend.queue.redis;

import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** Redis에서 자주 변경되는 대기 순서와 호출 상태를 원자적으로 관리한다. */
@Component
public class QueueRealtimeStore {
    private static final long ACTIVE_CALL = -2L;
    private static final long STATE_CONFLICT = -3L;

    private static final DefaultRedisScript<Long> INITIALIZE_SCRIPT = new DefaultRedisScript<>("""
            if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
            for i = 1, #ARGV, 3 do
              redis.call('ZADD', KEYS[2], ARGV[i + 1], ARGV[i])
              redis.call('HSET', KEYS[3], ARGV[i], ARGV[i + 2])
            end
            redis.call('SET', KEYS[1], '1')
            return #ARGV / 3
            """, Long.class);

    private static final DefaultRedisScript<Long> CLAIM_ENTRY_SCRIPT = new DefaultRedisScript<>("""
            if redis.call('EXISTS', KEYS[3]) == 1 then return -2 end
            if not redis.call('ZSCORE', KEYS[1], ARGV[1]) then return -3 end
            if redis.call('HGET', KEYS[2], ARGV[1]) ~= 'WAITING' then return -3 end
            redis.call('HSET', KEYS[2], ARGV[1], 'CALLED')
            redis.call('SET', KEYS[3], ARGV[1])
            return tonumber(ARGV[1])
            """, Long.class);

    private static final DefaultRedisScript<Long> CLEAR_CURRENT_SCRIPT = new DefaultRedisScript<>("""
            if redis.call('GET', KEYS[1]) == ARGV[1] then
              redis.call('DEL', KEYS[1])
              return 1
            end
            return 0
            """, Long.class);

    private static final DefaultRedisScript<Long> RELEASE_CLAIM_SCRIPT = new DefaultRedisScript<>("""
            if redis.call('GET', KEYS[1]) == ARGV[1] then
              redis.call('DEL', KEYS[1])
              redis.call('HSET', KEYS[2], ARGV[1], 'WAITING')
              return 1
            end
            return 0
            """, Long.class);

    private static final DefaultRedisScript<Long> COUNT_AHEAD_SCRIPT = new DefaultRedisScript<>("""
            local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
            if not score then return -1 end
            local entries = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', '(' .. score)
            local count = 0
            for _, entryId in ipairs(entries) do
              local status = redis.call('HGET', KEYS[2], entryId)
              if status == 'NOT_ENTERED' or status == 'WAITING' or status == 'CALLED' or status == 'IN_CALL' then
                count = count + 1
              end
            end
            return count
            """, Long.class);

    private final StringRedisTemplate redisTemplate;

    /** Redis 문자열 연산 도구를 주입받는다. */
    public QueueRealtimeStore(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /** DB에서 생성된 대기열 항목을 Redis에 한 번만 원자적으로 초기화한다. */
    public long initialize(Long meetingId, List<QueueEntry> entries) {
        List<String> arguments = new ArrayList<>();
        for (QueueEntry entry : entries) {
            arguments.add(entry.getId().toString());
            arguments.add(entry.getQueuePosition().toString());
            arguments.add(entry.getStatus().name());
        }
        Long result = redisTemplate.execute(
                INITIALIZE_SCRIPT,
                List.of(QueueRedisKeys.initialized(meetingId), QueueRedisKeys.order(meetingId),
                        QueueRedisKeys.status(meetingId)),
                arguments.toArray()
        );
        return result == null ? 0 : result;
    }

    /** 대기열 초기화 여부를 확인한다. */
    public boolean isInitialized(Long meetingId) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(QueueRedisKeys.initialized(meetingId)));
    }

    /**
     * 명세에서 지정한 대기열 참가자를 원자적으로 호출 상태로 선점한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param entryId 호출할 대기열 항목 식별자
     * @return Redis 선점 결과
     */
    public QueueClaimResult claimEntry(Long meetingId, Long entryId) {
        Long result = redisTemplate.execute(
                CLAIM_ENTRY_SCRIPT,
                List.of(QueueRedisKeys.order(meetingId), QueueRedisKeys.status(meetingId),
                        QueueRedisKeys.current(meetingId)),
                entryId.toString()
        );
        if (result != null && result.equals(entryId)) {
            return QueueClaimResult.CLAIMED;
        }
        if (result != null && result == ACTIVE_CALL) {
            return QueueClaimResult.ACTIVE_CALL;
        }
        if (result == null || result == STATE_CONFLICT) {
            return QueueClaimResult.STATE_CONFLICT;
        }
        return QueueClaimResult.STATE_CONFLICT;
    }

    /** 참가자의 실시간 상태를 갱신한다. */
    public void updateStatus(Long meetingId, Long entryId, QueueEntryStatus status) {
        redisTemplate.opsForHash().put(
                QueueRedisKeys.status(meetingId), entryId.toString(), status.name());
    }

    /** 참가자의 실시간 순번을 갱신한다. */
    public void updatePosition(Long meetingId, Long entryId, int position) {
        redisTemplate.opsForZSet().add(
                QueueRedisKeys.order(meetingId), entryId.toString(), position);
    }

    /** Redis에 저장된 참가자 상태를 조회한다. */
    public QueueEntryStatus getStatus(Long meetingId, Long entryId) {
        Object value = redisTemplate.opsForHash().get(
                QueueRedisKeys.status(meetingId), entryId.toString());
        return value == null ? null : QueueEntryStatus.valueOf(value.toString());
    }

    /** Redis에 저장된 참가자 순번을 조회한다. */
    public Integer getPosition(Long meetingId, Long entryId) {
        Double score = redisTemplate.opsForZSet().score(
                QueueRedisKeys.order(meetingId), entryId.toString());
        return score == null ? null : score.intValue();
    }

    /** 현재 참가자보다 앞에 남아 있는 참가자 수를 계산한다. */
    public long countAhead(Long meetingId, Long entryId) {
        Long result = redisTemplate.execute(
                COUNT_AHEAD_SCRIPT,
                List.of(QueueRedisKeys.order(meetingId), QueueRedisKeys.status(meetingId)),
                entryId.toString()
        );
        return result == null ? -1 : result;
    }

    /** 현재 호출 또는 통화 중인 대기열 항목 식별자를 조회한다. */
    public Long getCurrentEntryId(Long meetingId) {
        String value = redisTemplate.opsForValue().get(QueueRedisKeys.current(meetingId));
        return value == null ? null : Long.valueOf(value);
    }

    /** 지정한 참가자가 현재 참가자일 때만 현재 상태를 원자적으로 비운다. */
    public boolean clearCurrent(Long meetingId, Long entryId) {
        Long result = redisTemplate.execute(
                CLEAR_CURRENT_SCRIPT,
                List.of(QueueRedisKeys.current(meetingId)),
                entryId.toString()
        );
        return Long.valueOf(1L).equals(result);
    }

    /** DB 상태 변경 실패 시 Redis에서 선점한 참가자를 대기 상태로 되돌린다. */
    public void releaseClaim(Long meetingId, Long entryId) {
        redisTemplate.execute(
                RELEASE_CLAIM_SCRIPT,
                List.of(QueueRedisKeys.current(meetingId), QueueRedisKeys.status(meetingId)),
                entryId.toString()
        );
    }
}
