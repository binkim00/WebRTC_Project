package com.ssafy.backend.participant.domain;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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

    /**
     * 참가 근거가 되는 응모이며 외부 선별로 등록된 참가자는 값이 없다.
     *
     * <p>응모 없이 확정되는 외부 선별 참가자를 허용하기 위해 nullable로 둔다.
     * 응모 방식 참가자는 여전히 응모 한 건과 1:1로 연결된다.
     */
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "application_id", unique = true)
    private Application application;

    /**
     * 참가자가 확정된 경로이며 응모 추첨과 외부 선별을 구분한다.
     *
     * <p>기존 참가자는 모두 응모 추첨으로 확정되었으므로 스키마 기본값과 같은 값으로 초기화한다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "participant_source", nullable = false, length = 30)
    private ParticipantSource participantSource = ParticipantSource.APPLICATION;

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
     * @return 참가 대기 상태로 생성된 응모 출처 참가자
     * @throws IllegalArgumentException 호출 순번이 1보다 작은 경우
     */
    public static Participant createFromApplication(FanMeeting meeting, User fan,
                                                    Application application, int assignedOrder) {
        Participant participant = newParticipant(
                meeting, fan, assignedOrder, ParticipantSource.APPLICATION);
        participant.application = Objects.requireNonNull(application);
        return participant;
    }

    /**
     * 외부에서 선별한 명단으로 응모 없이 참가자를 확정한다.
     *
     * @param meeting 참가할 팬미팅
     * @param fan 명단에서 매칭된 팬
     * @param assignedOrder 1부터 시작하는 호출 순번
     * @return 참가 대기 상태로 생성된 외부 선별 출처 참가자이며 응모는 비어 있다
     * @throws IllegalArgumentException 호출 순번이 1보다 작은 경우
     */
    public static Participant createFromExternalSelection(FanMeeting meeting, User fan,
                                                          int assignedOrder) {
        return newParticipant(
                meeting, fan, assignedOrder, ParticipantSource.EXTERNAL_SELECTION);
    }

    /**
     * 출처와 무관하게 공통으로 필요한 참가자 값을 초기화한다.
     *
     * @param meeting 참가할 팬미팅
     * @param fan 참가할 팬
     * @param assignedOrder 1부터 시작하는 호출 순번
     * @param participantSource 참가자가 확정된 경로
     * @return 공통 값이 채워진 참가자
     * @throws IllegalArgumentException 호출 순번이 1보다 작은 경우
     */
    private static Participant newParticipant(FanMeeting meeting, User fan, int assignedOrder,
                                              ParticipantSource participantSource) {
        if (assignedOrder < 1) {
            throw new IllegalArgumentException("호출 순번은 1부터 배정해야 합니다.");
        }
        Participant participant = new Participant();
        participant.meeting = Objects.requireNonNull(meeting);
        participant.fan = Objects.requireNonNull(fan);
        participant.status = READY_STATUS;
        participant.assignedOrder = assignedOrder;
        participant.participantSource = Objects.requireNonNull(participantSource);
        return participant;
    }

    /**
     * 팬이 녹화에 동의한 최초 시각을 멱등하게 기록한다.
     *
     * @param consentedAt 동의한 서버 시각
     * @return 최초로 저장된 동의 시각
     */
    public LocalDateTime consentToRecording(LocalDateTime consentedAt) {
        Objects.requireNonNull(consentedAt);
        if (recordingConsentAt == null) {
            recordingConsentAt = consentedAt;
        }
        return recordingConsentAt;
    }
}
