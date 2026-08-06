package com.ssafy.backend.auth.domain;

import com.ssafy.backend.common.entity.BaseCreatedTimeEntity;
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

import java.util.Objects;

/**
 * 외부 소셜 공급자 계정과 Melly 사용자의 연결이다.
 *
 * <p>{@code users}에 공급자 컬럼을 붙이지 않고 별도 테이블로 분리한 이유는 한 사용자가
 * 여러 공급자를 동시에 연결할 수 있어야 하고, 기존 아이디·비밀번호 계정 구조를 그대로 두어야 하기 때문이다.
 *
 * <p>연결은 만들고 끊는 동작만 있어 수정 시각이 필요 없으므로 {@link BaseCreatedTimeEntity}를 상속한다.
 */
@Getter
@Entity
@Table(
        name = "social_accounts",
        uniqueConstraints = {
                // 같은 소셜 계정이 두 명의 Melly 사용자에게 연결되면 로그인 시 누구인지 결정할 수 없다.
                @UniqueConstraint(
                        name = "uk_social_accounts_provider_user",
                        columnNames = {"provider", "provider_user_id"}
                ),
                // 한 사용자가 같은 공급자를 두 개 연결하면 연결 해제 대상을 특정할 수 없다.
                // 앞선 컬럼이 user_id 라서 사용자별 연결 목록 조회 색인으로도 함께 쓰인다.
                @UniqueConstraint(
                        name = "uk_social_accounts_user_provider",
                        columnNames = {"user_id", "provider"}
                )
        }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SocialAccount extends BaseCreatedTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "social_account_id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 20)
    private SocialProvider provider;

    /**
     * 공급자가 발급한 변하지 않는 사용자 식별자다.
     *
     * <p>숫자형으로 두면 안 된다. 구글 {@code sub}는 21자리라 {@code BIGINT} 범위를 넘고,
     * 네이버는 43자 영숫자 문자열을 준다. 카카오만 보고 숫자 컬럼으로 설계하면 나머지 두 공급자가 깨진다.
     */
    @Column(name = "provider_user_id", nullable = false, length = 255)
    private String providerUserId;

    /**
     * 사용자와 공급자 계정의 연결을 생성한다.
     *
     * @param user 연결할 Melly 사용자
     * @param provider 소셜 공급자
     * @param providerUserId 공급자가 발급한 변하지 않는 사용자 식별자
     * @return 저장 전 연결 엔티티
     */
    public static SocialAccount link(User user, SocialProvider provider, String providerUserId) {
        SocialAccount account = new SocialAccount();
        account.user = Objects.requireNonNull(user);
        account.provider = Objects.requireNonNull(provider);
        account.providerUserId = Objects.requireNonNull(providerUserId);
        return account;
    }
}
