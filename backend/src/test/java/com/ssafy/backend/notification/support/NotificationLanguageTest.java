package com.ssafy.backend.notification.support;

import com.ssafy.backend.user.domain.PreferredLanguage;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 회원 선호 언어를 문구 생성 언어로 바꾸는 폴백 규칙을 검증한다. */
class NotificationLanguageTest {

    /** 한국어를 고른 회원의 문구는 한국어로 만드는지 검증한다. */
    @Test
    void usesKoreanForKoreanSpeaker() {
        assertThat(NotificationLanguage.from(PreferredLanguage.KOREAN))
                .isEqualTo(NotificationLanguage.KOREAN);
    }

    /** 영어를 고른 회원의 문구는 영어로 만드는지 검증한다. */
    @Test
    void usesEnglishForEnglishSpeaker() {
        assertThat(NotificationLanguage.from(PreferredLanguage.ENGLISH))
                .isEqualTo(NotificationLanguage.ENGLISH);
    }

    /** 사전이 없는 언어를 고른 회원은 한국어가 아닌 영어로 안내하는지 검증한다. */
    @Test
    void fallsBackToEnglishForLanguagesWithoutDictionary() {
        assertThat(NotificationLanguage.from(PreferredLanguage.JAPANESE))
                .isEqualTo(NotificationLanguage.ENGLISH);
        assertThat(NotificationLanguage.from(PreferredLanguage.CHINESE))
                .isEqualTo(NotificationLanguage.ENGLISH);
        assertThat(NotificationLanguage.from(PreferredLanguage.VIETNAMESE))
                .isEqualTo(NotificationLanguage.ENGLISH);
    }

    /** 선호 언어를 알 수 없으면 서비스 기본 언어인 한국어로 안내하는지 검증한다. */
    @Test
    void fallsBackToKoreanWhenPreferenceIsUnknown() {
        assertThat(NotificationLanguage.from(null)).isEqualTo(NotificationLanguage.KOREAN);
    }
}
