package com.ssafy.backend.user.domain;

/**
 * 회원이 선택한 선호 언어다.
 *
 * <p>영상통화 자막의 STT 인식 언어와 번역 방향을 정하는 기준이며, 통화 시작 시
 * AI Agent와 약속한 짧은 언어 코드(ko, en, ja, zh, vi)로 변환되어 LiveKit 토큰 attribute로 전달된다.
 * 코드 변환은 {@link #code()}가 담당한다. 값을 추가하면 자체 변환부를 가진
 * QueueCommandService도 함께 넓혀야 한다.
 */
public enum PreferredLanguage {
    KOREAN("ko"),
    ENGLISH("en"),
    JAPANESE("ja"),
    CHINESE("zh"),
    VIETNAMESE("vi");

    private final String code;

    /**
     * 선호 언어에 대응하는 자막 언어 코드를 설정한다.
     *
     * @param code 자막 AI Agent와 약속한 짧은 언어 코드
     */
    PreferredLanguage(String code) {
        this.code = code;
    }

    /**
     * 자막 AI Agent와 약속한 짧은 언어 코드를 반환한다.
     *
     * @return ko, en, ja, zh, vi 중 하나
     */
    public String code() {
        return code;
    }
}
