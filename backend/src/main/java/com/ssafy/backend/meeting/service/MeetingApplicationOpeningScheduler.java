package com.ssafy.backend.meeting.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 응모 시작 시각이 지난 공개 팬미팅을 주기적으로 응모 접수 상태로 전환한다.
 *
 * <p>한 건이 실패해도 나머지 건을 계속 처리하고, 다음 주기에 같은 건을 다시 시도한다.
 */
@Component
public class MeetingApplicationOpeningScheduler {

    private static final Logger log =
            LoggerFactory.getLogger(MeetingApplicationOpeningScheduler.class);

    private final MeetingApplicationOpeningService openingService;

    /**
     * 응모 시작 처리 서비스를 주입받는다.
     *
     * @param openingService 응모 접수 상태 전환 서비스
     */
    public MeetingApplicationOpeningScheduler(MeetingApplicationOpeningService openingService) {
        this.openingService = openingService;
    }

    /** 응모 기간에 들어선 공개 팬미팅을 찾아 응모 접수 상태로 바꾼다. */
    @Scheduled(fixedDelayString = "${app.meeting.application-open-check-delay-ms:60000}")
    public void openDueApplications() {
        for (Long meetingId : openingService.findOpenTargetIds()) {
            try {
                if (openingService.openIfDue(meetingId)) {
                    log.info("팬미팅 응모를 시작했습니다. meetingId={}", meetingId);
                }
            } catch (RuntimeException exception) {
                // 한 건의 실패가 남은 건을 막지 않도록 기록만 남기고 계속 진행한다.
                log.warn("팬미팅 응모 시작에 실패했습니다. 다음 주기에 다시 시도합니다. meetingId={}",
                        meetingId, exception);
            }
        }
    }
}
