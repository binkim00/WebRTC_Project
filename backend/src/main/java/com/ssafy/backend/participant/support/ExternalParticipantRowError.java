package com.ssafy.backend.participant.support;

/**
 * 외부 선별 명단 CSV의 행 단위 검증 실패 사유다.
 *
 * <p>행 오류는 요청 전체를 즉시 실패시키지 않고 미리보기 응답에 행별로 표시하므로
 * HTTP 상태를 가지는 공통 오류 코드와 분리해 관리한다.
 */
public enum ExternalParticipantRowError {

    /** 이메일 칸이 비어 있다. */
    EMAIL_REQUIRED("이메일을 입력해야 합니다."),

    /** 이메일 형식이 올바르지 않다. */
    EMAIL_INVALID("이메일 형식이 올바르지 않습니다."),

    /** 같은 CSV에 같은 이메일이 두 번 이상 있다. */
    EMAIL_DUPLICATED("같은 이메일이 중복되었습니다."),

    /** 호출 순번 칸이 비어 있다. */
    CALL_ORDER_REQUIRED("호출 순번을 입력해야 합니다."),

    /** 호출 순번이 1 이상의 정수가 아니다. */
    CALL_ORDER_INVALID("호출 순번은 1 이상의 정수여야 합니다."),

    /** 같은 CSV에 같은 호출 순번이 두 번 이상 있다. */
    CALL_ORDER_DUPLICATED("같은 호출 순번이 중복되었습니다."),

    /** 이메일과 일치하는 회원이 없다. */
    USER_NOT_FOUND("가입되지 않은 이메일입니다."),

    /** 회원이 활성 상태가 아니다. */
    USER_NOT_ACTIVE("이용할 수 없는 계정입니다."),

    /** 회원이 팬 역할이 아니다. */
    USER_NOT_FAN("팬 회원만 참가자로 등록할 수 있습니다."),

    /** 이미 이 팬미팅의 참가자로 등록되어 있다. */
    ALREADY_PARTICIPANT("이미 참가자로 등록된 회원입니다.");

    private final String message;

    /** 행 오류의 사용자 안내 메시지를 설정한다. */
    ExternalParticipantRowError(String message) {
        this.message = message;
    }

    /** 사용자에게 보여줄 오류 메시지를 반환한다. */
    public String message() {
        return message;
    }
}
