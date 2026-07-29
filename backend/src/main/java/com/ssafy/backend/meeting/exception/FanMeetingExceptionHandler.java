package com.ssafy.backend.meeting.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class FanMeetingExceptionHandler {

    @ExceptionHandler(MeetingUserNotFoundException.class)
    ProblemDetail handleUserNotFound(MeetingUserNotFoundException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());
        detail.setTitle("Meeting user not found");
        return detail;
    }

    @ExceptionHandler(FanMeetingAccessDeniedException.class)
    ProblemDetail handleAccessDenied(FanMeetingAccessDeniedException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, exception.getMessage());
        detail.setTitle("Fan meeting access denied");
        return detail;
    }

    @ExceptionHandler(InvalidFanMeetingRequestException.class)
    ProblemDetail handleInvalidRequest(InvalidFanMeetingRequestException exception) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        detail.setTitle("Invalid fan meeting request");
        return detail;
    }
}
