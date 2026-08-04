package com.ssafy.backend.auth.domain;

import com.ssafy.backend.common.entity.BaseTimeEntity;
import com.ssafy.backend.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 이메일 소유 확인에 사용하는 단발성 인증 토큰이다.
 *
 * <p>원문 토큰은 메일로만 전달하고 DB에는 해시만 저장한다. DB가 유출되어도 저장된 값으로
 * 인증을 통과할 수 없어야 하기 때문이다.
 */
@Entity
@Table(
        name = "email_verification_tokens",
        indexes = @Index(name = "idx_email_verification_tokens_user", columnList = "user_id")
)
public class EmailVerificationToken extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "email_verification_token_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "token_hash", nullable = false, unique = true, length = 128)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "consumed_at")
    private LocalDateTime consumedAt;

    /** JPA가 엔티티를 조회해 객체로 만들 때 사용하는 기본 생성자다. */
    protected EmailVerificationToken() {
    }

    /**
     * 사용자에게 발급한 인증 토큰의 해시와 만료 시각을 기록한다.
     *
     * @param user 인증 대상 사용자
     * @param tokenHash 원문 토큰의 해시
     * @param expiresAt 인증 링크가 만료되는 시각
     * @return 아직 사용되지 않은 인증 토큰
     */
    public static EmailVerificationToken issue(User user, String tokenHash, LocalDateTime expiresAt) {
        EmailVerificationToken token = new EmailVerificationToken();
        token.user = Objects.requireNonNull(user);
        token.tokenHash = Objects.requireNonNull(tokenHash);
        token.expiresAt = Objects.requireNonNull(expiresAt);
        token.consumedAt = null;
        return token;
    }

    /**
     * 토큰을 사용 완료 상태로 전환한다.
     *
     * @param now 사용 시각
     * @throws IllegalStateException 이미 사용했거나 만료된 토큰인 경우
     */
    public void consume(LocalDateTime now) {
        if (consumedAt != null) {
            throw new IllegalStateException("이미 사용한 인증 토큰입니다.");
        }
        if (isExpired(now)) {
            throw new IllegalStateException("만료된 인증 토큰입니다.");
        }
        this.consumedAt = now;
    }

    /**
     * 기준 시각에 만료된 토큰인지 확인한다.
     *
     * @param now 비교 기준 시각
     * @return 만료되었으면 true
     */
    public boolean isExpired(LocalDateTime now) {
        return !now.isBefore(expiresAt);
    }

    /** 데이터베이스가 생성한 토큰 식별자를 반환한다. */
    public Long getId() { return id; }
    /** 인증 대상 사용자를 반환한다. */
    public User getUser() { return user; }
    /** 저장된 토큰 해시를 반환한다. */
    public String getTokenHash() { return tokenHash; }
    /** 인증 링크 만료 시각을 반환한다. */
    public LocalDateTime getExpiresAt() { return expiresAt; }
    /** 토큰을 사용한 시각을 반환하며, 사용하지 않았으면 null이다. */
    public LocalDateTime getConsumedAt() { return consumedAt; }
}
