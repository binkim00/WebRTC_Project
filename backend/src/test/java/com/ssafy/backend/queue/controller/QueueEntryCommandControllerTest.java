package com.ssafy.backend.queue.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueCallResponse;
import com.ssafy.backend.queue.dto.QueueOperationResponse;
import com.ssafy.backend.queue.service.QueueCommandService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QueueEntryCommandControllerTest {

    /** 대기열 식별자와 인증 사용자를 서비스에 전달하고 공통 성공 응답을 반환하는지 검증한다. */
    @Test
    void delegatesParticipantCallToCommandService() {
        QueueCommandService service = mock(QueueCommandService.class);
        QueueEntryCommandController controller = new QueueEntryCommandController(service);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.MANAGER);
        QueueCallResponse expected = new QueueCallResponse(
                7L,
                QueueEntryStatus.CALLED,
                LocalDateTime.of(2026, 7, 27, 12, 0),
                1,
                100L,
                false
        );
        when(service.call(7L, principal)).thenReturn(expected);

        ApiResponse<QueueCallResponse> response = controller.call(7L, principal);

        verify(service).call(7L, principal);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 노쇼 대상과 인증 사용자를 서비스에 전달하고 공통 성공 응답을 반환하는지 검증한다. */
    @Test
    void delegatesNoShowToCommandService() {
        QueueCommandService service = mock(QueueCommandService.class);
        QueueEntryCommandController controller = new QueueEntryCommandController(service);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.MANAGER);
        QueueOperationResponse expected = new QueueOperationResponse(
                7L,
                20L,
                1,
                QueueEntryStatus.NO_SHOW,
                2,
                LocalDateTime.of(2026, 7, 27, 12, 0),
                LocalDateTime.of(2026, 7, 27, 12, 1)
        );
        when(service.markNoShow(7L, principal)).thenReturn(expected);

        ApiResponse<QueueOperationResponse> response = controller.markNoShow(7L, principal);

        verify(service).markNoShow(7L, principal);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }
}
