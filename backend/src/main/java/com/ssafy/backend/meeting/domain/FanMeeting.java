package com.ssafy.backend.meeting.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.organization.domain.Organization;
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
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 팬미팅의 기본 정보와 전체 진행 상태를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "fan_meetings")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FanMeeting extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "meeting_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_id")
    private User manager;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "influencer_id", nullable = false)
    private User influencer;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "cover_image_url", length = 2048)
    private String coverImageUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private FanMeetingStatus status;

    /**
     * 참가자를 정하는 방식이며 생성 후에는 변경할 수 없다.
     *
     * <p>기존 팬미팅은 모두 응모 방식이므로 스키마 기본값도 {@code APPLICATION}이다.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "participant_selection_type", nullable = false, length = 30)
    private ParticipantSelectionType participantSelectionType = ParticipantSelectionType.APPLICATION;

    @Column(name = "scheduled_start_at", nullable = false)
    private LocalDateTime scheduledStartAt;

    @Column(name = "actual_start_at")
    private LocalDateTime actualStartAt;

    @Column(name = "actual_end_at")
    private LocalDateTime actualEndAt;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "canceled_at")
    private LocalDateTime canceledAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /**
     * 팬미팅 생성에 필요한 기본 정보로 초안 엔티티를 초기화한다.
     *
     * @param organization 소속 조직이며 1인 인플루언서 팬미팅이면 null
     * @param manager 담당 매니저이며 1인 인플루언서 팬미팅이면 null
     * @param influencer 팬미팅을 진행할 인플루언서
     * @param title 팬미팅 제목
     * @param description 팬미팅 설명
     * @param coverImageUrl 커버 이미지 URL
     * @param scheduledStartAt 예정 시작 시각
     * @param participantSelectionType 참가자 선별 방식
     */
    private FanMeeting(Organization organization,
                       User manager,
                       User influencer,
                       String title,
                       String description,
                       String coverImageUrl,
                       LocalDateTime scheduledStartAt,
                       ParticipantSelectionType participantSelectionType) {
        this.organization = organization;
        this.manager = manager;
        this.influencer = Objects.requireNonNull(influencer);
        this.title = Objects.requireNonNull(title);
        this.description = description;
        this.coverImageUrl = coverImageUrl;
        this.status = FanMeetingStatus.DRAFT;
        this.scheduledStartAt = Objects.requireNonNull(scheduledStartAt);
        this.participantSelectionType = Objects.requireNonNull(participantSelectionType);
    }

    /** 테스트용 상태 변경이다. */
    public void forceControl(FanMeetingStatus status, LocalDateTime scheduledStartAt) {
        if (status != null) this.status = status;
        if (scheduledStartAt != null) this.scheduledStartAt = scheduledStartAt;
    }

    /**
     * 응모 방식으로 공개 전 초안 상태의 팬미팅을 생성한다.
     * 조직과 매니저는 1인 인플루언서가 생성하는 경우 null일 수 있다.
     *
     * <p>선별 방식을 지정하지 않은 기존 호출은 모두 응모 방식이므로
     * {@link ParticipantSelectionType#APPLICATION}으로 생성한다.
     */
    public static FanMeeting create(Organization organization,
                                    User manager,
                                    User influencer,
                                    String title,
                                    String description,
                                    String coverImageUrl,
                                    LocalDateTime scheduledStartAt) {
        return create(
                organization, manager, influencer, title,
                description, coverImageUrl, scheduledStartAt,
                ParticipantSelectionType.APPLICATION
        );
    }

    /**
     * 참가자 선별 방식을 지정해 공개 전 초안 상태의 팬미팅을 생성한다.
     *
     * @param organization 소속 조직이며 1인 인플루언서 팬미팅이면 null
     * @param manager 담당 매니저이며 1인 인플루언서 팬미팅이면 null
     * @param influencer 팬미팅을 진행할 인플루언서
     * @param title 팬미팅 제목
     * @param description 팬미팅 설명
     * @param coverImageUrl 커버 이미지 URL
     * @param scheduledStartAt 예정 시작 시각
     * @param participantSelectionType 참가자 선별 방식
     * @return 초안 상태로 생성된 팬미팅
     */
    public static FanMeeting create(Organization organization,
                                    User manager,
                                    User influencer,
                                    String title,
                                    String description,
                                    String coverImageUrl,
                                    LocalDateTime scheduledStartAt,
                                    ParticipantSelectionType participantSelectionType) {
        return new FanMeeting(
                organization, manager, influencer, title,
                description, coverImageUrl, scheduledStartAt, participantSelectionType
        );
    }

    /**
     * 외부 선별 방식으로 참가자를 정하는 팬미팅인지 확인한다.
     *
     * @return 외부 선별 방식이면 true
     */
    public boolean isExternalSelection() {
        return participantSelectionType == ParticipantSelectionType.EXTERNAL_SELECTION;
    }

    /**
     * 초안 또는 응모 시작 전 공개 팬미팅의 기본 정보와 담당 인플루언서를 수정한다.
     *
     * @param influencer 변경할 인플루언서
     * @param title 변경할 제목
     * @param description 변경할 설명
     * @param coverImageUrl 변경할 커버 이미지 URL
     * @param scheduledStartAt 변경할 예정 시작 시각
     */
    public void update(User influencer, String title, String description,
                       String coverImageUrl, LocalDateTime scheduledStartAt) {
        if ((status != FanMeetingStatus.DRAFT && status != FanMeetingStatus.PUBLISHED)
                || deletedAt != null) {
            throw new IllegalStateException("응모 시작 전 팬미팅만 수정할 수 있습니다.");
        }
        this.influencer = Objects.requireNonNull(influencer);
        this.title = Objects.requireNonNull(title);
        this.description = description;
        this.coverImageUrl = coverImageUrl;
        this.scheduledStartAt = Objects.requireNonNull(scheduledStartAt);
    }

    /**
     * 초안 팬미팅을 공개 상태로 전환한다.
     *
     * @param publishedAt 공개 시각
     */
    public void publish(LocalDateTime publishedAt) {
        if (status != FanMeetingStatus.DRAFT || deletedAt != null) {
            throw new IllegalStateException("초안 상태의 팬미팅만 게시할 수 있습니다.");
        }
        this.status = FanMeetingStatus.PUBLISHED;
        this.publishedAt = Objects.requireNonNull(publishedAt);
    }

    /**
     * 공개 전 초안 팬미팅을 논리 삭제한다.
     *
     * @param deletedAt 삭제 시각
     */
    public void deleteDraft(LocalDateTime deletedAt) {
        if (status != FanMeetingStatus.DRAFT || this.deletedAt != null) {
            throw new IllegalStateException("초안 상태의 팬미팅만 삭제할 수 있습니다.");
        }
        this.deletedAt = Objects.requireNonNull(deletedAt);
    }

    /**
     * 공개된 팬미팅을 취소 상태로 전환한다.
     *
     * @param canceledAt 취소 시각
     */
    public void cancel(LocalDateTime canceledAt) {
        if (status == FanMeetingStatus.DRAFT || status == FanMeetingStatus.LIVE
                || status == FanMeetingStatus.ENDED || status == FanMeetingStatus.CANCELED
                || deletedAt != null) {
            throw new IllegalStateException("현재 상태의 팬미팅은 취소할 수 없습니다.");
        }
        this.status = FanMeetingStatus.CANCELED;
        this.canceledAt = Objects.requireNonNull(canceledAt);
    }

    /** 응모 시작 시각이 지난 공개 팬미팅을 응모 접수 상태로 전환한다. */
    public void openApplications() {
        if (status != FanMeetingStatus.PUBLISHED) {
            throw new IllegalStateException("공개 상태의 팬미팅만 응모를 시작할 수 있습니다.");
        }
        this.status = FanMeetingStatus.APPLICATION_OPEN;
    }

    /** 응모 종료 시각이 지난 팬미팅을 응모 마감 상태로 전환한다. */
    public void closeApplications() {
        if (status != FanMeetingStatus.APPLICATION_OPEN) {
            throw new IllegalStateException("응모 중인 팬미팅만 응모를 마감할 수 있습니다.");
        }
        this.status = FanMeetingStatus.APPLICATION_CLOSED;
    }

    /**
     * 참가자 선정과 운영 준비가 끝난 팬미팅을 시작 대기 상태로 전환한다.
     *
     * <p>응모 방식은 추첨이 끝난 응모 마감 상태에서만 준비 완료로 넘어간다. 외부 선별 방식은
     * 응모 단계를 거치지 않고 공개 상태에서 명단을 확정하므로 공개 상태에서도 허용한다.
     *
     * @throws IllegalStateException 선별 방식에 맞는 상태가 아닌 경우
     */
    public void markReady() {
        boolean externalSelectionReady =
                isExternalSelection() && status == FanMeetingStatus.PUBLISHED;
        if (status != FanMeetingStatus.APPLICATION_CLOSED && !externalSelectionReady) {
            throw new IllegalStateException("응모가 마감된 팬미팅만 준비 완료 처리할 수 있습니다.");
        }
        this.status = FanMeetingStatus.READY;
    }

    /**
     * 시작 대기 중인 팬미팅을 진행 상태로 전환한다.
     *
     * @param actualStartAt 실제 시작 시각
     */
    public void start(LocalDateTime actualStartAt) {
        if (status != FanMeetingStatus.READY) {
            throw new IllegalStateException("준비 완료 상태의 팬미팅만 시작할 수 있습니다.");
        }
        this.status = FanMeetingStatus.LIVE;
        this.actualStartAt = Objects.requireNonNull(actualStartAt);
    }

    /**
     * 진행 중인 팬미팅을 종료 상태로 전환한다.
     *
     * @param actualEndAt 실제 종료 시각
     */
    public void end(LocalDateTime actualEndAt) {
        if (status == FanMeetingStatus.ENDED) {
            return;
        }
        if (status != FanMeetingStatus.LIVE) {
            throw new IllegalStateException("진행 중인 팬미팅만 종료할 수 있습니다.");
        }
        this.status = FanMeetingStatus.ENDED;
        this.actualEndAt = Objects.requireNonNull(actualEndAt);
    }
}
