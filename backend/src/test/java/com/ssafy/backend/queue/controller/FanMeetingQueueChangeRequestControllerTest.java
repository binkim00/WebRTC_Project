package com.ssafy.backend.queue.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;
import com.ssafy.backend.queue.dto.QueueChangeRequestSummaryResponse;
import com.ssafy.backend.queue.service.QueueChangeRequestService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FanMeetingQueueChangeRequestControllerTest {

    /** 상태 조건과 페이지 값을 서비스에 그대로 전달하고 페이지 응답을 반환하는지 검증한다. */
    @Test
    void delegatesChangeRequestListToService() {
        QueueChangeRequestService service = mock(QueueChangeRequestService.class);
        FanMeetingQueueChangeRequestController controller =
                new FanMeetingQueueChangeRequestController(service);
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.MANAGER);
        PageResponse<QueueChangeRequestSummaryResponse> expected = new PageResponse<>(
                List.of(new QueueChangeRequestSummaryResponse(
                        5L, 10L, "테스트팬", "profile.png", "순서를 미뤄주세요.",
                        LocalDateTime.of(2026, 7, 30, 12, 0), 3,
                        QueueChangeRequestStatus.PENDING)),
                0, 20, 1, 1, false);
        when(service.getRequests(1L, QueueChangeRequestStatus.PENDING, 0, 20, principal))
                .thenReturn(expected);

        ApiResponse<PageResponse<QueueChangeRequestSummaryResponse>> response =
                controller.getChangeRequests(
                        1L, QueueChangeRequestStatus.PENDING, 0, 20, principal);

        verify(service).getRequests(1L, QueueChangeRequestStatus.PENDING, 0, 20, principal);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 상태 조건을 생략하면 전체 조회로 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesChangeRequestListWithoutStatusFilter() {
        QueueChangeRequestService service = mock(QueueChangeRequestService.class);
        FanMeetingQueueChangeRequestController controller =
                new FanMeetingQueueChangeRequestController(service);
        AuthenticatedUser principal = new AuthenticatedUser(20L, UserRole.MANAGER);
        PageResponse<QueueChangeRequestSummaryResponse> expected =
                new PageResponse<>(List.of(), 0, 20, 0, 0, false);
        when(service.getRequests(1L, null, 0, 20, principal)).thenReturn(expected);

        ApiResponse<PageResponse<QueueChangeRequestSummaryResponse>> response =
                controller.getChangeRequests(1L, null, 0, 20, principal);

        verify(service).getRequests(1L, null, 0, 20, principal);
        assertThat(response.data().content()).isEmpty();
    }
}
