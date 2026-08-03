package com.ssafy.backend.application;

import com.jayway.jsonpath.JsonPath;
import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationAnswer;
import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 실제 H2 데이터베이스와 전체 웹 계층을 사용해 응모 폼·응모 조회 API를 검증한다.
 *
 * <p>서비스 대역을 쓰지 않고 저장 후 재조회까지 확인하므로 DB 반영과 응답 계약을 함께 검증한다.
 */
@SpringBootTest(properties = {
        "spring.docker.compose.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:application-api;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.sql.init.mode=never",
        "livekit.url=wss://test.livekit.invalid",
        "livekit.api-key=test-api-key",
        "livekit.api-secret=test-api-secret",
        "jwt.secret=0123456789abcdef0123456789abcdef"
})
@AutoConfigureMockMvc
@Transactional
class ApplicationApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FanMeetingRepository fanMeetingRepository;

    @Autowired
    private MeetingApplicationSettingRepository applicationSettingRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ApplicationFormRepository applicationFormRepository;

    @Autowired
    private ApplicationQuestionRepository applicationQuestionRepository;

    @Autowired
    private ApplicationAnswerRepository applicationAnswerRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private User fan;
    private User influencer;
    private User manager;
    private FanMeeting meeting;
    private MeetingApplicationSetting setting;

    /** 각 테스트에서 사용할 팬, 인플루언서, 매니저와 응모 시작 전 팬미팅을 저장한다. */
    @BeforeEach
    void setUp() {
        fan = saveUser("app-fan", "응모팬", UserRole.FAN);
        influencer = saveUser("app-influencer", "응모인플루언서", UserRole.INFLUENCER);
        manager = saveUser("app-manager", "응모매니저", UserRole.MANAGER);
        meeting = fanMeetingRepository.saveAndFlush(FanMeeting.create(
                null, manager, influencer, "응모 통합 테스트 팬미팅", "설명",
                "https://cdn.melly.test/cover.png", LocalDateTime.now().plusDays(10)
        ));
        setting = applicationSettingRepository.saveAndFlush(MeetingApplicationSetting.create(
                meeting, true, LocalDateTime.now().plusHours(1),
                LocalDateTime.now().plusDays(2), LocalDateTime.now().plusDays(3), 10
        ));
    }

    /** 응모 폼을 저장한 뒤 조회 API와 DB에 같은 질문이 반영되는지 검증한다. */
    @Test
    void savesFormAndReadsItBack() throws Exception {
        String saved = mockMvc.perform(put(formPath())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"formDescription":"응모 안내문",
                                 "questions":[
                                   {"questionText":"이름","questionType":"SHORT_TEXT",
                                    "required":true,"displayOrder":1},
                                   {"questionText":"응원 메시지","questionType":"LONG_TEXT",
                                    "required":false,"displayOrder":2}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.formDescription").value("응모 안내문"))
                .andExpect(jsonPath("$.data.questions.length()").value(2))
                .andExpect(jsonPath("$.data.updatedAt").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        long formId = ((Number) JsonPath.read(saved, "$.data.formId")).longValue();

        mockMvc.perform(get(formPath()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.formId").value(formId))
                .andExpect(jsonPath("$.data.questions[0].questionText").value("이름"))
                .andExpect(jsonPath("$.data.questions[0].questionType").value("SHORT_TEXT"))
                .andExpect(jsonPath("$.data.questions[0].required").value(true))
                .andExpect(jsonPath("$.data.questions[1].questionText").value("응원 메시지"))
                .andExpect(jsonPath("$.data.questions[1].questionType").value("LONG_TEXT"));

        ApplicationForm form = applicationFormRepository.findByMeeting_Id(meeting.getId())
                .orElseThrow();
        assertThat(form.getId()).isEqualTo(formId);
        assertThat(applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(formId))
                .extracting(ApplicationQuestion::getQuestionText)
                .containsExactly("이름", "응원 메시지");
    }

    /** 질문을 수정 저장하면 빠진 질문이 삭제 처리되고 재조회에서 사라지는지 검증한다. */
    @Test
    void replacesQuestionsOnSecondSave() throws Exception {
        String saved = saveFormWithTwoQuestions();
        long keptQuestionId = ((Number) JsonPath.read(
                saved, "$.data.questions[0].questionId")).longValue();

        mockMvc.perform(put(formPath())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"formDescription":"수정된 안내문",
                                 "questions":[
                                   {"questionId":%d,"questionText":"이름과 국가",
                                    "questionType":"SHORT_TEXT","required":false,
                                    "displayOrder":1}]}
                                """.formatted(keptQuestionId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions.length()").value(1));

        mockMvc.perform(get(formPath()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.formDescription").value("수정된 안내문"))
                .andExpect(jsonPath("$.data.questions.length()").value(1))
                .andExpect(jsonPath("$.data.questions[0].questionId").value(keptQuestionId))
                .andExpect(jsonPath("$.data.questions[0].questionText").value("이름과 국가"))
                .andExpect(jsonPath("$.data.questions[0].required").value(false));
    }

    /** 질문 상한을 넘긴 저장 요청을 전용 오류 코드와 함께 400으로 거부하는지 검증한다. */
    @Test
    void rejectsElevenQuestions() throws Exception {
        mockMvc.perform(put(formPath())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(formBody(11)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("APPLICATION_QUESTION_LIMIT_EXCEEDED"));

        assertThat(applicationFormRepository.findByMeeting_Id(meeting.getId())).isEmpty();
    }

    /** 질문 상한값인 10개 저장을 허용하는지 검증한다. */
    @Test
    void savesTenQuestions() throws Exception {
        mockMvc.perform(put(formPath())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(formBody(10)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions.length()").value(10));
    }

    /** 질문이 0개인 저장 요청을 허용하고 빈 질문 목록을 반환하는지 검증한다. */
    @Test
    void savesZeroQuestions() throws Exception {
        mockMvc.perform(put(formPath())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"formDescription\":null,\"questions\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions.length()").value(0));

        mockMvc.perform(get(formPath()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.questions.length()").value(0));
    }

    /** 표시 순서가 중복된 저장 요청을 전용 오류 코드와 함께 400으로 거부하는지 검증한다. */
    @Test
    void rejectsDuplicatedDisplayOrder() throws Exception {
        mockMvc.perform(put(formPath())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"formDescription":"안내문",
                                 "questions":[
                                   {"questionText":"질문1","questionType":"SHORT_TEXT",
                                    "required":true,"displayOrder":1},
                                   {"questionText":"질문2","questionType":"SHORT_TEXT",
                                    "required":true,"displayOrder":1}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("APPLICATION_QUESTION_ORDER_DUPLICATED"));
    }

    /** 필수 값이 빠진 저장 요청을 공통 검증 오류로 400 처리하는지 검증한다. */
    @Test
    void rejectsBlankQuestionText() throws Exception {
        mockMvc.perform(put(formPath())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"formDescription":"안내문",
                                 "questions":[
                                   {"questionText":"   ","questionType":"SHORT_TEXT",
                                    "required":true,"displayOrder":1}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 응모가 시작된 뒤의 폼 저장 요청을 409로 거부하는지 검증한다. */
    @Test
    void rejectsFormSaveAfterApplicationOpened() throws Exception {
        openApplications();

        mockMvc.perform(put(formPath())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(formBody(1)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("APPLICATION_FORM_NOT_EDITABLE"));
    }

    /** 응모 폼이 등록되지 않은 팬미팅 조회를 전용 오류 코드와 함께 404 처리하는지 검증한다. */
    @Test
    void rejectsFormLookupWhenNotRegistered() throws Exception {
        mockMvc.perform(get(formPath()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_FORM_NOT_FOUND"));
    }

    /** 존재하지 않는 팬미팅의 응모 폼 조회를 404 처리하는지 검증한다. */
    @Test
    void rejectsFormLookupForUnknownMeeting() throws Exception {
        mockMvc.perform(get("/api/v1/fan-meetings/999999/application-form"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("FAN_MEETING_NOT_FOUND"));
    }

    /** 담당하지 않는 매니저의 폼 저장 요청을 403으로 거부하는지 검증한다. */
    @Test
    void rejectsFormSaveByOtherManager() throws Exception {
        User otherManager = saveUser("app-other-manager", "다른매니저", UserRole.MANAGER);

        mockMvc.perform(put(formPath())
                        .with(as(otherManager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(formBody(1)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    /** 응모 제출 후 내 응모 결과, 응모자 목록, 내 응모 내역, 통계에 반영되는지 검증한다. */
    @Test
    void submitsApplicationAndReadsBackAcrossQueryApis() throws Exception {
        List<Long> questionIds = savedQuestionIds();
        openApplications();

        mockMvc.perform(post(applicationsPath())
                        .with(as(fan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personalInformationConsent":true,
                                 "answers":[{"questionId":%d,"value":"멜리"},
                                            {"questionId":%d,"value":"응원합니다"}]}
                                """.formatted(questionIds.get(0), questionIds.get(1))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.applicationStatus").value("SUBMITTED"));

        mockMvc.perform(get(applicationsPath() + "/me").with(as(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.applicationStatus").value("SUBMITTED"))
                .andExpect(jsonPath("$.data.meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.meetingTitle").value("응모 통합 테스트 팬미팅"))
                .andExpect(jsonPath("$.data.influencerName").value("응모인플루언서"))
                .andExpect(jsonPath("$.data.coverImageUrl")
                        .value("https://cdn.melly.test/cover.png"))
                .andExpect(jsonPath("$.data.participantId").doesNotExist())
                .andExpect(jsonPath("$.data.callOrder").doesNotExist())
                .andExpect(jsonPath("$.data.callOrderSource").doesNotExist());

        mockMvc.perform(get(applicationsPath()).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalApplications").value(1))
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].fanId").value(fan.getId()))
                .andExpect(jsonPath("$.data.content[0].nickname").value("응모팬"))
                .andExpect(jsonPath("$.data.content[0].applicationStatus").value("SUBMITTED"))
                .andExpect(jsonPath("$.data.content[0].answers.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].answers[0].answerText").value("멜리"))
                .andExpect(jsonPath("$.data.content[0].answers[1].answerText")
                        .value("응원합니다"));

        mockMvc.perform(get("/api/v1/users/me/applications").with(as(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].meetingId").value(meeting.getId()))
                .andExpect(jsonPath("$.data.content[0].applicationStatus").value("SUBMITTED"))
                .andExpect(jsonPath("$.data.content[0].callOrder").doesNotExist());

        mockMvc.perform(get(applicationsPath() + "/statistics").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalApplications").value(1))
                .andExpect(jsonPath("$.data.submittedCount").value(1))
                .andExpect(jsonPath("$.data.selectedCount").value(0))
                .andExpect(jsonPath("$.data.notSelectedCount").value(0))
                .andExpect(jsonPath("$.data.questionStats.length()").value(2))
                .andExpect(jsonPath("$.data.questionStats[0].responseCount").value(1))
                .andExpect(jsonPath("$.data.questionStats[0].optionCounts").doesNotExist());
    }

    /** 확정 참가자가 있으면 내 응모 결과에 호출 순서와 배정 방식을 채우는지 검증한다. */
    @Test
    void returnsCallOrderForSelectedParticipant() throws Exception {
        openApplications();
        Application application = applicationRepository.saveAndFlush(
                Application.submit(meeting, fan, LocalDateTime.now().minusHours(1))
        );
        Long participantId = insertParticipant(application, 4);

        mockMvc.perform(get(applicationsPath() + "/me").with(as(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.participantId").value(participantId))
                .andExpect(jsonPath("$.data.callOrder").value(4))
                .andExpect(jsonPath("$.data.callOrderSource").value("DRAW"));

        mockMvc.perform(get("/api/v1/users/me/applications").with(as(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].callOrder").value(4));
    }

    /** 응모를 취소하면 내 응모 결과는 남고 응모자 목록과 통계에서는 제외되는지 검증한다. */
    @Test
    void withdrawsApplicationAndReflectsInQueries() throws Exception {
        List<Long> questionIds = savedQuestionIds();
        openApplications();
        mockMvc.perform(post(applicationsPath())
                        .with(as(fan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"personalInformationConsent":true,
                                 "answers":[{"questionId":%d,"value":"멜리"},
                                            {"questionId":%d,"value":"응원합니다"}]}
                                """.formatted(questionIds.get(0), questionIds.get(1))))
                .andExpect(status().isOk());

        mockMvc.perform(delete(applicationsPath() + "/me").with(as(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.applicationStatus").value("WITHDRAWN"));

        mockMvc.perform(get(applicationsPath() + "/me").with(as(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.applicationStatus").value("WITHDRAWN"));

        mockMvc.perform(get(applicationsPath()).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalApplications").value(0))
                .andExpect(jsonPath("$.data.content.length()").value(0));

        mockMvc.perform(get(applicationsPath() + "?applicationStatus=WITHDRAWN")
                        .with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].applicationStatus").value("WITHDRAWN"));

        mockMvc.perform(get(applicationsPath() + "/statistics").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalApplications").value(0))
                .andExpect(jsonPath("$.data.submittedCount").value(0))
                .andExpect(jsonPath("$.data.questionStats[0].responseCount").value(0));
    }

    /** 닉네임 검색어로 응모자 목록을 필터링하는지 검증한다. */
    @Test
    void filtersApplicantsByNicknameKeyword() throws Exception {
        openApplications();
        User otherFan = saveUser("app-fan-2", "다른팬", UserRole.FAN);
        applicationRepository.saveAndFlush(
                Application.submit(meeting, fan, LocalDateTime.now().minusHours(2))
        );
        applicationRepository.saveAndFlush(
                Application.submit(meeting, otherFan, LocalDateTime.now().minusHours(1))
        );

        mockMvc.perform(get(applicationsPath() + "?keyword=다른").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalApplications").value(2))
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].nickname").value("다른팬"));
    }

    /** 응모자가 늘어도 팬 정보와 답변 조회가 N+1로 증가하지 않는지 실제 SQL 수로 검증한다. */
    @Test
    void returnsApplicantsWithoutNPlusOneQueries() throws Exception {
        List<Long> questionIds = savedQuestionIds();
        openApplications();
        ApplicationQuestion firstQuestion =
                applicationQuestionRepository.findById(questionIds.get(0)).orElseThrow();
        for (int index = 1; index <= 3; index++) {
            User applicant = saveUser("app-bulk-fan-" + index, "대량팬" + index, UserRole.FAN);
            Application application = applicationRepository.saveAndFlush(
                    Application.submit(meeting, applicant, LocalDateTime.now().minusHours(index))
            );
            applicationAnswerRepository.saveAndFlush(ApplicationAnswer.createTextAnswer(
                    application, firstQuestion, "답변" + index
            ));
        }
        entityManager.flush();
        entityManager.clear();
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        mockMvc.perform(get(applicationsPath()).with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(3))
                .andExpect(jsonPath("$.data.content[0].answers.length()").value(1));

        // 응모자마다 팬과 답변을 개별 조회하면 12건 이상이 된다.
        assertThat(statistics.getPrepareStatementCount()).isLessThanOrEqualTo(8L);
    }

    /** 허용 범위를 벗어난 페이지 값을 400으로 거부하는지 검증한다. */
    @Test
    void rejectsOutOfRangePageValues() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/applications?size=101").with(as(fan)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get("/api/v1/users/me/applications?page=-1").with(as(fan)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mockMvc.perform(get(applicationsPath() + "?size=101").with(as(manager)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    /** 페이지 크기 경계값 1과 100을 허용하는지 검증한다. */
    @Test
    void allowsPageSizeBoundaries() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/applications?size=1&page=0").with(as(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(1));
        mockMvc.perform(get(applicationsPath() + "?size=100&page=0").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.size").value(100));
    }

    /** 응모하지 않은 팬미팅의 내 응모 조회를 404 처리하는지 검증한다. */
    @Test
    void rejectsMyApplicationLookupWithoutApplication() throws Exception {
        mockMvc.perform(get(applicationsPath() + "/me").with(as(fan)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("APPLICATION_NOT_FOUND"));
    }

    /** 응모 내역이 없는 팬에게 빈 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyMyApplicationList() throws Exception {
        mockMvc.perform(get("/api/v1/users/me/applications").with(as(fan)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0))
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.hasNext").value(false));
    }

    /** 응모자가 없는 팬미팅의 통계를 0으로 반환하는지 검증한다. */
    @Test
    void returnsZeroStatisticsWithoutApplicants() throws Exception {
        mockMvc.perform(get(applicationsPath() + "/statistics").with(as(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalApplications").value(0))
                .andExpect(jsonPath("$.data.questionStats.length()").value(0));
    }

    /** 질문 두 개를 가진 응모 폼을 저장하고 응답 본문을 반환한다. */
    private String saveFormWithTwoQuestions() throws Exception {
        return mockMvc.perform(put(formPath())
                        .with(as(manager))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"formDescription":"응모 안내문",
                                 "questions":[
                                   {"questionText":"이름","questionType":"SHORT_TEXT",
                                    "required":true,"displayOrder":1},
                                   {"questionText":"응원 메시지","questionType":"LONG_TEXT",
                                    "required":false,"displayOrder":2}]}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    /** 질문 두 개를 저장하고 생성된 질문 식별자를 표시 순서대로 반환한다. */
    private List<Long> savedQuestionIds() throws Exception {
        String saved = saveFormWithTwoQuestions();
        return List.of(
                ((Number) JsonPath.read(saved, "$.data.questions[0].questionId")).longValue(),
                ((Number) JsonPath.read(saved, "$.data.questions[1].questionId")).longValue()
        );
    }

    /** 지정한 개수만큼 서로 다른 표시 순서를 가진 폼 저장 요청 본문을 만든다. */
    private String formBody(int questionCount) {
        String questions = IntStream.rangeClosed(1, questionCount)
                .mapToObj(order -> """
                        {"questionText":"질문%d","questionType":"SHORT_TEXT",\
                        "required":true,"displayOrder":%d}""".formatted(order, order))
                .reduce((left, right) -> left + "," + right)
                .orElse("");
        return "{\"formDescription\":\"안내문\",\"questions\":[" + questions + "]}";
    }

    /** 팬미팅을 응모 접수 상태로 전환하고 응모 시작 시각을 과거로 옮긴다. */
    private void openApplications() {
        setting.update(true, LocalDateTime.now().minusHours(1),
                LocalDateTime.now().plusDays(2), LocalDateTime.now().plusDays(3), 10);
        meeting.publish(LocalDateTime.now().minusDays(1));
        meeting.openApplications();
        applicationSettingRepository.saveAndFlush(setting);
        fanMeetingRepository.saveAndFlush(meeting);
    }

    /**
     * 추첨 API 없이도 참가자 배정 조회를 검증할 수 있도록 참가자 행을 직접 저장한다.
     *
     * @param application 참가자로 확정할 응모
     * @param assignedOrder 배정할 호출 순서
     * @return 생성된 참가자 식별자
     */
    private Long insertParticipant(Application application, int assignedOrder) {
        entityManager.createNativeQuery("""
                        insert into participants (
                            meeting_id, fan_id, application_id, status, assigned_order,
                            created_at, updated_at
                        ) values (?, ?, ?, 'READY', ?, current_timestamp, current_timestamp)
                        """)
                .setParameter(1, meeting.getId())
                .setParameter(2, application.getFan().getId())
                .setParameter(3, application.getId())
                .setParameter(4, assignedOrder)
                .executeUpdate();
        return ((Number) entityManager.createNativeQuery(
                        "select participant_id from participants where application_id = ?")
                .setParameter(1, application.getId())
                .getSingleResult()).longValue();
    }

    /** 통합 테스트에 사용할 활성 사용자를 저장한다. */
    private User saveUser(String loginId, String nickname, UserRole role) {
        return userRepository.saveAndFlush(User.createActive(
                loginId, loginId + "@example.com", "encoded-password",
                nickname, role, PreferredLanguage.KOREAN
        ));
    }

    /** 지정한 사용자를 인증 주체로 사용하는 요청 후처리기를 생성한다. */
    private RequestPostProcessor as(User user) {
        AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getRole());
        return authentication(new UsernamePasswordAuthenticationToken(
                principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
        ));
    }

    /** 현재 팬미팅의 응모 폼 경로를 반환한다. */
    private String formPath() {
        return "/api/v1/fan-meetings/" + meeting.getId() + "/application-form";
    }

    /** 현재 팬미팅의 응모 경로를 반환한다. */
    private String applicationsPath() {
        return "/api/v1/fan-meetings/" + meeting.getId() + "/applications";
    }
}
