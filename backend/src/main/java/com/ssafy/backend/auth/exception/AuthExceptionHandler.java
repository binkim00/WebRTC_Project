package com.ssafy.backend.auth.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class AuthExceptionHandler {
    @ExceptionHandler({DuplicateEmailException.class, DuplicateLoginIdException.class})
    /** 로그인 ID 또는 이메일 중복 예외를 HTTP 409 응답으로 변환한다. */
    ProblemDetail handleDuplicateValue(RuntimeException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.getMessage());
        detail.setTitle("Duplicate user value");
        return detail;
    }

    /** 동시 가입 요청으로 DB UNIQUE 제약이 위반된 경우 공통 HTTP 409 응답으로 변환한다. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail handleDataIntegrityViolation(DataIntegrityViolationException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT,
                "Login ID or email is already in use."
        );
        detail.setTitle("Duplicate user value");
        return detail;
    }
}
