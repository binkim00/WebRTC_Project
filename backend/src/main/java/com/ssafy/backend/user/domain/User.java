package com.ssafy.backend.user.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id", nullable = false)
    private Long id;

    @Column(name = "login_id", nullable = false, unique = true, length = 100)
    private String loginId;

    @Column(name = "email", nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String password;

    @Column(name = "nickname", nullable = false, length = 50)
    private String nickname;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 30)
    private UserRole role;

    @Column(name = "preferred_language", nullable = false, length = 50)
    private String preferredLanguage;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private UserStatus status;

    @Column(name = "profile_image_url", length = 2048)
    private String profileImageUrl;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "withdrawn_at")
    private LocalDateTime withdrawnAt;

    /** JPA가 엔티티를 조회해 객체로 만들 때 사용하는 기본 생성자다. */
    protected User() {
    }

    /** 외부에서 직접 호출하지 못하도록 회원가입에 필요한 값으로 사용자 객체를 초기화한다. */
    private User(String loginId, String email, String password, String nickname,
                 UserRole role, String preferredLanguage) {
        this.loginId = loginId;
        this.email = email;
        this.password = password;
        this.nickname = nickname;
        this.role = role;
        this.preferredLanguage = preferredLanguage;
        // 가입 요청이 상태와 프로필 이미지를 조작하지 못하도록 서버 기본값을 강제한다.
        this.status = UserStatus.ACTIVE;
        this.profileImageUrl = null;
        this.lastLoginAt = null;
        this.withdrawnAt = null;
    }

    /** 신규 회원을 ACTIVE 상태와 빈 프로필 이미지로 생성한다. */
    public static User createActive(String loginId, String email, String encodedPassword, String nickname,
                                    UserRole role, String preferredLanguage) {
        return new User(loginId, email, encodedPassword, nickname, role, preferredLanguage);
    }

    /** 데이터베이스가 생성한 사용자 식별자를 반환한다. */
    public Long getId() { return id; }
    /** 로그인에 사용하는 고유 ID를 반환한다. */
    public String getLoginId() { return loginId; }
    /** 사용자의 이메일 주소를 반환한다. */
    public String getEmail() { return email; }
    /** 암호화되어 저장된 비밀번호를 반환한다. */
    public String getPassword() { return password; }
    /** 사용자에게 표시할 닉네임을 반환한다. */
    public String getNickname() { return nickname; }
    /** 계정에 지정된 단일 역할을 반환한다. */
    public UserRole getRole() { return role; }
    /** 사용자가 선호하는 언어 문자열을 반환한다. */
    public String getPreferredLanguage() { return preferredLanguage; }
    /** 계정의 현재 활성 상태를 반환한다. */
    public UserStatus getStatus() { return status; }
    /** nullable 프로필 이미지 URL을 반환한다. */
    public String getProfileImageUrl() { return profileImageUrl; }
    /** 마지막 로그인 시각을 반환하며, 로그인 전에는 null이다. */
    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    /** 탈퇴 시각을 반환하며, 탈퇴하지 않은 계정은 null이다. */
    public LocalDateTime getWithdrawnAt() { return withdrawnAt; }
}
