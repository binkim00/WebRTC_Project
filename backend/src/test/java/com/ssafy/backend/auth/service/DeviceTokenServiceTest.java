package com.ssafy.backend.auth.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseCookie;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DeviceTokenServiceTest {

    private static final String SECRET = "device-token-test-secret-value";

    /** 기기 쿠키가 없으면 문서에 정한 보안 속성을 적용한 쿠키를 새로 발급하는지 검증한다. */
    @Test
    void issuesCookieWithSecurityAttributesWhenAbsent() {
        DeviceTokenService service = new DeviceTokenService(SECRET, 7776000L, true, "Lax");

        Optional<ResponseCookie> cookie = service.issueIfAbsent(null);

        assertThat(cookie).isPresent();
        ResponseCookie issued = cookie.get();
        assertThat(issued.getName()).isEqualTo("melly_device");
        assertThat(issued.getValue()).isNotBlank();
        // 프론트 스크립트가 값을 읽지 못해야 하므로 HttpOnly 는 반드시 켜져 있어야 한다.
        assertThat(issued.isHttpOnly()).isTrue();
        assertThat(issued.isSecure()).isTrue();
        assertThat(issued.getSameSite()).isEqualTo("Lax");
        assertThat(issued.getPath()).isEqualTo("/");
        assertThat(issued.getMaxAge().toDays()).isEqualTo(90L);
    }

    /** 이미 기기 쿠키가 있으면 값을 덮어쓰지 않는지 검증한다. */
    @Test
    void keepsExistingCookie() {
        DeviceTokenService service = new DeviceTokenService(SECRET, 7776000L, false, "Lax");

        assertThat(service.issueIfAbsent("existing-token")).isEmpty();
    }

    /** 빈 쿠키 값은 미발급으로 보고 새 토큰을 내려주는지 검증한다. */
    @Test
    void issuesCookieWhenExistingValueIsBlank() {
        DeviceTokenService service = new DeviceTokenService(SECRET, 7776000L, false, "Lax");

        assertThat(service.issueIfAbsent("   ")).isPresent();
    }

    /** 발급할 때마다 서로 다른 토큰을 만드는지 검증한다. */
    @Test
    void issuesDistinctTokens() {
        DeviceTokenService service = new DeviceTokenService(SECRET, 7776000L, false, "Lax");

        String first = service.issueIfAbsent(null).orElseThrow().getValue();
        String second = service.issueIfAbsent(null).orElseThrow().getValue();

        assertThat(first).isNotEqualTo(second);
    }

    /** 같은 토큰과 비밀값이면 항상 같은 해시가 나오는지 검증한다. */
    @Test
    void producesStableHashForSameToken() {
        DeviceTokenService service = new DeviceTokenService(SECRET, 7776000L, false, "Lax");

        String hash = service.hash("device-token");

        assertThat(hash).isEqualTo(service.hash("device-token"));
        // HMAC-SHA-256 결과는 32바이트이며 16진수로 64자다. device_hash 컬럼 길이와 맞아야 한다.
        assertThat(hash).hasSize(64);
        assertThat(hash).isNotEqualTo("device-token");
    }

    /** 비밀값이 다르면 같은 토큰이라도 다른 해시가 되는지 검증한다. */
    @Test
    void producesDifferentHashForDifferentSecret() {
        DeviceTokenService service = new DeviceTokenService(SECRET, 7776000L, false, "Lax");
        DeviceTokenService other = new DeviceTokenService("another-secret", 7776000L, false, "Lax");

        assertThat(service.hash("device-token")).isNotEqualTo(other.hash("device-token"));
    }

    /** 쿠키가 없는 요청은 해시도 없음으로 다뤄 응모를 막지 않는지 검증한다. */
    @Test
    void returnsNullHashWhenTokenMissing() {
        DeviceTokenService service = new DeviceTokenService(SECRET, 7776000L, false, "Lax");

        assertThat(service.hash(null)).isNull();
        assertThat(service.hash("  ")).isNull();
    }

    /** 비밀값을 설정하지 않은 채로 기동하지 못하게 막는지 검증한다. */
    @Test
    void rejectsEmptySecret() {
        assertThatThrownBy(() -> new DeviceTokenService("  ", 7776000L, false, "Lax"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
