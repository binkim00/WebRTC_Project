package com.ssafy.backend.livekit.service;

import com.ssafy.backend.config.livekit.LiveKitProperties;
import com.ssafy.backend.livekit.dto.LiveKitTokenResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class LiveKitTokenServiceTest {

    private static final String LIVEKIT_URL = "wss://test.livekit.invalid";
    private static final Pattern EXPIRATION_PATTERN = Pattern.compile("\\\"exp\\\":(\\d+)");

    private LiveKitTokenService tokenService;

    /** 외부 LiveKit 서버 없이 토큰 생성 로직을 검증할 테스트 설정과 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        LiveKitProperties properties = new LiveKitProperties();
        properties.setUrl(LIVEKIT_URL);
        properties.setApiKey("test-api-key");
        properties.setApiSecret("test-api-secret");
        tokenService = new LiveKitTokenService(properties);
    }

    /** 서로 다른 사용자에게 같은 테스트 방의 서로 다른 JWT가 발급되는지 확인한다. */
    @Test
    void issuesTokensForDifferentIdentitiesInTheSameTestRoom() {
        long issuedAt = Instant.now().getEpochSecond();

        LiveKitTokenResponse first = tokenService.createTestToken("test-user-1", "테스트 사용자 1", null);
        LiveKitTokenResponse second = tokenService.createTestToken("test-user-2", null, null);

        assertThat(first.liveKitUrl()).isEqualTo(LIVEKIT_URL);
        assertThat(first.roomName()).isEqualTo("test-room");
        assertThat(second.roomName()).isEqualTo("test-room");
        assertThat(first.identity()).isEqualTo("test-user-1");
        assertThat(second.identity()).isEqualTo("test-user-2");
        assertThat(first.accessToken()).isNotEqualTo(second.accessToken());

        assertTokenClaims(first.accessToken(), "test-user-1", issuedAt);
        assertTokenClaims(second.accessToken(), "test-user-2", issuedAt);
    }

    /** JWT payload를 디코딩해 사용자, 방, 미디어 권한 및 만료 시간을 검증한다. */
    private void assertTokenClaims(String token, String identity, long issuedAt) {
        String[] parts = token.split("\\.");
        assertThat(parts).hasSize(3);

        String payload = new String(
                Base64.getUrlDecoder().decode(parts[1]),
                StandardCharsets.UTF_8
        );

        assertThat(payload)
                .contains("\"sub\":\"" + identity + "\"")
                .contains("\"room\":\"test-room\"")
                .contains("\"roomJoin\":true")
                .contains("\"canPublish\":true")
                .contains("\"canSubscribe\":true");

        Matcher matcher = EXPIRATION_PATTERN.matcher(payload);
        assertThat(matcher.find()).isTrue();
        long expiration = Long.parseLong(matcher.group(1));
        assertThat(expiration).isBetween(issuedAt + 590, issuedAt + 610);
    }
}
