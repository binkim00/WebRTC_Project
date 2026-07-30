package com.ssafy.backend.meeting.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 팬미팅 당일의 대기실과 영상통화 운영 설정을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "meeting_operation_settings")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MeetingOperationSetting extends BaseTimeEntity {

    @Id
    @Column(name = "meeting_id", nullable = false)
    private Long meetingId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "meeting_id", nullable = false)
    private FanMeeting meeting;

    @Column(name = "waiting_room_open_at")
    private LocalDateTime waitingRoomOpenAt;

    @Column(name = "call_duration_sec", nullable = false)
    private Integer callDurationSec;

    @Column(name = "recording_enabled", nullable = false)
    private boolean recordingEnabled;

    @Column(name = "translation_enabled", nullable = false)
    private boolean translationEnabled;

    /** 개별 영상통화 운영 설정 값을 초기화한다. */
    private MeetingOperationSetting(FanMeeting meeting,
                                    LocalDateTime waitingRoomOpenAt,
                                    int callDurationSec,
                                    boolean recordingEnabled,
                                    boolean translationEnabled) {
        this.meeting = Objects.requireNonNull(meeting);
        this.waitingRoomOpenAt = waitingRoomOpenAt;
        this.callDurationSec = callDurationSec;
        this.recordingEnabled = recordingEnabled;
        this.translationEnabled = translationEnabled;
    }

    /**
     * 팬미팅 운영 설정을 생성한다.
     *
     * @param meeting 대상 팬미팅
     * @param waitingRoomOpenAt 대기실 개방 시각
     * @param callDurationSec 참가자당 영상통화 제한 시간
     * @param recordingEnabled 녹화 사용 여부
     * @param translationEnabled 번역 사용 여부
     * @return 생성된 운영 설정
     */
    public static MeetingOperationSetting create(FanMeeting meeting,
                                                 LocalDateTime waitingRoomOpenAt,
                                                 int callDurationSec,
                                                 boolean recordingEnabled,
                                                 boolean translationEnabled) {
        return new MeetingOperationSetting(
                meeting, waitingRoomOpenAt, callDurationSec,
                recordingEnabled, translationEnabled
        );
    }

    /**
     * 공개 전 팬미팅의 운영 설정을 변경한다.
     *
     * @param waitingRoomOpenAt 대기실 개방 시각
     * @param callDurationSec 참가자당 영상통화 제한 시간
     * @param recordingEnabled 녹화 사용 여부
     * @param translationEnabled 번역 사용 여부
     */
    public void update(LocalDateTime waitingRoomOpenAt, int callDurationSec,
                       boolean recordingEnabled, boolean translationEnabled) {
        this.waitingRoomOpenAt = waitingRoomOpenAt;
        this.callDurationSec = callDurationSec;
        this.recordingEnabled = recordingEnabled;
        this.translationEnabled = translationEnabled;
    }
}
