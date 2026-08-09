package com.ssafy.backend.application.domain;

/**
 * 팬미팅 응모 질문의 유형이다.
 */
public enum ApplicationQuestionType {
    SHORT_TEXT,
    LONG_TEXT,
    SINGLE_CHOICE,
    MULTIPLE_CHOICE;

    /**
     * 미리 등록한 선택지에서 고르는 객관식 유형인지 반환한다.
     *
     * @return 객관식이면 {@code true}
     */
    public boolean isChoice() {
        return this == SINGLE_CHOICE || this == MULTIPLE_CHOICE;
    }

    /**
     * 답변을 직접 입력하는 주관식 유형인지 반환한다.
     *
     * @return 주관식이면 {@code true}
     */
    public boolean isText() {
        return !isChoice();
    }

    /**
     * 선택지를 하나만 고를 수 있는 유형인지 반환한다.
     *
     * @return 단일 선택 객관식이면 {@code true}
     */
    public boolean isSingleChoice() {
        return this == SINGLE_CHOICE;
    }
}
