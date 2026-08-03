package com.ssafy.backend.meeting.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.meeting.dto.FanMeetingStatisticsResponse;
import com.ssafy.backend.meeting.service.FanMeetingStatisticsService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FanMeetingStatisticsControllerTest {

    private static final AuthenticatedUser MANAGER = new AuthenticatedUser(30L, UserRole.MANAGER);

    /** 팬미팅 결과 통계 조회의 팬미팅 식별자와 인증 정보를 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesGetStatistics() {
        FanMeetingStatisticsService service = mock(FanMeetingStatisticsService.class);
        FanMeetingStatisticsController controller = new FanMeetingStatisticsController(service);
        FanMeetingStatisticsResponse expected =
                new FanMeetingStatisticsResponse(42L, 10L, 9L, 8L, 1L, 0L, 120L, 960L);
        when(service.getStatistics(10L, MANAGER)).thenReturn(expected);

        ApiResponse<FanMeetingStatisticsResponse> response =
                controller.getStatistics(10L, MANAGER);

        verify(service).getStatistics(10L, MANAGER);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }
}
