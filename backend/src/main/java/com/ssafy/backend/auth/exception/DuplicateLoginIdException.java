package com.ssafy.backend.auth.exception;

public class DuplicateLoginIdException extends RuntimeException {
    /** 이미 사용 중인 로그인 ID로 가입을 요청했음을 나타내는 예외를 생성한다. */
    public DuplicateLoginIdException() {
        super("Login ID is already in use.");
    }
}
