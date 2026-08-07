package com.ssafy.backend.auth.exception;

/** 반복된 인증 실패로 로그인이 일시적으로 차단되었을 때 사용하는 예외다. */
public class TooManyLoginAttemptsException extends RuntimeException {
    /** 차단 정책의 구체적인 기준을 노출하지 않는 공통 메시지로 예외를 생성한다. */
    public TooManyLoginAttemptsException() {
        super("Too many failed login attempts. Please try again later.");
    }
}
