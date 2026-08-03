package com.ssafy.backend.auth.support;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 서버 발급 기기 토큰의 쿠키 속성과 해시 처리를 검증한다. */
class DeviceTokenServiceTest {

    private static final String SECRET = "0123456789abcdef0123456789abcdef";
    private static final String COOKIE_NAME = "melly_device";

    private final DeviceTokenService deviceTokenService =
            new DeviceTokenService(COOKIE_NAME, true, "Lax", 90, SECRET);

    /** 발급한 쿠키가 HttpOnly·Secure·SameSite·Path 속성을 갖는지 검증한다. */
    @Test
    void issuesHardenedCookie() {
        MockHttpServletResponse response = new MockHttpServletResponse();

        deviceTokenService.issue(response);

        String setCookie = response.getHeader("Set-Cookie");
        assertThat(setCookie).isNotNull();
        assertThat(setCookie).startsWith(COOKIE_NAME + "=");
        assertThat(setCookie).contains("HttpOnly");
        assertThat(setCookie).contains("Secure");
        assertThat(setCookie).contains("SameSite=Lax");
        assertThat(setCookie).contains("Path=/");
        assertThat(setCookie).contains("Max-Age=7776000");
    }

    /** 발급 결과가 원문이 아니라 64자리 16진 해시인지 검증한다. */
    @Test
    void returnsHashInsteadOfRawToken() {
        MockHttpServletResponse response = new MockHttpServletResponse();

        String hash = deviceTokenService.issue(response);

        assertThat(hash).hasSize(64).matches("[0-9a-f]{64}");
        assertThat(response.getHeader("Set-Cookie")).doesNotContain(hash);
    }

    /** 같은 쿠키 값은 항상 같은 해시로, 다른 값은 다른 해시로 변환되는지 검증한다. */
    @Test
    void resolvesStableHashFromCookie() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        deviceTokenService.issue(response);
        String rawToken = issuedCookieValue(response);

        Optional<String> first = deviceTokenService.resolveHash(requestWithCookie(rawToken));
        Optional<String> second = deviceTokenService.resolveHash(requestWithCookie(rawToken));

        assertThat(first).isPresent().isEqualTo(second);
    }

    /** 쿠키가 없으면 해시를 만들지 않는지 검증한다. */
    @Test
    void returnsEmptyWithoutCookie() {
        assertThat(deviceTokenService.resolveHash(new MockHttpServletRequest())).isEmpty();
    }

    /** 서버가 발급한 형식이 아닌 임의 쿠키 값을 무시하는지 검증한다. */
    @Test
    void ignoresTamperedCookieValue() {
        assertThat(deviceTokenService.resolveHash(requestWithCookie("attacker-supplied"))).isEmpty();
    }

    /** 쿠키가 없을 때 새 토큰을 발급하고 해시를 돌려주는지 검증한다. */
    @Test
    void issuesNewTokenWhenCookieMissing() {
        MockHttpServletResponse response = new MockHttpServletResponse();

        String hash = deviceTokenService.resolveOrIssueHash(new MockHttpServletRequest(), response);

        assertThat(hash).hasSize(64);
        assertThat(response.getHeader("Set-Cookie")).isNotNull();
    }

    /** 쿠키가 있으면 새로 발급하지 않고 기존 값을 그대로 쓰는지 검증한다. */
    @Test
    void keepsExistingCookie() {
        MockHttpServletResponse issued = new MockHttpServletResponse();
        String existingHash = deviceTokenService.issue(issued);
        MockHttpServletResponse response = new MockHttpServletResponse();

        String hash = deviceTokenService.resolveOrIssueHash(
                requestWithCookie(issuedCookieValue(issued)), response
        );

        assertThat(hash).isEqualTo(existingHash);
        assertThat(response.getHeader("Set-Cookie")).isNull();
    }

    /** SameSite=None인데 Secure가 꺼진 설정을 기동 단계에서 거부하는지 검증한다. */
    @Test
    void rejectsInsecureSameSiteNoneConfiguration() {
        assertThatThrownBy(() -> new DeviceTokenService(COOKIE_NAME, false, "None", 90, SECRET))
                .isInstanceOf(IllegalArgumentException.class);
    }

    /** 32바이트 미만 비밀값을 거부하는지 검증한다. */
    @Test
    void rejectsShortSecret() {
        assertThatThrownBy(() -> new DeviceTokenService(COOKIE_NAME, true, "Lax", 90, "short"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    /** 응답 Set-Cookie 헤더에서 토큰 원문만 잘라낸다. */
    private String issuedCookieValue(MockHttpServletResponse response) {
        String setCookie = response.getHeader("Set-Cookie");
        int start = setCookie.indexOf('=') + 1;
        int end = setCookie.indexOf(';', start);
        return setCookie.substring(start, end);
    }

    /** 기기 토큰 쿠키를 담은 요청을 만든다. */
    private MockHttpServletRequest requestWithCookie(String value) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(COOKIE_NAME, value));
        return request;
    }
}
