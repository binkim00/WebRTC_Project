package com.ssafy.backend.application.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.domain.DeviceDuplicatePolicy;
import com.ssafy.backend.application.dto.ApplicationSubmitRequest;
import com.ssafy.backend.application.dto.DrawResultResponse;
import com.ssafy.backend.application.dto.ResultPublishResponse;
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
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.domain.NotificationType;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.dto.QueueInitializationResponse;
import com.ssafy.backend.queue.service.QueueInitializationService;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ApplicationDrawServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-31T02:00:00Z");
    private static final long MEETING_ID = 10L;
    private static final long RANDOM_SEED = 20260731L;

    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private ApplicationRepository applicationRepository;
    private ParticipantRepository participantRepository;
    private NotificationRepository notificationRepository;
    private QueueInitializationService queueInitializationService;
    private ApplicationDrawService applicationDrawService;
    private AuthenticatedUser principal;
    private User operator;
    private FanMeeting meeting;

    /** 각 테스트에서 사용할 운영자, 응모 접수 중 팬미팅, 저장소와 고정 난수 기반 서비스를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationSettingRepository = mock(MeetingApplicationSettingRepository.class);
        applicationRepository = mock(ApplicationRepository.class);
        participantRepository = mock(ParticipantRepository.class);
        notificationRepository = mock(NotificationRepository.class);
        queueInitializationService = mock(QueueInitializationService.class);
        applicationDrawService = newService(new Random(RANDOM_SEED));

        principal = new AuthenticatedUser(1L, UserRole.SOLO_INFLUENCER);
        operator = user(1L, UserRole.SOLO_INFLUENCER);
        meeting = openMeeting();
        when(currentUserService.requireActiveUser(principal)).thenReturn(operator);
        when(meetingAccessService.requireOperator(MEETING_ID, operator)).thenReturn(meeting);
        when(fanMeetingRepository.findByIdForUpdate(MEETING_ID)).thenReturn(Optional.of(meeting));
        applyCapacity(2);
        when(participantRepository.saveAllAndFlush(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(queueInitializationService.initializeAfterDraw(meeting))
                .thenReturn(new QueueInitializationResponse(MEETING_ID, 2));
    }

    /** 응모자가 정원보다 많으면 정원만큼만 당첨시키고 나머지를 미당첨으로 확정하는지 검증한다. */
    @Test
    void selectsOnlyCapacityWhenApplicantsExceedCapacity() {
        applyCapacity(2);
        List<Application> applications = submittedApplications(5);
        stubEligibleApplications(applications);

        DrawResultResponse response = applicationDrawService.draw(MEETING_ID, principal);

        assertThat(response.selectedCount()).isEqualTo(2L);
        assertThat(response.notSelectedCount()).isEqualTo(3L);
        assertThat(response.participantCount()).isEqualTo(2L);
        assertThat(response.drawCompletedAt()).isEqualTo(now());
        assertThat(countByStatus(applications, ApplicationStatus.SELECTED)).isEqualTo(2);
        assertThat(countByStatus(applications, ApplicationStatus.NOT_SELECTED)).isEqualTo(3);
        assertThat(applications).allSatisfy(application ->
                assertThat(application.getResultDecidedAt()).isEqualTo(now()));
    }

    /** 응모자 수가 정원과 같으면 전원을 당첨 처리하는지 검증한다. */
    @Test
    void selectsAllApplicantsWhenCountEqualsCapacity() {
        applyCapacity(3);
        List<Application> applications = submittedApplications(3);
        stubEligibleApplications(applications);

        DrawResultResponse response = applicationDrawService.draw(MEETING_ID, principal);

        assertThat(response.selectedCount()).isEqualTo(3L);
        assertThat(response.notSelectedCount()).isZero();
        assertThat(countByStatus(applications, ApplicationStatus.NOT_SELECTED)).isZero();
    }

    /** 응모자가 정원보다 적으면 응모자 수만큼만 당첨시키는지 검증한다. */
    @Test
    void selectsEveryApplicantWhenFewerThanCapacity() {
        applyCapacity(10);
        List<Application> applications = submittedApplications(2);
        stubEligibleApplications(applications);

        DrawResultResponse response = applicationDrawService.draw(MEETING_ID, principal);

        assertThat(response.selectedCount()).isEqualTo(2L);
        assertThat(response.notSelectedCount()).isZero();
        assertThat(response.participantCount()).isEqualTo(2L);
    }

    /** 당첨자에게 1부터 연속된 호출 순번과 참가 대기 상태를 배정하는지 검증한다. */
    @SuppressWarnings("unchecked")
    @Test
    void assignsConsecutiveCallOrderFromOne() {
        applyCapacity(3);
        stubEligibleApplications(submittedApplications(5));

        applicationDrawService.draw(MEETING_ID, principal);

        ArgumentCaptor<List<Participant>> captor = ArgumentCaptor.forClass(List.class);
        verify(participantRepository).saveAllAndFlush(captor.capture());
        List<Participant> participants = captor.getValue();
        assertThat(participants).hasSize(3);
        assertThat(participants).extracting(Participant::getAssignedOrder)
                .containsExactly(1, 2, 3);
        assertThat(participants).allSatisfy(participant -> {
            assertThat(participant.getStatus()).isEqualTo(Participant.READY_STATUS);
            assertThat(participant.getMeeting()).isEqualTo(meeting);
            assertThat(participant.getApplication().getStatus())
                    .isEqualTo(ApplicationStatus.SELECTED);
            assertThat(participant.getFan()).isEqualTo(participant.getApplication().getFan());
        });
    }

    /** 서로 다른 팬이 배정돼 참가자 유니크 제약을 위반하지 않는지 검증한다. */
    @SuppressWarnings("unchecked")
    @Test
    void createsParticipantsForDistinctFans() {
        applyCapacity(4);
        stubEligibleApplications(submittedApplications(4));

        applicationDrawService.draw(MEETING_ID, principal);

        ArgumentCaptor<List<Participant>> captor = ArgumentCaptor.forClass(List.class);
        verify(participantRepository).saveAllAndFlush(captor.capture());
        assertThat(captor.getValue()).extracting(participant -> participant.getFan().getId())
                .doesNotHaveDuplicates()
                .hasSize(4);
    }

    /** 참가자를 저장한 뒤 같은 트랜잭션에서 대기열 초기화를 자동 호출하는지 검증한다. */
    @Test
    void initializesQueueAfterCreatingParticipants() {
        stubEligibleApplications(submittedApplications(2));

        applicationDrawService.draw(MEETING_ID, principal);

        verify(participantRepository).saveAllAndFlush(anyList());
        verify(queueInitializationService).initializeAfterDraw(meeting);
    }

    /** 난수를 같은 값으로 고정하면 같은 당첨자와 순번이 나오는지 검증한다. */
    @SuppressWarnings("unchecked")
    @Test
    void reproducesSameDrawResultWithFixedRandom() {
        applyCapacity(3);
        stubEligibleApplications(submittedApplications(6));
        applicationDrawService.draw(MEETING_ID, principal);
        ArgumentCaptor<List<Participant>> first = ArgumentCaptor.forClass(List.class);
        verify(participantRepository).saveAllAndFlush(first.capture());
        List<Long> firstWinners = first.getValue().stream()
                .map(participant -> participant.getApplication().getId())
                .toList();

        participantRepository = mock(ParticipantRepository.class);
        when(participantRepository.saveAllAndFlush(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        applicationDrawService = newService(new Random(RANDOM_SEED));
        stubEligibleApplications(submittedApplications(6));
        applicationDrawService.draw(MEETING_ID, principal);
        ArgumentCaptor<List<Participant>> second = ArgumentCaptor.forClass(List.class);
        verify(participantRepository).saveAllAndFlush(second.capture());
        List<Long> secondWinners = second.getValue().stream()
                .map(participant -> participant.getApplication().getId())
                .toList();

        assertThat(secondWinners).isEqualTo(firstWinners);
    }

    /** 취소한 응모와 비활성 팬의 응모를 추첨 대상에서 제외하는지 검증한다. */
    @SuppressWarnings("unchecked")
    @Test
    void excludesWithdrawnAndInactiveApplicants() {
        applyCapacity(5);
        Application submitted = submittedApplication(100L, activeFan(11L));
        Application withdrawn = submittedApplication(101L, activeFan(12L));
        withdrawn.withdraw(now().minusHours(1));
        Application inactiveFanApplication = submittedApplication(102L, fan(13L, UserStatus.SUSPENDED));
        stubEligibleApplications(List.of(submitted, withdrawn, inactiveFanApplication));

        DrawResultResponse response = applicationDrawService.draw(MEETING_ID, principal);

        assertThat(response.selectedCount()).isEqualTo(1L);
        assertThat(response.notSelectedCount()).isZero();
        assertThat(withdrawn.getStatus()).isEqualTo(ApplicationStatus.WITHDRAWN);
        assertThat(inactiveFanApplication.getStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        ArgumentCaptor<List<Participant>> captor = ArgumentCaptor.forClass(List.class);
        verify(participantRepository).saveAllAndFlush(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue().get(0).getApplication()).isEqualTo(submitted);
    }

    /** 유효 응모가 하나도 없으면 추첨을 거부하는지 검증한다. */
    @Test
    void rejectsDrawWithoutAnyApplication() {
        stubEligibleApplications(List.of());

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED));

        verify(participantRepository, never()).saveAllAndFlush(anyList());
        verify(queueInitializationService, never()).initializeAfterDraw(any(FanMeeting.class));
    }

    /** 모집 정원이 0명이면 추첨을 거부하는지 검증한다. */
    @Test
    void rejectsDrawWithZeroCapacity() {
        applyCapacity(0);
        stubEligibleApplications(submittedApplications(3));

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED));

        verify(participantRepository, never()).saveAllAndFlush(anyList());
        verify(queueInitializationService, never()).initializeAfterDraw(any(FanMeeting.class));
    }

    /** 응모 설정이 없으면 추첨을 거부하는지 검증한다. */
    @Test
    void rejectsDrawWithoutApplicationSetting() {
        when(applicationSettingRepository.findById(MEETING_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_SETTING_NOT_FOUND));
    }

    /** 이미 참가자가 있는 팬미팅의 재추첨을 거부하는지 검증한다. */
    @Test
    void rejectsRedrawWhenParticipantsExist() {
        when(participantRepository.countByMeeting_Id(MEETING_ID)).thenReturn(2L);

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_DRAW_ALREADY_COMPLETED));

        verify(participantRepository, never()).saveAllAndFlush(anyList());
        verify(queueInitializationService, never()).initializeAfterDraw(any(FanMeeting.class));
    }

    /** 결과가 확정된 응모가 있으면 재추첨을 거부하는지 검증한다. */
    @Test
    void rejectsRedrawWhenResultsAlreadyDecided() {
        when(applicationRepository.countByMeeting_IdAndStatus(
                MEETING_ID, ApplicationStatus.SELECTED)).thenReturn(1L);

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_DRAW_ALREADY_COMPLETED));
    }

    /** 이미 대기열이 초기화돼 있으면 추첨이 실패하는지 검증한다. */
    @Test
    void failsDrawWhenQueueAlreadyInitialized() {
        stubEligibleApplications(submittedApplications(2));
        when(queueInitializationService.initializeAfterDraw(meeting))
                .thenThrow(new BusinessException(ErrorCode.QUEUE_ALREADY_INITIALIZED));

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.QUEUE_ALREADY_INITIALIZED));
    }

    /** 응모가 시작되지 않은 팬미팅의 추첨을 거부하는지 검증한다. */
    @Test
    void rejectsDrawBeforeApplicationsOpen() {
        FanMeeting publishedMeeting = FanMeeting.create(
                null, null, user(2L, UserRole.INFLUENCER), "공개만 된 팬미팅",
                null, null, now().plusDays(10)
        );
        ReflectionTestUtils.setField(publishedMeeting, "id", MEETING_ID);
        publishedMeeting.publish(now().minusDays(2));
        when(fanMeetingRepository.findByIdForUpdate(MEETING_ID))
                .thenReturn(Optional.of(publishedMeeting));

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED));
    }

    /** 응모가 마감된 팬미팅에서도 추첨을 허용하는지 검증한다. */
    @Test
    void allowsDrawAfterApplicationsClosed() {
        meeting.closeApplications();
        stubEligibleApplications(submittedApplications(2));

        DrawResultResponse response = applicationDrawService.draw(MEETING_ID, principal);

        assertThat(response.selectedCount()).isEqualTo(2L);
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_CLOSED);
    }

    /** 응모 마감 시각 전에는 접수 중인 팬미팅의 추첨을 거부하는지 검증한다. */
    @Test
    void rejectsDrawBeforeApplicationCloseTime() {
        applySetting(2, now().plusHours(1));
        stubEligibleApplications(submittedApplications(5));

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED));

        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_OPEN);
        verify(participantRepository, never()).saveAllAndFlush(anyList());
        verify(queueInitializationService, never()).initializeAfterDraw(any(FanMeeting.class));
    }

    /** 응모 마감 시각이 없으면 추첨을 거부하는지 검증한다. */
    @Test
    void rejectsDrawWithoutApplicationCloseTime() {
        applySetting(2, null);
        stubEligibleApplications(submittedApplications(3));

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED));

        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_OPEN);
    }

    /** 응모 마감 시각이 지나면 접수 중인 팬미팅을 마감 상태로 전환한 뒤 추첨하는지 검증한다. */
    @Test
    void closesApplicationsBeforeDrawWhenCloseTimePassed() {
        applySetting(2, now().minusMinutes(1));
        stubEligibleApplications(submittedApplications(5));

        DrawResultResponse response = applicationDrawService.draw(MEETING_ID, principal);

        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_CLOSED);
        assertThat(response.selectedCount()).isEqualTo(2L);
        assertThat(response.participantCount()).isEqualTo(2L);
        verify(queueInitializationService).initializeAfterDraw(meeting);
    }

    /** 이미 마감된 팬미팅은 마감 시각이 남아 있어도 추첨을 허용하는지 검증한다. */
    @Test
    void allowsDrawForAlreadyClosedMeetingBeforeCloseTime() {
        applySetting(2, now().plusHours(1));
        meeting.closeApplications();
        stubEligibleApplications(submittedApplications(3));

        DrawResultResponse response = applicationDrawService.draw(MEETING_ID, principal);

        assertThat(response.selectedCount()).isEqualTo(2L);
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_CLOSED);
    }

    /** 추첨을 거부당한 요청이 응모 마감 상태를 남기지 않는지 검증한다. */
    @Test
    void keepsApplicationOpenWhenDrawRejectedByCapacity() {
        applyCapacity(0);
        stubEligibleApplications(submittedApplications(3));

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOf(BusinessException.class);

        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_OPEN);
    }

    /** 추첨으로 응모가 마감되면 같은 시계 기준에서 신규 응모가 접수되지 않는지 검증한다. */
    @Test
    void blocksNewApplicationAfterDrawClosesApplications() {
        applySetting(2, now().minusMinutes(1));
        stubEligibleApplications(submittedApplications(3));
        applicationDrawService.draw(MEETING_ID, principal);
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_CLOSED);

        CurrentUserService fanUserService = mock(CurrentUserService.class);
        FanMeetingRepository meetingRepository = mock(FanMeetingRepository.class);
        AuthenticatedUser latecomer = new AuthenticatedUser(99L, UserRole.FAN);
        User latecomerFan = activeFan(99L);
        when(fanUserService.requireActiveUser(latecomer)).thenReturn(latecomerFan);
        when(meetingRepository.findById(MEETING_ID)).thenReturn(Optional.of(meeting));
        RequestRateLimiter rateLimiter = mock(RequestRateLimiter.class);
        // 요청 제한기 mock 의 boolean 기본값은 false 라 스텁하지 않으면 응모 기간 검사에 도달하지 못한다.
        when(rateLimiter.tryConsume(anyString(), anyString(), anyInt(), any(Duration.class)))
                .thenReturn(true);
        ApplicationService applicationService = new ApplicationService(
                fanUserService,
                meetingRepository,
                applicationSettingRepository,
                applicationRepository,
                mock(ApplicationFormRepository.class),
                mock(ApplicationQuestionRepository.class),
                mock(ApplicationAnswerRepository.class),
                mock(DeviceTokenService.class),
                rateLimiter,
                Clock.fixed(NOW, SEOUL),
                false,
                DeviceDuplicatePolicy.FLAG,
                5,
                60L
        );

        assertThatThrownBy(() -> applicationService.submit(
                MEETING_ID, new ApplicationSubmitRequest(true, List.of()), latecomer, null
        )).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.APPLICATION_PERIOD_CLOSED));
    }

    /** 삭제된 팬미팅의 추첨 요청을 404로 거부하는지 검증한다. */
    @Test
    void rejectsDrawForDeletedMeeting() {
        ReflectionTestUtils.setField(meeting, "deletedAt", now().minusDays(1));

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 존재하지 않는 팬미팅의 추첨 요청을 404로 거부하는지 검증한다. */
    @Test
    void rejectsDrawForMissingMeeting() {
        when(fanMeetingRepository.findByIdForUpdate(MEETING_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 운영 권한이 없는 사용자의 추첨 요청을 거부하는지 검증한다. */
    @Test
    void rejectsDrawByNonOperator() {
        when(meetingAccessService.requireOperator(MEETING_ID, operator))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> applicationDrawService.draw(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));

        verify(fanMeetingRepository, never()).findByIdForUpdate(MEETING_ID);
    }

    /** 결과 공개 시 당첨·미당첨 응모자 모두에게 결과 알림을 생성하는지 검증한다. */
    @SuppressWarnings("unchecked")
    @Test
    void publishesResultsWithNotificationsForEveryDecidedApplicant() {
        Application selected = submittedApplication(200L, activeFan(21L));
        Application notSelected = submittedApplication(201L, activeFan(22L));
        selected.select(now());
        notSelected.reject(now());
        meeting.closeApplications();
        stubEligibleApplications(List.of(selected, notSelected));
        when(notificationRepository.saveAll(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ResultPublishResponse response =
                applicationDrawService.publishResults(MEETING_ID, principal);

        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.READY);
        assertThat(response.publishedAt()).isEqualTo(now());
        assertThat(response.notificationCount()).isEqualTo(2L);
        assertThat(response.resultStatus()).isEqualTo(ResultPublishResponse.PUBLISHED);
        ArgumentCaptor<List<Notification>> captor = ArgumentCaptor.forClass(List.class);
        verify(notificationRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(2);
        assertThat(captor.getValue()).allSatisfy(notification -> {
            assertThat(notification.getType()).isEqualTo(NotificationType.APPLICATION_RESULT);
            assertThat(notification.getMeeting()).isEqualTo(meeting);
            assertThat(notification.getTitle()).isEqualTo("응모 결과 안내");
            assertThat(notification.getReadAt()).isNull();
        });
        assertThat(captor.getValue()).extracting(Notification::getMessage)
                .containsExactly(
                        meeting.getTitle() + " 팬미팅 응모에 당첨되었습니다.",
                        meeting.getTitle() + " 팬미팅 응모에 당첨되지 않았습니다."
                );
    }

    /** 추첨과 결과 공개를 이어서 실행하면 팬미팅이 시작 대기 상태까지 전환되는지 검증한다. */
    @Test
    void movesMeetingToReadyAfterDrawAndPublish() {
        applySetting(2, now().minusMinutes(1));
        stubEligibleApplications(submittedApplications(3));
        applicationDrawService.draw(MEETING_ID, principal);
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_CLOSED);
        when(notificationRepository.saveAll(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ResultPublishResponse response =
                applicationDrawService.publishResults(MEETING_ID, principal);

        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.READY);
        assertThat(response.notificationCount()).isEqualTo(3L);
        assertThat(response.resultStatus()).isEqualTo(ResultPublishResponse.PUBLISHED);
    }

    /** 응모 마감 상태가 아니면 결과 공개를 거부하고 시작 대기 상태로 바꾸지 않는지 검증한다. */
    @Test
    void keepsMeetingStatusWhenReadyTransitionFails() {
        Application selected = submittedApplication(210L, activeFan(31L));
        selected.select(now());
        stubEligibleApplications(List.of(selected));
        when(notificationRepository.saveAll(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assertThatThrownBy(() -> applicationDrawService.publishResults(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_STATE_CONFLICT));

        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_OPEN);
    }

    /** 중복 결과 공개를 거부하고 시작 대기 상태 전환도 하지 않는지 검증한다. */
    @Test
    void keepsReadyStatusUnchangedOnDuplicatePublish() {
        meeting.closeApplications();
        when(notificationRepository.existsByMeeting_IdAndType(
                MEETING_ID, NotificationType.APPLICATION_RESULT)).thenReturn(true);

        assertThatThrownBy(() -> applicationDrawService.publishResults(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_RESULT_ALREADY_PUBLISHED));

        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.APPLICATION_CLOSED);
        verify(notificationRepository, never()).saveAll(anyList());
    }

    /** 접수 상태만 남은 팬미팅의 결과 공개를 거부하는지 검증한다. */
    @Test
    void rejectsPublishBeforeDraw() {
        stubEligibleApplications(submittedApplications(2));

        assertThatThrownBy(() -> applicationDrawService.publishResults(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_DRAW_NOT_ALLOWED));

        verify(notificationRepository, never()).saveAll(anyList());
    }

    /** 이미 결과를 공개한 팬미팅의 중복 공개를 거부하는지 검증한다. */
    @Test
    void rejectsDuplicatePublish() {
        when(notificationRepository.existsByMeeting_IdAndType(
                MEETING_ID, NotificationType.APPLICATION_RESULT)).thenReturn(true);

        assertThatThrownBy(() -> applicationDrawService.publishResults(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.APPLICATION_RESULT_ALREADY_PUBLISHED));

        verify(notificationRepository, never()).saveAll(anyList());
    }

    /** 운영 권한이 없는 사용자의 결과 공개 요청을 거부하는지 검증한다. */
    @Test
    void rejectsPublishByNonOperator() {
        when(meetingAccessService.requireOperator(MEETING_ID, operator))
                .thenThrow(new BusinessException(ErrorCode.ACCESS_DENIED));

        assertThatThrownBy(() -> applicationDrawService.publishResults(MEETING_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));

        verify(notificationRepository, never()).saveAll(anyList());
    }

    /**
     * 지정한 난수 생성기로 추첨 서비스를 새로 만든다.
     *
     * @param random 당첨자 순서를 섞을 난수 생성기
     * @return 고정 시각과 지정 난수를 사용하는 추첨 서비스
     */
    private ApplicationDrawService newService(Random random) {
        return new ApplicationDrawService(
                currentUserService,
                meetingAccessService,
                fanMeetingRepository,
                applicationSettingRepository,
                applicationRepository,
                participantRepository,
                notificationRepository,
                queueInitializationService,
                Clock.fixed(NOW, SEOUL),
                random
        );
    }

    /**
     * 응모 마감 시각이 지난 상태로 모집 정원을 지정한 응모 설정을 저장소 대역에 등록한다.
     *
     * @param capacity 모집 정원
     */
    private void applyCapacity(int capacity) {
        applySetting(capacity, now().minusHours(1));
    }

    /**
     * 모집 정원과 응모 마감 시각을 지정한 응모 설정을 저장소 대역에 등록한다.
     *
     * @param capacity 모집 정원
     * @param applicationCloseAt 응모 마감 시각이며 null이면 마감 시각을 비운다
     */
    private void applySetting(int capacity, LocalDateTime applicationCloseAt) {
        when(applicationSettingRepository.findById(MEETING_ID)).thenReturn(Optional.of(
                MeetingApplicationSetting.create(
                        meeting, true, now().minusDays(2), applicationCloseAt,
                        now().plusDays(2), capacity
                )
        ));
    }

    /**
     * 취소를 제외한 응모 조회 결과를 저장소 대역에 등록한다.
     *
     * @param applications 조회 결과로 돌려줄 응모 목록
     */
    private void stubEligibleApplications(List<Application> applications) {
        when(applicationRepository.findAllByMeeting_IdAndStatusNot(
                MEETING_ID, ApplicationStatus.WITHDRAWN)).thenReturn(new ArrayList<>(applications));
    }

    /**
     * 서로 다른 활성 팬이 제출한 접수 상태 응모를 생성한다.
     *
     * @param count 생성할 응모 수
     * @return 식별자가 100부터 부여된 접수 상태 응모 목록
     */
    private List<Application> submittedApplications(int count) {
        List<Application> applications = new ArrayList<>(count);
        for (int index = 0; index < count; index++) {
            applications.add(submittedApplication(100L + index, activeFan(11L + index)));
        }
        return applications;
    }

    /**
     * 지정한 식별자와 팬으로 접수 상태 응모를 생성한다.
     *
     * @param id 응모 식별자
     * @param fan 응모한 팬
     * @return 접수 상태 응모
     */
    private Application submittedApplication(Long id, User fan) {
        Application application = Application.submit(meeting, fan, now().minusHours(2));
        ReflectionTestUtils.setField(application, "id", id);
        return application;
    }

    /**
     * 지정한 상태의 응모 수를 센다.
     *
     * @param applications 확인할 응모 목록
     * @param status 집계할 응모 상태
     * @return 해당 상태의 응모 수
     */
    private long countByStatus(List<Application> applications, ApplicationStatus status) {
        return applications.stream().filter(application -> application.getStatus() == status).count();
    }

    /** 응모 접수 중 상태의 테스트 팬미팅을 생성한다. */
    private FanMeeting openMeeting() {
        FanMeeting result = FanMeeting.create(
                null, null, user(2L, UserRole.INFLUENCER), "추첨 테스트 팬미팅",
                null, null, now().plusDays(10)
        );
        ReflectionTestUtils.setField(result, "id", MEETING_ID);
        result.publish(now().minusDays(2));
        result.openApplications();
        return result;
    }

    /**
     * 지정한 식별자를 가진 활성 팬 대역을 생성한다.
     *
     * @param id 팬 사용자 식별자
     * @return 활성 상태의 팬
     */
    private User activeFan(long id) {
        return fan(id, UserStatus.ACTIVE);
    }

    /**
     * 지정한 식별자와 계정 상태를 가진 팬 대역을 생성한다.
     *
     * @param id 팬 사용자 식별자
     * @param status 팬 계정 상태
     * @return 지정 상태의 팬
     */
    private User fan(long id, UserStatus status) {
        User result = user(id, UserRole.FAN);
        when(result.getStatus()).thenReturn(status);
        return result;
    }

    /**
     * 지정한 식별자와 역할을 반환하는 사용자 대역을 생성한다.
     *
     * @param id 사용자 식별자
     * @param role 사용자 역할
     * @return 사용자 테스트 대역
     */
    private User user(Long id, UserRole role) {
        User result = mock(User.class);
        when(result.getId()).thenReturn(id);
        when(result.getRole()).thenReturn(role);
        return result;
    }

    /** 고정 Clock이 제공하는 서울 기준 현재 시각을 반환한다. */
    private LocalDateTime now() {
        return LocalDateTime.ofInstant(NOW, SEOUL);
    }
}
