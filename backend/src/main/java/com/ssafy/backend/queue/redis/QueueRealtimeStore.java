package com.ssafy.backend.queue.redis;

import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Redis에서 자주 변경되는 대기 순서와 호출 상태를 원자적으로 관리한다. */
@Component
public class QueueRealtimeStore {
    private static final long ACTIVE_CALL = -2L;
    private static final long STATE_CONFLICT = -3L;
    private static final long REORDER_NOT_INITIALIZED = -1L;
    private static final long REORDER_ENTRY_MISSING = -2L;
    private static final Duration WEBHOOK_EVENT_TTL = Duration.ofDays(1);
    private static final Duration LIVEKIT_PRESENCE_TTL = Duration.ofHours(6);
    private static final Duration LIVEKIT_DISCONNECT_TTL = Duration.ofMinutes(2);

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

    private static final DefaultRedisScript<Long> REORDER_SCRIPT = new DefaultRedisScript<>("""
            if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
            local targetStatus = redis.call('HGET', KEYS[3], ARGV[1])
            if targetStatus ~= 'NOT_ENTERED' and targetStatus ~= 'WAITING' then return -3 end
            for i = 2, #ARGV, 2 do
              if not redis.call('ZSCORE', KEYS[2], ARGV[i]) then return -2 end
            end
            for i = 2, #ARGV, 2 do
              redis.call('ZADD', KEYS[2], ARGV[i + 1], ARGV[i])
            end
            return (#ARGV - 1) / 2
            """, Long.class);

