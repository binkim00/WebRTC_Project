package com.ssafy.backend.recording.egress;

import com.ssafy.backend.recording.config.RecordingEgressProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Duration;
import java.util.List;

/** Redis leases keep the number of CPU-heavy Room Composite jobs bounded cluster-wide. */
@Component
public class RecordingEgressCapacityGuard {

    private static final String KEY_PREFIX = "recording:egress:capacity:";
    private static final DefaultRedisScript<Long> RENEW_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
                    + "return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
            Long.class);
    private static final DefaultRedisScript<Long> RELEASE_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
                    + "return redis.call('del', KEYS[1]) else return 0 end",
            Long.class);

    private final StringRedisTemplate redisTemplate;
    private final RecordingEgressProperties properties;

    public RecordingEgressCapacityGuard(StringRedisTemplate redisTemplate,
                                        RecordingEgressProperties properties) {
        this.redisTemplate = redisTemplate;
        this.properties = properties;
    }

    /** Claims an empty slot or renews a slot already owned by this recording. */
    public boolean claimOrRenew(Long recordingId) {
        String owner = recordingId.toString();
        Duration lease = Duration.ofSeconds(properties.capacityLeaseSeconds());
        for (int slot = 0; slot < properties.maxConcurrent(); slot++) {
            String key = key(slot);
            Long renewed = redisTemplate.execute(RENEW_SCRIPT, List.of(key), owner,
                    Long.toString(lease.toMillis()));
            if (Long.valueOf(1L).equals(renewed)) {
                return true;
            }
            if (Boolean.TRUE.equals(redisTemplate.opsForValue()
                    .setIfAbsent(key, owner, lease))) {
                return true;
            }
        }
        return false;
    }

    /** Releases only a slot still owned by the supplied recording ID. */
    public void release(Long recordingId) {
        String owner = recordingId.toString();
        for (int slot = 0; slot < properties.maxConcurrent(); slot++) {
            redisTemplate.execute(RELEASE_SCRIPT, List.of(key(slot)), owner);
        }
    }

    @TransactionalEventListener(
            phase = TransactionPhase.AFTER_COMMIT,
            fallbackExecution = true)
    public void releaseAfterCommit(RecordingEgressEvent.CapacityReleaseRequested event) {
        release(event.recordingId());
    }

    private String key(int slot) {
        return KEY_PREFIX + slot;
    }
}
