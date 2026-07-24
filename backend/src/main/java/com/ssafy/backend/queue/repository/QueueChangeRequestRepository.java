package com.ssafy.backend.queue.repository;

import com.ssafy.backend.queue.domain.QueueChangeRequest;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 대기 순서 변경 요청 영속성 처리를 담당한다.
 */
public interface QueueChangeRequestRepository extends JpaRepository<QueueChangeRequest, Long> {
}
