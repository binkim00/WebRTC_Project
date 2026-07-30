package com.ssafy.backend.application.domain;

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
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 팬이 제출한 팬미팅 응모와 추첨 결과를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(
        name = "applications",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_applications_meeting_fan",
                columnNames = {"meeting_id", "fan_id"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Application extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "application_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "meeting_id", nullable = false)
    private FanMeeting meeting;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fan_id", nullable = false)
    private User fan;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private ApplicationStatus status;

    @Column(name = "personal_information_consent_at", nullable = false)
    private LocalDateTime personalInformationConsentAt;

    @Column(name = "submitted_at", nullable = false)
    private LocalDateTime submittedAt;

    @Column(name = "result_decided_at")
    private LocalDateTime resultDecidedAt;

    @Column(name = "withdrawn_at")
    private LocalDateTime withdrawnAt;

    /**
     * 팬의 최초 응모를 접수 상태로 생성한다.
     *
     * @param meeting 응모 대상 팬미팅
     * @param fan 응모한 팬
     * @param submittedAt 응모 제출 시각
     * @return 접수 상태로 생성된 응모
     */
    public static Application submit(FanMeeting meeting, User fan, LocalDateTime submittedAt) {
        Application application = new Application();
        application.meeting = Objects.requireNonNull(meeting);
        application.fan = Objects.requireNonNull(fan);
        application.status = ApplicationStatus.SUBMITTED;
        application.personalInformationConsentAt = Objects.requireNonNull(submittedAt);
        application.submittedAt = submittedAt;
        return application;
    }

    /**
     * 취소된 응모를 새 답변 제출 시각 기준으로 다시 접수한다.
     *
     * @param submittedAt 재응모 제출 시각
     */
    public void resubmit(LocalDateTime submittedAt) {
        this.status = ApplicationStatus.SUBMITTED;
        this.personalInformationConsentAt = Objects.requireNonNull(submittedAt);
        this.submittedAt = submittedAt;
        this.resultDecidedAt = null;
        this.withdrawnAt = null;
    }

    /**
     * 접수 상태의 응모를 실제 삭제하지 않고 취소 상태로 전환한다.
     *
     * @param withdrawnAt 응모 취소 시각
     */
    public void withdraw(LocalDateTime withdrawnAt) {
        this.status = ApplicationStatus.WITHDRAWN;
        this.withdrawnAt = Objects.requireNonNull(withdrawnAt);
    }

    /**
     * 추첨에 당첨된 응모를 선정 상태로 전환한다.
     *
     * @param resultDecidedAt 추첨 결과가 확정된 시각
     * @throws IllegalStateException 접수 상태가 아닌 응모를 선정하려는 경우
     */
    public void select(LocalDateTime resultDecidedAt) {
        requireSubmittedForDraw();
        this.status = ApplicationStatus.SELECTED;
        this.resultDecidedAt = Objects.requireNonNull(resultDecidedAt);
    }

    /**
     * 추첨에서 탈락한 응모를 미선정 상태로 전환한다.
     *
     * @param resultDecidedAt 추첨 결과가 확정된 시각
     * @throws IllegalStateException 접수 상태가 아닌 응모를 탈락 처리하려는 경우
     */
    public void reject(LocalDateTime resultDecidedAt) {
        requireSubmittedForDraw();
        this.status = ApplicationStatus.NOT_SELECTED;
        this.resultDecidedAt = Objects.requireNonNull(resultDecidedAt);
    }

    /**
     * 추첨 대상이 되는 접수 상태인지 검증한다.
     *
     * <p>취소된 응모와 이미 결과가 확정된 응모는 다시 추첨할 수 없다.
     *
     * @throws IllegalStateException 접수 상태가 아닌 경우
     */
    private void requireSubmittedForDraw() {
        if (status != ApplicationStatus.SUBMITTED) {
            throw new IllegalStateException("접수 상태의 응모만 추첨 결과를 확정할 수 있습니다.");
        }
    }
}
