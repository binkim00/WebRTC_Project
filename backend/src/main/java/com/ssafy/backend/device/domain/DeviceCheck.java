package com.ssafy.backend.device.domain;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 팬미팅 입장 전 사용자의 장비 점검 결과를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "device_checks")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DeviceCheck {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "device_check_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "meeting_id", nullable = false)
    private FanMeeting meeting;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "camera_ok", nullable = false)
    private boolean cameraOk;

    @Column(name = "microphone_ok", nullable = false)
    private boolean microphoneOk;

    @Column(name = "speaker_ok")
    private Boolean speakerOk;

    @Column(name = "network_ok", nullable = false)
    private boolean networkOk;

    @Column(name = "checked_at", nullable = false)
    private LocalDateTime checkedAt;

    /**
     * 장비 점검 결과를 담은 엔티티를 생성한다.
     *
     * @param meeting 점검을 수행한 팬미팅
     * @param user 점검을 수행한 사용자
     * @param cameraOk 카메라 정상 여부
     * @param microphoneOk 마이크 정상 여부
     * @param speakerOk 스피커 정상 여부이며 점검하지 않았으면 {@code null}
     * @param networkOk 네트워크 정상 여부
     * @param checkedAt 점검 시각
     */
    private DeviceCheck(FanMeeting meeting, User user, boolean cameraOk, boolean microphoneOk,
                        Boolean speakerOk, boolean networkOk, LocalDateTime checkedAt) {
        this.meeting = meeting;
        this.user = user;
        this.cameraOk = cameraOk;
        this.microphoneOk = microphoneOk;
        this.speakerOk = speakerOk;
        this.networkOk = networkOk;
        this.checkedAt = checkedAt;
    }

    /**
     * 팬미팅 입장 전 수행한 장비 점검 결과를 새로 기록한다.
     *
     * @param meeting 점검을 수행한 팬미팅
     * @param user 점검을 수행한 사용자
     * @param cameraOk 카메라 정상 여부
     * @param microphoneOk 마이크 정상 여부
     * @param speakerOk 스피커 정상 여부이며 점검하지 않았으면 {@code null}
     * @param networkOk 네트워크 정상 여부
     * @param checkedAt 점검 시각
     * @return 저장 대상 장비 점검 기록
     */
    public static DeviceCheck record(FanMeeting meeting, User user, boolean cameraOk,
                                     boolean microphoneOk, Boolean speakerOk, boolean networkOk,
                                     LocalDateTime checkedAt) {
        return new DeviceCheck(meeting, user, cameraOk, microphoneOk, speakerOk, networkOk,
                checkedAt);
    }
}
