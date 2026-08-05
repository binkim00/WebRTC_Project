package com.ssafy.backend.meeting.controller;

import com.ssafy.backend.meeting.service.FanMeetingManagementService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 예정 시각을 앞당기는 운영 명령의 URL 권한 규칙을 검증한다.
 *
 * <p>이 명령들은 접수 기간과 대기실 오픈 시각을 바꾸므로 담당 매니저와 1인 인플루언서만
 * 부를 수 있어야 한다. 팬에게 열리면 자기 응모 기회를 스스로 늘릴 수 있다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:fan-meeting-schedule-command-security;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class FanMeetingScheduleCommandSecurityTest {

    private static final String OPEN_APPLICATIONS_PATH =
            "/api/v1/fan-meetings/10/applications/open";
    private static final String CLOSE_APPLICATIONS_PATH =
            "/api/v1/fan-meetings/10/applications/close";
    private static final String OPEN_WAITING_ROOM_PATH =
            "/api/v1/fan-meetings/10/waiting-room/open";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private FanMeetingManagementService managementService;

    /** 인증되지 않은 응모 시작 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedOpenApplications() throws Exception {
        mockMvc.perform(post(OPEN_APPLICATIONS_PATH)).andExpect(status().isUnauthorized());

        verifyNoInteractions(managementService);
    }

    /** 인증되지 않은 응모 마감 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedCloseApplications() throws Exception {
        mockMvc.perform(post(CLOSE_APPLICATIONS_PATH)).andExpect(status().isUnauthorized());

        verifyNoInteractions(managementService);
    }

    /** 인증되지 않은 대기실 개방 요청이 서비스 호출 전 HTTP 401로 거부되는지 검증한다. */
    @Test
    void rejectsUnauthenticatedOpenWaitingRoom() throws Exception {
        mockMvc.perform(post(OPEN_WAITING_ROOM_PATH)).andExpect(status().isUnauthorized());

        verifyNoInteractions(managementService);
    }

    /** 팬 역할의 응모 시작 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanOpenApplications() throws Exception {
        mockMvc.perform(post(OPEN_APPLICATIONS_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(managementService);
    }

    /** 팬 역할의 응모 마감 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanCloseApplications() throws Exception {
        mockMvc.perform(post(CLOSE_APPLICATIONS_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(managementService);
    }

    /** 팬 역할의 대기실 개방 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanOpenWaitingRoom() throws Exception {
        mockMvc.perform(post(OPEN_WAITING_ROOM_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(managementService);
    }

    /** 소속 인플루언서의 응모 시작 요청이 서비스 호출 전 HTTP 403으로 거부되는지 검증한다. */
    @Test
    @WithMockUser(roles = "INFLUENCER")
    void rejectsInfluencerOpenApplications() throws Exception {
        mockMvc.perform(post(OPEN_APPLICATIONS_PATH)).andExpect(status().isForbidden());

        verifyNoInteractions(managementService);
    }
}
