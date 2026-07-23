package com.ssafy.backend.user.repository;

import com.ssafy.backend.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
    /** 같은 로그인 ID를 가진 사용자가 존재하는지 확인한다. */
    boolean existsByLoginId(String loginId);
    /** 같은 이메일을 가진 사용자가 존재하는지 확인한다. */
    boolean existsByEmail(String email);
}
