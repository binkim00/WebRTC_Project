package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.ApplicationAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 응모 답변 영속성 처리를 담당한다.
 */
public interface ApplicationAnswerRepository extends JpaRepository<ApplicationAnswer, Long> {
}
