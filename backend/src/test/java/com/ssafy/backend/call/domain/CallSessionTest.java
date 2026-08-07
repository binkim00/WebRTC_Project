package com.ssafy.backend.call.domain;

import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.user.domain.User;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class CallSessionTest {

    /** 양측 접속 시 세션 상태와 서버 기준 시작·종료 시각이 함께 설정되는지 검증한다. */
    @Test
    void activatesWithServerBasedCallTimes() {
        CallSession callSession = CallSession.createConnecting(
                mock(QueueEntry.class), "meeting-room-1", "KOREAN");
        LocalDateTime startedAt = LocalDateTime.of(2026, 7, 28, 10, 0);

        callSession.activate(startedAt, 60);

        assertThat(callSession.getStatus()).isEqualTo(CallSessionStatus.ACTIVE);
        assertThat(callSession.getStartedAt()).isEqualTo(startedAt);
        assertThat(callSession.getEndsAt()).isEqualTo(startedAt.plusSeconds(60));
    }

    /** 중복 입장 이벤트가 이미 시작된 세션의 시작·종료 시각을 변경하지 않는지 검증한다. */
    @Test
    void keepsOriginalTimesWhenActivationIsRepeated() {
        CallSession callSession = CallSession.createConnecting(
                mock(QueueEntry.class), "meeting-room-1", "KOREAN");
        LocalDateTime firstStartedAt = LocalDateTime.of(2026, 7, 28, 10, 0);

        callSession.activate(firstStartedAt, 60);
        callSession.activate(firstStartedAt.plusSeconds(5), 120);

        assertThat(callSession.getStartedAt()).isEqualTo(firstStartedAt);
        assertThat(callSession.getEndsAt()).isEqualTo(firstStartedAt.plusSeconds(60));
    }

    /** 통화 제한 시간이 0 이하이면 세션 시작을 거부하는지 검증한다. */
    @Test
    void rejectsNonPositiveCallDuration() {
        CallSession callSession = CallSession.createConnecting(
                mock(QueueEntry.class), "meeting-room-1", "KOREAN");

        assertThatThrownBy(() -> callSession.activate(
                LocalDateTime.of(2026, 7, 28, 10, 0), 0))
                .isInstanceOf(IllegalStateException.class);
    }

    /** 활성 통화 종료 시 최종 상태·시각·사유·종료 주체가 함께 기록되는지 검증한다. */
    @Test
    void endsActiveCallWithFinalContext() {
        CallSession callSession = CallSession.createConnecting(
                mock(QueueEntry.class), "meeting-room-1", "ko");
        LocalDateTime startedAt = LocalDateTime.of(2026, 7, 28, 11, 0);
        LocalDateTime endedAt = startedAt.plusSeconds(30);
        User operator = mock(User.class);
        callSession.activate(startedAt, 60);

        callSession.end(endedAt, CallEndReason.FORCED, operator);

        assertThat(callSession.getStatus()).isEqualTo(CallSessionStatus.ENDED);
        assertThat(callSession.getEndedAt()).isEqualTo(endedAt);
        assertThat(callSession.getEndReason()).isEqualTo(CallEndReason.FORCED);
        assertThat(callSession.getEndedBy()).isSameAs(operator);
        assertThat(callSession.getReconnectAllowedUntil()).isNull();
    }

    /** 연결 대기 상태의 세션은 활성 통화 종료 전이를 사용할 수 없는지 검증한다. */
    @Test
    void rejectsEndingConnectingCall() {
        CallSession callSession = CallSession.createConnecting(
                mock(QueueEntry.class), "meeting-room-1", "ko");

        assertThatThrownBy(() -> callSession.end(
                LocalDateTime.of(2026, 7, 28, 11, 0), CallEndReason.FORCED, mock(User.class)))
                .isInstanceOf(IllegalStateException.class);
    }

    /** 노쇼로 연결되지 못한 세션을 FAILED 상태와 연결 실패 사유로 마무리하는지 검증한다. */
    @Test
    void failsConnectingCallWhenParticipantIsNoShow() {
        CallSession callSession = CallSession.createConnecting(
                mock(QueueEntry.class), "meeting-room-1", "ko");
        LocalDateTime failedAt = LocalDateTime.of(2026, 7, 28, 11, 0);

        callSession.failConnecting(failedAt);

        assertThat(callSession.getStatus()).isEqualTo(CallSessionStatus.FAILED);
        assertThat(callSession.getEndedAt()).isEqualTo(failedAt);
        assertThat(callSession.getEndReason()).isEqualTo(CallEndReason.CONNECTION_FAILED);
        assertThat(callSession.getEndedBy()).isNull();
    }

    /** 운영자가 끊은 연결 대기 세션에 종료 사유와 종료 주체가 남는지 검증한다. */
    @Test
    void failsConnectingCallWithOperatorContext() {
        CallSession callSession = CallSession.createConnecting(
                mock(QueueEntry.class), "meeting-room-1", "ko");
        LocalDateTime failedAt = LocalDateTime.of(2026, 7, 28, 11, 0);
        User operator = mock(User.class);

        callSession.failConnecting(failedAt, CallEndReason.FORCED, operator);

        assertThat(callSession.getStatus()).isEqualTo(CallSessionStatus.FAILED);
        assertThat(callSession.getEndedAt()).isEqualTo(failedAt);
        assertThat(callSession.getEndReason()).isEqualTo(CallEndReason.FORCED);
        assertThat(callSession.getEndedBy()).isSameAs(operator);
    }

    /** 종료 사유 없이 연결 대기 실패를 기록하지 않는지 검증한다. */
    @Test
    void rejectsFailingConnectingCallWithoutReason() {
        CallSession callSession = CallSession.createConnecting(
                mock(QueueEntry.class), "meeting-room-1", "ko");

        assertThatThrownBy(() -> callSession.failConnecting(
                LocalDateTime.of(2026, 7, 28, 11, 0), null, null))
                .isInstanceOf(IllegalStateException.class);
    }

    /** 이미 시작된 영상통화에는 연결 대기 실패 전이를 적용하지 않는지 검증한다. */
    @Test
    void rejectsFailingActiveCallAsConnecting() {
        CallSession callSession = CallSession.createConnecting(
                mock(QueueEntry.class), "meeting-room-1", "ko");
        callSession.activate(LocalDateTime.of(2026, 7, 28, 11, 0), 60);

        assertThatThrownBy(() -> callSession.failConnecting(
                LocalDateTime.of(2026, 7, 28, 11, 1)))
                .isInstanceOf(IllegalStateException.class);
    }
}
