package com.ssafy.backend.meeting.repository;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.Optional;

/**
 * 팬미팅 영속성 처리를 담당한다.
 */
public interface FanMeetingRepository extends JpaRepository<FanMeeting, Long>,
        JpaSpecificationExecutor<FanMeeting> {

    /**
     * 대기열 초기화를 직렬화하기 위해 팬미팅 행을 비관적 쓰기 잠금으로 조회한다.
     *
     * @param meetingId 팬미팅 식별자
     * @return 잠금이 적용된 팬미팅
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from FanMeeting m where m.id = :meetingId")
    Optional<FanMeeting> findByIdForUpdate(@Param("meetingId") Long meetingId);

    /**
     * 사용자가 주최자나 배정 매니저로 책임지고 있는 미종료 팬미팅이 있는지 확인한다.
     * 회원탈퇴(USER-003)에서 운영 중인 회차를 남기고 떠나는 것을 막기 위해 사용한다.
     *
     * @param userId 확인할 사용자 식별자
     * @param statuses 운영 책임이 남아 있다고 판단할 팬미팅 상태
     * @return 삭제되지 않은 해당 상태의 팬미팅이 하나라도 있으면 {@code true}
     */
    @Query("""
            select count(meeting) > 0 from FanMeeting meeting
            where meeting.deletedAt is null
              and meeting.status in :statuses
              and (meeting.influencer.id = :userId or meeting.manager.id = :userId)
            """)
    boolean existsOperatingMeeting(@Param("userId") Long userId,
                                   @Param("statuses") Collection<FanMeetingStatus> statuses);
}
