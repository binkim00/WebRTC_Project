package com.ssafy.backend.auth.exception;

/** Access Token의 서명, 만료, 형식 또는 필수 Claim 검증에 실패했을 때 사용하는 예외다. */
public class InvalidAccessTokenException extends RuntimeException {
    /** 외부에 노출할 공통 Access Token 오류 메시지로 예외를 생성한다. */
    public InvalidAccessTokenException() {
        super("Invalid or expired access token.");
    }

    /** 내부 검증 실패 원인을 보존하면서 외부 메시지는 공통 문구로 제한한다. */
    public InvalidAccessTokenException(Throwable cause) {
        super("Invalid or expired access token.", cause);
    }
}
