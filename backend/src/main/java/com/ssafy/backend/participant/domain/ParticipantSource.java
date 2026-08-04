package com.ssafy.backend.participant.domain;

/**
 * 참가자가 어떤 경로로 확정되었는지 나타낸다.
 *
 * <p>응모 추첨으로 확정된 참가자는 응모 기록을 가지지만, 외부 선별로 등록된 참가자는
 * 응모 없이 생성되므로 두 경로를 구분해 저장한다.
 */
public enum ParticipantSource {

    /** 멜리 내부 응모 추첨으로 확정된 참가자다. */
    APPLICATION,

    /** 외부 선별 명단 CSV 등록으로 확정된 참가자다. */
    EXTERNAL_SELECTION
}
