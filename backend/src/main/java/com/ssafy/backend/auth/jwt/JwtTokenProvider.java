package com.ssafy.backend.auth.jwt;

import com.ssafy.backend.auth.exception.InvalidAccessTokenException;
import com.ssafy.backend.config.jwt.JwtProperties;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Clock;
import java.time.Instant;

/** 계약에 맞는 Access·Refresh Token을 발급하고 Access Token의 필수 조건을 검증한다. */
@Component
public class JwtTokenProvider {
    private static final String CLAIM_ROLE = "role";
    private static final String CLAIM_TOKEN_TYPE = "tokenType";
    private static final String ACCESS_TOKEN_TYPE = "access";
    private static final String REFRESH_TOKEN_TYPE = "refresh";

    private final JwtEncoder jwtEncoder;
    private final JwtDecoder jwtDecoder;
    private final JwtProperties properties;
    private final Clock clock;

    /** JWT 인코더·디코더, 만료 설정과 발급시각 계산용 시계를 주입받는다. */
    public JwtTokenProvider(JwtEncoder jwtEncoder, JwtDecoder jwtDecoder,
                            JwtProperties properties, Clock clock) {
        this.jwtEncoder = jwtEncoder;
        this.jwtDecoder = jwtDecoder;
        this.properties = properties;
        this.clock = clock;
    }

    /** 사용자 ID와 역할을 기반으로 Access Token과 저장하지 않는 Refresh Token을 발급한다. */
    public IssuedTokens issue(User user) {
        Instant issuedAt = clock.instant();
        String subject = user.getId().toString();

        String accessToken = encode(JwtClaimsSet.builder()
                .subject(subject)
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plusSeconds(properties.accessExpiration()))
                .claim(CLAIM_ROLE, user.getRole().name())
                .claim(CLAIM_TOKEN_TYPE, ACCESS_TOKEN_TYPE)
                .build());

        String refreshToken = encode(JwtClaimsSet.builder()
                .subject(subject)
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plusSeconds(properties.refreshExpiration()))
                .claim(CLAIM_TOKEN_TYPE, REFRESH_TOKEN_TYPE)
                .build());

        return new IssuedTokens(accessToken, refreshToken, properties.accessExpiration());
    }

    /** 서명·만료·tokenType·sub·role을 검증하고 인증 principal을 반환한다. */
    public AuthenticatedUser parseAccessToken(String token) {
        try {
            // 디코더가 서명과 만료시간을 먼저 검증한 뒤 애플리케이션 전용 Claim을 검사한다.
            Jwt jwt = jwtDecoder.decode(token);
            if (!ACCESS_TOKEN_TYPE.equals(jwt.getClaimAsString(CLAIM_TOKEN_TYPE))
                    || jwt.getExpiresAt() == null) {
                throw new InvalidAccessTokenException();
            }

            String subject = jwt.getSubject();
            String roleClaim = jwt.getClaimAsString(CLAIM_ROLE);
            if (!StringUtils.hasText(subject) || !StringUtils.hasText(roleClaim)) {
                throw new InvalidAccessTokenException();
            }

            return new AuthenticatedUser(Long.valueOf(subject), UserRole.valueOf(roleClaim));
        } catch (InvalidAccessTokenException exception) {
            throw exception;
        } catch (JwtException | IllegalArgumentException exception) {
            // 파싱 실패 원인은 내부에 보존하되 외부에는 하나의 토큰 오류 계약만 노출한다.
            throw new InvalidAccessTokenException(exception);
        }
    }

    /** 주어진 Claim 집합을 HS256으로 서명하여 Compact JWT 문자열로 변환한다. */
    private String encode(JwtClaimsSet claims) {
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}
