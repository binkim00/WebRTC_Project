package com.ssafy.backend.queue.repository;

import com.ssafy.backend.queue.domain.QueueChangeRequest;
import com.ssafy.backend.queue.domain.QueueChangeRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 대기 순서 변경 요청 영속성 처리를 담당한다.
 */
public interface QueueChangeRequestRepository extends JpaRepository<QueueChangeRequest, Long> {
    /** 대기열 항목에 아직 처리되지 않은 변경 요청이 있는지 확인한다. */
    boolean existsByQueueEntry_IdAndStatus(Long queueEntryId, QueueChangeRequestStatus status);

    /** 팬미팅에 속하는 특정 순서 변경 요청을 조회한다. */
    Optional<QueueChangeRequest> findByIdAndQueueEntry_Meeting_Id(Long id, Long meetingId);
}
