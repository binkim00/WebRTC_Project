package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.post.dto.NoticeCreateRequest;
import com.ssafy.backend.post.dto.NoticeCreateResponse;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
import com.ssafy.backend.post.dto.PostDeleteResponse;
import com.ssafy.backend.post.dto.PostUpdateRequest;
import com.ssafy.backend.post.dto.PostUpdateResponse;
import com.ssafy.backend.post.service.PostCommandService;
import com.ssafy.backend.post.service.PostQueryService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
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
    private static final AuthenticatedUser ADMIN_PRINCIPAL =
            new AuthenticatedUser(9L, UserRole.ADMIN);

    private PostQueryService queryService;
    private PostCommandService commandService;
    private ServiceNoticeController controller;

    /** 각 테스트마다 mock 조회·작성 서비스로 컨트롤러를 새로 구성한다. */
    @BeforeEach
    void setUp() {
        queryService = mock(PostQueryService.class);
        commandService = mock(PostCommandService.class);
        controller = new ServiceNoticeController(queryService, commandService);
    }

    /** 목록 조회 요청의 검색어와 페이지 값을 조회 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesServiceNoticeListToQueryService() {
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
        NoticeDetailResponse expected = detail();
        when(queryService.getServiceNotice(100L, FAN_PRINCIPAL)).thenReturn(expected);

        ApiResponse<NoticeDetailResponse> response =
                controller.getServiceNotice(100L, FAN_PRINCIPAL);

        verify(queryService).getServiceNotice(100L, FAN_PRINCIPAL);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 작성 요청의 본문과 인증 정보를 작성 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesServiceNoticeCreationToCommandService() {
        NoticeCreateRequest request = new NoticeCreateRequest("서비스 공지", "본문", null);
        NoticeCreateResponse expected = new NoticeCreateResponse(
                100L, null, "서비스 공지", LocalDateTime.of(2026, 8, 5, 10, 0)
        );
        when(commandService.createServiceNotice(request, ADMIN_PRINCIPAL)).thenReturn(expected);

        ApiResponse<NoticeCreateResponse> response =
                controller.createServiceNotice(request, ADMIN_PRINCIPAL);

        verify(commandService).createServiceNotice(request, ADMIN_PRINCIPAL);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 수정 요청의 공지 식별자와 본문을 작성 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesServiceNoticeUpdateToCommandService() {
        PostUpdateRequest request = new PostUpdateRequest("새 제목", null, null);
        PostUpdateResponse expected = new PostUpdateResponse(
                100L, null, "새 제목", "본문", LocalDateTime.of(2026, 8, 5, 11, 0)
        );
        when(commandService.updateServiceNotice(100L, request, ADMIN_PRINCIPAL))
                .thenReturn(expected);

        ApiResponse<PostUpdateResponse> response =
                controller.updateServiceNotice(100L, request, ADMIN_PRINCIPAL);

        verify(commandService).updateServiceNotice(100L, request, ADMIN_PRINCIPAL);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 삭제 요청의 공지 식별자와 인증 정보를 작성 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesServiceNoticeDeletionToCommandService() {
        PostDeleteResponse expected = new PostDeleteResponse(
                100L, "PUBLISHED", LocalDateTime.of(2026, 8, 5, 12, 0)
        );
        when(commandService.deleteServiceNotice(100L, ADMIN_PRINCIPAL)).thenReturn(expected);

        ApiResponse<PostDeleteResponse> response =
                controller.deleteServiceNotice(100L, ADMIN_PRINCIPAL);

        verify(commandService).deleteServiceNotice(100L, ADMIN_PRINCIPAL);
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
