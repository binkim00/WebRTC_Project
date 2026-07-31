package com.ssafy.backend.participant.repository;

import com.ssafy.backend.participant.domain.Participant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

import java.util.List;
import java.util.Optional;

/**
 * 팬미팅 참가자 영속성 처리를 담당한다.
 */
public interface ParticipantRepository extends JpaRepository<Participant, Long> {
    /** 팬미팅 참가자를 배정 순번대로 조회한다. */
    @EntityGraph(attributePaths = {"fan", "meeting"})
    List<Participant> findByMeeting_IdOrderByAssignedOrderAsc(Long meetingId);

    /** 팬미팅과 팬 사용자 식별자로 참가자를 조회한다. */
    @EntityGraph(attributePaths = {"fan", "meeting"})
    Optional<Participant> findByMeeting_IdAndFan_Id(Long meetingId, Long fanId);
}
