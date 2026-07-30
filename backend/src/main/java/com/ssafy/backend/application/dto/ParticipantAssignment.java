package com.ssafy.backend.application.dto;

/**
 * 응모가 당첨되어 확정된 참가자의 호출 순서 배정 정보다.
 *
 * <p>{@code callOrderSource}는 ERD에 별도 컬럼이 없다. 현재 스키마에서 호출 순서를 기록하는 값은
 * 추첨이 배정하는 {@code participants.assigned_order} 하나뿐이므로 참가자가 있으면
 * {@link #DRAW_SOURCE}로 고정한다.
 *
 * @param applicationId 참가자로 확정된 응모 식별자
 * @param participantId 참가자 식별자
 * @param callOrder 영상통화 호출 순서
 */
public record ParticipantAssignment(Long applicationId, Long participantId, Integer callOrder) {

    /** 추첨이 배정한 호출 순서를 나타내는 값이다. */
    public static final String DRAW_SOURCE = "DRAW";

    /**
     * 호출 순서를 결정한 방식을 반환한다.
     *
     * @return 추첨 배정을 나타내는 값
     */
    public String callOrderSource() {
        return DRAW_SOURCE;
    }
}
