package com.ssafy.backend.notification.support;

import com.ssafy.backend.user.domain.PreferredLanguage;

/**
 * 백엔드가 알림 문구를 만들어 낼 수 있는 언어다.
 *
 * <p>{@link PreferredLanguage}는 통화 자막의 STT·번역 대상까지 포함해 다섯 언어를 가지지만,
 * 화면 문구 사전은 프론트와 마찬가지로 한국어·영어 두 벌만 유지한다. 사전에 없는 언어를 억지로
 * 채우면 알림 한 줄만 낯선 언어로 뜨고 나머지 화면은 그대로여서 오히려 읽기 어렵다.
 *
 * <p>폴백 규칙: 한국어를 고른 회원과 선호 언어를 알 수 없는 회원은 서비스 기본 언어인 한국어로,
 * 그 밖의 언어(영어·일본어·중국어·베트남어)를 고른 회원은 영어로 만든다. 한국어를 고르지 않았다는
 * 것은 한국어를 읽지 못한다는 뜻에 가까우므로 영어가 한국어보다 안전한 차선이다.
 *
 * <p>여기에 언어를 추가하려면 {@link NotificationMessage}의 문구와 프론트 사전
 * (frontend/src/i18n/locales.ts)을 함께 넓혀야 한다.
 */
public enum NotificationLanguage {
    KOREAN,
    ENGLISH;

    /**
     * 회원이 고른 선호 언어를 문구를 만들 언어로 바꾼다.
     *
     * @param preferredLanguage 회원 선호 언어이며 알 수 없으면 {@code null}일 수 있다
     * @return 한국어를 고르거나 선호 언어를 알 수 없으면 {@link #KOREAN}, 그 밖에는 {@link #ENGLISH}
     */
    public static NotificationLanguage from(PreferredLanguage preferredLanguage) {
        if (preferredLanguage == null || preferredLanguage == PreferredLanguage.KOREAN) {
            return KOREAN;
        }
        return ENGLISH;
    }
}
