package com.ssafy.backend.participant.domain;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.common.entity.BaseTimeEntity;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 팬미팅의 실제 참가자로 확정된 팬을 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(
        name = "participants",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_participants_meeting_fan",
                columnNames = {"meeting_id", "fan_id"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Participant extends BaseTimeEntity {

    /**
     * 참가 확정 직후의 초기 상태값이다.
     *
     * <p>참가자 상태는 스키마상 문자열 컬럼이므로 기존 시드와 대기열 흐름이 사용하는 값을 그대로 쓴다.
     */
    public static final String READY_STATUS = "READY";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "participant_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "meeting_id", nullable = false)
    private FanMeeting meeting;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fan_id", nullable = false)
    private User fan;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false, unique = true)
    private Application application;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "assigned_order", nullable = false)
    private Integer assignedOrder;

    @Column(name = "recording_consent_at")
    private LocalDateTime recordingConsentAt;

    /**
     * 추첨에 당첨된 응모를 참가자로 확정한다.
     *
     * @param meeting 참가할 팬미팅
     * @param fan 당첨된 팬
     * @param application 당첨 근거가 되는 응모
     * @param assignedOrder 1부터 시작하는 호출 순번
     * @return 참가 대기 상태로 생성된 참가자
     * @throws IllegalArgumentException 호출 순번이 1보다 작은 경우
     */
    public static Participant create(FanMeeting meeting, User fan,
                                     Application application, int assignedOrder) {
        if (assignedOrder < 1) {
            throw new IllegalArgumentException("호출 순번은 1부터 배정해야 합니다.");
        }
        Participant participant = new Participant();
        participant.meeting = Objects.requireNonNull(meeting);
        participant.fan = Objects.requireNonNull(fan);
        participant.application = Objects.requireNonNull(application);
        participant.status = READY_STATUS;
        participant.assignedOrder = assignedOrder;
        return participant;
    }
}
