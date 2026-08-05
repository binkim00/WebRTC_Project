package com.ssafy.backend.auth.support;

import com.ssafy.backend.auth.domain.SocialProvider;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.config.oauth.OAuthProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Locale;
import java.util.Map;

/**
 * 인증 코드를 공급자 토큰으로 교환하고 사용자 정보를 조회한다.
 *
 * <p>구글도 {@code id_token} 대신 userinfo 엔드포인트를 쓴다. 세 공급자를
 * "토큰 교환 → 사용자 조회" 한 가지 흐름으로 통일할 수 있고, 서명 검증 코드를 두지 않아도 되기 때문이다.
 * 응답은 TLS로 공급자에게서 직접 받으므로 별도 서명 검증 없이 신뢰할 수 있다.
 *
 * <p>클라이언트 시크릿은 이 서버에만 존재한다. 프론트가 공급자 access token을 받아 넘기는 방식은
 * 다른 앱에서 발급된 토큰으로 로그인되는 토큰 주입 공격이 열리므로 쓰지 않는다.
 */
@Component
public class SocialProfileClient {

    private static final Logger log = LoggerFactory.getLogger(SocialProfileClient.class);

    private static final String GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
    private static final String GOOGLE_USER_INFO_URI = "https://openidconnect.googleapis.com/v1/userinfo";
    private static final String KAKAO_TOKEN_URI = "https://kauth.kakao.com/oauth/token";
    private static final String KAKAO_USER_INFO_URI = "https://kapi.kakao.com/v2/user/me";
    private static final String NAVER_TOKEN_URI = "https://nid.naver.com/oauth2.0/token";
    private static final String NAVER_USER_INFO_URI = "https://openapi.naver.com/v1/nid/me";

    private final RestClient socialRestClient;
    private final OAuthProperties properties;

    /**
     * 공급자 호출용 HTTP 클라이언트와 자격 증명 설정을 주입받는다.
     *
     * @param socialRestClient 타임아웃이 설정된 소셜 공급자 전용 클라이언트
     * @param properties 공급자별 클라이언트 자격 증명과 콜백 주소 설정
     */
    public SocialProfileClient(RestClient socialRestClient, OAuthProperties properties) {
        this.socialRestClient = socialRestClient;
        this.properties = properties;
    }

    /**
     * 인증 코드로 공급자 사용자 정보를 조회한다.
     *
     * @param provider 대상 소셜 공급자
     * @param code 브라우저 콜백으로 받은 1회용 인증 코드
     * @param state 네이버 토큰 요청에 필요한 state 값이며 다른 공급자는 사용하지 않는다
     * @return 공급자 차이를 정규화한 사용자 정보
     * @throws BusinessException 코드가 만료·재사용되었거나 공급자와 통신하지 못한 경우
     */
    public SocialProfile fetchProfile(SocialProvider provider, String code, String state) {
        String accessToken = exchangeAccessToken(provider, code, state);
        return switch (provider) {
            case GOOGLE -> readGoogleProfile(accessToken);
            case KAKAO -> readKakaoProfile(accessToken);
            case NAVER -> readNaverProfile(accessToken);
        };
    }

    /**
     * 공급자 토큰 엔드포인트에 인증 코드를 보내 access token을 받는다.
     *
     * @param provider 대상 소셜 공급자
     * @param code 1회용 인증 코드
     * @param state 네이버 토큰 요청용 state
     * @return 공급자 access token
     * @throws BusinessException 코드가 유효하지 않거나 공급자 응답에 토큰이 없는 경우
     */
    private String exchangeAccessToken(SocialProvider provider, String code, String state) {
        OAuthProperties.Registration registration = properties.registration(provider);
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("code", code);
        form.add("client_id", registration.clientId());
        if (registration.hasClientSecret()) {
            form.add("client_secret", registration.clientSecret());
        }
        // 네이버 토큰 엔드포인트는 redirect_uri 를 받지 않고 state 를 요구한다.
        if (provider == SocialProvider.NAVER) {
            form.add("state", state == null ? "" : state);
        } else {
            form.add("redirect_uri", properties.redirectUri(provider));
        }

        Map<String, Object> response = post(provider, tokenUri(provider), form);
        // 네이버는 실패해도 HTTP 200 으로 error 필드를 담아 보내므로 상태 코드만 보면 놓친다.
        if (response.get("error") != null) {
            log.warn("소셜 토큰 발급 실패: provider={}, error={}", provider, response.get("error"));
            throw new BusinessException(ErrorCode.SOCIAL_AUTH_CODE_INVALID,
                    expiredCodeMessage(provider));
        }
        Object accessToken = response.get("access_token");
        if (accessToken == null || accessToken.toString().isBlank()) {
            log.warn("소셜 토큰 응답에 access_token 이 없습니다: provider={}", provider);
            throw new BusinessException(ErrorCode.SOCIAL_AUTH_CODE_INVALID,
                    expiredCodeMessage(provider));
        }
        return accessToken.toString();
    }

