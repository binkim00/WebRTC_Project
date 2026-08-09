package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.ApplicationAnswer;
import com.ssafy.backend.application.domain.ApplicationStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

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

    /**
     * 여러 응모의 답변을 질문 표시 순서대로 한 번에 조회한다.
     *
     * <p>응모별로 답변을 개별 조회하면 N+1이 되므로 목록 조회는 이 메서드로 모아 읽는다.
     *
     * @param applicationIds 조회할 응모 식별자 목록
     * @return 질문 표시 순서대로 정렬된 답변 목록
     */
    @EntityGraph(attributePaths = {"question"})
    List<ApplicationAnswer> findAllByApplication_IdInOrderByQuestion_DisplayOrderAsc(
            Collection<Long> applicationIds
    );

    /**
     * 지정 상태를 제외한 응모를 대상으로 질문별 응답 수를 집계한다.
     *
     * @param applicationFormId 응모 폼 식별자
     * @param excludedStatus 집계에서 제외할 응모 상태
     * @return 질문별 응답 수 집계 목록
     */
    @Query("""
            select answer.question.id as questionId, count(answer.id) as responseCount
            from ApplicationAnswer answer
            where answer.question.applicationForm.id = :applicationFormId
              and answer.application.status <> :excludedStatus
            group by answer.question.id
            """)
    List<QuestionResponseCount> countResponsesByQuestion(
            @Param("applicationFormId") Long applicationFormId,
            @Param("excludedStatus") ApplicationStatus excludedStatus
    );

    /** 질문별 응답 수 집계 결과다. */
    interface QuestionResponseCount {

        /** 집계 대상 질문 식별자를 반환한다. */
        Long getQuestionId();

        /** 해당 질문의 응답 수를 반환한다. */
        long getResponseCount();
    }
}
