package com.ssafy.backend.meeting.service;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import com.ssafy.backend.application.repository.ApplicationRepository;
import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.livekit.service.LiveKitRoomParticipantService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.dto.FanMeetingManagementResponse;
import com.ssafy.backend.meeting.dto.FanMeetingUpdateRequest;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.notification.domain.Notification;
import com.ssafy.backend.notification.domain.NotificationType;
import com.ssafy.backend.notification.repository.NotificationRepository;
import com.ssafy.backend.organization.repository.OrganizationMemberRepository;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.queue.repository.QueueEntryRepository;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FanMeetingManagementServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant NOW = Instant.parse("2026-07-30T00:00:00Z");

    private CurrentUserService currentUserService;
    private FanMeetingRepository fanMeetingRepository;
    private MeetingApplicationSettingRepository applicationSettingRepository;
    private MeetingOperationSettingRepository operationSettingRepository;
    private ApplicationRepository applicationRepository;
    private ParticipantRepository participantRepository;
    private QueueEntryRepository queueEntryRepository;
    private CallSessionRepository callSessionRepository;
    private NotificationRepository notificationRepository;
    private LiveKitRoomParticipantService roomParticipantService;
    private QueueRealtimeStore realtimeStore;
    private FanMeetingManagementService service;

    /** 각 테스트에서 사용할 관리 서비스와 모든 협력 객체를 구성한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        fanMeetingRepository = mock(FanMeetingRepository.class);
        applicationSettingRepository = mock(MeetingApplicationSettingRepository.class);
        operationSettingRepository = mock(MeetingOperationSettingRepository.class);
        applicationRepository = mock(ApplicationRepository.class);
        participantRepository = mock(ParticipantRepository.class);
        queueEntryRepository = mock(QueueEntryRepository.class);
        callSessionRepository = mock(CallSessionRepository.class);
        notificationRepository = mock(NotificationRepository.class);
        roomParticipantService = mock(LiveKitRoomParticipantService.class);
        realtimeStore = mock(QueueRealtimeStore.class);
        service = new FanMeetingManagementService(
                currentUserService,
                fanMeetingRepository,
                applicationSettingRepository,
                operationSettingRepository,
                mock(UserRepository.class),
                mock(OrganizationMemberRepository.class),
                applicationRepository,
                participantRepository,
                queueEntryRepository,
                callSessionRepository,
                notificationRepository,
                roomParticipantService,
                realtimeStore,
                Clock.fixed(NOW, SEOUL)
        );
    }

    /** 공개 후 응모 시작 전 팬미팅의 기본 정보를 정상적으로 수정하는지 검증한다. */
    @Test
    void updatesPublishedMeetingBeforeApplicationsOpen() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = publishedMeeting(solo);
        MeetingApplicationSetting application = applicationSetting(meeting);
        MeetingOperationSetting operation = operationSetting(meeting);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        FanMeetingUpdateRequest request = new FanMeetingUpdateRequest(
                null, "수정된 팬미팅", null, null, null, null, null
        );

        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.of(application));
        when(operationSettingRepository.findById(1L)).thenReturn(Optional.of(operation));

        FanMeetingManagementResponse response = service.update(1L, principal, request);

        assertThat(response.status()).isEqualTo(FanMeetingStatus.PUBLISHED);
        assertThat(response.title()).isEqualTo("수정된 팬미팅");
        verify(fanMeetingRepository).flush();
    }

    /** 응모 시작 후에도 팬미팅 시작 전이면 신규 운영 정책 세 가지를 수정할 수 있는지 검증한다. */
    @Test
    void updatesOperationPoliciesAfterApplicationsOpen() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = publishedMeeting(solo);
        meeting.openApplications();
        MeetingApplicationSetting application = applicationSetting(meeting);
        MeetingOperationSetting operation = operationSetting(meeting);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        FanMeetingUpdateRequest request = new FanMeetingUpdateRequest(
                null, null, null, null, null, null,
                new FanMeetingUpdateRequest.OperationSettingPatch(
                        null, null, null, null, 90, 15, 2
                )
        );

        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.of(application));
        when(operationSettingRepository.findById(1L)).thenReturn(Optional.of(operation));

        FanMeetingManagementResponse response = service.update(1L, principal, request);

        assertThat(response.operation().reconnectGraceSec()).isEqualTo(90);
        assertThat(response.operation().earlyStartMinutes()).isEqualTo(15);
        assertThat(response.operation().maxRecallCount()).isEqualTo(2);
        assertThat(operation.getReconnectGraceSec()).isEqualTo(90);
        assertThat(operation.getEarlyStartMinutes()).isEqualTo(15);
        assertThat(operation.getMaxRecallCount()).isEqualTo(2);
    }

    /** 응모 시작 후에는 신규 운영 정책 외 기본 정보 변경을 거부하는지 검증한다. */
    @Test
    void rejectsBasicInformationUpdateAfterApplicationsOpen() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = publishedMeeting(solo);
        meeting.openApplications();
        MeetingApplicationSetting application = applicationSetting(meeting);
        MeetingOperationSetting operation = operationSetting(meeting);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        FanMeetingUpdateRequest request = new FanMeetingUpdateRequest(
                null, "수정 불가", null, null, null, null, null
        );

        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.of(application));
        when(operationSettingRepository.findById(1L)).thenReturn(Optional.of(operation));

        assertThatThrownBy(() -> service.update(1L, principal, request))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_STATE_CONFLICT));
    }

    /** 1인 인플루언서가 자신의 초안 팬미팅을 공개하고 공개 시각이 기록되는지 검증한다. */
    @Test
    void publishesDraftMeetingBySoloInfluencer() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = draftMeeting(null, solo);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        stubMeetingWithSettings(meeting);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);

        FanMeetingManagementResponse response = service.publish(1L, principal);

        assertThat(response.status()).isEqualTo(FanMeetingStatus.PUBLISHED);
        assertThat(response.publishedAt()).isEqualTo(now());
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
        assertThat(meeting.getPublishedAt()).isEqualTo(now());
    }

    /** 담당 매니저가 조직 소속 인플루언서의 초안 팬미팅을 공개할 수 있는지 검증한다. */
    @Test
    void publishesDraftMeetingByOwningManager() {
        User manager = user(30L, UserRole.MANAGER);
        FanMeeting meeting = draftMeeting(manager, user(10L, UserRole.INFLUENCER));
        AuthenticatedUser principal = new AuthenticatedUser(30L, UserRole.MANAGER);
        stubMeetingWithSettings(meeting);
        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);

        FanMeetingManagementResponse response = service.publish(1L, principal);

        assertThat(response.status()).isEqualTo(FanMeetingStatus.PUBLISHED);
        assertThat(response.meetingId()).isEqualTo(1L);
    }

    /** 이미 공개된 팬미팅의 재공개 요청을 상태 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsPublishWhenMeetingIsNotDraft() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = publishedMeeting(solo);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.publish(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_STATE_CONFLICT));
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 담당자가 아닌 매니저의 공개 요청을 권한 오류로 거부하는지 검증한다. */
    @Test
    void rejectsPublishFromNonOwningManager() {
        User owner = user(30L, UserRole.MANAGER);
        User other = user(99L, UserRole.MANAGER);
        FanMeeting meeting = draftMeeting(owner, user(10L, UserRole.INFLUENCER));
        AuthenticatedUser principal = new AuthenticatedUser(99L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(other);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.publish(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.DRAFT);
    }

    /** 존재하지 않는 팬미팅의 공개 요청을 조회 실패로 거부하는지 검증한다. */
    @Test
    void rejectsPublishForMissingMeeting() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.publish(404L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 이미 논리 삭제된 팬미팅의 공개 요청을 조회 실패로 거부하는지 검증한다. */
    @Test
    void rejectsPublishForDeletedMeeting() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = draftMeeting(null, solo);
        meeting.deleteDraft(now().minusHours(1));
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.publish(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 초안 팬미팅 삭제 요청이 상태를 유지하면서 삭제 시각만 기록하는지 검증한다. */
    @Test
    void deletesDraftMeeting() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = draftMeeting(null, solo);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        stubMeetingWithSettings(meeting);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);

        FanMeetingManagementResponse response = service.deleteDraft(1L, principal);

        assertThat(response.deletedAt()).isEqualTo(now());
        assertThat(response.status()).isEqualTo(FanMeetingStatus.DRAFT);
        assertThat(meeting.getDeletedAt()).isEqualTo(now());
    }

    /** 공개된 팬미팅의 삭제 요청을 상태 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsDeleteWhenMeetingIsPublished() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = publishedMeeting(solo);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.deleteDraft(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_STATE_CONFLICT));
        assertThat(meeting.getDeletedAt()).isNull();
    }

    /** 담당자가 아닌 사용자의 삭제 요청을 권한 오류로 거부하는지 검증한다. */
    @Test
    void rejectsDeleteFromNonOwner() {
        User manager = user(30L, UserRole.MANAGER);
        User influencer = user(10L, UserRole.INFLUENCER);
        FanMeeting meeting = draftMeeting(manager, influencer);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.deleteDraft(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));
        assertThat(meeting.getDeletedAt()).isNull();
    }

    /** 존재하지 않는 팬미팅의 삭제 요청을 조회 실패로 거부하는지 검증한다. */
    @Test
    void rejectsDeleteForMissingMeeting() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.deleteDraft(404L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 이미 삭제된 초안 팬미팅의 재삭제 요청을 조회 실패로 거부하는지 검증한다. */
    @Test
    void rejectsDeleteForAlreadyDeletedMeeting() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = draftMeeting(null, solo);
        meeting.deleteDraft(now().minusHours(1));
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.deleteDraft(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
        assertThat(meeting.getDeletedAt()).isEqualTo(now().minusHours(1));
    }

    /** 공개된 팬미팅 취소가 상태를 전환하고 유효 응모자에게 취소 알림을 저장하는지 검증한다. */
    @Test
    void cancelsPublishedMeetingAndNotifiesApplicants() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = publishedMeeting(solo);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        User fan = user(20L, UserRole.FAN);
        Application application = mock(Application.class);
        when(application.getFan()).thenReturn(fan);
        stubMeetingWithSettings(meeting);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(applicationRepository.findAllByMeeting_IdAndStatusNot(1L, ApplicationStatus.WITHDRAWN))
                .thenReturn(List.of(application));

        FanMeetingManagementResponse response = service.cancel(1L, principal);

        assertThat(response.status()).isEqualTo(FanMeetingStatus.CANCELED);
        assertThat(response.canceledAt()).isEqualTo(now());
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.CANCELED);

        ArgumentCaptor<List<Notification>> captor = ArgumentCaptor.forClass(List.class);
        verify(notificationRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue().get(0).getType())
                .isEqualTo(NotificationType.MEETING_CANCELED);
        assertThat(captor.getValue().get(0).getUser()).isSameAs(fan);
    }

    /** 응모가 마감된 팬미팅도 진행 전이면 취소할 수 있는지 검증한다. */
    @Test
    void cancelsApplicationClosedMeeting() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = publishedMeeting(solo);
        meeting.openApplications();
        meeting.closeApplications();
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        stubMeetingWithSettings(meeting);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(applicationRepository.findAllByMeeting_IdAndStatusNot(1L, ApplicationStatus.WITHDRAWN))
                .thenReturn(List.of());

        FanMeetingManagementResponse response = service.cancel(1L, principal);

        assertThat(response.status()).isEqualTo(FanMeetingStatus.CANCELED);
        verify(notificationRepository).saveAll(List.of());
    }

    /** 아직 공개하지 않은 초안 팬미팅의 취소 요청을 상태 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsCancelForDraftMeeting() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = draftMeeting(null, solo);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.cancel(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_STATE_CONFLICT));
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.DRAFT);
        verify(notificationRepository, never()).saveAll(anyList());
    }

    /** 이미 종료된 팬미팅의 취소 요청을 상태 충돌로 거부하는지 검증한다. */
    @Test
    void rejectsCancelForEndedMeeting() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = publishedMeeting(solo);
        meeting.openApplications();
        meeting.closeApplications();
        meeting.markReady();
        meeting.start(now().minusHours(2));
        meeting.end(now().minusHours(1));
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.cancel(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_STATE_CONFLICT));
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.ENDED);
    }

    /** 담당자가 아닌 사용자의 취소 요청을 권한 오류로 거부하는지 검증한다. */
    @Test
    void rejectsCancelFromNonOwner() {
        User manager = user(30L, UserRole.MANAGER);
        User influencer = user(10L, UserRole.INFLUENCER);
        FanMeeting meeting = FanMeeting.create(
                null, manager, influencer, "팬미팅", null, null, now().plusDays(10)
        );
        ReflectionTestUtils.setField(meeting, "id", 1L);
        meeting.publish(now().minusDays(1));
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(influencer);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.cancel(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));
        assertThat(meeting.getStatus()).isEqualTo(FanMeetingStatus.PUBLISHED);
    }

    /** 존재하지 않는 팬미팅의 취소 요청을 조회 실패로 거부하는지 검증한다. */
    @Test
    void rejectsCancelForMissingMeeting() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.cancel(404L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND));
    }

    /** 설정한 조기 시작 허용시간보다 이른 시작 요청을 거부하는지 검증한다. */
    @Test
    void rejectsStartBeforeConfiguredEarlyStartWindow() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        LocalDateTime now = LocalDateTime.now(Clock.fixed(NOW, SEOUL));
        FanMeeting meeting = FanMeeting.create(
                null, null, solo, "팬미팅", null, null, now.plusMinutes(20)
        );
        ReflectionTestUtils.setField(meeting, "id", 1L);
        meeting.publish(now.minusDays(1));
        meeting.openApplications();
        meeting.closeApplications();
        meeting.markReady();
        MeetingOperationSetting operation = MeetingOperationSetting.create(
                meeting, now.minusMinutes(1), 120, true, true, 60, 10, 1
        );
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);

        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(operationSettingRepository.findById(1L)).thenReturn(Optional.of(operation));

        assertThatThrownBy(() -> service.start(1L, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.FAN_MEETING_START_NOT_ALLOWED));
    }

    /** 팬미팅 종료 시 활성 통화와 대기열, LiveKit Room, Redis 상태를 함께 정리하는지 검증한다. */
    @Test
    void endsMeetingAndClearsRealtimeResources() {
        User solo = user(10L, UserRole.SOLO_INFLUENCER);
        FanMeeting meeting = publishedMeeting(solo);
        meeting.openApplications();
        meeting.closeApplications();
        meeting.markReady();
        meeting.start(LocalDateTime.now(Clock.fixed(NOW, SEOUL)).minusMinutes(1));
        MeetingApplicationSetting application = applicationSetting(meeting);
        MeetingOperationSetting operation = operationSetting(meeting);
        AuthenticatedUser principal = new AuthenticatedUser(10L, UserRole.SOLO_INFLUENCER);
        CallSession session = mock(CallSession.class);
        QueueEntry entry = mock(QueueEntry.class);

        when(currentUserService.requireActiveUser(principal)).thenReturn(solo);
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(applicationSettingRepository.findById(1L)).thenReturn(Optional.of(application));
        when(operationSettingRepository.findById(1L)).thenReturn(Optional.of(operation));
        when(callSessionRepository.findByQueueEntry_Meeting_IdAndStatusIn(
                org.mockito.ArgumentMatchers.eq(1L), anyList()
        )).thenReturn(List.of(session));
        when(session.getStatus()).thenReturn(CallSessionStatus.ACTIVE);
        when(session.getQueueEntry()).thenReturn(entry);
        when(session.getId()).thenReturn(100L);
        when(queueEntryRepository.findAllByMeetingIdForUpdate(1L)).thenReturn(List.of(entry));

        FanMeetingManagementResponse response = service.end(1L, principal);

        assertThat(response.status()).isEqualTo(FanMeetingStatus.ENDED);
        verify(session).end(
                LocalDateTime.now(Clock.fixed(NOW, SEOUL)),
                com.ssafy.backend.call.domain.CallEndReason.FORCED,
                solo
        );
        verify(entry).complete();
        verify(entry).remove();
        verify(roomParticipantService).deleteRoom("meeting-room-1");
        verify(realtimeStore).clearMeeting(1L, "meeting-room-1");
    }

    /** 고정 시계가 가리키는 현재 시각을 반환한다. */
    private LocalDateTime now() {
        return LocalDateTime.now(Clock.fixed(NOW, SEOUL));
    }

    /**
     * 테스트용 초안 팬미팅을 생성하고 영속 식별자를 설정한다.
     *
     * @param manager 담당 매니저이며 1인 인플루언서 팬미팅이면 null
     * @param influencer 팬미팅을 진행할 인플루언서
     * @return 식별자가 1인 초안 팬미팅
     */
    private FanMeeting draftMeeting(User manager, User influencer) {
        FanMeeting meeting = FanMeeting.create(
                null, manager, influencer, "팬미팅", null, null, now().plusDays(10)
        );
        ReflectionTestUtils.setField(meeting, "id", 1L);
        return meeting;
    }

    /** 잠금 조회와 두 운영 설정 조회가 주어진 팬미팅을 반환하도록 대역을 설정한다. */
    private void stubMeetingWithSettings(FanMeeting meeting) {
        when(fanMeetingRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(meeting));
        when(applicationSettingRepository.findById(1L))
                .thenReturn(Optional.of(applicationSetting(meeting)));
        when(operationSettingRepository.findById(1L))
                .thenReturn(Optional.of(operationSetting(meeting)));
    }

    /** 테스트용 공개 팬미팅을 생성하고 영속 식별자를 설정한다. */
    private FanMeeting publishedMeeting(User influencer) {
        FanMeeting meeting = FanMeeting.create(
                null, null, influencer, "팬미팅", null, null,
                LocalDateTime.now(Clock.fixed(NOW, SEOUL)).plusDays(10)
        );
        ReflectionTestUtils.setField(meeting, "id", 1L);
        meeting.publish(LocalDateTime.now(Clock.fixed(NOW, SEOUL)).minusDays(1));
        return meeting;
    }

    /** 테스트 일정에 맞는 응모 설정을 생성한다. */
    private MeetingApplicationSetting applicationSetting(FanMeeting meeting) {
        LocalDateTime now = LocalDateTime.now(Clock.fixed(NOW, SEOUL));
        return MeetingApplicationSetting.create(
                meeting, true, now.plusDays(1), now.plusDays(2), now.plusDays(3), 20
        );
    }

    /** 테스트 일정에 맞는 운영 설정을 생성한다. */
    private MeetingOperationSetting operationSetting(FanMeeting meeting) {
        LocalDateTime now = LocalDateTime.now(Clock.fixed(NOW, SEOUL));
        return MeetingOperationSetting.create(
                meeting, now.plusDays(9), 120, true, true, 60, 30, 1
        );
    }

    /** 식별자와 역할을 가진 테스트 사용자를 생성한다. */
    private User user(Long id, UserRole role) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        when(user.getRole()).thenReturn(role);
        return user;
    }
}
