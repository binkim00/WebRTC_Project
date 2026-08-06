package com.ssafy.backend.participant.support;

/**
 * 외부 선별 명단 CSV의 파일 단위 검증 실패 사유다.
 *
 * <p>특정 행 하나에 귀속시킬 수 없고 명단 전체를 봐야 판정할 수 있는 오류를 담는다.
 */
public enum ExternalParticipantFileError {

    /** 데이터 행이 하나도 없다. */
    EMPTY_ROWS("등록할 참가자 행이 없습니다."),

    /** 호출 순번이 1부터 시작하는 연속된 정수가 아니다. */
    CALL_ORDER_NOT_SEQUENTIAL("호출 순번은 1부터 시작하는 연속된 정수여야 합니다."),

    /** 명단 인원이 팬미팅 모집 인원을 초과했다. */
    CAPACITY_EXCEEDED("모집 인원을 초과했습니다.");

    private final String message;

    /** 파일 오류의 사용자 안내 메시지를 설정한다. */
    ExternalParticipantFileError(String message) {
        this.message = message;
    }

    /** 사용자에게 보여줄 오류 메시지를 반환한다. */
    public String message() {
        return message;
    }
}
