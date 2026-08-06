package com.ssafy.backend.queue.repository;

import com.ssafy.backend.queue.domain.QueueChangeRequest;
import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * 대기 순서 변경 요청 영속성 처리를 담당한다.
 */
public interface QueueChangeRequestRepository extends JpaRepository<QueueChangeRequest, Long> {
    /** 대기열 항목에 기존 순서 변경 요청이 한 번이라도 있었는지 확인한다. */
    boolean existsByQueueEntry_Id(Long queueEntryId);

    /** 대기열 항목에 아직 처리되지 않은 변경 요청이 있는지 확인한다. */
    boolean existsByQueueEntry_IdAndStatus(Long queueEntryId, QueueChangeRequestStatus status);

    /** 팬미팅에 속하는 특정 순서 변경 요청을 조회한다. */
    Optional<QueueChangeRequest> findByIdAndQueueEntry_Meeting_Id(Long id, Long meetingId);

    /**
     * 팬미팅의 순서 변경 요청을 팬 정보와 함께 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param pageable 페이지 요청 정보
     * @return 팬미팅의 순서 변경 요청 페이지
     */
    @EntityGraph(attributePaths = {"queueEntry", "queueEntry.participant",
            "queueEntry.participant.fan"})
    Page<QueueChangeRequest> findByQueueEntry_Meeting_Id(Long meetingId, Pageable pageable);

    /**
     * 팬미팅의 순서 변경 요청을 처리 상태로 걸러 팬 정보와 함께 페이지 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param status 조회할 처리 상태
     * @param pageable 페이지 요청 정보
     * @return 조건에 맞는 순서 변경 요청 페이지
     */
    @EntityGraph(attributePaths = {"queueEntry", "queueEntry.participant",
            "queueEntry.participant.fan"})
    Page<QueueChangeRequest> findByQueueEntry_Meeting_IdAndStatus(
            Long meetingId, QueueChangeRequestStatus status, Pageable pageable);

    /**
     * 중복 처리를 막기 위해 순서 변경 요청을 비관적 쓰기 잠금으로 조회한다.
     *
     * @param requestId 순서 변경 요청 식별자
     * @return 잠금이 적용된 순서 변경 요청
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from QueueChangeRequest r join fetch r.queueEntry q join fetch q.meeting "
            + "where r.id = :requestId")
    Optional<QueueChangeRequest> findByIdForUpdate(@Param("requestId") Long requestId);
}
