package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.ApplicationOption;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 응모 질문 선택지 영속성 처리를 담당한다.
 */
public interface ApplicationOptionRepository extends JpaRepository<ApplicationOption, Long> {
}
