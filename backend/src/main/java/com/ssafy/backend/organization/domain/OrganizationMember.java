package com.ssafy.backend.organization.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
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

/**
 * 조직과 사용자 사이의 소속 관계를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(
        name = "organization_members",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_organization_members_organization_user",
                columnNames = {"organization_id", "user_id"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrganizationMember extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "organization_member_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "member_type", nullable = false, length = 30)
    private OrganizationMemberType memberType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OrganizationMemberStatus status;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @Column(name = "left_at")
    private LocalDateTime leftAt;

    /** 조직 소속 정보를 생성한다. */
    private OrganizationMember(Organization organization, User user,
                               OrganizationMemberType memberType, LocalDateTime joinedAt) {
        this.organization = organization;
        this.user = user;
        this.memberType = memberType;
        this.status = OrganizationMemberStatus.ACTIVE;
        this.joinedAt = joinedAt;
        this.leftAt = null;
    }

    /**
     * 사용자를 조직의 활성 구성원으로 등록한다.
     *
     * @param organization 소속 조직
     * @param user 소속 사용자
     * @param memberType 조직 내 역할
     * @param joinedAt 가입 시각
     * @return 생성된 활성 조직 소속
     */
    public static OrganizationMember join(Organization organization, User user,
                                          OrganizationMemberType memberType,
                                          LocalDateTime joinedAt) {
        return new OrganizationMember(organization, user, memberType, joinedAt);
    }

    /**
     * 종료된 조직 소속을 다시 활성화한다.
     *
     * @param memberType 다시 부여할 조직 내 역할
     * @param joinedAt 재가입 시각
     */
    public void reactivate(OrganizationMemberType memberType, LocalDateTime joinedAt) {
        this.memberType = memberType;
        this.status = OrganizationMemberStatus.ACTIVE;
        this.joinedAt = joinedAt;
        this.leftAt = null;
    }

    /**
     * 조직 소속을 삭제하지 않고 비활성 상태로 종료한다.
     *
     * @param leftAt 소속 종료 시각
     */
    public void deactivate(LocalDateTime leftAt) {
        this.status = OrganizationMemberStatus.INACTIVE;
        this.leftAt = leftAt;
    }
}
