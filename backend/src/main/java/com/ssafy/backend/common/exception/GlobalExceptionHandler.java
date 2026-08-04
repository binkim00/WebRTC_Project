package com.ssafy.backend.common.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** 행사 운영 API의 공통 비즈니스 오류와 요청 검증 오류를 ProblemDetail로 변환한다. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 비즈니스 예외를 오류 코드가 포함된 공통 응답으로 변환한다.
     *
     * <p>요청 제한처럼 재시도 시점을 알려야 하는 오류는 {@code Retry-After} 헤더를 함께 내려
     * 클라이언트가 언제 다시 시도할지 판단할 수 있게 한다.
     *
     * @param exception 처리할 비즈니스 예외
     * @param request 오류가 발생한 요청
     * @return 오류 코드와 경로를 담은 ProblemDetail 응답
     */
    @ExceptionHandler(BusinessException.class)
    ResponseEntity<ProblemDetail> handleBusinessException(
            BusinessException exception, HttpServletRequest request
    ) {
        ErrorCode errorCode = exception.getErrorCode();
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(errorCode.status(), exception.getMessage());
        detail.setTitle(errorCode.name());
        detail.setProperty("code", errorCode.name());
        detail.setProperty("path", request.getRequestURI());

        Long retryAfterSeconds = exception.getRetryAfterSeconds();
        if (retryAfterSeconds == null) {
            return ResponseEntity.status(errorCode.status()).body(detail);
        }
        return ResponseEntity.status(errorCode.status())
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds))
                .body(detail);
    }

    /** Bean Validation 실패를 공통 잘못된 요청 응답으로 변환한다. */
    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    ProblemDetail handleValidationException(Exception exception, HttpServletRequest request) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, ErrorCode.INVALID_REQUEST.message());
        detail.setTitle(ErrorCode.INVALID_REQUEST.name());
        detail.setProperty("code", ErrorCode.INVALID_REQUEST.name());
        detail.setProperty("path", request.getRequestURI());
        return detail;
    }
}
