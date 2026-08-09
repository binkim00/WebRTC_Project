package com.ssafy.backend.call.dto;

/**
 * 참가자 한 명과 그 참가자의 영상통화 세션 식별자를 묶은 조회 전용 값이다.
 *
 * <p>참가자 목록 응답에 통화 세션 식별자를 채울 때, 세션마다 대기열·참가자를 지연 로딩하지 않도록
 * 두 식별자만 한 번에 읽어 오려고 쓴다.
 *
 * @param participantId 참가자 식별자
 * @param callSessionId 해당 참가자의 영상통화 세션 식별자
 */
public record ParticipantCallSessionView(Long participantId, Long callSessionId) {
}
