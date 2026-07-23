package com.ssafy.backend.auth.exception;

public class DuplicateEmailException extends RuntimeException {
    /** 이미 사용 중인 이메일로 가입을 요청했음을 나타내는 예외를 생성한다. */
    public DuplicateEmailException() {
        super("Email is already in use.");
    }
}
