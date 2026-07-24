package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.auth.exception.InvalidAccessTokenException;
import com.ssafy.backend.config.jwt.JwtConfig;
import com.ssafy.backend.config.jwt.JwtProperties;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 실제 Nimbus 인코더·디코더를 사용해 JWT 발급 계약과 공격·오류 토큰 차단을 검증한다. */
class JwtTokenProviderTest {
    private static final Instant ISSUED_AT = Instant.now().truncatedTo(ChronoUnit.SECONDS);
    private static final String SECRET = "0123456789abcdef0123456789abcdef";

    private JwtEncoder encoder;
    private JwtDecoder decoder;
    private JwtTokenProvider provider;

    /** 고정된 HS256 비밀키와 만료 설정으로 실제 토큰 제공자를 구성한다. */
    @BeforeEach
        void setUp() {
        JwtProperties properties = new JwtProperties(SECRET, 3600, 1209600);
        JwtConfig config = new JwtConfig();
        SecretKey key = config.jwtSecretKey(properties);
        encoder = config.jwtEncoder(key);
        decoder = config.jwtDecoder(key);
        provider = new JwtTokenProvider(
                encoder,
                decoder,
                properties,
                Clock.fixed(ISSUED_AT, ZoneOffset.UTC)
        );
    }

    /** Access·Refresh Token의 알고리즘, Claim과 만료시간이 계약과 일치하는지 검증한다. */
    @Test
        void issuesHs256AccessAndRefreshTokensWithContractClaims() {
        User user = User.createActive(
                "melly01", "melly@example.com", "bcrypt", "melly",
                UserRole.FAN, PreferredLanguage.KOREAN
        );
        ReflectionTestUtils.setField(user, "id", 1L);

        IssuedTokens tokens = provider.issue(user);
        Jwt access = decoder.decode(tokens.accessToken());
        Jwt refresh = decoder.decode(tokens.refreshToken());

        assertThat(access.getHeaders().get("alg").toString()).isEqualTo("HS256");
        assertThat(access.getSubject()).isEqualTo("1");
        assertThat(access.getClaimAsString("role")).isEqualTo("FAN");
        assertThat(access.getClaimAsString("tokenType")).isEqualTo("access");
        assertThat(access.getIssuedAt()).isEqualTo(ISSUED_AT);
        assertThat(access.getExpiresAt()).isEqualTo(ISSUED_AT.plusSeconds(3600));

        assertThat(refresh.getHeaders().get("alg").toString()).isEqualTo("HS256");
        assertThat(refresh.getSubject()).isEqualTo("1");
        assertThat(refresh.getClaimAsString("tokenType")).isEqualTo("refresh");
        assertThat(refresh.hasClaim("role")).isFalse();
        assertThat(refresh.getExpiresAt()).isEqualTo(ISSUED_AT.plusSeconds(1209600));
        assertThat(tokens.expiresIn()).isEqualTo(3600);

        assertThat(provider.parseAccessToken(tokens.accessToken()))
                .isEqualTo(new AuthenticatedUser(1L, UserRole.FAN));
        assertThatThrownBy(() -> provider.parseAccessToken(tokens.refreshToken()))
                .isInstanceOf(InvalidAccessTokenException.class);
    }

    /** 위조·만료·무서명 토큰과 잘못된 sub·role Claim이 모두 거부되는지 검증한다. */
    @Test
        void rejectsTamperedExpiredUnsignedAndInvalidClaimTokens() {
        String valid = encode("1", "FAN", "access", ISSUED_AT, ISSUED_AT.plusSeconds(3600));
        String[] parts = valid.split("\\.");
        char replacement = parts[2].charAt(0) == 'a' ? 'b' : 'a';
        String tampered = parts[0] + "." + parts[1] + "." + replacement + parts[2].substring(1);

        assertInvalid(tampered);
        assertInvalid(encode("1", "FAN", "access", Instant.EPOCH, Instant.EPOCH.plusSeconds(1)));
        assertInvalid(unsignedToken());
        assertInvalid(encode("not-a-long", "FAN", "access", ISSUED_AT, ISSUED_AT.plusSeconds(3600)));
        assertInvalid(encode("1", "UNKNOWN", "access", ISSUED_AT, ISSUED_AT.plusSeconds(3600)));
        assertInvalid(encode("1", null, "access", ISSUED_AT, ISSUED_AT.plusSeconds(3600)));
    }

    /** 실패 시나리오별 Claim을 가진 HS256 테스트 토큰을 생성한다. */
    private String encode(String subject, String role, String tokenType, Instant issuedAt, Instant expiresAt) {
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .subject(subject)
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("tokenType", tokenType);
        if (role != null) {
            claims.claim("role", role);
        }
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
    }

    /** none 알고리즘을 선언한 무서명 JWT 문자열을 생성한다. */
    private String unsignedToken() {
        Base64.Encoder base64 = Base64.getUrlEncoder().withoutPadding();
        String header = base64.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8));
        String payload = base64.encodeToString(("{\"sub\":\"1\",\"role\":\"FAN\"," +
                "\"tokenType\":\"access\",\"iat\":1,\"exp\":4102444800}")
                .getBytes(StandardCharsets.UTF_8));
        return header + "." + payload + ".";
    }

    /** 주어진 토큰이 외부 공통 메시지의 Access Token 예외로 변환되는지 확인한다. */
    private void assertInvalid(String token) {
        assertThatThrownBy(() -> provider.parseAccessToken(token))
                .isInstanceOf(InvalidAccessTokenException.class)
                .hasMessage("Invalid or expired access token.");
    }
}
