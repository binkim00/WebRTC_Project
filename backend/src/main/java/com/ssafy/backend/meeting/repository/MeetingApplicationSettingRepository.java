package com.ssafy.backend.meeting.repository;

import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 팬미팅 응모 설정 영속성 처리를 담당한다.
 */
public interface MeetingApplicationSettingRepository extends JpaRepository<MeetingApplicationSetting, Long> {
}
