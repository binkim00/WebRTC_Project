package com.ssafy.backend.notification.support;

import java.util.Map;

/**
 * 알림과 대기 화면에 쓰는 안내 문구를 언어별 문장과 프론트 사전 키로 함께 정의한다.
 *
 * <p>같은 문구를 두 가지 형태로 내보내기 위해 한 곳에 모았다. 하나는 수신자의 선호 언어로 미리
 * 만들어 저장하는 문장이고(알림 목록 외에 푸시·메일처럼 사전이 없는 경로도 이 문장을 쓴다),
 * 다른 하나는 화면이 자기 언어로 직접 조립할 수 있게 넘기는 사전 키와 자리표시자 값이다.
 * 프론트의 화면 언어는 계정 선호 언어와 따로 움직이므로, 저장 시점에 고른 언어만으로는
 * 화면 언어를 따라갈 수 없기 때문이다.
 *
 * <p>자리표시자는 프론트 {@code t(key, params)}와 같은 {@code {이름}} 형식을 쓴다. 두 곳이 같은
 * 문장 틀을 공유해야 한국어 문장과 번역 문장이 어긋나지 않는다.
 */
public enum NotificationMessage {

    /** 응모 결과 알림 제목이다. */
    APPLICATION_RESULT_TITLE(
            "notification.title.applicationResult",
            "응모 결과 안내",
            "Application result"),

    /** 대기 순번 변경 알림 제목이다. */
    QUEUE_CHANGE_TITLE(
            "notification.title.queueChange",
            "대기 순번 변경",
            "Queue position changed"),

    /** 팬미팅 취소 알림 제목이다. */
    MEETING_CANCELED_TITLE(
            "notification.title.meetingCanceled",
            "팬미팅 취소 안내",
            "Fan meeting canceled"),

    /** 팔로우한 인플루언서의 새 팬미팅 공개 알림 제목이다. */
    MEETING_PUBLISHED_TITLE(
            "notification.title.meetingPublished",
            "새 팬미팅 공개 안내",
            "New fan meeting announced"),

    /** 응모에 당첨된 팬에게 보내는 본문이다. */
    APPLICATION_RESULT_SELECTED(
            "notification.applicationResult.selected",
            "{meetingTitle} 팬미팅 응모에 당첨되었습니다.",
            "You have been selected for the {meetingTitle} fan meeting."),

    /** 응모에 당첨되지 않은 팬에게 보내는 본문이다. */
    APPLICATION_RESULT_NOT_SELECTED(
            "notification.applicationResult.notSelected",
            "{meetingTitle} 팬미팅 응모에 당첨되지 않았습니다.",
            "You were not selected for the {meetingTitle} fan meeting."),

    /** 팬미팅이 취소되었음을 알리는 본문이다. */
    MEETING_CANCELED(
            "notification.meetingCanceled.body",
            "{meetingTitle} 팬미팅이 취소되었습니다.",
            "The {meetingTitle} fan meeting has been canceled."),

    /** 팔로우한 인플루언서가 새 팬미팅을 공개했음을 알리는 본문이다. */
    MEETING_PUBLISHED(
            "notification.meetingPublished.body",
            "팔로우한 {influencerName} 님의 {meetingTitle} 팬미팅이 공개되었습니다.",
            "{influencerName}, whom you follow, announced the {meetingTitle} fan meeting."),

    /** 매니저가 직접 옮긴 팬에게 보내는 순번 변경 본문이다. */
    QUEUE_CHANGE_MOVED(
            "notification.queueChange.moved",
            "대기 순번이 {previousPosition}번에서 {newPosition}번으로 변경되었습니다.",
            "Your queue position changed from {previousPosition} to {newPosition}."),

    /** 매니저가 직접 옮긴 팬에게 변경 사유까지 붙여 보내는 순번 변경 본문이다. */
    QUEUE_CHANGE_MOVED_WITH_REASON(
            "notification.queueChange.movedWithReason",
            "대기 순번이 {previousPosition}번에서 {newPosition}번으로 변경되었습니다. 사유: {reason}",
            "Your queue position changed from {previousPosition} to {newPosition}."
                    + " Reason: {reason}"),

    /** 다른 참가자의 이동에 밀려 순번이 바뀐 팬에게 보내는 본문이다. */
    QUEUE_CHANGE_SHIFTED(
            "notification.queueChange.shifted",
            "다른 참가자의 순서 조정으로 대기 순번이 {previousPosition}번에서 {newPosition}번으로"
                    + " 변경되었습니다.",
            "Another participant's reordering changed your queue position from"
                    + " {previousPosition} to {newPosition}."),

    /** 다른 참가자의 이동에 밀린 팬에게 변경 사유까지 붙여 보내는 본문이다. */
    QUEUE_CHANGE_SHIFTED_WITH_REASON(
            "notification.queueChange.shiftedWithReason",
            "다른 참가자의 순서 조정으로 대기 순번이 {previousPosition}번에서 {newPosition}번으로"
                    + " 변경되었습니다. 사유: {reason}",
            "Another participant's reordering changed your queue position from"
                    + " {previousPosition} to {newPosition}. Reason: {reason}");

    private final String key;
    private final String korean;
    private final String english;

    /**
     * 문구 하나의 사전 키와 언어별 문장 틀을 묶는다.
     *
     * @param key 프론트 사전 키
     * @param korean 한국어 문장 틀
     * @param english 영어 문장 틀
     */
    NotificationMessage(String key, String korean, String english) {
        this.key = key;
        this.korean = korean;
        this.english = english;
    }

    /**
     * 화면이 같은 문구를 자기 언어로 찾을 때 쓸 사전 키를 반환한다.
     *
     * @return 프론트 사전 키
     */
    public String getKey() {
        return key;
    }

    /**
     * 자리표시자가 없는 문구를 지정 언어로 만든다.
     *
     * @param language 문구를 만들 언어
     * @return 완성된 문장
     */
    public String render(NotificationLanguage language) {
        return render(language, Map.of());
    }

    /**
     * 지정 언어의 문장 틀에 자리표시자 값을 채워 문구를 완성한다.
     *
     * <p>값이 없는 자리표시자는 틀에 적힌 그대로 남긴다. 빈칸으로 지우면 문장이 어색하게
     * 끊겨 무엇이 빠졌는지 알아보기 어렵다.
     *
     * @param language 문구를 만들 언어
     * @param arguments 자리표시자 이름별 채울 값
     * @return 완성된 문장
     */
    public String render(NotificationLanguage language, Map<String, String> arguments) {
        String template = language == NotificationLanguage.ENGLISH ? english : korean;
        if (arguments == null || arguments.isEmpty()) {
            return template;
        }
        String rendered = template;
        for (Map.Entry<String, String> argument : arguments.entrySet()) {
            rendered = rendered.replace(
                    "{" + argument.getKey() + "}", String.valueOf(argument.getValue()));
        }
        return rendered;
    }
}
