package com.ssafy.backend.application.controller;

import com.ssafy.backend.application.dto.ApplicantListResponse;
import com.ssafy.backend.application.dto.ApplicationFormResponse;
import com.ssafy.backend.application.dto.ApplicationFormSaveResponse;
import com.ssafy.backend.application.dto.ApplicationStatisticsResponse;
import com.ssafy.backend.application.dto.MyApplicationSummaryResponse;
import com.ssafy.backend.application.service.ApplicationFormService;
import com.ssafy.backend.application.service.ApplicationQueryService;
import com.ssafy.backend.common.api.PageResponse;
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
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:application-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class ApplicationApiSecurityTest {

    private static final String FORM_PATH = "/api/v1/fan-meetings/10/application-form";
    private static final String MY_APPLICATION_PATH = "/api/v1/fan-meetings/10/applications/me";
    private static final String MY_APPLICATIONS_PATH = "/api/v1/users/me/applications";
    private static final String APPLICANTS_PATH = "/api/v1/fan-meetings/10/applications";
    private static final String STATISTICS_PATH =
            "/api/v1/fan-meetings/10/applications/statistics";
    private static final String FORM_BODY = """
            {"formDescription":"안내문","questions":[]}
            """;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ApplicationFormService applicationFormService;

    @MockitoBean
    private ApplicationQueryService applicationQueryService;

    /** 로그인하지 않은 사용자도 응모 폼 조회에 접근할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousFormLookup() throws Exception {
        when(applicationFormService.getForm(10L))
                .thenReturn(new ApplicationFormResponse(300L, "안내문", List.of()));

        mockMvc.perform(get(FORM_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.formId").value(300));
    }

    /** 인증되지 않은 응모 폼 저장 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedFormSave() throws Exception {
        mockMvc.perform(put(FORM_PATH).contentType(MediaType.APPLICATION_JSON).content(FORM_BODY))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(applicationFormService);
    }

    /** 팬 역할의 응모 폼 저장 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanFormSave() throws Exception {
        mockMvc.perform(put(FORM_PATH).contentType(MediaType.APPLICATION_JSON).content(FORM_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(applicationFormService);
    }

    /** 매니저 역할이 응모 폼 저장 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerFormSave() throws Exception {
        when(applicationFormService.saveForm(eq(10L), any(), isNull())).thenReturn(
                new ApplicationFormSaveResponse(
                        300L, 10L, "안내문", List.of(), LocalDateTime.of(2026, 7, 30, 12, 0)
                )
        );

        mockMvc.perform(put(FORM_PATH).contentType(MediaType.APPLICATION_JSON).content(FORM_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meetingId").value(10));
    }

    /** 1인 인플루언서 역할이 응모 폼 저장 API에 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerFormSave() throws Exception {
        when(applicationFormService.saveForm(eq(10L), any(), isNull())).thenReturn(
                new ApplicationFormSaveResponse(
                        300L, 10L, "안내문", List.of(), LocalDateTime.of(2026, 7, 30, 12, 0)
                )
        );

        mockMvc.perform(put(FORM_PATH).contentType(MediaType.APPLICATION_JSON).content(FORM_BODY))
                .andExpect(status().isOk());
    }

    /** 소속 인플루언서 역할의 응모 폼 저장 요청이 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void rejectsInfluencerFormSave() throws Exception {
        mockMvc.perform(put(FORM_PATH).contentType(MediaType.APPLICATION_JSON).content(FORM_BODY))
                .andExpect(status().isForbidden());

        verifyNoInteractions(applicationFormService);
    }

    /** 인증되지 않은 내 응모 결과 조회가 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedMyApplicationLookup() throws Exception {
        mockMvc.perform(get(MY_APPLICATION_PATH)).andExpect(status().isUnauthorized());

        verifyNoInteractions(applicationQueryService);
    }

    /** 매니저 역할의 내 응모 결과 조회가 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerMyApplicationLookup() throws Exception {
        mockMvc.perform(get(MY_APPLICATION_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(applicationQueryService);
    }

    /** 팬 역할의 내 응모 내역 목록 조회를 허용하는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsFanMyApplicationList() throws Exception {
        when(applicationQueryService.getMyApplications(isNull(), anyInt(), anyInt(), isNull()))
                .thenReturn(new PageResponse<MyApplicationSummaryResponse>(
                        List.of(), 0, 20, 0L, 0, false
                ));

        mockMvc.perform(get(MY_APPLICATIONS_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0));
    }

    /** 매니저 역할의 내 응모 내역 목록 조회가 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerMyApplicationList() throws Exception {
        mockMvc.perform(get(MY_APPLICATIONS_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(applicationQueryService);
    }

    /** 팬 역할의 응모자 목록 조회가 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanApplicantList() throws Exception {
        mockMvc.perform(get(APPLICANTS_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(applicationQueryService);
    }

    /** 매니저 역할의 응모자 목록 조회를 허용하는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerApplicantList() throws Exception {
        when(applicationQueryService.getApplicants(
                eq(10L), isNull(), isNull(), anyInt(), anyInt(), isNull()))
                .thenReturn(new ApplicantListResponse(0L, List.of(), 0, 20, 0L, 0, false));

        mockMvc.perform(get(APPLICANTS_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalApplications").value(0));
    }

    /** 팬 역할의 응모 통계 조회가 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanStatistics() throws Exception {
        mockMvc.perform(get(STATISTICS_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(applicationQueryService);
    }

    /** 1인 인플루언서 역할의 응모 통계 조회를 허용하는지 검증한다. */
    @Test
    @WithMockUser(roles = "SOLO_INFLUENCER")
    void allowsSoloInfluencerStatistics() throws Exception {
        when(applicationQueryService.getStatistics(eq(10L), isNull()))
                .thenReturn(new ApplicationStatisticsResponse(0L, 0L, 0L, 0L, List.of()));

        mockMvc.perform(get(STATISTICS_PATH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questionStats").isArray());
    }
}
