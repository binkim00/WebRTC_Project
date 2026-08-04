package com.ssafy.backend.auth.repository;

import com.ssafy.backend.auth.domain.EmailVerificationToken;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

/** 이메일 인증 토큰 영속성 처리를 담당한다. */
public interface EmailVerificationTokenRepository extends JpaRepository<EmailVerificationToken, Long> {

    /**
     * 토큰 해시로 인증 대상 사용자까지 함께 조회한다.
     *
     * <p>확인 요청은 비로그인 상태로도 들어오므로 토큰에서 사용자를 찾아야 한다.
     *
     * @param tokenHash 조회할 토큰 해시
     * @return 사용자를 함께 조회한 인증 토큰
     */
    @EntityGraph(attributePaths = {"user"})
    Optional<EmailVerificationToken> findByTokenHash(String tokenHash);

    /**
     * 사용자의 아직 사용하지 않은 인증 토큰을 모두 사용 완료로 표시한다.
     *
     * <p>새 인증 메일을 보내면 이전 링크는 더 이상 유효하지 않아야 한다.
     * 여러 건을 개별 조회해 상태를 바꾸는 대신 한 번의 갱신으로 처리한다.
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
}
