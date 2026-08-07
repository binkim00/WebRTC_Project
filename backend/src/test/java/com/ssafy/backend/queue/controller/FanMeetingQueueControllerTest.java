package com.ssafy.backend.queue.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.queue.domain.QueueDisplayStatus;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueEnterResponse;
import com.ssafy.backend.queue.dto.QueueSnapshotResponse;
import com.ssafy.backend.queue.service.QueueCommandService;
import com.ssafy.backend.queue.service.QueueQueryService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FanMeetingQueueControllerTest {

    private static final AuthenticatedUser FAN_PRINCIPAL =
            new AuthenticatedUser(11L, UserRole.FAN);

    /** 팬미팅과 인증 사용자 정보를 입장 서비스에 전달하고 공통 성공 응답을 반환하는지 검증한다. */
    @Test
    void delegatesQueueEntryToCommandService() {
        QueueCommandService commandService = mock(QueueCommandService.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        FanMeetingQueueController controller =
                new FanMeetingQueueController(commandService, queryService);
        QueueEnterResponse expected = new QueueEnterResponse(
                7L,
                1,
                QueueEntryStatus.WAITING,
                LocalDateTime.of(2026, 7, 27, 12, 0),
                0,
                0
        );
        when(commandService.enter(1L, FAN_PRINCIPAL)).thenReturn(expected);

        ApiResponse<QueueEnterResponse> response = controller.enter(1L, FAN_PRINCIPAL);

        verify(commandService).enter(1L, FAN_PRINCIPAL);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 팬미팅과 인증 사용자 정보를 조회 서비스에 전달하고 현재 대기 정보를 반환하는지 검증한다. */
    @Test
    void delegatesMyQueueLookupToQueryService() {
        QueueCommandService commandService = mock(QueueCommandService.class);
        QueueQueryService queryService = mock(QueueQueryService.class);
        FanMeetingQueueController controller =
                new FanMeetingQueueController(commandService, queryService);
        QueueSnapshotResponse expected = new QueueSnapshotResponse(
                7L,
                1,
                0,
                0,
                QueueDisplayStatus.WAITING,
                0,
                null,
                null,
                false,
                null,
                null,
                null,
                null
        );
        when(queryService.getMySnapshot(1L, FAN_PRINCIPAL)).thenReturn(expected);

        ApiResponse<QueueSnapshotResponse> response =
                controller.getMyQueue(1L, FAN_PRINCIPAL);

        verify(queryService).getMySnapshot(1L, FAN_PRINCIPAL);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }
}
