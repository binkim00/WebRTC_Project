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
    FAN_MEETING_ALREADY_ENDED(HttpStatus.CONFLICT, "이미 종료된 팬미팅입니다."),
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

    // 통화 기념 카드
    FAN_CARD_TEXT_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "카드에 담을 수 없는 문구입니다."),

    // 회원탈퇴 (USER-003)
    // 이미 인증된 요청의 본인 재확인 실패이므로 401이 아니라 400을 쓴다.
    // 401을 주면 프론트가 토큰 재발급이나 자동 로그아웃 흐름으로 오해한다.
    USER_PASSWORD_MISMATCH(HttpStatus.BAD_REQUEST, "비밀번호가 일치하지 않습니다."),
    USER_ALREADY_WITHDRAWN(HttpStatus.CONFLICT, "이미 탈퇴한 계정입니다."),
    USER_WITHDRAW_MEETING_IN_PROGRESS(HttpStatus.CONFLICT, "진행 중이거나 예정된 팬미팅이 있어 탈퇴할 수 없습니다."),
    LAST_ADMIN_WITHDRAW_NOT_ALLOWED(HttpStatus.CONFLICT, "마지막 관리자 계정은 탈퇴할 수 없습니다."),

    // 외부 선별 참가자 CSV 등록
    PARTICIPANT_SELECTION_TYPE_MISMATCH(HttpStatus.CONFLICT,
            "외부 선별 방식으로 만든 팬미팅에서만 사용할 수 있습니다."),
    PARTICIPANT_SELECTION_TYPE_NOT_CHANGEABLE(HttpStatus.CONFLICT,
            "참가자 선별 방식은 생성 후 변경할 수 없습니다."),
    APPLICATION_NOT_SUPPORTED(HttpStatus.CONFLICT,
            "응모를 사용하지 않는 팬미팅입니다."),
    EXTERNAL_PARTICIPANTS_ALREADY_CONFIRMED(HttpStatus.CONFLICT,
            "이미 확정된 외부 선별 명단입니다."),
    EXTERNAL_PARTICIPANT_FILE_REQUIRED(HttpStatus.BAD_REQUEST,
            "등록할 CSV 파일이 필요합니다."),
    EXTERNAL_PARTICIPANT_CSV_INVALID(HttpStatus.BAD_REQUEST,
            "CSV 내용이 올바르지 않아 명단을 등록할 수 없습니다."),
    EXTERNAL_PARTICIPANT_CSV_TOO_MANY_ROWS(HttpStatus.BAD_REQUEST,
            "한 번에 등록할 수 있는 참가자 수를 넘었습니다. 파일을 나눠 올려 주세요."),

    // 이메일 인증 (AUTH-005~008)
    EMAIL_VERIFICATION_REQUIRED(HttpStatus.FORBIDDEN, "이메일 인증을 먼저 완료해야 합니다."),
    EMAIL_VERIFICATION_TOKEN_INVALID(HttpStatus.BAD_REQUEST,
            "이메일 인증 정보가 만료되었거나 이미 사용되었습니다."),
    EMAIL_ALREADY_VERIFIED(HttpStatus.CONFLICT, "이미 인증이 완료된 이메일입니다."),
    // SMTP 발송 실패는 서버 밖 원인이라 502로 알리고, 사용자가 재발송으로 복구할 수 있게 한다.
    EMAIL_VERIFICATION_SEND_FAILED(HttpStatus.BAD_GATEWAY, "인증 메일을 발송하지 못했습니다."),

    // 기기 토큰 기반 다계정 응모 탐지
    DEVICE_DUPLICATE_APPLICATION(HttpStatus.CONFLICT, "같은 기기에서 다른 계정으로 이미 응모했습니다."),

    // 공통 요청 빈도 제한
    TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요."),

    // 소셜 로그인 (AUTH-009~012, USER-004~006)
    // 아래 메시지는 공급자 이름이나 마스킹한 이메일을 끼워 넣지 못하는 상황의 기본값이다.
    // 서비스는 BusinessException(ErrorCode, message) 로 화면에 그대로 띄울 문구를 만들어 전달한다.
    SOCIAL_PROVIDER_NOT_SUPPORTED(HttpStatus.BAD_REQUEST, "지원하지 않는 소셜 로그인입니다."),
    SOCIAL_AUTH_CODE_INVALID(HttpStatus.BAD_REQUEST,
            "소셜 인증 정보가 만료되었어요. 로그인 버튼을 다시 눌러 주세요."),
    // 공급자 장애는 서버 밖 원인이라 502로 알리고 재시도를 안내한다.
    SOCIAL_PROVIDER_UNAVAILABLE(HttpStatus.BAD_GATEWAY,
            "소셜 로그인 서버와 통신하지 못했어요. 잠시 후 다시 시도해 주세요."),
    SOCIAL_TOKEN_INVALID(HttpStatus.BAD_REQUEST,
            "인증 후 시간이 너무 지났어요. 처음부터 다시 로그인해 주세요."),
    // 이미 인증된 소셜 계정의 기존 계정 소유 확인 실패이므로 401이 아니라 400을 쓴다.
    // USER_PASSWORD_MISMATCH 와 같은 이유이며, 401은 프론트가 토큰 재발급으로 오해한다.
    SOCIAL_LINK_PASSWORD_MISMATCH(HttpStatus.BAD_REQUEST, "비밀번호가 일치하지 않아요."),
    SOCIAL_EMAIL_ALREADY_REGISTERED(HttpStatus.CONFLICT,
            "이미 가입된 이메일이에요. 기존 방식으로 로그인한 뒤 마이페이지에서 연결해 주세요."),
    SOCIAL_ACCOUNT_LINKED_TO_OTHER_USER(HttpStatus.CONFLICT,
            "이 소셜 계정은 이미 다른 Melly 계정에 연결되어 있어요."),
    SOCIAL_PROVIDER_ALREADY_LINKED(HttpStatus.CONFLICT,
            "이 계정에는 이미 같은 소셜 서비스의 다른 계정이 연결되어 있어요."),
    SOCIAL_ACCOUNT_NOT_LINKED(HttpStatus.NOT_FOUND, "연결된 소셜 계정이 없어요."),
    // 비밀번호 설정·변경 API가 없어 소셜 전용 계정은 비밀번호를 만들 수 없다.
    // 그래서 다른 소셜 계정 연결만 대안으로 안내한다.
    SOCIAL_LAST_LOGIN_METHOD(HttpStatus.CONFLICT,
            "이 연결을 해제하면 로그인할 방법이 없어져요. 다른 소셜 계정을 먼저 연결해 주세요."),

    // 종료·취소된 팬미팅 진입 차단
    // 종료(ENDED)와 취소(CANCELED)를 한 코드로 묶는다. 팬 화면에서 두 상태의 다음 동선이
    // "녹화 다시보기·기념 카드"로 같으므로, 프론트가 코드 하나만 보고 안내를 바꿀 수 있게 한다.
    FAN_MEETING_CLOSED(HttpStatus.CONFLICT, "종료되었거나 취소된 팬미팅입니다."),

    // ─────────────────────────────────────────────────────────────────
    // 세션별 추가 구역 (2026-08-07)
    //
    // 여러 작업 세션이 동시에 이 enum에 값을 추가하면 같은 줄에서 충돌한다.
    // 각 세션은 **자기 앵커 바로 아래에만** 값을 추가하고 다른 구역은 건드리지 않는다.
    // ─────────────────────────────────────────────────────────────────

    // ── S4: 응모 폼 ──
    APPLICATION_QUESTION_OPTION_INVALID(HttpStatus.BAD_REQUEST,
            "객관식 질문의 선택지 구성이 올바르지 않습니다."),
    APPLICATION_PARTICIPATION_CONSENT_REQUIRED(HttpStatus.BAD_REQUEST,
            "팬미팅 참여 동의가 필요합니다."),
    APPLICATION_RECORDING_CONSENT_REQUIRED(HttpStatus.BAD_REQUEST,
            "녹화 및 보관 동의가 필요합니다."),

    // ── S5: 계정·인증 ──
    // 가입 중복 확인 (AUTH-013)
    // 확인 대상(type)이 지원 범위를 벗어난 경우다. 잘못된 값이 그대로 통과하면
    // 프론트가 "사용 가능"으로 오해할 수 있어 검사 결과가 아니라 오류로 돌려준다.
    DUPLICATE_CHECK_TARGET_NOT_SUPPORTED(HttpStatus.BAD_REQUEST, "확인할 수 없는 항목입니다."),
    DUPLICATE_NICKNAME(HttpStatus.CONFLICT, "이미 사용 중인 닉네임입니다."),
    // 비밀번호 변경·재설정 (AUTH-014, AUTH-015, USER-007)
    // 만료·사용 완료·위조를 구분해 알려 주면 다른 계정의 토큰 상태를 탐색할 수 있어 한 코드로 합친다.
    PASSWORD_RESET_TOKEN_INVALID(HttpStatus.BAD_REQUEST,
            "비밀번호 재설정 정보가 만료되었거나 이미 사용되었습니다."),
    // 메일 발송 실패는 서버 밖 원인이라 502로 알리고, 사용자가 재요청으로 복구할 수 있게 한다.
    PASSWORD_RESET_SEND_FAILED(HttpStatus.BAD_GATEWAY, "비밀번호 재설정 메일을 발송하지 못했습니다."),
    PASSWORD_POLICY_VIOLATION(HttpStatus.BAD_REQUEST,
            "비밀번호는 8자 이상이며 영문과 숫자를 함께 포함해야 합니다."),
    PASSWORD_SAME_AS_CURRENT(HttpStatus.BAD_REQUEST, "현재 비밀번호와 다른 비밀번호를 입력해 주세요."),
    // 소셜 전용 계정은 비밀번호 자리에 매칭되지 않는 자리표시자가 들어 있어 변경할 대상이 없다.
    PASSWORD_CHANGE_NOT_AVAILABLE(HttpStatus.CONFLICT,
            "소셜 로그인으로만 사용하는 계정은 비밀번호를 변경할 수 없어요."),

    // ── S6: 첨부·이미지·공지 ──
    ATTACHMENT_TYPE_MISMATCH(HttpStatus.BAD_REQUEST,
            "이 게시글에 연결할 수 없는 용도의 첨부파일입니다."),
    ATTACHMENT_IMAGE_REQUIRED(HttpStatus.BAD_REQUEST,
            "이미지 파일만 올릴 수 있습니다."),
    ATTACHMENT_TOO_MANY(HttpStatus.BAD_REQUEST,
            "한 게시글에 연결할 수 있는 첨부파일 수를 넘었습니다."),

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
