package com.ssafy.backend.queue.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.queue.domain.QueueChangeRequestDecision;
import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionRequest;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionResponse;
import com.ssafy.backend.queue.service.QueueChangeRequestService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QueueChangeRequestControllerTest {

    /** 승인 처리 요청을 서비스에 그대로 전달하고 공통 성공 응답을 반환하는지 검증한다. */
    @Test
    void delegatesApprovalToChangeRequestService() {
        QueueChangeRequestService service = mock(QueueChangeRequestService.class);
        QueueChangeRequestController controller = new QueueChangeRequestController(service);
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.MANAGER);
        QueueChangeRequestDecisionRequest request = new QueueChangeRequestDecisionRequest(
                QueueChangeRequestDecision.APPROVED, 4, null);
        QueueChangeRequestDecisionResponse expected = new QueueChangeRequestDecisionResponse(
                5L, QueueChangeRequestStatus.APPROVED, 2, 4,
                LocalDateTime.of(2026, 7, 30, 12, 0));
        when(service.process(5L, request, principal)).thenReturn(expected);

        ApiResponse<QueueChangeRequestDecisionResponse> response =
                controller.process(5L, request, principal);

        verify(service).process(5L, request, principal);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 거절 처리 요청도 같은 경로로 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesRejectionToChangeRequestService() {
        QueueChangeRequestService service = mock(QueueChangeRequestService.class);
        QueueChangeRequestController controller = new QueueChangeRequestController(service);
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.MANAGER);
        QueueChangeRequestDecisionRequest request = new QueueChangeRequestDecisionRequest(
                QueueChangeRequestDecision.REJECTED, null, "다음 통화가 예정되어 있습니다.");
        QueueChangeRequestDecisionResponse expected = new QueueChangeRequestDecisionResponse(
                5L, QueueChangeRequestStatus.REJECTED, 2, null,
                LocalDateTime.of(2026, 7, 30, 12, 0));
        when(service.process(5L, request, principal)).thenReturn(expected);

        ApiResponse<QueueChangeRequestDecisionResponse> response =
                controller.process(5L, request, principal);

        verify(service).process(5L, request, principal);
        assertThat(response.data().changedPosition()).isNull();
    }
}
