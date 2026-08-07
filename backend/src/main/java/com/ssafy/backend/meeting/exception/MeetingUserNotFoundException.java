package com.ssafy.backend.meeting.exception;

public class MeetingUserNotFoundException extends RuntimeException {
    public MeetingUserNotFoundException() {
        super("The requested user does not exist or is unavailable.");
    }
}
