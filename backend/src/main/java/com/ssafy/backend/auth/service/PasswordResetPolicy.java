package com.ssafy.backend.auth.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.Set;

/**
 * 비밀번호 재설정 링크의 유효 시간, 주소, 개발용 토큰 노출 여부를 한곳에서 관리한다.
 *
 * <p>재설정 링크는 로그인 화면으로 보낸다. 전용 화면 경로를 새로 만들면 프론트 라우터를 함께
 * 고쳐야 하는데, 로그인 화면이 {@code resetToken} 쿼리를 읽어 새 비밀번호 입력 폼을 띄우면
 * 같은 흐름을 라우터 변경 없이 처리할 수 있다.
 */
@Component
public class PasswordResetPolicy {

    /** 재설정 토큰 원문 노출을 허용할 프로파일이다. */
    private static final Set<String> DEVELOPMENT_PROFILES = Set.of("local", "dev", "test");

    private final Duration tokenTtl;
    private final String resetBaseUrl;
    private final boolean exposeToken;

    /**
     * 재설정 링크 정책 값을 주입받고 운영에서 토큰이 노출되지 않는지 검증한다.
     *
     * @param environment 활성 프로파일을 확인할 실행 환경
     * @param tokenTtlSeconds 재설정 링크 유효 시간(초)
     * @param resetBaseUrl 메일 링크가 가리킬 프론트엔드 화면 주소
     * @param exposeToken 응답과 로그에 토큰 원문을 노출할지 여부이며 기본값은 이메일 인증 설정을 따른다
     * @throws IllegalArgumentException 유효 시간이 1보다 작은 경우
     * @throws IllegalStateException 개발 프로파일이 아닌데 토큰 노출이 켜져 있는 경우
     */
    public PasswordResetPolicy(
            Environment environment,
            @Value("${app.password-reset.ttl-seconds:1800}") long tokenTtlSeconds,
            @Value("${app.password-reset.base-url:http://localhost:5173/login}") String resetBaseUrl,
            @Value("${app.password-reset.expose-link:${app.email-verification.expose-link:false}}")
            boolean exposeToken
    ) {
        if (tokenTtlSeconds < 1) {
            throw new IllegalArgumentException("Password reset TTL must be positive.");
        }
        boolean developmentProfile = Arrays.stream(environment.getActiveProfiles())
                .anyMatch(DEVELOPMENT_PROFILES::contains);
        if (exposeToken && !developmentProfile) {
            // 운영에서 남의 비밀번호를 바꿀 수 있는 토큰이 응답이나 로그로 새는 설정은 기동 단계에서 막는다.
            throw new IllegalStateException(
                    "app.password-reset.expose-link는 local/dev/test 프로파일에서만 사용할 수 있습니다.");
        }
        this.tokenTtl = Duration.ofSeconds(tokenTtlSeconds);
        this.resetBaseUrl = resetBaseUrl;
        this.exposeToken = exposeToken;
    }

    /** 재설정 링크의 유효 시간을 반환한다. */
    public Duration tokenTtl() {
        return tokenTtl;
    }

    /** 응답과 로그에 토큰 원문을 노출해도 되는 개발 환경인지 반환한다. */
    public boolean exposeToken() {
        return exposeToken;
    }

    /**
     * 토큰 원문을 쿼리 파라미터로 붙인 재설정 링크를 만든다.
     *
     * @param rawToken 메일로 전달할 토큰 원문
     * @return 새 비밀번호 입력 화면으로 이어지는 링크
     */
    public String resetLink(String rawToken) {
        String separator = resetBaseUrl.contains("?") ? "&" : "?";
        return resetBaseUrl + separator + "resetToken="
                + URLEncoder.encode(rawToken, StandardCharsets.UTF_8);
    }
}
