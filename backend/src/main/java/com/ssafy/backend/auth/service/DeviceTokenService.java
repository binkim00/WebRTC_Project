package com.ssafy.backend.auth.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

/**
 * 브라우저 단위 기기 토큰을 발급하고 저장용 해시를 계산한다.
 *
 * <p>원문 토큰은 HttpOnly 쿠키로만 오가고 서버는 HMAC-SHA-256 결과만 다룬다. 하드웨어 지문이나
 * MAC 주소를 수집하지 않으므로 사람 단위 식별이 아니라 우회 비용을 올리는 보조 신호로만 쓴다.
 * 비밀값이 없는 단순 해시를 저장하면 값이 유출됐을 때 다른 기기 해시와 대조할 수 있어 HMAC을 쓴다.
 */
@Component
public class DeviceTokenService {

    /** 기기 토큰을 담는 쿠키 이름이다. */
    public static final String COOKIE_NAME = "melly_device";

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final int TOKEN_BYTE_LENGTH = 32;

    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKeySpec secretKey;
    private final Duration cookieMaxAge;
    private final boolean cookieSecure;
    private final String cookieSameSite;

    /**
     * 해시 비밀값과 쿠키 속성 정책을 주입받는다.
     *
     * @param hmacSecret 기기 토큰 해시에 사용할 비밀값
     * @param cookieMaxAgeSeconds 쿠키 수명(초)
     * @param cookieSecure HTTPS 전용 전송 여부
     * @param cookieSameSite SameSite 정책 값
     * @throws IllegalArgumentException 비밀값이 비어 있는 경우
     */
    public DeviceTokenService(
            @Value("${app.device.hmac-secret}") String hmacSecret,
            @Value("${app.device.cookie-max-age-seconds}") long cookieMaxAgeSeconds,
            @Value("${app.device.cookie-secure}") boolean cookieSecure,
            @Value("${app.device.cookie-same-site}") String cookieSameSite
    ) {
        if (!StringUtils.hasText(hmacSecret)) {
            throw new IllegalArgumentException("Device token secret must not be empty.");
        }
        this.secretKey = new SecretKeySpec(hmacSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
        this.cookieMaxAge = Duration.ofSeconds(cookieMaxAgeSeconds);
        this.cookieSecure = cookieSecure;
        this.cookieSameSite = cookieSameSite;
    }

    /**
     * 기기 쿠키가 없을 때만 새 토큰을 담은 쿠키를 만든다.
     *
     * <p>이미 쿠키를 가진 브라우저에 새 값을 내려주면 같은 기기가 매번 다른 기기로 보여
     * 중복 판정이 무력화되므로 기존 값은 그대로 유지한다.
     *
     * @param existingCookieValue 요청에 담겨 온 기기 쿠키 값이며 없으면 {@code null}
     * @return 새로 내려줄 쿠키이며 기존 쿠키가 있으면 비어 있는 결과
     */
    public Optional<ResponseCookie> issueIfAbsent(String existingCookieValue) {
        if (StringUtils.hasText(existingCookieValue)) {
            return Optional.empty();
        }
        return Optional.of(cookie(generateToken()));
    }

    /**
     * 기기 쿠키 값을 저장·비교용 해시로 변환한다.
     *
     * @param rawToken 쿠키에 담긴 원문 기기 토큰이며 없으면 {@code null}
     * @return 16진수로 표현한 HMAC-SHA-256 해시이며 토큰이 없으면 {@code null}
     */
    public String hash(String rawToken) {
        if (!StringUtils.hasText(rawToken)) {
            return null;
        }
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(secretKey);
            return HexFormat.of().formatHex(mac.doFinal(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("HmacSHA256 algorithm is not available.", exception);
        }
    }

    /**
     * 정책에 맞는 속성을 적용한 기기 쿠키를 만든다.
     *
     * @param rawToken 쿠키에 담을 원문 토큰
     * @return 발급할 응답 쿠키
     */
    private ResponseCookie cookie(String rawToken) {
        return ResponseCookie.from(COOKIE_NAME, rawToken)
                // 프론트 스크립트가 값을 읽거나 조작하지 못하게 한다.
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSameSite)
                // 인증과 응모 요청이 함께 사용하므로 경로를 제한하지 않는다.
                .path("/")
                .maxAge(cookieMaxAge)
                .build();
    }

    /**
     * 추측할 수 없는 기기 토큰을 생성한다.
     *
     * @return 패딩 없는 Base64 URL 인코딩 토큰
     */
    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTE_LENGTH];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
