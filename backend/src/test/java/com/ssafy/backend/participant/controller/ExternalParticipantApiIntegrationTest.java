package com.ssafy.backend.participant.controller;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.ParticipantSelectionType;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.domain.ParticipantSource;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import com.ssafy.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 H2 데이터베이스와 전체 웹 계층으로 외부 선별 참가자 CSV 등록 흐름을 검증한다.
 *
 * <p>대기열 실시간 저장소는 Redis를 사용하므로 대역으로 대체하고, DB 반영과 응답 계약을 함께 확인한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:external-participant-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
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
class ExternalParticipantApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @Autowired
    private MeetingApplicationSettingRepository applicationSettingRepository;

    @Autowired
    private ParticipantRepository participantRepository;

    @Autowired
    private QueueEntryRepository queueEntryRepository;

    @Autowired
    private EntityManager entityManager;

    @MockitoBean
    private QueueRealtimeStore realtimeStore;

    private User manager;
    private User otherManager;
    private User influencer;
    private User firstFan;
    private User secondFan;
    private FanMeeting meeting;

    /** 외부 선별 방식으로 공개된 팬미팅과 등록 대상 팬 계정을 준비한다. */
    @BeforeEach
    void setUp() {
        manager = saveUser("ext-manager", "외부매니저", UserRole.MANAGER);
        otherManager = saveUser("ext-other-manager", "다른매니저", UserRole.MANAGER);
        influencer = saveUser("ext-influencer", "외부인플루언서", UserRole.INFLUENCER);
        firstFan = saveUser("ext-fan1", "첫째팬", UserRole.FAN);
        secondFan = saveUser("ext-fan2", "둘째팬", UserRole.FAN);

        meeting = FanMeeting.create(
                null, manager, influencer, "외부 선별 팬미팅", "설명", null,
                LocalDateTime.now().plusDays(10), ParticipantSelectionType.EXTERNAL_SELECTION
        );
        meeting.publish(LocalDateTime.now());
        meeting = fanMeetingRepository.saveAndFlush(meeting);
        applicationSettingRepository.saveAndFlush(MeetingApplicationSetting.create(
                meeting, false, null, null, null, 3
        ));

        when(realtimeStore.isInitialized(anyLong())).thenReturn(false);
        when(realtimeStore.initialize(anyLong(), anyList()))
                .thenAnswer(invocation -> (long) ((List<?>) invocation.getArgument(1)).size());
    }

    /** 양식 CSV가 BOM과 약속한 헤더를 포함해 내려오는지 검증한다. */
    @Test
    void downloadsTemplateWithBomAndHeader() throws Exception {
        String body = mockMvc.perform(get("/api/v1/fan-meetings/external-participants/csv-template")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.containsString("external-participant-template.csv")))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        assertThat(body).startsWith("﻿");
        assertThat(body).contains("email,callOrder");
    }

    /** 유효한 명단이 확정 가능으로 표시되고 미리보기만으로는 참가자가 생기지 않는지 검증한다. */
    @Test
    void marksValidPreviewConfirmableWithoutCreatingRows() throws Exception {
        mockMvc.perform(multipart(previewPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRowCount").value(2))
                .andExpect(jsonPath("$.data.validRowCount").value(2))
                .andExpect(jsonPath("$.data.invalidRowCount").value(0))
                .andExpect(jsonPath("$.data.confirmable").value(true))
                .andExpect(jsonPath("$.data.rows[0].matchedNickname").value("첫째팬"));

        assertThat(participantRepository.countByMeeting_Id(meeting.getId())).isZero();
        assertThat(queueEntryRepository.existsByMeeting_Id(meeting.getId())).isFalse();
    }

    /** 같은 이메일이 두 번 들어오면 중복 오류로 표시하는지 검증한다. */
    @Test
    void reportsDuplicatedEmail() throws Exception {
        mockMvc.perform(multipart(previewPath())
                        .file(csv("ext-fan1@example.com,1\next-fan1@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.confirmable").value(false))
                .andExpect(jsonPath("$.data.rows[1].errorCode").value("EMAIL_DUPLICATED"));
    }

    /** 같은 호출 순번이 두 번 들어오면 중복 오류로 표시하는지 검증한다. */
    @Test
    void reportsDuplicatedCallOrder() throws Exception {
        mockMvc.perform(multipart(previewPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,1\n"))
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.confirmable").value(false))
                .andExpect(jsonPath("$.data.rows[1].errorCode").value("CALL_ORDER_DUPLICATED"));
    }

    /** 가입하지 않은 이메일을 오류로 표시하는지 검증한다. */
    @Test
    void reportsUnknownEmail() throws Exception {
        mockMvc.perform(multipart(previewPath())
                        .file(csv("ext-fan1@example.com,1\nnobody@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.confirmable").value(false))
                .andExpect(jsonPath("$.data.rows[1].errorCode").value("USER_NOT_FOUND"))
                .andExpect(jsonPath("$.data.rows[1].matchedUserId").doesNotExist());
    }

    /** 팬이 아닌 회원을 오류로 표시하는지 검증한다. */
    @Test
    void reportsNonFanUser() throws Exception {
        mockMvc.perform(multipart(previewPath())
                        .file(csv("ext-fan1@example.com,1\next-influencer@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.confirmable").value(false))
                .andExpect(jsonPath("$.data.rows[1].errorCode").value("USER_NOT_FAN"));
    }

    /**
     * 이메일은 존재하지만 활성 상태가 아닌 회원을 오류로 표시하는지 검증한다.
     *
     * <p>탈퇴 처리는 이메일까지 비식별화해 이메일 매칭 자체가 실패하므로,
     * 이 검증에서는 계정 상태만 정지로 바꿔 활성 여부 판정만 확인한다.
     */
    @Test
    void reportsInactiveUser() throws Exception {
        ReflectionTestUtils.setField(secondFan, "status", UserStatus.SUSPENDED);
        userRepository.saveAndFlush(secondFan);

        mockMvc.perform(multipart(previewPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.confirmable").value(false))
                .andExpect(jsonPath("$.data.rows[1].errorCode").value("USER_NOT_ACTIVE"));
    }

    /** 모집 인원을 넘는 명단을 파일 단위 오류로 표시하는지 검증한다. */
    @Test
    void reportsCapacityExceeded() throws Exception {
        User thirdFan = saveUser("ext-fan3", "셋째팬", UserRole.FAN);
        User fourthFan = saveUser("ext-fan4", "넷째팬", UserRole.FAN);

        mockMvc.perform(multipart(previewPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,2\n"
                                + thirdFan.getEmail() + ",3\n" + fourthFan.getEmail() + ",4\n"))
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.confirmable").value(false))
                .andExpect(jsonPath("$.data.fileErrors[0].errorCode").value("CAPACITY_EXCEEDED"));
    }

    /** 호출 순번이 1부터 연속되지 않으면 파일 단위 오류로 표시하는지 검증한다. */
    @Test
    void reportsNonSequentialCallOrder() throws Exception {
        mockMvc.perform(multipart(previewPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,3\n"))
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.confirmable").value(false))
                .andExpect(jsonPath("$.data.fileErrors[0].errorCode")
                        .value("CALL_ORDER_NOT_SEQUENTIAL"));
    }

    /** 확정 시 참가자와 대기열이 함께 생기고 팬미팅이 준비 완료로 넘어가는지 검증한다. */
    @Test
    void confirmCreatesParticipantsWithQueueAndReadyStatus() throws Exception {
        mockMvc.perform(multipart(confirmPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.participantCount").value(2))
                .andExpect(jsonPath("$.data.queueEntryCount").value(2))
                .andExpect(jsonPath("$.data.meetingStatus").value("READY"));

        entityManager.flush();
        entityManager.clear();

        List<Participant> participants = participantRepository
                .findByMeeting_IdOrderByAssignedOrderAsc(meeting.getId());
        assertThat(participants).hasSize(2);
        assertThat(participants).allMatch(
                participant -> participant.getParticipantSource() == ParticipantSource.EXTERNAL_SELECTION);
        assertThat(participants).allMatch(participant -> participant.getApplication() == null);
        assertThat(participants.get(0).getFan().getId()).isEqualTo(firstFan.getId());
        assertThat(queueEntryRepository
                .findByMeeting_IdOrderByQueuePositionAsc(meeting.getId())).hasSize(2);
        assertThat(fanMeetingRepository.findById(meeting.getId()).orElseThrow().getStatus())
                .isEqualTo(FanMeetingStatus.READY);
    }

    /** 오류가 한 건이라도 있으면 참가자를 한 명도 만들지 않는지 검증한다. */
    @Test
    void confirmCreatesNothingWhenAnyRowIsInvalid() throws Exception {
        mockMvc.perform(multipart(confirmPath())
                        .file(csv("ext-fan1@example.com,1\nnobody@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isBadRequest());

        assertThat(participantRepository.countByMeeting_Id(meeting.getId())).isZero();
        assertThat(queueEntryRepository.existsByMeeting_Id(meeting.getId())).isFalse();
        assertThat(fanMeetingRepository.findById(meeting.getId()).orElseThrow().getStatus())
                .isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 이미 확정된 명단을 다시 확정하려 하면 거부하는지 검증한다. */
    @Test
    void rejectsSecondConfirm() throws Exception {
        mockMvc.perform(multipart(confirmPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isOk());

        mockMvc.perform(multipart(confirmPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isConflict());
    }

    /** 팬이 명단 미리보기에 접근하지 못하는지 검증한다. */
    @Test
    void rejectsFanFromPreview() throws Exception {
        mockMvc.perform(multipart(previewPath())
                        .file(csv("ext-fan1@example.com,1\n"))
                        .with(as(firstFan)))
                .andExpect(status().isForbidden());
    }

    /** 팬미팅을 담당하지 않는 다른 매니저의 확정을 거부하는지 검증한다. */
    @Test
    void rejectsUnrelatedManager() throws Exception {
        mockMvc.perform(multipart(confirmPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,2\n"))
                        .with(as(otherManager)))
                .andExpect(status().isForbidden());

        assertThat(participantRepository.countByMeeting_Id(meeting.getId())).isZero();
    }

    /** 외부 선별 팬미팅에서 응모 제출을 명확한 오류로 막는지 검증한다. */
    @Test
    void blocksApplicationSubmit() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/" + meeting.getId() + "/applications")
                        .with(as(firstFan))
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"personalInformationConsent\":true,\"answers\":[]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_SUPPORTED"));
    }

    /** 외부 선별 팬미팅에서 응모 폼 조회를 막는지 검증한다. */
    @Test
    void blocksApplicationFormRead() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/" + meeting.getId() + "/application-form"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_SUPPORTED"));
    }

    /** 외부 선별 팬미팅에서 추첨을 막는지 검증한다. */
    @Test
    void blocksApplicationDraw() throws Exception {
        mockMvc.perform(post("/api/v1/fan-meetings/" + meeting.getId() + "/applications/draw")
                        .with(as(manager)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_SUPPORTED"));
    }

    /** 외부 선별 팬미팅에서 응모 통계 조회를 막는지 검증한다. */
    @Test
    void blocksApplicationStatistics() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/" + meeting.getId()
                        + "/applications/statistics").with(as(manager)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_SUPPORTED"));
    }

    /** 팬미팅 결과 통계가 참가자 출처별 수를 구분해 집계하는지 검증한다. */
    @Test
    void countsParticipantsBySource() throws Exception {
        mockMvc.perform(multipart(confirmPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/fan-meetings/" + meeting.getId() + "/statistics")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.participantCount").value(2))
                .andExpect(jsonPath("$.data.applicationParticipantCount").value(0))
                .andExpect(jsonPath("$.data.externalSelectionParticipantCount").value(2));
    }

    /** 결과 CSV가 참가자 출처를 담고 이메일 같은 개인정보는 담지 않는지 검증한다. */
    @Test
    void exportsResultCsvWithSourceAndWithoutPersonalData() throws Exception {
        mockMvc.perform(multipart(confirmPath())
                        .file(csv("ext-fan1@example.com,1\next-fan2@example.com,2\n"))
                        .with(as(manager)))
                .andExpect(status().isOk());

        String body = mockMvc.perform(get("/api/v1/fan-meetings/" + meeting.getId()
                        + "/statistics/export.csv").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/csv"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        assertThat(body).startsWith("﻿");
        assertThat(body).contains(
                "참가자 ID,참가 경로,통화 순번,닉네임,"
                        + "참가 상태,대기열 상태,통화 상태,통화 시간(초)");
        assertThat(body).contains("외부 선별");
        assertThat(body).contains("첫째팬").contains("둘째팬");
        assertThat(body).doesNotContain("ext-fan1@example.com");
        assertThat(body).doesNotContain("@example.com");
    }

    /**
     * 활성 상태의 테스트 사용자를 저장한다.
     *
     * @param loginId 로그인 식별자이며 이메일 앞부분으로도 사용한다
     * @param nickname 표시할 닉네임
     * @param role 사용자 역할
     * @return 저장된 사용자
     */
    private User saveUser(String loginId, String nickname, UserRole role) {
        User user = User.createActive(
                loginId, loginId + "@example.com", "encoded-password",
                nickname, role, PreferredLanguage.KOREAN
        );
        user.verifyEmail(LocalDateTime.now());
        return userRepository.saveAndFlush(user);
    }

    /**
     * 지정한 사용자를 인증 주체로 사용하는 요청 후처리기를 생성한다.
     *
     * @param user 인증 주체로 사용할 사용자
     * @return 인증 정보를 담은 요청 후처리기
     */
    private RequestPostProcessor as(User user) {
        AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getRole());
        return authentication(new UsernamePasswordAuthenticationToken(
                principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
        ));
    }

    /**
     * 헤더를 붙인 명단 CSV 업로드 파일을 만든다.
     *
     * @param body 헤더를 제외한 CSV 본문
     * @return multipart 요청에 사용할 CSV 파일
     */
    private MockMultipartFile csv(String body) {
        return new MockMultipartFile("file", "participants.csv", "text/csv",
                ("email,callOrder\n" + body).getBytes(StandardCharsets.UTF_8));
    }

    /** 현재 팬미팅의 명단 미리보기 경로를 반환한다. */
    private String previewPath() {
        return "/api/v1/fan-meetings/" + meeting.getId() + "/external-participants/csv/preview";
    }

    /** 현재 팬미팅의 명단 확정 경로를 반환한다. */
    private String confirmPath() {
        return "/api/v1/fan-meetings/" + meeting.getId() + "/external-participants/csv/confirm";
    }
}
