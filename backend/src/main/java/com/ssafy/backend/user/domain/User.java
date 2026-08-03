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

    private static final String WITHDRAWN_PREFIX = "withdrawn_";
    private static final String WITHDRAWN_EMAIL_DOMAIN = "@withdrawn.invalid";
    private static final String WITHDRAWN_NICKNAME = "탈퇴한 사용자";
    private static final String WITHDRAWN_PASSWORD = "WITHDRAWN";

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
    @Enumerated(EnumType.STRING)
    private PreferredLanguage preferredLanguage;

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
                 UserRole role, PreferredLanguage preferredLanguage) {
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
                                    UserRole role, PreferredLanguage preferredLanguage) {
        return new User(loginId, email, encodedPassword, nickname, role, preferredLanguage);
    }

    /**
     * 인증에 성공한 가장 최근 시각을 갱신한다.
     *
     * @param loginAt 마지막 로그인 시각
     */
    public void updateLastLoginAt(LocalDateTime loginAt) {
        this.lastLoginAt = loginAt;
    }

    /**
     * 전달된 값만 회원의 수정 가능한 프로필 정보에 반영한다.
     *
     * @param nickname 변경할 닉네임, 변경하지 않으면 {@code null}
     * @param email 변경할 이메일, 변경하지 않으면 {@code null}
     * @param profileImageUrl 변경할 프로필 이미지 URL, 변경하지 않으면 {@code null}
     * @param preferredLanguage 변경할 선호 언어, 변경하지 않으면 {@code null}
     */
    public void updateProfile(String nickname, String email, String profileImageUrl,
                              PreferredLanguage preferredLanguage) {
        if (nickname != null) {
            this.nickname = nickname;
        }
        if (email != null) {
            this.email = email;
        }
        if (profileImageUrl != null) {
            this.profileImageUrl = profileImageUrl;
        }
        if (preferredLanguage != null) {
            this.preferredLanguage = preferredLanguage;
        }
    }

    /**
     * 계정을 탈퇴 상태로 전환하고 개인정보를 비식별화한다.
     * 연관 이력을 보존해야 하므로 행을 삭제하지 않고 식별 가능한 값만 지운다.
     *
     * @param withdrawnAt 탈퇴 처리 시각
     */
    public void withdraw(LocalDateTime withdrawnAt) {
        if (this.status == UserStatus.WITHDRAWN) {
            throw new IllegalStateException("이미 탈퇴한 계정입니다.");
        }
        this.status = UserStatus.WITHDRAWN;
        this.withdrawnAt = withdrawnAt;
        // loginId·email에 UNIQUE 제약이 있어 임의 문자열을 쓰면 재탈퇴나 동시 처리에서 충돌한다.
        // 식별자 기반의 결정적 값으로 바꿔 충돌을 원천 차단한다.
        this.loginId = WITHDRAWN_PREFIX + this.id;
        // .invalid는 RFC 2606 예약 TLD라 실제 메일이 발송될 수 없다.
        this.email = WITHDRAWN_PREFIX + this.id + WITHDRAWN_EMAIL_DOMAIN;
        this.nickname = WITHDRAWN_NICKNAME;
        // BCrypt 형식이 아니므로 어떤 비밀번호로도 매칭되지 않는다.
        this.password = WITHDRAWN_PASSWORD;
        this.profileImageUrl = null;
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
    public PreferredLanguage getPreferredLanguage() { return preferredLanguage; }
    /** 계정의 현재 활성 상태를 반환한다. */
    public UserStatus getStatus() { return status; }
    /** nullable 프로필 이미지 URL을 반환한다. */
    public String getProfileImageUrl() { return profileImageUrl; }
    /** 마지막 로그인 시각을 반환하며, 로그인 전에는 null이다. */
    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    /** 탈퇴 시각을 반환하며, 탈퇴하지 않은 계정은 null이다. */
    public LocalDateTime getWithdrawnAt() { return withdrawnAt; }
}
