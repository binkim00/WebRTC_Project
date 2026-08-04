package com.ssafy.backend.auth.support;

import com.ssafy.backend.common.security.HmacTokenHasher;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 브라우저 단위 기기 식별에 사용하는 서버 발급 토큰을 관리한다.
 *
 * <p>토큰 원문은 서버가 만든 256비트 난수이며 HttpOnly 쿠키로만 오간다. 프론트엔드가 값을 만들거나
 * 헤더로 보내는 구조를 두면 임의 값으로 갈아 끼워 탐지를 우회할 수 있으므로 허용하지 않는다.
 * 저장·비교에는 원문이 아니라 HMAC-SHA-256 해시만 사용한다.
 *
 * <p>사람 단위 식별이 아니라 재사용 비용을 올리는 보조 신호이므로, 쿠키를 지우면 새 기기로 보인다는
 * 한계를 전제로 사용한다.
 */
@Component
public class DeviceTokenService {

    /** 기기 토큰 난수 길이이며 문서 기준인 256비트를 사용한다. */
    private static final int TOKEN_BYTES = 32;

    /** 서버가 발급한 base64url 토큰 형식만 받아들여 임의 값 주입을 걸러낸다. */
    private static final Pattern TOKEN_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{43}$");

    private final String cookieName;
    private final boolean secureCookie;
    private final String sameSite;
    private final Duration cookieMaxAge;
    private final HmacTokenHasher tokenHasher;
    private final SecureRandom secureRandom = new SecureRandom();

    /**
     * 기기 토큰 쿠키 속성과 해시 비밀값을 주입받는다.
     *
     * @param cookieName 기기 토큰을 담을 쿠키 이름
     * @param secureCookie HTTPS 전용 전송 여부이며 운영에서는 반드시 true여야 한다
     * @param sameSite 교차 도메인 구조에 맞춘 SameSite 값(Lax 또는 None)
     * @param cookieMaxAgeDays 기기 식별 보관 기간(일)
     * @param hmacSecret 해시 계산에 사용할 비밀값이며 미설정 시 JWT 비밀값을 사용한다
     * @throws IllegalArgumentException 보관 기간이 1보다 작거나 SameSite=None인데 Secure가 꺼진 경우
     */
    public DeviceTokenService(
            @Value("${app.device-token.cookie-name:melly_device}") String cookieName,
            @Value("${app.device-token.secure:true}") boolean secureCookie,
            @Value("${app.device-token.same-site:Lax}") String sameSite,
            @Value("${app.device-token.max-age-days:90}") long cookieMaxAgeDays,
            @Value("${app.device-token.secret:${jwt.secret}}") String hmacSecret
    ) {
        if (cookieMaxAgeDays < 1) {
            throw new IllegalArgumentException("Device token cookie max age must be positive.");
        }
        if ("None".equalsIgnoreCase(sameSite) && !secureCookie) {
            // SameSite=None 쿠키는 Secure 없이는 브라우저가 폐기해 탐지 자체가 동작하지 않는다.
            throw new IllegalArgumentException("SameSite=None device cookie requires Secure=true.");
        }
        this.cookieName = cookieName;
        this.secureCookie = secureCookie;
        this.sameSite = sameSite;
        this.cookieMaxAge = Duration.ofDays(cookieMaxAgeDays);
        this.tokenHasher = new HmacTokenHasher(hmacSecret);
    }

    /**
     * 새 기기 토큰을 발급해 쿠키로 내려보내고 해시를 반환한다.
     *
     * @param response 쿠키를 실을 HTTP 응답
     * @return 발급한 토큰의 HMAC-SHA-256 해시
     */
    public String issue(HttpServletResponse response) {
        String rawToken = generateToken();
        response.addHeader(HttpHeaders.SET_COOKIE, buildCookie(rawToken).toString());
        return tokenHasher.hash(rawToken);
    }

    /**
     * 요청에 담긴 기기 토큰 쿠키의 해시를 반환한다.
     *
     * @param request 쿠키를 읽을 HTTP 요청
     * @return 유효한 형식의 쿠키가 있으면 해시를 담은 Optional, 없으면 비어 있는 Optional
     */
    public Optional<String> resolveHash(HttpServletRequest request) {
        return readRawToken(request).map(tokenHasher::hash);
    }

    /**
     * 기기 토큰 쿠키가 있으면 그 해시를, 없으면 새로 발급한 토큰의 해시를 반환한다.
     *
     * <p>쿠키를 지우고 다시 접속하면 새 기기로 보이지만, 최소한 이후 요청부터는 같은 기기로 묶인다.
     *
     * @param request 쿠키를 읽을 HTTP 요청
     * @param response 새로 발급할 때 쿠키를 실을 HTTP 응답
     * @return 이번 요청에 사용할 기기 토큰 해시
     */
    public String resolveOrIssueHash(HttpServletRequest request, HttpServletResponse response) {
        return resolveHash(request).orElseGet(() -> issue(response));
    }

    /** 요청 쿠키에서 서버가 발급한 형식의 토큰 원문만 골라 읽는다. */
    private Optional<String> readRawToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        return Arrays.stream(cookies)
                .filter(cookie -> cookieName.equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && TOKEN_PATTERN.matcher(value).matches())
                .findFirst();
    }

    /** HttpOnly·Secure·SameSite 속성을 적용한 기기 토큰 쿠키를 만든다. */
    private ResponseCookie buildCookie(String rawToken) {
        return ResponseCookie.from(cookieName, rawToken)
                // 프론트 JavaScript가 값을 읽거나 바꿀 수 없어야 한다.
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite(sameSite)
                .path("/")
                .maxAge(cookieMaxAge)
                .build();
    }

    /** 쿠키 값으로 그대로 실을 수 있는 256비트 난수 토큰을 생성한다. */
    private String generateToken() {
        byte[] token = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(token);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(token);
    }
}
