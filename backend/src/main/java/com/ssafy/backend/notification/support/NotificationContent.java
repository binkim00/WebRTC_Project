package com.ssafy.backend.notification.support;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 알림 한 건에 담을 문구를 완성된 문장과 번역 재료로 함께 들고 다닌다.
 *
 * <p>완성된 문장은 저장 시점 수신자의 선호 언어로 만든 것이라 나중에 화면 언어를 바꿔도 그대로다.
 * 그래서 화면이 자기 언어로 다시 만들 수 있도록 사전 키와 자리표시자 값을 함께 넘긴다.
 *
 * @param title 수신자 언어로 만든 알림 제목
 * @param message 수신자 언어로 만든 알림 본문
 * @param messageKey 본문에 대응하는 프론트 사전 키
 * @param messageArguments 본문 자리표시자 이름별 값이며 비어 있을 수 있다
 */
public record NotificationContent(
        String title,
        String message,
        String messageKey,
        Map<String, String> messageArguments
) {

    /**
     * 제목·본문 문구와 자리표시자 값으로 알림 문구를 만든다.
     *
     * @param titleMessage 제목 문구이며 자리표시자를 쓰지 않는다
     * @param bodyMessage 본문 문구
     * @param language 문구를 만들 언어
     * @param arguments 본문 자리표시자 이름별 값이며 {@code null}이면 빈 값으로 다룬다
     * @return 완성된 문장과 번역 재료를 함께 담은 알림 문구
     */
    public static NotificationContent of(NotificationMessage titleMessage,
                                         NotificationMessage bodyMessage,
                                         NotificationLanguage language,
                                         Map<String, String> arguments) {
        // 저장 문장과 화면이 조립할 문장의 자리표시자 순서가 같도록 넣은 순서를 유지한다.
        Map<String, String> copied = arguments == null
                ? Map.of()
                : Collections.unmodifiableMap(new LinkedHashMap<>(arguments));
        return new NotificationContent(
                titleMessage.render(language),
                bodyMessage.render(language, copied),
                bodyMessage.getKey(),
                copied
        );
    }
}
