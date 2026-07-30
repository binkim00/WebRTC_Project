package com.ssafy.backend.application.repository;

import com.ssafy.backend.application.domain.Application;
import com.ssafy.backend.application.domain.ApplicationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

import java.util.List;
import java.util.Optional;

/**
 * 팬미팅 응모 영속성 처리를 담당한다.
 */
public interface ApplicationRepository extends JpaRepository<Application, Long> {

    /** 팬미팅의 전체 응모 수를 반환한다. */
    long countByMeeting_Id(Long meetingId);

    /**
     * 팬미팅에서 지정 상태를 제외한 응모 수를 반환한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param excludedStatus 집계에서 제외할 응모 상태
     * @return 제외 상태를 뺀 응모 수
     */
    long countByMeeting_IdAndStatusNot(Long meetingId, ApplicationStatus excludedStatus);

    /** 팬미팅과 팬 식별자로 응모 결과를 조회한다. */
    Optional<Application> findByMeeting_IdAndFan_Id(Long meetingId, Long fanId);

    /** 팬미팅 취소 알림 대상 팬을 포함해 모든 응모를 조회한다. */
    @EntityGraph(attributePaths = {"fan"})
    List<Application> findAllByMeeting_Id(Long meetingId);

    /**
     * 팬미팅에서 지정 상태를 제외하고 알림 대상 팬을 포함한 응모를 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param excludedStatus 조회에서 제외할 응모 상태
     * @return 제외 상태를 뺀 응모 목록
     */
    @EntityGraph(attributePaths = {"fan"})
    List<Application> findAllByMeeting_IdAndStatusNot(
            Long meetingId, ApplicationStatus excludedStatus
    );
}
