package com.ssafy.backend.call.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallEndReason;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.dto.CallSessionEndResponse;
import com.ssafy.backend.call.dto.CallSessionStatusResponse;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.user.domain.PreferredLanguage;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CallSessionServiceTest {

    private static final Long CALL_SESSION_ID = 100L;
    private static final Long MEETING_ID = 7L;
    private static final Long QUEUE_ENTRY_ID = 20L;
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant FIXED_INSTANT = Instant.parse("2026-07-28T02:00:00Z");

    private CallSessionRepository callSessionRepository;
    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private CallSessionFinalizer finalizer;
    private CallSessionService service;

    /** 통화 상태 서비스의 모든 외부 의존성을 mock으로 구성한다. */
    @BeforeEach
    void setUp() {
        callSessionRepository = mock(CallSessionRepository.class);
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        finalizer = mock(CallSessionFinalizer.class);
        service = new CallSessionService(
                callSessionRepository,
                currentUserService,
                meetingAccessService,
                finalizer,
                Clock.fixed(FIXED_INSTANT, SEOUL)
        );
    }

    /** 통화 대상 팬에게 서버 시각과 남은 통화 시간을 반환하는지 검증한다. */
    @Test
    void returnsServerBasedStatusToCallFan() {
        User fan = user(11L, UserRole.FAN);
        Participant participant = mock(Participant.class);
        QueueEntry queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        CallSession callSession = mock(CallSession.class);
        LocalDateTime serverNow = LocalDateTime.ofInstant(FIXED_INSTANT, SEOUL);
        when(currentUserService.requireActiveUser(new AuthenticatedUser(11L, UserRole.FAN)))
                .thenReturn(fan);
        when(callSessionRepository.findAccessContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getId()).thenReturn(CALL_SESSION_ID);
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.ACTIVE);
        when(callSession.getEndsAt()).thenReturn(serverNow.plusSeconds(45));
        when(queueEntry.getParticipant()).thenReturn(participant);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(participant.getFan()).thenReturn(fan);

        CallSessionStatusResponse response = service.getStatus(
                CALL_SESSION_ID, new AuthenticatedUser(11L, UserRole.FAN));

        assertThat(response.serverNow()).isEqualTo(serverNow);
        assertThat(response.remainingSec()).isEqualTo(45);
        assertThat(response.status()).isEqualTo(CallSessionStatus.ACTIVE);
    }

    /** 통화 화면이 자막 초기 표시를 판단할 수 있도록 양쪽 통화 언어를 함께 반환하는지 검증한다. */
    @Test
    void returnsBothCallLanguages() {
        User fan = user(11L, UserRole.FAN);
        User influencer = user(20L, UserRole.INFLUENCER);
        Participant participant = mock(Participant.class);
        QueueEntry queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        CallSession callSession = mock(CallSession.class);
        when(currentUserService.requireActiveUser(new AuthenticatedUser(11L, UserRole.FAN)))
                .thenReturn(fan);
        when(callSessionRepository.findAccessContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getFanLanguage()).thenReturn("ko");
        when(queueEntry.getParticipant()).thenReturn(participant);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(participant.getFan()).thenReturn(fan);
        when(meeting.getInfluencer()).thenReturn(influencer);
        when(influencer.getPreferredLanguage()).thenReturn(PreferredLanguage.JAPANESE);

        CallSessionStatusResponse response = service.getStatus(
                CALL_SESSION_ID, new AuthenticatedUser(11L, UserRole.FAN));

        assertThat(response.fanLanguage()).isEqualTo("ko");
        assertThat(response.influencerLanguage()).isEqualTo("ja");
    }

    /** 인플루언서 선호 언어가 비어 있어도 상태 조회를 실패시키지 않는지 검증한다. */
    @Test
    void returnsNullInfluencerLanguageWhenPreferredLanguageMissing() {
        User fan = user(11L, UserRole.FAN);
        User influencer = user(20L, UserRole.INFLUENCER);
        Participant participant = mock(Participant.class);
        QueueEntry queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        CallSession callSession = mock(CallSession.class);
        when(currentUserService.requireActiveUser(new AuthenticatedUser(11L, UserRole.FAN)))
                .thenReturn(fan);
        when(callSessionRepository.findAccessContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getFanLanguage()).thenReturn("en");
        when(queueEntry.getParticipant()).thenReturn(participant);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(participant.getFan()).thenReturn(fan);
        when(meeting.getInfluencer()).thenReturn(influencer);
        when(influencer.getPreferredLanguage()).thenReturn(null);

        CallSessionStatusResponse response = service.getStatus(
                CALL_SESSION_ID, new AuthenticatedUser(11L, UserRole.FAN));

        assertThat(response.fanLanguage()).isEqualTo("en");
        assertThat(response.influencerLanguage()).isNull();
    }

    /** 매니저 강제 종료 시 팬만 퇴장시키고 DB·Redis 대기열 상태를 완료로 맞추는지 검증한다. */
    @Test
    void forceEndsCallAndReleasesCurrentQueueEntry() {
        User manager = user(13L, UserRole.MANAGER);
        QueueEntry queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        CallSession callSession = mock(CallSession.class);
        LocalDateTime endedAt = LocalDateTime.ofInstant(FIXED_INSTANT, SEOUL);
        AuthenticatedUser principal = new AuthenticatedUser(13L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);
        when(callSessionRepository.findEndContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getId()).thenReturn(CALL_SESSION_ID);
        when(callSession.getRoomId()).thenReturn("meeting-room-7");
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.ACTIVE, CallSessionStatus.ENDED);
        when(callSession.getEndedAt()).thenReturn(endedAt);
        when(callSession.getEndReason()).thenReturn(CallEndReason.FORCED);
        when(queueEntry.getId()).thenReturn(QUEUE_ENTRY_ID);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(meeting.getId()).thenReturn(MEETING_ID);
        when(meetingAccessService.requireManager(MEETING_ID, manager)).thenReturn(meeting);

        CallSessionEndResponse response = service.forceEnd(
                CALL_SESSION_ID, "운영상 즉시 종료", principal);

        verify(finalizer).end(callSession, endedAt, CallEndReason.FORCED, manager);
        assertThat(response.status()).isEqualTo(CallSessionStatus.ENDED);
        assertThat(response.endReason()).isEqualTo(CallEndReason.FORCED);
    }

    /** 아직 연결되지 않은 통화를 매니저가 종료하면 노쇼로 마감하는지 검증한다. */
    @Test
    void forceEndsConnectingCallAsNoShow() {
        User manager = user(13L, UserRole.MANAGER);
        QueueEntry queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        CallSession callSession = mock(CallSession.class);
        LocalDateTime endedAt = LocalDateTime.ofInstant(FIXED_INSTANT, SEOUL);
        AuthenticatedUser principal = new AuthenticatedUser(13L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);
        when(callSessionRepository.findEndContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getStatus()).thenReturn(
                CallSessionStatus.CONNECTING, CallSessionStatus.CONNECTING,
                CallSessionStatus.FAILED);
        when(callSession.getEndedAt()).thenReturn(endedAt);
        when(callSession.getEndReason()).thenReturn(CallEndReason.FORCED);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(meeting.getId()).thenReturn(MEETING_ID);
        when(meetingAccessService.requireManager(MEETING_ID, manager)).thenReturn(meeting);

        CallSessionEndResponse response = service.forceEnd(
                CALL_SESSION_ID, "응답 없어 종료", principal);

        verify(finalizer).failConnecting(callSession, endedAt, CallEndReason.FORCED, manager);
        assertThat(response.status()).isEqualTo(CallSessionStatus.FAILED);
        assertThat(response.endReason()).isEqualTo(CallEndReason.FORCED);
    }

    /** 이미 종료된 통화의 강제 종료 요청을 상태 충돌로 거절하는지 검증한다. */
    @Test
    void rejectsForceEndForAlreadyFinishedCall() {
        User manager = user(13L, UserRole.MANAGER);
        QueueEntry queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        CallSession callSession = mock(CallSession.class);
        AuthenticatedUser principal = new AuthenticatedUser(13L, UserRole.MANAGER);
        when(currentUserService.requireActiveUser(principal)).thenReturn(manager);
        when(callSessionRepository.findEndContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.ENDED);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(meeting.getId()).thenReturn(MEETING_ID);
        when(meetingAccessService.requireManager(MEETING_ID, manager)).thenReturn(meeting);

        assertThatThrownBy(() -> service.forceEnd(CALL_SESSION_ID, "종료", principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.CALL_SESSION_STATE_CONFLICT));
        verifyNoInteractions(finalizer);
    }

    /** 통화 중인 팬이 직접 종료하면 정상 종료 사유로 마감하는지 검증한다. */
    @Test
    void endsActiveCallByFanWithNormalReason() {
        User fan = user(11L, UserRole.FAN);
        Participant participant = mock(Participant.class);
        QueueEntry queueEntry = mock(QueueEntry.class);
        CallSession callSession = mock(CallSession.class);
        LocalDateTime endedAt = LocalDateTime.ofInstant(FIXED_INSTANT, SEOUL);
        AuthenticatedUser principal = new AuthenticatedUser(11L, UserRole.FAN);
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);
        when(callSessionRepository.findEndContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.ACTIVE, CallSessionStatus.ENDED);
        when(callSession.getEndedAt()).thenReturn(endedAt);
        when(callSession.getEndReason()).thenReturn(CallEndReason.NORMAL);
        when(queueEntry.getParticipant()).thenReturn(participant);
        when(participant.getFan()).thenReturn(fan);

        CallSessionEndResponse response = service.endByFan(CALL_SESSION_ID, principal);

        verify(finalizer).end(callSession, endedAt, CallEndReason.NORMAL, fan);
        assertThat(response.status()).isEqualTo(CallSessionStatus.ENDED);
        assertThat(response.endReason()).isEqualTo(CallEndReason.NORMAL);
    }

    /** 통화 당사자가 아닌 팬의 종료 요청을 거절하는지 검증한다. */
    @Test
    void rejectsEndRequestFromOtherFan() {
        User otherFan = user(12L, UserRole.FAN);
        User callFan = user(11L, UserRole.FAN);
        Participant participant = mock(Participant.class);
        QueueEntry queueEntry = mock(QueueEntry.class);
        CallSession callSession = mock(CallSession.class);
        AuthenticatedUser principal = new AuthenticatedUser(12L, UserRole.FAN);
        when(currentUserService.requireActiveUser(principal)).thenReturn(otherFan);
        when(callSessionRepository.findEndContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(queueEntry.getParticipant()).thenReturn(participant);
        when(participant.getFan()).thenReturn(callFan);

        assertThatThrownBy(() -> service.endByFan(CALL_SESSION_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCESS_DENIED));
        verifyNoInteractions(finalizer);
    }

    /** 아직 연결되지 않은 통화에 대한 팬의 종료 요청을 상태 충돌로 거절하는지 검증한다. */
    @Test
    void rejectsFanEndRequestForConnectingCall() {
        User fan = user(11L, UserRole.FAN);
        Participant participant = mock(Participant.class);
        QueueEntry queueEntry = mock(QueueEntry.class);
        CallSession callSession = mock(CallSession.class);
        AuthenticatedUser principal = new AuthenticatedUser(11L, UserRole.FAN);
        when(currentUserService.requireActiveUser(principal)).thenReturn(fan);
        when(callSessionRepository.findEndContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.CONNECTING);
        when(queueEntry.getParticipant()).thenReturn(participant);
        when(participant.getFan()).thenReturn(fan);

        assertThatThrownBy(() -> service.endByFan(CALL_SESSION_ID, principal))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.CALL_SESSION_STATE_CONFLICT));
        verifyNoInteractions(finalizer);
    }

    /** 식별자와 역할이 지정된 사용자 mock을 생성한다. */
    private User user(Long id, UserRole role) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        when(user.getRole()).thenReturn(role);
        return user;
    }
}
