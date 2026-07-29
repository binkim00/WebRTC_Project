package com.ssafy.backend.livekit.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.config.livekit.LiveKitProperties;
import livekit.LivekitWebhook;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LiveKitWebhookReceiverTest {

    private static final String API_KEY = "test-api-key";
    private static final String API_SECRET = "test-api-secret";

    /** 올바른 발급자와 본문 해시로 서명된 webhook을 SDK 이벤트로 변환하는지 검증한다. */
    @Test
    void receivesWebhookWithValidSignatureAndBodyHash() {
        String body = """
                {
                  "event": "participant_joined",
                  "id": "event-1",
                  "room": {"name": "meeting-room-1"},
                  "participant": {
                    "identity": "fan-identity",
                    "attributes": {"role": "FAN", "call_session_id": "100"}
                  }
                }
                """;

        LivekitWebhook.WebhookEvent event = receiver().receive(body, sign(body));

        assertThat(event.getEvent()).isEqualTo("participant_joined");
        assertThat(event.getId()).isEqualTo("event-1");
        assertThat(event.getParticipant().getAttributesMap())
                .containsEntry("call_session_id", "100");
    }

    /** 본문 해시와 일치하지 않는 Authorization 서명을 거부하는지 검증한다. */
    @Test
    void rejectsWebhookWhenBodyHashDoesNotMatch() {
        String body = """
                {"event":"participant_joined","id":"event-1"}
                """;

        assertThatThrownBy(() -> receiver().receive(body, sign("different-body")))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_LIVEKIT_WEBHOOK);
    }

    /** 테스트용 LiveKit 설정으로 webhook 검증 컴포넌트를 생성한다. */
    private LiveKitWebhookReceiver receiver() {
        LiveKitProperties properties = new LiveKitProperties();
        properties.setApiKey(API_KEY);
        properties.setApiSecret(API_SECRET);
        properties.setUrl("ws://localhost:7880");
        return new LiveKitWebhookReceiver(properties);
    }

    /**
     * LiveKit webhook 규격의 본문 SHA-256 claim을 포함한 Authorization 토큰을 생성한다.
     *
     * @param body 서명할 webhook 원본 본문
     * @return LiveKit 검증기가 수락할 JWT 문자열
     */
    private String sign(String body) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(body.getBytes(StandardCharsets.UTF_8));
            String bodyHash = Base64.getEncoder().encodeToString(digest);
            String header = base64Url("""
                    {"alg":"HS256","typ":"JWT"}
                    """);
            String payload = base64Url("""
                    {"iss":"%s","sha256":"%s"}
                    """.formatted(API_KEY, bodyHash));
            String unsignedToken = header + "." + payload;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    API_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(
                    mac.doFinal(unsignedToken.getBytes(StandardCharsets.UTF_8)));
            return unsignedToken + "." + signature;
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException(exception);
        }
    }

    /**
     * JWT header와 payload JSON을 Base64 URL 형식으로 변환한다.
     *
     * @param value 인코딩할 UTF-8 문자열
     * @return 패딩이 제거된 Base64 URL 문자열
     */
    private String base64Url(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
                value.getBytes(StandardCharsets.UTF_8));
    }
}
