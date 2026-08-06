package com.ssafy.backend.auth.repository;

import com.ssafy.backend.auth.domain.SocialAccount;
import com.ssafy.backend.auth.domain.SocialProvider;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** 소셜 공급자 계정과 사용자 연결의 영속성 처리를 담당한다. */
public interface SocialAccountRepository extends JpaRepository<SocialAccount, Long> {

    /**
     * 공급자와 공급자 사용자 식별자로 연결을 조회한다.
     *
     * <p>소셜 로그인의 첫 분기점이다. 결과가 있으면 이미 연결된 계정이라 바로 로그인시키고,
     * 없으면 신규 가입 또는 기존 계정 연결 흐름으로 보낸다.
     *
     * @param provider 소셜 공급자
     * @param providerUserId 공급자가 발급한 변하지 않는 사용자 식별자
     * @return 연결이 있으면 해당 연결을 담은 Optional
     */
    Optional<SocialAccount> findByProviderAndProviderUserId(SocialProvider provider, String providerUserId);

    /**
     * 공급자 계정으로 연결과 사용자를 한 번에 조회한다.
     *
     * <p>로그인 처리는 트랜잭션 밖에서 사용자 정보를 읽으므로 지연 로딩에 기대면
     * 영속성 컨텍스트가 닫힌 뒤 접근하게 된다. 조회 시점에 함께 가져와 그 위험을 없앤다.
     *
     * @param provider 소셜 공급자
     * @param providerUserId 공급자가 발급한 변하지 않는 사용자 식별자
     * @return 연결이 있으면 사용자까지 채워진 연결을 담은 Optional
     */
    @Query("""
            select account from SocialAccount account
            join fetch account.user
            where account.provider = :provider and account.providerUserId = :providerUserId
            """)
    Optional<SocialAccount> findWithUserByProviderAndProviderUserId(
            @Param("provider") SocialProvider provider,
            @Param("providerUserId") String providerUserId);

    /**
     * 사용자에게 연결된 특정 공급자의 연결을 조회한다.
     *
     * @param userId 대상 사용자 식별자
     * @param provider 소셜 공급자
     * @return 연결이 있으면 해당 연결을 담은 Optional
     */
    Optional<SocialAccount> findByUser_IdAndProvider(Long userId, SocialProvider provider);

    /**
     * 사용자에게 연결된 소셜 계정을 공급자 순서로 조회한다.
     *
     * <p>마이페이지의 연결된 계정 목록에서 표시 순서가 매번 달라지지 않도록 정렬한다.
     *
     * @param userId 대상 사용자 식별자
     * @return 연결 목록이며 연결이 없으면 빈 목록
     */
    List<SocialAccount> findAllByUser_IdOrderByProviderAsc(Long userId);

    /**
     * 사용자에게 연결된 소셜 계정 수를 조회한다.
     *
     * <p>연결 해제 시 마지막 로그인 수단을 지우는지 판단하는 데 쓴다.
     *
     * @param userId 대상 사용자 식별자
     * @return 연결 수
     */
    long countByUser_Id(Long userId);

    /**
     * 사용자의 모든 소셜 연결을 삭제한다.
     *
     * <p>탈퇴 시 연결을 남기면 {@code (provider, provider_user_id)} 유니크 제약 때문에
     * 같은 소셜 계정으로 다시 가입할 때 탈퇴 처리된 계정으로 로그인된다.
     *
     * @param userId 대상 사용자 식별자
     * @return 삭제된 연결 수
     */
    long deleteByUser_Id(Long userId);
}
