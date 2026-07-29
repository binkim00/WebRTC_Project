package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.ApplicationQuestion;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 응모 질문 영속성 처리를 담당한다.
 */
public interface ApplicationQuestionRepository extends JpaRepository<ApplicationQuestion, Long> {
}
