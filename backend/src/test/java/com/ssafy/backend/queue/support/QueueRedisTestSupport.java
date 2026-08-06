package com.ssafy.backend.queue.support;

import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * 대기열 Lua 스크립트를 실제 Redis로 검증하는 테스트의 연결 설정을 모아 둔다.
 *
 * <p>이 세션 전용 Redis database 5에만 접속하며 정리는 사용한 Key 삭제로만 수행한다.
 */
public final class QueueRedisTestSupport {
    private static final String HOST = "localhost";
    private static final int PORT = 6379;
    private static final int DATABASE = 5;

    /** 인스턴스 생성을 차단한다. */
    private QueueRedisTestSupport() {
    }

    /**
     * 테스트 전용 Redis database에 연결된 문자열 템플릿을 만든다.
     *
     * @return 실제 Redis에 연결된 {@link StringRedisTemplate}
     */
    public static StringRedisTemplate connect() {
        RedisStandaloneConfiguration configuration =
                new RedisStandaloneConfiguration(HOST, PORT);
        configuration.setDatabase(DATABASE);
        LettuceConnectionFactory connectionFactory = new LettuceConnectionFactory(configuration);
        connectionFactory.afterPropertiesSet();
        StringRedisTemplate redisTemplate = new StringRedisTemplate(connectionFactory);
        redisTemplate.afterPropertiesSet();
        return redisTemplate;
    }

    /**
     * 로컬 Redis가 실제로 응답하는지 확인한다.
     *
     * @param redisTemplate 확인할 Redis 템플릿
     * @return 명령에 응답하면 true
     */
    public static boolean isAvailable(StringRedisTemplate redisTemplate) {
        try {
            redisTemplate.hasKey("queue-redis-availability-check");
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    /**
     * 연결에 사용한 Lettuce 연결 자원을 정리한다.
     *
     * @param redisTemplate 정리할 Redis 템플릿
     */
    public static void close(StringRedisTemplate redisTemplate) {
        if (redisTemplate.getConnectionFactory()
                instanceof LettuceConnectionFactory connectionFactory) {
            connectionFactory.destroy();
        }
    }
}
