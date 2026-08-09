package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationAnswer;
import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationOption;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.domain.ApplicationQuestionType;
import com.ssafy.backend.application.domain.ApplicationRiskStatus;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.domain.DeviceDuplicatePolicy;
import com.ssafy.backend.application.dto.ApplicationSubmitRequest;
import com.ssafy.backend.application.dto.ApplicationSubmitResponse;
import com.ssafy.backend.application.dto.ApplicationWithdrawResponse;
import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationOptionRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ApplicationServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-30T03:00:00Z");

    /** 기기 토큰 해시 예시이며 실제 HMAC 결과와 같은 64자리 16진 문자열이다. */
    private static final String DEVICE_HASH = "a".repeat(64);

    private CurrentUserService currentUserService;
    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private MeetingOperationSettingRepository operationSettingRepository;
    private ApplicationRepository applicationRepository;
    private ApplicationFormRepository applicationFormRepository;
    private ApplicationQuestionRepository applicationQuestionRepository;
    private ApplicationOptionRepository applicationOptionRepository;
    private ApplicationAnswerRepository applicationAnswerRepository;
    private ApplicationService applicationService;
    private AuthenticatedUser principal;
    private User fan;
    private FanMeeting meeting;

    /** 각 테스트에서 사용할 팬, 응모 중 팬미팅, 저장소와 고정 시각 기반 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationSettingRepository = mock(MeetingApplicationSettingRepository.class);
        operationSettingRepository = mock(MeetingOperationSettingRepository.class);
        applicationRepository = mock(ApplicationRepository.class);
        applicationFormRepository = mock(ApplicationFormRepository.class);
        applicationQuestionRepository = mock(ApplicationQuestionRepository.class);
        applicationOptionRepository = mock(ApplicationOptionRepository.class);
        applicationAnswerRepository = mock(ApplicationAnswerRepository.class);
        applicationService = newApplicationService(true, DeviceDuplicatePolicy.FLAG);
        principal = new AuthenticatedUser(1L, UserRole.FAN);
        fan = user(1L, UserRole.FAN);
        meeting = openMeeting();
        MeetingApplicationSetting setting = MeetingApplicationSetting.create(
                meeting,
                true,
                now().minusDays(1),
                now().plusDays(1),
                now().plusDays(2),
                20
        );
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);
        when(fanMeetingRepository.findById(10L)).thenReturn(Optional.of(meeting));
        when(applicationSettingRepository.findById(10L)).thenReturn(Optional.of(setting));
        when(applicationFormRepository.findByMeeting_Id(10L)).thenReturn(Optional.empty());
    }

    /** 최초 응모 시 접수 상태의 새 응모 레코드를 생성하는지 검증한다. */
    @Test
    void submitsFirstApplication() {
        stubNewApplication();

        ApplicationSubmitResponse response = applicationService.submit(
                10L, request(List.of()), principal, null
        );

        assertThat(response.applicationId()).isEqualTo(100L);
        assertThat(response.applicationStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        assertThat(response.submittedAt()).isEqualTo(now());
    }

    /** 이메일 인증을 마치지 않은 팬의 응모를 저장 전에 거부하는지 검증한다. */
    @Test
    void rejectsApplicationFromUnverifiedEmail() {
        when(fan.isEmailVerified()).thenReturn(false);

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of()), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.EMAIL_VERIFICATION_REQUIRED));

        verify(applicationRepository, never()).saveAndFlush(any(Application.class));
    }

    /** 이메일 인증 강제를 끄면 미인증 계정도 응모할 수 있는지 검증한다. */
    @Test
    void allowsUnverifiedEmailWhenGateDisabled() {
        when(fan.isEmailVerified()).thenReturn(false);
        stubNewApplication();

        ApplicationSubmitResponse response = newApplicationService(false, DeviceDuplicatePolicy.FLAG)
                .submit(10L, request(List.of()), principal, null);

        assertThat(response.applicationStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
    }

    /** 기기 쿠키가 있으면 응모에 기기 해시를 기록하는지 검증한다. */
    @Test
    void recordsDeviceHashOnApplication() {
        stubNewApplication();
        when(applicationRepository
                .existsByMeeting_IdAndDeviceHashAndFan_IdNot(10L, DEVICE_HASH, 1L))
                .thenReturn(false);

        applicationService.submit(10L, request(List.of()), principal, DEVICE_HASH);

        Application saved = savedApplication();
        assertThat(saved.getDeviceHash()).isEqualTo(DEVICE_HASH);
        assertThat(saved.getRiskStatus()).isEqualTo(ApplicationRiskStatus.NONE);
    }

    /** 같은 기기를 쓴 다른 계정이 있으면 차단하지 않고 의심 응모로 표시하는지 검증한다. */
    @Test
    void flagsApplicationWhenAnotherFanUsedSameDevice() {
        stubNewApplication();
        when(applicationRepository
                .existsByMeeting_IdAndDeviceHashAndFan_IdNot(10L, DEVICE_HASH, 1L))
                .thenReturn(true);

        ApplicationSubmitResponse response = applicationService.submit(
                10L, request(List.of()), principal, DEVICE_HASH
        );

        assertThat(response.applicationStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        Application saved = savedApplication();
        assertThat(saved.getRiskStatus()).isEqualTo(ApplicationRiskStatus.FLAGGED);
        assertThat(saved.getRiskReason()).isNotBlank();
    }

    /** BLOCK 정책에서는 같은 기기를 쓴 다른 계정의 응모를 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsSameDeviceApplicationUnderBlockPolicy() {
        stubNewApplication();
        when(applicationRepository
                .existsByMeeting_IdAndDeviceHashAndFan_IdNot(10L, DEVICE_HASH, 1L))
                .thenReturn(true);

        assertThatThrownBy(() -> newApplicationService(true, DeviceDuplicatePolicy.BLOCK)
                .submit(10L, request(List.of()), principal, DEVICE_HASH))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DEVICE_DUPLICATE_APPLICATION));
    }

    /** 기기 쿠키가 없으면 동일 기기 조회 없이 응모를 접수하는지 검증한다. */
    @Test
    void skipsDeviceCheckWithoutCookie() {
        stubNewApplication();

        applicationService.submit(10L, request(List.of()), principal, null);

        assertThat(savedApplication().getDeviceHash()).isNull();
        verify(applicationRepository, never())
                .existsByMeeting_IdAndDeviceHashAndFan_IdNot(anyLong(), anyString(), anyLong());
    }

    /** 동시 응모로 DB 유니크 제약이 깨지면 중복 응모 충돌로 변환하는지 검증한다. */
    @Test
    void translatesUniqueConstraintViolationToConflict() {
        when(applicationRepository.findByMeeting_IdAndFan_Id(10L, 1L))
                .thenReturn(Optional.empty());
        when(applicationRepository.saveAndFlush(any(Application.class)))
                .thenThrow(new DataIntegrityViolationException("uk_applications_meeting_fan"));

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of()), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_ALREADY_SUBMITTED));
    }

    /** 접수된 응모를 삭제하지 않고 WITHDRAWN 상태와 취소 시각으로 변경하는지 검증한다. */
    @Test
    void withdrawsSubmittedApplication() {
        Application application = submittedApplication(100L);
        when(applicationRepository.findByMeeting_IdAndFan_Id(10L, 1L))
                .thenReturn(Optional.of(application));

        ApplicationWithdrawResponse response = applicationService.withdraw(10L, principal);

        assertThat(response.applicationId()).isEqualTo(100L);
        assertThat(response.applicationStatus()).isEqualTo(ApplicationStatus.WITHDRAWN);
        assertThat(response.withdrawnAt()).isEqualTo(now());
    }

    /** 재응모 시 같은 응모 식별자를 유지하고 기존 답변을 새 답변으로 교체하는지 검증한다. */
    @Test
    void resubmitsWithdrawnApplicationWithNewAnswers() {
        Application application = submittedApplication(100L);
        application.withdraw(now().minusHours(1));
        ApplicationForm form = mock(ApplicationForm.class);
        ApplicationQuestion question = question(200L, true);
        when(form.getId()).thenReturn(300L);
        when(applicationFormRepository.findByMeeting_Id(10L)).thenReturn(Optional.of(form));
        when(applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(300L))
                .thenReturn(List.of(question));
        when(applicationRepository.findByMeeting_IdAndFan_Id(10L, 1L))
                .thenReturn(Optional.of(application));

        ApplicationSubmitResponse response = applicationService.submit(
                10L,
                request(List.of(textAnswer(200L, "새 답변"))),
                principal,
                null
        );

        assertThat(response.applicationId()).isEqualTo(100L);
        assertThat(response.applicationStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        verify(applicationAnswerRepository).deleteAllByApplication_Id(100L);
        verify(applicationAnswerRepository).saveAll(
                org.mockito.ArgumentMatchers.argThat(answers -> {
                    java.util.Iterator<ApplicationAnswer> iterator = answers.iterator();
                    return iterator.hasNext()
                            && iterator.next().getAnswerText().equals("새 답변")
                            && !iterator.hasNext();
                })
        );
    }

    /** 이미 접수 상태인 팬의 중복 응모 요청을 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsDuplicateSubmittedApplication() {
        when(applicationRepository.findByMeeting_IdAndFan_Id(10L, 1L))
                .thenReturn(Optional.of(submittedApplication(100L)));

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of()), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_ALREADY_SUBMITTED));
    }

    /** 필수 질문 답변이 빠진 응모 요청을 잘못된 답변으로 거부하는지 검증한다. */
    @Test
    void rejectsMissingRequiredAnswer() {
        ApplicationForm form = mock(ApplicationForm.class);
        ApplicationQuestion requiredQuestion = question(200L, true);
        when(form.getId()).thenReturn(300L);
        when(applicationFormRepository.findByMeeting_Id(10L)).thenReturn(Optional.of(form));
        when(applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(300L))
                .thenReturn(List.of(requiredQuestion));

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of()), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_ANSWER_INVALID));

        verify(applicationRepository, never()).saveAndFlush(any(Application.class));
    }

    /** 개인정보 수집에 동의하지 않은 응모 요청을 저장 전에 거부하는지 검증한다. */
    @Test
    void rejectsMissingPersonalInformationConsent() {
        ApplicationSubmitRequest request =
                new ApplicationSubmitRequest(false, true, true, List.of());

        assertThatThrownBy(() -> applicationService.submit(10L, request, principal, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_CONSENT_REQUIRED));

        verify(applicationRepository, never()).saveAndFlush(any(Application.class));
    }

    /** 참여 동의를 하지 않은 응모 요청을 저장 전에 거부하는지 검증한다. */
    @Test
    void rejectsMissingParticipationConsent() {
        ApplicationSubmitRequest request =
                new ApplicationSubmitRequest(true, true, false, List.of());

        assertThatThrownBy(() -> applicationService.submit(10L, request, principal, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_PARTICIPATION_CONSENT_REQUIRED));

        verify(applicationRepository, never()).saveAndFlush(any(Application.class));
    }

    /** 녹화를 사용하는 팬미팅에서 녹화 동의가 빠진 응모를 거부하는지 검증한다. */
    @Test
    void rejectsMissingRecordingConsentWhenRecordingEnabled() {
        stubRecording(true);
        ApplicationSubmitRequest request =
                new ApplicationSubmitRequest(true, false, true, List.of());

        assertThatThrownBy(() -> applicationService.submit(10L, request, principal, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_RECORDING_CONSENT_REQUIRED));

        verify(applicationRepository, never()).saveAndFlush(any(Application.class));
    }

    /** 녹화를 사용하는 팬미팅의 동의 세 가지를 모두 시각으로 남기는지 검증한다. */
    @Test
    void recordsAllConsentTimesWhenRecordingEnabled() {
        stubRecording(true);
        stubNewApplication();

        applicationService.submit(10L, request(List.of()), principal, null);

        Application saved = savedApplication();
        assertThat(saved.getPersonalInformationConsentAt()).isEqualTo(now());
        assertThat(saved.getRecordingConsentAt()).isEqualTo(now());
        assertThat(saved.getParticipationConsentAt()).isEqualTo(now());
    }

    /**
     * 녹화를 쓰지 않는 팬미팅은 녹화 동의 없이도 접수하고 녹화 동의 시각을 남기지 않는지 검증한다.
     *
     * <p>화면에서도 녹화 동의 항목을 감추므로 동의를 강제하면 응모 자체가 막힌다.
     */
    @Test
    void acceptsApplicationWithoutRecordingConsentWhenRecordingDisabled() {
        stubRecording(false);
        stubNewApplication();

        applicationService.submit(
                10L, new ApplicationSubmitRequest(true, false, true, List.of()), principal, null
        );

        Application saved = savedApplication();
        assertThat(saved.getRecordingConsentAt()).isNull();
        assertThat(saved.getParticipationConsentAt()).isEqualTo(now());
    }

    /** 복수 선택 답변을 고른 선택지 수만큼 표시 순서대로 저장하는지 검증한다. */
    @Test
    void savesOneAnswerRowPerSelectedOption() {
        ApplicationQuestion question =
                choiceQuestion(200L, true, ApplicationQuestionType.MULTIPLE_CHOICE);
        ApplicationOption first = option(401L, question, "발라드", 1);
        ApplicationOption second = option(402L, question, "댄스", 2);
        stubFormWithQuestion(question, first, second);
        stubNewApplication();

        applicationService.submit(
                // 고른 순서가 아니라 선택지 표시 순서대로 저장되어야 한다.
                10L, request(List.of(choiceAnswer(200L, List.of(402L, 401L)))), principal, null
        );

        assertThat(savedAnswers())
                .extracting(answer -> answer.getSelectedOption().getId(),
                        ApplicationAnswer::getAnswerSequence,
                        ApplicationAnswer::getAnswerText)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(401L, 1, null),
                        org.assertj.core.groups.Tuple.tuple(402L, 2, null)
                );
    }

    /** 단일 선택 질문에 선택지를 두 개 보낸 응모를 거부하는지 검증한다. */
    @Test
    void rejectsMultipleOptionsForSingleChoiceQuestion() {
        ApplicationQuestion question =
                choiceQuestion(200L, true, ApplicationQuestionType.SINGLE_CHOICE);
        stubFormWithQuestion(question, option(401L, question, "발라드", 1),
                option(402L, question, "댄스", 2));

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of(choiceAnswer(200L, List.of(401L, 402L)))), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_ANSWER_INVALID));

        verify(applicationRepository, never()).saveAndFlush(any(Application.class));
    }

    /** 이 질문에 속하지 않은 선택지를 고른 응모를 거부하는지 검증한다. */
    @Test
    void rejectsOptionThatDoesNotBelongToQuestion() {
        ApplicationQuestion question =
                choiceQuestion(200L, true, ApplicationQuestionType.SINGLE_CHOICE);
        stubFormWithQuestion(question, option(401L, question, "발라드", 1),
                option(402L, question, "댄스", 2));

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of(choiceAnswer(200L, List.of(999L)))), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_ANSWER_INVALID));
    }

    /** 객관식 질문에 자유 입력 답변만 보낸 응모를 거부하는지 검증한다. */
    @Test
    void rejectsTextValueForChoiceQuestion() {
        ApplicationQuestion question =
                choiceQuestion(200L, true, ApplicationQuestionType.SINGLE_CHOICE);
        stubFormWithQuestion(question, option(401L, question, "발라드", 1),
                option(402L, question, "댄스", 2));

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of(textAnswer(200L, "발라드"))), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_ANSWER_INVALID));
    }

    /** 주관식 질문에 선택지를 보낸 응모를 거부하는지 검증한다. */
    @Test
    void rejectsOptionsForTextQuestion() {
        stubFormWithQuestion(question(200L, true));

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of(choiceAnswer(200L, List.of(401L)))), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_ANSWER_INVALID));
    }

    /** 공백만 입력한 주관식 답변을 거부하는지 검증한다. */
    @Test
    void rejectsBlankTextAnswer() {
        stubFormWithQuestion(question(200L, true));

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of(textAnswer(200L, "   "))), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_ANSWER_INVALID));
    }

    /** 필수 객관식 질문을 고르지 않은 응모를 거부하는지 검증한다. */
    @Test
    void rejectsMissingRequiredChoiceAnswer() {
        ApplicationQuestion question =
                choiceQuestion(200L, true, ApplicationQuestionType.SINGLE_CHOICE);
        stubFormWithQuestion(question, option(401L, question, "발라드", 1),
                option(402L, question, "댄스", 2));

        assertThatThrownBy(() -> applicationService.submit(
                10L, request(List.of()), principal, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_ANSWER_INVALID));
    }

    /** 최초 응모 저장이 식별자를 채워 반환하도록 저장소 대역을 준비한다. */
    private void stubNewApplication() {
        when(applicationRepository.findByMeeting_IdAndFan_Id(10L, 1L))
                .thenReturn(Optional.empty());
        when(applicationRepository.saveAndFlush(any(Application.class))).thenAnswer(invocation -> {
            Application saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 100L);
            return saved;
        });
    }

    /**
     * 저장소에 전달된 응모 엔티티를 꺼내 저장 이후 상태를 검증할 수 있게 한다.
     *
     * @return 저장 요청에 사용된 응모 엔티티
     */
    private Application savedApplication() {
        ArgumentCaptor<Application> captor = ArgumentCaptor.forClass(Application.class);
        verify(applicationRepository).saveAndFlush(captor.capture());
        return captor.getValue();
    }

    /**
     * 지정한 이메일 인증 강제 여부와 기기 중복 정책으로 응모 서비스를 만든다.
     *
     * @param emailVerificationRequired 응모 전 이메일 인증을 강제할지 여부
     * @param policy 동일 기기 다계정 응모 처리 정책
     * @return 고정 시계를 사용하는 응모 서비스
     */
    private ApplicationService newApplicationService(
            boolean emailVerificationRequired, DeviceDuplicatePolicy policy
    ) {
        return new ApplicationService(
                currentUserService,
                fanMeetingRepository,
                applicationSettingRepository,
                operationSettingRepository,
                applicationRepository,
                applicationFormRepository,
                applicationQuestionRepository,
                applicationOptionRepository,
                applicationAnswerRepository,
                Clock.fixed(NOW, SEOUL),
                emailVerificationRequired,
                policy
        );
    }

    /** 테스트에 사용할 동의 완료 상태의 응모 제출 요청을 생성한다. */
    private ApplicationSubmitRequest request(
            List<ApplicationSubmitRequest.AnswerRequest> answers
    ) {
        return new ApplicationSubmitRequest(true, true, true, answers);
    }

    /** 테스트에 사용할 주관식 답변 요청 한 건을 생성한다. */
    private ApplicationSubmitRequest.AnswerRequest textAnswer(Long questionId, String value) {
        return new ApplicationSubmitRequest.AnswerRequest(questionId, value, null);
    }

    /** 테스트에 사용할 객관식 답변 요청 한 건을 생성한다. */
    private ApplicationSubmitRequest.AnswerRequest choiceAnswer(
            Long questionId, List<Long> optionIds
    ) {
        return new ApplicationSubmitRequest.AnswerRequest(questionId, null, optionIds);
    }

    /**
     * 지정한 질문을 가진 응모 폼과 그 질문의 선택지를 조회하도록 저장소 대역을 준비한다.
     *
     * @param question 폼에 포함할 질문
     * @param options 객관식 질문의 선택지이며 주관식이면 비운다
     */
    private void stubFormWithQuestion(ApplicationQuestion question, ApplicationOption... options) {
        ApplicationForm form = mock(ApplicationForm.class);
        when(form.getId()).thenReturn(300L);
        when(applicationFormRepository.findByMeeting_Id(10L)).thenReturn(Optional.of(form));
        when(applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(300L))
                .thenReturn(List.of(question));
        if (options.length > 0) {
            when(applicationOptionRepository
                    .findAllByQuestion_IdInAndDeletedAtIsNullOrderByDisplayOrderAsc(
                            List.of(question.getId())))
                    .thenReturn(List.of(options));
        }
    }

    /** 저장 요청에 전달된 응모 답변 목록을 꺼낸다. */
    private List<ApplicationAnswer> savedAnswers() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ApplicationAnswer>> captor = ArgumentCaptor.forClass(List.class);
        verify(applicationAnswerRepository).saveAll(captor.capture());
        return captor.getValue();
    }

    /** 필수 여부와 식별자, 유형을 지정한 객관식 질문 테스트 대역을 생성한다. */
    private ApplicationQuestion choiceQuestion(
            Long id, boolean required, ApplicationQuestionType type
    ) {
        ApplicationQuestion result = mock(ApplicationQuestion.class);
        when(result.getId()).thenReturn(id);
        when(result.isRequired()).thenReturn(required);
        when(result.getQuestionType()).thenReturn(type);
        return result;
    }

    /** 지정한 질문에 속한 선택지 테스트 대역을 생성한다. */
    private ApplicationOption option(
            Long id, ApplicationQuestion question, String optionText, int displayOrder
    ) {
        ApplicationOption result = ApplicationOption.create(question, optionText, displayOrder);
        ReflectionTestUtils.setField(result, "id", id);
        return result;
    }

    /** 녹화 사용 여부를 지정한 팬미팅 운영 설정을 조회하도록 저장소 대역을 준비한다. */
    private void stubRecording(boolean recordingEnabled) {
        MeetingOperationSetting setting = mock(MeetingOperationSetting.class);
        when(setting.isRecordingEnabled()).thenReturn(recordingEnabled);
        when(operationSettingRepository.findById(10L)).thenReturn(Optional.of(setting));
    }

    /** 지정한 식별자와 역할을 가진 이메일 인증 완료 사용자 테스트 대역을 생성한다. */
    private User user(Long id, UserRole role) {
        User result = mock(User.class);
        when(result.getId()).thenReturn(id);
        when(result.getRole()).thenReturn(role);
        when(result.isEmailVerified()).thenReturn(true);
        return result;
    }

    /** 응모 가능 상태와 기간을 가진 테스트 팬미팅을 생성한다. */
    private FanMeeting openMeeting() {
        FanMeeting result = FanMeeting.create(
                null,
                null,
                user(2L, UserRole.INFLUENCER),
                "테스트 팬미팅",
                null,
                null,
                now().plusDays(10)
        );
        ReflectionTestUtils.setField(result, "id", 10L);
        result.publish(now().minusDays(2));
        result.openApplications();
        return result;
    }

    /** 지정한 식별자를 가진 접수 상태의 테스트 응모를 생성한다. */
    private Application submittedApplication(Long id) {
        Application result = Application.submit(meeting, fan, now().minusHours(2));
        ReflectionTestUtils.setField(result, "id", id);
        return result;
    }

    /** 필수 여부와 식별자를 지정한 주관식 질문 테스트 대역을 생성한다. */
    private ApplicationQuestion question(Long id, boolean required) {
        ApplicationQuestion result = mock(ApplicationQuestion.class);
        when(result.getId()).thenReturn(id);
        when(result.isRequired()).thenReturn(required);
        when(result.getQuestionType()).thenReturn(ApplicationQuestionType.SHORT_TEXT);
        return result;
    }

    /** 고정 Clock이 제공하는 서울 기준 현재 시각을 반환한다. */
    private LocalDateTime now() {
        return LocalDateTime.ofInstant(NOW, SEOUL);
    }
}
