package com.ssafy.backend.participant.repository;

import com.ssafy.backend.participant.domain.Participant;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 팬미팅 참가자 영속성 처리를 담당한다.
 */
public interface ParticipantRepository extends JpaRepository<Participant, Long> {
}
