package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.ApplicationOption;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

/**
 * 응모 질문 선택지 영속성 처리를 담당한다.
 */
public interface ApplicationOptionRepository extends JpaRepository<ApplicationOption, Long> {

    /**
     * 여러 질문의 삭제되지 않은 선택지를 표시 순서대로 한 번에 조회한다.
     *
     * <p>질문마다 개별 조회하면 N+1이 되므로 폼 조회·저장은 이 메서드로 모아 읽는다.
     *
     * @param questionIds 조회할 질문 식별자 목록
     * @return 표시 순서대로 정렬된 선택지 목록
     */
    List<ApplicationOption> findAllByQuestion_IdInAndDeletedAtIsNullOrderByDisplayOrderAsc(
            Collection<Long> questionIds
    );
}
