package com.ssafy.backend.meeting.domain;

/**
 * 팬미팅이 실제 참가자를 정하는 방식이다.
 *
 * <p>팬미팅 생성 시 하나를 선택하며 생성 후에는 변경할 수 없다. 두 방식은 섞어서 쓸 수 없고,
 * 방식에 따라 응모 기능 사용 여부가 결정된다.
 */
public enum ParticipantSelectionType {

    /** 멜리 내부에서 응모를 받고 추첨으로 참가자를 정하는 방식이다. */
    APPLICATION,

    /** 외부에서 이미 선별한 명단을 CSV로 등록해 참가자를 정하는 방식이다. */
    EXTERNAL_SELECTION
}
