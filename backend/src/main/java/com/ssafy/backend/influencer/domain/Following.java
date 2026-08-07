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
import lombok.Getter;

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

    /** JPA가 엔티티를 생성할 때 사용하는 기본 생성자다. */
    protected Following() {
    }

    /**
     * 검증된 팬과 인플루언서 사이의 팔로우 관계를 생성한다.
     *
     * @param follower 팔로우를 요청한 팬
     * @param followedInfluencer 팔로우 대상 인플루언서
     */
    private Following(User follower, User followedInfluencer) {
        this.follower = follower;
        this.followedInfluencer = followedInfluencer;
    }

    /**
     * 검증된 팬과 인플루언서 사이의 팔로우 관계를 생성한다.
     *
     * @param follower 팔로우를 요청한 팬
     * @param followedInfluencer 팔로우 대상 인플루언서
     * @return 새 팔로우 관계
     */
    public static Following follow(User follower, User followedInfluencer) {
        return new Following(follower, followedInfluencer);
    }
}
