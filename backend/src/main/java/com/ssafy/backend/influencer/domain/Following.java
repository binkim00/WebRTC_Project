package com.ssafy.backend.influencer.domain;

import com.ssafy.backend.common.entity.BaseCreatedTimeEntity;
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
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 팬과 인플루언서의 팔로잉 관계를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(
        name = "followings",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_followings_follower_influencer",
                columnNames = {"follower_user_id", "followed_influencer_id"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Following extends BaseCreatedTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "following_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "follower_user_id", nullable = false)
    private User follower;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "followed_influencer_id", nullable = false)
    private User followedInfluencer;
}
