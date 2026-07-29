package com.ssafy.backend.auth.exception;

/** 정지 또는 탈퇴 상태인 계정의 로그인을 거부할 때 사용하는 예외다. */
public class AccountUnavailableException extends RuntimeException {
    /** 계정의 구체적인 상태를 노출하지 않는 공통 메시지로 예외를 생성한다. */
    public AccountUnavailableException() {
        super("This account is not available.");
    }
}
