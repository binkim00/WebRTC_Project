package com.ssafy.backend.post.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.ApiResponse;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.post.dto.NoticeCreateRequest;
import com.ssafy.backend.post.dto.NoticeCreateResponse;
import com.ssafy.backend.post.dto.NoticeDetailResponse;
import com.ssafy.backend.post.dto.NoticeSummaryResponse;
import com.ssafy.backend.post.service.PostCommandService;
import com.ssafy.backend.post.service.PostQueryService;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FanMeetingNoticeControllerTest {

    private static final AuthenticatedUser MANAGER_PRINCIPAL =
            new AuthenticatedUser(1L, UserRole.MANAGER);
    private static final long MEETING_ID = 10L;
    private static final long NOTICE_ID = 100L;

    /** 목록 조회 요청의 팬미팅 식별자와 페이지 값을 조회 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesMeetingNoticeListToQueryService() {
        PostQueryService queryService = mock(PostQueryService.class);
        PostCommandService commandService = mock(PostCommandService.class);
        FanMeetingNoticeController controller =
                new FanMeetingNoticeController(queryService, commandService);
        PageResponse<NoticeSummaryResponse> expected = new PageResponse<>(
                List.of(summary()), 0, 20, 1, 1, false
        );
        when(queryService.getMeetingNotices(MEETING_ID, null, 0, 20)).thenReturn(expected);

        ApiResponse<PageResponse<NoticeSummaryResponse>> response =
                controller.getMeetingNotices(MEETING_ID, null, 0, 20);

        verify(queryService).getMeetingNotices(MEETING_ID, null, 0, 20);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 상세 조회 요청의 팬미팅·공지 식별자와 인증 정보를 조회 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesMeetingNoticeDetailToQueryService() {
        PostQueryService queryService = mock(PostQueryService.class);
        PostCommandService commandService = mock(PostCommandService.class);
        FanMeetingNoticeController controller =
                new FanMeetingNoticeController(queryService, commandService);
        NoticeDetailResponse expected = detail();
        when(queryService.getMeetingNotice(MEETING_ID, NOTICE_ID, MANAGER_PRINCIPAL))
                .thenReturn(expected);

        ApiResponse<NoticeDetailResponse> response =
                controller.getMeetingNotice(MEETING_ID, NOTICE_ID, MANAGER_PRINCIPAL);

        verify(queryService).getMeetingNotice(MEETING_ID, NOTICE_ID, MANAGER_PRINCIPAL);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 작성 요청의 팬미팅 식별자·요청 본문·인증 정보를 작성 서비스에 그대로 전달하는지 검증한다. */
    @Test
    void delegatesMeetingNoticeCreationToCommandService() {
        PostQueryService queryService = mock(PostQueryService.class);
        PostCommandService commandService = mock(PostCommandService.class);
        FanMeetingNoticeController controller =
                new FanMeetingNoticeController(queryService, commandService);
        NoticeCreateRequest request = new NoticeCreateRequest("공지 제목", "공지 본문");
        NoticeCreateResponse expected = new NoticeCreateResponse(
                NOTICE_ID, MEETING_ID, "공지 제목", LocalDateTime.of(2026, 7, 30, 10, 0)
        );
        when(commandService.createMeetingNotice(MEETING_ID, request, MANAGER_PRINCIPAL))
                .thenReturn(expected);

        ApiResponse<NoticeCreateResponse> response =
                controller.createMeetingNotice(MEETING_ID, request, MANAGER_PRINCIPAL);

        verify(commandService).createMeetingNotice(MEETING_ID, request, MANAGER_PRINCIPAL);
        assertThat(response.success()).isTrue();
        assertThat(response.data()).isSameAs(expected);
    }

    /** 테스트에 사용할 목록 요약 응답을 생성한다. */
    private NoticeSummaryResponse summary() {
        return new NoticeSummaryResponse(
                NOTICE_ID, MEETING_ID, "팬미팅 공지", 1L, "매니저", null,
                LocalDateTime.of(2026, 7, 30, 10, 0), false
        );
    }

    /** 테스트에 사용할 상세 응답을 생성한다. */
    private NoticeDetailResponse detail() {
        return new NoticeDetailResponse(
                NOTICE_ID, MEETING_ID, "팬미팅 공지", "본문", 1L, "매니저", null, List.of(),
                LocalDateTime.of(2026, 7, 30, 10, 0), LocalDateTime.of(2026, 7, 30, 10, 0),
                false, true, true
        );
    }
}
