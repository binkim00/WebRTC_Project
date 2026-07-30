package com.ssafy.backend.common.exception;

import org.springframework.http.HttpStatus;

/** 행사 운영 API에서 사용하는 비즈니스 오류 코드다. */
public enum ErrorCode {
    AUTHENTICATION_REQUIRED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    ACCESS_DENIED(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    ACTIVE_USER_NOT_FOUND(HttpStatus.UNAUTHORIZED, "활성 사용자를 찾을 수 없습니다."),
    FAN_MEETING_NOT_FOUND(HttpStatus.NOT_FOUND, "팬미팅을 찾을 수 없습니다."),
    OPERATION_SETTING_NOT_FOUND(HttpStatus.CONFLICT, "운영 설정이 없습니다."),
    PARTICIPANT_NOT_FOUND(HttpStatus.FORBIDDEN, "팬미팅 참가자가 아닙니다."),
    NO_PARTICIPANTS(HttpStatus.CONFLICT, "초기화할 참가자가 없습니다."),
    QUEUE_ALREADY_INITIALIZED(HttpStatus.CONFLICT, "이미 초기화된 대기열입니다."),
    QUEUE_NOT_INITIALIZED(HttpStatus.CONFLICT, "대기열이 초기화되지 않았습니다."),
    QUEUE_ENTRY_NOT_FOUND(HttpStatus.NOT_FOUND, "대기열 항목이 없습니다."),
    QUEUE_ENTRY_NOT_ENTERED(HttpStatus.CONFLICT, "대기열에 입장하지 않았습니다."),
    QUEUE_ENTRY_ALREADY_ENTERED(HttpStatus.CONFLICT, "이미 대기실에 입장했습니다."),
    WAITING_ROOM_NOT_OPEN(HttpStatus.CONFLICT, "대기실 입장 가능 시간이 아닙니다."),
    QUEUE_STATE_CONFLICT(HttpStatus.CONFLICT, "처리할 수 없는 대기열 상태입니다."),
    NO_CALLABLE_PARTICIPANT(HttpStatus.CONFLICT, "호출할 참가자가 없습니다."),
    ACTIVE_CALL_EXISTS(HttpStatus.CONFLICT, "이미 통화 중인 참가자가 있습니다."),
    CALL_ATTEMPT_LIMIT_EXCEEDED(HttpStatus.CONFLICT, "호출 가능 횟수를 초과했습니다."),
    QUEUE_CHANGE_REQUEST_NOT_FOUND(HttpStatus.NOT_FOUND, "순서 변경 요청이 없습니다."),
    QUEUE_CHANGE_REQUEST_CONFLICT(HttpStatus.CONFLICT, "처리할 수 없는 변경 요청입니다."),
    CALL_SESSION_NOT_FOUND(HttpStatus.NOT_FOUND, "통화 세션이 없습니다."),
    ACTIVE_CALL_SESSION_EXISTS(HttpStatus.CONFLICT, "활성 통화 세션이 있습니다."),
    CALL_SESSION_STATE_CONFLICT(HttpStatus.CONFLICT, "처리할 수 없는 통화 상태입니다."),
    LIVEKIT_JOIN_NOT_ALLOWED(HttpStatus.FORBIDDEN, "통화방 입장 권한이 없습니다."),
    LIVEKIT_RECONNECT_EXPIRED(HttpStatus.CONFLICT, "LiveKit 재접속 허용 시간이 만료되었습니다."),
    LIVEKIT_OPERATION_FAILED(HttpStatus.BAD_GATEWAY, "LiveKit 요청에 실패했습니다."),
    INVALID_LIVEKIT_WEBHOOK(HttpStatus.UNAUTHORIZED, "유효하지 않은 webhook입니다."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    FAN_MEMO_NOT_FOUND(HttpStatus.NOT_FOUND, "메모를 찾을 수 없습니다."),
    FAN_MEMO_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 해당 회차에 작성된 메모가 있습니다."),
    FAN_MEMO_ACCESS_DENIED(HttpStatus.FORBIDDEN, "작성자만 수정·삭제할 수 있습니다."),
    FAN_MEMO_ALREADY_DELETED(HttpStatus.CONFLICT, "이미 삭제된 메모입니다.");

    private final HttpStatus status;
    private final String message;

    /** 오류의 HTTP 상태와 메시지를 설정한다. */
    ErrorCode(HttpStatus status, String message) {
        this.status = status;
        this.message = message;
    }

    /** HTTP 상태를 반환한다. */
    public HttpStatus status() { return status; }

    /** 기본 오류 메시지를 반환한다. */
    public String message() { return message; }
}
