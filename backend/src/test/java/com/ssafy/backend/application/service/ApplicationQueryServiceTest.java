package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationAnswer;
import com.ssafy.backend.application.domain.ApplicationForm;
import com.ssafy.backend.application.domain.ApplicationQuestion;
import com.ssafy.backend.application.domain.ApplicationQuestionType;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.dto.ApplicantListResponse;
import com.ssafy.backend.application.dto.ApplicationStatisticsResponse;
import com.ssafy.backend.application.dto.MyApplicationResponse;
import com.ssafy.backend.application.dto.MyApplicationSummaryResponse;
import com.ssafy.backend.application.dto.ParticipantAssignment;
import com.ssafy.backend.application.repository.ApplicationAnswerRepository;
import com.ssafy.backend.application.repository.ApplicationFormRepository;
import com.ssafy.backend.application.repository.ApplicationQuestionRepository;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.api.PageResponse;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ApplicationQueryServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-30T03:00:00Z");
    private static final long MEETING_ID = 10L;
    private static final long FAN_ID = 1L;
    private static final long FORM_ID = 300L;

    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private FanMeetingRepository fanMeetingRepository;
    private ApplicationRepository applicationRepository;
    private ApplicationFormRepository applicationFormRepository;
    private ApplicationQuestionRepository applicationQuestionRepository;
    private ApplicationAnswerRepository applicationAnswerRepository;
    private ApplicationQueryService applicationQueryService;
    private AuthenticatedUser fanPrincipal;
    private AuthenticatedUser operatorPrincipal;
    private User fan;
    private User operator;
    private FanMeeting meeting;

    /** 각 테스트에서 사용할 팬, 운영자, 팬미팅과 저장소 대역으로 조회 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationRepository = mock(ApplicationRepository.class);
        applicationFormRepository = mock(ApplicationFormRepository.class);
        applicationQuestionRepository = mock(ApplicationQuestionRepository.class);
        applicationAnswerRepository = mock(ApplicationAnswerRepository.class);
        applicationQueryService = new ApplicationQueryService(
                currentUserService,
                meetingAccessService,
                fanMeetingRepository,
                applicationRepository,
                applicationFormRepository,
                applicationQuestionRepository,
                applicationAnswerRepository
        );
        fanPrincipal = new AuthenticatedUser(FAN_ID, UserRole.FAN);
        operatorPrincipal = new AuthenticatedUser(3L, UserRole.MANAGER);
        fan = user(FAN_ID, UserRole.FAN, "테스트팬", "https://cdn.melly.test/fan.png");
        operator = user(3L, UserRole.MANAGER, "테스트매니저", null);
        meeting = openMeeting();
        when(currentUserService.requireActiveUser(fanPrincipal)).thenReturn(fan);
        when(currentUserService.requireActiveUser(operatorPrincipal)).thenReturn(operator);
        when(fanMeetingRepository.findById(MEETING_ID)).thenReturn(Optional.of(meeting));
        when(meetingAccessService.requireOperator(MEETING_ID, operator)).thenReturn(meeting);
    }

    /** 참가자로 확정된 팬의 응모 결과에 호출 순서와 팬미팅 카드 정보를 담는지 검증한다. */
    @Test
    void returnsMyApplicationWithParticipantAssignment() {
        Application application = application(100L, ApplicationStatus.SELECTED);
        when(applicationRepository.findWithMeetingByMeeting_IdAndFan_Id(MEETING_ID, FAN_ID))
                .thenReturn(Optional.of(application));
        when(applicationRepository.findParticipantAssignments(List.of(100L)))
                .thenReturn(List.of(new ParticipantAssignment(100L, 500L, 3)));

        MyApplicationResponse response =
                applicationQueryService.getMyApplication(MEETING_ID, fanPrincipal);

        assertThat(response.applicationId()).isEqualTo(100L);
        assertThat(response.applicationStatus()).isEqualTo(ApplicationStatus.SELECTED);
        assertThat(response.participantId()).isEqualTo(500L);
        assertThat(response.callOrder()).isEqualTo(3);
        assertThat(response.callOrderSource()).isEqualTo("DRAW");
        assertThat(response.meetingId()).isEqualTo(MEETING_ID);
        assertThat(response.meetingTitle()).isEqualTo("테스트 팬미팅");
        assertThat(response.influencerName()).isEqualTo("테스트인플루언서");
        assertThat(response.scheduledStartAt()).isEqualTo(meeting.getScheduledStartAt());
    }

    /** 추첨 전이라 참가자가 없으면 참가자 관련 필드를 null로 반환하는지 검증한다. */
    @Test
    void returnsNullAssignmentFieldsWithoutParticipant() {
        Application application = application(100L, ApplicationStatus.SUBMITTED);
        when(applicationRepository.findWithMeetingByMeeting_IdAndFan_Id(MEETING_ID, FAN_ID))
                .thenReturn(Optional.of(application));
        when(applicationRepository.findParticipantAssignments(List.of(100L)))
                .thenReturn(List.of());

        MyApplicationResponse response =
                applicationQueryService.getMyApplication(MEETING_ID, fanPrincipal);

        assertThat(response.participantId()).isNull();
        assertThat(response.callOrder()).isNull();
        assertThat(response.callOrderSource()).isNull();
        assertThat(response.resultDecidedAt()).isNull();
    }

    /** 응모하지 않은 팬미팅의 내 응모 조회를 404 오류로 거부하는지 검증한다. */
    @Test
    void rejectsMyApplicationLookupWithoutApplication() {
        when(applicationRepository.findWithMeetingByMeeting_IdAndFan_Id(MEETING_ID, FAN_ID))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() ->
                applicationQueryService.getMyApplication(MEETING_ID, fanPrincipal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_NOT_FOUND));
    }

    /** 존재하지 않는 팬미팅의 내 응모 조회를 404 오류로 거부하는지 검증한다. */
    @Test
    void rejectsMyApplicationLookupForMissingMeeting() {
        when(fanMeetingRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> applicationQueryService.getMyApplication(999L, fanPrincipal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 팬이 아닌 사용자의 내 응모 조회를 403 오류로 거부하는지 검증한다. */
    @Test
    void rejectsMyApplicationLookupForNonFan() {
        assertThatThrownBy(() ->
                applicationQueryService.getMyApplication(MEETING_ID, operatorPrincipal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));

        verifyNoInteractions(applicationRepository);
    }

    /** 내 응모 내역 목록을 팬 식별자 기준으로 조회하고 호출 순서를 채우는지 검증한다. */
    @Test
    void returnsMyApplicationsWithCallOrder() {
        Application application = application(100L, ApplicationStatus.SELECTED);
        when(applicationRepository.findAllByFan_Id(eq(FAN_ID), any(Pageable.class)))
                .thenReturn(page(List.of(application), 0, 20, 1));
        when(applicationRepository.findParticipantAssignments(List.of(100L)))
                .thenReturn(List.of(new ParticipantAssignment(100L, 500L, 2)));

        PageResponse<MyApplicationSummaryResponse> response =
                applicationQueryService.getMyApplications(null, 0, 20, fanPrincipal);

        assertThat(response.totalElements()).isEqualTo(1L);
        assertThat(response.content()).hasSize(1);
        assertThat(response.content().get(0).callOrder()).isEqualTo(2);
        assertThat(response.content().get(0).meetingTitle()).isEqualTo("테스트 팬미팅");
        assertThat(response.content().get(0).influencerName())
                .isEqualTo("테스트인플루언서");
    }

    /** 응모 상태 필터가 있으면 상태 조건을 포함한 조회를 사용하는지 검증한다. */
    @Test
    void filtersMyApplicationsByStatus() {
        when(applicationRepository.findAllByFan_IdAndStatus(
                eq(FAN_ID), eq(ApplicationStatus.WITHDRAWN), any(Pageable.class)))
                .thenReturn(page(List.of(), 0, 20, 0));

        PageResponse<MyApplicationSummaryResponse> response = applicationQueryService
                .getMyApplications(ApplicationStatus.WITHDRAWN, 0, 20, fanPrincipal);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalElements()).isZero();
        verify(applicationRepository, never()).findAllByFan_Id(eq(FAN_ID), any(Pageable.class));
        verify(applicationRepository, never()).findParticipantAssignments(anyCollection());
    }

    /** 응모 내역이 없는 팬에게 빈 페이지를 반환하는지 검증한다. */
    @Test
    void returnsEmptyPageWhenFanHasNoApplication() {
        when(applicationRepository.findAllByFan_Id(eq(FAN_ID), any(Pageable.class)))
                .thenReturn(page(List.of(), 0, 20, 0));

        PageResponse<MyApplicationSummaryResponse> response =
                applicationQueryService.getMyApplications(null, 0, 20, fanPrincipal);

        assertThat(response.content()).isEmpty();
        assertThat(response.totalPages()).isZero();
        assertThat(response.hasNext()).isFalse();
    }

    /** 페이지 크기 경계값 1과 100을 허용하는지 검증한다. */
    @Test
    void allowsPageSizeBoundaries() {
        when(applicationRepository.findAllByFan_Id(eq(FAN_ID), any(Pageable.class)))
                .thenReturn(page(List.of(), 0, 1, 0));

        assertThat(applicationQueryService.getMyApplications(null, 0, 1, fanPrincipal)).isNotNull();
        assertThat(applicationQueryService.getMyApplications(null, 0, 100, fanPrincipal))
                .isNotNull();
    }

    /** 음수 페이지 번호와 허용 범위를 벗어난 크기를 400 오류로 거부하는지 검증한다. */
    @Test
    void rejectsInvalidPageValuesForMyApplications() {
        assertThatThrownBy(() -> applicationQueryService.getMyApplications(null, -1, 20, fanPrincipal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
        assertThatThrownBy(() -> applicationQueryService.getMyApplications(null, 0, 0, fanPrincipal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));
        assertThatThrownBy(() -> applicationQueryService.getMyApplications(null, 0, 101, fanPrincipal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_REQUEST));

        verifyNoInteractions(applicationRepository);
    }

    /** 응모자 목록에 팬 정보와 질문 표시 순서대로 정렬된 제출 답변을 담는지 검증한다. */
    @Test
    void returnsApplicantsWithSubmittedAnswers() {
        Application application = application(100L, ApplicationStatus.SUBMITTED);
        ApplicationForm form = form();
        when(applicationRepository
                .findAllByMeeting_IdAndStatusNotAndFan_NicknameContainingIgnoreCase(
                        eq(MEETING_ID), eq(ApplicationStatus.WITHDRAWN), eq(""),
                        any(Pageable.class)))
                .thenReturn(page(List.of(application), 0, 20, 1));
        when(applicationRepository.countByMeeting_IdAndStatusNot(
                MEETING_ID, ApplicationStatus.WITHDRAWN)).thenReturn(7L);
        when(applicationAnswerRepository
                .findAllByApplication_IdInOrderByQuestion_DisplayOrderAsc(List.of(100L)))
                .thenReturn(List.of(
                        answer(application, question(201L, form, "이름", 1), "멜리"),
                        answer(application, question(202L, form, "응원 메시지", 2), "화이팅")
                ));

        ApplicantListResponse response = applicationQueryService.getApplicants(
                MEETING_ID, null, null, 0, 20, operatorPrincipal
        );

        assertThat(response.totalApplications()).isEqualTo(7L);
        assertThat(response.totalElements()).isEqualTo(1L);
        assertThat(response.content()).hasSize(1);
        assertThat(response.content().get(0).fanId()).isEqualTo(FAN_ID);
        assertThat(response.content().get(0).nickname()).isEqualTo("테스트팬");
        assertThat(response.content().get(0).profileImageUrl())
                .isEqualTo("https://cdn.melly.test/fan.png");
        assertThat(response.content().get(0).answers())
                .extracting("questionId", "questionText", "answerText")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(201L, "이름", "멜리"),
                        org.assertj.core.groups.Tuple.tuple(202L, "응원 메시지", "화이팅")
                );
    }

    /** 상태와 검색어 필터를 지정하면 해당 조건 조회를 사용하는지 검증한다. */
    @Test
    void filtersApplicantsByStatusAndKeyword() {
        when(applicationRepository
                .findAllByMeeting_IdAndStatusAndFan_NicknameContainingIgnoreCase(
                        eq(MEETING_ID), eq(ApplicationStatus.SELECTED), eq("멜리"),
                        any(Pageable.class)))
                .thenReturn(page(List.of(), 0, 20, 0));
        when(applicationRepository.countByMeeting_IdAndStatusNot(
                MEETING_ID, ApplicationStatus.WITHDRAWN)).thenReturn(7L);

        ApplicantListResponse response = applicationQueryService.getApplicants(
                MEETING_ID, ApplicationStatus.SELECTED, "  멜리  ", 0, 20, operatorPrincipal
        );

        assertThat(response.content()).isEmpty();
        assertThat(response.totalApplications()).isEqualTo(7L);
        assertThat(response.totalElements()).isZero();
        verify(applicationAnswerRepository, never())
                .findAllByApplication_IdInOrderByQuestion_DisplayOrderAsc(anyCollection());
    }

    /** 소유 운영자가 아닌 사용자의 응모자 목록 조회가 권한 검증에서 막히는지 검증한다. */
    @Test
    void rejectsApplicantsLookupForNonOperator() {
        when(meetingAccessService.requireOperator(MEETING_ID, operator))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> applicationQueryService.getApplicants(
                MEETING_ID, null, null, 0, 20, operatorPrincipal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.ACCESS_DENIED));

        verifyNoInteractions(applicationAnswerRepository);
    }

    /** 논리 삭제된 팬미팅의 응모자 목록 조회를 404 오류로 거부하는지 검증한다. */
    @Test
    void rejectsApplicantsLookupForDeletedMeeting() {
        FanMeeting deleted = draftMeeting();
        deleted.deleteDraft(now());
        when(meetingAccessService.requireOperator(MEETING_ID, operator)).thenReturn(deleted);

        assertThatThrownBy(() -> applicationQueryService.getApplicants(
                MEETING_ID, null, null, 0, 20, operatorPrincipal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 허용 범위를 벗어난 페이지 값의 응모자 목록 조회를 권한 검증 전에 거부하는지 검증한다. */
    @Test
    void rejectsInvalidPageValuesForApplicants() {
        assertThatThrownBy(() -> applicationQueryService.getApplicants(
                MEETING_ID, null, null, 0, 101, operatorPrincipal
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_REQUEST));

        verifyNoInteractions(meetingAccessService);
    }

    /** 응모 현황 집계와 질문별 응답 수를 반환하고 선택지 집계는 null인지 검증한다. */
    @Test
    void aggregatesApplicationStatistics() {
        ApplicationForm form = form();
        when(applicationRepository.countByMeeting_IdAndStatusNot(
                MEETING_ID, ApplicationStatus.WITHDRAWN)).thenReturn(9L);
        when(applicationRepository.countByMeeting_IdAndStatus(
                MEETING_ID, ApplicationStatus.SUBMITTED)).thenReturn(4L);
        when(applicationRepository.countByMeeting_IdAndStatus(
                MEETING_ID, ApplicationStatus.SELECTED)).thenReturn(3L);
        when(applicationRepository.countByMeeting_IdAndStatus(
                MEETING_ID, ApplicationStatus.NOT_SELECTED)).thenReturn(2L);
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID)).thenReturn(Optional.of(form));
        when(applicationQuestionRepository
                .findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(FORM_ID))
                .thenReturn(List.of(
                        question(201L, form, "이름", 1),
                        question(202L, form, "응원 메시지", 2)
                ));
        List<ApplicationAnswerRepository.QuestionResponseCount> responseCounts =
                List.of(responseCount(201L, 5L));
        when(applicationAnswerRepository.countResponsesByQuestion(
                FORM_ID, ApplicationStatus.WITHDRAWN)).thenReturn(responseCounts);

        ApplicationStatisticsResponse response =
                applicationQueryService.getStatistics(MEETING_ID, operatorPrincipal);

        assertThat(response.totalApplications()).isEqualTo(9L);
        assertThat(response.submittedCount()).isEqualTo(4L);
        assertThat(response.selectedCount()).isEqualTo(3L);
        assertThat(response.notSelectedCount()).isEqualTo(2L);
        assertThat(response.questionStats())
                .extracting("questionId", "questionText", "responseCount", "optionCounts")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(201L, "이름", 5L, null),
                        org.assertj.core.groups.Tuple.tuple(202L, "응원 메시지", 0L, null)
                );
    }

    /** 응모 폼이 없는 팬미팅의 통계에서 질문 통계를 빈 목록으로 반환하는지 검증한다. */
    @Test
    void returnsEmptyQuestionStatsWithoutForm() {
        when(applicationFormRepository.findByMeeting_Id(MEETING_ID)).thenReturn(Optional.empty());

        ApplicationStatisticsResponse response =
                applicationQueryService.getStatistics(MEETING_ID, operatorPrincipal);

        assertThat(response.totalApplications()).isZero();
        assertThat(response.questionStats()).isEmpty();
        verify(applicationAnswerRepository, never())
                .countResponsesByQuestion(FORM_ID, ApplicationStatus.WITHDRAWN);
    }

    /** 소유 운영자가 아닌 사용자의 통계 조회가 권한 검증에서 막히는지 검증한다. */
    @Test
    void rejectsStatisticsForNonOperator() {
        when(meetingAccessService.requireOperator(MEETING_ID, operator))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() ->
                applicationQueryService.getStatistics(MEETING_ID, operatorPrincipal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));

        verifyNoInteractions(applicationRepository);
    }

    /** 질문별 응답 수 집계 결과 대역을 생성한다. */
    private ApplicationAnswerRepository.QuestionResponseCount responseCount(
            Long questionId, long responseCount
    ) {
        ApplicationAnswerRepository.QuestionResponseCount result =
                mock(ApplicationAnswerRepository.QuestionResponseCount.class);
        when(result.getQuestionId()).thenReturn(questionId);
        when(result.getResponseCount()).thenReturn(responseCount);
        return result;
    }

    /** 지정한 내용으로 Spring Data 페이지를 생성한다. */
    private Page<Application> page(
            List<Application> content, int page, int size, long total
    ) {
        return new PageImpl<>(content, PageRequest.of(page, size), total);
    }

    /** 지정한 식별자와 상태를 가진 테스트 응모를 생성한다. */
    private Application application(Long id, ApplicationStatus status) {
        Application result = Application.submit(meeting, fan, now().minusDays(1));
        ReflectionTestUtils.setField(result, "id", id);
        ReflectionTestUtils.setField(result, "status", status);
        return result;
    }

    /** 테스트 응모 폼을 생성한다. */
    private ApplicationForm form() {
        ApplicationForm result = ApplicationForm.create(meeting, "안내문");
        ReflectionTestUtils.setField(result, "id", FORM_ID);
        return result;
    }

    /** 지정한 식별자와 표시 순서를 가진 주관식 테스트 질문을 생성한다. */
    private ApplicationQuestion question(
            Long id, ApplicationForm form, String questionText, int displayOrder
    ) {
        ApplicationQuestion result = ApplicationQuestion.create(
                form, questionText, ApplicationQuestionType.SHORT_TEXT, true, displayOrder
        );
        ReflectionTestUtils.setField(result, "id", id);
        return result;
    }

    /** 지정한 응모와 질문에 대한 테스트 답변을 생성한다. */
    private ApplicationAnswer answer(
            Application application, ApplicationQuestion question, String answerText
    ) {
        return ApplicationAnswer.createTextAnswer(application, question, answerText);
    }

    /** 지정한 속성을 반환하는 사용자 테스트 대역을 생성한다. */
    private User user(Long id, UserRole role, String nickname, String profileImageUrl) {
        User result = mock(User.class);
        when(result.getId()).thenReturn(id);
        when(result.getRole()).thenReturn(role);
        when(result.getNickname()).thenReturn(nickname);
        when(result.getProfileImageUrl()).thenReturn(profileImageUrl);
        return result;
    }

    /** 응모 접수 중인 테스트 팬미팅을 생성한다. */
    private FanMeeting openMeeting() {
        FanMeeting result = draftMeeting();
        result.publish(now().minusDays(2));
        result.openApplications();
        return result;
    }

    /** 초안 상태의 테스트 팬미팅을 생성한다. */
    private FanMeeting draftMeeting() {
        FanMeeting result = FanMeeting.create(
                null, null, user(2L, UserRole.INFLUENCER, "테스트인플루언서", null),
                "테스트 팬미팅", null, "https://cdn.melly.test/cover.png", now().plusDays(10)
        );
        ReflectionTestUtils.setField(result, "id", MEETING_ID);
        return result;
    }

    /** 고정 기준 시각을 서울 기준으로 반환한다. */
    private LocalDateTime now() {
        return LocalDateTime.ofInstant(NOW, SEOUL);
    }
}
