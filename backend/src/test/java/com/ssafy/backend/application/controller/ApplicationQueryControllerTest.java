package com.ssafy.backend.application.controller;

import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.dto.ApplicantListResponse;
import com.ssafy.backend.application.dto.ApplicationStatisticsResponse;
import com.ssafy.backend.application.dto.MyApplicationResponse;
import com.ssafy.backend.application.dto.MyApplicationSummaryResponse;
import com.ssafy.backend.application.service.ApplicationQueryService;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ApplicationQueryControllerTest {

    private static final AuthenticatedUser FAN = new AuthenticatedUser(1L, UserRole.FAN);
    private static final AuthenticatedUser MANAGER = new AuthenticatedUser(3L, UserRole.MANAGER);

    /** 내 응모 결과 조회의 팬미팅 식별자와 인증 정보를 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesGetMyApplication() {
        ApplicationQueryService service = mock(ApplicationQueryService.class);
        ApplicationQueryController controller = new ApplicationQueryController(service);
        MyApplicationResponse expected = new MyApplicationResponse(
                100L, ApplicationStatus.SUBMITTED, LocalDateTime.of(2026, 7, 30, 12, 0),
                null, null, null, null, 10L, "테스트 팬미팅", null, "테스트인플루언서",
                LocalDateTime.of(2026, 8, 10, 20, 0)
        );
        when(service.getMyApplication(10L, FAN)).thenReturn(expected);

        ApiResponse<MyApplicationResponse> response = controller.getMyApplication(10L, FAN);

        verify(service).getMyApplication(10L, FAN);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 내 응모 내역 목록의 상태 필터와 페이지 값을 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesGetMyApplications() {
        ApplicationQueryService service = mock(ApplicationQueryService.class);
        ApplicationQueryController controller = new ApplicationQueryController(service);
        PageResponse<MyApplicationSummaryResponse> expected =
                new PageResponse<>(List.of(), 0, 20, 0L, 0, false);
        when(service.getMyApplications(ApplicationStatus.SELECTED, 0, 20, FAN))
                .thenReturn(expected);

        ApiResponse<PageResponse<MyApplicationSummaryResponse>> response =
                controller.getMyApplications(ApplicationStatus.SELECTED, 0, 20, FAN);

        verify(service).getMyApplications(ApplicationStatus.SELECTED, 0, 20, FAN);
        assertThat(response.data()).isSameAs(expected);
    }

    /** 응모자 목록 조회의 필터, 페이지 값과 인증 정보를 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesGetApplicants() {
        ApplicationQueryService service = mock(ApplicationQueryService.class);
        ApplicationQueryController controller = new ApplicationQueryController(service);
        ApplicantListResponse expected =
                new ApplicantListResponse(0L, List.of(), 0, 20, 0L, 0, false);
        when(service.getApplicants(10L, ApplicationStatus.SUBMITTED, "멜리", 0, 20, MANAGER))
                .thenReturn(expected);

        ApiResponse<ApplicantListResponse> response = controller.getApplicants(
                10L, ApplicationStatus.SUBMITTED, "멜리", 0, 20, MANAGER
        );

        verify(service).getApplicants(10L, ApplicationStatus.SUBMITTED, "멜리", 0, 20, MANAGER);
        assertThat(response.data()).isSameAs(expected);
    }

    /** 응모 통계 조회의 팬미팅 식별자와 인증 정보를 서비스에 전달하는지 검증한다. */
    @Test
    void delegatesGetStatistics() {
        ApplicationQueryService service = mock(ApplicationQueryService.class);
        ApplicationQueryController controller = new ApplicationQueryController(service);
        ApplicationStatisticsResponse expected =
                new ApplicationStatisticsResponse(0L, 0L, 0L, 0L, List.of());
        when(service.getStatistics(10L, MANAGER)).thenReturn(expected);

        ApiResponse<ApplicationStatisticsResponse> response =
                controller.getStatistics(10L, MANAGER);

        verify(service).getStatistics(10L, MANAGER);
        assertThat(response.data()).isSameAs(expected);
    }
}
