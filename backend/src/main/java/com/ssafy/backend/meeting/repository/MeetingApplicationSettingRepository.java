package com.ssafy.backend.meeting.repository;

import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 팬미팅 응모 설정 영속성 처리를 담당한다.
 */
public interface MeetingApplicationSettingRepository extends JpaRepository<MeetingApplicationSetting, Long> {

    /**
     * 응모 시작 시각이 지났지만 아직 공개 상태에 머무른 팬미팅 식별자를 조회한다.
     *
     * <p>응모 기능을 쓰지 않거나 기간이 비어 있는 팬미팅, 이미 응모 종료 시각이 지난 팬미팅은
     * 열어도 응모를 받을 수 없으므로 후보에서 제외한다.
     *
     * @param now 응모 시작 여부를 판단할 서버 시각
     * @return 응모 접수 상태로 전환해야 할 팬미팅 식별자 목록
     */
    @Query("""
            select setting.meetingId
            from MeetingApplicationSetting setting
            where setting.meeting.status
                  = com.ssafy.backend.meeting.domain.FanMeetingStatus.PUBLISHED
              and setting.meeting.deletedAt is null
              and setting.enabled = true
              and setting.applicationOpenAt is not null
              and setting.applicationOpenAt <= :now
              and setting.applicationCloseAt is not null
              and setting.applicationCloseAt > :now
            """)
    List<Long> findApplicationOpenTargetIds(@Param("now") LocalDateTime now);

    /**
     * 응모 마감 시각이 지났는데 아직 접수 중인 팬미팅 식별자를 조회한다.
     *
     * <p>접수 자체는 서비스가 시각으로도 막지만 상태가 남아 있으면 화면에는 "모집 중"으로 계속
     * 보인다. 팬이 눌러 보고 나서야 마감을 알게 되므로 상태도 함께 넘긴다.
     *
     * @param now 마감 여부를 판단할 서버 시각
     * @return 응모 마감 상태로 전환해야 할 팬미팅 식별자 목록
     */
    @Query("""
            select setting.meetingId
            from MeetingApplicationSetting setting
            where setting.meeting.status
                  = com.ssafy.backend.meeting.domain.FanMeetingStatus.APPLICATION_OPEN
              and setting.meeting.deletedAt is null
              and setting.applicationCloseAt is not null
              and setting.applicationCloseAt <= :now
            """)
    List<Long> findApplicationCloseTargetIds(@Param("now") LocalDateTime now);
}
