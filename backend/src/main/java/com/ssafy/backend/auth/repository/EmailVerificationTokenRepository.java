package com.ssafy.backend.auth.repository;

import com.ssafy.backend.auth.domain.EmailVerificationToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

/** 이메일 인증 토큰 영속성 처리를 담당한다. */
public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, Long> {

    /**
     * 토큰 해시로 발급 이력을 조회한다.
     *
     * @param tokenHash 토큰 원문의 HMAC-SHA-256 해시
     * @return 일치하는 인증 토큰이 있으면 해당 토큰을 담은 Optional
     */
    Optional<EmailVerificationToken> findByTokenHash(String tokenHash);

    /**
     * 사용자에게 남아 있는 미사용 토큰을 한 번에 사용 완료로 처리한다.
     *
     * <p>새 인증 메일을 보낼 때마다 이전 링크를 무효화해 동시에 살아 있는 링크가 하나만 되게 한다.
     *
     * @param userId 대상 사용자 식별자
     * @param consumedAt 사용 완료로 기록할 시각
     * @return 무효화된 토큰 수
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update EmailVerificationToken token
            set token.consumedAt = :consumedAt
            where token.user.id = :userId and token.consumedAt is null
            """)
    int consumeAllByUserId(@Param("userId") Long userId, @Param("consumedAt") LocalDateTime consumedAt);

    /**
     * 보관 기간이 지난 토큰을 삭제한다.
     *
     * <p>인증 토큰 해시도 목적을 달성하면 남길 이유가 없어 만료분을 정리한다.
     *
     * @param threshold 이 시각보다 먼저 만료된 토큰을 삭제한다
     * @return 삭제된 토큰 수
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("delete from EmailVerificationToken token where token.expiresAt < :threshold")
    int deleteAllExpiredBefore(@Param("threshold") LocalDateTime threshold);
}
