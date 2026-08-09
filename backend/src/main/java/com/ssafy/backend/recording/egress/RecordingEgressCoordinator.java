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
import java.time.format.DateTimeFormatter;
import java.util.regex.Pattern;

/** 통화 생명주기와 녹화 DB 상태를 연결하고 외부 호출 이벤트를 발행한다. */
@Component
public class RecordingEgressCoordinator {

    /**
     * 파일명에 쓸 수 없는 문자다.
     *
     * <p>윈도우가 금지하는 문자와 경로 구분자, 제어문자를 함께 막아 어느 운영체제에 내려받아도
     * 저장되게 한다. 팬미팅명과 닉네임은 사용자가 자유롭게 입력하므로 반드시 걸러야 한다.
     */
    private static final Pattern UNSAFE_FILE_NAME_CHARS =
            Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]");

    /** 연속된 공백을 한 칸으로 줄이기 위한 패턴이다. */
    private static final Pattern REPEATED_WHITESPACE = Pattern.compile("\\s+");

    /** 이름 앞뒤의 점과 공백을 걷어내기 위한 패턴이며 윈도우가 이를 임의로 지우기 때문이다. */
    private static final Pattern EDGE_DOTS_AND_SPACES = Pattern.compile("^[.\\s]+|[.\\s]+$");

    /**
     * 파일명 한 조각의 최대 길이다.
     *
     * <p>팬미팅명과 닉네임을 합쳐도 {@code recordings.file_name}(255자)과 파일시스템의
     * 파일명 길이 제한을 넘지 않도록 조각마다 잘라 둔다.
     */
    private static final int MAX_NAME_PART_LENGTH = 60;

    /** 파일명 뒤에 붙일 녹화 시작 시각 표기다. */
    private static final DateTimeFormatter FILE_NAME_TIMESTAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd_HHmm");

    /** 팬미팅명을 쓸 수 없을 때 파일명에 대신 넣는 값이다. */
    private static final String UNKNOWN_MEETING_NAME = "fan-meeting";

    /** 닉네임을 쓸 수 없을 때 파일명에 대신 넣는 값이다. */
    private static final String UNKNOWN_FAN_NAME = "fan";

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
                buildFileName(participant, requestedAt),
                storageKey,
                requestedAt
        );
        recordingRepository.save(recording);
        eventPublisher.publishEvent(new RecordingEgressEvent.StartRequested(recording.getId()));
    }

    /**
     * 내려받았을 때 어떤 통화인지 알아볼 수 있도록 녹화 파일명을 만든다.
     *
     * <p>{@code 팬미팅명_팬닉네임_yyyyMMdd_HHmm.mp4} 형태이며, 저장 경로에는 이 이름을 쓰지 않고
     * 다운로드 파일명으로만 사용한다. 실제 저장 위치는 UUID 기반 저장 키가 따로 담당한다.
     *
     * @param participant 녹화 대상 통화의 참가자
     * @param requestedAt 녹화 시작 요청 시각
     * @return 파일시스템에 저장할 수 있는 MP4 파일명
     */
    private String buildFileName(Participant participant, LocalDateTime requestedAt) {
        String meetingName = safeNamePart(
                participant.getMeeting().getTitle(), UNKNOWN_MEETING_NAME);
        String fanName = safeNamePart(
                participant.getFan().getNickname(), UNKNOWN_FAN_NAME);
        return meetingName + "_" + fanName + "_"
                + FILE_NAME_TIMESTAMP.format(requestedAt) + ".mp4";
    }

    /**
     * 팬미팅명이나 닉네임을 파일명에 넣을 수 있는 조각으로 다듬는다.
     *
     * <p>금지 문자는 공백으로 바꾼 뒤 연속 공백을 줄이고, 앞뒤의 점과 공백을 없앤다.
     * 길이를 넘으면 잘라 내며 결과가 비면 대체 이름을 돌려준다.
     *
     * @param value 원본 값이며 없으면 null
     * @param fallback 값을 쓸 수 없을 때 대신 넣을 이름
     * @return 파일명에 넣어도 안전한 조각
     */
    private String safeNamePart(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String cleaned = UNSAFE_FILE_NAME_CHARS.matcher(value).replaceAll(" ");
        cleaned = REPEATED_WHITESPACE.matcher(cleaned).replaceAll(" ");
        cleaned = EDGE_DOTS_AND_SPACES.matcher(cleaned).replaceAll("");
        if (cleaned.length() > MAX_NAME_PART_LENGTH) {
            cleaned = EDGE_DOTS_AND_SPACES
                    .matcher(cleaned.substring(0, MAX_NAME_PART_LENGTH)).replaceAll("");
        }
        return cleaned.isEmpty() ? fallback : cleaned;
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
