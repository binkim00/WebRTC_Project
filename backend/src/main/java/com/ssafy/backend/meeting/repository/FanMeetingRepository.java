package com.ssafy.backend.meeting.repository;

import com.ssafy.backend.meeting.domain.FanMeeting;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 팬미팅 영속성 처리를 담당한다.
 */
public interface FanMeetingRepository extends JpaRepository<FanMeeting, Long> {
}
