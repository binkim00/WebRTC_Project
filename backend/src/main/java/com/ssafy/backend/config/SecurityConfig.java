package com.ssafy.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
public class SecurityConfig {

    private final String allowedOrigins;

    /** 설정에서 허용할 CORS 출처 목록을 주입받는다. */
    public SecurityConfig(@Value("${app.cors.allowed-origins:}") String allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    @Bean
    /** CSRF·CORS 및 요청 인증 정책을 구성하는 보안 필터 체인을 생성한다. */
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeHttpRequests(auth -> auth
                        // TODO: JWT 인증 기능 구현 시 역할별 접근 권한 설정으로 변경
                        .anyRequest().permitAll()
                )
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable);

        return http.build();
    }

    @Bean
    /** 회원 비밀번호를 단방향 BCrypt 해시로 변환할 암호화기를 생성한다. */
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    /** 설정된 출처에만 교차 출처 요청을 허용하는 CORS 정책을 생성한다. */
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // TODO: 프론트엔드와 RTC 테스트 주소가 확정되면 CORS_ALLOWED_ORIGINS에 명시적으로 등록
        if (StringUtils.hasText(allowedOrigins)) {
            // 쉼표로 나눈 각 출처의 공백과 빈 항목을 제거해 실제 허용 목록을 만든다.
            configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                    .map(String::trim)
                    .filter(StringUtils::hasText)
                    .toList());
        }

        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // 완성된 CORS 정책을 애플리케이션의 모든 요청 경로에 적용한다.
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
