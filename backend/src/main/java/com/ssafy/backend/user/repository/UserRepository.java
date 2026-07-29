package com.ssafy.backend.user.repository;

import com.ssafy.backend.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    /** 같은 로그인 ID를 가진 사용자가 존재하는지 확인한다. */
    boolean existsByLoginId(String loginId);
    /** 같은 이메일을 가진 사용자가 존재하는지 확인한다. */
    boolean existsByEmail(String email);

    /**
     * 로그인 ID가 일치하는 사용자를 조회한다.
     *
     * @param loginId 조회할 로그인 ID
     * @return 일치하는 사용자가 있으면 해당 사용자를 담은 Optional
     */
    Optional<User> findByLoginId(String loginId);
}
