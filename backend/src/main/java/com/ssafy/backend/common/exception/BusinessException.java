package com.ssafy.backend.common.exception;

/** 클라이언트에 오류 코드로 전달할 비즈니스 규칙 위반을 표현한다. */
public class BusinessException extends RuntimeException {
    private final ErrorCode errorCode;

    /** 오류 코드의 기본 메시지로 예외를 생성한다. */
    public BusinessException(ErrorCode errorCode) {
        super(errorCode.message());
        this.errorCode = errorCode;
    }

    /** 별도 메시지를 사용해 비즈니스 예외를 생성한다. */
    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    /** 발생한 비즈니스 오류 코드를 반환한다. */
    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
