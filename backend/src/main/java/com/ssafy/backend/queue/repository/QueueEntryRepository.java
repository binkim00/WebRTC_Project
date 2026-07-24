package com.ssafy.backend.queue.repository;

import com.ssafy.backend.queue.domain.QueueEntry;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 대기열 항목 영속성 처리를 담당한다.
 */
public interface QueueEntryRepository extends JpaRepository<QueueEntry, Long> {
}
