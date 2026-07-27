package com.ssafy.backend.livekit.service;

import com.ssafy.backend.auth.jwt.AuthenticatedUser;
import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.common.security.CurrentUserService;
import com.ssafy.backend.config.livekit.LiveKitProperties;
import com.ssafy.backend.livekit.dto.LiveKitAccessTokenResponse;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.service.MeetingAccessService;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LiveKitAccessTokenServiceTest {

    private static final Long CALL_SESSION_ID = 100L;
    private static final Long MEETING_ID = 7L;
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Instant FIXED_INSTANT = Instant.parse("2026-07-27T03:00:00Z");

    private CallSessionRepository callSessionRepository;
    private CurrentUserService currentUserService;
    private MeetingAccessService meetingAccessService;
    private LiveKitAccessTokenService service;
    private CallSession callSession;
    private QueueEntry queueEntry;
    private FanMeeting meeting;
    private User fan;
    private User host;
    private User manager;

    /**
     * 실제 SDK 토큰 생성은 유지하고 도메인 조회만 mock으로 대체한 기본 통화 관계를 구성한다.
     */
    @BeforeEach
    void setUp() {
        LiveKitProperties properties = new LiveKitProperties();
        properties.setUrl("ws://localhost:7880");
        properties.setApiKey("test-api-key");
        properties.setApiSecret("test-api-secret-with-sufficient-length");

        callSessionRepository = mock(CallSessionRepository.class);
        currentUserService = mock(CurrentUserService.class);
        meetingAccessService = mock(MeetingAccessService.class);
        service = new LiveKitAccessTokenService(
                properties,
                callSessionRepository,
                currentUserService,
                meetingAccessService,
                Clock.fixed(FIXED_INSTANT, SEOUL)
        );

        callSession = mock(CallSession.class);
        queueEntry = mock(QueueEntry.class);
        meeting = mock(FanMeeting.class);
        Participant participant = mock(Participant.class);
        fan = user(11L, UserRole.FAN, "팬");
        host = user(12L, UserRole.INFLUENCER, "호스트");
        manager = user(13L, UserRole.MANAGER, "매니저");

        when(callSessionRepository.findAccessContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(callSession.getId()).thenReturn(CALL_SESSION_ID);
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(callSession.getRoomId()).thenReturn("meeting-room-7");
        when(callSession.getFanLanguage()).thenReturn("en");
        when(callSession.getStatus()).thenReturn(CallSessionStatus.CONNECTING);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(queueEntry.getParticipant()).thenReturn(participant);
        when(queueEntry.getStatus()).thenReturn(QueueEntryStatus.CALLED);
        when(participant.getFan()).thenReturn(fan);
        when(meeting.getId()).thenReturn(MEETING_ID);
        when(meeting.getInfluencer()).thenReturn(host);
    }

    /**
     * 호출된 팬에게 익명 identity와 팬 attributes가 포함된 15분 토큰을 발급하는지 검증한다.
     */
    @Test
    void issuesFanTokenForCalledParticipant() {
        when(currentUserService.requireActiveUser(any())).thenReturn(fan);

        LiveKitAccessTokenResponse response = service.issue(
                CALL_SESSION_ID, new AuthenticatedUser(11L, UserRole.FAN));
        String payload = decodePayload(response.accessToken());

        assertThat(response.liveKitUrl()).isEqualTo("ws://localhost:7880");
        assertThat(response.expiresAt())
                .isEqualTo(LocalDateTime.ofInstant(FIXED_INSTANT, SEOUL).plusMinutes(15));
        assertThat(response.reconnectAllowedUntil()).isNull();
        assertThat(payload)
                .contains("\"room\":\"meeting-room-7\"")
                .contains("\"canPublish\":true")
                .contains("\"canSubscribe\":true")
                .contains("\"role\":\"fan\"")
                .contains("\"call_session_id\":\"100\"")
                .contains("\"fan_lang\":\"en\"")
                .contains("\"sub\":\"fan-")
                .doesNotContain("\"sub\":\"11\"");
    }

    /**
     * 해당 팬미팅의 인플루언서에게 발행·구독 가능한 호스트 토큰을 발급하는지 검증한다.
     */
    @Test
    void issuesHostTokenForMeetingInfluencer() {
        when(currentUserService.requireActiveUser(any())).thenReturn(host);

        LiveKitAccessTokenResponse response = service.issue(
                CALL_SESSION_ID, new AuthenticatedUser(12L, UserRole.INFLUENCER));
        String payload = decodePayload(response.accessToken());

        assertThat(response.expiresAt())
                .isEqualTo(LocalDateTime.ofInstant(FIXED_INSTANT, SEOUL).plusMinutes(15));
        assertThat(payload)
                .contains("\"role\":\"host\"")
                .contains("\"sub\":\"host-")
                .contains("\"canPublish\":true")
                .doesNotContain("call_session_id")
                .doesNotContain("fan_lang");
    }

    /**
     * 팬미팅 매니저에게 발행은 금지하고 구독만 허용하는 모니터링 토큰을 발급하는지 검증한다.
     */
    @Test
    void issuesSubscribeOnlyTokenForMeetingManager() {
        when(currentUserService.requireActiveUser(any())).thenReturn(manager);
        when(meetingAccessService.requireManager(MEETING_ID, manager)).thenReturn(meeting);

        LiveKitAccessTokenResponse response = service.issue(
                CALL_SESSION_ID, new AuthenticatedUser(13L, UserRole.MANAGER));
        String payload = decodePayload(response.accessToken());

        verify(meetingAccessService).requireManager(MEETING_ID, manager);
        assertThat(payload)
                .contains("\"role\":\"operator\"")
                .contains("\"canPublish\":false")
                .contains("\"canSubscribe\":true");
    }

    /**
     * 통화 대상이 아닌 다른 팬의 LiveKit 입장을 거부하는지 검증한다.
     */
    @Test
    void rejectsFanWhoIsNotCallParticipant() {
        User otherFan = user(99L, UserRole.FAN, "다른 팬");
        when(currentUserService.requireActiveUser(any())).thenReturn(otherFan);

        assertThatThrownBy(() -> service.issue(
                CALL_SESSION_ID, new AuthenticatedUser(99L, UserRole.FAN)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.LIVEKIT_JOIN_NOT_ALLOWED));
    }

    /**
     * 종료된 통화 세션에는 관계 사용자라도 새 입장 토큰을 발급하지 않는지 검증한다.
     */
    @Test
    void rejectsEndedCallSession() {
        when(currentUserService.requireActiveUser(any())).thenReturn(fan);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.ENDED);

        assertThatThrownBy(() -> service.issue(
                CALL_SESSION_ID, new AuthenticatedUser(11L, UserRole.FAN)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.CALL_SESSION_STATE_CONFLICT));
    }

    /**
     * 60초 재접속 허용 시각이 지난 팬에게 새 토큰을 발급하지 않는지 검증한다.
     */
    @Test
    void rejectsFanAfterReconnectWindowExpires() {
        when(currentUserService.requireActiveUser(any())).thenReturn(fan);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.ACTIVE);
        when(callSession.getReconnectAllowedUntil()).thenReturn(
                LocalDateTime.ofInstant(FIXED_INSTANT, SEOUL).minusSeconds(1));

        assertThatThrownBy(() -> service.issue(
                CALL_SESSION_ID, new AuthenticatedUser(11L, UserRole.FAN)))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.LIVEKIT_RECONNECT_EXPIRED));
    }

    /**
     * 서로 다른 팬미팅은 각 식별자에 해당하는 별도 Room 토큰을 발급하는지 검증한다.
     */
    @Test
    void separatesRoomsByMeetingId() {
        when(currentUserService.requireActiveUser(any())).thenReturn(fan);
        when(meeting.getId()).thenReturn(8L);
        when(callSession.getRoomId()).thenReturn("meeting-room-8");

        String payload = decodePayload(service.issue(
                CALL_SESSION_ID, new AuthenticatedUser(11L, UserRole.FAN)).accessToken());

        assertThat(payload).contains("\"room\":\"meeting-room-8\"");
    }

    /**
     * 지정 식별자와 역할을 반환하는 사용자 mock을 생성한다.
     */
    private User user(Long id, UserRole role, String nickname) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        when(user.getRole()).thenReturn(role);
        when(user.getNickname()).thenReturn(nickname);
        return user;
    }

    /**
     * 서명된 LiveKit JWT의 Base64 URL payload를 JSON 문자열로 변환한다.
     */
    private String decodePayload(String token) {
        return new String(
                Base64.getUrlDecoder().decode(token.split("\\.")[1]),
                StandardCharsets.UTF_8
        );
    }
}
