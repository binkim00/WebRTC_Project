package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
import com.ssafy.backend.post.service.PostQueryService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ServiceNoticeControllerTest {

    private static final AuthenticatedUser FAN_PRINCIPAL =
            new AuthenticatedUser(11L, UserRole.FAN);

    /** 목록 조회 요청의 검색어와 페이지 값을 조회 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesServiceNoticeListToQueryService() {
        PostQueryService queryService = mock(PostQueryService.class);
        ServiceNoticeController controller = new ServiceNoticeController(queryService);
        PageResponse<NoticeSummaryResponse> expected = new PageResponse<>(
                List.of(summary()), 0, 20, 1, 1, false
        );
        when(queryService.getServiceNotices("melly", 0, 20)).thenReturn(expected);

        ApiResponse<PageResponse<NoticeSummaryResponse>> response =
                controller.getServiceNotices("melly", 0, 20);

        verify(queryService).getServiceNotices("melly", 0, 20);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 상세 조회 요청의 공지 식별자와 인증 정보를 조회 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesServiceNoticeDetailToQueryService() {
        PostQueryService queryService = mock(PostQueryService.class);
        ServiceNoticeController controller = new ServiceNoticeController(queryService);
        NoticeDetailResponse expected = detail();
        when(queryService.getServiceNotice(100L, FAN_PRINCIPAL)).thenReturn(expected);

        ApiResponse<NoticeDetailResponse> response =
                controller.getServiceNotice(100L, FAN_PRINCIPAL);

        verify(queryService).getServiceNotice(100L, FAN_PRINCIPAL);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 테스트에 사용할 목록 요약 응답을 생성한다. */
    private NoticeSummaryResponse summary() {
        return new NoticeSummaryResponse(
                100L, null, "서비스 공지", 1L, "관리자", null,
                LocalDateTime.of(2026, 7, 30, 10, 0), false
        );
    }

    /** 테스트에 사용할 상세 응답을 생성한다. */
    private NoticeDetailResponse detail() {
        return new NoticeDetailResponse(
                100L, null, "서비스 공지", "본문", 1L, "관리자", null, List.of(),
                LocalDateTime.of(2026, 7, 30, 10, 0), LocalDateTime.of(2026, 7, 30, 10, 0),
                false, false, false
        );
    }
}
