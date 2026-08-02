package com.ssafy.backend.meeting.service;

import com.ssafy.backend.meeting.domain.FanMeeting;
import com.ssafy.backend.meeting.domain.FanMeetingStatus;
import com.ssafy.backend.meeting.domain.MeetingApplicationSetting;
import com.ssafy.backend.meeting.repository.FanMeetingRepository;
import com.ssafy.backend.meeting.repository.MeetingApplicationSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 응모 시작 시각이 지난 공개 팬미팅을 응모 접수 상태로 전환한다.
 *
 * <p>공개(PUBLISHED)에서 응모 접수(APPLICATION_OPEN)로 넘기는 주체가 없으면 팬은 응모 기간이 되어도
 * 응모할 수 없으므로, 스케줄러가 이 서비스를 통해 기간이 시작된 팬미팅을 자동으로 연다.
 */
@Service
public class MeetingApplicationOpeningService {

    private final FanMeetingRepository fanMeetingRepository;
    private final MeetingApplicationSettingRepository applicationSettingRepository;
    private final Clock clock;

    /**
     * 전환 대상 조회와 상태 변경에 필요한 의존성을 주입받는다.
     *
     * @param fanMeetingRepository 팬미팅 저장소
     * @param applicationSettingRepository 팬미팅 응모 설정 저장소
     * @param clock 서버 기준 시각 제공자
     */
    public MeetingApplicationOpeningService(
            FanMeetingRepository fanMeetingRepository,
            MeetingApplicationSettingRepository applicationSettingRepository,
            Clock clock
    ) {
        this.fanMeetingRepository = fanMeetingRepository;
        this.applicationSettingRepository = applicationSettingRepository;
        this.clock = clock;
    }

    /**
     * 응모 시작 시각이 지났지만 아직 공개 상태에 머무른 팬미팅 식별자를 조회한다.
     *
     * @return 응모 접수 상태로 전환해야 할 팬미팅 식별자 목록
     */
    public List<Long> findOpenTargetIds() {
        return applicationSettingRepository.findApplicationOpenTargetIds(LocalDateTime.now(clock));
    }

    /**
     * 팬미팅을 쓰기 잠금으로 다시 확인하고 실제 응모 기간에 들어간 경우에만 응모를 시작한다.
     *
     * @param meetingId 전환 후보 팬미팅 식별자
     * @return 응모 접수 상태로 전환했으면 true, 조건을 만족하지 않아 건너뛰었으면 false
     */
    @Transactional
    public boolean openIfDue(Long meetingId) {
        FanMeeting meeting = fanMeetingRepository.findByIdForUpdate(meetingId).orElse(null);
        if (meeting == null || meeting.getDeletedAt() != null
                || meeting.getStatus() != FanMeetingStatus.PUBLISHED) {
            return false;
        }

        MeetingApplicationSetting setting = applicationSettingRepository.findById(meetingId)
                .orElse(null);
        if (!isApplicationPeriodStarted(setting, LocalDateTime.now(clock))) {
            return false;
        }

        meeting.openApplications();
        return true;
    }

    /**
     * 응모 설정이 현재 시각 기준으로 응모를 받을 수 있는 기간인지 확인한다.
     *
     * @param setting 팬미팅 응모 설정이며 없으면 null
     * @param now 서버 기준 현재 시각
     * @return 응모 시작 시각이 지나고 종료 시각 전이면 true
     */
    private boolean isApplicationPeriodStarted(MeetingApplicationSetting setting,
                                               LocalDateTime now) {
        return setting != null
                && setting.isEnabled()
                && setting.getApplicationOpenAt() != null
                && setting.getApplicationCloseAt() != null
                && !now.isBefore(setting.getApplicationOpenAt())
                && now.isBefore(setting.getApplicationCloseAt());
    }
}
