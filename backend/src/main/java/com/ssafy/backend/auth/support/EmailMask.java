package com.ssafy.backend.auth.support;

/**
 * 안내 문구에 넣을 이메일을 부분적으로 가린다.
 *
 * <p>"이미 가입된 이메일이에요"라고만 하면 사용자가 어느 계정인지 몰라 다음 행동을 정할 수 없다.
 * 반대로 전체 주소를 그대로 보여 주면 소셜 계정만 가진 제3자에게 회원의 이메일을 알려주는 셈이 된다.
 * 본인은 알아볼 수 있고 남은 특정하기 어려운 정도로만 남긴다.
 */
public final class EmailMask {

    /** 앞부분을 그대로 남길 최대 글자 수다. */
    private static final int VISIBLE_LENGTH = 3;

    private static final String MASK = "***";

    /** 정적 도구 클래스이므로 인스턴스를 만들지 못하게 한다. */
    private EmailMask() {
    }

    /**
     * 이메일 앞부분만 남기고 가린다.
     *
     * @param email 가릴 이메일이며 {@code null}이나 형식이 아닌 값도 허용한다
     * @return 가려진 이메일이며 입력이 비어 있으면 {@code null}
     */
    public static String of(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        int atIndex = email.indexOf('@');
        // @ 가 없는 값이 들어와도 예외를 던지지 않고 앞부분만 남긴다. 안내 문구용이라 실패보다 낫다.
        if (atIndex <= 0) {
            return mask(email) + MASK;
        }
        String local = email.substring(0, atIndex);
        String domain = email.substring(atIndex);
        return mask(local) + MASK + domain;
    }

    /** 앞 세 글자까지만 남기고 나머지는 버린다. */
    private static String mask(String value) {
        return value.length() <= VISIBLE_LENGTH ? value.substring(0, 1) : value.substring(0, VISIBLE_LENGTH);
    }
}
