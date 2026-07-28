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

    @Column(name = "scheduled_start_at", nullable = false)
    private LocalDateTime scheduledStartAt;

    @Column(name = "actual_start_at")
    private LocalDateTime actualStartAt;

    @Column(name = "actual_end_at")
    private LocalDateTime actualEndAt;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    private FanMeeting(Organization organization,
                       User manager,
                       User influencer,
                       String title,
                       String description,
                       String coverImageUrl,
                       LocalDateTime scheduledStartAt) {
        this.organization = organization;
        this.manager = manager;
        this.influencer = Objects.requireNonNull(influencer);
        this.title = Objects.requireNonNull(title);
        this.description = description;
        this.coverImageUrl = coverImageUrl;
        this.status = FanMeetingStatus.DRAFT;
        this.scheduledStartAt = Objects.requireNonNull(scheduledStartAt);
    }

    /**
     * 공개 전 초안 상태의 팬미팅을 생성한다.
     * 조직과 매니저는 1인 인플루언서가 생성하는 경우 null일 수 있다.
     */
    public static FanMeeting create(Organization organization,
                                    User manager,
                                    User influencer,
                                    String title,
                                    String description,
                                    String coverImageUrl,
                                    LocalDateTime scheduledStartAt) {
        return new FanMeeting(
                organization, manager, influencer, title,
                description, coverImageUrl, scheduledStartAt
        );
    }
}
