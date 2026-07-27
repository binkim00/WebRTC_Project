package com.ssafy.backend.queue.controller;

import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueEnterResponse;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.queue.service.QueueCommandService;
import com.ssafy.backend.queue.service.QueueQueryService;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef"
})
@AutoConfigureMockMvc
class FanMeetingQueueSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private QueueCommandService commandService;

    @MockitoBean
    private QueueQueryService queryService;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private FanMeetingRepository fanMeetingRepository;

    @MockitoBean
    private MeetingOperationSettingRepository operationSettingRepository;

    @MockitoBean
    private OrganizationMemberRepository organizationMemberRepository;

    @MockitoBean
    private ParticipantRepository participantRepository;

    @MockitoBean
    private QueueEntryRepository queueEntryRepository;

    @MockitoBean
    private CallSessionRepository callSessionRepository;

    /** 인증 정보가 없으면 팬 대기실 입장 API가 HTTP 401을 반환하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedQueueEntry() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/queue/enter"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(commandService);
    }

    /** MANAGER 역할은 팬 전용 대기실 입장 API에서 HTTP 403을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerFromFanQueueEntry() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/1/queue/enter"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(commandService);
    }

    /** FAN 역할은 대기실 입장 Controller까지 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsFanToEnterQueue() throws Exception {
        QueueEnterResponse response = new QueueEnterResponse(
                7L,
                1,
                QueueEntryStatus.WAITING,
                LocalDateTime.of(2026, 7, 27, 12, 0),
                0,
                0
        );
        when(commandService.enter(eq(1L), isNull())).thenReturn(response);

        mockMvc.perform(post("/api/v1/fan-meetings/1/queue/enter"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.queueEntryId").value(7));
    }
}
