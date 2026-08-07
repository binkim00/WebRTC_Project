package com.ssafy.backend.meeting.repository;

import com.ssafy.backend.meeting.domain.MeetingOperationSetting;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 팬미팅 운영 설정 영속성 처리를 담당한다.
 */
public interface MeetingOperationSettingRepository extends JpaRepository<MeetingOperationSetting, Long> {
}
