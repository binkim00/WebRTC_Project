package com.ssafy.backend.livekit.service;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import com.ssafy.backend.call.repository.CallSessionRepository;
import com.ssafy.backend.common.exception.BusinessException;
import com.ssafy.backend.common.exception.ErrorCode;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.meeting.repository.MeetingOperationSettingRepository;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import com.ssafy.backend.queue.redis.QueueRealtimeStore;
import com.ssafy.backend.recording.egress.RecordingEgressCoordinator;
import com.ssafy.backend.recording.egress.RecordingEgressWebhookHandler;
import livekit.LivekitWebhook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * LiveKit 참가자 이벤트를 통화 세션과 대기열 상태에 반영한다.
 */
@Service
public class LiveKitWebhookService {

    private static final String PARTICIPANT_JOINED = "participant_joined";
    private static final String PARTICIPANT_LEFT = "participant_left";
    private static final String PARTICIPANT_CONNECTION_ABORTED = "participant_connection_aborted";
    private static final String EGRESS_STARTED = "egress_started";
    private static final String EGRESS_UPDATED = "egress_updated";
    private static final String EGRESS_ENDED = "egress_ended";
    private static final String ROLE_ATTRIBUTE = "role";
    private static final String CALL_SESSION_ID_ATTRIBUTE = "call_session_id";
    private static final String FAN_ROLE = "FAN";
    private static final String HOST_ROLE = "INFLUENCER";

    private final CallSessionRepository callSessionRepository;
    private final MeetingOperationSettingRepository operationSettingRepository;
    private final QueueRealtimeStore realtimeStore;
    private final RecordingEgressCoordinator recordingEgressCoordinator;
    private final RecordingEgressWebhookHandler recordingEgressWebhookHandler;
    private final Clock clock;

    /**
     * 통화 세션·운영 설정 저장소와 Redis 실시간 상태 저장소를 주입받는다.
     *
     * @param callSessionRepository 통화 세션 저장소
     * @param operationSettingRepository 팬미팅 운영 설정 저장소
     * @param realtimeStore 대기열 및 LiveKit 실시간 상태 저장소
     * @param clock 통화 시작 시각 계산 기준 시계
     */
    public LiveKitWebhookService(
            CallSessionRepository callSessionRepository,
            MeetingOperationSettingRepository operationSettingRepository,
            QueueRealtimeStore realtimeStore,
            RecordingEgressCoordinator recordingEgressCoordinator,
            RecordingEgressWebhookHandler recordingEgressWebhookHandler,
            Clock clock
    ) {
        this.callSessionRepository = callSessionRepository;
        this.operationSettingRepository = operationSettingRepository;
        this.realtimeStore = realtimeStore;
        this.recordingEgressCoordinator = recordingEgressCoordinator;
        this.recordingEgressWebhookHandler = recordingEgressWebhookHandler;
        this.clock = clock;
    }

    /**
     * 검증된 LiveKit webhook을 멱등 처리하고 참가자 입장을 통화 상태에 반영한다.
     *
     * @param event 서명 검증이 끝난 LiveKit webhook 이벤트
     * @throws BusinessException 이벤트 식별자나 통화 컨텍스트가 올바르지 않은 경우
     */
    @Transactional
    public void handle(LivekitWebhook.WebhookEvent event) {
        String eventId = event.getId();
        if (!StringUtils.hasText(eventId)) {
            throw new BusinessException(ErrorCode.INVALID_LIVEKIT_WEBHOOK);
        }
        if (!realtimeStore.claimWebhookEvent(eventId)) {
            return;
        }

        try {
            if (PARTICIPANT_JOINED.equals(event.getEvent())) {
                handleParticipantJoined(event);
            } else if (PARTICIPANT_LEFT.equals(event.getEvent())
                    || PARTICIPANT_CONNECTION_ABORTED.equals(event.getEvent())) {
                handleParticipantDisconnected(event);
            } else if (EGRESS_STARTED.equals(event.getEvent())
                    || EGRESS_UPDATED.equals(event.getEvent())
                    || EGRESS_ENDED.equals(event.getEvent())) {
                recordingEgressWebhookHandler.handle(event);
            }
        } catch (RuntimeException exception) {
            realtimeStore.releaseWebhookEvent(eventId);
            throw exception;
        }
    }

    /**
     * 팬 또는 호스트의 접속을 기록하고 양측 접속 완료 여부를 확인한다.
     *
     * @param event 참가자 입장 webhook 이벤트
     */
    private void handleParticipantJoined(LivekitWebhook.WebhookEvent event) {
        if (!event.hasRoom() || !event.hasParticipant()) {
            return;
        }

        String roomId = event.getRoom().getName();
        Map<String, String> attributes = event.getParticipant().getAttributesMap();
        String role = attributes.get(ROLE_ATTRIBUTE);
        if (FAN_ROLE.equals(role)) {
            handleFanJoined(roomId, attributes.get(CALL_SESSION_ID_ATTRIBUTE));
        } else if (HOST_ROLE.equals(role)) {
            handleHostJoined(roomId);
        }
    }

