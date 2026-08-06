package com.ssafy.backend.auth.support;

import com.ssafy.backend.auth.domain.SocialProvider;
import com.ssafy.backend.config.oauth.OAuthProperties;
import org.springframework.stereotype.Component;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * 공급자 인증 화면으로 보낼 authorize URL을 만든다.
 *
 * <p>프론트가 직접 조립하지 않고 서버가 만들어 주는 이유는 {@code client_id}와 {@code redirect_uri},
 * {@code scope}가 한 곳에만 있어야 하기 때문이다. 두 곳에 나눠 두면 콘솔 등록값과 어긋났을 때
 * 원인을 찾기 어렵고, redirect_uri 는 문자 하나만 달라도 공급자가 거부한다.
 *
 * <p>{@code state}는 프론트가 만들어 세션 저장소에 보관한 뒤 콜백에서 비교해야 CSRF 방어가 성립하므로
 * 여기서는 전달받은 값을 그대로 붙이기만 한다.
 */
@Component
public class SocialAuthorizeUrlFactory {

    private static final String GOOGLE_AUTHORIZE_URI = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String KAKAO_AUTHORIZE_URI = "https://kauth.kakao.com/oauth/authorize";
    private static final String NAVER_AUTHORIZE_URI = "https://nid.naver.com/oauth2.0/authorize";

    /** 구글에서 요청할 범위이며 모두 민감하지 않은 범위라 별도 심사가 없다. */
    private static final String GOOGLE_SCOPE = "openid email profile";

    /** 카카오에서 요청할 동의항목이다. */
    private static final String KAKAO_SCOPE = "profile_nickname account_email";

    private final OAuthProperties properties;

    /**
     * 공급자 자격 증명과 콜백 주소 설정을 주입받는다.
     *
     * @param properties 소셜 로그인 설정
     */
    public SocialAuthorizeUrlFactory(OAuthProperties properties) {
        this.properties = properties;
    }

    /**
     * 공급자 인증 화면 주소를 만든다.
     *
     * <p>네이버는 {@code scope} 파라미터를 쓰지 않고 개발자 콘솔의 제공 항목 설정을 따르므로 붙이지 않는다.
     *
     * @param provider 대상 소셜 공급자
     * @param state 프론트가 생성해 콜백에서 대조할 CSRF 방어용 값
     * @return 브라우저를 이동시킬 authorize URL
     */
    public String create(SocialProvider provider, String state) {
        OAuthProperties.Registration registration = properties.registration(provider);
        StringBuilder url = new StringBuilder(authorizeUri(provider))
                .append("?response_type=code")
                .append("&client_id=").append(encode(registration.clientId()))
                .append("&redirect_uri=").append(encode(properties.redirectUri(provider)));

        String scope = scope(provider);
        if (scope != null) {
            url.append("&scope=").append(encode(scope));
        }
        if (state != null && !state.isBlank()) {
            url.append("&state=").append(encode(state));
        }
        return url.toString();
    }

    /** 공급자별 인증 화면 주소를 반환한다. */
    private String authorizeUri(SocialProvider provider) {
        return switch (provider) {
            case GOOGLE -> GOOGLE_AUTHORIZE_URI;
            case KAKAO -> KAKAO_AUTHORIZE_URI;
            case NAVER -> NAVER_AUTHORIZE_URI;
        };
    }

    /** 공급자별 요청 범위를 반환하며 사용하지 않는 공급자는 {@code null}이다. */
    private String scope(SocialProvider provider) {
        return switch (provider) {
            case GOOGLE -> GOOGLE_SCOPE;
            case KAKAO -> KAKAO_SCOPE;
            case NAVER -> null;
        };
    }

    /** 쿼리 파라미터로 안전하게 넣을 수 있도록 값을 인코딩한다. */
    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
