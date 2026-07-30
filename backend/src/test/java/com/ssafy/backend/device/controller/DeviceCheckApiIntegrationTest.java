package com.ssafy.backend.device.controller;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.device.domain.DeviceCheck;
import com.ssafy.backend.device.repository.DeviceCheckRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:device-check-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
@Transactional
class DeviceCheckApiIntegrationTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 30, 15, 0);
    private static final String ALL_PASSED_BODY =
            "{\"cameraOk\":true,\"microphoneOk\":true,\"speakerOk\":true,\"networkOk\":true}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private DeviceCheckRepository deviceCheckRepository;

    private User influencer;
    private User participantFan;
    private FanMeeting meeting;

    /** 참가 팬 한 명이 확정된 팬미팅을 준비한다. */
    @BeforeEach
    void setUp() {
        User manager = persistUser("dev-manager", "테스트매니저", UserRole.MANAGER);
        influencer = persistUser("dev-influencer", "테스트인플루언서", UserRole.INFLUENCER);
        meeting = persistMeeting(manager, influencer, "장비 점검 통합 테스트 팬미팅");
        participantFan = persistUser("dev-fan", "점검팬", UserRole.FAN);
        persistParticipant(meeting, participantFan);
        entityManager.flush();
        entityManager.clear();
    }

    /** 참가 팬의 점검 결과가 저장되고 실제 테이블 행으로 남는지 검증한다. */
    @Test
    void savesDeviceCheckRowForParticipantFan() throws Exception {
        mockMvc.perform(post(deviceChecksUrl()).with(as(participantFan)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(ALL_PASSED_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.deviceCheckId").isNumber())
                .andExpect(jsonPath("$.data.cameraOk").value(true))
                .andExpect(jsonPath("$.data.microphoneOk").value(true))
                .andExpect(jsonPath("$.data.speakerOk").value(true))
                .andExpect(jsonPath("$.data.networkOk").value(true))
                .andExpect(jsonPath("$.data.warningRequired").value(false))
                .andExpect(jsonPath("$.data.canEnter").value(true))
                .andExpect(jsonPath("$.data.checkedAt").exists());

        List<DeviceCheck> saved = deviceCheckRepository.findAll();
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getMeeting().getId()).isEqualTo(meeting.getId());
        assertThat(saved.get(0).getUser().getId()).isEqualTo(participantFan.getId());
        assertThat(saved.get(0).isCameraOk()).isTrue();
        assertThat(saved.get(0).getSpeakerOk()).isTrue();
        assertThat(saved.get(0).getCheckedAt()).isNotNull();
    }

    /** 점검을 다시 수행하면 이전 기록을 덮지 않고 새 행이 추가되는지 검증한다. */
    @Test
    void appendsNewRowForEachDeviceCheck() throws Exception {
        mockMvc.perform(post(deviceChecksUrl()).with(as(participantFan)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(ALL_PASSED_BODY))
                .andExpect(status().isOk());
        mockMvc.perform(post(deviceChecksUrl()).with(as(participantFan)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cameraOk\":false,\"microphoneOk\":true,\"networkOk\":true}"))
                .andExpect(status().isOk());

        assertThat(deviceCheckRepository.findAll()).hasSize(2);
    }

    /** 배정 인플루언서의 점검 결과도 저장되는지 검증한다. */
    @Test
    void savesDeviceCheckForAssignedInfluencer() throws Exception {
        mockMvc.perform(post(deviceChecksUrl()).with(as(influencer)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(ALL_PASSED_BODY))
                .andExpect(status().isOk());

        List<DeviceCheck> saved = deviceCheckRepository.findAll();
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getUser().getId()).isEqualTo(influencer.getId());
    }

    /** 장비 이상이 있어도 입장을 허용하고 경고만 표시하며 기록은 남기는지 검증한다. */
    @Test
    void keepsCanEnterTrueAndStoresFailedCheck() throws Exception {
        mockMvc.perform(post(deviceChecksUrl()).with(as(participantFan)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cameraOk\":false,\"microphoneOk\":false,"
                                + "\"speakerOk\":false,\"networkOk\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.warningRequired").value(true))
                .andExpect(jsonPath("$.data.canEnter").value(true));

        List<DeviceCheck> saved = deviceCheckRepository.findAll();
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).isCameraOk()).isFalse();
        assertThat(saved.get(0).isNetworkOk()).isFalse();
    }

    /** 스피커를 점검하지 않은 요청이 경고 없이 저장되는지 검증한다. */
    @Test
    void savesDeviceCheckWithoutSpeakerResult() throws Exception {
        mockMvc.perform(post(deviceChecksUrl()).with(as(participantFan)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cameraOk\":true,\"microphoneOk\":true,\"networkOk\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.warningRequired").value(false))
                .andExpect(jsonPath("$.data.speakerOk").doesNotExist());

        assertThat(deviceCheckRepository.findAll().get(0).getSpeakerOk()).isNull();
    }

    /** 참가자가 아닌 팬의 점검 요청이 거부되고 기록도 남지 않는지 검증한다. */
    @Test
    void rejectsFanWhoIsNotParticipant() throws Exception {
        User outsider = persistUser("dev-outsider", "외부팬", UserRole.FAN);
        entityManager.flush();

        mockMvc.perform(post(deviceChecksUrl()).with(as(outsider)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(ALL_PASSED_BODY))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("DEVICE_CHECK_NOT_ALLOWED"));

        assertThat(deviceCheckRepository.findAll()).isEmpty();
    }

    /** 다른 팬미팅에 배정된 인플루언서의 점검 요청이 거부되는지 검증한다. */
    @Test
    void rejectsInfluencerOfAnotherMeeting() throws Exception {
        User otherInfluencer = persistUser("dev-other-influencer", "다른인플루언서",
                UserRole.INFLUENCER);
        entityManager.flush();

        mockMvc.perform(post(deviceChecksUrl()).with(as(otherInfluencer)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(ALL_PASSED_BODY))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("DEVICE_CHECK_NOT_ALLOWED"));

        assertThat(deviceCheckRepository.findAll()).isEmpty();
    }

    /** 존재하지 않는 팬미팅의 점검 요청이 거부되는지 검증한다. */
    @Test
    void rejectsMissingMeeting() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/999999/device-checks")
                        .with(as(participantFan)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(ALL_PASSED_BODY))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));

        assertThat(deviceCheckRepository.findAll()).isEmpty();
    }

    /** 필수 점검 항목이 빠진 요청이 거부되고 기록도 남지 않는지 검증한다. */
    @Test
    void rejectsRequestWithoutRequiredFlags() throws Exception {
        mockMvc.perform(post(deviceChecksUrl()).with(as(participantFan)).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cameraOk\":true,\"microphoneOk\":true}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        assertThat(deviceCheckRepository.findAll()).isEmpty();
    }

    /** 장비 점검 API 경로를 만든다. */
    private String deviceChecksUrl() {
        return "/api/v1/fan-meetings/" + meeting.getId() + "/device-checks";
    }

    /** 지정한 사용자를 JWT 인증 필터가 만든 것과 같은 형태의 인증 정보로 사용한다. */
    private RequestPostProcessor as(User user) {
        AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getRole());
        return authentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))));
    }

    /** 통합 테스트에 사용할 활성 사용자를 저장한다. */
    private User persistUser(String loginId, String nickname, UserRole role) {
        User user = User.createActive(loginId, loginId + "@melly.test", "encoded", nickname,
                role, PreferredLanguage.KOREAN);
        entityManager.persist(user);
        return user;
    }

    /** 통합 테스트에 사용할 진행 중 팬미팅을 저장한다. */
    private FanMeeting persistMeeting(User manager, User influencer, String title) {
        FanMeeting meeting = BeanUtils.instantiateClass(FanMeeting.class);
        ReflectionTestUtils.setField(meeting, "manager", manager);
        ReflectionTestUtils.setField(meeting, "influencer", influencer);
        ReflectionTestUtils.setField(meeting, "title", title);
        ReflectionTestUtils.setField(meeting, "status", FanMeetingStatus.LIVE);
        ReflectionTestUtils.setField(meeting, "scheduledStartAt", NOW);
        entityManager.persist(meeting);
        return meeting;
    }

    /** 통합 테스트에 사용할 당첨 응모와 참가자를 저장한다. */
    private void persistParticipant(FanMeeting meeting, User fan) {
        Application application = BeanUtils.instantiateClass(Application.class);
        ReflectionTestUtils.setField(application, "meeting", meeting);
        ReflectionTestUtils.setField(application, "fan", fan);
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.SELECTED);
        ReflectionTestUtils.setField(application, "personalInformationConsentAt", NOW);
        ReflectionTestUtils.setField(application, "submittedAt", NOW);
        entityManager.persist(application);

        Participant participant = BeanUtils.instantiateClass(Participant.class);
        ReflectionTestUtils.setField(participant, "meeting", meeting);
        ReflectionTestUtils.setField(participant, "fan", fan);
        ReflectionTestUtils.setField(participant, "application", application);
        ReflectionTestUtils.setField(participant, "status", "READY");
        ReflectionTestUtils.setField(participant, "assignedOrder", 1);
        entityManager.persist(participant);
    }
}