    /**
     * 팬 또는 호스트가 퇴장하면 이후 세션이 잘못 시작되지 않도록 접속 상태를 제거한다.
     *
     * @param event 참가자 퇴장 또는 연결 중단 webhook 이벤트
     */
    private void handleParticipantDisconnected(LivekitWebhook.WebhookEvent event) {
        if (!event.hasRoom() || !event.hasParticipant()) {
            return;
        }

        Map<String, String> attributes = event.getParticipant().getAttributesMap();
        String role = attributes.get(ROLE_ATTRIBUTE);
        if (FAN_ROLE.equals(role)) {
            Long callSessionId = parseCallSessionId(
                    attributes.get(CALL_SESSION_ID_ATTRIBUTE));
            realtimeStore.clearFanConnected(callSessionId);
            callSessionRepository.findWebhookContextById(callSessionId)
                    .ifPresent(callSession -> markDisconnected(callSession, FAN_ROLE));
        } else if (HOST_ROLE.equals(role)) {
            String roomId = event.getRoom().getName();
            realtimeStore.clearHostConnected(roomId);
            callSessionRepository.findFirstByRoomIdAndStatusOrderByIdDesc(
                            roomId, CallSessionStatus.ACTIVE)
                    .ifPresent(callSession -> markDisconnected(callSession, HOST_ROLE));
        }
    }

    /**
     * 팬 접속을 기록하고 해당 통화 세션의 시작 조건을 확인한다.
     *
     * @param roomId 팬이 접속한 LiveKit Room 식별자
     * @param callSessionIdAttribute 토큰 attribute의 통화 세션 식별자
     * @throws BusinessException 세션 식별자가 잘못되었거나 Room이 일치하지 않는 경우
     */
    private void handleFanJoined(String roomId, String callSessionIdAttribute) {
        Long callSessionId = parseCallSessionId(callSessionIdAttribute);
        CallSession callSession = callSessionRepository.findWebhookContextById(callSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_SESSION_NOT_FOUND));
        if (!callSession.getRoomId().equals(roomId)) {
            throw new BusinessException(ErrorCode.CALL_SESSION_STATE_CONFLICT);
        }

        realtimeStore.markFanConnected(callSessionId);
        activateIfBothParticipantsConnected(callSession);
    }

    /**
     * 호스트 접속을 기록하고 Room에서 대기 중인 최신 통화 세션의 시작 조건을 확인한다.
     *
     * @param roomId 호스트가 접속한 LiveKit Room 식별자
     */
    private void handleHostJoined(String roomId) {
        realtimeStore.markHostConnected(roomId);
        callSessionRepository.findFirstByRoomIdAndStatusOrderByIdDesc(
                        roomId, CallSessionStatus.ACTIVE)
                .ifPresent(this::activateIfBothParticipantsConnected);
        callSessionRepository.findFirstByRoomIdAndStatusOrderByIdDesc(
                        roomId, CallSessionStatus.CONNECTING)
                .ifPresent(this::activateIfBothParticipantsConnected);
    }

    /**
     * 팬과 호스트가 모두 접속했으면 세션 시간과 대기열 상태를 함께 시작한다.
     *
     * @param callSession 시작 조건을 확인할 통화 세션
     * @throws BusinessException 팬미팅 운영 설정이 없는 경우
     */
    private void activateIfBothParticipantsConnected(CallSession callSession) {
        if (!realtimeStore.isHostConnected(callSession.getRoomId())
                || !realtimeStore.isFanConnected(callSession.getId())) {
            return;
        }

        if (callSession.getStatus() == CallSessionStatus.ACTIVE) {
            callSession.resumeConnection();
            realtimeStore.clearDisconnectRole(callSession.getId());
            return;
        }

        QueueEntry queueEntry = callSession.getQueueEntry();
        Long meetingId = queueEntry.getMeeting().getId();
        MeetingOperationSetting setting = operationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OPERATION_SETTING_NOT_FOUND));
        LocalDateTime startedAt = LocalDateTime.now(clock);

        callSession.activate(startedAt, setting.getCallDurationSec());
        queueEntry.startCall();
        realtimeStore.updateStatus(meetingId, queueEntry.getId(), QueueEntryStatus.IN_CALL);
        recordingEgressCoordinator.prepareStart(callSession, setting, startedAt);
    }

    /**
     * 활성 통화의 연결 종료 역할과 팬미팅별 재접속 허용 시각을 기록한다.
     *
     * @param callSession 연결이 끊긴 활성 통화 세션
     * @param role 연결이 끊긴 참가자 역할
     */
    private void markDisconnected(CallSession callSession, String role) {
        if (callSession.getStatus() != CallSessionStatus.ACTIVE) {
            return;
        }
        Long meetingId = callSession.getQueueEntry().getMeeting().getId();
        MeetingOperationSetting setting = operationSettingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.OPERATION_SETTING_NOT_FOUND));
        callSession.openReconnectWindow(LocalDateTime.now(clock)
                .plusSeconds(setting.getReconnectGraceSec()));
        realtimeStore.markDisconnectRole(callSession.getId(), role);
    }

    /**
     * 토큰 attribute의 통화 세션 식별자를 Long 값으로 변환한다.
     *
     * @param attributeValue 통화 세션 식별자 문자열
     * @return 변환된 통화 세션 식별자
     * @throws BusinessException 값이 비어 있거나 숫자가 아닌 경우
     */
    private Long parseCallSessionId(String attributeValue) {
        if (!StringUtils.hasText(attributeValue)) {
            throw new BusinessException(ErrorCode.INVALID_LIVEKIT_WEBHOOK);
        }
        try {
            return Long.valueOf(attributeValue);
        } catch (NumberFormatException exception) {
            throw new BusinessException(ErrorCode.INVALID_LIVEKIT_WEBHOOK);
        }
    }
}
