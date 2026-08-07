package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationOption;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.domain.ApplicationQuestionType;
import com.ssafy.backend.application.dto.ApplicationFormResponse;
import com.ssafy.backend.application.dto.ApplicationFormSaveRequest;
import com.ssafy.backend.application.dto.ApplicationFormSaveResponse;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationOptionRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ApplicationFormServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-30T03:00:00Z");
    private static final long MEETING_ID = 10L;
    private static final long FORM_ID = 300L;

    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private ApplicationFormRepository applicationFormRepository;
    private ApplicationQuestionRepository applicationQuestionRepository;
    private ApplicationOptionRepository applicationOptionRepository;
    private ApplicationFormService applicationFormService;
    private AuthenticatedUser principal;
    private User operator;
    private FanMeeting meeting;

    /** 각 테스트에서 사용할 운영자, 초안 팬미팅, 저장소와 고정 시각 기반 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationSettingRepository = mock(MeetingApplicationSettingRepository.class);
        applicationFormRepository = mock(ApplicationFormRepository.class);
        applicationQuestionRepository = mock(ApplicationQuestionRepository.class);
        applicationOptionRepository = mock(ApplicationOptionRepository.class);
        applicationFormService = new ApplicationFormService(
                currentUserService,
                meetingAccessService,
                fanMeetingRepository,
                applicationSettingRepository,
                applicationFormRepository,
                applicationQuestionRepository,
                applicationOptionRepository,
                Clock.fixed(NOW, SEOUL)
        );
        principal = new AuthenticatedUser(3L, UserRole.MANAGER);
        operator = user(3L, UserRole.MANAGER);
        meeting = draftMeeting();
        when(currentUserService.requireActiveUser(principal)).thenReturn(operator);
        when(fanMeetingRepository.findById(MEETING_ID)).thenReturn(Optional.of(meeting));
        when(meetingAccessService.requireOperator(MEETING_ID, operator)).thenReturn(meeting);
        when(applicationSettingRepository.findById(MEETING_ID)).thenReturn(Optional.empty());
    }

    /** 등록된 응모 폼의 안내문과 활성 질문을 표시 순서대로 반환하는지 검증한다. */
    @Test
    void returnsFormWithQuestionsInDisplayOrder() {
        ApplicationForm form = form("응모 안내문");
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID)).thenReturn(Optional.of(form));
        when(applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(FORM_ID))
                .thenReturn(List.of(
                        question(201L, form, "이름", ApplicationQuestionType.SHORT_TEXT, true, 1),
                        question(202L, form, "응원 메시지",
                                ApplicationQuestionType.LONG_TEXT, false, 2)
                ));

        ApplicationFormResponse response = applicationFormService.getForm(MEETING_ID);

        assertThat(response.formId()).isEqualTo(FORM_ID);
        assertThat(response.formDescription()).isEqualTo("응모 안내문");
        assertThat(response.questions()).extracting("questionId", "questionText",
                        "questionType", "required", "displayOrder")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(201L, "이름",
                                ApplicationQuestionType.SHORT_TEXT, true, 1),
                        org.assertj.core.groups.Tuple.tuple(202L, "응원 메시지",
                                ApplicationQuestionType.LONG_TEXT, false, 2)
                );
    }

    /** 질문이 하나도 없는 응모 폼을 조회하면 빈 질문 목록을 반환하는지 검증한다. */
    @Test
    void returnsEmptyQuestionsWhenFormHasNoQuestion() {
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID))
                .thenReturn(Optional.of(form(null)));

        ApplicationFormResponse response = applicationFormService.getForm(MEETING_ID);

        assertThat(response.formDescription()).isNull();
        assertThat(response.questions()).isEmpty();
    }

    /** 존재하지 않는 팬미팅의 응모 폼 조회를 404 오류로 거부하는지 검증한다. */
    @Test
    void rejectsFormLookupForMissingMeeting() {
        when(fanMeetingRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> applicationFormService.getForm(999L))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 논리 삭제된 팬미팅의 응모 폼 조회를 404 오류로 거부하는지 검증한다. */
    @Test
    void rejectsFormLookupForDeletedMeeting() {
        meeting.deleteDraft(now());

        assertThatThrownBy(() -> applicationFormService.getForm(MEETING_ID))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 응모 폼이 등록되지 않은 팬미팅 조회를 전용 404 오류로 거부하는지 검증한다. */
    @Test
    void rejectsFormLookupWhenFormNotRegistered() {
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> applicationFormService.getForm(MEETING_ID))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_FORM_NOT_FOUND));
    }

    /** 응모 폼이 없던 팬미팅에 폼과 질문을 새로 생성하는지 검증한다. */
    @Test
    void createsFormWithQuestionsWhenFormAbsent() {
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID)).thenReturn(Optional.empty());
        when(applicationFormRepository.save(any(ApplicationForm.class)))
                .thenAnswer(invocation -> {
                    ApplicationForm saved = invocation.getArgument(0);
                    ReflectionTestUtils.setField(saved, "id", FORM_ID);
                    return saved;
                });
        stubQuestionSaveAll(201L);

        ApplicationFormSaveResponse response = applicationFormService.saveForm(
                MEETING_ID,
                request("새 안내문", List.of(
                        questionRequest(null, "이름", ApplicationQuestionType.SHORT_TEXT, true, 1)
                )),
                principal
        );

        assertThat(response.formId()).isEqualTo(FORM_ID);
        assertThat(response.meetingId()).isEqualTo(MEETING_ID);
        assertThat(response.formDescription()).isEqualTo("새 안내문");
        assertThat(response.updatedAt()).isEqualTo(now());
        assertThat(response.questions()).extracting("questionId", "questionText")
                .containsExactly(org.assertj.core.groups.Tuple.tuple(201L, "이름"));
    }

    /** 기존 질문을 수정하고 새 질문을 추가하며 빠진 질문을 삭제 처리하는지 검증한다. */
    @Test
    void replacesQuestionsAndSoftDeletesRemovedOnes() {
        ApplicationForm form = form("기존 안내문");
        ApplicationQuestion kept =
                question(201L, form, "이름", ApplicationQuestionType.SHORT_TEXT, true, 1);
        ApplicationQuestion removed =
                question(202L, form, "삭제될 질문", ApplicationQuestionType.SHORT_TEXT, false, 2);
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID)).thenReturn(Optional.of(form));
        when(applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(FORM_ID))
                .thenReturn(List.of(kept, removed));
        stubQuestionSaveAll(203L);

        ApplicationFormSaveResponse response = applicationFormService.saveForm(
                MEETING_ID,
                request("수정 안내문", List.of(
                        questionRequest(201L, "이름과 국가",
                                ApplicationQuestionType.LONG_TEXT, false, 2),
                        questionRequest(null, "응원 메시지",
                                ApplicationQuestionType.LONG_TEXT, true, 1)
                )),
                principal
        );

        assertThat(form.getFormDescription()).isEqualTo("수정 안내문");
        assertThat(kept.getQuestionText()).isEqualTo("이름과 국가");
        assertThat(kept.getQuestionType()).isEqualTo(ApplicationQuestionType.LONG_TEXT);
        assertThat(kept.isRequired()).isFalse();
        assertThat(kept.getDisplayOrder()).isEqualTo(2);
        assertThat(removed.getDeletedAt()).isEqualTo(now());
        assertThat(response.questions()).extracting("questionId", "displayOrder")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(203L, 1),
                        org.assertj.core.groups.Tuple.tuple(201L, 2)
                );
    }

    /** 질문을 0개로 저장하면 기존 질문 전체가 삭제 처리되는지 검증한다. */
    @Test
    void savesFormWithZeroQuestions() {
        ApplicationForm form = form("기존 안내문");
        ApplicationQuestion removed =
                question(201L, form, "이름", ApplicationQuestionType.SHORT_TEXT, true, 1);
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID)).thenReturn(Optional.of(form));
        when(applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(FORM_ID))
                .thenReturn(List.of(removed));
        stubQuestionSaveAll();

        ApplicationFormSaveResponse response = applicationFormService.saveForm(
                MEETING_ID, request(null, List.of()), principal
        );

        assertThat(response.questions()).isEmpty();
        assertThat(response.formDescription()).isNull();
        assertThat(removed.getDeletedAt()).isEqualTo(now());
    }

    /** 상한값인 질문 10개 저장을 허용하는지 검증한다. */
    @Test
    void savesFormWithTenQuestions() {
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID))
                .thenReturn(Optional.of(form("안내문")));
        stubQuestionSaveAll(IntStream.rangeClosed(1, 10).mapToLong(index -> 200L + index).toArray());

        ApplicationFormSaveResponse response = applicationFormService.saveForm(
                MEETING_ID, request("안내문", questionRequests(10)), principal
        );

        assertThat(response.questions()).hasSize(10);
    }

    /** 상한을 넘는 질문 11개 저장을 전용 400 오류로 거부하는지 검증한다. */
    @Test
    void rejectsMoreThanTenQuestions() {
        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID, request("안내문", questionRequests(11)), principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_QUESTION_LIMIT_EXCEEDED));

        verify(applicationFormRepository, never()).save(any(ApplicationForm.class));
    }

    /** 표시 순서가 중복된 질문 저장을 전용 400 오류로 거부하는지 검증한다. */
    @Test
    void rejectsDuplicatedDisplayOrder() {
        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID,
                request("안내문", List.of(
                        questionRequest(null, "질문1", ApplicationQuestionType.SHORT_TEXT, true, 1),
                        questionRequest(null, "질문2", ApplicationQuestionType.SHORT_TEXT, true, 1)
                )),
                principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_QUESTION_ORDER_DUPLICATED));

        verify(applicationQuestionRepository, never()).saveAll(anyList());
    }

    /** 객관식 질문에 선택지를 붙여 저장하고 응답에 표시 순서대로 담는지 검증한다. */
    @Test
    void savesChoiceQuestionWithOptions() {
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID))
                .thenReturn(Optional.of(form("안내문")));
        stubQuestionSaveAll(201L);
        stubOptionSaveAll(401L, 402L);

        ApplicationFormSaveResponse response = applicationFormService.saveForm(
                MEETING_ID,
                request("안내문", List.of(choiceQuestionRequest(
                        null, "좋아하는 곡", ApplicationQuestionType.SINGLE_CHOICE, 1,
                        List.of(optionRequest(null, "발라드", 1), optionRequest(null, "댄스", 2))
                ))),
                principal
        );

        assertThat(response.questions()).hasSize(1);
        assertThat(response.questions().get(0).questionType())
                .isEqualTo(ApplicationQuestionType.SINGLE_CHOICE);
        assertThat(response.questions().get(0).options())
                .extracting("optionId", "optionText", "displayOrder")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(401L, "발라드", 1),
                        org.assertj.core.groups.Tuple.tuple(402L, "댄스", 2)
                );
    }

    /** 선택지가 하나뿐인 객관식 질문 저장을 전용 400 오류로 거부하는지 검증한다. */
    @Test
    void rejectsChoiceQuestionWithSingleOption() {
        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID,
                request("안내문", List.of(choiceQuestionRequest(
                        null, "좋아하는 곡", ApplicationQuestionType.SINGLE_CHOICE, 1,
                        List.of(optionRequest(null, "발라드", 1))
                ))),
                principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_QUESTION_OPTION_INVALID));

        verify(applicationOptionRepository, never()).saveAll(anyList());
    }

    /** 주관식 질문에 선택지를 붙인 저장을 전용 400 오류로 거부하는지 검증한다. */
    @Test
    void rejectsOptionsOnTextQuestion() {
        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID,
                request("안내문", List.of(choiceQuestionRequest(
                        null, "이름", ApplicationQuestionType.SHORT_TEXT, 1,
                        List.of(optionRequest(null, "발라드", 1), optionRequest(null, "댄스", 2))
                ))),
                principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_QUESTION_OPTION_INVALID));
    }

    /** 표시 순서가 중복된 선택지 저장을 전용 400 오류로 거부하는지 검증한다. */
    @Test
    void rejectsDuplicatedOptionDisplayOrder() {
        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID,
                request("안내문", List.of(choiceQuestionRequest(
                        null, "좋아하는 곡", ApplicationQuestionType.SINGLE_CHOICE, 1,
                        List.of(optionRequest(null, "발라드", 1), optionRequest(null, "댄스", 1))
                ))),
                principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_QUESTION_OPTION_INVALID));
    }

    /** 객관식을 주관식으로 바꾸면 남아 있던 선택지를 삭제 처리하는지 검증한다. */
    @Test
    void softDeletesOptionsWhenQuestionBecomesText() {
        ApplicationForm form = form("안내문");
        ApplicationQuestion question =
                question(201L, form, "좋아하는 곡", ApplicationQuestionType.SINGLE_CHOICE, true, 1);
        ApplicationOption removed = option(401L, question, "발라드", 1);
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID)).thenReturn(Optional.of(form));
        when(applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(FORM_ID))
                .thenReturn(List.of(question));
        when(applicationOptionRepository
                .findAllByQuestion_IdInAndDeletedAtIsNullOrderByDisplayOrderAsc(List.of(201L)))
                .thenReturn(List.of(removed));
        stubQuestionSaveAll();
        stubOptionSaveAll();

        ApplicationFormSaveResponse response = applicationFormService.saveForm(
                MEETING_ID,
                request("안내문", List.of(questionRequest(
                        201L, "좋아하는 곡", ApplicationQuestionType.SHORT_TEXT, true, 1
                ))),
                principal
        );

        assertThat(removed.getDeletedAt()).isEqualTo(now());
        assertThat(response.questions().get(0).options()).isEmpty();
    }

    /** 다른 폼에 속하거나 존재하지 않는 질문 식별자 저장을 400 오류로 거부하는지 검증한다. */
    @Test
    void rejectsUnknownQuestionId() {
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID))
                .thenReturn(Optional.of(form("안내문")));

        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID,
                request("안내문", List.of(
                        questionRequest(999L, "질문", ApplicationQuestionType.SHORT_TEXT, true, 1)
                )),
                principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_REQUEST));
    }

    /** 응모가 진행 중인 팬미팅의 폼 수정을 409 오류로 거부하는지 검증한다. */
    @Test
    void rejectsSaveWhenApplicationAlreadyOpened() {
        meeting.publish(now().minusDays(2));
        meeting.openApplications();

        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID, request("안내문", List.of()), principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_FORM_NOT_EDITABLE));
    }

    /** 상태 전이가 늦어도 응모 시작 시각이 지나면 폼 수정을 409 오류로 거부하는지 검증한다. */
    @Test
    void rejectsSaveWhenApplicationOpenAtPassed() {
        meeting.publish(now().minusDays(2));
        when(applicationSettingRepository.findById(MEETING_ID)).thenReturn(Optional.of(
                MeetingApplicationSetting.create(
                        meeting, true, now().minusMinutes(1), now().plusDays(1),
                        now().plusDays(2), 20
                )
        ));

        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID, request("안내문", List.of()), principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_FORM_NOT_EDITABLE));
    }

    /** 응모 시작 시각 전이면 공개된 팬미팅의 폼 수정을 허용하는지 검증한다. */
    @Test
    void savesFormWhenApplicationNotStartedYet() {
        meeting.publish(now().minusDays(2));
        when(applicationSettingRepository.findById(MEETING_ID)).thenReturn(Optional.of(
                MeetingApplicationSetting.create(
                        meeting, true, now().plusMinutes(1), now().plusDays(1),
                        now().plusDays(2), 20
                )
        ));
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID))
                .thenReturn(Optional.of(form("안내문")));
        stubQuestionSaveAll();

        ApplicationFormSaveResponse response = applicationFormService.saveForm(
                MEETING_ID, request("안내문", List.of()), principal
        );

        assertThat(response.updatedAt()).isEqualTo(now());
    }

    /** 논리 삭제된 팬미팅의 폼 저장을 404 오류로 거부하는지 검증한다. */
    @Test
    void rejectsSaveForDeletedMeeting() {
        meeting.deleteDraft(now());

        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID, request("안내문", List.of()), principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 소유 운영자가 아닌 사용자의 폼 저장이 권한 검증 단계에서 막히는지 검증한다. */
    @Test
    void rejectsSaveForNonOperator() {
        when(meetingAccessService.requireOperator(MEETING_ID, operator))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> applicationFormService.saveForm(
                MEETING_ID, request("안내문", List.of()), principal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.ACCESS_DENIED));

        verify(applicationFormRepository, never()).save(any(ApplicationForm.class));
    }

    /** 새 질문 저장 시 지정한 식별자를 순서대로 부여하도록 저장소를 구성한다. */
    private void stubQuestionSaveAll(long... assignedIds) {
        when(applicationQuestionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            List<ApplicationQuestion> questions = invocation.getArgument(0);
            List<ApplicationQuestion> saved = new ArrayList<>(questions);
            for (int index = 0; index < saved.size(); index++) {
                ReflectionTestUtils.setField(saved.get(index), "id", assignedIds[index]);
            }
            return saved;
        });
    }

    /** 테스트에 사용할 응모 폼 저장 요청을 생성한다. */
    private ApplicationFormSaveRequest request(
            String formDescription, List<ApplicationFormSaveRequest.QuestionRequest> questions
    ) {
        return new ApplicationFormSaveRequest(formDescription, questions);
    }

    /** 테스트에 사용할 주관식 응모 질문 저장 요청 한 건을 생성한다. */
    private ApplicationFormSaveRequest.QuestionRequest questionRequest(
            Long questionId, String questionText, ApplicationQuestionType questionType,
            boolean required, int displayOrder
    ) {
        return new ApplicationFormSaveRequest.QuestionRequest(
                questionId, questionText, questionType, required, displayOrder, null
        );
    }

    /** 테스트에 사용할 객관식 응모 질문 저장 요청 한 건을 선택지와 함께 생성한다. */
    private ApplicationFormSaveRequest.QuestionRequest choiceQuestionRequest(
            Long questionId, String questionText, ApplicationQuestionType questionType,
            int displayOrder, List<ApplicationFormSaveRequest.OptionRequest> options
    ) {
        return new ApplicationFormSaveRequest.QuestionRequest(
                questionId, questionText, questionType, true, displayOrder, options
        );
    }

    /** 테스트에 사용할 선택지 저장 요청 한 건을 생성한다. */
    private ApplicationFormSaveRequest.OptionRequest optionRequest(
            Long optionId, String optionText, int displayOrder
    ) {
        return new ApplicationFormSaveRequest.OptionRequest(optionId, optionText, displayOrder);
    }

    /** 새 선택지 저장 시 지정한 식별자를 순서대로 부여하도록 저장소를 구성한다. */
    private void stubOptionSaveAll(long... assignedIds) {
        when(applicationOptionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            List<ApplicationOption> options = invocation.getArgument(0);
            List<ApplicationOption> saved = new ArrayList<>(options);
            for (int index = 0; index < saved.size(); index++) {
                ReflectionTestUtils.setField(saved.get(index), "id", assignedIds[index]);
            }
            return saved;
        });
    }

    /** 지정한 개수만큼 서로 다른 표시 순서를 가진 새 질문 요청을 생성한다. */
    private List<ApplicationFormSaveRequest.QuestionRequest> questionRequests(int count) {
        return IntStream.rangeClosed(1, count)
                .mapToObj(order -> questionRequest(
                        null, "질문" + order, ApplicationQuestionType.SHORT_TEXT, true, order
                ))
                .toList();
    }

    /** 지정한 식별자와 역할을 반환하는 사용자 테스트 대역을 생성한다. */
    private User user(Long id, UserRole role) {
        User result = mock(User.class);
        when(result.getId()).thenReturn(id);
        when(result.getRole()).thenReturn(role);
        return result;
    }

    /** 응모 시작 전 초안 상태의 테스트 팬미팅을 생성한다. */
    private FanMeeting draftMeeting() {
        FanMeeting result = FanMeeting.create(
                null, null, user(2L, UserRole.INFLUENCER),
                "테스트 팬미팅", null, null, now().plusDays(10)
        );
        ReflectionTestUtils.setField(result, "id", MEETING_ID);
        return result;
    }

    /** 지정한 안내문을 가진 테스트 응모 폼을 생성한다. */
    private ApplicationForm form(String formDescription) {
        ApplicationForm result = ApplicationForm.create(meeting, formDescription);
        ReflectionTestUtils.setField(result, "id", FORM_ID);
        return result;
    }

    /** 지정한 속성을 가진 테스트 응모 질문을 생성한다. */
    private ApplicationQuestion question(
            Long id, ApplicationForm form, String questionText,
            ApplicationQuestionType questionType, boolean required, int displayOrder
    ) {
        ApplicationQuestion result = ApplicationQuestion.create(
                form, questionText, questionType, required, displayOrder
        );
        ReflectionTestUtils.setField(result, "id", id);
        return result;
    }

    /** 지정한 속성을 가진 테스트 응모 선택지를 생성한다. */
    private ApplicationOption option(
            Long id, ApplicationQuestion question, String optionText, int displayOrder
    ) {
        ApplicationOption result = ApplicationOption.create(question, optionText, displayOrder);
        ReflectionTestUtils.setField(result, "id", id);
        return result;
    }

    /** 고정 Clock이 제공하는 서울 기준 현재 시각을 반환한다. */
    private LocalDateTime now() {
        return LocalDateTime.ofInstant(NOW, SEOUL);
    }
}
