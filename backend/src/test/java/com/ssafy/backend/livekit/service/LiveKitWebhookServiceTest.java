package com.ssafy.backend.livekit.service;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import livekit.LivekitModels;
import livekit.LivekitWebhook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class LiveKitWebhookServiceTest {

    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-07-28T01:00:00Z"), ZoneId.of("Asia/Seoul"));
    private static final LocalDateTime STARTED_AT = LocalDateTime.of(2026, 7, 28, 10, 0);
    private static final String ROOM_ID = "meeting-room-1";
    private static final Long CALL_SESSION_ID = 100L;
    private static final Long MEETING_ID = 1L;
    private static final Long QUEUE_ENTRY_ID = 7L;

    private CallSessionRepository callSessionRepository;
    private MeetingOperationSettingRepository operationSettingRepository;
    private QueueRealtimeStore realtimeStore;
    private LiveKitWebhookService service;
    private CallSession callSession;
    private QueueEntry queueEntry;

    /** webhook 서비스와 통화 시작 컨텍스트 mock을 각 테스트 전에 구성한다. */
    @BeforeEach
    void setUp() {
        callSessionRepository = mock(CallSessionRepository.class);
        operationSettingRepository = mock(MeetingOperationSettingRepository.class);
        realtimeStore = mock(QueueRealtimeStore.class);
        service = new LiveKitWebhookService(
                callSessionRepository, operationSettingRepository, realtimeStore, CLOCK);

        callSession = mock(CallSession.class);
        queueEntry = mock(QueueEntry.class);
        FanMeeting meeting = mock(FanMeeting.class);
        when(callSession.getId()).thenReturn(CALL_SESSION_ID);
        when(callSession.getRoomId()).thenReturn(ROOM_ID);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.CONNECTING);
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        when(queueEntry.getId()).thenReturn(QUEUE_ENTRY_ID);
        when(queueEntry.getMeeting()).thenReturn(meeting);
        when(meeting.getId()).thenReturn(MEETING_ID);
    }

    /** 호스트가 접속한 상태에서 팬 입장 이벤트가 오면 세션과 대기열을 시작하는지 검증한다. */
    @Test
    void activatesCallWhenFanJoinsAfterHost() {
        MeetingOperationSetting setting = mock(MeetingOperationSetting.class);
        when(realtimeStore.claimWebhookEvent("fan-event")).thenReturn(true);
        when(callSessionRepository.findWebhookContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(realtimeStore.isHostConnected(ROOM_ID)).thenReturn(true);
        when(realtimeStore.isFanConnected(CALL_SESSION_ID)).thenReturn(true);
        when(operationSettingRepository.findById(MEETING_ID)).thenReturn(Optional.of(setting));
        when(setting.getCallDurationSec()).thenReturn(60);

        service.handle(fanJoinedEvent("fan-event"));

        verify(realtimeStore).markFanConnected(CALL_SESSION_ID);
        verify(callSession).activate(STARTED_AT, 60);
        verify(queueEntry).startCall();
        verify(realtimeStore).updateStatus(
                MEETING_ID, QUEUE_ENTRY_ID, QueueEntryStatus.IN_CALL);
    }

    /** 팬만 접속한 경우 연결 상태만 기록하고 통화를 시작하지 않는지 검증한다. */
    @Test
    void waitsForHostWhenOnlyFanIsConnected() {
        when(realtimeStore.claimWebhookEvent("fan-event")).thenReturn(true);
        when(callSessionRepository.findWebhookContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(realtimeStore.isHostConnected(ROOM_ID)).thenReturn(false);

        service.handle(fanJoinedEvent("fan-event"));

        verify(realtimeStore).markFanConnected(CALL_SESSION_ID);
        verify(callSession, never()).activate(STARTED_AT, 60);
        verifyNoInteractions(operationSettingRepository);
    }

    /** 팬이 먼저 접속한 상태에서 호스트 입장 이벤트가 오면 최신 연결 세션을 시작하는지 검증한다. */
    @Test
    void activatesCallWhenHostJoinsAfterFan() {
        MeetingOperationSetting setting = mock(MeetingOperationSetting.class);
        when(realtimeStore.claimWebhookEvent("host-event")).thenReturn(true);
        when(callSessionRepository.findFirstByRoomIdAndStatusOrderByIdDesc(
                ROOM_ID, CallSessionStatus.CONNECTING)).thenReturn(Optional.of(callSession));
        when(realtimeStore.isHostConnected(ROOM_ID)).thenReturn(true);
        when(realtimeStore.isFanConnected(CALL_SESSION_ID)).thenReturn(true);
        when(operationSettingRepository.findById(MEETING_ID)).thenReturn(Optional.of(setting));
        when(setting.getCallDurationSec()).thenReturn(60);

        service.handle(hostJoinedEvent("host-event"));

        verify(realtimeStore).markHostConnected(ROOM_ID);
        verify(callSession).activate(STARTED_AT, 60);
        verify(queueEntry).startCall();
    }

    /** 이미 선점된 webhook 이벤트는 상태 조회나 변경 없이 무시하는지 검증한다. */
    @Test
    void ignoresDuplicatedWebhookEvent() {
        when(realtimeStore.claimWebhookEvent("fan-event")).thenReturn(false);

        service.handle(fanJoinedEvent("fan-event"));

        verifyNoInteractions(callSessionRepository, operationSettingRepository);
        verify(realtimeStore, never()).markFanConnected(CALL_SESSION_ID);
    }

    /** 팬 퇴장 이벤트가 해당 통화 세션의 접속 표시를 제거하는지 검증한다. */
    @Test
    void clearsFanPresenceWhenFanLeavesRoom() {
        MeetingOperationSetting setting = mock(MeetingOperationSetting.class);
        when(realtimeStore.claimWebhookEvent("fan-left-event")).thenReturn(true);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.ACTIVE);
        when(callSessionRepository.findWebhookContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(operationSettingRepository.findById(MEETING_ID)).thenReturn(Optional.of(setting));
        when(setting.getReconnectGraceSec()).thenReturn(90);
        LivekitWebhook.WebhookEvent event = LivekitWebhook.WebhookEvent.newBuilder()
                .setEvent("participant_left")
                .setId("fan-left-event")
                .setRoom(LivekitModels.Room.newBuilder().setName(ROOM_ID))
                .setParticipant(LivekitModels.ParticipantInfo.newBuilder()
                        .setIdentity("fan-identity")
                        .putAttributes("role", "FAN")
                        .putAttributes("call_session_id", CALL_SESSION_ID.toString()))
                .build();

        service.handle(event);

        verify(realtimeStore).clearFanConnected(CALL_SESSION_ID);
        verify(callSession).openReconnectWindow(STARTED_AT.plusSeconds(90));
        verify(realtimeStore).markDisconnectRole(CALL_SESSION_ID, "FAN");
    }

    /** 재접속 유예 중 양측이 다시 연결되면 기존 타이머를 유지하고 유예만 해제하는지 검증한다. */
    @Test
    void resumesActiveCallWithoutRestartingTimer() {
        when(realtimeStore.claimWebhookEvent("fan-rejoined-event")).thenReturn(true);
        when(callSession.getStatus()).thenReturn(CallSessionStatus.ACTIVE);
        when(callSessionRepository.findWebhookContextById(CALL_SESSION_ID))
                .thenReturn(Optional.of(callSession));
        when(realtimeStore.isHostConnected(ROOM_ID)).thenReturn(true);
        when(realtimeStore.isFanConnected(CALL_SESSION_ID)).thenReturn(true);

        service.handle(fanJoinedEvent("fan-rejoined-event"));

        verify(callSession).resumeConnection();
        verify(realtimeStore).clearDisconnectRole(CALL_SESSION_ID);
        verify(callSession, never()).activate(STARTED_AT, 60);
        verifyNoInteractions(operationSettingRepository);
    }

    /**
     * 팬 역할과 통화 세션 attribute를 포함한 참가자 입장 이벤트를 생성한다.
     *
     * @param eventId webhook 이벤트 식별자
     * @return 팬 참가자 입장 이벤트
     */
    private LivekitWebhook.WebhookEvent fanJoinedEvent(String eventId) {
        return joinedEvent(eventId, LivekitModels.ParticipantInfo.newBuilder()
                .setIdentity("fan-identity")
                .putAttributes("role", "FAN")
                .putAttributes("call_session_id", CALL_SESSION_ID.toString())
                .build());
    }

    /**
     * 호스트 역할을 포함한 참가자 입장 이벤트를 생성한다.
     *
     * @param eventId webhook 이벤트 식별자
     * @return 호스트 참가자 입장 이벤트
     */
    private LivekitWebhook.WebhookEvent hostJoinedEvent(String eventId) {
        return joinedEvent(eventId, LivekitModels.ParticipantInfo.newBuilder()
                .setIdentity("host-identity")
                .putAttributes("role", "INFLUENCER")
                .build());
    }

    /**
     * 공통 Room과 참가자를 사용하는 LiveKit 입장 이벤트를 생성한다.
     *
     * @param eventId webhook 이벤트 식별자
     * @param participant 입장한 참가자 정보
     * @return 완성된 참가자 입장 이벤트
     */
    private LivekitWebhook.WebhookEvent joinedEvent(
            String eventId, LivekitModels.ParticipantInfo participant
    ) {
        return LivekitWebhook.WebhookEvent.newBuilder()
                .setEvent("participant_joined")
                .setId(eventId)
                .setRoom(LivekitModels.Room.newBuilder().setName(ROOM_ID))
                .setParticipant(participant)
                .build();
    }
}
