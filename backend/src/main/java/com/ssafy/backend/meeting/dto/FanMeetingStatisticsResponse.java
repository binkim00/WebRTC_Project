package com.ssafy.backend.meeting.dto;

/**
 * 팬미팅 종료 후 운영 결과를 보여줄 응모·참가·통화 집계다.
 *
 * <p>별도 통계 테이블 없이 응모, 참가자, 대기열, 영상통화 세션 원본 데이터에서 매번 집계한다.
 * 통화 시간 두 필드는 종료된 영상통화 세션의 {@code startedAt}과 {@code endedAt} 차이를
 * 기준으로 하며, 집계할 종료 통화가 없으면 null이 아니라 0을 반환한다.
 *
 * @param applicationCount 취소를 제외한 응모 수
 * @param selectedCount 당첨 처리된 응모 수
 * @param participantCount 확정된 참가자 수
 * @param completedCallCount 정상 종료된 영상통화 수
 * @param noShowCount 호출에 응답하지 않아 노쇼로 처리된 대기열 항목 수
 * @param failedCallCount 연결에 실패한 영상통화 수
 * @param averageCallDurationSec 종료된 통화 한 건의 평균 통화 시간(초)이며 초 단위로 반올림한다
 * @param totalMeetingDurationSec 종료된 통화 시간을 모두 합한 실제 진행 시간(초)
 */
public record FanMeetingStatisticsResponse(
        long applicationCount,
        long selectedCount,
        long participantCount,
        long completedCallCount,
        long noShowCount,
        long failedCallCount,
        long averageCallDurationSec,
        long totalMeetingDurationSec
) {
}
