package com.ssafy.backend.common.exception;

import org.springframework.http.HttpStatus;

/** 행사 운영 API에서 사용하는 비즈니스 오류 코드다. */
public enum ErrorCode {
    APPLICATION_NOT_FOUND(HttpStatus.NOT_FOUND, "응모 내역을 찾을 수 없습니다."),
    APPLICATION_ALREADY_SUBMITTED(HttpStatus.CONFLICT, "이미 접수된 응모가 있습니다."),
    APPLICATION_PERIOD_CLOSED(HttpStatus.CONFLICT, "현재 응모하거나 취소할 수 있는 기간이 아닙니다."),
    APPLICATION_ALREADY_WITHDRAWN(HttpStatus.CONFLICT, "이미 취소된 응모입니다."),
    APPLICATION_STATE_CONFLICT(HttpStatus.CONFLICT, "현재 응모 상태에서는 요청을 처리할 수 없습니다."),
    APPLICATION_CONSENT_REQUIRED(HttpStatus.BAD_REQUEST, "개인정보 수집 및 이용 동의가 필요합니다."),
    APPLICATION_ANSWER_INVALID(HttpStatus.BAD_REQUEST, "응모 답변이 올바르지 않습니다."),
    NOTIFICATION_NOT_FOUND(HttpStatus.NOT_FOUND, "알림을 찾을 수 없습니다."),
    INFLUENCER_NOT_FOUND(HttpStatus.NOT_FOUND, "활성 인플루언서를 찾을 수 없습니다."),
    FOLLOW_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 팔로우 중인 인플루언서입니다."),
    FOLLOW_NOT_FOUND(HttpStatus.NOT_FOUND, "팔로우 관계를 찾을 수 없습니다."),
    SELF_FOLLOW_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "자기 자신을 팔로우할 수 없습니다."),
    AUTHENTICATION_REQUIRED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    ACCESS_DENIED(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    ACTIVE_USER_NOT_FOUND(HttpStatus.UNAUTHORIZED, "활성 사용자를 찾을 수 없습니다."),
    FAN_MEETING_NOT_FOUND(HttpStatus.NOT_FOUND, "팬미팅을 찾을 수 없습니다."),
    FAN_MEETING_STATE_CONFLICT(HttpStatus.CONFLICT, "현재 팬미팅 상태에서는 요청을 처리할 수 없습니다."),
    FAN_MEETING_START_NOT_ALLOWED(HttpStatus.CONFLICT, "아직 팬미팅을 시작할 수 없습니다."),
    APPLICATION_SETTING_NOT_FOUND(HttpStatus.CONFLICT, "응모 설정이 없습니다."),
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
    ORGANIZATION_INVITATION_NOT_FOUND(HttpStatus.NOT_FOUND, "유효한 조직 초대를 찾을 수 없습니다."),
    ORGANIZATION_MEMBERSHIP_CONFLICT(HttpStatus.CONFLICT, "현재 조직 소속 상태에서는 요청을 처리할 수 없습니다."),

    // 이하 WAVE 1~3 병렬 작업 세션이 사용할 오류 코드를 선반영한다.
    // ErrorCode 는 공통 파일이라 세션이 동시에 수정하면 충돌이 확정적이므로 여기서 한 번에 등록한다.

    // 참가자·장비 점검 (PART-002, DEV-001)
    PARTICIPANT_NOT_IN_MEETING(HttpStatus.NOT_FOUND, "해당 팬미팅의 참가자가 아닙니다."),
    DEVICE_CHECK_NOT_ALLOWED(HttpStatus.FORBIDDEN, "장비 점검 결과를 저장할 권한이 없습니다."),

    // 팬 메모 (MEMO-001, MEMO-002)
    FAN_MEMO_NOT_FOUND(HttpStatus.NOT_FOUND, "팬 메모를 찾을 수 없습니다."),
    FAN_MEMO_ACCESS_DENIED(HttpStatus.FORBIDDEN, "해당 팬의 메모를 조회할 권한이 없습니다."),
    FAN_MEMO_ALREADY_DELETED(HttpStatus.CONFLICT, "이미 삭제된 팬 메모입니다."),
    FAN_NOT_FOUND(HttpStatus.NOT_FOUND, "활성 팬 사용자를 찾을 수 없습니다."),

    // 응모 폼 (FORM-001, FORM-002)
    APPLICATION_FORM_NOT_FOUND(HttpStatus.NOT_FOUND, "응모 폼이 등록되지 않았습니다."),
    APPLICATION_FORM_NOT_EDITABLE(HttpStatus.CONFLICT, "응모가 시작된 뒤에는 응모 폼을 수정할 수 없습니다."),
    APPLICATION_QUESTION_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "응모 질문은 최대 10개까지 등록할 수 있습니다."),
    APPLICATION_QUESTION_ORDER_DUPLICATED(HttpStatus.BAD_REQUEST, "응모 질문 순서가 중복되었습니다."),

    // 당첨자 추첨·결과 공개 (APP-005, APP-006)
    APPLICATION_DRAW_ALREADY_COMPLETED(HttpStatus.CONFLICT, "이미 추첨이 완료되었습니다."),
    APPLICATION_DRAW_NOT_ALLOWED(HttpStatus.CONFLICT, "현재 상태에서는 추첨할 수 없습니다."),
    APPLICATION_RESULT_ALREADY_PUBLISHED(HttpStatus.CONFLICT, "이미 응모 결과가 공개되었습니다."),

    // 대기 순서 변경 (QUEUE-005, QREQ-001)
    QUEUE_POSITION_OUT_OF_RANGE(HttpStatus.BAD_REQUEST, "이동할 수 없는 대기 순번입니다."),
    QUEUE_CHANGE_REQUEST_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 순서 변경을 요청했습니다."),

    // 공지·커뮤니티 게시글 (POST-001~003)
    POST_NOT_FOUND(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다."),
    POST_WRITE_NOT_ALLOWED(HttpStatus.FORBIDDEN, "게시글을 작성할 권한이 없습니다."),
    POST_TYPE_MISMATCH(HttpStatus.BAD_REQUEST, "요청 경로와 게시글 유형이 일치하지 않습니다."),

    // 공지 첨부파일 (ATTACH-001)
    ATTACHMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "첨부파일을 찾을 수 없습니다."),
    ATTACHMENT_FILE_REQUIRED(HttpStatus.BAD_REQUEST, "첨부할 파일이 필요합니다."),
    ATTACHMENT_FORMAT_NOT_ALLOWED(HttpStatus.BAD_REQUEST,
            "JPG, JPEG, PNG, WEBP, PDF 파일만 첨부할 수 있습니다."),
    ATTACHMENT_FILE_TOO_LARGE(HttpStatus.CONTENT_TOO_LARGE, "첨부파일이 허용 크기를 초과했습니다."),
    ATTACHMENT_STORAGE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "첨부파일을 저장하지 못했습니다."),
    ATTACHMENT_ALREADY_ATTACHED(HttpStatus.CONFLICT, "이미 다른 게시글에 연결된 첨부파일입니다."),
    ATTACHMENT_DUPLICATED(HttpStatus.BAD_REQUEST, "같은 첨부파일을 중복해서 연결할 수 없습니다."),
    POST_ATTACHMENT_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "이 게시글 유형에는 첨부파일을 연결할 수 없습니다."),

    // 댓글·신고 (COMMENT-001, COMMENT-002, COMMENT-004)
    COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."),
    COMMENT_WRITE_NOT_ALLOWED(HttpStatus.FORBIDDEN, "댓글을 작성할 권한이 없습니다."),
    SELF_COMMENT_REPORT_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "본인 댓글은 신고할 수 없습니다."),
    COMMENT_REPORT_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 신고한 댓글입니다."),

    // 녹화 저장·조회 (REC-001~004)
    RECORDING_NOT_FOUND(HttpStatus.NOT_FOUND, "녹화를 찾을 수 없습니다."),
    RECORDING_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 업로드된 녹화가 있습니다."),
    RECORDING_NOT_AVAILABLE(HttpStatus.CONFLICT, "재생하거나 내려받을 수 없는 녹화 상태입니다."),
    RECORDING_FORMAT_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "WEBM 또는 MP4 녹화 파일만 업로드할 수 있습니다."),
    RECORDING_FILE_REQUIRED(HttpStatus.BAD_REQUEST, "녹화 파일이 필요합니다."),
    RECORDING_FILE_TOO_LARGE(HttpStatus.CONTENT_TOO_LARGE, "녹화 파일이 허용 크기를 초과했습니다."),
    RECORDING_STORAGE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "녹화 파일을 저장하지 못했습니다."),
    RECORDING_DOWNLOAD_TOKEN_INVALID(HttpStatus.UNAUTHORIZED, "녹화 다운로드 토큰이 유효하지 않습니다."),

    // AI 요약·모니터링 (AI-001, AI-002, AI-003)
    AI_CALL_SUMMARY_NOT_FOUND(HttpStatus.NOT_FOUND, "통화 요약을 찾을 수 없습니다."),
    AI_MODERATION_NOT_FOUND(HttpStatus.NOT_FOUND, "모니터링 감지 건을 찾을 수 없습니다."),
    AI_MODERATION_ALREADY_REVIEWED(HttpStatus.CONFLICT, "이미 검토가 완료된 건입니다."),

    // 회원탈퇴 (USER-003)
    // 이미 인증된 요청의 본인 재확인 실패이므로 401이 아니라 400을 쓴다.
    // 401을 주면 프론트가 토큰 재발급이나 자동 로그아웃 흐름으로 오해한다.
    USER_PASSWORD_MISMATCH(HttpStatus.BAD_REQUEST, "비밀번호가 일치하지 않습니다."),
    USER_ALREADY_WITHDRAWN(HttpStatus.CONFLICT, "이미 탈퇴한 계정입니다."),
    USER_WITHDRAW_MEETING_IN_PROGRESS(HttpStatus.CONFLICT, "진행 중이거나 예정된 팬미팅이 있어 탈퇴할 수 없습니다."),
    LAST_ADMIN_WITHDRAW_NOT_ALLOWED(HttpStatus.CONFLICT, "마지막 관리자 계정은 탈퇴할 수 없습니다."),

    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다.");

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