    /** 공급자별 토큰 엔드포인트 주소를 반환한다. */
    private String tokenUri(SocialProvider provider) {
        return switch (provider) {
            case GOOGLE -> GOOGLE_TOKEN_URI;
            case KAKAO -> KAKAO_TOKEN_URI;
            case NAVER -> NAVER_TOKEN_URI;
        };
    }

    /**
     * 구글 userinfo 응답을 정규화한다.
     *
     * @param accessToken 구글 access token
     * @return 정규화된 사용자 정보
     */
    private SocialProfile readGoogleProfile(String accessToken) {
        Map<String, Object> body = get(SocialProvider.GOOGLE, GOOGLE_USER_INFO_URI, accessToken);
        return new SocialProfile(
                SocialProvider.GOOGLE,
                requireProviderUserId(SocialProvider.GOOGLE, body.get("sub")),
                normalizeEmail(body.get("email")),
                Boolean.TRUE.equals(body.get("email_verified")),
                text(body.get("name")),
                text(body.get("picture"))
        );
    }

    /**
     * 카카오 사용자 조회 응답을 정규화한다.
     *
     * <p>이메일은 동의항목 상태에 따라 아예 오지 않는다. 필수 동의로 설정해도 과거에 연결한
     * 사용자에게는 적용되지 않아 {@code email_needs_agreement} 가 참인 채로 값이 빠진다.
     * 그래서 이메일 없음을 정상 경로로 처리한다.
     *
     * @param accessToken 카카오 access token
     * @return 정규화된 사용자 정보
     */
    @SuppressWarnings("unchecked")
    private SocialProfile readKakaoProfile(String accessToken) {
        Map<String, Object> body = get(SocialProvider.KAKAO, KAKAO_USER_INFO_URI, accessToken);
        Map<String, Object> account = body.get("kakao_account") instanceof Map<?, ?> map
                ? (Map<String, Object>) map
                : Map.of();
        Map<String, Object> profile = account.get("profile") instanceof Map<?, ?> map
                ? (Map<String, Object>) map
                : Map.of();
        Map<String, Object> propertyMap = body.get("properties") instanceof Map<?, ?> map
                ? (Map<String, Object>) map
                : Map.of();

        // 유효하지 않거나 미인증인 이메일을 인증된 값으로 받아들이면 안 되므로 두 플래그를 함께 본다.
        boolean emailVerified = Boolean.TRUE.equals(account.get("is_email_valid"))
                && Boolean.TRUE.equals(account.get("is_email_verified"));
        String nickname = text(profile.get("nickname"));
        if (nickname == null) {
            nickname = text(propertyMap.get("nickname"));
        }

        return new SocialProfile(
                SocialProvider.KAKAO,
                requireProviderUserId(SocialProvider.KAKAO, body.get("id")),
                normalizeEmail(account.get("email")),
                emailVerified,
                nickname,
                text(propertyMap.get("profile_image"))
        );
    }

    /**
     * 네이버 사용자 조회 응답을 정규화한다.
     *
     * <p>네이버는 이메일 인증 여부 플래그를 주지 않는다. 네이버 가입 절차에서 이메일을 확인한다는
     * 전제로 인증된 값으로 취급하기로 결정했다.
     *
     * @param accessToken 네이버 access token
     * @return 정규화된 사용자 정보
     */
    @SuppressWarnings("unchecked")
    private SocialProfile readNaverProfile(String accessToken) {
        Map<String, Object> body = get(SocialProvider.NAVER, NAVER_USER_INFO_URI, accessToken);
        Map<String, Object> response = body.get("response") instanceof Map<?, ?> map
                ? (Map<String, Object>) map
                : Map.of();
        return new SocialProfile(
                SocialProvider.NAVER,
                requireProviderUserId(SocialProvider.NAVER, response.get("id")),
                normalizeEmail(response.get("email")),
                true,
                text(response.get("nickname")),
                text(response.get("profile_image"))
        );
    }

