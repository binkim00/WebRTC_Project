package com.ssafy.backend.queue.repository;

import com.ssafy.backend.queue.domain.QueueEntry;
import com.ssafy.backend.queue.domain.QueueEntryStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * 대기열 항목 영속성 처리를 담당한다.
 */
public interface QueueEntryRepository extends JpaRepository<QueueEntry, Long> {
    /** 팬미팅에 생성된 대기열 항목이 하나라도 있는지 확인한다. */
    boolean existsByMeeting_Id(Long meetingId);

    /** 팬미팅의 대기열을 순번대로 연관 참가자와 함께 조회한다. */
    @EntityGraph(attributePaths = {"participant", "participant.fan", "meeting"})
    List<QueueEntry> findByMeeting_IdOrderByQueuePositionAsc(Long meetingId);

    /** 팬미팅과 팬 사용자 식별자로 본인의 대기열 항목을 조회한다. */
    @EntityGraph(attributePaths = {"participant", "participant.fan", "meeting"})
    Optional<QueueEntry> findByMeeting_IdAndParticipant_Fan_Id(Long meetingId, Long fanId);

    /** 팬미팅과 대기열 식별자가 일치하는 항목을 조회한다. */
    @EntityGraph(attributePaths = {"participant", "participant.fan", "meeting"})
    Optional<QueueEntry> findByMeeting_IdAndId(Long meetingId, Long id);

    /** 팬미팅에서 지정한 상태인 첫 번째 대기열 항목을 조회한다. */
    Optional<QueueEntry> findFirstByMeeting_IdAndStatusOrderByQueuePositionAsc(
            Long meetingId, QueueEntryStatus status);

    /** 상태 변경을 위해 대기열 항목을 비관적 쓰기 잠금으로 조회한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from QueueEntry q join fetch q.participant p join fetch p.fan "
            + "where q.meeting.id = :meetingId and q.id = :entryId")
    Optional<QueueEntry> findForUpdate(@Param("meetingId") Long meetingId,
                                       @Param("entryId") Long entryId);

    /** 대기열 식별자로 항목과 팬미팅을 조회하면서 비관적 쓰기 잠금을 획득한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from QueueEntry q join fetch q.meeting m "
            + "join fetch q.participant p join fetch p.fan where q.id = :entryId")
    Optional<QueueEntry> findByIdForUpdate(@Param("entryId") Long entryId);

    /**
     * 팬미팅 종료 시 모든 대기열 항목을 한 번에 잠금 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 팬미팅의 전체 대기열 항목
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from QueueEntry q join fetch q.meeting where q.meeting.id = :meetingId")
    List<QueueEntry> findAllByMeetingIdForUpdate(@Param("meetingId") Long meetingId);
}
