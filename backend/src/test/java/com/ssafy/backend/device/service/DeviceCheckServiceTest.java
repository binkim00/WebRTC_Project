package com.ssafy.backend.device.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.device.domain.DeviceCheck;
import com.ssafy.backend.device.dto.DeviceCheckRequest;
import com.ssafy.backend.device.dto.DeviceCheckResponse;
import com.ssafy.backend.device.repository.DeviceCheckRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.participant.repository.ParticipantRepository;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.BeanUtils;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class DeviceCheckServiceTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 30, 15, 0);
    private static final AuthenticatedUser FAN_PRINCIPAL = new AuthenticatedUser(30L, UserRole.FAN);
    private static final AuthenticatedUser INFLUENCER_PRINCIPAL =
            new AuthenticatedUser(20L, UserRole.INFLUENCER);

    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private ParticipantRepository participantRepository;
    private DeviceCheckRepository deviceCheckRepository;
    private DeviceCheckService service;
    private User influencer;
    private User fan;
    private FanMeeting meeting;

    /** 각 테스트마다 고정 시계와 협력 객체를 새로 준비한다. */
    @BeforeEach
    void setUp() {
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        participantRepository = mock(ParticipantRepository.class);
        deviceCheckRepository = mock(DeviceCheckRepository.class);
        Clock clock = Clock.fixed(NOW.toInstant(ZoneOffset.UTC), ZoneOffset.UTC);
        service = new DeviceCheckService(currentUserService, meetingAccessService,
                participantRepository, deviceCheckRepository, clock);

        influencer = user(20L, "influencer", UserRole.INFLUENCER);
        fan = user(30L, "fan", UserRole.FAN);
        meeting = meeting(1L, influencer);
        when(meetingAccessService.requireMeeting(1L)).thenReturn(meeting);
        when(deviceCheckRepository.save(any(DeviceCheck.class))).thenAnswer(invocation -> {
            DeviceCheck saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 500L);
            return saved;
        });
    }

    /** 참가 팬의 정상 점검 결과가 경고 없이 저장되는지 검증한다. */
    @Test
    void savesDeviceCheckForParticipantFan() {
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(fan);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 30L))
                .thenReturn(Optional.of(participant(meeting, fan)));

        DeviceCheckResponse response = service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, true, true), FAN_PRINCIPAL);

        assertThat(response).isEqualTo(new DeviceCheckResponse(
                500L, true, true, true, true, false, true, NOW));
        ArgumentCaptor<DeviceCheck> captor = ArgumentCaptor.forClass(DeviceCheck.class);
        verify(deviceCheckRepository).save(captor.capture());
        assertThat(captor.getValue().getMeeting()).isSameAs(meeting);
        assertThat(captor.getValue().getUser()).isSameAs(fan);
        assertThat(captor.getValue().getCheckedAt()).isEqualTo(NOW);
    }

    /** 배정 인플루언서는 참가자가 아니어도 점검 결과를 저장할 수 있는지 검증한다. */
    @Test
    void savesDeviceCheckForAssignedInfluencer() {
        when(currentUserService.requireActiveUser(INFLUENCER_PRINCIPAL)).thenReturn(influencer);

        DeviceCheckResponse response = service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, null, true), INFLUENCER_PRINCIPAL);

        assertThat(response.deviceCheckId()).isEqualTo(500L);
        assertThat(response.canEnter()).isTrue();
        verifyNoInteractions(participantRepository);
    }

    /** 실패한 점검 항목이 있어도 입장은 허용하고 경고만 표시하는지 검증한다. */
    @Test
    void allowsEnterWithWarningWhenCheckFailed() {
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(fan);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 30L))
                .thenReturn(Optional.of(participant(meeting, fan)));

        DeviceCheckResponse response = service.saveDeviceCheck(
                1L, new DeviceCheckRequest(false, true, true, true), FAN_PRINCIPAL);

        assertThat(response.warningRequired()).isTrue();
        assertThat(response.canEnter()).isTrue();
        assertThat(response.cameraOk()).isFalse();
    }

    /** 네트워크 이상도 경고 대상으로 판단하는지 검증한다. */
    @Test
    void marksWarningWhenNetworkFailed() {
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(fan);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 30L))
                .thenReturn(Optional.of(participant(meeting, fan)));

        DeviceCheckResponse response = service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, true, false), FAN_PRINCIPAL);

        assertThat(response.warningRequired()).isTrue();
        assertThat(response.canEnter()).isTrue();
    }

    /** 스피커 점검에 실패하면 경고 대상으로 판단하는지 검증한다. */
    @Test
    void marksWarningWhenSpeakerFailed() {
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(fan);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 30L))
                .thenReturn(Optional.of(participant(meeting, fan)));

        DeviceCheckResponse response = service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, false, true), FAN_PRINCIPAL);

        assertThat(response.warningRequired()).isTrue();
        assertThat(response.speakerOk()).isFalse();
    }

    /** 선택 항목인 스피커를 점검하지 않으면 경고 대상으로 보지 않는지 검증한다. */
    @Test
    void keepsWarningFalseWhenSpeakerNotChecked() {
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(fan);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 30L))
                .thenReturn(Optional.of(participant(meeting, fan)));

        DeviceCheckResponse response = service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, null, true), FAN_PRINCIPAL);

        assertThat(response.warningRequired()).isFalse();
        assertThat(response.speakerOk()).isNull();
    }

    /** 해당 팬미팅과 무관한 사용자의 점검 저장이 거부되는지 검증한다. */
    @Test
    void rejectsUserWithoutParticipation() {
        User otherFan = user(31L, "other", UserRole.FAN);
        AuthenticatedUser otherPrincipal = new AuthenticatedUser(31L, UserRole.FAN);
        when(currentUserService.requireActiveUser(otherPrincipal)).thenReturn(otherFan);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 31L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, true, true), otherPrincipal))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.DEVICE_CHECK_NOT_ALLOWED);
        verifyNoInteractions(deviceCheckRepository);
    }

    /** 다른 팬미팅에 배정된 인플루언서의 점검 저장이 거부되는지 검증한다. */
    @Test
    void rejectsInfluencerOfAnotherMeeting() {
        User otherInfluencer = user(21L, "other-influencer", UserRole.INFLUENCER);
        AuthenticatedUser otherPrincipal = new AuthenticatedUser(21L, UserRole.INFLUENCER);
        when(currentUserService.requireActiveUser(otherPrincipal)).thenReturn(otherInfluencer);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 21L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, true, true), otherPrincipal))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.DEVICE_CHECK_NOT_ALLOWED);
    }

    /** 종료된 팬미팅에서는 참가 팬의 점검 저장도 거부되는지 검증한다. */
    @Test
    void rejectsClosedMeetingForParticipantFan() {
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(fan);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 30L))
                .thenReturn(Optional.of(participant(meeting, fan)));
        doThrow(new BusinessException(ErrorCode.FAN_MEETING_CLOSED))
                .when(meetingAccessService).requireJoinable(meeting);

        assertThatThrownBy(() -> service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, true, true), FAN_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FAN_MEETING_CLOSED);
        verifyNoInteractions(deviceCheckRepository);
    }

    /** 종료된 팬미팅에서는 배정 인플루언서의 점검 저장도 거부되는지 검증한다. */
    @Test
    void rejectsClosedMeetingForAssignedInfluencer() {
        when(currentUserService.requireActiveUser(INFLUENCER_PRINCIPAL)).thenReturn(influencer);
        doThrow(new BusinessException(ErrorCode.FAN_MEETING_CLOSED))
                .when(meetingAccessService).requireJoinable(meeting);

        assertThatThrownBy(() -> service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, true, true), INFLUENCER_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FAN_MEETING_CLOSED);
        verifyNoInteractions(deviceCheckRepository);
    }

    /** 진행 중인 팬미팅은 종료 검증을 통과해 그대로 저장되는지 검증한다. */
    @Test
    void checksMeetingClosedStateBeforeSaving() {
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(fan);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 30L))
                .thenReturn(Optional.of(participant(meeting, fan)));

        service.saveDeviceCheck(1L, new DeviceCheckRequest(true, true, true, true), FAN_PRINCIPAL);

        verify(meetingAccessService).requireJoinable(meeting);
    }

    /** 무관한 사용자에게는 종료 여부 대신 기존 권한 오류만 알리는지 검증한다. */
    @Test
    void keepsPermissionErrorBeforeClosedCheck() {
        User otherFan = user(31L, "other", UserRole.FAN);
        AuthenticatedUser otherPrincipal = new AuthenticatedUser(31L, UserRole.FAN);
        when(currentUserService.requireActiveUser(otherPrincipal)).thenReturn(otherFan);
        when(participantRepository.findByMeeting_IdAndFan_Id(1L, 31L)).thenReturn(Optional.empty());
        doThrow(new BusinessException(ErrorCode.FAN_MEETING_CLOSED))
                .when(meetingAccessService).requireJoinable(meeting);

        assertThatThrownBy(() -> service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, true, true), otherPrincipal))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.DEVICE_CHECK_NOT_ALLOWED);
    }

    /** 존재하지 않는 팬미팅의 점검 저장이 거부되는지 검증한다. */
    @Test
    void rejectsMissingMeeting() {
        when(currentUserService.requireActiveUser(FAN_PRINCIPAL)).thenReturn(fan);
        when(meetingAccessService.requireMeeting(999L))
                .thenThrow(new BusinessException(ErrorCode.FAN_MEETING_NOT_FOUND));

        assertThatThrownBy(() -> service.saveDeviceCheck(
                999L, new DeviceCheckRequest(true, true, true, true), FAN_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FAN_MEETING_NOT_FOUND);
        verifyNoInteractions(deviceCheckRepository);
    }

    /** 필수 점검 항목이 비어 있으면 잘못된 요청으로 거부되는지 검증한다. */
    @Test
    void rejectsRequestWithMissingRequiredFlags() {
        assertThatThrownBy(() -> service.saveDeviceCheck(
                1L, new DeviceCheckRequest(null, true, true, true), FAN_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThatThrownBy(() -> service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, null, true, true), FAN_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        assertThatThrownBy(() -> service.saveDeviceCheck(
                1L, new DeviceCheckRequest(true, true, true, null), FAN_PRINCIPAL))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REQUEST);
        verifyNoInteractions(deviceCheckRepository);
    }

    /** 테스트에 사용할 활성 사용자를 만든다. */
    private User user(Long id, String loginId, UserRole role) {
        User user = User.createActive(loginId, loginId + "@melly.test", "encoded", loginId,
                role, PreferredLanguage.KOREAN);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    /** 테스트에 사용할 팬미팅을 만든다. */
    private FanMeeting meeting(Long id, User influencer) {
        FanMeeting meeting = BeanUtils.instantiateClass(FanMeeting.class);
        ReflectionTestUtils.setField(meeting, "id", id);
        ReflectionTestUtils.setField(meeting, "influencer", influencer);
        return meeting;
    }

    /** 테스트에 사용할 참가자를 만든다. */
    private Participant participant(FanMeeting meeting, User fan) {
        Participant participant = BeanUtils.instantiateClass(Participant.class);
        ReflectionTestUtils.setField(participant, "id", 100L);
        ReflectionTestUtils.setField(participant, "meeting", meeting);
        ReflectionTestUtils.setField(participant, "fan", fan);
        ReflectionTestUtils.setField(participant, "status", "READY");
        ReflectionTestUtils.setField(participant, "assignedOrder", 1);
        return participant;
    }
}