    /**
     * 폼 형식으로 공급자에 POST 요청을 보낸다.
     *
     * @param provider 대상 공급자
     * @param uri 요청 주소
     * @param form 폼 본문
     * @return JSON 응답을 담은 맵이며 본문이 없으면 빈 맵
     * @throws BusinessException 4xx 응답이면 코드 무효, 그 외 통신 실패면 공급자 장애로 변환한다
     */
    private Map<String, Object> post(SocialProvider provider, String uri, MultiValueMap<String, String> form) {
        try {
            Map<String, Object> body = socialRestClient.post()
                    .uri(uri)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (request, response) -> {
                        // 만료·재사용된 코드나 잘못된 자격 증명이 여기로 온다. 원인은 로그에만 남긴다.
                        log.warn("소셜 토큰 요청이 거부되었습니다: provider={}, status={}",
                                provider, response.getStatusCode());
                        throw new BusinessException(ErrorCode.SOCIAL_AUTH_CODE_INVALID,
                                expiredCodeMessage(provider));
                    })
                    .body(Map.class);
            return body == null ? Map.of() : body;
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientException exception) {
            log.warn("소셜 공급자 통신에 실패했습니다: provider={}", provider, exception);
            throw new BusinessException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE,
                    unavailableMessage(provider));
        }
    }

    /**
     * Bearer 토큰으로 공급자 사용자 정보를 조회한다.
     *
     * @param provider 대상 공급자
     * @param uri 요청 주소
     * @param accessToken 공급자 access token
     * @return JSON 응답을 담은 맵이며 본문이 없으면 빈 맵
     * @throws BusinessException 공급자가 요청을 거부하거나 통신에 실패한 경우
     */
    private Map<String, Object> get(SocialProvider provider, String uri, String accessToken) {
        try {
            Map<String, Object> body = socialRestClient.get()
                    .uri(uri)
                    .header("Authorization", "Bearer " + accessToken)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (request, response) -> {
                        log.warn("소셜 사용자 조회가 거부되었습니다: provider={}, status={}",
                                provider, response.getStatusCode());
                        throw new BusinessException(ErrorCode.SOCIAL_AUTH_CODE_INVALID,
                                expiredCodeMessage(provider));
                    })
                    .body(Map.class);
            return body == null ? Map.of() : body;
        } catch (BusinessException exception) {
            throw exception;
        } catch (RestClientException exception) {
            log.warn("소셜 공급자 통신에 실패했습니다: provider={}", provider, exception);
            throw new BusinessException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE,
                    unavailableMessage(provider));
        }
    }

    /**
     * 공급자 사용자 식별자를 문자열로 확정한다.
     *
     * @param provider 대상 공급자
     * @param value 공급자 응답의 식별자 값
     * @return 문자열로 변환한 식별자
     * @throws BusinessException 식별자가 없는 경우
     */
    private String requireProviderUserId(SocialProvider provider, Object value) {
        String providerUserId = text(value);
        if (providerUserId == null) {
            log.warn("소셜 응답에 사용자 식별자가 없습니다: provider={}", provider);
            throw new BusinessException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE,
                    unavailableMessage(provider));
        }
        return providerUserId;
    }

    /** 공급자 응답 값을 공백을 제거한 문자열로 바꾸고 빈 값은 {@code null}로 만든다. */
    private String text(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    /** 이메일을 소문자로 정규화하며 값이 없으면 {@code null}을 반환한다. */
    private String normalizeEmail(Object value) {
        String email = text(value);
        return email == null ? null : email.toLowerCase(Locale.ROOT);
    }

    /** 인증 코드가 만료·재사용되었을 때 화면에 띄울 안내 문구를 만든다. */
    private String expiredCodeMessage(SocialProvider provider) {
        return provider.displayName() + " 인증 정보가 만료되었어요. 로그인 버튼을 다시 눌러 주세요.";
    }

    /** 공급자와 통신하지 못했을 때 화면에 띄울 안내 문구를 만든다. */
    private String unavailableMessage(SocialProvider provider) {
        return provider.displayName() + " 서버와 통신하지 못했어요. 잠시 후 다시 시도해 주세요.";
    }
}
