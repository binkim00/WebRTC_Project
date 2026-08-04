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
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 이메일 소유 확인에 사용하는 단발성 인증 토큰이다.
 *
 * <p>메일로 보낸 토큰 원문은 저장하지 않고 HMAC-SHA-256 해시만 남긴다.
 * DB가 유출되어도 저장된 해시로 인증 링크를 되돌려 만들 수 없어야 하기 때문이다.
 */
@Getter
@Entity
@Table(
        name = "email_verification_tokens",
        indexes = @Index(
                name = "idx_email_verification_tokens_user",
                columnList = "user_id"
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
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

    /**
     * 사용자에게 발급한 인증 토큰의 해시와 만료 시각을 저장하는 엔티티를 생성한다.
     *
     * @param user 인증 대상 사용자
     * @param tokenHash 토큰 원문의 HMAC-SHA-256 해시
     * @param expiresAt 토큰 만료 시각
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
     * 기준 시각에 이 토큰을 사용할 수 있는지 확인한다.
     *
     * @param now 검증 기준 시각
     * @return 아직 사용되지 않았고 만료되지 않았으면 {@code true}
     */
    public boolean isUsable(LocalDateTime now) {
        return consumedAt == null && now.isBefore(expiresAt);
    }

    /**
     * 토큰을 사용 완료로 표시해 같은 링크를 두 번 쓸 수 없게 한다.
     *
     * @param consumedAt 사용 처리 시각
     * @throws IllegalStateException 이미 사용된 토큰인 경우
     */
    public void consume(LocalDateTime consumedAt) {
        if (this.consumedAt != null) {
            throw new IllegalStateException("이미 사용된 인증 토큰입니다.");
        }
        this.consumedAt = Objects.requireNonNull(consumedAt);
    }
}
