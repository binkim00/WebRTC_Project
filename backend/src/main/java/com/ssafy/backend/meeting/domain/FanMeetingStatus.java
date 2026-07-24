package com.ssafy.backend.meeting.domain;

/**
 * 팬미팅의 진행 상태다.
 */
public enum FanMeetingStatus {
    /** 팬미팅을 작성 중이며 아직 공개하지 않은 임시 저장 상태다. */
    DRAFT,

    /** 팬미팅 정보를 공개했지만 응모 접수는 시작하지 않은 상태다. */
    PUBLISHED,

    /** 팬미팅 응모를 접수하고 있는 상태다. */
    APPLICATION_OPEN,

    /** 팬미팅 응모 접수가 마감된 상태다. */
    APPLICATION_CLOSED,

    /** 참가자 선정과 운영 준비가 끝나 팬미팅 시작을 기다리는 상태다. */
    READY,

    /** 팬미팅이 현재 진행 중인 상태다. */
    LIVE,

    /** 팬미팅이 정상적으로 종료된 상태다. */
    ENDED,

    /** 공개 이후 팬미팅이 취소된 상태다. */
    CANCELED
}
