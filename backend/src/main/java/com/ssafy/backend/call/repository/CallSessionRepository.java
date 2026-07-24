package com.ssafy.backend.call.repository;

import com.ssafy.backend.call.domain.CallSession;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 영상통화 세션 영속성 처리를 담당한다.
 */
public interface CallSessionRepository extends JpaRepository<CallSession, Long> {
}
