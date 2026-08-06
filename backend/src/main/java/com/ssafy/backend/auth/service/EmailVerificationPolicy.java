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
 * 이메일 인증의 유효 시간, 링크 주소, 개발용 토큰 노출 여부를 한곳에서 관리한다.
 *
 * <p>토큰 노출 여부를 서비스와 발송 구현이 각각 판단하면 한쪽만 잘못 켜져도 사고가 되므로
 * 프로파일 검증을 포함한 판단을 이 빈으로 모은다.
 */
@Component
public class EmailVerificationPolicy {

    /** 인증 토큰 원문 노출을 허용할 프로파일이다. */
    private static final Set<String> DEVELOPMENT_PROFILES = Set.of("local", "dev", "test");

    private final Duration tokenTtl;
    private final String verificationBaseUrl;
    private final boolean exposeToken;

    /**
     * 인증 링크 정책 값을 주입받고 운영에서 토큰이 노출되지 않는지 검증한다.
     *
     * @param environment 활성 프로파일을 확인할 실행 환경
     * @param tokenTtlSeconds 인증 링크 유효 시간(초)
     * @param verificationBaseUrl 메일 링크가 가리킬 프론트엔드 인증 완료 화면 주소
     * @param exposeToken 응답과 로그에 토큰 원문을 노출할지 여부
     * @throws IllegalArgumentException 유효 시간이 1보다 작은 경우
     * @throws IllegalStateException 개발 프로파일이 아닌데 토큰 노출이 켜져 있는 경우
     */
    public EmailVerificationPolicy(
            Environment environment,
            @Value("${app.email-verification.ttl-seconds:1800}") long tokenTtlSeconds,
            @Value("${app.email-verification.base-url:http://localhost:5173/email-verification}")
            String verificationBaseUrl,
            @Value("${app.email-verification.expose-link:false}") boolean exposeToken
    ) {
        if (tokenTtlSeconds < 1) {
            throw new IllegalArgumentException("Email verification TTL must be positive.");
        }
        boolean developmentProfile = Arrays.stream(environment.getActiveProfiles())
                .anyMatch(DEVELOPMENT_PROFILES::contains);
        if (exposeToken && !developmentProfile) {
            // 운영에서 임시 인증 정보가 응답이나 로그로 새는 설정은 기동 단계에서 막는다.
            throw new IllegalStateException(
                    "app.email-verification.expose-link는 local/dev/test 프로파일에서만 사용할 수 있습니다.");
        }
        this.tokenTtl = Duration.ofSeconds(tokenTtlSeconds);
        this.verificationBaseUrl = verificationBaseUrl;
        this.exposeToken = exposeToken;
    }

    /** 인증 링크의 유효 시간을 반환한다. */
    public Duration tokenTtl() {
        return tokenTtl;
    }

    /** 응답과 로그에 토큰 원문을 노출해도 되는 개발 환경인지 반환한다. */
    public boolean exposeToken() {
        return exposeToken;
    }

    /**
     * 토큰 원문을 쿼리 파라미터로 붙인 인증 링크를 만든다.
     *
     * @param rawToken 메일로 전달할 토큰 원문
     * @return 프론트엔드 인증 완료 화면으로 이어지는 링크
     */
    public String verificationLink(String rawToken) {
        String separator = verificationBaseUrl.contains("?") ? "&" : "?";
        return verificationBaseUrl + separator + "token="
                + URLEncoder.encode(rawToken, StandardCharsets.UTF_8);
    }
}
