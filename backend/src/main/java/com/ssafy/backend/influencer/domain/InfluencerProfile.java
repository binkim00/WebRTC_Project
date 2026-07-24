package com.ssafy.backend.influencer.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 인플루언서의 공개 프로필 정보를 저장하는 엔티티다.
 */
@Getter
@Entity
@Table(name = "influencer_profiles")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InfluencerProfile extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "influencer_profile_id", nullable = false)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(name = "activity_name", nullable = false, length = 100)
    private String activityName;

    @Column(name = "introduction", columnDefinition = "TEXT")
    private String introduction;

    @Column(name = "banner_image_url", length = 2048)
    private String bannerImageUrl;

    @Column(name = "category", length = 100)
    private String category;

    @Column(name = "social_url", length = 2048)
    private String socialUrl;
}
