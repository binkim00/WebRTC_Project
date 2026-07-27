package com.ssafy.backend.meeting.repository;

import com.ssafy.backend.meeting.domain.FanMeeting;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * 팬미팅 영속성 처리를 담당한다.
 */
public interface FanMeetingRepository extends JpaRepository<FanMeeting, Long> {

    /**
     * 대기열 초기화를 직렬화하기 위해 팬미팅 행을 비관적 쓰기 잠금으로 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 잠금이 적용된 팬미팅
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from FanMeeting m where m.id = :meetingId")
    Optional<FanMeeting> findByIdForUpdate(@Param("meetingId") Long meetingId);
}
