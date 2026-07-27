package com.ssafy.backend.call.repository;

import com.ssafy.backend.call.domain.CallSession;
import com.ssafy.backend.call.domain.CallSessionStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.Optional;

/**
 * 영상통화 세션 영속성 처리를 담당한다.
 */
public interface CallSessionRepository extends JpaRepository<CallSession, Long> {

    /**
     * LiveKit 입장 권한 검증에 필요한 통화 세션과 연관 정보를 함께 조회한다.
     *
     * @param callSessionId 통화 세션 식별자
     * @return 대기열, 참가자, 팬미팅 운영자가 함께 조회된 통화 세션
     */
    @EntityGraph(attributePaths = {
            "queueEntry",
            "queueEntry.participant",
            "queueEntry.participant.fan",
            "queueEntry.meeting",
            "queueEntry.meeting.influencer",
            "queueEntry.meeting.manager",
            "queueEntry.meeting.organization"
    })
    Optional<CallSession> findAccessContextById(Long callSessionId);

    /**
     * 대기열 항목에 이미 생성된 영상통화 세션을 조회한다.
     *
     * @param queueEntryId 대기열 항목 식별자
     * @return 해당 대기열 항목의 영상통화 세션
     */
    Optional<CallSession> findByQueueEntry_Id(Long queueEntryId);

    /**
     * 팬미팅에 지정 상태의 영상통화 세션이 존재하는지 확인한다.
     *
     * @param meetingId 팬미팅 식별자
     * @param statuses 확인할 영상통화 세션 상태
     * @return 지정 상태의 세션이 하나라도 있으면 true
     */
    boolean existsByQueueEntry_Meeting_IdAndStatusIn(
            Long meetingId, Collection<CallSessionStatus> statuses);
}
