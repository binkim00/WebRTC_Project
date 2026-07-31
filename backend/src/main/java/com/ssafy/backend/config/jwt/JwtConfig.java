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

/** HS256 JWT 발급·검증과 서버 시각 사용에 필요한 Bean을 구성한다. */
@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class JwtConfig {

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

    /** 토큰 발급시각과 마지막 로그인 시각 계산에 공통으로 사용할 서버 시계를 제공한다. */
    @Bean
        public Clock clock() {
        return Clock.systemDefaultZone();
    }
}
