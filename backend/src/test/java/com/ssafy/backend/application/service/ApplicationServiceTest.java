package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationAnswer;
import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.domain.ApplicationQuestionType;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.domain.DeviceDuplicatePolicy;
import com.ssafy.backend.application.dto.ApplicationSubmitRequest;
import com.ssafy.backend.application.dto.ApplicationSubmitResponse;
import com.ssafy.backend.application.dto.ApplicationWithdrawResponse;
import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.auth.service.DeviceTokenService;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.common.support.RequestRateLimiter;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ApplicationServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-30T03:00:00Z");

    private CurrentUserService currentUserService;
    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private ApplicationRepository applicationRepository;
    private ApplicationFormRepository applicationFormRepository;
    private ApplicationQuestionRepository applicationQuestionRepository;
    private ApplicationAnswerRepository applicationAnswerRepository;
    private DeviceTokenService deviceTokenService;
    private RequestRateLimiter rateLimiter;
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
        applicationRepository = mock(ApplicationRepository.class);
        applicationFormRepository = mock(ApplicationFormRepository.class);
        applicationQuestionRepository = mock(ApplicationQuestionRepository.class);
        applicationAnswerRepository = mock(ApplicationAnswerRepository.class);
        deviceTokenService = mock(DeviceTokenService.class);
        rateLimiter = mock(RequestRateLimiter.class);
        applicationService = new ApplicationService(
                currentUserService,
                fanMeetingRepository,
                applicationSettingRepository,
                applicationRepository,
                applicationFormRepository,
                applicationQuestionRepository,
                applicationAnswerRepository,
                deviceTokenService,
                rateLimiter,
                Clock.fixed(NOW, SEOUL),
                false,
                DeviceDuplicatePolicy.FLAG,
                5,
                60L
        );
        // 요청 제한기 mock 의 boolean 기본값은 false 라 스텁하지 않으면 모든 응모가 429 로 막힌다.
        when(rateLimiter.tryConsume(anyString(), anyString(), anyInt(), any(Duration.class)))
                .thenReturn(true);
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
        when(applicationRepository.findByMeeting_IdAndFan_Id(10L, 1L))
                .thenReturn(Optional.empty());
        when(applicationRepository.save(any(Application.class))).thenAnswer(invocation -> {
            Application saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 100L);
            return saved;
        });

        ApplicationSubmitResponse response = applicationService.submit(
                10L, request(List.of()), principal, null
        );

        assertThat(response.applicationId()).isEqualTo(100L);
        assertThat(response.applicationStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        assertThat(response.submittedAt()).isEqualTo(now());
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
                request(List.of(new ApplicationSubmitRequest.AnswerRequest(200L, "새 답변"))),
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

        verify(applicationRepository, never()).save(any(Application.class));
    }

    /** 개인정보 수집에 동의하지 않은 응모 요청을 저장 전에 거부하는지 검증한다. */
    @Test
    void rejectsMissingPersonalInformationConsent() {
        ApplicationSubmitRequest request = new ApplicationSubmitRequest(false, List.of());

        assertThatThrownBy(() -> applicationService.submit(10L, request, principal, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_CONSENT_REQUIRED));

        verify(applicationRepository, never()).save(any(Application.class));
    }

    /** 테스트에 사용할 응모 제출 요청을 생성한다. */
    private ApplicationSubmitRequest request(
            List<ApplicationSubmitRequest.AnswerRequest> answers
    ) {
        return new ApplicationSubmitRequest(true, answers);
    }

    /** 지정한 식별자와 역할을 반환하는 사용자 테스트 대역을 생성한다. */
    private User user(Long id, UserRole role) {
        User result = mock(User.class);
        when(result.getId()).thenReturn(id);
        when(result.getRole()).thenReturn(role);
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
