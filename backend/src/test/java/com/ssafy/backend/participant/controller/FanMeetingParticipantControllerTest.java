package com.ssafy.backend.participant.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.participant.domain.ParticipantSource;
import com.ssafy.backend.participant.dto.ParticipantSummaryResponse;
import com.ssafy.backend.participant.service.ParticipantQueryService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FanMeetingParticipantControllerTest {

    private static final AuthenticatedUser MANAGER = new AuthenticatedUser(10L, UserRole.MANAGER);

    /** 참가자 목록 조회의 검색 조건과 페이지 값을 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesParticipantList() {
        ParticipantQueryService service = mock(ParticipantQueryService.class);
        FanMeetingParticipantController controller = new FanMeetingParticipantController(service);
        PageResponse<ParticipantSummaryResponse> expected =
                new PageResponse<>(List.of(), 0, 6, 0L, 0, false);
        when(service.getParticipants(1L, "READY", "팬", null, 0, 6, MANAGER)).thenReturn(expected);

        ApiResponse<PageResponse<ParticipantSummaryResponse>> response =
                controller.getParticipants(1L, "READY", "팬", null, 0, 6, MANAGER);

        verify(service).getParticipants(1L, "READY", "팬", null, 0, 6, MANAGER);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 참가자 상세 조회의 식별자와 인증 정보를 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesParticipantDetail() {
        ParticipantQueryService service = mock(ParticipantQueryService.class);
        FanMeetingParticipantController controller = new FanMeetingParticipantController(service);
        ParticipantSummaryResponse expected = new ParticipantSummaryResponse(
                100L, 30L, "첫째팬", null, 1, "READY", "WAITING", ParticipantSource.APPLICATION);
        when(service.getParticipant(1L, 100L, MANAGER)).thenReturn(expected);

        ApiResponse<ParticipantSummaryResponse> response =
                controller.getParticipant(1L, 100L, MANAGER);

        verify(service).getParticipant(1L, 100L, MANAGER);
        assertThat(response.data()).isSameAs(expected);
    }
}
