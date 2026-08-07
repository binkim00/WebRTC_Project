package com.ssafy.backend.config.jwt;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.ZoneId;

/** HS256 JWT 발급·검증과 서버 시각 사용에 필요한 Bean을 구성한다. */
@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class JwtConfig {

    /**
     * 서비스 기준 시간대다.
     *
     * <p>팬미팅 시작 시각이나 응모 기간처럼 사용자가 한국시간으로 입력하고 한국시간으로 읽는
     * 값을 다루므로 서버 시계도 한국시간으로 고정한다. 실행 환경의 기본 시간대를 따라가면
     * 개발 PC(KST)와 운영 컨테이너(UTC)가 9시간 다르게 동작한다.
     */
    private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

    /** HS256 요구사항에 맞게 최소 32바이트의 비밀값으로 대칭키를 생성한다. */
    @Bean
        public SecretKey jwtSecretKey(JwtProperties properties) {
        byte[] secret = properties.secret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) {
            throw new IllegalArgumentException("JWT_SECRET must be at least 32 bytes for HS256.");
        }
        return new SecretKeySpec(secret, "HmacSHA256");
    }

    /** 대칭키를 사용하는 Nimbus JWT 인코더를 생성한다. */
    @Bean
        public JwtEncoder jwtEncoder(SecretKey jwtSecretKey) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSecretKey));
    }

    /** HS256만 허용하고 만료시각을 필수로 검증하는 Nimbus JWT 디코더를 생성한다. */
    @Bean
        public JwtDecoder jwtDecoder(SecretKey jwtSecretKey) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSecretKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        JwtTimestampValidator timestampValidator = new JwtTimestampValidator(Duration.ZERO);
        timestampValidator.setAllowEmptyExpiryClaim(false);
        decoder.setJwtValidator(timestampValidator);
        return decoder;
    }

    /**
     * 토큰 발급시각과 마지막 로그인 시각 계산에 공통으로 사용할 서버 시계를 제공한다.
     *
     * <p>실행 환경의 기본 시간대가 아니라 {@link #SERVICE_ZONE}으로 고정한다. 컨테이너의
     * TZ 설정이 빠지거나 바뀌어도 시각 계산 결과가 달라지지 않는다.
     */
    @Bean
        public Clock clock() {
        return Clock.system(SERVICE_ZONE);
    }
}
