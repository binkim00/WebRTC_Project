package com.ssafy.backend.recording.service;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.config.jwt.JwtProperties;
import com.ssafy.backend.recording.config.RecordingStorageProperties;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;

/**
 * 녹화 재생·다운로드에 사용할 단기 토큰을 발급하고 검증한다.
 *
 * <p>브라우저의 {@code <video>} 태그는 Authorization 헤더를 보낼 수 없으므로 URL에 담을 수 있는
 * 토큰이 필요하다. 토큰은 녹화 식별자·사용자 식별자·만료 시각을 담고 HMAC-SHA256으로 서명하므로
 * 값을 바꾸면 검증에 실패한다. 서버가 상태를 저장하지 않아 재시작 후에도 그대로 검증된다.
 *
 * <p>서명 키는 JWT 비밀값에서 녹화 전용 문맥 문자열로 한 번 더 유도한다. 그래서 이 토큰으로는
 * 인증 토큰을 만들 수 없고, 인증 토큰으로도 이 토큰을 위조할 수 없다.
 */
@Service
public class RecordingDownloadTokenService {

    /** 서명 키를 인증 토큰과 분리하기 위한 문맥 문자열이다. */
    private static final String KEY_CONTEXT = "melly-recording-download-v1";

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    /** 토큰 본문 항목 구분자이며 식별자와 시각에는 나타나지 않는 문자다. */
    private static final String PAYLOAD_DELIMITER = ".";

    private final byte[] signingKey;
    private final long tokenTtlSeconds;
    private final Clock clock;

    /**
     * JWT 비밀값에서 녹화 전용 서명 키를 유도하고 토큰 유효 시간을 설정한다.
     *
     * @param jwtProperties JWT 설정이며 비밀값만 키 유도에 사용한다
     * @param recordingProperties 녹화 저장 설정
     * @param clock 만료 판정 기준 시계
     */
    public RecordingDownloadTokenService(JwtProperties jwtProperties,
                                         RecordingStorageProperties recordingProperties,
                                         Clock clock) {
        this.signingKey = deriveKey(jwtProperties.secret());
        this.tokenTtlSeconds = recordingProperties.downloadTokenTtlSeconds();
        this.clock = clock;
    }

    /**
     * 지정한 사용자가 지정한 녹화를 내려받을 수 있는 단기 토큰을 발급한다.
     *
     * @param recordingId 녹화 식별자
     * @param userId 토큰을 사용할 사용자 식별자
     * @return URL에 담을 수 있는 서명 토큰
     */
    public IssuedDownloadToken issue(Long recordingId, Long userId) {
        Instant expiresAt = clock.instant().plusSeconds(tokenTtlSeconds);
        String payload = payload(recordingId, userId, expiresAt.getEpochSecond());
        String token = encode(payload) + PAYLOAD_DELIMITER + encode(sign(payload));
        return new IssuedDownloadToken(token, expiresAt, tokenTtlSeconds);
    }

    /**
     * 토큰의 서명과 만료를 검증하고 사용할 수 있는 사용자 식별자를 돌려준다.
     *
     * @param token 발급된 토큰
     * @param recordingId 요청 경로의 녹화 식별자
     * @return 토큰이 가리키는 사용자 식별자
     * @throws BusinessException 형식이 잘못되었거나 서명이 맞지 않거나 만료된 경우
     */
    public Long verifyAndGetUserId(String token, Long recordingId) {
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
        }
        int separator = token.lastIndexOf(PAYLOAD_DELIMITER);
        if (separator <= 0 || separator == token.length() - 1) {
            throw new BusinessException(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
        }

        String payload = decode(token.substring(0, separator));
        byte[] signature = decodeBytes(token.substring(separator + 1));
        // 서명을 먼저 확인해야 내용이 조작된 토큰의 본문을 해석하지 않는다.
        if (!MessageDigest.isEqual(sign(payload), signature)) {
            throw new BusinessException(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
        }

        String[] parts = payload.split("\\|");
        if (parts.length != 3) {
            throw new BusinessException(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
        }
        long tokenRecordingId = parseLong(parts[0]);
        long tokenUserId = parseLong(parts[1]);
        long expiresAtEpochSecond = parseLong(parts[2]);

        if (recordingId == null || tokenRecordingId != recordingId) {
            // 다른 녹화의 토큰을 가져와 경로만 바꾼 요청을 막는다.
            throw new BusinessException(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
        }
        if (clock.instant().getEpochSecond() > expiresAtEpochSecond) {
            throw new BusinessException(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
        }
        return tokenUserId;
    }

    /**
     * 발급된 다운로드 토큰과 만료 정보다.
     *
     * @param token 서명 토큰
     * @param expiresAt 만료 시각
     * @param expiresInSeconds 남은 유효 시간(초)
     */
    public record IssuedDownloadToken(String token, Instant expiresAt, long expiresInSeconds) {
    }

    /** 토큰 본문을 만든다. */
    private String payload(Long recordingId, Long userId, long expiresAtEpochSecond) {
        return recordingId + "|" + userId + "|" + expiresAtEpochSecond;
    }

    /** 본문을 HMAC-SHA256으로 서명한다. */
    private byte[] sign(String payload) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(signingKey, HMAC_ALGORITHM));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("녹화 다운로드 토큰을 서명하지 못했습니다.", exception);
        }
    }

    /** JWT 비밀값에서 녹화 전용 서명 키를 유도한다. */
    private byte[] deriveKey(String secret) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return mac.doFinal(KEY_CONTEXT.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("녹화 다운로드 서명 키를 만들지 못했습니다.", exception);
        }
    }

    /** URL에 안전한 base64로 문자열을 인코딩한다. */
    private String encode(String value) {
        return encode(value.getBytes(StandardCharsets.UTF_8));
    }

    /** URL에 안전한 base64로 바이트를 인코딩한다. */
    private String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    /** URL에 안전한 base64 문자열을 원래 문자열로 되돌린다. */
    private String decode(String value) {
        return new String(decodeBytes(value), StandardCharsets.UTF_8);
    }

    /** URL에 안전한 base64 문자열을 바이트로 되돌린다. */
    private byte[] decodeBytes(String value) {
        try {
            return Base64.getUrlDecoder().decode(value);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
        }
    }

    /** 토큰 본문의 숫자를 읽고 형식이 잘못되면 무효 토큰으로 처리한다. */
    private long parseLong(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw new BusinessException(ErrorCode.RECORDING_DOWNLOAD_TOKEN_INVALID);
        }
    }
}
