package com.ssafy.backend.notification.domain;

/**
 * 사용자에게 전달되는 알림의 유형이다.
 *
 * <p>이 목록은 MySQL의 native ENUM 컬럼({@code notifications.notification_type})과 1:1로 묶여 있다.
 * 값을 추가하면 컬럼 정의도 함께 넓혀야 하며, 그러지 않으면 부팅은 되지만 그 유형의 알림을 처음
 * 저장하는 순간 {@code Data truncated for column} 오류로 해당 API만 실패한다.
 */
public enum NotificationType {
    APPLICATION_RESULT,
    QUEUE_ORDER_ASSIGNED,
    QUEUE_CHANGE_RESULT,
    ENTER_NOW,
    MEETING_CHANGED,
    MEETING_CANCELED,
    MEETING_PUBLISHED,

    // 아래 조직 알림은 팬미팅에 딸리지 않으므로 meeting 없이 저장된다.

    /** 매니저가 인플루언서에게 조직 초대를 보냈음을 인플루언서에게 알린다. */
    ORGANIZATION_INVITED,

    /** 인플루언서가 조직 초대를 수락했음을 초대한 매니저에게 알린다. */
    ORGANIZATION_INVITATION_ACCEPTED,

    /** 조직 소속이 해제되었음을 대상 구성원에게 알린다. */
    ORGANIZATION_MEMBER_REMOVED
}
