package com.ssafy.backend.common.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

/**
 * 고정 구간 방식으로 요청 횟수를 세어 남용을 억제한다.
 *
 * <p>첫 요청에서 카운터에 만료를 걸고 구간이 지나면 카운터가 사라지므로 별도 정리가 필요하지 않다.
 * 정밀한 슬라이딩 윈도우가 아니라 구간 경계에서 최대 두 배까지 통과할 수 있지만,
 * 반복 클릭과 스크립트 남용을 막는 목적에는 충분하고 Redis 연산이 한 번으로 끝난다.
 *
 * <p>Redis에 접근할 수 없으면 요청을 통과시킨다. 제한은 남용을 늦추는 보조 장치이므로
 * 저장소 장애가 가입·응모 전면 중단으로 번지지 않게 하는 편이 낫다고 보고 최선 노력으로 다룬다.
 */
@Component
public class RequestRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RequestRateLimiter.class);
    private static final String KEY_PREFIX = "rate-limit:";

    private final StringRedisTemplate redisTemplate;

    /**
     * 요청 횟수를 저장할 Redis 접근 객체를 주입받는다.
     *
     * @param redisTemplate 요청 카운터를 저장할 Redis 접근 객체
     */
    public RequestRateLimiter(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * 지정한 구간에서 허용 횟수가 남아 있으면 한 건을 소비한다.
     *
     * @param scope 제한 대상을 구분하는 이름이며 키 앞부분에 사용한다
     * @param identifier 사용자 식별자나 IP처럼 제한을 적용할 주체
     * @param limit 구간당 허용 횟수
     * @param window 횟수를 집계할 구간
     * @return 허용되면 true, 상한을 넘었으면 false
     */
    public boolean tryConsume(String scope, String identifier, int limit, Duration window) {
        String key = key(scope, identifier);
        Long count;
        try {
            count = redisTemplate.opsForValue().increment(key);
            if (count != null && count == 1L) {
                redisTemplate.expire(key, window);
            }
        } catch (DataAccessException exception) {
            // Redis 장애로 요청을 전부 막으면 가입과 응모가 멈춘다. 제한은 최선 노력으로 두고
            // 통과시키되, 보호가 꺼진 상태를 눈치챌 수 있도록 경고를 남긴다.
            log.warn("요청 제한 확인에 실패해 제한 없이 통과시킵니다. scope={}", scope, exception);
            return true;
        }
        // 응답을 받지 못한 경우도 같은 이유로 통과시킨다.
        return count == null || count <= limit;
    }

    /**
     * 재시도까지 남은 시간을 반환한다.
     *
     * @param scope 제한 대상을 구분하는 이름
     * @param identifier 제한을 적용한 주체
     * @return 남은 시간(초)이며 만료 정보가 없으면 0
     */
    public long retryAfterSeconds(String scope, String identifier) {
        try {
            Long expire = redisTemplate.getExpire(key(scope, identifier));
            return expire == null || expire < 0 ? 0L : expire;
        } catch (DataAccessException exception) {
            return 0L;
        }
    }

    /**
     * 재발송 쿨다운처럼 다음 요청까지 최소 간격이 필요한 경우를 위해 표식을 남긴다.
     *
     * @param scope 제한 대상을 구분하는 이름
     * @param identifier 제한을 적용할 주체
     * @param cooldown 다음 요청까지 기다려야 하는 시간
     * @return 쿨다운을 새로 설정했으면 true, 이미 진행 중이면 false
     */
    public boolean tryStartCooldown(String scope, String identifier, Duration cooldown) {
        try {
            Boolean started = redisTemplate.opsForValue()
                    .setIfAbsent(key(scope, identifier), "1", cooldown);
            // Redis 응답이 없으면 막지 않는다. 발송량 제한이 별도로 걸려 있어 남용 위험은 남지 않는다.
            return started == null || started;
        } catch (DataAccessException exception) {
            log.warn("재발송 간격 확인에 실패해 제한 없이 통과시킵니다. scope={}", scope, exception);
            return true;
        }
    }

    /**
     * 진행 중인 제한 표식을 지운다.
     *
     * @param scope 제한 대상을 구분하는 이름
     * @param identifier 제한을 적용한 주체
     */
    public void clear(String scope, String identifier) {
        try {
            redisTemplate.delete(key(scope, identifier));
        } catch (DataAccessException exception) {
            // 제한 표식은 만료로도 사라지므로 삭제 실패는 다음 만료까지 기다리면 된다.
            log.warn("요청 제한 표식 삭제에 실패했습니다. scope={}", scope, exception);
        }
    }

    /**
     * 식별자 원문이 Redis 키에 남지 않도록 해시를 적용한 키를 만든다.
     *
     * <p>이메일과 IP는 개인정보이므로 키 이름으로 저장하지 않는다.
     *
     * @param scope 제한 대상을 구분하는 이름
     * @param identifier 해시할 주체 식별자
     * @return 제한 카운터에 사용할 Redis 키
     */
    private String key(String scope, String identifier) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(identifier.getBytes(StandardCharsets.UTF_8));
            return KEY_PREFIX + scope + ":" + HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 algorithm is not available.", exception);
        }
    }
}
