package com.ssafy.backend.common.exception;

/** 클라이언트에 오류 코드로 전달할 비즈니스 규칙 위반을 표현한다. */
public class BusinessException extends RuntimeException {
    private final ErrorCode errorCode;
    private final Long retryAfterSeconds;

    /** 오류 코드의 기본 메시지로 예외를 생성한다. */
    public BusinessException(ErrorCode errorCode) {
        super(errorCode.message());
        this.errorCode = errorCode;
        this.retryAfterSeconds = null;
    }

    /** 별도 메시지를 사용해 비즈니스 예외를 생성한다. */
    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
        this.retryAfterSeconds = null;
    }

    /**
     * 재시도 가능 시점까지 남은 시간을 함께 담아 예외를 생성한다.
     *
     * <p>요청 제한처럼 클라이언트가 언제 다시 시도할 수 있는지 알려야 하는 오류에 사용하며,
     * 이 값은 {@code Retry-After} 응답 헤더로 전달된다.
     *
     * @param errorCode 발생한 오류 코드
     * @param retryAfterSeconds 재시도까지 남은 시간(초)
     */
    public BusinessException(ErrorCode errorCode, long retryAfterSeconds) {
        super(errorCode.message());
        this.errorCode = errorCode;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    /** 발생한 비즈니스 오류 코드를 반환한다. */
    public ErrorCode getErrorCode() {
        return errorCode;
    }

    /** 재시도까지 남은 시간(초)을 반환하며, 지정하지 않았으면 {@code null}이다. */
    public Long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
