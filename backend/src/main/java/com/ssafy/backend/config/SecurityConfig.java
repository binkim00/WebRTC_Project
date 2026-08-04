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
                        // Swagger UI는 API 문서 확인용이라 인증 없이 열어둔다.
                        .requestMatchers(HttpMethod.GET, "/swagger-ui.html", "/swagger-ui/**",
                                "/v3/api-docs", "/v3/api-docs/**").permitAll()
                        // 테스트 토큰 컨트롤러는 설정으로 활성화된 환경에서만 등록된다.
                        .requestMatchers(HttpMethod.GET, "/livekit-test.html").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/livekit/test-token").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/livekit/webhook").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").authenticated()
                        // 이메일 인증 (AUTH-005~008)
                        // 자기 계정의 메일함만 확인하는 흐름이라 역할 제한 없이 로그인만 요구한다.
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/email-verifications",
                                "/api/v1/auth/email-verifications/resend",
                                "/api/v1/auth/email-verifications/confirm").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/email-verifications")
                                .authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/v1/influencers/*/follow")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/influencers/*/follow")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/me/followings")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/influencers/me/followers")
                                .hasAnyRole("INFLUENCER", "SOLO_INFLUENCER")
                        // 팔로워 목록과 달리 참가 이력을 기준으로 하며, 본인이 개최한 팬미팅으로만
                        // 범위가 제한되므로 팔로워 목록과 같은 역할 규칙을 적용한다.
                        .requestMatchers(HttpMethod.GET, "/api/v1/influencers/me/participant-fans")
                                .hasAnyRole("INFLUENCER", "SOLO_INFLUENCER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/organizations/*/members")
                                .hasRole("ADMIN")
                        // 외부 선별 참가자 명단 CSV 양식은 팬미팅 식별자가 없는 공통 경로라
                        // 아래 팬미팅 상세 permitAll 규칙보다 먼저 등록해야 가려지지 않는다.
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/fan-meetings/external-participants/csv-template")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings",
                                "/api/v1/fan-meetings/*").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/fan-meetings/*/queue/enter")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/queue/me")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/queue")
                                .hasAnyRole("INFLUENCER", "MANAGER", "SOLO_INFLUENCER", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/v1/queue-entries/*/call")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")
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
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/queue-entries/*/change-requests")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/queue-change-requests")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/queue-change-requests/*")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")

                        // 팬미팅 결과 통계 (STAT-001)
                        .requestMatchers(HttpMethod.GET, "/api/v1/fan-meetings/*/statistics")
                                .hasAnyRole("INFLUENCER", "MANAGER", "SOLO_INFLUENCER", "ADMIN")
                        // 통계 CSV 내보내기는 운영 산출물이라 소유 운영자로만 제한한다.
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/fan-meetings/*/statistics/export.csv")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")
                        // 외부 선별 참가자 명단 CSV 미리보기·확정
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/fan-meetings/*/external-participants/csv/preview",
                                "/api/v1/fan-meetings/*/external-participants/csv/confirm")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER")

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

                        // 공지 첨부파일 콘텐츠 조회 (ATTACH-001)
                        // 공개 공지의 첨부는 비로그인도 볼 수 있어야 하므로 URL 단위로는 열어 두고,
                        // 아직 연결되지 않았거나 공개되지 않은 첨부의 접근 제한은
                        // AttachmentQueryService 가 업로더·작성자·ADMIN 기준으로 검증한다.
                        .requestMatchers(HttpMethod.GET, "/api/v1/attachments/*/content")
                                .permitAll()
                        // 공지 첨부파일 업로드 (ATTACH-001)
                        .requestMatchers(HttpMethod.POST, "/api/v1/attachments").authenticated()

                        // 녹화 재생·다운로드 (REC-003)
                        // 브라우저 video 태그는 Authorization 헤더를 보낼 수 없어 URL의 서명 토큰으로
                        // 인가한다. 토큰 검증과 소유자 확인은 RecordingQueryService 가 수행한다.
                        .requestMatchers(HttpMethod.GET, "/api/v1/recordings/*/content").permitAll()
                        // 녹화 업로드·조회 (REC-001, REC-002, REC-004)
                        // 녹화는 통화에 참여한 팬 본인만 다룰 수 있으므로 FAN 역할로 제한하고
                        // 통화 참여자 본인 여부는 서비스 계층에서 다시 검증한다.
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/call-sessions/*/recordings/upload",
                                "/api/v1/call-sessions/*/recordings/consent",
                                "/api/v1/recordings/*/download-url")
                                .hasRole("FAN")
                        .requestMatchers(HttpMethod.GET,
                                "/api/v1/recordings/*",
                                "/api/v1/users/me/recordings")
                                .hasRole("FAN")

                        // 인플루언서 탐색 (INF-001, INF-002)
                        // 공개 API이며, 로그인 팬의 팔로우 여부는 서비스 계층에서 선택적으로 채운다.
                        // 위쪽 /influencers/me/** 규칙보다 뒤에 두어 기존 권한 규칙을 가리지 않는다.
                        .requestMatchers(HttpMethod.GET, "/api/v1/influencers",
                                "/api/v1/influencers/*").permitAll()

                        // 팬 본인의 통화 종료
                        // 통화 당사자 여부는 CallSessionService 에서 다시 검증한다.
                        .requestMatchers(HttpMethod.POST, "/api/v1/call-sessions/*/end")
                                .hasRole("FAN")
                        // AI 요약·모니터링 (AI-001, AI-002, AI-003)
                        .requestMatchers(HttpMethod.GET, "/api/v1/call-sessions/*/summary")
                                .hasAnyRole("INFLUENCER", "MANAGER", "SOLO_INFLUENCER")
                        .requestMatchers(HttpMethod.GET, "/api/v1/call-sessions/*/moderations")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER", "ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/moderations/*/review")
                                .hasAnyRole("MANAGER", "SOLO_INFLUENCER", "ADMIN")
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
