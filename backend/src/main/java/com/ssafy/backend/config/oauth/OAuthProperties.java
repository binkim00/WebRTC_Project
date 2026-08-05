package com.ssafy.backend.config.oauth;

import com.ssafy.backend.auth.domain.SocialProvider;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * 소셜 로그인 공급자별 클라이언트 자격 증명과 콜백 주소 설정을 바인딩한다.
 *
 * <p>클라이언트 ID·시크릿에 {@code @NotBlank}를 걸지 않는다. 세 공급자를 모두 설정하지 않은
 * 환경(테스트, 일부 공급자만 발급받은 개발 환경)에서도 애플리케이션이 떠야 하고, 설정되지 않은
 * 공급자는 요청이 들어온 시점에 안내 문구와 함께 거절하는 편이 원인을 찾기 쉽다.
 */
@Validated
@ConfigurationProperties(prefix = "app.oauth")
public record OAuthProperties(
        @NotBlank String redirectBaseUrl,
        @Positive long pendingTtlSeconds,
        Registration google,
        Registration kakao,
        Registration naver
) {

    /** 설정이 아예 없는 공급자에 대해 null 대신 돌려줄 빈 자격 증명이다. */
    private static final Registration EMPTY = new Registration("", "");

    /**
     * 공급자 하나의 클라이언트 자격 증명이다.
     *
     * @param clientId 공급자 콘솔에서 발급한 클라이언트 ID(카카오는 REST API 키)
     * @param clientSecret 클라이언트 시크릿이며 사용하지 않는 공급자는 빈 값
     */
    public record Registration(String clientId, String clientSecret) {

        /** 클라이언트 ID가 채워져 이 공급자로 로그인할 수 있는지 반환한다. */
        public boolean isUsable() {
            return clientId != null && !clientId.isBlank();
        }

        /** 토큰 요청에 클라이언트 시크릿을 함께 보내야 하는지 반환한다. */
        public boolean hasClientSecret() {
            return clientSecret != null && !clientSecret.isBlank();
        }
    }

    /**
     * 공급자에 해당하는 자격 증명을 반환한다.
     *
     * @param provider 조회할 소셜 공급자
     * @return 설정된 자격 증명이며 설정이 없으면 사용 불가 상태의 빈 값
     */
    public Registration registration(SocialProvider provider) {
        Registration registration = switch (provider) {
            case GOOGLE -> google;
            case KAKAO -> kakao;
            case NAVER -> naver;
        };
        return registration == null ? EMPTY : registration;
    }

    /**
     * 공급자별 콜백 주소를 만든다.
     *
     * <p>인증 단계와 토큰 교환 단계가 문자 하나까지 같은 값을 보내야 하므로 두 곳이 모두 이 메서드를 쓴다.
     * 설정값 끝에 슬래시가 들어가도 {@code .../callback//kakao}가 되지 않도록 정리한다.
     *
     * @param provider 대상 소셜 공급자
     * @return 공급자 콘솔에 등록된 것과 같은 형태의 redirect_uri
     */
    public String redirectUri(SocialProvider provider) {
        String base = redirectBaseUrl.endsWith("/")
                ? redirectBaseUrl.substring(0, redirectBaseUrl.length() - 1)
                : redirectBaseUrl;
        return base + "/" + provider.keyPrefix();
    }

    /** 소셜 인증 결과를 임시로 보관할 시간을 반환한다. */
    public Duration pendingTtl() {
        return Duration.ofSeconds(pendingTtlSeconds);
    }
}
