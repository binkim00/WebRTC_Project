package com.ssafy.backend.queue.domain;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.participant.domain.Participant;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QueueEntryTest {

    /** 최초 호출과 한 번의 재호출을 합해 최대 두 번만 호출되는지 검증한다. */
    @Test
    void allowsOnlyOneRecallAndCountsBothAttempts() {
        Participant participant = mock(Participant.class);
        when(participant.getAssignedOrder()).thenReturn(3);
        QueueEntry entry = QueueEntry.create(mock(FanMeeting.class), participant);
        LocalDateTime firstCalledAt = LocalDateTime.of(2026, 7, 27, 10, 0);
        LocalDateTime recalledAt = firstCalledAt.plusSeconds(30);

        entry.enter(firstCalledAt.minusMinutes(1));
        entry.call(firstCalledAt);
        entry.recall(recalledAt, 1);

        assertThat(entry.getCallAttemptCount()).isEqualTo(2);
        assertThat(entry.getRecallCount()).isEqualTo(1);
        assertThat(entry.getCalledAt()).isEqualTo(recalledAt);
        assertThatThrownBy(() -> entry.recall(recalledAt.plusSeconds(30), 1))
                .isInstanceOf(IllegalStateException.class);
    }

    /** 아직 호출되지 않은 참가자의 호출 시도 횟수가 0인지 검증한다. */
    @Test
    void returnsZeroAttemptsBeforeFirstCall() {
        Participant participant = mock(Participant.class);
        when(participant.getAssignedOrder()).thenReturn(1);
        QueueEntry entry = QueueEntry.create(mock(FanMeeting.class), participant);

        assertThat(entry.getCallAttemptCount()).isZero();
    }
}