    private static final DefaultRedisScript<Long> RESTORE_POSITIONS_SCRIPT = new DefaultRedisScript<>("""
            for i = 1, #ARGV, 2 do
              redis.call('ZADD', KEYS[1], ARGV[i + 1], ARGV[i])
            end
            return #ARGV / 2
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

    /**
     * 이동 대상의 상태를 확인한 뒤 여러 참가자의 순번을 하나의 Lua 스크립트로 재정렬한다.
     *
     * <p>대기열 초기화 여부, 이동 대상 상태, 모든 참가자의 Sorted Set 등록 여부를 먼저 검사하고
     * 검사를 모두 통과한 경우에만 순번을 반영하므로 일부만 반영되는 상태가 생기지 않는다.
     *
     * @param meetingId 팬미팅 식별자
     * @param targetEntryId 이동 대상 대기열 항목 식별자
     * @param positions 대기열 항목 식별자별 새 순번
     * @return Redis 재정렬 결과
     */
    public QueueReorderResult reorder(Long meetingId, Long targetEntryId, Map<Long, Integer> positions) {
        List<String> arguments = new ArrayList<>();
        arguments.add(targetEntryId.toString());
        positions.forEach((entryId, position) -> {
            arguments.add(entryId.toString());
            arguments.add(position.toString());
        });
        Long result = redisTemplate.execute(
                REORDER_SCRIPT,
                List.of(QueueRedisKeys.initialized(meetingId), QueueRedisKeys.order(meetingId),
                        QueueRedisKeys.status(meetingId)),
                arguments.toArray()
        );
        if (result == null) {
            return QueueReorderResult.STATE_CONFLICT;
        }
        if (result == REORDER_NOT_INITIALIZED) {
            return QueueReorderResult.NOT_INITIALIZED;
        }
        if (result == REORDER_ENTRY_MISSING) {
            return QueueReorderResult.ENTRY_MISSING;
        }
        if (result == STATE_CONFLICT) {
            return QueueReorderResult.STATE_CONFLICT;
        }
        return QueueReorderResult.REORDERED;
    }

    /**
     * 순번 재정렬 이후 DB 반영이 실패하면 이전 순번을 원자적으로 되돌린다.
     *
     * @param meetingId 팬미팅 식별자
     * @param positions 대기열 항목 식별자별 이전 순번
     */
    public void restorePositions(Long meetingId, Map<Long, Integer> positions) {
        List<String> arguments = new ArrayList<>();
        positions.forEach((entryId, position) -> {
            arguments.add(entryId.toString());
            arguments.add(position.toString());
        });
        redisTemplate.execute(
                RESTORE_POSITIONS_SCRIPT,
                List.of(QueueRedisKeys.order(meetingId)),
                arguments.toArray()
        );
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

    /**
     * LiveKit webhook 이벤트를 최초 처리 요청에서만 원자적으로 선점한다.
     *
     * @param eventId LiveKit webhook 이벤트 식별자
     * @return 처음 선점한 이벤트이면 true
     */
    public boolean claimWebhookEvent(String eventId) {
        return Boolean.TRUE.equals(redisTemplate.opsForValue().setIfAbsent(
                QueueRedisKeys.webhookEvent(eventId), "1", WEBHOOK_EVENT_TTL));
    }

    /**
     * 처리에 실패한 webhook 이벤트의 선점을 해제하여 재전송을 허용한다.
     *
     * @param eventId LiveKit webhook 이벤트 식별자
     */
    public void releaseWebhookEvent(String eventId) {
        redisTemplate.delete(QueueRedisKeys.webhookEvent(eventId));
    }

    /**
     * 지정한 LiveKit Room의 호스트 접속 상태를 기록한다.
     *
     * @param roomId LiveKit Room 식별자
     */
    public void markHostConnected(String roomId) {
        redisTemplate.opsForValue().set(
                QueueRedisKeys.liveKitHostPresence(roomId), "1", LIVEKIT_PRESENCE_TTL);
    }

    /**
     * 지정한 LiveKit Room에 호스트가 접속해 있는지 확인한다.
     *
     * @param roomId LiveKit Room 식별자
     * @return 호스트 접속 상태가 저장되어 있으면 true
     */
    public boolean isHostConnected(String roomId) {
        return Boolean.TRUE.equals(
                redisTemplate.hasKey(QueueRedisKeys.liveKitHostPresence(roomId)));
    }

    /**
     * 지정한 LiveKit Room의 호스트 접속 상태를 제거한다.
     *
     * @param roomId LiveKit Room 식별자
     */
    public void clearHostConnected(String roomId) {
        redisTemplate.delete(QueueRedisKeys.liveKitHostPresence(roomId));
    }

    /**
     * 지정한 통화 세션의 팬 접속 상태를 기록한다.
     *
     * @param callSessionId 통화 세션 식별자
     */
    public void markFanConnected(Long callSessionId) {
        redisTemplate.opsForValue().set(
                QueueRedisKeys.liveKitFanPresence(callSessionId), "1", LIVEKIT_PRESENCE_TTL);
    }

    /**
     * 지정한 통화 세션의 팬이 접속해 있는지 확인한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @return 팬 접속 상태가 저장되어 있으면 true
     */
    public boolean isFanConnected(Long callSessionId) {
        return Boolean.TRUE.equals(
                redisTemplate.hasKey(QueueRedisKeys.liveKitFanPresence(callSessionId)));
    }

    /**
     * 지정한 통화 세션의 팬 접속 상태를 제거한다.
     *
     * @param callSessionId 통화 세션 식별자
     */
    public void clearFanConnected(Long callSessionId) {
        redisTemplate.delete(QueueRedisKeys.liveKitFanPresence(callSessionId));
    }

    /**
     * 재접속 유예 만료 시 종료 사유를 결정할 마지막 이탈 역할을 저장한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @param role 이탈한 참가자 역할
     */
    public void markDisconnectRole(Long callSessionId, String role) {
        redisTemplate.opsForValue().set(
                QueueRedisKeys.liveKitDisconnectRole(callSessionId),
                role,
                LIVEKIT_DISCONNECT_TTL
        );
    }

    /**
     * 통화 세션에서 마지막으로 이탈한 참가자 역할을 조회한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @return 저장된 역할이며 없으면 null
     */
    public String getDisconnectRole(Long callSessionId) {
        return redisTemplate.opsForValue().get(
                QueueRedisKeys.liveKitDisconnectRole(callSessionId));
    }

    /**
     * 재접속 완료 또는 통화 종료 후 마지막 이탈 역할을 제거한다.
     *
     * @param callSessionId 통화 세션 식별자
     */
    public void clearDisconnectRole(Long callSessionId) {
        redisTemplate.delete(QueueRedisKeys.liveKitDisconnectRole(callSessionId));
    }

    /**
     * 팬미팅 종료 후 대기열과 LiveKit 호스트 접속 상태를 모두 제거한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param roomId LiveKit Room 식별자
     */
    public void clearMeeting(Long meetingId, String roomId) {
        redisTemplate.delete(List.of(
                QueueRedisKeys.initialized(meetingId),
                QueueRedisKeys.order(meetingId),
                QueueRedisKeys.status(meetingId),
                QueueRedisKeys.current(meetingId),
                QueueRedisKeys.liveKitHostPresence(roomId)
        ));
    }
}
