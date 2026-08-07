package com.ssafy.backend.call.dto;

import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * 서버 시각을 기준으로 통화 상태와 남은 시간을 전달한다.
 *
 * @param callSessionId 통화 세션 식별자
 * @param status 통화 세션 상태
 * @param startedAt 실제 통화 시작 시각
 * @param endsAt 예정 종료 시각
 * @param endedAt 실제 종료 시각
 * @param serverNow 응답을 생성한 서버 시각
 * @param remainingSec 남은 통화 시간(초)
 * @param reconnectAllowedUntil 재접속 허용 종료 시각
 * @param endReason 통화 종료 사유
 * @param fanLanguage 통화 시작 시점에 고정된 팬의 자막 언어 코드
 * @param influencerLanguage 인플루언서의 자막 언어 코드이며 확인할 수 없으면 null
 */
public record CallSessionStatusResponse(
        Long callSessionId,
        CallSessionStatus status,
        LocalDateTime startedAt,
        LocalDateTime endsAt,
        LocalDateTime endedAt,
        LocalDateTime serverNow,
        long remainingSec,
        LocalDateTime reconnectAllowedUntil,
        CallEndReason endReason,
        String fanLanguage,
        String influencerLanguage
) {

    /**
     * 통화 세션과 서버 시각으로 상태 조회 응답을 생성한다.
     *
     * @param callSession 조회한 통화 세션
     * @param serverNow 응답 생성 시각
     * @return 음수가 되지 않도록 남은 시간이 계산된 응답
     */
    public static CallSessionStatusResponse from(
            CallSession callSession, LocalDateTime serverNow
    ) {
        long remainingSec = callSession.getEndsAt() == null
                ? 0L
                : Math.max(0L, Duration.between(serverNow, callSession.getEndsAt()).getSeconds());
        return new CallSessionStatusResponse(
                callSession.getId(),
                callSession.getStatus(),
                callSession.getStartedAt(),
                callSession.getEndsAt(),
                callSession.getEndedAt(),
                serverNow,
                remainingSec,
                callSession.getReconnectAllowedUntil(),
                callSession.getEndReason(),
                callSession.getFanLanguage(),
                influencerLanguageOf(callSession)
        );
    }

    /**
     * 통화를 진행하는 인플루언서의 자막 언어 코드를 읽는다.
     *
     * <p>양쪽 언어를 함께 내려 주어야 통화 화면이 상대 언어를 알 수 있다. LiveKit 토큰은
     * 자기 쪽 언어만 담고 있어서 팬 화면이 인플루언서 언어를 알 방법이 없었다.
     * 팬 언어는 통화 시작 시점 값으로 세션에 고정되어 있고, 인플루언서 언어는 토큰 발급과
     * 같은 기준인 현재 선호 언어를 읽는다.
     *
     * <p>언어는 자막 표시 여부를 판단하는 부가 정보이므로, 확인할 수 없으면 상태 조회 자체를
     * 실패시키지 않고 null로 둔다.
     *
     * @param callSession 조회한 통화 세션
     * @return 인플루언서의 짧은 언어 코드이며 확인할 수 없으면 null
     */
    private static String influencerLanguageOf(CallSession callSession) {
        QueueEntry queueEntry = callSession.getQueueEntry();
        FanMeeting meeting = queueEntry == null ? null : queueEntry.getMeeting();
        User influencer = meeting == null ? null : meeting.getInfluencer();
        PreferredLanguage language =
                influencer == null ? null : influencer.getPreferredLanguage();
        return language == null ? null : language.code();
    }
}
