package com.ssafy.backend.meeting.service;

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
                mock(NotificationRepository.class),
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
