package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.FollowCreateResponse;
import com.ssafy.backend.influencer.dto.FollowDeleteResponse;
import com.ssafy.backend.influencer.dto.FollowerSummaryResponse;
import com.ssafy.backend.influencer.dto.FollowingSummaryResponse;
import com.ssafy.backend.influencer.service.FollowingService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FollowingControllerTest {

    private static final AuthenticatedUser FAN = new AuthenticatedUser(1L, UserRole.FAN);
    private static final AuthenticatedUser INFLUENCER =
            new AuthenticatedUser(2L, UserRole.INFLUENCER);

    /** 팔로우 대상과 인증 정보를 서비스에 전달하고 공통 성공 응답을 반환하는지 검증한다. */
    @Test
    void delegatesFollow() {
        FollowingService service = mock(FollowingService.class);
        FollowingController controller = new FollowingController(service);
        FollowCreateResponse expected = new FollowCreateResponse(
                2L, true, LocalDateTime.of(2026, 7, 30, 15, 0), 3L
        );
        when(service.follow(2L, FAN)).thenReturn(expected);

        ApiResponse<FollowCreateResponse> response = controller.follow(2L, FAN);

        verify(service).follow(2L, FAN);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 팔로우 취소 대상과 인증 정보를 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesUnfollow() {
        FollowingService service = mock(FollowingService.class);
        FollowingController controller = new FollowingController(service);
        FollowDeleteResponse expected = new FollowDeleteResponse(2L, false, 2L);
        when(service.unfollow(2L, FAN)).thenReturn(expected);

        ApiResponse<FollowDeleteResponse> response = controller.unfollow(2L, FAN);

        verify(service).unfollow(2L, FAN);
        assertThat(response.data()).isSameAs(expected);
    }

    /** 팔로잉 목록의 페이지 값과 인증 정보를 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesMyFollowings() {
        FollowingService service = mock(FollowingService.class);
        FollowingController controller = new FollowingController(service);
        PageResponse<FollowingSummaryResponse> expected =
                new PageResponse<>(List.of(), 0, 20, 0L, 0, false);
        when(service.getMyFollowings(0, 20, FAN)).thenReturn(expected);

        ApiResponse<PageResponse<FollowingSummaryResponse>> response =
                controller.getMyFollowings(0, 20, FAN);

        verify(service).getMyFollowings(0, 20, FAN);
        assertThat(response.data()).isSameAs(expected);
    }

    /** 팔로워 목록의 페이지 값과 인증 정보를 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesMyFollowers() {
        FollowingService service = mock(FollowingService.class);
        FollowingController controller = new FollowingController(service);
        PageResponse<FollowerSummaryResponse> expected =
                new PageResponse<>(List.of(), 0, 20, 0L, 0, false);
        when(service.getMyFollowers(0, 20, INFLUENCER)).thenReturn(expected);

        ApiResponse<PageResponse<FollowerSummaryResponse>> response =
                controller.getMyFollowers(0, 20, INFLUENCER);

        verify(service).getMyFollowers(0, 20, INFLUENCER);
        assertThat(response.data()).isSameAs(expected);
    }
}
