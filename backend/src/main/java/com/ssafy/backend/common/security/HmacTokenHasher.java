package com.ssafy.backend.common.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;

/**
 * 비밀값을 사용한 HMAC-SHA-256 해시를 만든다.
 *
 * <p>인증 토큰과 기기 토큰은 원문을 저장하지 않고 이 해시만 남긴다. 단순 SHA-256과 달리
 * 서버 비밀값을 모르면 후보 값을 대입해 해시를 역산할 수 없으므로, DB만 유출된 상황에서도
 * 저장된 값으로 유효한 토큰을 만들 수 없다.
 */
public final class HmacTokenHasher {

    private static final String ALGORITHM = "HmacSHA256";
    private static final int MIN_SECRET_BYTES = 32;

    private final SecretKeySpec secretKey;

    /**
     * 해시 계산에 사용할 비밀값으로 해셔를 생성한다.
     *
     * @param secret 32바이트 이상의 서버 비밀값
     * @throws IllegalArgumentException 비밀값이 비었거나 32바이트보다 짧은 경우
     */
    public HmacTokenHasher(String secret) {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalArgumentException("HMAC secret must be at least 32 bytes.");
        }
        this.secretKey = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITHM);
    }

    /**
     * 토큰 원문의 HMAC-SHA-256 해시를 소문자 16진 문자열로 반환한다.
     *
     * @param rawToken 해시할 토큰 원문
     * @return 64자리 16진 해시 문자열
     * @throws IllegalStateException HMAC 알고리즘을 사용할 수 없는 경우
     */
    public String hash(String rawToken) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(secretKey);
            return HexFormat.of().formatHex(mac.doFinal(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("HmacSHA256 algorithm is not available.", exception);
        }
    }
}
