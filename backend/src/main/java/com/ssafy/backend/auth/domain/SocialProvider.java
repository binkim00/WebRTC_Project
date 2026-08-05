package com.ssafy.backend.auth.domain;

import java.util.Locale;
import java.util.Optional;

/**
 * 소셜 로그인을 제공하는 외부 공급자다.
 *
 * <p>표시명을 함께 갖는 이유는 사용자에게 보여 줄 안내 문구에 공급자 이름을 끼워 넣기 위해서다.
 * "카카오 인증 정보가 만료되었어요"처럼 어느 공급자에서 막혔는지 알려주지 않으면
 * 사용자가 무엇을 다시 시도해야 하는지 알 수 없다.
 */
public enum SocialProvider {
    GOOGLE("구글"),
    KAKAO("카카오"),
    NAVER("네이버");

    private final String displayName;

    /** 사용자 안내 문구에 사용할 공급자 표시명을 설정한다. */
    SocialProvider(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 경로 변수로 받은 공급자 문자열을 열거형으로 변환한다.
     *
     * <p>URL은 소문자(`/auth/social/kakao/login`)를 쓰므로 대소문자를 구분하지 않는다.
     * 잘못된 값에 예외를 던지지 않고 비어 있는 결과를 돌려주어, 사용자에게 보여 줄
     * 오류 문구는 서비스 계층이 만들도록 한다.
     *
     * @param value 변환할 공급자 문자열, {@code null} 허용
     * @return 지원하는 공급자면 해당 값, 그 외에는 비어 있는 결과
     */
    public static Optional<SocialProvider> from(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(value.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    /** 사용자 안내 문구에 사용할 공급자 표시명을 반환한다. */
    public String displayName() {
        return displayName;
    }

    /**
     * 합성 로그인 ID에 사용할 소문자 접두사를 반환한다.
     *
     * <p>소셜 전용 계정은 비밀번호로 로그인하지 않지만 {@code users.login_id}가 NOT NULL·UNIQUE라
     * 충돌하지 않는 값을 넣어야 한다.
     *
     * @return 열거형 이름의 소문자 형태
     */
    public String keyPrefix() {
        return name().toLowerCase(Locale.ROOT);
    }
}
