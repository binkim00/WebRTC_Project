package com.ssafy.backend.participant.dto;

import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.domain.ParticipantSource;
import com.ssafy.backend.user.domain.User;

/**
 * 팬미팅 운영자에게 노출하는 참가자 정보다.
 *
 * <p>실명·연락처·응모 답변 등 사적인 정보는 명세에 따라 포함하지 않는다.
 *
 * @param participantId 참가자 식별자
 * @param fanId 팬 사용자 식별자
 * @param nickname 팬 닉네임
 * @param profileImageUrl 팬 프로필 이미지 주소
 * @param callOrder 배정된 영상통화 순서
 * @param participantStatus 참가자 상태
 * @param queueStatus 현재 대기열 상태이며 대기열이 없으면 {@code null}
 * @param participantSource 참가자가 확정된 경로이며 응모 추첨과 외부 선별을 구분한다
 * @param latestCallSessionId 이 참가자의 영상통화 세션 식별자이며 아직 호출된 적이 없으면
 *                            {@code null}이다. 통화가 끝난 뒤 AI 요약을 조회할 때 쓴다
 */
public record ParticipantSummaryResponse(
        Long participantId,
        Long fanId,
        String nickname,
        String profileImageUrl,
        Integer callOrder,
        String participantStatus,
        String queueStatus,
        ParticipantSource participantSource,
        Long latestCallSessionId
) {

    /**
     * 참가자 엔티티와 대기열 상태를 응답 형태로 변환한다.
     *
     * @param participant 변환할 참가자 엔티티
     * @param queueStatus 대기열 상태 이름이며 대기열 항목이 없으면 {@code null}
     * @param latestCallSessionId 참가자의 영상통화 세션 식별자이며 없으면 {@code null}
     * @return 운영자 화면용 참가자 응답
     */
    public static ParticipantSummaryResponse of(
            Participant participant, String queueStatus, Long latestCallSessionId
    ) {
        User fan = participant.getFan();
        return new ParticipantSummaryResponse(
                participant.getId(),
                fan.getId(),
                fan.getNickname(),
                fan.getProfileImageUrl(),
                participant.getAssignedOrder(),
                participant.getStatus(),
                queueStatus,
                participant.getParticipantSource(),
                latestCallSessionId
        );
    }
}
