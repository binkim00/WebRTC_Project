package com.ssafy.backend.auth.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class AuthExceptionHandler {
    /**
     * 로그인 인증 실패를 계정 존재 여부가 드러나지 않는 HTTP 401 응답으로 변환한다.
     *
     * @param exception 로그인 인증 실패 예외
     * @return 클라이언트에 반환할 인증 실패 상세 응답
     */
    @ExceptionHandler(InvalidCredentialsException.class)
        ProblemDetail handleInvalidCredentials(InvalidCredentialsException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, exception.getMessage());
        detail.setTitle("Authentication failed");
        return detail;
    }

    /**
     * 사용할 수 없는 계정의 로그인 시도를 HTTP 403 응답으로 변환한다.
     *
     * @param exception 계정 상태로 인한 로그인 실패 예외
     * @return 클라이언트에 반환할 계정 사용 불가 상세 응답
     */
    @ExceptionHandler(AccountUnavailableException.class)
        ProblemDetail handleAccountUnavailable(AccountUnavailableException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, exception.getMessage());
        detail.setTitle("Account unavailable");
        return detail;
    }

    /** 로그인 ID 또는 이메일 중복 예외를 HTTP 409 응답으로 변환한다. */
    @ExceptionHandler({DuplicateEmailException.class, DuplicateLoginIdException.class})
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
