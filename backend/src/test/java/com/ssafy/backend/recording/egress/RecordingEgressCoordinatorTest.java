package com.ssafy.backend.recording.egress;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import com.ssafy.backend.participant.domain.Participant;
import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.recording.config.RecordingEgressProperties;
import com.ssafy.backend.recording.domain.Recording;
import com.ssafy.backend.recording.repository.RecordingRepository;
import com.ssafy.backend.recording.storage.RecordingFileStorage;
import com.ssafy.backend.user.domain.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RecordingEgressCoordinatorTest {

    private static final LocalDateTime REQUESTED_AT = LocalDateTime.of(2026, 8, 7, 18, 30);

    private RecordingRepository recordingRepository;
    private RecordingFileStorage fileStorage;
    private RecordingEgressCoordinator coordinator;
    private MeetingOperationSetting setting;

    /** 녹화가 켜진 팬미팅에서 시작 행을 만드는 조정자와 협력 객체를 구성한다. */
    @BeforeEach
    void setUp() {
        recordingRepository = mock(RecordingRepository.class);
        fileStorage = mock(RecordingFileStorage.class);
        coordinator = new RecordingEgressCoordinator(
                recordingRepository,
                fileStorage,
                new RecordingEgressProperties(true, "/out", "grid",
                        1, 7200, 30000, 60, 20),
                mock(ApplicationEventPublisher.class));
        setting = mock(MeetingOperationSetting.class);
        when(setting.isRecordingEnabled()).thenReturn(true);
        when(fileStorage.newStorageKey("mp4", REQUESTED_AT.toLocalDate()))
                .thenReturn("2026/08/07/uuid.mp4");
    }

    /** 녹화 파일명에 팬미팅명, 팬 닉네임, 시작 시각이 들어가는지 검증한다. */
    @Test
    void namesRecordingFileWithMeetingFanAndTimestamp() {
        CallSession callSession = callSession("여름 팬미팅", "말랑젤리");

        coordinator.prepareStart(callSession, setting, REQUESTED_AT);

        assertThat(savedFileName()).isEqualTo("여름 팬미팅_말랑젤리_20260807_1830.mp4");
    }

    /** 팬미팅명과 닉네임의 금지 문자를 걸러 저장 가능한 파일명을 만드는지 검증한다. */
    @Test
    void removesCharactersThatFileSystemsReject() {
        CallSession callSession = callSession("7/8 특별\t팬미팅?", "a:b*c|d");

        coordinator.prepareStart(callSession, setting, REQUESTED_AT);

        assertThat(savedFileName()).isEqualTo("7 8 특별 팬미팅_a b c d_20260807_1830.mp4");
    }

    /** 금지 문자만 남은 이름을 대체 이름으로 바꿔 빈 파일명이 되지 않게 하는지 검증한다. */
    @Test
    void fallsBackWhenNameHasNoUsableCharacter() {
        CallSession callSession = callSession("///", "...");

        coordinator.prepareStart(callSession, setting, REQUESTED_AT);

        assertThat(savedFileName()).isEqualTo("fan-meeting_fan_20260807_1830.mp4");
    }

    /** 아주 긴 팬미팅명을 잘라 파일명 길이 제한 안에 두는지 검증한다. */
    @Test
    void truncatesOverlyLongName() {
        CallSession callSession = callSession("가".repeat(120), "나".repeat(120));

        coordinator.prepareStart(callSession, setting, REQUESTED_AT);

        assertThat(savedFileName())
                .isEqualTo("가".repeat(60) + "_" + "나".repeat(60) + "_20260807_1830.mp4");
    }

    /**
     * 저장된 녹화의 파일명을 꺼낸다.
     *
     * @return 조정자가 만들어 저장한 파일명
     */
    private String savedFileName() {
        ArgumentCaptor<Recording> captor = ArgumentCaptor.forClass(Recording.class);
        verify(recordingRepository).save(captor.capture());
        return captor.getValue().getFileName();
    }

    /**
     * 녹화 동의를 마친 참가자가 연결된 통화 세션 대역을 만든다.
     *
     * @param meetingTitle 팬미팅명
     * @param nickname 팬 닉네임
     * @return 녹화 시작 조건을 모두 만족하는 통화 세션 대역
     */
    private CallSession callSession(String meetingTitle, String nickname) {
        FanMeeting meeting = mock(FanMeeting.class);
        when(meeting.getTitle()).thenReturn(meetingTitle);
        User fan = mock(User.class);
        when(fan.getNickname()).thenReturn(nickname);
        Participant participant = mock(Participant.class);
        when(participant.getMeeting()).thenReturn(meeting);
        when(participant.getFan()).thenReturn(fan);
        when(participant.getRecordingConsentAt()).thenReturn(REQUESTED_AT.minusMinutes(1));
        QueueEntry queueEntry = mock(QueueEntry.class);
        when(queueEntry.getParticipant()).thenReturn(participant);
        CallSession callSession = mock(CallSession.class);
        when(callSession.getId()).thenReturn(41L);
        when(callSession.getRoomId()).thenReturn("meeting-room-9");
        when(callSession.getQueueEntry()).thenReturn(queueEntry);
        return callSession;
    }
}
