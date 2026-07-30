package com.ssafy.backend.influencer.controller;

import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.influencer.dto.FanMemoCreateResponse;
import com.ssafy.backend.influencer.dto.FanMemoDeleteResponse;
import com.ssafy.backend.influencer.dto.FanMemoListResponse;
import com.ssafy.backend.influencer.dto.FanMemoUpdateResponse;
import com.ssafy.backend.influencer.service.FanMemoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:fan-memo-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef"
})
@AutoConfigureMockMvc
class FanMemoSecurityTest {

    private static final String MEMOS_URL = "/api/v1/influencers/me/fans/7/memos";
    private static final String MEMO_URL = "/api/v1/fan-memos/1";
    private static final String CREATE_BODY = "{\"meetingId\":100,\"content\":\"메모 내용\"}";
    private static final String UPDATE_BODY = "{\"content\":\"수정된 메모\"}";
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 31, 12, 0);

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FanMemoService fanMemoService;

    /** 인증되지 않은 메모 목록 조회가 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedMemoList() throws Exception {
        mockMvc.perform(get(MEMOS_URL))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(fanMemoService);
    }

    /** 팬 역할의 메모 목록 조회가 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanMemoList() throws Exception {
        mockMvc.perform(get(MEMOS_URL))
                .andExpect(status().isForbidden());

        verifyNoInteractions(fanMemoService);
    }

    /** 인플루언서 역할이 메모 목록 API의 기본 페이지 값으로 접근하는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void allowsInfluencerMemoList() throws Exception {
        when(fanMemoService.getMemos(eq(7L), eq(0), eq(20), isNull()))
                .thenReturn(emptyPage());

        mockMvc.perform(get(MEMOS_URL))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(20));
    }

    /** 요청한 페이지 번호와 크기가 서비스로 그대로 전달되는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void passesRequestedPageArguments() throws Exception {
        when(fanMemoService.getMemos(eq(7L), eq(1), eq(5), isNull()))
                .thenReturn(new PageResponse<FanMemoListResponse>(List.of(), 1, 5, 0L, 0, false));

        mockMvc.perform(get(MEMOS_URL + "?page=1&size=5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.size").value(5));
    }

    /** 1인 인플루언서 역할이 메모 목록 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerMemoList() throws Exception {
        when(fanMemoService.getMemos(eq(7L), eq(0), eq(20), isNull()))
                .thenReturn(emptyPage());

        mockMvc.perform(get(MEMOS_URL))
                .andExpect(status().isOk());
    }

    /** 매니저 역할이 메모 목록 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerMemoList() throws Exception {
        when(fanMemoService.getMemos(eq(7L), eq(0), eq(20), isNull()))
                .thenReturn(emptyPage());

        mockMvc.perform(get(MEMOS_URL))
                .andExpect(status().isOk());
    }

    /** 인증되지 않은 메모 작성이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedMemoCreate() throws Exception {
        mockMvc.perform(post(MEMOS_URL).contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(fanMemoService);
    }

    /** 매니저 역할의 메모 작성이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerMemoCreate() throws Exception {
        mockMvc.perform(post(MEMOS_URL).contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(fanMemoService);
    }

    /** 팬 역할의 메모 작성이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanMemoCreate() throws Exception {
        mockMvc.perform(post(MEMOS_URL).contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(fanMemoService);
    }

    /** 인플루언서 역할의 메모 작성이 HTTP 201로 응답되는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void allowsInfluencerMemoCreate() throws Exception {
        when(fanMemoService.createMemo(eq(7L), any(), isNull()))
                .thenReturn(new FanMemoCreateResponse(1L, 7L, 100L, "메모 내용", NOW));

        mockMvc.perform(post(MEMOS_URL).contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.memoId").value(1))
                .andExpect(jsonPath("$.data.fanId").value(7));
    }

    /** 내용이 빈 작성 요청이 서비스 호출 전 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void rejectsBlankContentBeforeService() throws Exception {
        mockMvc.perform(post(MEMOS_URL).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"meetingId\":100,\"content\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(fanMemoService);
    }

    /** 최대 길이를 넘는 작성 요청이 서비스 호출 전 HTTP 400으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void rejectsTooLongContentBeforeService() throws Exception {
        mockMvc.perform(post(MEMOS_URL).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"" + "가".repeat(301) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(fanMemoService);
    }

    /** 인증되지 않은 메모 수정이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedMemoUpdate() throws Exception {
        mockMvc.perform(patch(MEMO_URL).contentType(MediaType.APPLICATION_JSON).content(UPDATE_BODY))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(fanMemoService);
    }

    /** 매니저 역할의 메모 수정이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerMemoUpdate() throws Exception {
        mockMvc.perform(patch(MEMO_URL).contentType(MediaType.APPLICATION_JSON).content(UPDATE_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(fanMemoService);
    }

    /** 팬 역할의 메모 수정이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanMemoUpdate() throws Exception {
        mockMvc.perform(patch(MEMO_URL).contentType(MediaType.APPLICATION_JSON).content(UPDATE_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(fanMemoService);
    }

    /** 인플루언서 역할이 메모 수정 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void allowsInfluencerMemoUpdate() throws Exception {
        when(fanMemoService.updateMemo(eq(1L), any(), isNull()))
                .thenReturn(new FanMemoUpdateResponse(1L, 100L, "수정된 메모", NOW, NOW.plusMinutes(5)));

        mockMvc.perform(patch(MEMO_URL).contentType(MediaType.APPLICATION_JSON).content(UPDATE_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").value("수정된 메모"));
    }

    /** 1인 인플루언서 역할이 메모 수정 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerMemoUpdate() throws Exception {
        when(fanMemoService.updateMemo(eq(1L), any(), isNull()))
                .thenReturn(new FanMemoUpdateResponse(1L, null, "수정된 메모", NOW, NOW));

        mockMvc.perform(patch(MEMO_URL).contentType(MediaType.APPLICATION_JSON).content(UPDATE_BODY))
                .andExpect(status().isOk());
    }

    /** 인증되지 않은 메모 삭제가 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedMemoDelete() throws Exception {
        mockMvc.perform(delete(MEMO_URL))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(fanMemoService);
    }

    /** 매니저 역할의 메모 삭제가 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerMemoDelete() throws Exception {
        mockMvc.perform(delete(MEMO_URL))
                .andExpect(status().isForbidden());

        verifyNoInteractions(fanMemoService);
    }

    /** 팬 역할의 메모 삭제가 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanMemoDelete() throws Exception {
        mockMvc.perform(delete(MEMO_URL))
                .andExpect(status().isForbidden());

        verifyNoInteractions(fanMemoService);
    }

    /** 인플루언서 역할이 메모 삭제 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void allowsInfluencerMemoDelete() throws Exception {
        when(fanMemoService.deleteMemo(eq(1L), isNull()))
                .thenReturn(new FanMemoDeleteResponse(1L, true, NOW));

        mockMvc.perform(delete(MEMO_URL))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.deleted").value(true))
                .andExpect(jsonPath("$.data.deletedAt").exists());
    }

    /**
     * 항목이 없는 첫 페이지 응답을 만든다.
     *
     * @return 기본 페이지 크기의 빈 페이지 응답
     */
    private PageResponse<FanMemoListResponse> emptyPage() {
        return new PageResponse<>(List.of(), 0, 20, 0L, 0, false);
    }
}
