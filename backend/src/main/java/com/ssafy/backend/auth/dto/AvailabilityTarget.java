package com.ssafy.backend.auth.dto;

import java.util.Locale;
import java.util.Optional;

/**
 * 가입 전에 중복을 미리 확인할 수 있는 항목이다.
 *
 * <p>이메일은 목록에 넣지 않는다. 이메일 중복 확인은 "이 주소로 가입한 회원이 있는지"를 그대로
 * 알려 주는 계정 조회 통로가 되므로, 이메일 중복은 지금처럼 가입 요청 시점에만 알린다.
 */
public enum AvailabilityTarget {

    /** 로그인 ID다. */
    LOGIN_ID,

    /** 화면에 노출되는 닉네임이다. */
    NICKNAME;

    /**
     * 쿼리 파라미터 문자열을 확인 항목으로 변환한다.
     *
     * <p>대소문자와 하이픈 표기(login-id)를 모두 받아들여 프론트가 표기 방식 때문에 실패하지 않게 한다.
     *
     * @param value 변환할 문자열
     * @return 지원하는 항목이면 해당 값, 아니면 비어 있는 결과
     */
    public static Optional<AvailabilityTarget> from(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT).replace('-', '_');
        for (AvailabilityTarget target : values()) {
            if (target.name().equals(normalized)) {
                return Optional.of(target);
            }
        }
        return Optional.empty();
    }
}
