package com.ssafy.backend.config;

import com.ssafy.backend.auth.jwt.JwtAuthenticationEntryPoint;
import com.ssafy.backend.auth.jwt.JwtAuthenticationFilter;
import com.ssafy.backend.common.security.RestAccessDeniedHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
public class SecurityConfig {

    private final String allowedOrigins;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;
    private final RestAccessDeniedHandler accessDeniedHandler;

    /**
     * CORS 허용 출처와 JWT 인증 처리 구성 요소를 주입받는다.
     *
     * @param allowedOrigins 허용할 출처를 쉼표로 구분한 설정값
     * @param jwtAuthenticationFilter JWT 인증 필터
     * @param jwtAuthenticationEntryPoint 인증 실패 응답 처리기
     */

    public SecurityConfig(@Value("${app.cors.allowed-origins:}") String allowedOrigins,
                          JwtAuthenticationFilter jwtAuthenticationFilter,
                          JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint,
                          RestAccessDeniedHandler accessDeniedHandler) {
        this.allowedOrigins = allowedOrigins;
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.jwtAuthenticationEntryPoint = jwtAuthenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
    }

    /**
     * 세션을 사용하지 않는 JWT 기반 웹 보안 필터 체인을 구성한다.
     *
     * @param http 보안 규칙을 구성할 HTTP 보안 빌더
     * @return 애플리케이션에 적용할 보안 필터 체인
     * @throws Exception 보안 필터 체인을 생성하지 못한 경우
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // 토큰 인증만 사용하므로 서버 세션과 브라우저 기반 기본 인증 기능을 비활성화한다.
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(jwtAuthenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/signup", "/api/v1/auth/login",
                                "/api/v1/auth/refresh").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/livekit/webhook").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/v1/fan-meetings/*/queue/enter")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/queue/me")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/queue-entries/*/call")
                                .hasRole("MANAGER")
                        // 보호 대상 API가 확정될 때까지 기존 접근 정책을 유지한다.
                        .requestMatchers("/api/v1/fan-meetings/*/queue/operations/**")
                                .hasAnyRole("INFLUENCER", "MANAGER", "SOLO_INFLUENCER", "ADMIN")
                        .anyRequest().authenticated()
                )
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * 비밀번호 단방향 암호화에 사용할 BCrypt 인코더를 제공한다.
     *
     * @return BCrypt 비밀번호 인코더
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * 설정에 명시된 출처만 허용하는 CORS 정책을 구성한다.
     *
     * @return 모든 API 경로에 적용할 CORS 설정 소스
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        if (StringUtils.hasText(allowedOrigins)) {
            // 쉼표 주변의 공백과 빈 항목을 제거해 실제로 지정된 출처만 허용 목록에 넣는다.
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
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
