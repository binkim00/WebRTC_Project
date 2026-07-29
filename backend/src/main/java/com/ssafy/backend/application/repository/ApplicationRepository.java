package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.Application;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 팬미팅 응모 영속성 처리를 담당한다.
 */
public interface ApplicationRepository extends JpaRepository<Application, Long> {
}
