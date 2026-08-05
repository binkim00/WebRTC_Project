package com.ssafy.backend.user.domain;

/**
 * 회원이 선택한 선호 언어다.
 *
 * <p>영상통화 자막의 STT 인식 언어와 번역 방향을 정하는 기준이며, 통화 시작 시
 * AI Agent와 약속한 짧은 언어 코드(ko, en, ja, zh, vi)로 변환되어 LiveKit 토큰 attribute로 전달된다.
 * 값을 추가하면 언어 코드 변환부(LiveKitAccessTokenService, QueueCommandService)도 함께 넓혀야 한다.
 */
public enum PreferredLanguage {
    KOREAN,
    ENGLISH,
    JAPANESE,
    CHINESE,
    VIETNAMESE
}
