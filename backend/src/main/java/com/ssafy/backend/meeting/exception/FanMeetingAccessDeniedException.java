package com.ssafy.backend.meeting.exception;

public class FanMeetingAccessDeniedException extends RuntimeException {
    public FanMeetingAccessDeniedException() {
        super("You do not have permission to create this fan meeting.");
    }
}
