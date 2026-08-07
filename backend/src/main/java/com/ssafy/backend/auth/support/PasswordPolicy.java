package com.ssafy.backend.auth.support;

import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;

import java.util.regex.Pattern;

/**
 * 새로 설정하는 비밀번호가 최소 강도를 만족하는지 검사한다.
 *
 * <p>규칙은 회원가입 화면이 이미 안내하고 있는 "8자 이상, 영문과 숫자 포함"과 같다. 가입 요청의
 * {@code @Size(min = 8)} 검증은 그대로 두고, 이 검사는 비밀번호 변경·재설정에만 적용한다. 이미
 * 가입한 회원 중에는 지금 규칙을 만족하지 않는 비밀번호를 쓰는 사람이 있을 수 있어, 기존 로그인
 * 흐름에는 소급하지 않는다.
 */
public final class PasswordPolicy {

    /** 저장 가능한 최대 길이다. BCrypt가 72바이트까지만 사용하므로 그 이상은 받지 않는다. */
    public static final int MAX_LENGTH = 72;

    /** 최소 길이다. */
    public static final int MIN_LENGTH = 8;

    /** 영문과 숫자를 각각 하나 이상 포함하고 8자 이상인지 확인하는 패턴이다. */
    private static final Pattern PATTERN = Pattern.compile("^(?=.*[A-Za-z])(?=.*\\d).{8,}$");

    /** 유틸리티 클래스이므로 인스턴스를 만들지 못하게 한다. */
    private PasswordPolicy() {
    }

    /**
     * 비밀번호가 정책을 만족하는지 확인한다.
     *
     * @param password 검사할 비밀번호 원문
     * @throws BusinessException 길이나 구성 조건을 만족하지 않는 경우
     */
    public static void validate(String password) {
        if (password == null || password.length() > MAX_LENGTH || !PATTERN.matcher(password).matches()) {
            throw new BusinessException(ErrorCode.PASSWORD_POLICY_VIOLATION);
        }
    }
}
