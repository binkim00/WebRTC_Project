package com.ssafy.backend.auth.exception;

/** 사용자 없음과 비밀번호 불일치를 동일하게 처리하는 로그인 인증 실패 예외다. */
public class InvalidCredentialsException extends RuntimeException {
    /** 계정 존재 여부를 구분하지 않는 공통 메시지로 예외를 생성한다. */
    public InvalidCredentialsException() {
        super("Invalid login ID or password.");
    }
}
