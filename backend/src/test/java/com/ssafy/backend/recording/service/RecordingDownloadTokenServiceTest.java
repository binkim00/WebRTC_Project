package com.ssafy.backend.recording.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.config.jwt.JwtProperties;
import com.ssafy.backend.recording.config.RecordingStorageProperties;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class RecordingDownloadTokenServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-31T02:00:00Z");
    private static final long TTL_SECONDS = 600L;
    private static final long RECORDING_ID = 42L;
    private static final long USER_ID = 7L;

    /** 발급한 토큰이 같은 녹화·사용자로 검증되고 10분 유효기간을 갖는지 검증한다. */
    @Test
    void issuesTokenValidForConfiguredTtl() {
        RecordingDownloadTokenService service = service(NOW);

        var issued = service.issue(RECORDING_ID, USER_ID);

        assertThat(issued.expiresInSeconds()).isEqualTo(TTL_SECONDS);
        assertThat(issued.expiresAt()).isEqualTo(NOW.plusSeconds(TTL_SECONDS));
        assertThat(service.verifyAndGetUserId(issued.token(), RECORDING_ID)).isEqualTo(USER_ID);
    }

    /** 만료 직전에는 통과하고 만료 이후에는 거부되는지 검증한다. */
    @Test
    void rejectsTokenAfterExpiry() {
        String token = service(NOW).issue(RECORDING_ID, USER_ID).token();

        RecordingDownloadTokenService atExpiry = service(NOW.plusSeconds(TTL_SECONDS));
        assertThat(atExpiry.verifyAndGetUserId(token, RECORDING_ID)).isEqualTo(USER_ID);

        RecordingDownloadTokenService afterExpiry = service(NOW.plusSeconds(TTL_SECONDS + 1));
        assertThat(errorCodeOf(afterExpiry, token, RECORDING_ID))
                .isEqualTo(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
    }

    /** 본문을 바꾼 토큰이 서명 검증에서 거부되는지 검증한다. */
    @Test
    void rejectsTamperedPayload() {
        RecordingDownloadTokenService service = service(NOW);
        String token = service.issue(RECORDING_ID, USER_ID).token();
        int separator = token.lastIndexOf('.');
        String signature = token.substring(separator);

        // 다른 사용자·다른 만료 시각으로 본문만 바꾸고 서명은 그대로 붙인다.
        String forgedPayload = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString((RECORDING_ID + "|999|" + (NOW.getEpochSecond() + 99_999))
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));

        assertThat(errorCodeOf(service, forgedPayload + signature, RECORDING_ID))
                .isEqualTo(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
    }

    /** 서명을 바꾼 토큰이 거부되는지 검증한다. */
    @Test
    void rejectsTamperedSignature() {
        RecordingDownloadTokenService service = service(NOW);
        String token = service.issue(RECORDING_ID, USER_ID).token();
        int separator = token.lastIndexOf('.');
        String payload = token.substring(0, separator + 1);

        assertThat(errorCodeOf(service, payload + "AAAAAAAAAAAAAAAAAAAAAAAAAAAA", RECORDING_ID))
                .isEqualTo(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
    }

    /** 다른 녹화의 토큰을 경로만 바꿔 쓰면 거부되는지 검증한다. */
    @Test
    void rejectsTokenIssuedForAnotherRecording() {
        RecordingDownloadTokenService service = service(NOW);
        String token = service.issue(RECORDING_ID, USER_ID).token();

        assertThat(errorCodeOf(service, token, RECORDING_ID + 1))
                .isEqualTo(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
    }

    /** 다른 비밀값으로 만든 토큰이 거부되는지 검증한다. */
    @Test
    void rejectsTokenSignedWithAnotherSecret() {
        String foreignToken = new RecordingDownloadTokenService(
                new JwtProperties("ffffffffffffffffffffffffffffffff", 3600, 1_209_600),
                properties(),
                Clock.fixed(NOW, ZoneOffset.UTC)
        ).issue(RECORDING_ID, USER_ID).token();

        assertThat(errorCodeOf(service(NOW), foreignToken, RECORDING_ID))
                .isEqualTo(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
    }

    /** 형식이 잘못된 토큰이 거부되는지 검증한다. */
    @Test
    void rejectsMalformedTokens() {
        RecordingDownloadTokenService service = service(NOW);

        for (String token : new String[]{null, "", "   ", "signature-only", ".abc", "abc.",
                "!!!.!!!", "a.b.c"}) {
            assertThat(errorCodeOf(service, token, RECORDING_ID))
                    .as("잘못된 토큰 %s 는 거부해야 한다", token)
                    .isEqualTo(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
        }
    }

    /** 같은 입력으로 발급해도 만료 시각이 달라지면 토큰이 달라지는지 검증한다. */
    @Test
    void issuesDifferentTokenWhenExpiryChanges() {
        String first = service(NOW).issue(RECORDING_ID, USER_ID).token();
        String later = service(NOW.plus(Duration.ofSeconds(5))).issue(RECORDING_ID, USER_ID).token();

        assertThat(first).isNotEqualTo(later);
    }

    /** 고정 시각을 사용하는 토큰 서비스를 만든다. */
    private RecordingDownloadTokenService service(Instant now) {
        return new RecordingDownloadTokenService(
                new JwtProperties("0123456789abcdef0123456789abcdef", 3600, 1_209_600),
                properties(),
                Clock.fixed(now, ZoneOffset.UTC)
        );
    }

    /** 토큰 유효 시간만 사용하는 설정을 만든다. */
    private RecordingStorageProperties properties() {
        return new RecordingStorageProperties("/tmp/melly-test", 7, TTL_SECONDS, 600_000L, 2048L);
    }

    /** 검증이 거부될 때의 오류 코드를 돌려주며 통과했으면 null을 돌려준다. */
    private ErrorCode errorCodeOf(RecordingDownloadTokenService service, String token,
                                  long recordingId) {
        try {
            service.verifyAndGetUserId(token, recordingId);
            return null;
        } catch (BusinessException exception) {
            return exception.getErrorCode();
        }
    }
}
