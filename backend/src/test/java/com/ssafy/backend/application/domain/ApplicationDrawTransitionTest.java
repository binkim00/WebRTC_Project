package com.ssafy.backend.application.domain;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ApplicationDrawTransitionTest {

    private static final LocalDateTime SUBMITTED_AT = LocalDateTime.of(2026, 7, 30, 12, 0);
    private static final LocalDateTime DECIDED_AT = LocalDateTime.of(2026, 7, 31, 11, 0);

    /** 접수 상태의 응모를 당첨 상태와 결과 확정 시각으로 전환하는지 검증한다. */
    @Test
    void selectsSubmittedApplication() {
        Application application = submittedApplication();

        application.select(DECIDED_AT);

        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.SELECTED);
        assertThat(application.getResultDecidedAt()).isEqualTo(DECIDED_AT);
    }

    /** 접수 상태의 응모를 미당첨 상태와 결과 확정 시각으로 전환하는지 검증한다. */
    @Test
    void rejectsSubmittedApplication() {
        Application application = submittedApplication();

        application.reject(DECIDED_AT);

        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.NOT_SELECTED);
        assertThat(application.getResultDecidedAt()).isEqualTo(DECIDED_AT);
    }

    /** 취소한 응모를 당첨 처리할 수 없는지 검증한다. */
    @Test
    void rejectsSelectingWithdrawnApplication() {
        Application application = submittedApplication();
        application.withdraw(SUBMITTED_AT.plusHours(1));

        assertThatThrownBy(() -> application.select(DECIDED_AT))
                .isInstanceOf(IllegalStateException.class);
    }

    /** 이미 결과가 확정된 응모를 다시 추첨할 수 없는지 검증한다. */
    @Test
    void rejectsSecondResultDecision() {
        Application application = submittedApplication();
        application.select(DECIDED_AT);

        assertThatThrownBy(() -> application.reject(DECIDED_AT.plusMinutes(1)))
                .isInstanceOf(IllegalStateException.class);
    }

    /** 당첨된 응모로 참가 대기 상태의 참가자를 생성하는지 검증한다. */
    @Test
    void createsReadyParticipantFromSelectedApplication() {
        FanMeeting meeting = meeting();
        User fan = user(1L, UserRole.FAN);
        Application application = Application.submit(meeting, fan, SUBMITTED_AT);
        application.select(DECIDED_AT);

        Participant participant = Participant.createFromApplication(meeting, fan, application, 1);

        assertThat(participant.getStatus()).isEqualTo("READY");
        assertThat(participant.getAssignedOrder()).isEqualTo(1);
        assertThat(participant.getMeeting()).isEqualTo(meeting);
        assertThat(participant.getFan()).isEqualTo(fan);
        assertThat(participant.getApplication()).isEqualTo(application);
        assertThat(participant.getRecordingConsentAt()).isNull();
    }

    /** 호출 순번을 1보다 작게 배정할 수 없는지 검증한다. */
    @Test
    void rejectsAssignedOrderBelowOne() {
        FanMeeting meeting = meeting();
        User fan = user(1L, UserRole.FAN);
        Application application = Application.submit(meeting, fan, SUBMITTED_AT);

        assertThatThrownBy(() -> Participant.createFromApplication(meeting, fan, application, 0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    /** 결과 확정 시각 없이 당첨 처리할 수 없는지 검증한다. */
    @Test
    void rejectsSelectionWithoutDecisionTime() {
        Application application = submittedApplication();

        assertThatThrownBy(() -> application.select(null))
                .isInstanceOf(NullPointerException.class);
    }

    /** 접수 상태의 테스트 응모를 생성한다. */
    private Application submittedApplication() {
        return Application.submit(meeting(), user(1L, UserRole.FAN), SUBMITTED_AT);
    }

    /** 테스트용 팬미팅 대역을 생성한다. */
    private FanMeeting meeting() {
        return mock(FanMeeting.class);
    }

    /**
     * 지정한 식별자와 역할을 반환하는 사용자 대역을 생성한다.
     *
     * @param id 사용자 식별자
     * @param role 사용자 역할
     * @return 사용자 테스트 대역
     */
    private User user(Long id, UserRole role) {
        User result = mock(User.class);
        when(result.getId()).thenReturn(id);
        when(result.getRole()).thenReturn(role);
        return result;
    }
}
