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
                                "/api/v1/auth/reissue").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/health").permitAll()
                        // 테스트 토큰 컨트롤러는 설정으로 활성화된 환경에서만 등록된다.
                        .requestMatchers(HttpMethod.GET, "/livekit-test.html").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/livekit/test-token").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/livekit/webhook").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/v1/influencers/*/follow")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/influencers/*/follow")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/me/followings")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/influencers/me/followers")
                                .hasAnyRole("INFLUENCER", "SOLO_INFLUENCER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/organizations/*/members")
                                .hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings",
                                "/api/v1/fan-meetings/*").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/fan-meetings/*/queue/enter")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/queue/me")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/queue")
                                .hasAnyRole("INFLUENCER", "MANAGER", "SOLO_INFLUENCER", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/queue-entries/*/call")
                                .hasRole("MANAGER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/fan-meetings").authenticated()
                        // --- 이하 WAVE 1~3 신규 엔드포인트 권한 선반영 ---
                        // 병렬 작업 세션이 이 파일을 동시에 수정하면 충돌이 확정적이므로 규칙만 미리 등록한다.
                        // 아직 컨트롤러가 없는 경로는 인증·권한 통과 후 404가 되며 기능에 영향을 주지 않는다.
                        // 팬미팅 단위 소유권은 MeetingAccessService 로 서비스 계층에서 다시 검증한다.

                        // 참가자 조회 (PART-001, PART-002)
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/participants",
                                "/api/v1/fan-meetings/*/participants/*")
                                .hasAnyRole("INFLUENCER", "MANAGER", "SOLO_INFLUENCER", "ADMIN")
                        // 장비 점검 결과 저장 (DEV-001)
                        .requestMatchers(HttpMethod.POST, "/api/v1/fan-meetings/*/device-checks")
                                .hasAnyRole("FAN", "INFLUENCER", "SOLO_INFLUENCER")
                        // 팬 메모 (MEMO-001, MEMO-002)
                        .requestMatchers(HttpMethod.GET, "/api/v1/influencers/me/fans/*/memos")
                                .hasAnyRole("INFLUENCER", "SOLO_INFLUENCER", "MANAGER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/influencers/me/fans/*/memos")
                                .hasAnyRole("INFLUENCER", "SOLO_INFLUENCER")
                        // 팬 메모 수정·삭제 (MEMO-003)
                        // 작성자 본인 여부는 FanMemoService 에서 다시 검증한다.
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/fan-memos/*")
                                .hasAnyRole("INFLUENCER", "SOLO_INFLUENCER")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/fan-memos/*")
                                .hasAnyRole("INFLUENCER", "SOLO_INFLUENCER")

                        // 응모 폼 (FORM-001, FORM-002)
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/application-form")
                                .permitAll()
                        .requestMatchers(HttpMethod.PUT, "/api/v1/fan-meetings/*/application-form")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")
                        // 응모 조회·통계 (APP-002, APP-003, APP-004, APP-007)
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/applications/me")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/me/applications")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/applications/statistics")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/applications")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")
                        // 추첨·결과 공개 (APP-005, APP-006)
                        .requestMatchers(HttpMethod.POST, "/api/v1/fan-meetings/*/applications/draw",
                                "/api/v1/fan-meetings/*/applications/results/publish")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")

                        // 대기 순서 변경 (QUEUE-005, QREQ-001~003)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/queue-entries/*/position")
                                .hasRole("MANAGER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/queue-entries/*/change-requests")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/queue-change-requests")
                                .hasRole("MANAGER")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/queue-change-requests/*")
                                .hasRole("MANAGER")

                        // 팬미팅 결과 통계 (STAT-001)
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/statistics")
                                .hasAnyRole("INFLUENCER", "MANAGER", "SOLO_INFLUENCER", "ADMIN")

                        // 공지·커뮤니티 조회 (POST-001, POST-002, COMMENT-001)
                        .requestMatchers(HttpMethod.GET, "/api/v1/service-notices",
                                "/api/v1/service-notices/*",
                                "/api/v1/fan-meetings/*/notices",
                                "/api/v1/fan-meetings/*/notices/*",
                                "/api/v1/fan-meetings/*/community/posts",
                                "/api/v1/community/posts/*",
                                "/api/v1/community/posts/*/comments").permitAll()
                        // 공지·커뮤니티 작성 (POST-003)
                        .requestMatchers(HttpMethod.POST, "/api/v1/fan-meetings/*/notices",
                                "/api/v1/fan-meetings/*/community/posts")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")
                        // 댓글 작성·신고 (COMMENT-002, COMMENT-004)
                        // 참가 Participant 자격은 서비스 계층에서 검증하므로 여기서는 인증만 요구한다.
                        .requestMatchers(HttpMethod.POST, "/api/v1/community/posts/*/comments",
                                "/api/v1/comments/*/reports").authenticated()

                        // AI 요약·모니터링 (AI-001, AI-002, AI-003)
                        .requestMatchers(HttpMethod.GET, "/api/v1/call-sessions/*/summary")
                                .hasAnyRole("INFLUENCER", "MANAGER", "SOLO_INFLUENCER")
                        .requestMatchers(HttpMethod.GET, "/api/v1/call-sessions/*/moderations")
                                .hasAnyRole("MANAGER", "ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/moderations/*/review")
                                .hasAnyRole("MANAGER", "ADMIN")
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
