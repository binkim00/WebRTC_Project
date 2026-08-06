package com.ssafy.backend.notification.support;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

/** 알림 문구가 언어별로 다르게 만들어지고 자리표시자가 채워지는지 검증한다. */
class NotificationMessageTest {

    /** 자리표시자가 없는 제목을 언어별로 만드는지 검증한다. */
    @Test
    void rendersTitleInEachLanguage() {
        assertThat(NotificationMessage.QUEUE_CHANGE_TITLE.render(NotificationLanguage.KOREAN))
                .isEqualTo("대기 순번 변경");
        assertThat(NotificationMessage.QUEUE_CHANGE_TITLE.render(NotificationLanguage.ENGLISH))
                .isEqualTo("Queue position changed");
    }

    /** 응모 결과 본문의 팬미팅 제목 자리표시자를 언어별로 채우는지 검증한다. */
    @Test
    void rendersApplicationResultInEachLanguage() {
        Map<String, String> arguments = Map.of("meetingTitle", "여름 팬미팅");

        assertThat(NotificationMessage.APPLICATION_RESULT_SELECTED
                .render(NotificationLanguage.KOREAN, arguments))
                .isEqualTo("여름 팬미팅 팬미팅 응모에 당첨되었습니다.");
        assertThat(NotificationMessage.APPLICATION_RESULT_SELECTED
                .render(NotificationLanguage.ENGLISH, arguments))
                .isEqualTo("You have been selected for the 여름 팬미팅 fan meeting.");
        assertThat(NotificationMessage.APPLICATION_RESULT_NOT_SELECTED
                .render(NotificationLanguage.ENGLISH, arguments))
                .isEqualTo("You were not selected for the 여름 팬미팅 fan meeting.");
    }

    /** 팬미팅 취소 본문을 언어별로 만드는지 검증한다. */
    @Test
    void rendersMeetingCanceledInEachLanguage() {
        Map<String, String> arguments = Map.of("meetingTitle", "여름 팬미팅");

        assertThat(NotificationMessage.MEETING_CANCELED
                .render(NotificationLanguage.KOREAN, arguments))
                .isEqualTo("여름 팬미팅 팬미팅이 취소되었습니다.");
        assertThat(NotificationMessage.MEETING_CANCELED
                .render(NotificationLanguage.ENGLISH, arguments))
                .isEqualTo("The 여름 팬미팅 fan meeting has been canceled.");
    }

    /** 순번 변경 본문의 순번 자리표시자를 언어별로 채우는지 검증한다. */
    @Test
    void rendersQueueChangeInEachLanguage() {
        Map<String, String> arguments = new LinkedHashMap<>();
        arguments.put("previousPosition", "3");
        arguments.put("newPosition", "1");

        assertThat(NotificationMessage.QUEUE_CHANGE_MOVED
                .render(NotificationLanguage.KOREAN, arguments))
                .isEqualTo("대기 순번이 3번에서 1번으로 변경되었습니다.");
        assertThat(NotificationMessage.QUEUE_CHANGE_MOVED
                .render(NotificationLanguage.ENGLISH, arguments))
                .isEqualTo("Your queue position changed from 3 to 1.");
        assertThat(NotificationMessage.QUEUE_CHANGE_SHIFTED
                .render(NotificationLanguage.KOREAN, arguments))
                .isEqualTo("다른 참가자의 순서 조정으로 대기 순번이 3번에서 1번으로 변경되었습니다.");
        assertThat(NotificationMessage.QUEUE_CHANGE_SHIFTED
                .render(NotificationLanguage.ENGLISH, arguments))
                .isEqualTo("Another participant's reordering changed your queue position"
                        + " from 3 to 1.");
    }

    /** 매니저가 입력한 사유는 번역하지 않고 언어별 문장 뒤에 그대로 붙이는지 검증한다. */
    @Test
    void keepsManagerReasonAsTypedInBothLanguages() {
        Map<String, String> arguments = new LinkedHashMap<>();
        arguments.put("previousPosition", "3");
        arguments.put("newPosition", "1");
        arguments.put("reason", "장비 점검이 늦어졌습니다.");

        assertThat(NotificationMessage.QUEUE_CHANGE_MOVED_WITH_REASON
                .render(NotificationLanguage.KOREAN, arguments))
                .isEqualTo("대기 순번이 3번에서 1번으로 변경되었습니다."
                        + " 사유: 장비 점검이 늦어졌습니다.");
        assertThat(NotificationMessage.QUEUE_CHANGE_MOVED_WITH_REASON
                .render(NotificationLanguage.ENGLISH, arguments))
                .isEqualTo("Your queue position changed from 3 to 1."
                        + " Reason: 장비 점검이 늦어졌습니다.");
    }

    /** 값이 오지 않은 자리표시자는 지우지 않고 그대로 남기는지 검증한다. */
    @Test
    void leavesUnfilledPlaceholderAsIs() {
        assertThat(NotificationMessage.MEETING_CANCELED
                .render(NotificationLanguage.KOREAN, Map.of()))
                .isEqualTo("{meetingTitle} 팬미팅이 취소되었습니다.");
    }

    /** 문구마다 화면이 번역에 쓸 사전 키를 서로 겹치지 않게 갖는지 검증한다. */
    @Test
    void exposesUniqueDictionaryKeyForEveryMessage() {
        assertThat(NotificationMessage.QUEUE_CHANGE_MOVED.getKey())
                .isEqualTo("notification.queueChange.moved");
        assertThat(NotificationMessage.values())
                .extracting(NotificationMessage::getKey)
                .doesNotHaveDuplicates();
    }

    /** 알림 문구를 완성된 문장과 번역 재료로 함께 묶는지 검증한다. */
    @Test
    void buildsContentWithRenderedTextAndTranslationArguments() {
        NotificationContent content = NotificationContent.of(
                NotificationMessage.APPLICATION_RESULT_TITLE,
                NotificationMessage.APPLICATION_RESULT_SELECTED,
                NotificationLanguage.ENGLISH,
                Map.of("meetingTitle", "여름 팬미팅")
        );

        assertThat(content.title()).isEqualTo("Application result");
        assertThat(content.message())
                .isEqualTo("You have been selected for the 여름 팬미팅 fan meeting.");
        assertThat(content.messageKey()).isEqualTo("notification.applicationResult.selected");
        assertThat(content.messageArguments()).containsExactly(entry("meetingTitle", "여름 팬미팅"));
    }

    /** 자리표시자 값이 없으면 빈 값으로 다뤄 문장만 만드는지 검증한다. */
    @Test
    void buildsContentWithoutArguments() {
        NotificationContent content = NotificationContent.of(
                NotificationMessage.QUEUE_CHANGE_TITLE,
                NotificationMessage.QUEUE_CHANGE_MOVED,
                NotificationLanguage.KOREAN,
                null
        );

        assertThat(content.messageArguments()).isEmpty();
        assertThat(content.message())
                .isEqualTo("대기 순번이 {previousPosition}번에서 {newPosition}번으로 변경되었습니다.");
    }
}
