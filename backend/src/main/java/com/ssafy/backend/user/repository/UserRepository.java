package com.ssafy.backend.user.repository;

import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    /** 같은 로그인 ID를 가진 사용자가 존재하는지 확인한다. */
    boolean existsByLoginId(String loginId);
    /** 같은 이메일을 가진 사용자가 존재하는지 확인한다. */
    boolean existsByEmail(String email);

    /**
     * 지정한 사용자를 제외하고 같은 이메일을 사용하는 회원이 있는지 확인한다.
     *
     * @param email 중복 여부를 확인할 정규화된 이메일
     * @param id 중복 검사에서 제외할 현재 사용자 식별자
     * @return 다른 사용자가 해당 이메일을 사용하면 {@code true}
     */
    boolean existsByEmailAndIdNot(String email, Long id);

    /**
     * 로그인 ID가 일치하는 사용자를 조회한다.
     *
     * @param loginId 조회할 로그인 ID
     * @return 일치하는 사용자가 있으면 해당 사용자를 담은 Optional
     */
    Optional<User> findByLoginId(String loginId);

    /**
     * 지정한 역할과 상태를 함께 만족하는 회원 수를 조회한다.
     *
     * @param role 집계할 역할
     * @param status 집계할 계정 상태
     * @return 조건을 만족하는 회원 수
     */
    long countByRoleAndStatus(UserRole role, UserStatus status);

    /**
     * 조직 소속 변경이 끝날 때까지 사용자 행에 쓰기 잠금을 걸어 조회한다.
     *
     * @param userId 잠글 사용자 식별자
     * @return 잠금이 적용된 사용자
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.id = :userId")
    Optional<User> findByIdForUpdate(@Param("userId") Long userId);
}
