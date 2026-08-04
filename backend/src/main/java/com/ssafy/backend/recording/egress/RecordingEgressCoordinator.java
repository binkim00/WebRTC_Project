package com.ssafy.backend.recording.egress;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.recording.config.RecordingEgressProperties;
import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.recording.domain.RecordingSource;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.recording.storage.RecordingFileStorage;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/** 통화 생명주기와 녹화 DB 상태를 연결하고 외부 호출 이벤트를 발행한다. */
@Component
public class RecordingEgressCoordinator {

    private final RecordingRepository recordingRepository;
    private final RecordingFileStorage fileStorage;
    private final RecordingEgressProperties properties;
    private final ApplicationEventPublisher eventPublisher;

    public RecordingEgressCoordinator(
            RecordingRepository recordingRepository,
            RecordingFileStorage fileStorage,
            RecordingEgressProperties properties,
            ApplicationEventPublisher eventPublisher
    ) {
        this.recordingRepository = recordingRepository;
        this.fileStorage = fileStorage;
        this.properties = properties;
        this.eventPublisher = eventPublisher;
    }

    /** 양측 입장으로 활성화된 통화가 녹화 조건을 만족하면 시작 행을 한 번만 생성한다. */
    public void prepareStart(CallSession callSession, MeetingOperationSetting setting,
                             LocalDateTime requestedAt) {
        if (!properties.enabled() || !setting.isRecordingEnabled()) {
            return;
        }
        Participant participant = callSession.getQueueEntry().getParticipant();
        if (participant == null || participant.getRecordingConsentAt() == null
                || recordingRepository.existsByCallSession_Id(callSession.getId())) {
            return;
        }

        String storageKey = "egress/" + fileStorage.newStorageKey(
                "mp4", requestedAt.toLocalDate());
        Recording recording = Recording.createEgressStarting(
                callSession,
                "call-" + callSession.getId() + ".mp4",
                storageKey,
                requestedAt
        );
        recordingRepository.save(recording);
        eventPublisher.publishEvent(new RecordingEgressEvent.StartRequested(recording.getId()));
    }

    /** 모든 활성 통화 종료 경로에서 해당 세션의 Egress만 처리 상태로 바꾸고 중지를 예약한다. */
    public void prepareStop(CallSession callSession) {
        recordingRepository.findByCallSessionIdForUpdate(callSession.getId())
                .filter(recording -> recording.getSource() == RecordingSource.LIVEKIT_EGRESS)
                .filter(recording -> !recording.isTerminal())
                .ifPresent(recording -> {
                    recording.markProcessing();
                    eventPublisher.publishEvent(
                            new RecordingEgressEvent.StopRequested(recording.getId()));
                });
    }
}
