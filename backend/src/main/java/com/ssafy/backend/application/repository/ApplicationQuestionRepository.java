package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.ApplicationQuestion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 응모 질문 영속성 처리를 담당한다.
 */
public interface ApplicationQuestionRepository extends JpaRepository<ApplicationQuestion, Long> {

    /**
     * 응모 폼의 삭제되지 않은 질문을 표시 순서대로 조회한다.
     *
     * @param applicationFormId 응모 폼 식별자
     * @return 활성 응모 질문 목록
     */
    List<ApplicationQuestion> findAllByApplicationForm_IdAndDeletedAtIsNullOrderByDisplayOrderAsc(
            Long applicationFormId
    );
}
