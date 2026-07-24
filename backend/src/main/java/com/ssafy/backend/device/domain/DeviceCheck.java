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
}
