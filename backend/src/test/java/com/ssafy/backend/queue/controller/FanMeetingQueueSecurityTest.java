package com.ssafy.backend.queue.controller;

import com.ssafy.backend.ai.repository.AiCallSummaryRepository;
import com.ssafy.backend.ai.repository.AiSubtitleRepository;
import com.ssafy.backend.ai.repository.FanCardRepository;
import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.application.service.ApplicationService;
import com.ssafy.backend.auth.repository.EmailVerificationTokenRepository;
import com.ssafy.backend.auth.repository.SocialAccountRepository;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.device.repository.DeviceCheckRepository;
import com.ssafy.backend.influencer.repository.FanMemoRepository;
import com.ssafy.backend.influencer.repository.FollowingRepository;
import com.ssafy.backend.influencer.repository.InfluencerProfileRepository;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.meeting.service.FanMeetingQueryService;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.organization.repository.OrganizationRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.post.repository.AttachmentRepository;
import com.ssafy.backend.post.repository.CommentReportRepository;
import com.ssafy.backend.post.repository.PostCommentRepository;
import com.ssafy.backend.post.repository.PostRepository;
import com.ssafy.backend.queue.domain.QueueChangeRequestDecision;
import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.dto.QueueChangeRequestCreateRequest;
import com.ssafy.backend.queue.dto.QueueChangeRequestCreateResponse;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionRequest;
import com.ssafy.backend.queue.dto.QueueChangeRequestDecisionResponse;
import com.ssafy.backend.queue.dto.QueueEnterResponse;
import com.ssafy.backend.queue.dto.QueuePositionChangeRequest;
import com.ssafy.backend.queue.dto.QueuePositionChangeResponse;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.queue.service.QueueChangeRequestService;
import com.ssafy.backend.queue.service.QueueCommandService;
import com.ssafy.backend.queue.service.QueuePositionService;
import com.ssafy.backend.queue.service.QueueQueryService;
import com.ssafy.backend.user.repository.UserRepository;
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

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
    private EmailVerificationTokenRepository emailVerificationTokenRepository;

    @MockitoBean
    private SocialAccountRepository socialAccountRepository;

    @MockitoBean
    private QueueCommandService commandService;

    @MockitoBean
    private QueueQueryService queryService;

    @MockitoBean
    private QueuePositionService positionService;

    @MockitoBean
    private QueueChangeRequestService changeRequestService;

    @MockitoBean
    private FanMeetingQueryService fanMeetingQueryService;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private FanMeetingRepository fanMeetingRepository;

    @MockitoBean
    private MeetingApplicationSettingRepository applicationSettingRepository;

    @MockitoBean
    private MeetingOperationSettingRepository operationSettingRepository;

    @MockitoBean
    private OrganizationMemberRepository organizationMemberRepository;

    @MockitoBean
    private OrganizationRepository organizationRepository;

    @MockitoBean
    private ParticipantRepository participantRepository;

    @MockitoBean
    private DeviceCheckRepository deviceCheckRepository;

    @MockitoBean
    private QueueEntryRepository queueEntryRepository;

    @MockitoBean
    private CallSessionRepository callSessionRepository;

    @MockitoBean
    private RecordingRepository recordingRepository;

    @MockitoBean
    private ApplicationRepository applicationRepository;

    @MockitoBean
    private ApplicationFormRepository applicationFormRepository;

    @MockitoBean
    private ApplicationQuestionRepository applicationQuestionRepository;

    @MockitoBean
    private ApplicationAnswerRepository applicationAnswerRepository;

    @MockitoBean
    private ApplicationService applicationService;

    @MockitoBean
    private NotificationRepository notificationRepository;

    @MockitoBean
    private FollowingRepository followingRepository;

    @MockitoBean
    private FanMemoRepository fanMemoRepository;

    @MockitoBean
    private InfluencerProfileRepository influencerProfileRepository;

    @MockitoBean
    private PostRepository postRepository;

    @MockitoBean
    private PostCommentRepository postCommentRepository;

    @MockitoBean
    private CommentReportRepository commentReportRepository;

    @MockitoBean
    private AttachmentRepository attachmentRepository;

    @MockitoBean
    private AiCallSummaryRepository aiCallSummaryRepository;

    @MockitoBean
    private AiSubtitleRepository aiSubtitleRepository;

    @MockitoBean
    private FanCardRepository fanCardRepository;

    /** 인증 정보가 없어도 공개 팬미팅 목록 API에 접근할 수 있는지 검증한다. */
    @Test
    void allowsAnonymousPublicMeetingList() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

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

    /** 인증 정보가 없으면 순서 변경 API가 HTTP 401을 반환하는지 검증한다. */
    @Test
    void rejectsUnauthenticatedPositionChange() throws Exception {
        mockMvc.perform(patch("/api/v1/queue-entries/7/position")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPosition\":2}"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(positionService);
    }

    /** FAN 역할은 매니저 전용 순서 변경 API에서 HTTP 403을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanFromPositionChange() throws Exception {
        mockMvc.perform(patch("/api/v1/queue-entries/7/position")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPosition\":2}"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(positionService);
    }

    /** MANAGER 역할은 순서 변경 Controller까지 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerToChangePosition() throws Exception {
        when(positionService.changePosition(
                eq(7L), eq(new QueuePositionChangeRequest(2, null)), isNull()))
                .thenReturn(new QueuePositionChangeResponse(
                        4, 2, LocalDateTime.of(2026, 7, 30, 12, 0)));

        mockMvc.perform(patch("/api/v1/queue-entries/7/position")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPosition\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.previousPosition").value(4))
                .andExpect(jsonPath("$.data.newPosition").value(2));
    }

    /** 순번이 없는 순서 변경 요청을 검증 단계에서 HTTP 400으로 거부하는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsPositionChangeWithoutNewPosition() throws Exception {
        mockMvc.perform(patch("/api/v1/queue-entries/7/position")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(positionService);
    }

    /** 1보다 작은 순번 요청을 검증 단계에서 HTTP 400으로 거부하는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsPositionChangeWithNonPositivePosition() throws Exception {
        mockMvc.perform(patch("/api/v1/queue-entries/7/position")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPosition\":0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(positionService);
    }

    /** FAN 역할은 순서 미루기 요청 Controller까지 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void allowsFanToCreateChangeRequest() throws Exception {
        when(changeRequestService.create(
                eq(7L), eq(new QueueChangeRequestCreateRequest("사유")), isNull()))
                .thenReturn(new QueueChangeRequestCreateResponse(
                        5L, QueueChangeRequestStatus.PENDING,
                        LocalDateTime.of(2026, 7, 30, 12, 0)));

        mockMvc.perform(post("/api/v1/queue-entries/7/change-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestReason\":\"사유\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.requestId").value(5))
                .andExpect(jsonPath("$.data.status").value("PENDING"));
    }

    /** 사유가 빈 순서 미루기 요청을 검증 단계에서 HTTP 400으로 거부하는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsChangeRequestWithBlankReason() throws Exception {
        mockMvc.perform(post("/api/v1/queue-entries/7/change-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestReason\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(changeRequestService);
    }

    /** MANAGER 역할은 팬 전용 순서 미루기 요청 API에서 HTTP 403을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsManagerFromCreatingChangeRequest() throws Exception {
        mockMvc.perform(post("/api/v1/queue-entries/7/change-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requestReason\":\"사유\"}"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(changeRequestService);
    }

    /** MANAGER 역할은 순서 변경 요청 목록 Controller까지 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerToReadChangeRequests() throws Exception {
        when(changeRequestService.getRequests(
                eq(1L), eq(QueueChangeRequestStatus.PENDING), eq(0), eq(20), isNull()))
                .thenReturn(new PageResponse<>(List.of(), 0, 20, 0, 0, false));

        mockMvc.perform(get("/api/v1/fan-meetings/1/queue-change-requests")
                        .param("status", "PENDING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content").isArray());
    }

    /** FAN 역할은 매니저 전용 순서 변경 요청 목록 API에서 HTTP 403을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanFromReadingChangeRequests() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/1/queue-change-requests"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(changeRequestService);
    }

    /** MANAGER 역할은 순서 변경 요청 처리 Controller까지 접근할 수 있는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void allowsManagerToProcessChangeRequest() throws Exception {
        when(changeRequestService.process(
                eq(5L),
                eq(new QueueChangeRequestDecisionRequest(
                        QueueChangeRequestDecision.APPROVED, null, null)),
                isNull()))
                .thenReturn(new QueueChangeRequestDecisionResponse(
                        5L, QueueChangeRequestStatus.APPROVED, 2, 5,
                        LocalDateTime.of(2026, 7, 30, 12, 0)));

        mockMvc.perform(patch("/api/v1/queue-change-requests/5")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"APPROVED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPROVED"))
                .andExpect(jsonPath("$.data.changedPosition").value(5));
    }

    /** FAN 역할은 매니저 전용 순서 변경 요청 처리 API에서 HTTP 403을 받는지 검증한다. */
    @Test
    @WithMockUser(roles = "FAN")
    void rejectsFanFromProcessingChangeRequest() throws Exception {
        mockMvc.perform(patch("/api/v1/queue-change-requests/5")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"APPROVED\"}"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(changeRequestService);
    }

    /** 처리 결정이 없는 요청 처리 호출을 검증 단계에서 HTTP 400으로 거부하는지 검증한다. */
    @Test
    @WithMockUser(roles = "MANAGER")
    void rejectsChangeRequestProcessingWithoutDecision() throws Exception {
        mockMvc.perform(patch("/api/v1/queue-change-requests/5")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        verifyNoInteractions(changeRequestService);
    }
}
