package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.ApplicationAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 응모 답변 영속성 처리를 담당한다.
 */
public interface ApplicationAnswerRepository extends JpaRepository<ApplicationAnswer, Long> {

    /**
     * 재응모 전에 기존 응모에 저장된 답변을 모두 삭제한다.
     *
     * @param applicationId 응모 식별자
     */
    void deleteAllByApplication_Id(Long applicationId);
}
