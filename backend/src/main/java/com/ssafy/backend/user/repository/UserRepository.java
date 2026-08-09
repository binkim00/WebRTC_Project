package com.ssafy.backend.user.repository;

import com.ssafy.backend.user.domain.User;
import com.ssafy.backend.user.domain.UserRole;
import com.ssafy.backend.user.domain.UserStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    /** 같은 로그인 ID를 가진 사용자가 존재하는지 확인한다. */
    boolean existsByLoginId(String loginId);
    /** 같은 이메일을 가진 사용자가 존재하는지 확인한다. */
    boolean existsByEmail(String email);

    /**
     * 같은 닉네임을 쓰는 사용자가 존재하는지 확인한다.
     *
     * <p>{@code nickname} 컬럼에는 UNIQUE 제약이 없다. 이미 중복 닉네임을 가진 기존 회원이 있을 수
     * 있어 제약을 새로 걸면 운영 스키마 검증이 실패하기 때문이다. 그래서 이 검사는 가입 화면의
     * 중복 확인과 가입 시점 재확인에만 쓰이며, 같은 순간에 들어온 두 요청까지 막지는 못한다.
     *
     * @param nickname 확인할 닉네임
     * @return 같은 닉네임을 쓰는 회원이 있으면 {@code true}
     */
    boolean existsByNickname(String nickname);

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
     * 이메일이 일치하는 사용자를 조회한다.
     *
     * <p>소셜 로그인에서 아직 연결되지 않은 계정을 만났을 때, 같은 이메일로 이미 가입한 회원이
     * 있는지 확인해 신규 가입과 기존 계정 연결 중 어디로 보낼지 결정하는 데 쓴다.
     *
     * @param email 조회할 정규화된 이메일
     * @return 일치하는 사용자가 있으면 해당 사용자를 담은 Optional
     */
    Optional<User> findByEmail(String email);

    /**
     * 지정한 역할과 상태를 함께 만족하는 회원 수를 조회한다.
     *
     * @param role 집계할 역할
     * @param status 집계할 계정 상태
     * @return 조건을 만족하는 회원 수
     */
    long countByRoleAndStatus(UserRole role, UserStatus status);

    /**
     * 외부 선별 명단의 이메일에 해당하는 회원을 한 번에 조회한다.
     *
     * <p>명단 행마다 조회하지 않도록 정규화된 이메일 목록으로 일괄 조회한다.
     *
     * @param emails 소문자로 정규화된 이메일 목록
     * @return 이메일이 일치하는 회원 목록이며 가입하지 않은 이메일은 결과에 없다
     */
    List<User> findAllByEmailIn(Collection<String> emails);

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
