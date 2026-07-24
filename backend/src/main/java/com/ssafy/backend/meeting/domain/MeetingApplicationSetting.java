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

/**
 * 팬미팅의 응모 기간과 모집 인원 설정을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "meeting_application_settings")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MeetingApplicationSetting extends BaseTimeEntity {

    @Id
    @Column(name = "meeting_id", nullable = false)
    private Long meetingId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "meeting_id", nullable = false)
    private FanMeeting meeting;

    @Column(name = "application_open_at")
    private LocalDateTime applicationOpenAt;

    @Column(name = "application_close_at")
    private LocalDateTime applicationCloseAt;

    @Column(name = "result_announcement_at")
    private LocalDateTime resultAnnouncementAt;

    @Column(name = "capacity", nullable = false)
    private Integer capacity;
}
